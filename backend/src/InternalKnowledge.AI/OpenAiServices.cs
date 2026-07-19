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
        var instructions=promptName switch { "knowledge-extraction"=>Prompts.Extraction, "knowledge-answer"=>Prompts.Answer, _=>throw new ArgumentOutOfRangeException(nameof(promptName)) };
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
Convert an internal engineering note into one or more structured knowledge entries. Split independent problems into separate entries; keep one entry when the note describes one problem.

Return every key in exactly this camelCase shape:
{"entries": [{
  "title": "short descriptive title",
  "summary": "concise overview",
  "problem": "observed error or user impact, or null",
  "rootCause": "cause stated or directly supported by the note, or null",
  "solution": "corrective action stated or directly supported by the note, or null",
  "prevention": "preventive action stated or directly supported by the note, or null",
  "detailedContent": "useful supporting details, or null",
  "category": "short category, or null",
  "affectedService": "service name, or null",
  "project": "project from input, or null",
  "module": "module from input, or null",
  "confidenceScore": 0.0,
  "tags": [],
  "technologies": [],
  "missingInformation": [],
  "suggestedQuestions": []
}], "missingInformation": [], "suggestedQuestions": []}

For an Issue or Troubleshooting entry, actively separate the symptom into problem, the stated reason into rootCause, the corrective action into solution, and a future safeguard into prevention.
Do not omit keys. Do not copy the entire note into every field. Never invent unsupported project-specific facts.
A directly implied corrective action is allowed when it is the clear inverse of the stated cause—for example, a missing or invalid API key implies supplying a valid API key.
Use null only when the note does not support the field. Confidence must reflect the supplied evidence. Prompt version: extraction-v2.
""";
    public const string Answer="""
Answer only from the supplied internal knowledge sources and never fabricate project-specific details.
Match the answer length to the question. For a simple definition or purpose question, answer directly in one to three short paragraphs. Use concise Markdown headings, bullets, or numbered steps only when they materially improve a multi-part or procedural answer. Put every heading and list item on its own line and include blank lines between sections.
Do not include database IDs, GUIDs, raw object fields, or parenthetical source identifiers. Source cards are rendered separately, so mention only a human-readable source title when essential.
Clearly label uncertainty and set grounded to false when evidence is insufficient.
Return JSON with answer, grounded, confidence, and suggestedFollowUps. Prompt version: answer-v2.
""";
}
