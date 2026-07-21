using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using InternalKnowledge.Application;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace InternalKnowledge.AI;

public sealed class OpenAiService(HttpClient http,IOptions<AiOptions> options,ILogger<OpenAiService> logger) : ILLMService,IEmbeddingService
{
    private readonly AiOptions _options=options.Value;
    public async Task<string> CompleteAsync(string promptName,object input,CancellationToken ct)
    {
        EnsureConfigured(); var started=DateTime.UtcNow;
        var instructions=promptName switch {
            "knowledge-extraction" => Prompts.Extraction,
            "knowledge-answer"     => Prompts.Answer,
            "completeness-check"   => Prompts.CompletenessCheck,
            "knowledge-enrich"     => Prompts.Enrich,
            _ => throw new ArgumentOutOfRangeException(nameof(promptName))
        };
        using var request=new HttpRequestMessage(HttpMethod.Post,"responses"); request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",_options.ApiKey);
        request.Content=JsonContent.Create(new { model=promptName=="knowledge-extraction"?_options.ExtractionModel:_options.ChatModel, instructions, input=$"Return the result as a JSON object for this input:\n{JsonSerializer.Serialize(input)}", text=new { format=new { type="json_object" } } });
        using var response=await http.SendAsync(request,ct); var body=await response.Content.ReadAsStringAsync(ct); if(!response.IsSuccessStatusCode) throw new InvalidOperationException($"OpenAI request failed ({(int)response.StatusCode}).");
        using var json=JsonDocument.Parse(body); var text=json.RootElement.GetProperty("output").EnumerateArray().SelectMany(x=>x.GetProperty("content").EnumerateArray()).First(x=>x.GetProperty("type").GetString()=="output_text").GetProperty("text").GetString()??"{}";
        logger.LogInformation("AI request {RequestType} using {Model} completed in {ElapsedMs}ms",promptName,promptName=="knowledge-extraction"?_options.ExtractionModel:_options.ChatModel,(DateTime.UtcNow-started).TotalMilliseconds); return text;
    }
    public async Task<ReadOnlyMemory<float>> GenerateAsync(string text,CancellationToken ct)
    {
        if(!IsOpenAi()) return LocalEmbedding.Create(text,_options.EmbeddingDimensions);
        var started=DateTime.UtcNow; using var request=new HttpRequestMessage(HttpMethod.Post,"embeddings"); request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",_options.ApiKey); request.Content=JsonContent.Create(new { model=_options.EmbeddingModel,input=text,dimensions=_options.EmbeddingDimensions });
        using var response=await http.SendAsync(request,ct); var body=await response.Content.ReadAsStringAsync(ct); if(!response.IsSuccessStatusCode) throw new InvalidOperationException($"OpenAI embedding failed ({(int)response.StatusCode})."); using var json=JsonDocument.Parse(body); var values=json.RootElement.GetProperty("data")[0].GetProperty("embedding").EnumerateArray().Select(x=>x.GetSingle()).ToArray(); logger.LogInformation("Embedding using {Model} completed in {ElapsedMs}ms",_options.EmbeddingModel,(DateTime.UtcNow-started).TotalMilliseconds); return values;
    }
    private bool IsOpenAi()=>_options.Provider.Equals("OpenAI",StringComparison.OrdinalIgnoreCase)&&!string.IsNullOrWhiteSpace(_options.ApiKey);
    private void EnsureConfigured(){if(!IsOpenAi()) throw new InvalidOperationException("Set Ai:Provider to OpenAI and supply Ai:ApiKey through user secrets or environment variables.");}
}

static class LocalEmbedding
{
    public static ReadOnlyMemory<float> Create(string text,int dimensions){var v=new float[dimensions];foreach(var token in text.ToLowerInvariant().Split([' ','\n','\r','\t',',','.',';',':','/','-'],StringSplitOptions.RemoveEmptyEntries)){var h=StableHash(token);v[(int)(h%(uint)dimensions)]+=1f;}var norm=MathF.Sqrt(v.Sum(x=>x*x));if(norm>0)for(var i=0;i<v.Length;i++)v[i]/=norm;return v;}
    private static uint StableHash(string value){const uint offset=2166136261;const uint prime=16777619;var hash=offset;foreach(var c in value){hash^=c;hash*=prime;}return hash;}
}

static class Prompts
{
    public const string Extraction="""
You are extracting structured knowledge from an internal engineering document. The input includes an "entryType" field — use it to determine the correct extraction strategy.

The input may be in any language — Hindi, Hinglish, or English. Always produce all output fields in English regardless of the input language. Translate naturally; do not transliterate.

## Extraction strategy by entry type

**Issue / Troubleshooting**: Extract the symptom (problem), underlying cause (rootCause), the fix applied (solution), and how to prevent recurrence (prevention). These are the primary fields — fill them from the text directly.

**HowTo / Workflow**: The note is a procedure or guide. Put the overall purpose in summary. Put the step-by-step instructions in solution. Use problem only if there is a specific trigger condition. Leave rootCause and prevention null unless explicitly stated.

**Knowledge / Decision / KnownLimitation**: The note is reference material, a design decision, or a documented constraint. Put the core explanation in summary and detailedContent. Use problem only if there is a known failure mode. Leave rootCause and solution null unless the note describes a fix.

**API documentation or reference material** (when the input looks like docs regardless of selected type): Extract one entry per logical API endpoint or concept section. Put the endpoint/feature name in title, its purpose in summary, request/response details and examples in detailedContent, any known gotchas or error conditions in problem, and authentication/prerequisites in solution. Leave rootCause and prevention null.

## Output format

Return every key in exactly this camelCase shape:
{"entries": [{
  "title": "short descriptive title",
  "summary": "concise overview — what this is or does",
  "problem": "observed error, failure condition, or trigger — null if not applicable",
  "rootCause": "underlying cause — null if not applicable",
  "solution": "fix, steps, or how to use — null if not applicable",
  "prevention": "how to avoid recurrence — null if not applicable",
  "detailedContent": "supporting details, examples, parameters, caveats — null if none",
  "category": "short category, or null",
  "affectedService": "service or API name, or null",
  "project": "project from input, or null",
  "module": "module from input, or null",
  "confidenceScore": 0.0,
  "tags": [],
  "technologies": [],
  "missingInformation": [],
  "suggestedQuestions": []
}], "missingInformation": [], "suggestedQuestions": []}

## Rules
- Split independent problems or API endpoints into separate entries; keep one entry when the input covers a single topic.
- Do not omit keys. Do not copy the entire document into every field.
- Never invent unsupported project-specific facts.
- Use null only when the note genuinely does not support the field.
- Confidence must reflect the supplied evidence.
- All output must be in English.
Prompt version: extraction-v4.
""";
    public const string Answer="""
Answer only from the supplied internal knowledge sources and never fabricate project-specific details.
Match the answer length to the question. For a simple definition or purpose question, answer directly in one to three short paragraphs. Use concise Markdown headings, bullets, or numbered steps only when they materially improve a multi-part or procedural answer. Put every heading and list item on its own line and include blank lines between sections.
Do not include database IDs, GUIDs, raw object fields, or parenthetical source identifiers. Source cards are rendered separately, so mention only a human-readable source title when essential.
Clearly label uncertainty and set grounded to false when evidence is insufficient.

IMPORTANT FORMATTING RULES:
- Always wrap JSON objects and arrays in fenced code blocks with the json language tag: ```json\n...\n```
- Always wrap code snippets (C#, SQL, shell, etc.) in fenced code blocks with the appropriate language tag
- Never write JSON inline as plain text — always use a code block
- URLs must be written as Markdown links: [display text](url) or bare https:// links
- Use pipe tables for tabular data

Return JSON with answer, grounded, confidence, and suggestedFollowUps. Prompt version: answer-v3.
""";
    public const string CompletenessCheck="""
Evaluate whether a raw engineering capture note has enough information to produce a high-quality knowledge entry.
The note may be in any language — Hindi, Hinglish, or English. Understand it in whatever language it is written.

The input includes an "entryType" field. Apply the correct completeness criteria:
- Issue / Troubleshooting: requires problem, rootCause, solution. Ask for any that are missing.
- HowTo / Workflow: requires a clear purpose and steps (solution). Ask only if the procedure is unclear.
- Knowledge / Decision / KnownLimitation: requires a clear summary. rootCause and solution are not required.
- If the input looks like API documentation or reference material: it is already complete — return empty arrays.

For each genuinely missing field, provide a concise follow-up question in the same language as the input note.
Return JSON: {"missingFields": [], "followUpQuestions": []}
Only list fields that are genuinely absent or insufficiently described. If the note is complete return empty arrays.
Prompt version: completeness-v3.
""";
    public const string Enrich="""
You are enriching an existing internal engineering knowledge entry with new information provided by a team member.

Your job is to produce an improved version of the entry that:
1. Preserves everything that is already correct and well-written
2. Incorporates the new information into the most appropriate fields
3. If the new information contradicts existing content, include both with clear context (e.g. "Originally: X. Later found: Y.")
4. Never removes accurate existing content — only add or clarify
5. Never invent facts not present in either the existing entry or the new note

The input may be in any language. All output must be in English.

Return JSON in this exact shape:
{
  "summary": "one sentence describing what changed",
  "entry": {
    "title": "...",
    "summary": "...",
    "problem": "...",
    "rootCause": "...",
    "solution": "...",
    "prevention": "...",
    "detailedContent": "...",
    "category": "...",
    "affectedService": "...",
    "tags": [],
    "technologies": []
  }
}

Return null for any field that should remain unchanged from the existing entry.
Only populate fields that genuinely benefit from the new information.
Prompt version: enrich-v1.
""";
}
