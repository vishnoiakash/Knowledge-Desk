using InternalKnowledge.Application;
using InternalKnowledge.Domain;
using Microsoft.EntityFrameworkCore;
using Pgvector;

namespace InternalKnowledge.Persistence;

public sealed class KnowledgeDbContext(DbContextOptions<KnowledgeDbContext> options) : DbContext(options)
{
    public DbSet<KnowledgeEntry>       KnowledgeEntries      => Set<KnowledgeEntry>();
    public DbSet<KnowledgeSearchChunk> KnowledgeSearchChunks => Set<KnowledgeSearchChunk>();
    public DbSet<IndexingJob>          IndexingJobs          => Set<IndexingJob>();
    public DbSet<KnowledgeRevision>    KnowledgeRevisions    => Set<KnowledgeRevision>();
    public DbSet<KnowledgeFeedback>    KnowledgeFeedback     => Set<KnowledgeFeedback>();
    public DbSet<QuestionHistory>      QuestionHistory       => Set<QuestionHistory>();
    public DbSet<KnowledgeUser>        Users                 => Set<KnowledgeUser>();
    public DbSet<OpenQuestion>         OpenQuestions         => Set<OpenQuestion>();
    public DbSet<QuestionAnswer>       QuestionAnswers       => Set<QuestionAnswer>();
    public DbSet<ChatHistorySession>   ChatHistorySessions   => Set<ChatHistorySession>();

    protected override void OnModelCreating(ModelBuilder m)
    {
        m.HasPostgresExtension("vector");

        m.Entity<KnowledgeEntry>(e =>
        {
            e.ToTable("KnowledgeEntries"); e.HasKey(x => x.Id);
            e.Property(x => x.EntryType).HasConversion<string>();
            e.Property(x => x.Status).HasConversion<string>();
            e.Property(x => x.Severity).HasConversion<string>();
            e.Property(x => x.Title).HasMaxLength(200).IsRequired();
            e.Property(x => x.Summary).HasMaxLength(2000).IsRequired();
            e.Property(x => x.Tags).HasColumnType("text[]");
            e.Property(x => x.Technologies).HasColumnType("text[]");
            e.HasIndex(x => x.Project); e.HasIndex(x => x.Module);
            e.HasIndex(x => x.Status);  e.HasIndex(x => x.EntryType);
        });

        m.Entity<KnowledgeSearchChunk>(e =>
        {
            e.ToTable("KnowledgeSearchChunks"); e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.KnowledgeEntryId, x.ChunkOrder }).IsUnique();
            e.Property(x => x.Embedding).HasColumnType("vector(1536)");
            e.Property(x => x.Status).HasConversion<string>();
            e.Property(x => x.ChunkType).HasMaxLength(40);
            e.HasOne<KnowledgeEntry>().WithMany()
             .HasForeignKey(x => x.KnowledgeEntryId).OnDelete(DeleteBehavior.Cascade);
        });

        m.Entity<IndexingJob>(e =>
        {
            e.ToTable("IndexingJobs"); e.HasKey(x => x.Id);
            e.Property(x => x.Status).HasConversion<string>();
            e.HasIndex(x => new { x.Status, x.NextAttemptAt });
            e.HasIndex(x => x.KnowledgeEntryId);
            e.HasIndex(x => x.KnowledgeEntryId).IsUnique()
             .HasFilter("\"Status\" IN ('Pending','Processing')")
             .HasDatabaseName("UX_IndexingJobs_ActiveEntry");
        });

        m.Entity<KnowledgeRevision>(e =>
        {
            e.ToTable("KnowledgeRevisions");
            e.HasIndex(x => new { x.KnowledgeEntryId, x.RevisionNumber }).IsUnique();
        });

        m.Entity<KnowledgeFeedback>(e =>
        {
            e.ToTable("KnowledgeFeedback"); e.HasKey(x => x.Id);
        });

        m.Entity<QuestionHistory>().ToTable("QuestionHistory");

        m.Entity<KnowledgeUser>(e =>
        {
            e.ToTable("Users"); e.HasKey(x => x.Username);
            e.Property(x => x.Username).HasMaxLength(120);
            e.Property(x => x.DisplayName).HasMaxLength(200);
            e.Property(x => x.Email).HasMaxLength(250);
        });

        m.Entity<OpenQuestion>(e =>
        {
            e.ToTable("OpenQuestions"); e.HasKey(x => x.Id);
            e.Property(x => x.Audience).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.TargetUsernames).HasColumnType("text[]");
            e.HasMany(x => x.Answers).WithOne().HasForeignKey(x => x.QuestionId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.RaisedBy); e.HasIndex(x => x.IsResolved);
        });

        m.Entity<QuestionAnswer>(e =>
        {
            e.ToTable("QuestionAnswers"); e.HasKey(x => x.Id);
            e.HasIndex(x => x.QuestionId);
            e.HasOne<KnowledgeEntry>().WithMany()
             .HasForeignKey(x => x.KnowledgeEntryId)
             .OnDelete(DeleteBehavior.SetNull).IsRequired(false);
        });

        m.Entity<ChatHistorySession>(e =>
        {
            e.ToTable("ChatHistorySessions"); e.HasKey(x => x.Id);
            e.Property(x => x.Username).HasMaxLength(120);
            e.Property(x => x.FirstQuestion).HasMaxLength(500);
            e.HasIndex(x => new { x.Username, x.LastActivityAt });
        });
    }
}

// ── Enums ─────────────────────────────────────────────────────────────────────
public enum IndexStatus      { Pending, Indexed, Failed, ReindexRequired }
public enum IndexingJobStatus { Pending, Processing, Completed, Failed }

// ── Entity classes ────────────────────────────────────────────────────────────
public sealed class KnowledgeSearchChunk
{
    public Guid   Id               { get; set; } = Guid.NewGuid();
    public Guid   KnowledgeEntryId { get; set; }
    public int    ChunkOrder       { get; set; }
    public string ChunkType        { get; set; } = "General";
    public string Content          { get; set; } = "";
    public Vector? Embedding       { get; set; }
    public string EmbeddingModel   { get; set; } = "";
    public string EmbeddingVersion { get; set; } = "v2";
    public IndexStatus Status      { get; set; } = IndexStatus.Pending;
    public string? LastError       { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class IndexingJob
{
    public Guid   Id               { get; set; } = Guid.NewGuid();
    public Guid   KnowledgeEntryId { get; set; }
    public IndexingJobStatus Status { get; set; } = IndexingJobStatus.Pending;
    public int    Attempts         { get; set; }
    public int    MaxAttempts      { get; set; } = 5;
    public DateTimeOffset NextAttemptAt  { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LeaseExpiresAt { get; set; }
    public string? LastError       { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class KnowledgeRevision
{
    public Guid   Id               { get; set; } = Guid.NewGuid();
    public Guid   KnowledgeEntryId { get; set; }
    public int    RevisionNumber   { get; set; }
    public string SnapshotJson     { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class KnowledgeFeedback
{
    public Guid   Id               { get; set; } = Guid.NewGuid();
    public Guid   KnowledgeEntryId { get; set; }
    public bool   Helpful          { get; set; }
    public string? Comment         { get; set; }
    /// <summary>Username who submitted the feedback.</summary>
    public string? Username        { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class QuestionHistory
{
    public Guid   Id       { get; set; } = Guid.NewGuid();
    public string Question { get; set; } = "";
    public string Answer   { get; set; } = "";
    public bool   Grounded { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>LDAP allow-list — only rows here can authenticate.</summary>
public sealed class KnowledgeUser
{
    public string  Username     { get; set; } = "";
    public string? DisplayName  { get; set; }
    public string? Email        { get; set; }
    public bool    IsActive     { get; set; } = true;
    public DateTimeOffset CreatedAt   { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastLoginAt { get; set; }
}

public sealed class OpenQuestion
{
    public Guid   Id               { get; set; } = Guid.NewGuid();
    public string Text             { get; set; } = "";
    public string RaisedBy         { get; set; } = "";
    public QuestionAudience Audience { get; set; }
    public List<string> TargetUsernames { get; set; } = [];
    public string? Project         { get; set; }
    public bool    IsResolved      { get; set; }
    public DateTimeOffset RaisedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<QuestionAnswer> Answers { get; set; } = [];
}

public sealed class QuestionAnswer
{
    public Guid   Id               { get; set; } = Guid.NewGuid();
    public Guid   QuestionId       { get; set; }
    public string Answer           { get; set; } = "";
    public string AnsweredBy       { get; set; } = "";
    public Guid?  KnowledgeEntryId { get; set; }
    public DateTimeOffset AnsweredAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// One conversation session per user. Turns serialised as JSON in TurnsJson.
/// The API prunes to the last 10 sessions per user on every write.
/// </summary>
public sealed class ChatHistorySession
{
    public Guid   Id             { get; set; } = Guid.NewGuid();
    public string Username       { get; set; } = "";
    public string FirstQuestion  { get; set; } = "";
    public string TurnsJson      { get; set; } = "[]";
    public int    TurnCount      { get; set; }
    public DateTimeOffset StartedAt      { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset LastActivityAt { get; set; } = DateTimeOffset.UtcNow;
}
