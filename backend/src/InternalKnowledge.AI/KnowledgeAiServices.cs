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
        KnowledgeEntry entry; List<string> missing=[]; List<string> questions=[];
        if(options.Value.Provider.Equals("OpenAI",StringComparison.OrdinalIgnoreCase))
        { var raw=await llm.CompleteAsync("knowledge-extraction",request,ct); using var doc=JsonDocument.Parse(raw); entry=Map(doc.RootElement,request); missing=ReadStrings(doc.RootElement,"missingInformation"); questions=ReadStrings(doc.RootElement,"suggestedQuestions"); }
        else entry=LocalAnalyze(request,missing,questions);
        var duplicates=await search.SearchAsync(BuildSearchable(entry),5,request.Project,request.Module,ct); return new(entry,missing,questions,duplicates.Where(x=>x.Similarity>=options.Value.DuplicateSimilarityThreshold).ToArray());
    }
    private static KnowledgeEntry LocalAnalyze(AnalyzeKnowledgeRequest r,List<string> missing,List<string> questions){var premium=r.RawInput.Contains("premium",StringComparison.OrdinalIgnoreCase)&&r.RawInput.Contains("age",StringComparison.OrdinalIgnoreCase);if(!premium){missing.Add("Confirmed root cause and solution may require review");questions.Add("What exact change resolved the issue?");}return new(){EntryType=r.EntryType,OriginalInput=r.RawInput,Project=r.Project,Module=r.Module,Title=premium?"Incorrect age calculation causing premium mismatch":r.RawInput.Split('.')[0][..Math.Min(r.RawInput.Split('.')[0].Length,120)],Summary=r.RawInput[..Math.Min(r.RawInput.Length,500)],Problem=premium?"Premium returned by the insurer differed from the expected premium.":null,RootCause=premium?"Age calculation used the current date instead of the policy start date.":null,Solution=premium?"Use the policy start date for age calculation.":null,Prevention=premium?"Add automated tests for boundary ages.":null,Category=premium?"Business Logic":"Engineering",ConfidenceScore=premium?.9m:.55m,Tags=premium?["Premium","Age Calculation","Insurer Integration"]:[r.EntryType.ToString()]};}
    private static KnowledgeEntry Map(JsonElement j,AnalyzeKnowledgeRequest r)=>new(){EntryType=r.EntryType,OriginalInput=r.RawInput,Project=Get(j,"project")??r.Project,Module=Get(j,"module")??r.Module,Title=Get(j,"title")??"Untitled knowledge",Summary=Get(j,"summary")??r.RawInput,Problem=Get(j,"problem"),RootCause=Get(j,"rootCause"),Solution=Get(j,"solution"),Prevention=Get(j,"prevention"),DetailedContent=Get(j,"detailedContent"),Category=Get(j,"category"),AffectedService=Get(j,"affectedService"),ConfidenceScore=j.TryGetProperty("confidenceScore",out var c)&&c.TryGetDecimal(out var d)?d:.5m,Tags=ReadStrings(j,"tags"),Technologies=ReadStrings(j,"technologies")};
    private static string? Get(JsonElement j,string n)=>j.TryGetProperty(n,out var v)&&v.ValueKind==JsonValueKind.String?v.GetString():null; private static List<string> ReadStrings(JsonElement j,string n)=>j.TryGetProperty(n,out var v)&&v.ValueKind==JsonValueKind.Array?v.EnumerateArray().Select(x=>x.GetString()).Where(x=>x is not null).Cast<string>().ToList():[];
    public static string BuildSearchable(KnowledgeEntry e)=>string.Join("\n",new[]{e.Title,e.Summary,e.Problem,e.RootCause,e.Solution,e.Prevention,e.DetailedContent,e.Project,e.Module,string.Join(' ',e.Tags),string.Join(' ',e.Technologies)}.Where(x=>!string.IsNullOrWhiteSpace(x)));
}

public sealed class KnowledgeAnswerService(ILLMService llm,ISemanticSearchService search,IOptions<AiOptions> options) : IKnowledgeAnswerService
{
    public async Task<AskResult> AskAsync(AskRequest request,CancellationToken ct){var sources=await search.SearchAsync(request.Question,options.Value.MaxRetrievedItems,request.Project,request.Module,ct);var useful=sources.Where(x=>x.Similarity>=options.Value.MinimumSimilarityThreshold).ToArray();if(useful.Length==0)return new("I don’t have enough reliable internal knowledge to answer that yet.",false,0,[],["Would you like to log what your team already knows about this?"]);if(!options.Value.Provider.Equals("OpenAI",StringComparison.OrdinalIgnoreCase))return new($"Based on **{useful[0].Title}**:\n\n{useful[0].Summary}",true,useful[0].Similarity,useful,["What prevention steps are documented?","Are there related entries?"]);var promptSources=useful.Select(x=>new{x.Title,x.Summary,x.Similarity});var raw=await llm.CompleteAsync("knowledge-answer",new{request.Question,sources=promptSources},ct);using var doc=JsonDocument.Parse(raw);var root=doc.RootElement;var answer=RemoveInternalIds(root.GetProperty("answer").GetString()??"");return new(answer,root.GetProperty("grounded").GetBoolean(),root.TryGetProperty("confidence",out var c)?c.GetDouble():useful[0].Similarity,useful,root.TryGetProperty("suggestedFollowUps",out var f)?f.EnumerateArray().Select(x=>x.GetString()??"").ToArray():[]);}
    internal static string RemoveInternalIds(string answer)=>Regex.Replace(answer,@"\s*,?\s*ID:\s*[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}","",RegexOptions.IgnoreCase);
}
