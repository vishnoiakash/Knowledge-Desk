namespace InternalKnowledge.AI;
public sealed class AiOptions
{
    public const string SectionName="Ai";
    public string Provider { get; set; }="Local";
    public string ApiKey { get; set; }="";
    public string ChatModel { get; set; }="gpt-5-mini";
    public string ExtractionModel { get; set; }="gpt-5-mini";
    public string EmbeddingModel { get; set; }="text-embedding-3-small";
    public int EmbeddingDimensions { get; set; }=1536;
    public int MaxRetrievedItems { get; set; }=4;
    public double MinimumSimilarityThreshold { get; set; }=.65;
    public double DuplicateSimilarityThreshold { get; set; }=.86;
}
