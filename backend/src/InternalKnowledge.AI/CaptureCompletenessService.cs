using System.Text.Json;
using InternalKnowledge.Application;
using InternalKnowledge.Domain;
using Microsoft.Extensions.Options;

namespace InternalKnowledge.AI;

/// <summary>
/// Evaluates whether a raw capture note has enough information for a high-quality
/// knowledge entry.  If fields are missing it returns follow-up questions; once the
/// note is considered complete it signals ReadyToCommit=true so the caller proceeds
/// to AnalyzeAsync.
/// </summary>
public sealed class CaptureCompletenessService(ILLMService llm, IOptions<AiOptions> options)
    : ICaptureCompletenessService
{
    // Minimum fields required per entry type before we consider the note complete.
    private static readonly string[] IssueRequired      = ["problem", "rootCause", "solution"];
    private static readonly string[] WorkflowRequired   = ["solution"];
    private static readonly string[] GeneralRequired    = ["summary"];

    public async Task<CaptureSession> EvaluateAsync(
        Guid sessionId,
        KnowledgeEntryType entryType,
        string currentInput,
        string? project,
        string? module,
        CancellationToken cancellationToken)
    {
        List<string> missing;
        List<string> questions;

        if (options.Value.Provider.Equals("OpenAI", StringComparison.OrdinalIgnoreCase))
        {
            (missing, questions) = await EvaluateWithOpenAiAsync(entryType, currentInput, cancellationToken);
        }
        else
        {
            (missing, questions) = EvaluateLocally(entryType, currentInput);
        }

        return new CaptureSession(
            SessionId: sessionId,
            EntryType: entryType,
            Project: project,
            Module: module,
            CurrentInput: currentInput,
            MissingFields: missing,
            FollowUpQuestions: questions,
            ReadyToCommit: missing.Count == 0 && questions.Count == 0);
    }

    private async Task<(List<string> missing, List<string> questions)> EvaluateWithOpenAiAsync(
        KnowledgeEntryType entryType, string input, CancellationToken ct)
    {
        var raw = await llm.CompleteAsync("completeness-check",
            new { entryType = entryType.ToString(), input }, ct);

        using var doc = JsonDocument.Parse(raw);
        var root = doc.RootElement;
        var missing   = ReadStrings(root, "missingFields");
        var questions = ReadStrings(root, "followUpQuestions");
        return (missing, questions);
    }

    private static (List<string> missing, List<string> questions) EvaluateLocally(
        KnowledgeEntryType entryType, string input)
    {
        var lower = input.ToLowerInvariant();
        var missing   = new List<string>();
        var questions = new List<string>();

        // Reference/documentation types are always considered complete locally —
        // they don't follow the problem/rootCause/solution structure.
        if (entryType is KnowledgeEntryType.Knowledge
                      or KnowledgeEntryType.Decision
                      or KnowledgeEntryType.KnownLimitation)
            return (missing, questions);

        // API documentation heuristic: looks like reference material, not a bug report
        var looksLikeDocs = lower.Contains("endpoint") || lower.Contains("request body")
                         || lower.Contains("response") || lower.Contains("authentication")
                         || lower.Contains("parameter") || lower.Contains("http ")
                         || lower.Contains("get /") || lower.Contains("post /")
                         || lower.Contains("put /") || lower.Contains("delete /");
        if (looksLikeDocs) return (missing, questions);

        var required = entryType is KnowledgeEntryType.Issue or KnowledgeEntryType.Troubleshooting
            ? IssueRequired
            : entryType is KnowledgeEntryType.Workflow or KnowledgeEntryType.HowTo
                ? WorkflowRequired
                : GeneralRequired;

        if (required.Contains("problem") &&
            !lower.Contains(" failed") && !lower.Contains(" error") && !lower.Contains("issue"))
        {
            missing.Add("problem");
            questions.Add("What exactly failed or went wrong? Describe the observable symptom.");
        }

        if (required.Contains("rootCause") &&
            !lower.Contains(" because ") && !lower.Contains(" caused by ") && !lower.Contains(" due to "))
        {
            missing.Add("rootCause");
            questions.Add("What was the underlying cause? Why did it happen?");
        }

        if (required.Contains("solution") &&
            !lower.Contains(" fixed ") && !lower.Contains(" resolved ") &&
            !lower.Contains(" solution") && !lower.Contains(" by "))
        {
            missing.Add("solution");
            questions.Add("What was the fix or corrective action taken?");
        }

        return (missing, questions);
    }

    private static List<string> ReadStrings(JsonElement j, string name) =>
        j.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Array
            ? v.EnumerateArray().Select(x => x.GetString()).Where(x => x is not null).Cast<string>().ToList()
            : [];
}
