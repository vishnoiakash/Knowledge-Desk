using InternalKnowledge.Application;
using InternalKnowledge.Domain;
using Microsoft.EntityFrameworkCore;

namespace InternalKnowledge.Persistence;

public sealed class KnowledgeRepository(KnowledgeDbContext db) : IKnowledgeRepository
{
    public async Task<PagedResult<KnowledgeEntry>> ListAsync(KnowledgeQuery request,CancellationToken ct)
    {
        var page=Math.Max(request.Page,1);var pageSize=Math.Clamp(request.PageSize,1,100);
        var q=db.KnowledgeEntries.AsNoTracking().AsQueryable();
        if(!request.IncludeArchived)q=q.Where(x=>x.Status!=KnowledgeStatus.Archived);
        if(!string.IsNullOrWhiteSpace(request.Query)){var exact=request.Query.Trim();var term=$"%{exact}%";q=q.Where(x=>EF.Functions.ILike(x.Title,term)||EF.Functions.ILike(x.Summary,term)||(x.Problem!=null&&EF.Functions.ILike(x.Problem,term))||(x.RootCause!=null&&EF.Functions.ILike(x.RootCause,term))||(x.Solution!=null&&EF.Functions.ILike(x.Solution,term))||(x.Prevention!=null&&EF.Functions.ILike(x.Prevention,term))||(x.DetailedContent!=null&&EF.Functions.ILike(x.DetailedContent,term))||x.Tags.Contains(exact)||x.Technologies.Contains(exact));}
        if(request.EntryType is not null)q=q.Where(x=>x.EntryType==request.EntryType);if(!string.IsNullOrWhiteSpace(request.Project))q=q.Where(x=>x.Project==request.Project);if(!string.IsNullOrWhiteSpace(request.Module))q=q.Where(x=>x.Module==request.Module);if(request.Severity is not null)q=q.Where(x=>x.Severity==request.Severity);if(request.Status is not null)q=q.Where(x=>x.Status==request.Status);if(!string.IsNullOrWhiteSpace(request.Technology))q=q.Where(x=>x.Technologies.Contains(request.Technology));if(!string.IsNullOrWhiteSpace(request.Tag))q=q.Where(x=>x.Tags.Contains(request.Tag));
        q=request.Sort switch{"titleAsc"=>q.OrderBy(x=>x.Title),"createdDesc"=>q.OrderByDescending(x=>x.CreatedAt),"updatedAsc"=>q.OrderBy(x=>x.UpdatedAt),_=>q.OrderByDescending(x=>x.UpdatedAt)};
        var total=await q.CountAsync(ct);var items=await q.Skip((page-1)*pageSize).Take(pageSize).ToListAsync(ct);return new(items,page,pageSize,total,(int)Math.Ceiling(total/(double)pageSize));
    }
    public Task<KnowledgeEntry?> GetAsync(Guid id,CancellationToken ct)=>db.KnowledgeEntries.AsNoTracking().SingleOrDefaultAsync(x=>x.Id==id,ct);
    public async Task SaveAsync(KnowledgeEntry entry,CancellationToken ct){var existing=await db.KnowledgeEntries.SingleOrDefaultAsync(x=>x.Id==entry.Id,ct);if(existing is null)db.Add(entry);else db.Entry(existing).CurrentValues.SetValues(entry);await db.SaveChangesAsync(ct);}
}
