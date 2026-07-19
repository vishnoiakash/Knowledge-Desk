using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace InternalKnowledge.Persistence;
public sealed class KnowledgeDbContextFactory:IDesignTimeDbContextFactory<KnowledgeDbContext>
{
    public KnowledgeDbContext CreateDbContext(string[] args){var cs=Environment.GetEnvironmentVariable("ConnectionStrings__KnowledgeDatabase")??"Host=localhost;Port=5432;Database=knowledge_desk;Username=knowledge;Password=knowledge_local";var options=new DbContextOptionsBuilder<KnowledgeDbContext>().UseNpgsql(cs,n=>n.UseVector()).Options;return new(options);}
}
