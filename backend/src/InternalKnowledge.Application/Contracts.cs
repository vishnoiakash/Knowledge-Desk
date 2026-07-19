using InternalKnowledge.Domain;

namespace InternalKnowledge.Application;

public record AnalyzeKnowledgeRequest(string RawInput, KnowledgeEntryType EntryType, string? Project, string? Module);
public record AnalysisResult(KnowledgeEntry Entry, IReadOnlyList<string> MissingInformation, IReadOnlyList<string> SuggestedQuestions, IReadOnlyList<SimilarEntry> PotentialDuplicates);
public record SimilarEntry(Guid KnowledgeEntryId, string Title, string Summary, double Similarity);
public record ChatTurn(string Role, string Content);
public record AskRequest(string Question, string? Project, string? Module, IReadOnlyList<ChatTurn>? History=null);
public record AskResult(string Answer, bool Grounded, double Confidence, IReadOnlyList<SimilarEntry> Sources, IReadOnlyList<string> SuggestedFollowUps);

public interface IKnowledgeRepository
{
    Task<IReadOnlyList<KnowledgeEntry>> ListAsync(string? query, int page, int pageSize, CancellationToken cancellationToken);
    Task<KnowledgeEntry?> GetAsync(Guid id, CancellationToken cancellationToken);
    Task SaveAsync(KnowledgeEntry entry, CancellationToken cancellationToken);
}
public interface IKnowledgeAnalysisService { Task<AnalysisResult> AnalyzeAsync(AnalyzeKnowledgeRequest request, CancellationToken cancellationToken); }
public interface IKnowledgeAnswerService { Task<AskResult> AskAsync(AskRequest request, CancellationToken cancellationToken); }
public interface IKnowledgeIndexingService { Task IndexAsync(Guid entryId, CancellationToken cancellationToken); }
public interface IEmbeddingService { Task<ReadOnlyMemory<float>> GenerateAsync(string text, CancellationToken cancellationToken); }
public interface ILLMService { Task<string> CompleteAsync(string promptName, object input, CancellationToken cancellationToken); }
public interface ISemanticSearchService { Task<IReadOnlyList<SimilarEntry>> SearchAsync(string query, int limit, string? project, string? module, CancellationToken cancellationToken); }
