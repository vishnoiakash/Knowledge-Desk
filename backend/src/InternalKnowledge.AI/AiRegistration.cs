using InternalKnowledge.Application;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace InternalKnowledge.AI;
public static class AiRegistration
{
    public static IServiceCollection AddKnowledgeAi(this IServiceCollection services,IConfiguration configuration){services.AddOptions<AiOptions>().Bind(configuration.GetSection(AiOptions.SectionName)).Validate(x=>x.EmbeddingDimensions>0,"Embedding dimensions must be positive").ValidateOnStart();services.AddHttpClient<OpenAiService>(c=>{c.BaseAddress=new Uri("https://api.openai.com/v1/");c.Timeout=TimeSpan.FromSeconds(90);});services.AddScoped<ILLMService>(sp=>sp.GetRequiredService<OpenAiService>());services.AddScoped<IEmbeddingService>(sp=>sp.GetRequiredService<OpenAiService>());services.AddScoped<IKnowledgeAnalysisService,KnowledgeAnalysisService>();services.AddScoped<IKnowledgeAnswerService,KnowledgeAnswerService>();return services;}
}
