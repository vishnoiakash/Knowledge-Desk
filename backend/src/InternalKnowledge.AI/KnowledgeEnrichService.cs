using System.Text.Json;
using InternalKnowledge.Application;
using InternalKnowledge.Domain;
using Microsoft.Extensions.Options;

namespace InternalKnowledge.AI;

/// <summary>
/// Merges new information from a team member into an existing knowledge entry.
/// Uses a dedicated merge prompt that preserves existing content while incorporating
/// the additional note into the most appropriate fields.
///
/// When OpenAI is not configured, falls back to appending the new note to
/// detailedContent so the information is never lost.
/// </summary>
public sealed class KnowledgeEnrichService(ILLMService llm, IOptions<AiOptions> options)
    : IKnowledgeEnrichService
{
    // Text fields that can be enriched
    private static readonly string[] EnrichableFields =
        ["title","summary","problem","rootCause","solution","prevention","detailedContent","category","affectedService"];

    public async Task<EnrichResult> EnrichAsync(
        KnowledgeEntry existing,
        string additionalNote,
        CancellationToken ct)
    {
        if (!options.Value.Provider.Equals("OpenAI", StringComparison.OrdinalIgnoreCase))
            return LocalEnrich(existing, additionalNote);

        var input = new
        {
            existingEntry = new
            {
                existing.Title,
                existing.Summary,
                existing.Problem,
                existing.RootCause,
                existing.Solution,
                existing.Prevention,
                existing.DetailedContent,
                existing.Category,
                existing.AffectedService,
                existing.Tags,
                existing.Technologies,
                existing.EntryType
            },
            additionalNote
        };

        var raw = await llm.CompleteAsync("knowledge-enrich", input, ct);
        using var doc  = JsonDocument.Parse(raw);
        var root       = doc.RootElement;
        var changeSummary = root.TryGetProperty("summary", out var s) ? s.GetString() ?? "" : "";

        if (!root.TryGetProperty("entry", out var entryEl))
            return LocalEnrich(existing, additionalNote);

        // Build proposed entry by overlaying non-null AI fields onto existing
        var proposed = CloneEntry(existing);

        var title          = ReadField(entryEl, "title");
        var summary        = ReadField(entryEl, "summary");
        var problem        = ReadField(entryEl, "problem");
        var rootCause      = ReadField(entryEl, "rootCause");
        var solution       = ReadField(entryEl, "solution");
        var prevention     = ReadField(entryEl, "prevention");
        var detailedContent= ReadField(entryEl, "detailedContent");
        var category       = ReadField(entryEl, "category");
        var affectedService= ReadField(entryEl, "affectedService");

        if (title           is not null) proposed.Title           = title;
        if (summary         is not null) proposed.Summary         = summary;
        if (problem         is not null) proposed.Problem         = problem;
        if (rootCause       is not null) proposed.RootCause       = rootCause;
        if (solution        is not null) proposed.Solution        = solution;
        if (prevention      is not null) proposed.Prevention      = prevention;
        if (detailedContent is not null) proposed.DetailedContent = detailedContent;
        if (category        is not null) proposed.Category        = category;
        if (affectedService is not null) proposed.AffectedService = affectedService;

        if (entryEl.TryGetProperty("tags", out var tagsEl) && tagsEl.ValueKind == JsonValueKind.Array)
        {
            var newTags = tagsEl.EnumerateArray().Select(x => x.GetString()).Where(x => x is not null).Cast<string>().ToList();
            if (newTags.Count > 0) proposed.Tags = [..existing.Tags.Union(newTags)];
        }
        if (entryEl.TryGetProperty("technologies", out var techEl) && techEl.ValueKind == JsonValueKind.Array)
        {
            var newTech = techEl.EnumerateArray().Select(x => x.GetString()).Where(x => x is not null).Cast<string>().ToList();
            if (newTech.Count > 0) proposed.Technologies = [..existing.Technologies.Union(newTech)];
        }

        var changes = BuildChanges(existing, proposed);
        return new EnrichResult(proposed, changes, changeSummary);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static EnrichResult LocalEnrich(KnowledgeEntry existing, string additionalNote)
    {
        // Offline fallback: append to detailedContent with a timestamp label
        var proposed   = CloneEntry(existing);
        var separator  = string.IsNullOrWhiteSpace(proposed.DetailedContent) ? "" : "\n\n";
        proposed.DetailedContent = $"{proposed.DetailedContent}{separator}[Additional information]\n{additionalNote.Trim()}";

        var changes = new List<FieldChange>
        {
            new("detailedContent", existing.DetailedContent, proposed.DetailedContent, string.IsNullOrWhiteSpace(existing.DetailedContent))
        };
        return new EnrichResult(proposed, changes, "Added additional information to details.");
    }

    private static string? ReadField(JsonElement el, string name)
    {
        if (el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String)
        {
            var val = v.GetString();
            return string.IsNullOrWhiteSpace(val) ? null : val;
        }
        return null;
    }

    private static List<FieldChange> BuildChanges(KnowledgeEntry old, KnowledgeEntry proposed)
    {
        var changes = new List<FieldChange>();

        void Check(string field, string? oldVal, string? newVal)
        {
            if (oldVal == newVal) return;                          // unchanged
            if (string.IsNullOrWhiteSpace(newVal)) return;        // AI returned null — keep existing
            changes.Add(new FieldChange(field, oldVal, newVal, string.IsNullOrWhiteSpace(oldVal)));
        }

        Check("title",          old.Title,          proposed.Title);
        Check("summary",        old.Summary,        proposed.Summary);
        Check("problem",        old.Problem,        proposed.Problem);
        Check("rootCause",      old.RootCause,      proposed.RootCause);
        Check("solution",       old.Solution,       proposed.Solution);
        Check("prevention",     old.Prevention,     proposed.Prevention);
        Check("detailedContent",old.DetailedContent,proposed.DetailedContent);
        Check("category",       old.Category,       proposed.Category);
        Check("affectedService",old.AffectedService,proposed.AffectedService);

        return changes;
    }

    private static KnowledgeEntry CloneEntry(KnowledgeEntry e) => new()
    {
        Id = e.Id, EntryType = e.EntryType, Status = e.Status, Severity = e.Severity,
        OriginalInput = e.OriginalInput, Project = e.Project, Module = e.Module,
        Title = e.Title, Summary = e.Summary, Problem = e.Problem,
        RootCause = e.RootCause, Solution = e.Solution, Prevention = e.Prevention,
        DetailedContent = e.DetailedContent, Category = e.Category,
        AffectedService = e.AffectedService, ConfidenceScore = e.ConfidenceScore,
        Tags = [..e.Tags], Technologies = [..e.Technologies],
        CreatedAt = e.CreatedAt, UpdatedAt = DateTimeOffset.UtcNow,
    };
}
