using FluentValidation;
using InternalKnowledge.AI;
using InternalKnowledge.Application;
using InternalKnowledge.Domain;
using InternalKnowledge.Persistence;
using Microsoft.EntityFrameworkCore;
using Serilog;
using System.Text.Json.Serialization;

var builder=WebApplication.CreateBuilder(args);
builder.Host.UseSerilog((ctx,c)=>c.ReadFrom.Configuration(ctx.Configuration).Enrich.FromLogContext().WriteTo.Console());
builder.Services.AddProblemDetails();builder.Services.AddExceptionHandler<GlobalExceptionHandler>();builder.Services.AddOpenApi();builder.Services.AddValidatorsFromAssemblyContaining<Program>();
builder.Services.ConfigureHttpJsonOptions(o=>o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddCors(o=>o.AddDefaultPolicy(p=>p.WithOrigins(builder.Configuration["FrontendUrl"]??"http://localhost:3000").AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddKnowledgeAi(builder.Configuration);builder.Services.AddKnowledgePersistence(builder.Configuration);
var app=builder.Build();app.UseExceptionHandler();app.UseSerilogRequestLogging();app.UseCors();if(app.Environment.IsDevelopment())app.MapOpenApi();
await using(var scope=app.Services.CreateAsyncScope()){var db=scope.ServiceProvider.GetRequiredService<KnowledgeDbContext>();await db.Database.MigrateAsync();}

app.MapPost("/api/knowledge/analyze",async(AnalyzeKnowledgeRequest request,IValidator<AnalyzeKnowledgeRequest> validator,IKnowledgeAnalysisService service,CancellationToken ct)=>{var v=await validator.ValidateAsync(request,ct);return !v.IsValid?Results.ValidationProblem(v.ToDictionary()):Results.Ok(await service.AnalyzeAsync(request,ct));});
app.MapPost("/api/knowledge",async(KnowledgeEntry entry,IValidator<KnowledgeEntry> validator,IKnowledgeRepository repo,IKnowledgeIndexingService indexing,KnowledgeDbContext db,CancellationToken ct)=>{var v=await validator.ValidateAsync(entry,ct);if(!v.IsValid)return Results.ValidationProblem(v.ToDictionary());await repo.SaveAsync(entry,ct);await db.AddRevisionAsync(entry,ct);await indexing.IndexAsync(entry.Id,ct);return Results.Created($"/api/knowledge/{entry.Id}",entry);});
app.MapPut("/api/knowledge/{id:guid}",async(Guid id,KnowledgeEntry entry,IValidator<KnowledgeEntry> validator,IKnowledgeRepository repo,IKnowledgeIndexingService indexing,KnowledgeDbContext db,CancellationToken ct)=>{if(id!=entry.Id)return Results.BadRequest();if(await repo.GetAsync(id,ct) is null)return Results.NotFound();var v=await validator.ValidateAsync(entry,ct);if(!v.IsValid)return Results.ValidationProblem(v.ToDictionary());entry.UpdatedAt=DateTimeOffset.UtcNow;await repo.SaveAsync(entry,ct);await db.AddRevisionAsync(entry,ct);await indexing.IndexAsync(id,ct);return Results.Ok(entry);});
app.MapGet("/api/knowledge/{id:guid}",async(Guid id,IKnowledgeRepository repo,CancellationToken ct)=>await repo.GetAsync(id,ct) is { } e?Results.Ok(e):Results.NotFound());
app.MapGet("/api/knowledge",async(string? query,int page,int pageSize,IKnowledgeRepository repo,CancellationToken ct)=>Results.Ok(await repo.ListAsync(query,Math.Max(page,1),Math.Clamp(pageSize==0?20:pageSize,1,100),ct)));
app.MapPost("/api/search/semantic",async(SemanticSearchRequest request,IValidator<SemanticSearchRequest> validator,ISemanticSearchService search,CancellationToken ct)=>{var v=await validator.ValidateAsync(request,ct);return !v.IsValid?Results.ValidationProblem(v.ToDictionary()):Results.Ok(await search.SearchAsync(request.Query,request.Limit,request.Project,request.Module,ct));});
app.MapPost("/api/assistant/ask",async(AskRequest request,IValidator<AskRequest> validator,IKnowledgeAnswerService service,KnowledgeDbContext db,CancellationToken ct)=>{var v=await validator.ValidateAsync(request,ct);if(!v.IsValid)return Results.ValidationProblem(v.ToDictionary());var answer=await service.AskAsync(request,ct);db.QuestionHistory.Add(new(){Question=request.Question,Answer=answer.Answer,Grounded=answer.Grounded});await db.SaveChangesAsync(ct);return Results.Ok(answer);});
app.MapGet("/api/knowledge/{id:guid}/similar",async(Guid id,IKnowledgeRepository repo,ISemanticSearchService search,CancellationToken ct)=>await repo.GetAsync(id,ct) is { } e?Results.Ok(await search.SearchAsync($"{e.Title} {e.Summary}",6,e.Project,e.Module,ct)):Results.NotFound());
app.MapPost("/api/knowledge/{id:guid}/reindex",async(Guid id,IKnowledgeIndexingService service,CancellationToken ct)=>{await service.IndexAsync(id,ct);return Results.Accepted();});
app.MapPost("/api/knowledge/{id:guid}/feedback",async(Guid id,FeedbackRequest request,IKnowledgeRepository repo,KnowledgeDbContext db,CancellationToken ct)=>{if(await repo.GetAsync(id,ct)is null)return Results.NotFound();db.KnowledgeFeedback.Add(new(){KnowledgeEntryId=id,Helpful=request.Helpful,Comment=request.Comment});await db.SaveChangesAsync(ct);return Results.NoContent();});
app.MapPost("/api/knowledge/{id:guid}/archive",async(Guid id,IKnowledgeRepository repo,CancellationToken ct)=>{var e=await repo.GetAsync(id,ct);if(e is null)return Results.NotFound();e.Status=KnowledgeStatus.Archived;e.UpdatedAt=DateTimeOffset.UtcNow;await repo.SaveAsync(e,ct);return Results.NoContent();});
app.MapPost("/api/admin/reindex",async(ReindexRequest request,IKnowledgeIndexingService indexing,CancellationToken ct)=>{foreach(var id in request.EntryIds.Take(100))await indexing.IndexAsync(id,ct);return Results.Accepted();});
app.MapGet("/health",()=>Results.Ok(new{status="healthy",utc=DateTimeOffset.UtcNow}));
app.Run();
public partial class Program{}
public record SemanticSearchRequest(string Query,int Limit=10,string? Project=null,string? Module=null);public record FeedbackRequest(bool Helpful,string? Comment);public record ReindexRequest(Guid[] EntryIds);
