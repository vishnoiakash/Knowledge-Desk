using System.Collections.Concurrent;
using System.Text.Json;
using InternalKnowledge.Application;
using InternalKnowledge.AI;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Pgvector;
using Pgvector.EntityFrameworkCore;

namespace InternalKnowledge.Persistence;

public sealed class SemanticSearchService(KnowledgeDbContext db,IEmbeddingService embeddings) : ISemanticSearchService
{
    public async Task<IReadOnlyList<KnowledgeSearchResult>> SearchAsync(string query,int limit,string? project,string? module,CancellationToken ct)
    {
        var vector=new Vector((await embeddings.GenerateAsync(query,ct)).ToArray());
        var q=from chunk in db.KnowledgeSearchChunks.AsNoTracking() join entry in db.KnowledgeEntries.AsNoTracking() on chunk.KnowledgeEntryId equals entry.Id where chunk.Status==IndexStatus.Indexed&&chunk.Embedding!=null&&entry.Status!=Domain.KnowledgeStatus.Archived select new{chunk,entry};
        if(!string.IsNullOrWhiteSpace(project))q=q.Where(x=>x.entry.Project==project);if(!string.IsNullOrWhiteSpace(module))q=q.Where(x=>x.entry.Module==module);
        return await q.OrderBy(x=>x.chunk.Embedding!.CosineDistance(vector)).Take(Math.Clamp(limit,1,20)).Select(x=>new KnowledgeSearchResult(x.entry.Id,x.chunk.Id,x.chunk.ChunkType,x.entry.Title,x.entry.Summary,x.entry.Problem,x.entry.RootCause,x.entry.Solution,x.entry.Prevention,x.entry.DetailedContent,x.entry.Project,x.entry.Module,x.chunk.Content,1-x.chunk.Embedding!.CosineDistance(vector))).ToListAsync(ct);
    }
}

public sealed class KnowledgeIndexingService(KnowledgeDbContext db,IEmbeddingService embeddings,IOptions<AiOptions> options) : IKnowledgeIndexingService
{
    public async Task IndexAsync(Guid entryId,CancellationToken ct)
    {
        var entry=await db.KnowledgeEntries.AsNoTracking().SingleOrDefaultAsync(x=>x.Id==entryId,ct)??throw new KeyNotFoundException("Knowledge entry not found.");
        var old=await db.KnowledgeSearchChunks.Where(x=>x.KnowledgeEntryId==entryId).ToListAsync(ct);db.RemoveRange(old);
        var chunks=KnowledgeChunker.Create(entry);var order=0;
        foreach(var item in chunks){var vector=new Vector((await embeddings.GenerateAsync(item.Content,ct)).ToArray());db.KnowledgeSearchChunks.Add(new(){KnowledgeEntryId=entryId,ChunkOrder=order++,ChunkType=item.Type,Content=item.Content,Embedding=vector,EmbeddingModel=options.Value.Provider.Equals("OpenAI",StringComparison.OrdinalIgnoreCase)?options.Value.EmbeddingModel:"local-hash-embedding",EmbeddingVersion="v2",Status=IndexStatus.Indexed});}
        await db.SaveChangesAsync(ct);KnowledgeMetrics.IndexedEntries.AddOrUpdate(entryId,1,(_,value)=>value+1);
    }
}

public static class KnowledgeChunker
{
    public record Chunk(string Type,string Content);
    public static IReadOnlyList<Chunk> Create(Domain.KnowledgeEntry e)
    {
        var result=new List<Chunk>();Add("Overview",$"{e.Title}\n{e.Summary}");Add("Problem",e.Problem);Add("RootCause",e.RootCause);Add("Solution",e.Solution);Add("Prevention",e.Prevention);
        if(!string.IsNullOrWhiteSpace(e.DetailedContent))foreach(var paragraph in Split(e.DetailedContent,1200))Add("Details",paragraph);
        Add("Metadata",string.Join(" ",new[]{e.Project,e.Module,e.AffectedService,e.Category,string.Join(' ',e.Tags),string.Join(' ',e.Technologies)}.Where(x=>!string.IsNullOrWhiteSpace(x))));return result;
        void Add(string type,string? value){if(!string.IsNullOrWhiteSpace(value))foreach(var part in Split(value,1200))result.Add(new(type,part.Trim()));}
    }
    private static IEnumerable<string> Split(string text,int max){var paragraphs=text.Split(["\r\n\r\n","\n\n"],StringSplitOptions.RemoveEmptyEntries);foreach(var p in paragraphs){if(p.Length<=max){yield return p;continue;}for(var i=0;i<p.Length;i+=max)yield return p.Substring(i,Math.Min(max,p.Length-i));}}
}

public sealed class KnowledgeIndexingQueue(KnowledgeDbContext db) : IKnowledgeIndexingQueue
{
    public async Task EnqueueAsync(Guid entryId,CancellationToken ct){var now=DateTimeOffset.UtcNow;var inserted=await db.Database.ExecuteSqlInterpolatedAsync($"""INSERT INTO "IndexingJobs" ("Id","KnowledgeEntryId","Status","Attempts","MaxAttempts","NextAttemptAt","CreatedAt","UpdatedAt") VALUES ({Guid.NewGuid()},{entryId},{nameof(IndexingJobStatus.Pending)},0,5,{now},{now},{now}) ON CONFLICT ("KnowledgeEntryId") WHERE "Status" IN ('Pending','Processing') DO NOTHING""",ct);if(inserted>0)KnowledgeMetrics.JobQueued();}
}

public sealed class IndexingWorker(IServiceScopeFactory scopes,ILogger<IndexingWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while(!stoppingToken.IsCancellationRequested)
        {
            try{await ProcessOne(stoppingToken);}catch(OperationCanceledException)when(stoppingToken.IsCancellationRequested){break;}catch(Exception ex){logger.LogError(ex,"Indexing worker iteration failed");}
            await Task.Delay(TimeSpan.FromSeconds(2),stoppingToken);
        }
    }
    private async Task ProcessOne(CancellationToken ct)
    {
        await using var scope=scopes.CreateAsyncScope();var db=scope.ServiceProvider.GetRequiredService<KnowledgeDbContext>();var now=DateTimeOffset.UtcNow;await db.IndexingJobs.Where(x=>x.Status==IndexingJobStatus.Processing&&x.LeaseExpiresAt<now).ExecuteUpdateAsync(s=>s.SetProperty(x=>x.Status,IndexingJobStatus.Pending).SetProperty(x=>x.LeaseExpiresAt,(DateTimeOffset?)null).SetProperty(x=>x.NextAttemptAt,now),ct);var candidate=await db.IndexingJobs.AsNoTracking().Where(x=>x.Status==IndexingJobStatus.Pending&&x.NextAttemptAt<=now).OrderBy(x=>x.CreatedAt).Select(x=>x.Id).FirstOrDefaultAsync(ct);if(candidate==Guid.Empty)return;var claimed=await db.IndexingJobs.Where(x=>x.Id==candidate&&x.Status==IndexingJobStatus.Pending).ExecuteUpdateAsync(s=>s.SetProperty(x=>x.Status,IndexingJobStatus.Processing).SetProperty(x=>x.Attempts,x=>x.Attempts+1).SetProperty(x=>x.LeaseExpiresAt,now.AddMinutes(5)).SetProperty(x=>x.UpdatedAt,now),ct);if(claimed==0)return;var job=await db.IndexingJobs.SingleAsync(x=>x.Id==candidate,ct);
        try{await scope.ServiceProvider.GetRequiredService<IKnowledgeIndexingService>().IndexAsync(job.KnowledgeEntryId,ct);job.Status=IndexingJobStatus.Completed;job.LastError=null;job.LeaseExpiresAt=null;KnowledgeMetrics.JobCompleted();}
        catch(Exception ex){job.LastError=ex.Message[..Math.Min(ex.Message.Length,2000)];job.Status=job.Attempts>=job.MaxAttempts?IndexingJobStatus.Failed:IndexingJobStatus.Pending;job.NextAttemptAt=DateTimeOffset.UtcNow.Add(IndexingRetry.Delay(job.Attempts));job.LeaseExpiresAt=null;if(job.Status==IndexingJobStatus.Failed)KnowledgeMetrics.JobFailed();logger.LogWarning(ex,"Indexing job {JobId} attempt {Attempt} failed",job.Id,job.Attempts);}
        job.UpdatedAt=DateTimeOffset.UtcNow;await db.SaveChangesAsync(ct);
    }
}

public static class KnowledgeMetrics { private static long jobsQueued,jobsCompleted,jobsFailed;public static ConcurrentDictionary<Guid,long> IndexedEntries {get;}=[];public static void JobQueued()=>Interlocked.Increment(ref jobsQueued);public static void JobCompleted()=>Interlocked.Increment(ref jobsCompleted);public static void JobFailed()=>Interlocked.Increment(ref jobsFailed);public static object Snapshot()=>new{jobsQueued=Interlocked.Read(ref jobsQueued),jobsCompleted=Interlocked.Read(ref jobsCompleted),jobsFailed=Interlocked.Read(ref jobsFailed),indexedEntries=IndexedEntries.Count}; }
public static class IndexingRetry { public static TimeSpan Delay(int attempt)=>TimeSpan.FromSeconds(Math.Pow(2,Math.Clamp(attempt,1,10))*5); }

public static class KnowledgeAudit
{
    public static async Task AddRevisionAsync(this KnowledgeDbContext db,Domain.KnowledgeEntry entry,CancellationToken ct){var number=await db.KnowledgeRevisions.CountAsync(x=>x.KnowledgeEntryId==entry.Id,ct)+1;db.KnowledgeRevisions.Add(new(){KnowledgeEntryId=entry.Id,RevisionNumber=number,SnapshotJson=JsonSerializer.Serialize(entry)});await db.SaveChangesAsync(ct);}
}
