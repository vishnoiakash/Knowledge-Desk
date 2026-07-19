using InternalKnowledge.Domain;
using Microsoft.EntityFrameworkCore;
using Pgvector;

namespace InternalKnowledge.Persistence;

public sealed class KnowledgeDbContext(DbContextOptions<KnowledgeDbContext> options) : DbContext(options)
{
    public DbSet<KnowledgeEntry> KnowledgeEntries => Set<KnowledgeEntry>();
    public DbSet<KnowledgeSearchIndex> KnowledgeSearchIndexes => Set<KnowledgeSearchIndex>();
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
        });
        modelBuilder.Entity<KnowledgeSearchIndex>(e =>
        {
            e.ToTable("KnowledgeSearchIndex"); e.HasKey(x => x.Id); e.HasIndex(x => x.KnowledgeEntryId).IsUnique();
            e.Property(x => x.Embedding).HasColumnType("vector(1536)"); e.Property(x => x.Status).HasConversion<string>();
            e.HasOne<KnowledgeEntry>().WithOne().HasForeignKey<KnowledgeSearchIndex>(x => x.KnowledgeEntryId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<KnowledgeRevision>().ToTable("KnowledgeRevisions");
        modelBuilder.Entity<KnowledgeFeedback>().ToTable("KnowledgeFeedback");
        modelBuilder.Entity<QuestionHistory>().ToTable("QuestionHistory");
    }
}

public enum IndexStatus { Pending, Indexed, Failed, ReindexRequired }
public sealed class KnowledgeSearchIndex { public Guid Id { get; set; }=Guid.NewGuid(); public Guid KnowledgeEntryId { get; set; } public string SearchableContent { get; set; }=""; public Vector? Embedding { get; set; } public string EmbeddingModel { get; set; }=""; public string EmbeddingVersion { get; set; }="v1"; public IndexStatus Status { get; set; }=IndexStatus.Pending; public string? LastError { get; set; } public DateTimeOffset CreatedAt { get; set; }=DateTimeOffset.UtcNow; public DateTimeOffset UpdatedAt { get; set; }=DateTimeOffset.UtcNow; }
public sealed class KnowledgeRevision { public Guid Id { get; set; }=Guid.NewGuid(); public Guid KnowledgeEntryId { get; set; } public int RevisionNumber { get; set; } public string SnapshotJson { get; set; }=""; public DateTimeOffset CreatedAt { get; set; }=DateTimeOffset.UtcNow; }
public sealed class KnowledgeFeedback { public Guid Id { get; set; }=Guid.NewGuid(); public Guid KnowledgeEntryId { get; set; } public bool Helpful { get; set; } public string? Comment { get; set; } public DateTimeOffset CreatedAt { get; set; }=DateTimeOffset.UtcNow; }
public sealed class QuestionHistory { public Guid Id { get; set; }=Guid.NewGuid(); public string Question { get; set; }=""; public string Answer { get; set; }=""; public bool Grounded { get; set; } public DateTimeOffset CreatedAt { get; set; }=DateTimeOffset.UtcNow; }
