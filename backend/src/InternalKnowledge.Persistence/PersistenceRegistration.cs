using InternalKnowledge.Application;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace InternalKnowledge.Persistence;

public static class PersistenceRegistration
{
    public static IServiceCollection AddKnowledgePersistence(
        this IServiceCollection services, IConfiguration configuration)
    {
        var cs = configuration.GetConnectionString("KnowledgeDatabase")
                 ?? throw new InvalidOperationException(
                     "ConnectionStrings:KnowledgeDatabase is required.");

        services.AddDbContext<KnowledgeDbContext>(
            o => o.UseNpgsql(cs, n => n.UseVector()));

        services.AddScoped<IKnowledgeRepository,     KnowledgeRepository>();
        services.AddScoped<ISemanticSearchService,   SemanticSearchService>();
        services.AddScoped<IKnowledgeIndexingService, KnowledgeIndexingService>();
        services.AddScoped<IKnowledgeIndexingQueue,  KnowledgeIndexingQueue>();
        // IndexingWorker (BackgroundService) is registered in InternalKnowledge.Indexing
        return services;
    }
}
