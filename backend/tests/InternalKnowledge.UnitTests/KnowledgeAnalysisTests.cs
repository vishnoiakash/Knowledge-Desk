using InternalKnowledge.AI;
using InternalKnowledge.Application;
using InternalKnowledge.Domain;
using Microsoft.Extensions.Options;

namespace InternalKnowledge.UnitTests;
public sealed class KnowledgeAnalysisTests
{
    [Fact] public async Task Premium_age_note_is_structured_without_inventing_data(){var service=new KnowledgeAnalysisService(new UnusedLlm(),new NoMatches(),Options.Create(new AiOptions()));var result=await service.AnalyzeAsync(new("Premium mismatch happened because age used current date instead of policy start date. We fixed the reference date and added boundary tests.",KnowledgeEntryType.Issue,"Health Fresh","Rating"),default);Assert.Contains("premium mismatch",result.Entry.Title,StringComparison.OrdinalIgnoreCase);Assert.NotNull(result.Entry.RootCause);Assert.NotNull(result.Entry.Solution);Assert.True(result.Entry.ConfidenceScore>=.8m);}
    [Fact] public async Task Incomplete_note_reports_missing_information(){var service=new KnowledgeAnalysisService(new UnusedLlm(),new NoMatches(),Options.Create(new AiOptions()));var result=await service.AnalyzeAsync(new("The integration failed intermittently during the morning deployment window.",KnowledgeEntryType.Issue,null,null),default);Assert.Null(result.Entry.RootCause);Assert.NotEmpty(result.MissingInformation);Assert.NotEmpty(result.SuggestedQuestions);}
    [Fact] public void Searchable_content_contains_solution_and_metadata(){var entry=new KnowledgeEntry{Title="Queue issue",Summary="Consumer stopped",OriginalInput="x",Solution="Register endpoint",Project="Platform",Tags=["MassTransit"]};var text=KnowledgeAnalysisService.BuildSearchable(entry);Assert.Contains("Register endpoint",text);Assert.Contains("MassTransit",text);Assert.Contains("Platform",text);}
    private sealed class NoMatches:ISemanticSearchService{public Task<IReadOnlyList<SimilarEntry>> SearchAsync(string q,int l,string? p,string? m,CancellationToken ct)=>Task.FromResult<IReadOnlyList<SimilarEntry>>([]);}
    private sealed class UnusedLlm:ILLMService{public Task<string> CompleteAsync(string p,object i,CancellationToken ct)=>throw new InvalidOperationException();}
}
