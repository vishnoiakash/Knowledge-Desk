using InternalKnowledge.Domain;

namespace InternalKnowledge.Application;

public record AnalyzeKnowledgeRequest(string RawInput, KnowledgeEntryType EntryType, string? Project, string? Module);
// CaptureSession tracks interactive multi-turn capture before final commit
public record CaptureSession(Guid SessionId, KnowledgeEntryType EntryType, string? Project, string? Module, string CurrentInput, IReadOnlyList<string> MissingFields, IReadOnlyList<string> FollowUpQuestions, bool ReadyToCommit);
public record AnalysisResult(KnowledgeEntry Entry, IReadOnlyList<KnowledgeEntry> SuggestedEntries, IReadOnlyList<string> MissingInformation, IReadOnlyList<string> SuggestedQuestions, IReadOnlyList<KnowledgeSearchResult> PotentialDuplicates);
public record KnowledgeSearchResult(Guid KnowledgeEntryId, Guid ChunkId, string ChunkType, string Title, string Summary, string? Problem, string? RootCause, string? Solution, string? Prevention, string? DetailedContent, string? Project, string? Module, string Snippet, double Similarity);
public record ChatTurn(string Role, string Content);
public record AskRequest(string Question, string? Project, string? Module, IReadOnlyList<ChatTurn>? History=null, string? Username=null, Guid? SessionId=null);
public record Citation(Guid KnowledgeEntryId, Guid ChunkId, string Title, string ChunkType, string Snippet, double Similarity);
public record AskResult(string Answer, bool Grounded, double Confidence, IReadOnlyList<Citation> Sources, IReadOnlyList<string> SuggestedFollowUps, Guid? SessionId=null);
public record KnowledgeQuery(string? Query=null, KnowledgeEntryType? EntryType=null, string? Project=null, string? Module=null, KnowledgeSeverity? Severity=null, KnowledgeStatus? Status=null, string? Technology=null, string? Tag=null, string Sort="updatedDesc", int Page=1, int PageSize=20, bool IncludeArchived=false);
public record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount, int TotalPages);
public record DuplicateCheckResult(bool IsLikelyDuplicate, IReadOnlyList<KnowledgeSearchResult> Matches);

// Open Questions feature
public enum QuestionAudience { All, Specific }
public record RaiseQuestionRequest(string Text, QuestionAudience Audience, IReadOnlyList<string>? TargetUsernames=null, string? Project=null);
public record QuestionAnswerRequest(string Answer, Guid? KnowledgeEntryId = null);
public record OpenQuestionDto(Guid Id, string Text, string RaisedBy, QuestionAudience Audience, IReadOnlyList<string> TargetUsernames, string? Project, DateTimeOffset RaisedAt, bool IsResolved, IReadOnlyList<QuestionAnswerDto> Answers);
public record QuestionAnswerDto(Guid Id, string Answer, string AnsweredBy, Guid? KnowledgeEntryId, string? KnowledgeEntryTitle, DateTimeOffset AnsweredAt);

// Chat history
public record ChatHistorySessionDto(Guid SessionId, string FirstQuestion, DateTimeOffset StartedAt, DateTimeOffset LastActivityAt, int TurnCount);

// User management
public record UserDto(string Username, string? DisplayName, string? Email, bool IsActive, DateTimeOffset CreatedAt);

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

// Interactive capture: checks completeness before committing to the database
public interface ICaptureCompletenessService { Task<CaptureSession> EvaluateAsync(Guid sessionId, KnowledgeEntryType entryType, string currentInput, string? project, string? module, CancellationToken cancellationToken); }
