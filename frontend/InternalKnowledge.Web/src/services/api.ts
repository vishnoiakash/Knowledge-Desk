export type EntryType="Issue"|"Workflow"|"Knowledge"|"Troubleshooting"|"HowTo"|"Decision"|"KnownLimitation";
export interface KnowledgeEntry{id:string;entryType:EntryType;title:string;summary:string;originalInput:string;problem?:string;rootCause?:string;solution?:string;prevention?:string;detailedContent?:string;category?:string;severity:"Low"|"Medium"|"High"|"Critical";project?:string;module?:string;affectedService?:string;confidenceScore:number;status:"Draft"|"Active"|"NeedsReview"|"Archived";tags:string[];technologies:string[];createdAt:string;updatedAt:string}
export interface SimilarEntry{knowledgeEntryId:string;title:string;summary:string;similarity:number}
export interface AnalysisResult{entry:KnowledgeEntry;missingInformation:string[];suggestedQuestions:string[];potentialDuplicates:SimilarEntry[]}
export interface AskResult{answer:string;grounded:boolean;confidence:number;sources:SimilarEntry[];suggestedFollowUps:string[]}
const base=(import.meta.env.VITE_API_URL??"").replace(/\/$/,"");
async function request<T>(path:string,init?:RequestInit):Promise<T>{const response=await fetch(`${base}${path}`,{...init,headers:{"Content-Type":"application/json",...init?.headers}});if(!response.ok){const body=await response.json().catch(()=>null);throw new Error(body?.title??body?.detail??`Request failed (${response.status})`)}if(response.status===204)return undefined as T;return response.json() as Promise<T>}
export interface AnalyzeInput { rawInput:string; entryType:EntryType; project?:string; module?:string }
export const knowledgeApi={
 list:(query="")=>request<KnowledgeEntry[]>(`/api/knowledge?query=${encodeURIComponent(query)}&page=1&pageSize=100`),
 analyze:(input:AnalyzeInput)=>request<AnalysisResult>("/api/knowledge/analyze",{method:"POST",body:JSON.stringify(input)}),
 create:(entry:KnowledgeEntry)=>request<KnowledgeEntry>("/api/knowledge",{method:"POST",body:JSON.stringify(entry)}),
 update:(entry:KnowledgeEntry)=>request<KnowledgeEntry>(`/api/knowledge/${entry.id}`,{method:"PUT",body:JSON.stringify(entry)}),
 archive:(id:string)=>request<void>(`/api/knowledge/${id}/archive`,{method:"POST"}),
 ask:(question:string,project?:string,module?:string)=>request<AskResult>("/api/assistant/ask",{method:"POST",body:JSON.stringify({question,project,module})})
};
