namespace InternalKnowledge.Domain;

public enum KnowledgeEntryType { Issue, Workflow, Knowledge, Troubleshooting, HowTo, Decision, KnownLimitation }
public enum KnowledgeStatus { Draft, Active, NeedsReview, Archived }
public enum KnowledgeSeverity { Low, Medium, High, Critical }

public sealed class KnowledgeEntry
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public KnowledgeEntryType EntryType { get; set; }
    public string Title { get; set; } = "";
    public string Summary { get; set; } = "";
    public string OriginalInput { get; set; } = "";
    public string? Problem { get; set; }
    public string? RootCause { get; set; }
    public string? Solution { get; set; }
    public string? Prevention { get; set; }
    public string? DetailedContent { get; set; }
    public string? Category { get; set; }
    public KnowledgeSeverity Severity { get; set; } = KnowledgeSeverity.Medium;
    public string? Project { get; set; }
    public string? Module { get; set; }
    public string? AffectedService { get; set; }
    public decimal ConfidenceScore { get; set; }
    public KnowledgeStatus Status { get; set; } = KnowledgeStatus.Active;
    public List<string> Tags { get; set; } = [];
    public List<string> Technologies { get; set; } = [];
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
