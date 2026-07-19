using InternalKnowledge.Domain;

namespace InternalKnowledge.Application;

public record AnalyzeKnowledgeRequest(string RawInput, KnowledgeEntryType EntryType, string? Project, string? Module);
public record AnalysisResult(KnowledgeEntry Entry, IReadOnlyList<KnowledgeEntry> SuggestedEntries, IReadOnlyList<string> MissingInformation, IReadOnlyList<string> SuggestedQuestions, IReadOnlyList<KnowledgeSearchResult> PotentialDuplicates);
public record KnowledgeSearchResult(Guid KnowledgeEntryId, Guid ChunkId, string ChunkType, string Title, string Summary, string? Problem, string? RootCause, string? Solution, string? Prevention, string? DetailedContent, string? Project, string? Module, string Snippet, double Similarity);
public record ChatTurn(string Role, string Content);
public record AskRequest(string Question, string? Project, string? Module, IReadOnlyList<ChatTurn>? History=null);
public record Citation(Guid KnowledgeEntryId, Guid ChunkId, string Title, string ChunkType, string Snippet, double Similarity);
public record AskResult(string Answer, bool Grounded, double Confidence, IReadOnlyList<Citation> Sources, IReadOnlyList<string> SuggestedFollowUps);
public record KnowledgeQuery(string? Query=null, KnowledgeEntryType? EntryType=null, string? Project=null, string? Module=null, KnowledgeSeverity? Severity=null, KnowledgeStatus? Status=null, string? Technology=null, string? Tag=null, string Sort="updatedDesc", int Page=1, int PageSize=20, bool IncludeArchived=false);
public record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount, int TotalPages);
public record DuplicateCheckResult(bool IsLikelyDuplicate, IReadOnlyList<KnowledgeSearchResult> Matches);

public interface IKnowledgeRepository
{
    Task<PagedResult<KnowledgeEntry>> ListAsync(KnowledgeQuery query, CancellationToken cancellationToken);
    Task<KnowledgeEntry?> GetAsync(Guid id, CancellationToken cancellationToken);
    Task SaveAsync(KnowledgeEntry entry, CancellationToken cancellationToken);
}
public interface IKnowledgeAnalysisService { Task<AnalysisResult> AnalyzeAsync(AnalyzeKnowledgeRequest request, CancellationToken cancellationToken); }
public interface IKnowledgeAnswerService { Task<AskResult> AskAsync(AskRequest request, CancellationToken cancellationToken); }
public interface IKnowledgeIndexingService { Task IndexAsync(Guid entryId, CancellationToken cancellationToken); }
public interface IKnowledgeIndexingQueue { Task EnqueueAsync(Guid entryId, CancellationToken cancellationToken); }
public interface IEmbeddingService { Task<ReadOnlyMemory<float>> GenerateAsync(string text, CancellationToken cancellationToken); }
public interface ILLMService { Task<string> CompleteAsync(string promptName, object input, CancellationToken cancellationToken); }
public interface ISemanticSearchService { Task<IReadOnlyList<KnowledgeSearchResult>> SearchAsync(string query, int limit, string? project, string? module, CancellationToken cancellationToken); }
