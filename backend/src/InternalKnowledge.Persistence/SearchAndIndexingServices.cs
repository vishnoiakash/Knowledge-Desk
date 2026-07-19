using System.Text.Json;
using InternalKnowledge.Application;
using InternalKnowledge.AI;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Pgvector;
using Pgvector.EntityFrameworkCore;

namespace InternalKnowledge.Persistence;

public sealed class SemanticSearchService(KnowledgeDbContext db,IEmbeddingService embeddings) : ISemanticSearchService
{
    public async Task<IReadOnlyList<SimilarEntry>> SearchAsync(string query,int limit,string? project,string? module,CancellationToken ct)
    {
        var vector=new Vector((await embeddings.GenerateAsync(query,ct)).ToArray());
        var q=from index in db.KnowledgeSearchIndexes.AsNoTracking() join entry in db.KnowledgeEntries.AsNoTracking() on index.KnowledgeEntryId equals entry.Id where index.Status==IndexStatus.Indexed&&index.Embedding!=null select new{index,entry};
        if(!string.IsNullOrWhiteSpace(project))q=q.Where(x=>x.entry.Project==project);if(!string.IsNullOrWhiteSpace(module))q=q.Where(x=>x.entry.Module==module);
        return await q.OrderBy(x=>x.index.Embedding!.CosineDistance(vector)).Take(Math.Clamp(limit,1,20)).Select(x=>new SimilarEntry(x.entry.Id,x.entry.Title,x.entry.Summary,1-x.index.Embedding!.CosineDistance(vector))).ToListAsync(ct);
    }
}

public sealed class KnowledgeIndexingService(KnowledgeDbContext db,IEmbeddingService embeddings,IOptions<AiOptions> options) : IKnowledgeIndexingService
{
    public async Task IndexAsync(Guid entryId,CancellationToken ct)
    {
        var entry=await db.KnowledgeEntries.SingleOrDefaultAsync(x=>x.Id==entryId,ct)??throw new KeyNotFoundException("Knowledge entry not found.");var content=KnowledgeAnalysisService.BuildSearchable(entry);var vector=new Vector((await embeddings.GenerateAsync(content,ct)).ToArray());var index=await db.KnowledgeSearchIndexes.SingleOrDefaultAsync(x=>x.KnowledgeEntryId==entryId,ct);
        if(index is null){index=new(){KnowledgeEntryId=entryId};db.Add(index);}index.SearchableContent=content;index.Embedding=vector;index.EmbeddingModel=options.Value.Provider.Equals("OpenAI",StringComparison.OrdinalIgnoreCase)?options.Value.EmbeddingModel:"local-hash-embedding";index.EmbeddingVersion="v1";index.Status=IndexStatus.Indexed;index.LastError=null;index.UpdatedAt=DateTimeOffset.UtcNow;await db.SaveChangesAsync(ct);
    }
}

public static class KnowledgeAudit
{
    public static async Task AddRevisionAsync(this KnowledgeDbContext db,InternalKnowledge.Domain.KnowledgeEntry entry,CancellationToken ct){var number=await db.KnowledgeRevisions.CountAsync(x=>x.KnowledgeEntryId==entry.Id,ct)+1;db.KnowledgeRevisions.Add(new(){KnowledgeEntryId=entry.Id,RevisionNumber=number,SnapshotJson=JsonSerializer.Serialize(entry)});await db.SaveChangesAsync(ct);}
}
