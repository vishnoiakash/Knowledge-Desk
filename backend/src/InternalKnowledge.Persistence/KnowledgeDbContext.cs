using InternalKnowledge.Domain;
using Microsoft.EntityFrameworkCore;
using Pgvector;

namespace InternalKnowledge.Persistence;

public sealed class KnowledgeDbContext(DbContextOptions<KnowledgeDbContext> options) : DbContext(options)
{
    public DbSet<KnowledgeEntry> KnowledgeEntries => Set<KnowledgeEntry>();
    public DbSet<KnowledgeSearchChunk> KnowledgeSearchChunks => Set<KnowledgeSearchChunk>();
    public DbSet<IndexingJob> IndexingJobs => Set<IndexingJob>();
    public DbSet<KnowledgeRevision> KnowledgeRevisions => Set<KnowledgeRevision>();
    public DbSet<KnowledgeFeedback> KnowledgeFeedback => Set<KnowledgeFeedback>();
    public DbSet<QuestionHistory> QuestionHistory => Set<QuestionHistory>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("vector");
        modelBuilder.Entity<KnowledgeEntry>(e =>
        {
            e.ToTable("KnowledgeEntries"); e.HasKey(x => x.Id);
            e.Property(x => x.EntryType).HasConversion<string>(); e.Property(x => x.Status).HasConversion<string>(); e.Property(x => x.Severity).HasConversion<string>();
            e.Property(x => x.Title).HasMaxLength(200).IsRequired(); e.Property(x => x.Summary).HasMaxLength(2000).IsRequired();
            e.Property(x => x.Tags).HasColumnType("text[]"); e.Property(x => x.Technologies).HasColumnType("text[]");
            e.HasIndex(x=>x.Project); e.HasIndex(x=>x.Module); e.HasIndex(x=>x.Status); e.HasIndex(x=>x.EntryType);
        });
        modelBuilder.Entity<KnowledgeSearchChunk>(e =>
        {
            e.ToTable("KnowledgeSearchChunks"); e.HasKey(x => x.Id); e.HasIndex(x => new{x.KnowledgeEntryId,x.ChunkOrder}).IsUnique();
            e.Property(x => x.Embedding).HasColumnType("vector(1536)"); e.Property(x => x.Status).HasConversion<string>(); e.Property(x=>x.ChunkType).HasMaxLength(40);
            e.HasOne<KnowledgeEntry>().WithMany().HasForeignKey(x => x.KnowledgeEntryId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<IndexingJob>(e=>{e.ToTable("IndexingJobs");e.HasKey(x=>x.Id);e.Property(x=>x.Status).HasConversion<string>();e.HasIndex(x=>new{x.Status,x.NextAttemptAt});e.HasIndex(x=>x.KnowledgeEntryId);e.HasIndex(x=>x.KnowledgeEntryId).IsUnique().HasFilter("\"Status\" IN ('Pending','Processing')").HasDatabaseName("UX_IndexingJobs_ActiveEntry");});
        modelBuilder.Entity<KnowledgeRevision>(e=>{e.ToTable("KnowledgeRevisions");e.HasIndex(x=>new{x.KnowledgeEntryId,x.RevisionNumber}).IsUnique();});
        modelBuilder.Entity<KnowledgeFeedback>().ToTable("KnowledgeFeedback");
        modelBuilder.Entity<QuestionHistory>().ToTable("QuestionHistory");
    }
}

public enum IndexStatus { Pending, Indexed, Failed, ReindexRequired }
public enum IndexingJobStatus { Pending, Processing, Completed, Failed }
public sealed class KnowledgeSearchChunk { public Guid Id { get; set; }=Guid.NewGuid(); public Guid KnowledgeEntryId { get; set; } public int ChunkOrder { get; set; } public string ChunkType { get; set; }="General"; public string Content { get; set; }=""; public Vector? Embedding { get; set; } public string EmbeddingModel { get; set; }=""; public string EmbeddingVersion { get; set; }="v2"; public IndexStatus Status { get; set; }=IndexStatus.Pending; public string? LastError { get; set; } public DateTimeOffset CreatedAt { get; set; }=DateTimeOffset.UtcNow; public DateTimeOffset UpdatedAt { get; set; }=DateTimeOffset.UtcNow; }
public sealed class IndexingJob { public Guid Id { get; set; }=Guid.NewGuid(); public Guid KnowledgeEntryId { get; set; } public IndexingJobStatus Status { get; set; }=IndexingJobStatus.Pending; public int Attempts { get; set; } public int MaxAttempts { get; set; }=5; public DateTimeOffset NextAttemptAt { get; set; }=DateTimeOffset.UtcNow; public DateTimeOffset? LeaseExpiresAt { get; set; } public string? LastError { get; set; } public DateTimeOffset CreatedAt { get; set; }=DateTimeOffset.UtcNow; public DateTimeOffset UpdatedAt { get; set; }=DateTimeOffset.UtcNow; }
public sealed class KnowledgeRevision { public Guid Id { get; set; }=Guid.NewGuid(); public Guid KnowledgeEntryId { get; set; } public int RevisionNumber { get; set; } public string SnapshotJson { get; set; }=""; public DateTimeOffset CreatedAt { get; set; }=DateTimeOffset.UtcNow; }
public sealed class KnowledgeFeedback { public Guid Id { get; set; }=Guid.NewGuid(); public Guid KnowledgeEntryId { get; set; } public bool Helpful { get; set; } public string? Comment { get; set; } public DateTimeOffset CreatedAt { get; set; }=DateTimeOffset.UtcNow; }
public sealed class QuestionHistory { public Guid Id { get; set; }=Guid.NewGuid(); public string Question { get; set; }=""; public string Answer { get; set; }=""; public bool Grounded { get; set; } public DateTimeOffset CreatedAt { get; set; }=DateTimeOffset.UtcNow; }
