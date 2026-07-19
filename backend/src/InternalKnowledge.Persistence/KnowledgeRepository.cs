using InternalKnowledge.Application;
using InternalKnowledge.Domain;
using Microsoft.EntityFrameworkCore;

namespace InternalKnowledge.Persistence;

public sealed class KnowledgeRepository(KnowledgeDbContext db) : IKnowledgeRepository
{
    public async Task<IReadOnlyList<KnowledgeEntry>> ListAsync(string? query,int page,int pageSize,CancellationToken ct)
    { var q=db.KnowledgeEntries.AsNoTracking().Where(x=>x.Status!=KnowledgeStatus.Archived); if(!string.IsNullOrWhiteSpace(query)) q=q.Where(x=>EF.Functions.ILike(x.Title,$"%{query}%")||EF.Functions.ILike(x.Summary,$"%{query}%")); return await q.OrderByDescending(x=>x.UpdatedAt).Skip((page-1)*pageSize).Take(pageSize).ToListAsync(ct); }
    public Task<KnowledgeEntry?> GetAsync(Guid id,CancellationToken ct)=>db.KnowledgeEntries.AsNoTracking().SingleOrDefaultAsync(x=>x.Id==id,ct);
    public async Task SaveAsync(KnowledgeEntry entry,CancellationToken ct) { var existing=await db.KnowledgeEntries.SingleOrDefaultAsync(x=>x.Id==entry.Id,ct); if(existing is null) db.Add(entry); else db.Entry(existing).CurrentValues.SetValues(entry); await db.SaveChangesAsync(ct); }
}
