using Microsoft.Extensions.DependencyInjection;

namespace InternalKnowledge.Infrastructure;

public static class InfrastructureRegistration
{
    public static IServiceCollection AddKnowledgeInfrastructure(this IServiceCollection services)
    {
        services.AddHttpClient("ldap").ConfigureHttpClient(c => c.Timeout = TimeSpan.FromSeconds(10));
        services.AddScoped<LdapAuthService>();
        services.AddSingleton<DocumentTextExtractor>();   // stateless, safe as singleton
        return services;
    }
}
