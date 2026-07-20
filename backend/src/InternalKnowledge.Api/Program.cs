using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using FluentValidation;
using InternalKnowledge.AI;
using InternalKnowledge.Application;
using InternalKnowledge.Domain;
using InternalKnowledge.Indexing;
using InternalKnowledge.Infrastructure;
using InternalKnowledge.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Serilog;
// ── Builder ───────────────────────────────────────────────────────────────────
var builder = WebApplication.CreateBuilder(args);
builder.Host.UseSerilog((ctx, c) =>
    c.ReadFrom.Configuration(ctx.Configuration).Enrich.FromLogContext().WriteTo.Console());

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddOpenApi();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();
builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(
        builder.Configuration["FrontendUrl"] ?? "http://localhost:3000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173"
     )
     .AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

// JWT auth
var jwtKey    = builder.Configuration["Jwt:Key"]      ?? "dev-only-key-change-in-secrets-32chars!!";
var jwtIssuer = builder.Configuration["Jwt:Issuer"]   ?? "knowledge-desk";
var jwtAud    = builder.Configuration["Jwt:Audience"] ?? "knowledge-desk-web";
var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.TokenValidationParameters = new()
        {
            ValidateIssuer           = true,
            ValidateAudience         = true,
            ValidateLifetime         = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer              = jwtIssuer,
            ValidAudience            = jwtAud,
            IssuerSigningKey         = signingKey
        };
        // Also accept token from HttpOnly cookie
        o.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                if (ctx.Request.Cookies.TryGetValue("kd_token", out var token))
                    ctx.Token = token;
                return Task.CompletedTask;
            }
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddKnowledgeAi(builder.Configuration);
builder.Services.AddKnowledgePersistence(builder.Configuration);
builder.Services.AddKnowledgeIndexing();
builder.Services.AddKnowledgeInfrastructure();

// ── App ───────────────────────────────────────────────────────────────────────
var app = builder.Build();
app.UseExceptionHandler();
app.UseSerilogRequestLogging();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
if (app.Environment.IsDevelopment()) app.MapOpenApi();

if (!app.Environment.IsEnvironment("Testing"))
{
    await using var scope = app.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<KnowledgeDbContext>();
    await db.Database.MigrateAsync();
}

// ── Auth endpoints (Task 2) ───────────────────────────────────────────────────

app.MapPost("/api/auth/login", async (
    LoginRequest request,
    LdapAuthService ldap,
    KnowledgeDbContext db,
    IConfiguration config,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
        return Results.BadRequest(new { message = "Username and password are required." });

    var username = request.Username.Trim().ToLowerInvariant();
    // Strip @domain suffix if user typed full email
    if (username.Contains('@')) username = username.Split('@')[0];

    // 1. Check allow-list
    var user = await db.Users.FindAsync([username], ct);
    if (user is null || !user.IsActive)
        return Results.Json(new { message = "Your account is not authorised for Knowledge Desk." }, statusCode: 403);

    // 2. LDAP verification
    var authenticated = await ldap.AuthenticateAsync(username, request.Password, ct);
    if (!authenticated)
        return Results.Json(new { message = "Invalid credentials." }, statusCode: 401);

    // 3. Update last login
    user.LastLoginAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync(ct);

    // 4. Issue JWT
    var key     = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Key"] ?? jwtKey));
    var creds   = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
    var expiry  = int.TryParse(config["Jwt:ExpiryMinutes"], out var m) ? m : 480;
    var claims  = new[]
    {
        new Claim(ClaimTypes.NameIdentifier, username),
        new Claim(ClaimTypes.Name, user.DisplayName ?? username),
        new Claim("email", user.Email ?? "")
    };
    var token = new JwtSecurityToken(
        issuer: config["Jwt:Issuer"] ?? jwtIssuer,
        audience: config["Jwt:Audience"] ?? jwtAud,
        claims: claims,
        expires: DateTime.UtcNow.AddMinutes(expiry),
        signingCredentials: creds);
    var tokenString = new JwtSecurityTokenHandler().WriteToken(token);

    // HttpOnly cookie so the browser never exposes the token to JS
    var cookieOpts = new CookieOptions
    {
        HttpOnly = true,
        Secure   = false, // set true in production (HTTPS)
        SameSite = SameSiteMode.Lax,
        Expires  = DateTimeOffset.UtcNow.AddMinutes(expiry)
    };
    return ResultExtensions.LoginOk(tokenString, cookieOpts,
        new { username, displayName = user.DisplayName ?? username, email = user.Email });
}).AllowAnonymous();

app.MapPost("/api/auth/logout", (HttpContext ctx) =>
{
    ctx.Response.Cookies.Delete("kd_token");
    return Results.NoContent();
});

app.MapGet("/api/auth/me", (ClaimsPrincipal user) =>
    Results.Ok(new
    {
        username    = user.FindFirstValue(ClaimTypes.NameIdentifier),
        displayName = user.FindFirstValue(ClaimTypes.Name),
        email       = user.FindFirstValue("email")
    })).RequireAuthorization();

// ── User admin endpoints ──────────────────────────────────────────────────────

app.MapGet("/api/users", async (KnowledgeDbContext db, CancellationToken ct) =>
    Results.Ok(await db.Users.AsNoTracking()
        .OrderBy(x => x.Username)
        .Select(x => new UserDto(x.Username, x.DisplayName, x.Email, x.IsActive, x.CreatedAt))
        .ToListAsync(ct))
).RequireAuthorization();

app.MapPost("/api/users", async (UserDto dto, KnowledgeDbContext db, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(dto.Username))
        return Results.BadRequest(new { message = "Username is required." });
    var username = dto.Username.Trim().ToLowerInvariant();
    if (await db.Users.FindAsync([username], ct) is not null)
        return Results.Conflict(new { message = "User already exists." });
    db.Users.Add(new KnowledgeUser
    {
        Username    = username,
        DisplayName = dto.DisplayName,
        Email       = dto.Email,
        IsActive    = dto.IsActive,
        CreatedAt   = DateTimeOffset.UtcNow
    });
    await db.SaveChangesAsync(ct);
    return Results.Created($"/api/users/{username}", dto with { Username = username });
}).RequireAuthorization();

app.MapPut("/api/users/{username}", async (
    string username, UserDto dto, KnowledgeDbContext db, CancellationToken ct) =>
{
    var user = await db.Users.FindAsync([username], ct);
    if (user is null) return Results.NotFound();
    user.DisplayName = dto.DisplayName;
    user.Email       = dto.Email;
    user.IsActive    = dto.IsActive;
    await db.SaveChangesAsync(ct);
    return Results.Ok(new UserDto(user.Username, user.DisplayName, user.Email, user.IsActive, user.CreatedAt));
}).RequireAuthorization();

// ── Knowledge CRUD (existing, now requires auth) ──────────────────────────────

app.MapPost("/api/knowledge/analyze", async (
    AnalyzeKnowledgeRequest request, IValidator<AnalyzeKnowledgeRequest> validator,
    IKnowledgeAnalysisService service, CancellationToken ct) =>
{
    var v = await validator.ValidateAsync(request, ct);
    return !v.IsValid ? Results.ValidationProblem(v.ToDictionary())
                      : Results.Ok(await service.AnalyzeAsync(request, ct));
}).RequireAuthorization();

app.MapPost("/api/knowledge", async (
    KnowledgeEntry entry, bool allowDuplicate,
    IValidator<KnowledgeEntry> validator, IKnowledgeRepository repo,
    ISemanticSearchService search, IOptions<AiOptions> options,
    IKnowledgeIndexingQueue queue, KnowledgeDbContext db, CancellationToken ct) =>
{
    var v = await validator.ValidateAsync(entry, ct);
    if (!v.IsValid) return Results.ValidationProblem(v.ToDictionary());
    if (await repo.GetAsync(entry.Id, ct) is not null)
        return Results.Conflict(new { code = "id_already_exists", message = "Use the update endpoint." });
    var dup = await FindDuplicate(entry, search, options.Value.DuplicateSimilarityThreshold, ct);
    if (dup is not null && !allowDuplicate) return DuplicateConflict(dup);
    await using var tx = await db.Database.BeginTransactionAsync(ct);
    await repo.SaveAsync(entry, ct);
    await db.AddRevisionAsync(entry, ct);
    await queue.EnqueueAsync(entry.Id, ct);
    await tx.CommitAsync(ct);
    return Results.Created($"/api/knowledge/{entry.Id}", entry);
}).RequireAuthorization();

app.MapPut("/api/knowledge/{id:guid}", async (
    Guid id, KnowledgeEntry entry, IValidator<KnowledgeEntry> validator,
    IKnowledgeRepository repo, IKnowledgeIndexingQueue queue,
    KnowledgeDbContext db, CancellationToken ct) =>
{
    if (id != entry.Id) return Results.BadRequest();
    if (await repo.GetAsync(id, ct) is null) return Results.NotFound();
    var v = await validator.ValidateAsync(entry, ct);
    if (!v.IsValid) return Results.ValidationProblem(v.ToDictionary());
    entry.UpdatedAt = DateTimeOffset.UtcNow;
    await using var tx = await db.Database.BeginTransactionAsync(ct);
    await repo.SaveAsync(entry, ct);
    await db.AddRevisionAsync(entry, ct);
    await queue.EnqueueAsync(id, ct);
    await tx.CommitAsync(ct);
    return Results.Ok(entry);
}).RequireAuthorization();

app.MapGet("/api/knowledge/{id:guid}", async (
    Guid id, IKnowledgeRepository repo, CancellationToken ct) =>
    await repo.GetAsync(id, ct) is { } e ? Results.Ok(e) : Results.NotFound()
).RequireAuthorization();

app.MapGet("/api/knowledge", async (
    [AsParameters] KnowledgeListParameters p, IKnowledgeRepository repo, CancellationToken ct) =>
    Results.Ok(await repo.ListAsync(new(
        p.Query, p.EntryType, p.Project, p.Module, p.Severity, p.Status,
        p.Technology, p.Tag, p.Sort ?? "updatedDesc",
        Math.Max(p.Page ?? 1, 1), Math.Clamp(p.PageSize ?? 20, 1, 100),
        p.IncludeArchived ?? false), ct))
).RequireAuthorization();

app.MapGet("/api/knowledge/{id:guid}/revisions", async (
    Guid id, KnowledgeDbContext db, CancellationToken ct) =>
    Results.Ok(await db.KnowledgeRevisions.AsNoTracking()
        .Where(x => x.KnowledgeEntryId == id)
        .OrderByDescending(x => x.RevisionNumber)
        .ToListAsync(ct))
).RequireAuthorization();

app.MapPost("/api/knowledge/{id:guid}/archive", async (
    Guid id, IKnowledgeRepository repo, IKnowledgeIndexingQueue queue,
    KnowledgeDbContext db, CancellationToken ct) =>
    await SetStatus(id, KnowledgeStatus.Archived, repo, queue, db, ct)
).RequireAuthorization();

app.MapPost("/api/knowledge/{id:guid}/restore", async (
    Guid id, IKnowledgeRepository repo, IKnowledgeIndexingQueue queue,
    KnowledgeDbContext db, CancellationToken ct) =>
    await SetStatus(id, KnowledgeStatus.Active, repo, queue, db, ct)
).RequireAuthorization();

app.MapGet("/api/knowledge/{id:guid}/similar", async (
    Guid id, IKnowledgeRepository repo, ISemanticSearchService search, CancellationToken ct) =>
    await repo.GetAsync(id, ct) is { } e
        ? Results.Ok(await search.SearchAsync($"{e.Title} {e.Summary}", 6, e.Project, e.Module, ct))
        : Results.NotFound()
).RequireAuthorization();

app.MapPost("/api/knowledge/{id:guid}/reindex", async (
    Guid id, IKnowledgeRepository repo, IKnowledgeIndexingQueue queue, CancellationToken ct) =>
{
    if (await repo.GetAsync(id, ct) is null) return Results.NotFound();
    await queue.EnqueueAsync(id, ct);
    return Results.Accepted();
}).RequireAuthorization();

// ── Feedback (Task 5) — now stores username + returned in assistant answer ─────

app.MapPost("/api/knowledge/{id:guid}/feedback", async (
    Guid id, FeedbackRequest request, ClaimsPrincipal user,
    IKnowledgeRepository repo, KnowledgeDbContext db, CancellationToken ct) =>
{
    if (await repo.GetAsync(id, ct) is null) return Results.NotFound();
    db.KnowledgeFeedback.Add(new KnowledgeFeedback
    {
        KnowledgeEntryId = id,
        Helpful  = request.Helpful,
        Comment  = request.Comment,
        Username = user.FindFirstValue(ClaimTypes.NameIdentifier)
    });
    await db.SaveChangesAsync(ct);
    return Results.NoContent();
}).RequireAuthorization();

// Feedback stats per entry — useful for surfacing low-quality entries
app.MapGet("/api/knowledge/{id:guid}/feedback", async (
    Guid id, KnowledgeDbContext db, CancellationToken ct) =>
{
    var rows = await db.KnowledgeFeedback.AsNoTracking()
        .Where(x => x.KnowledgeEntryId == id).ToListAsync(ct);
    return Results.Ok(new
    {
        total    = rows.Count,
        helpful  = rows.Count(x => x.Helpful),
        comments = rows.Where(x => !string.IsNullOrWhiteSpace(x.Comment))
                       .Select(x => new { x.Username, x.Comment, x.CreatedAt })
    });
}).RequireAuthorization();

// ── Search ────────────────────────────────────────────────────────────────────

app.MapPost("/api/search/semantic", async (
    SemanticSearchRequest request, IValidator<SemanticSearchRequest> validator,
    ISemanticSearchService search, CancellationToken ct) =>
{
    var v = await validator.ValidateAsync(request, ct);
    return !v.IsValid ? Results.ValidationProblem(v.ToDictionary())
                      : Results.Ok(await search.SearchAsync(request.Query, request.Limit, request.Project, request.Module, ct));
}).RequireAuthorization();

// ── Assistant + Chat History (Tasks 4, 5) ─────────────────────────────────────

app.MapPost("/api/assistant/ask", async (
    AskRequest request, IValidator<AskRequest> validator,
    IKnowledgeAnswerService service, ClaimsPrincipal user,
    KnowledgeDbContext db, CancellationToken ct) =>
{
    var v = await validator.ValidateAsync(request, ct);
    if (!v.IsValid) return Results.ValidationProblem(v.ToDictionary());

    var username = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? "anonymous";

    // Resolve or create chat session
    InternalKnowledge.Persistence.ChatHistorySession? session = null;
    if (request.SessionId.HasValue)
        session = await db.ChatHistorySessions.FindAsync(new object[] { request.SessionId.Value }, ct);

    if (session is null)
    {
        session = new InternalKnowledge.Persistence.ChatHistorySession
        {
            Username      = username,
            FirstQuestion = request.Question[..Math.Min(request.Question.Length, 500)],
            TurnsJson     = "[]",
            TurnCount     = 0,
            StartedAt     = DateTimeOffset.UtcNow,
            LastActivityAt = DateTimeOffset.UtcNow
        };
        db.ChatHistorySessions.Add(session);
        await db.SaveChangesAsync(ct); // get the ID
    }

    // Build request with session context
    var requestWithUser = request with { Username = username, SessionId = session.Id };
    var answer = await service.AskAsync(requestWithUser, ct);

    // Append turns to session and update timestamps
    var turns = JsonSerializer.Deserialize<List<ChatTurnRecord>>(session.TurnsJson) ?? [];
    turns.Add(new("user",      request.Question));
    turns.Add(new("assistant", answer.Answer));
    session.TurnsJson      = JsonSerializer.Serialize(turns);
    session.TurnCount      = turns.Count;
    session.LastActivityAt = DateTimeOffset.UtcNow;

    // Legacy: store in QuestionHistory
    db.QuestionHistory.Add(new QuestionHistory
    {
        Question = request.Question, Answer = answer.Answer, Grounded = answer.Grounded
    });
    await db.SaveChangesAsync(ct);

    // Prune: keep only last 10 sessions per user
    var oldSessions = await db.ChatHistorySessions
        .Where(x => x.Username == username)
        .OrderByDescending(x => x.LastActivityAt)
        .Skip(10)
        .ToListAsync(ct);
    if (oldSessions.Count > 0)
    {
        db.ChatHistorySessions.RemoveRange(oldSessions);
        await db.SaveChangesAsync(ct);
    }

    return Results.Ok(answer with { SessionId = session.Id });
}).RequireAuthorization();

app.MapGet("/api/chat/history", async (
    ClaimsPrincipal user, KnowledgeDbContext db, CancellationToken ct) =>
{
    var username = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var sessions = await db.ChatHistorySessions.AsNoTracking()
        .Where(x => x.Username == username)
        .OrderByDescending(x => x.LastActivityAt)
        .Take(10)
        .Select(x => new
        {
            sessionId      = x.Id,
            firstQuestion  = x.FirstQuestion,
            startedAt      = x.StartedAt,
            lastActivityAt = x.LastActivityAt,
            turnCount      = x.TurnCount
        })
        .ToListAsync(ct);
    return Results.Ok(sessions);
}).RequireAuthorization();

app.MapGet("/api/chat/history/{sessionId:guid}", async (
    Guid sessionId, ClaimsPrincipal user, KnowledgeDbContext db, CancellationToken ct) =>
{
    var username = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var session = await db.ChatHistorySessions.AsNoTracking()
        .SingleOrDefaultAsync(x => x.Id == sessionId && x.Username == username, ct);
    if (session is null) return Results.NotFound();
    var turns = JsonSerializer.Deserialize<List<ChatTurnRecord>>(session.TurnsJson) ?? [];
    return Results.Ok(new { session.Id, session.StartedAt, turns });
}).RequireAuthorization();

// ── Open Questions (Task 3) ───────────────────────────────────────────────────

app.MapPost("/api/questions", async (
    RaiseQuestionRequest request, ClaimsPrincipal user,
    KnowledgeDbContext db, CancellationToken ct) =>
{
    var username = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? "anonymous";
    var question = new OpenQuestion
    {
        Id               = Guid.NewGuid(),
        Text             = request.Text,
        RaisedBy         = username,
        Audience         = request.Audience,
        TargetUsernames  = request.TargetUsernames?.ToList() ?? [],
        Project          = request.Project,
        IsResolved       = false,
        RaisedAt         = DateTimeOffset.UtcNow
    };
    db.OpenQuestions.Add(question);
    await db.SaveChangesAsync(ct);
    return Results.Created($"/api/questions/{question.Id}", ToDto(question));
}).RequireAuthorization();

app.MapGet("/api/questions", async (
    ClaimsPrincipal user, KnowledgeDbContext db,
    bool? resolved, string? project, CancellationToken ct) =>
{
    var username = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var q = db.OpenQuestions.AsNoTracking().Include(x => x.Answers)
        .Where(x =>
            // All-audience questions visible to everyone; specific ones only to target
            x.Audience == QuestionAudience.All || x.TargetUsernames.Contains(username) || x.RaisedBy == username);
    if (resolved.HasValue) q = q.Where(x => x.IsResolved == resolved.Value);
    if (!string.IsNullOrWhiteSpace(project)) q = q.Where(x => x.Project == project);
    var list = await q.OrderByDescending(x => x.RaisedAt).ToListAsync(ct);
    return Results.Ok(list.Select(ToDto));
}).RequireAuthorization();

app.MapGet("/api/questions/{id:guid}", async (
    Guid id, ClaimsPrincipal user, KnowledgeDbContext db, CancellationToken ct) =>
{
    var username = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var q = await db.OpenQuestions.AsNoTracking().Include(x => x.Answers)
        .SingleOrDefaultAsync(x => x.Id == id, ct);
    if (q is null) return Results.NotFound();
    if (q.Audience == QuestionAudience.Specific && !q.TargetUsernames.Contains(username) && q.RaisedBy != username)
        return Results.Forbid();
    return Results.Ok(ToDto(q));
}).RequireAuthorization();

app.MapPost("/api/questions/{id:guid}/answer", async (
    Guid id, QuestionAnswerRequest request, ClaimsPrincipal user,
    KnowledgeDbContext db, CancellationToken ct) =>
{
    var username = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? "anonymous";
    var question = await db.OpenQuestions.Include(x => x.Answers)
        .SingleOrDefaultAsync(x => x.Id == id, ct);
    if (question is null) return Results.NotFound();

    // Validate optional linked entry exists
    if (request.KnowledgeEntryId.HasValue)
    {
        var exists = await db.KnowledgeEntries.AnyAsync(x => x.Id == request.KnowledgeEntryId, ct);
        if (!exists) return Results.BadRequest(new { message = "Linked knowledge entry not found." });
    }

    var answer = new QuestionAnswer
    {
        Id               = Guid.NewGuid(),
        QuestionId       = id,
        Answer           = request.Answer,
        AnsweredBy       = username,
        KnowledgeEntryId = request.KnowledgeEntryId,
        AnsweredAt       = DateTimeOffset.UtcNow
    };
    question.Answers.Add(answer);
    // Auto-resolve when first answer links a knowledge entry
    if (request.KnowledgeEntryId.HasValue) question.IsResolved = true;
    await db.SaveChangesAsync(ct);
    return Results.Created($"/api/questions/{id}", ToDto(question));
}).RequireAuthorization();

app.MapPost("/api/questions/{id:guid}/resolve", async (
    Guid id, KnowledgeDbContext db, CancellationToken ct) =>
{
    var q = await db.OpenQuestions.FindAsync([id], ct);
    if (q is null) return Results.NotFound();
    q.IsResolved = true;
    await db.SaveChangesAsync(ct);
    return Results.NoContent();
}).RequireAuthorization();

// ── Document upload capture ───────────────────────────────────────────────────
// POST /api/capture/document  (multipart/form-data)
// Fields: file (required), entryType, project, module
//
// Flow:
//   1. Extract text chunks from the uploaded document
//   2. If ≤1 chunk or total chars ≤ MaxSingleAnalysis → analyse as one note
//   3. If multiple chunks → analyse each chunk independently in parallel
//      (capped at MaxParallelChunks to avoid rate-limiting)
//   4. Merge all AnalysisResults into a single response — the frontend
//      renders them all in the existing ReviewPanel

app.MapPost("/api/capture/document", async (
    HttpRequest httpRequest,
    DocumentTextExtractor extractor,
    IKnowledgeAnalysisService analysis,
    CancellationToken ct) =>
{
    if (!httpRequest.HasFormContentType)
        return Results.BadRequest(new { message = "Request must be multipart/form-data." });

    var form = await httpRequest.ReadFormAsync(ct);
    var file = form.Files.GetFile("file");
    if (file is null)
        return Results.BadRequest(new { message = "No file uploaded. Include a 'file' field." });

    // Validate extension
    var ext = Path.GetExtension(file.FileName);
    if (!DocumentTextExtractor.SupportedExtensions.Contains(ext))
        return Results.BadRequest(new
        {
            message = $"Unsupported file type '{ext}'. Allowed: {string.Join(", ", DocumentTextExtractor.SupportedExtensions)}"
        });

    // Validate size — 20 MB hard limit
    const long MaxBytes = 20 * 1024 * 1024;
    if (file.Length > MaxBytes)
        return Results.BadRequest(new { message = "File exceeds the 20 MB limit." });

    // Parse optional fields
    var entryType = Enum.TryParse<KnowledgeEntryType>(form["entryType"].FirstOrDefault(), out var et) ? et : KnowledgeEntryType.Knowledge;
    var project   = form["project"].FirstOrDefault()?.Trim() is { Length: > 0 } p ? p : null;
    var module    = form["module"].FirstOrDefault()?.Trim()  is { Length: > 0 } m ? m : null;

    // Extract text chunks
    List<DocumentChunk> chunks;
    try
    {
        await using var stream = file.OpenReadStream();
        chunks = extractor.Extract(stream, file.FileName).ToList();
    }
    catch (NotSupportedException ex)
    {
        return Results.BadRequest(new { message = ex.Message });
    }
    catch (Exception ex)
    {
        return Results.Problem($"Could not read document: {ex.Message}");
    }

    if (chunks.Count == 0 || chunks.Sum(c => c.Text.Length) < 40)
        return Results.BadRequest(new { message = "The document appears to be empty or contains no readable text." });

    // Decide single-pass vs multi-chunk analysis
    const int MaxSingleAnalysis  = 12_000;   // chars
    const int MaxParallelChunks  = 6;

    AnalysisResult combined;

    if (chunks.Count == 1 || chunks.Sum(c => c.Text.Length) <= MaxSingleAnalysis)
    {
        // Merge everything and analyse once
        var merged = string.Join("\n\n", chunks.Select(c => c.Text));
        combined   = await analysis.AnalyzeAsync(
            new AnalyzeKnowledgeRequest(merged, entryType, project, module), ct);
    }
    else
    {
        // Analyse each chunk in parallel, capped at MaxParallelChunks
        var toAnalyse  = chunks.Take(MaxParallelChunks).ToList();
        var semaphore  = new SemaphoreSlim(3); // max 3 concurrent LLM calls
        var tasks      = toAnalyse.Select(async chunk =>
        {
            await semaphore.WaitAsync(ct);
            try
            {
                return await analysis.AnalyzeAsync(
                    new AnalyzeKnowledgeRequest(chunk.Text, entryType, project, module), ct);
            }
            finally { semaphore.Release(); }
        });

        var results = await Task.WhenAll(tasks);

        // Merge: all suggested entries from every chunk, deduplicated by title similarity
        var allEntries = results
            .SelectMany(r => r.SuggestedEntries.Any() ? r.SuggestedEntries : [r.Entry])
            .GroupBy(e => e.Title, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .ToList();

        var allDuplicates = results
            .SelectMany(r => r.PotentialDuplicates)
            .GroupBy(d => d.KnowledgeEntryId)
            .Select(g => g.OrderByDescending(x => x.Similarity).First())
            .ToList();

        var allMissing   = results.SelectMany(r => r.MissingInformation).Distinct().ToList();
        var allQuestions = results.SelectMany(r => r.SuggestedQuestions).Distinct().ToList();

        combined = new AnalysisResult(
            Entry:              allEntries.First(),
            SuggestedEntries:   allEntries,
            MissingInformation: allMissing,
            SuggestedQuestions: allQuestions,
            PotentialDuplicates: allDuplicates);
    }

    return Results.Ok(new
    {
        fileName       = file.FileName,
        chunksExtracted = chunks.Count,
        chunksAnalysed  = Math.Min(chunks.Count, MaxParallelChunks),
        result          = combined
    });
}).RequireAuthorization().DisableAntiforgery();
// Two-step: first POST evaluates completeness; if ReadyToCommit=false the client
// must send a follow-up note; once ReadyToCommit=true the client calls analyze.

// ── Interactive Capture (completeness check) ──────────────────────────────────

app.MapPost("/api/capture/evaluate", async (
    CaptureEvaluateRequest request,
    ICaptureCompletenessService completeness,
    CancellationToken ct) =>
{
    var sessionId = request.SessionId ?? Guid.NewGuid();
    var session = await completeness.EvaluateAsync(
        sessionId, request.EntryType, request.CurrentInput,
        request.Project, request.Module, ct);
    return Results.Ok(session);
}).RequireAuthorization();

// ── Admin + Health ────────────────────────────────────────────────────────────

app.MapPost("/api/admin/reindex", async (
    KnowledgeDbContext db, IKnowledgeIndexingQueue queue, CancellationToken ct) =>
{
    var ids = await db.KnowledgeEntries.AsNoTracking()
        .Where(x => x.Status != KnowledgeStatus.Archived)
        .Select(x => x.Id).Take(100).ToListAsync(ct);
    foreach (var id in ids) await queue.EnqueueAsync(id, ct);
    return Results.Ok(new { queued = ids.Count });
}).RequireAuthorization();

app.MapGet("/api/admin/metrics", async (KnowledgeDbContext db, CancellationToken ct) =>
{
    var jobCounts = await db.IndexingJobs.AsNoTracking()
        .GroupBy(x => x.Status)
        .Select(g => new { Status = g.Key.ToString(), Count = g.Count() })
        .ToListAsync(ct);
    return Results.Ok(new { jobs = jobCounts, memory = KnowledgeMetrics.Snapshot() });
}).RequireAuthorization();

app.MapGet("/health/live",  () => Results.Ok(new { status = "live"  })).AllowAnonymous();
app.MapGet("/health/ready", async (KnowledgeDbContext db, CancellationToken ct) =>
{
    var ok = await db.Database.CanConnectAsync(ct);
    return ok ? Results.Ok(new { status = "ready" }) : Results.Problem("Database unavailable");
}).AllowAnonymous();
app.MapGet("/health", () => Results.Ok(new { status = "healthy" })).AllowAnonymous();

app.Run();

// ── Helper functions ──────────────────────────────────────────────────────────

static async Task<KnowledgeSearchResult?> FindDuplicate(
    KnowledgeEntry entry, ISemanticSearchService search,
    double threshold, CancellationToken ct)
{
    var results = await search.SearchAsync(
        $"{entry.Title} {entry.Summary}", 3, entry.Project, entry.Module, ct);
    return results.FirstOrDefault(x => x.Similarity >= threshold && x.KnowledgeEntryId != entry.Id);
}

static IResult DuplicateConflict(KnowledgeSearchResult dup) =>
    Results.Conflict(new
    {
        code    = "potential_duplicate",
        message = "A similar entry already exists.",
        match   = dup
    });

static async Task<IResult> SetStatus(
    Guid id, KnowledgeStatus status, IKnowledgeRepository repo,
    IKnowledgeIndexingQueue queue, KnowledgeDbContext db, CancellationToken ct)
{
    var entry = await repo.GetAsync(id, ct);
    if (entry is null) return Results.NotFound();
    entry.Status    = status;
    entry.UpdatedAt = DateTimeOffset.UtcNow;
    await using var tx = await db.Database.BeginTransactionAsync(ct);
    await repo.SaveAsync(entry, ct);
    await db.AddRevisionAsync(entry, ct);
    if (status != KnowledgeStatus.Archived) await queue.EnqueueAsync(id, ct);
    await tx.CommitAsync(ct);
    return Results.Ok(entry);
}

static OpenQuestionDto ToDto(OpenQuestion q) => new(
    q.Id, q.Text, q.RaisedBy, q.Audience, q.TargetUsernames,
    q.Project, q.RaisedAt, q.IsResolved,
    q.Answers.Select(a => new QuestionAnswerDto(
        a.Id, a.Answer, a.AnsweredBy, a.KnowledgeEntryId,
        null /* title loaded on demand */, a.AnsweredAt)).ToList());

// ── Types / records used only in Program.cs ───────────────────────────────────

record LoginRequest(string Username, string Password);
record FeedbackRequest(bool Helpful, string? Comment);
public record SemanticSearchRequest(string Query, int Limit = 8, string? Project = null, string? Module = null);
public record CaptureEvaluateRequest(KnowledgeEntryType EntryType, string CurrentInput,
    Guid? SessionId = null, string? Project = null, string? Module = null);
record ChatTurnRecord(string Role, string Content);

// Query parameters for GET /api/knowledge
class KnowledgeListParameters
{
    public string? Query { get; set; }
    public KnowledgeEntryType? EntryType { get; set; }
    public string? Project { get; set; }
    public string? Module { get; set; }
    public KnowledgeSeverity? Severity { get; set; }
    public KnowledgeStatus? Status { get; set; }
    public string? Technology { get; set; }
    public string? Tag { get; set; }
    public string? Sort { get; set; }
    public int? Page { get; set; }
    public int? PageSize { get; set; }
    public bool? IncludeArchived { get; set; }
}

// ── IResultExtensions — sets the HttpOnly cookie and returns the token ─────────
static class ResultExtensions
{
    public static IResult LoginOk(
        string token, CookieOptions cookieOpts, object userInfo)
        => new LoginResult(token, cookieOpts, userInfo);

    private sealed class LoginResult(string token, CookieOptions cookieOpts, object userInfo)
        : IResult
    {
        public Task ExecuteAsync(HttpContext httpContext)
        {
            httpContext.Response.Cookies.Append("kd_token", token, cookieOpts);
            httpContext.Response.ContentType = "application/json";
            httpContext.Response.StatusCode  = 200;
            return httpContext.Response.WriteAsJsonAsync(new { token, user = userInfo });
        }
    }
}
