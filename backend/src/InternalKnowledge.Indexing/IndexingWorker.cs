using InternalKnowledge.Application;
using InternalKnowledge.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace InternalKnowledge.Indexing;

/// <summary>
/// Background service that polls the IndexingJobs queue, claims one job at a time
/// with a 5-minute lease, invokes IKnowledgeIndexingService, and retries on failure
/// with exponential back-off up to MaxAttempts.
///
/// Moved from InternalKnowledge.Persistence to respect architecture boundaries:
/// the Persistence project owns data access; this project owns the hosted worker.
/// </summary>
public sealed class IndexingWorker(IServiceScopeFactory scopes, ILogger<IndexingWorker> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try   { await ProcessOneAsync(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) { logger.LogError(ex, "Indexing worker iteration failed."); }
            await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
        }
    }

    private async Task ProcessOneAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db  = scope.ServiceProvider.GetRequiredService<KnowledgeDbContext>();
        var now = DateTimeOffset.UtcNow;

        // Recover stale leases (process crashed / restarted mid-job)
        await db.IndexingJobs
            .Where(x => x.Status == IndexingJobStatus.Processing && x.LeaseExpiresAt < now)
            .ExecuteUpdateAsync(s => s
                .SetProperty(x => x.Status,        IndexingJobStatus.Pending)
                .SetProperty(x => x.LeaseExpiresAt, (DateTimeOffset?)null)
                .SetProperty(x => x.NextAttemptAt,  now), ct);

        var candidate = await db.IndexingJobs.AsNoTracking()
            .Where(x => x.Status == IndexingJobStatus.Pending && x.NextAttemptAt <= now)
            .OrderBy(x => x.CreatedAt)
            .Select(x => x.Id)
            .FirstOrDefaultAsync(ct);

        if (candidate == Guid.Empty) return;

        // Optimistic claim — handles multiple worker instances
        var claimed = await db.IndexingJobs
            .Where(x => x.Id == candidate && x.Status == IndexingJobStatus.Pending)
            .ExecuteUpdateAsync(s => s
                .SetProperty(x => x.Status,        IndexingJobStatus.Processing)
                .SetProperty(x => x.Attempts,       x => x.Attempts + 1)
                .SetProperty(x => x.LeaseExpiresAt, now.AddMinutes(5))
                .SetProperty(x => x.UpdatedAt,      now), ct);

        if (claimed == 0) return;

        var job = await db.IndexingJobs.SingleAsync(x => x.Id == candidate, ct);

        try
        {
            await scope.ServiceProvider
                .GetRequiredService<IKnowledgeIndexingService>()
                .IndexAsync(job.KnowledgeEntryId, ct);

            job.Status        = IndexingJobStatus.Completed;
            job.LastError     = null;
            job.LeaseExpiresAt = null;
            KnowledgeMetrics.JobCompleted();
        }
        catch (Exception ex)
        {
            job.LastError      = ex.Message[..Math.Min(ex.Message.Length, 2000)];
            job.LeaseExpiresAt = null;
            job.Status         = job.Attempts >= job.MaxAttempts
                ? IndexingJobStatus.Failed
                : IndexingJobStatus.Pending;
            job.NextAttemptAt  = DateTimeOffset.UtcNow.Add(IndexingRetry.Delay(job.Attempts));

            if (job.Status == IndexingJobStatus.Failed)
                KnowledgeMetrics.JobFailed();

            logger.LogWarning(ex, "Indexing job {JobId} attempt {Attempt} failed.",
                job.Id, job.Attempts);
        }

        job.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
    }
}
