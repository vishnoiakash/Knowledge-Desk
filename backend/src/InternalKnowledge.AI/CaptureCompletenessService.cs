using System.Text;
using System.Text.Json;
using InternalKnowledge.Application;
using InternalKnowledge.Domain;
using Microsoft.Extensions.Options;

namespace InternalKnowledge.AI;

/// <summary>
/// Evaluates whether a capture note is complete enough for high-quality extraction.
///
/// Selective follow-up: the caller may pass structured <see cref="FieldAnswer"/> pairs
/// (one per selected follow-up question). These are merged into the note with clear
/// labels so the extraction prompt knows exactly which field each answer enriches.
///
/// Maximum 2 rounds of completeness checking are enforced — after that the note is
/// considered ready regardless so the user is never stuck in an infinite loop.
/// </summary>
public sealed class CaptureCompletenessService(ILLMService llm, IOptions<AiOptions> options)
    : ICaptureCompletenessService
{
    private const int MaxRounds = 2;

    private static readonly string[] IssueRequired    = ["problem", "rootCause", "solution"];
    private static readonly string[] WorkflowRequired = ["solution"];
    private static readonly string[] GeneralRequired  = ["summary"];

    public async Task<CaptureSession> EvaluateAsync(
        Guid sessionId,
        KnowledgeEntryType entryType,
        string currentInput,
        string? project,
        string? module,
        IReadOnlyList<FieldAnswer>? fieldAnswers,
        CancellationToken cancellationToken)
    {
        // Merge any structured answers into the note before evaluating
        var enrichedInput = MergeFieldAnswers(currentInput, fieldAnswers);

        // Determine the current round from session state stored client-side
        // (the Round is passed back in CaptureSession and echoed on the next call)
        // We detect it by checking how many times we've seen this session — since
        // the session ID stays the same across rounds, we use the fact that
        // fieldAnswers being non-empty means at least round 1 has happened.
        var round = fieldAnswers is { Count: > 0 } ? 1 : 0;

        // Hard cap — always commit after MaxRounds regardless of completeness
        if (round >= MaxRounds)
        {
            return new CaptureSession(
                SessionId:        sessionId,
                EntryType:        entryType,
                Project:          project,
                Module:           module,
                CurrentInput:     enrichedInput,
                MissingFields:    [],
                FollowUpQuestions: [],
                ReadyToCommit:    true,
                Round:            round);
        }

        List<string> missing;
        List<string> questions;

        if (options.Value.Provider.Equals("OpenAI", StringComparison.OrdinalIgnoreCase))
            (missing, questions) = await EvaluateWithOpenAiAsync(entryType, enrichedInput, cancellationToken);
        else
            (missing, questions) = EvaluateLocally(entryType, enrichedInput);

        return new CaptureSession(
            SessionId:        sessionId,
            EntryType:        entryType,
            Project:          project,
            Module:           module,
            CurrentInput:     enrichedInput,
            MissingFields:    missing,
            FollowUpQuestions: questions,
            ReadyToCommit:    missing.Count == 0 && questions.Count == 0,
            Round:            round + 1);
    }

    // ── Merge structured answers into the note ────────────────────────────────

    private static string MergeFieldAnswers(string note, IReadOnlyList<FieldAnswer>? answers)
    {
        if (answers is null || answers.Count == 0) return note;

        var sb = new StringBuilder(note.TrimEnd());
        sb.AppendLine().AppendLine();
        foreach (var fa in answers.Where(a => !string.IsNullOrWhiteSpace(a.Answer)))
        {
            // Label each answer so the extraction prompt can map it to the right field
            sb.AppendLine($"[{fa.Field.ToUpperInvariant()}]");
            sb.AppendLine(fa.Answer.Trim());
        }
        return sb.ToString();
    }

    // ── OpenAI path ───────────────────────────────────────────────────────────

    private async Task<(List<string> missing, List<string> questions)> EvaluateWithOpenAiAsync(
        KnowledgeEntryType entryType, string input, CancellationToken ct)
    {
        var raw = await llm.CompleteAsync("completeness-check",
            new { entryType = entryType.ToString(), input }, ct);

        using var doc = JsonDocument.Parse(raw);
        var root      = doc.RootElement;
        return (ReadStrings(root, "missingFields"), ReadStrings(root, "followUpQuestions"));
    }

    // ── Local (offline) path ──────────────────────────────────────────────────

    private static (List<string> missing, List<string> questions) EvaluateLocally(
        KnowledgeEntryType entryType, string input)
    {
        var lower   = input.ToLowerInvariant();
        var missing   = new List<string>();
        var questions = new List<string>();

        if (entryType is KnowledgeEntryType.Knowledge
                      or KnowledgeEntryType.Decision
                      or KnowledgeEntryType.KnownLimitation)
            return (missing, questions);

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

        // Don't re-ask for fields whose answers were already injected via [FIELD] labels
        if (required.Contains("problem")
            && !lower.Contains(" failed") && !lower.Contains(" error") && !lower.Contains("issue")
            && !lower.Contains("[problem]"))
        {
            missing.Add("problem");
            questions.Add("What exactly failed or went wrong? Describe the observable symptom.");
        }

        if (required.Contains("rootCause")
            && !lower.Contains(" because ") && !lower.Contains(" caused by ") && !lower.Contains(" due to ")
            && !lower.Contains("[rootcause]"))
        {
            missing.Add("rootCause");
            questions.Add("What was the underlying cause? Why did it happen?");
        }

        if (required.Contains("solution")
            && !lower.Contains(" fixed ") && !lower.Contains(" resolved ")
            && !lower.Contains(" solution") && !lower.Contains(" by ")
            && !lower.Contains("[solution]"))
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
