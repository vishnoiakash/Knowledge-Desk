using Microsoft.Extensions.DependencyInjection;

namespace InternalKnowledge.Indexing;

public static class IndexingRegistration
{
    /// <summary>
    /// Registers the background indexing worker.
    /// Call this from the API's Program.cs after AddKnowledgePersistence.
    /// </summary>
    public static IServiceCollection AddKnowledgeIndexing(this IServiceCollection services)
    {
        services.AddHostedService<IndexingWorker>();
        return services;
    }
}
