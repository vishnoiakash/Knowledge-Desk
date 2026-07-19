using System.Text.Json;
using System.Text.RegularExpressions;
using InternalKnowledge.Application;
using InternalKnowledge.Domain;
using Microsoft.Extensions.Options;

namespace InternalKnowledge.AI;

public sealed class KnowledgeAnalysisService(ILLMService llm,ISemanticSearchService search,IOptions<AiOptions> options) : IKnowledgeAnalysisService
{
    public async Task<AnalysisResult> AnalyzeAsync(AnalyzeKnowledgeRequest request,CancellationToken ct)
    {
        List<KnowledgeEntry> entries;List<string> missing=[];List<string> questions=[];
        if(options.Value.Provider.Equals("OpenAI",StringComparison.OrdinalIgnoreCase))
        {
            var raw=await llm.CompleteAsync("knowledge-extraction",request,ct);using var doc=JsonDocument.Parse(raw);var root=doc.RootElement;
            entries=root.TryGetProperty("entries",out var list)&&list.ValueKind==JsonValueKind.Array?list.EnumerateArray().Select(x=>Map(x,request)).ToList():[Map(root,request)];missing=ReadStrings(root,"missingInformation");questions=ReadStrings(root,"suggestedQuestions");
        }
        else entries=LocalAnalyzeMany(request,missing,questions);
        if(entries.Count==0)entries=[LocalEntry(request,request.RawInput)];var primary=entries[0];var duplicates=await search.SearchAsync(BuildSearchable(primary),5,request.Project,request.Module,ct);
        return new(primary,entries,missing,questions,duplicates.Where(x=>x.Similarity>=options.Value.DuplicateSimilarityThreshold).GroupBy(x=>x.KnowledgeEntryId).Select(x=>x.OrderByDescending(y=>y.Similarity).First()).ToArray());
    }
    private static List<KnowledgeEntry> LocalAnalyzeMany(AnalyzeKnowledgeRequest request,List<string> missing,List<string> questions)
    {
        var sections=request.RawInput.Split(["\r\n\r\n","\n\n"],StringSplitOptions.RemoveEmptyEntries|StringSplitOptions.TrimEntries);var substantial=sections.Where(x=>x.Length>=20).ToArray();var candidates=substantial.Length>1&&substantial.All(LooksLikeIndependentProblem)?substantial:[request.RawInput];
        if(candidates.Length==1){missing.Add("Confirmed root cause and solution may require review");questions.Add("What exact change resolved the issue?");}
        return candidates.Select(x=>LocalEntry(request,x)).ToList();
    }
    private static bool LooksLikeIndependentProblem(string text){var value=text.ToLowerInvariant();return value.Contains(" failed")||value.Contains("failure")||value.Contains(" error")||value.Contains(" issue")||value.Contains(" because ")||value.Contains(" mismatch")||value.Contains(" timeout");}
    private static KnowledgeEntry LocalEntry(AnalyzeKnowledgeRequest r,string text)
    {
        var lower=text.ToLowerInvariant();var causeAt=lower.IndexOf(" because ",StringComparison.Ordinal);var fixedAt=lower.IndexOf(" fixed ",StringComparison.Ordinal);if(fixedAt<0)fixedAt=lower.IndexOf(" resolved ",StringComparison.Ordinal);
        var title=text.Split(['.','\n'],StringSplitOptions.RemoveEmptyEntries)[0];
        return new(){EntryType=r.EntryType,OriginalInput=text,Project=r.Project,Module=r.Module,Title=title[..Math.Min(title.Length,120)],Summary=text[..Math.Min(text.Length,500)],Problem=causeAt>0?text[..causeAt].Trim():null,RootCause=causeAt>=0?text[(causeAt+9)..(fixedAt>causeAt?fixedAt:text.Length)].Trim(' ','.'):null,Solution=fixedAt>=0?text[fixedAt..].Trim(' ','.'):null,Prevention=lower.Contains("test")?text[(lower.LastIndexOf(" and ",StringComparison.Ordinal)+5)..].Trim(' ','.'):null,Category="Engineering",ConfidenceScore=causeAt>=0&&fixedAt>=0?.85m:.55m,Tags=[r.EntryType.ToString()]};
    }
    private static KnowledgeEntry Map(JsonElement j,AnalyzeKnowledgeRequest r)=>new(){EntryType=r.EntryType,OriginalInput=Get(j,"originalInput")??r.RawInput,Project=Get(j,"project")??r.Project,Module=Get(j,"module")??r.Module,Title=Get(j,"title")??"Untitled knowledge",Summary=Get(j,"summary")??r.RawInput,Problem=Get(j,"problem","problemStatement"),RootCause=Get(j,"rootCause","root_cause"),Solution=Get(j,"solution","resolution"),Prevention=Get(j,"prevention","preventiveAction"),DetailedContent=Get(j,"detailedContent","details"),Category=Get(j,"category"),AffectedService=Get(j,"affectedService"),ConfidenceScore=j.TryGetProperty("confidenceScore",out var c)&&c.TryGetDecimal(out var d)?d:.5m,Tags=ReadStrings(j,"tags"),Technologies=ReadStrings(j,"technologies")};
    private static string? Get(JsonElement j,params string[] names){foreach(var name in names)if(j.TryGetProperty(name,out var value)&&value.ValueKind==JsonValueKind.String)return value.GetString();return null;}
    private static List<string> ReadStrings(JsonElement j,string name)=>j.TryGetProperty(name,out var v)&&v.ValueKind==JsonValueKind.Array?v.EnumerateArray().Select(x=>x.GetString()).Where(x=>x is not null).Cast<string>().ToList():[];
    public static string BuildSearchable(KnowledgeEntry e)=>string.Join("\n",new[]{e.Title,e.Summary,e.Problem,e.RootCause,e.Solution,e.Prevention,e.DetailedContent,e.Project,e.Module,string.Join(' ',e.Tags),string.Join(' ',e.Technologies)}.Where(x=>!string.IsNullOrWhiteSpace(x)));
}

public sealed class KnowledgeAnswerService(ILLMService llm,ISemanticSearchService search,IOptions<AiOptions> options) : IKnowledgeAnswerService
{
    public async Task<AskResult> AskAsync(AskRequest request,CancellationToken ct)
    {
        var priorUserQuestions=(request.History??[]).Where(x=>x.Role.Equals("user",StringComparison.OrdinalIgnoreCase)).TakeLast(2).Select(x=>x.Content);var searchQuery=string.Join("\n",priorUserQuestions.Append(request.Question));var sources=await search.SearchAsync(searchQuery,options.Value.MaxRetrievedItems,request.Project,request.Module,ct);var useful=sources.Where(x=>x.Similarity>=options.Value.MinimumSimilarityThreshold).ToArray();if(useful.Length==0)return new("I don’t have enough reliable internal knowledge to answer that yet.",false,0,[],["Would you like to log what your team already knows about this?"]);
        var citations=useful.Select(x=>new Citation(x.KnowledgeEntryId,x.ChunkId,x.Title,x.ChunkType,x.Snippet,x.Similarity)).ToArray();if(!options.Value.Provider.Equals("OpenAI",StringComparison.OrdinalIgnoreCase))return new($"Based on **{useful[0].Title}** ({useful[0].ChunkType}):\n\n{useful[0].Snippet}",true,useful[0].Similarity,citations,["What related root cause or prevention is documented?"]);
        var allHistory=request.History??[];var recent=allHistory.TakeLast(4);var older=allHistory.Take(Math.Max(0,allHistory.Count-4)).TakeLast(2).Where(x=>x.Content.Length<=2000);var history=older.Concat(recent).Select(x=>new{x.Role,x.Content});var promptSources=useful.Select(x=>new{x.Title,x.ChunkType,x.Snippet,x.Problem,x.RootCause,x.Solution,x.Prevention,x.DetailedContent,x.Project,x.Module,x.Similarity});var raw=await llm.CompleteAsync("knowledge-answer",new{request.Question,conversationHistory=history,sources=promptSources},ct);using var doc=JsonDocument.Parse(raw);var root=doc.RootElement;var answer=RemoveInternalIds(root.GetProperty("answer").GetString()??"");return new(answer,root.GetProperty("grounded").GetBoolean(),root.TryGetProperty("confidence",out var c)?c.GetDouble():useful[0].Similarity,citations,root.TryGetProperty("suggestedFollowUps",out var f)?f.EnumerateArray().Select(x=>x.GetString()??"").ToArray():[]);
    }
    internal static string RemoveInternalIds(string answer)=>Regex.Replace(answer,@"\s*,?\s*ID:\s*[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}","",RegexOptions.IgnoreCase);
}
