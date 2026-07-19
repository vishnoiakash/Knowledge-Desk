using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Pgvector;

#nullable disable

namespace InternalKnowledge.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ChunkIndexingAndJobs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "IndexingJobs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    KnowledgeEntryId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    MaxAttempts = table.Column<int>(type: "integer", nullable: false),
                    NextAttemptAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LastError = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IndexingJobs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "KnowledgeSearchChunks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    KnowledgeEntryId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChunkOrder = table.Column<int>(type: "integer", nullable: false),
                    ChunkType = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Content = table.Column<string>(type: "text", nullable: false),
                    Embedding = table.Column<Vector>(type: "vector(1536)", nullable: true),
                    EmbeddingModel = table.Column<string>(type: "text", nullable: false),
                    EmbeddingVersion = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    LastError = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_KnowledgeSearchChunks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_KnowledgeSearchChunks_KnowledgeEntries_KnowledgeEntryId",
                        column: x => x.KnowledgeEntryId,
                        principalTable: "KnowledgeEntries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_KnowledgeEntries_EntryType",
                table: "KnowledgeEntries",
                column: "EntryType");

            migrationBuilder.CreateIndex(
                name: "IX_KnowledgeEntries_Module",
                table: "KnowledgeEntries",
                column: "Module");

            migrationBuilder.CreateIndex(
                name: "IX_KnowledgeEntries_Project",
                table: "KnowledgeEntries",
                column: "Project");

            migrationBuilder.CreateIndex(
                name: "IX_KnowledgeEntries_Status",
                table: "KnowledgeEntries",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_IndexingJobs_KnowledgeEntryId",
                table: "IndexingJobs",
                column: "KnowledgeEntryId");

            migrationBuilder.CreateIndex(
                name: "IX_IndexingJobs_Status_NextAttemptAt",
                table: "IndexingJobs",
                columns: new[] { "Status", "NextAttemptAt" });

            migrationBuilder.CreateIndex(
                name: "IX_KnowledgeSearchChunks_KnowledgeEntryId_ChunkOrder",
                table: "KnowledgeSearchChunks",
                columns: new[] { "KnowledgeEntryId", "ChunkOrder" },
                unique: true);

            migrationBuilder.Sql("""
                INSERT INTO "KnowledgeSearchChunks" ("Id", "KnowledgeEntryId", "ChunkOrder", "ChunkType", "Content", "Embedding", "EmbeddingModel", "EmbeddingVersion", "Status", "LastError", "CreatedAt", "UpdatedAt")
                SELECT "Id", "KnowledgeEntryId", 0, 'LegacyOverview', "SearchableContent", "Embedding", "EmbeddingModel", "EmbeddingVersion", 'ReindexRequired', "LastError", "CreatedAt", "UpdatedAt" FROM "KnowledgeSearchIndex";
                INSERT INTO "IndexingJobs" ("Id", "KnowledgeEntryId", "Status", "Attempts", "MaxAttempts", "NextAttemptAt", "CreatedAt", "UpdatedAt")
                SELECT gen_random_uuid(), "Id", 'Pending', 0, 5, NOW(), NOW(), NOW() FROM "KnowledgeEntries";
                CREATE INDEX IF NOT EXISTS "IX_KnowledgeSearchChunks_Embedding" ON "KnowledgeSearchChunks" USING hnsw ("Embedding" vector_cosine_ops);
                """);
            migrationBuilder.DropTable(name: "KnowledgeSearchIndex");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "IndexingJobs");

            migrationBuilder.DropTable(
                name: "KnowledgeSearchChunks");

            migrationBuilder.DropIndex(
                name: "IX_KnowledgeEntries_EntryType",
                table: "KnowledgeEntries");

            migrationBuilder.DropIndex(
                name: "IX_KnowledgeEntries_Module",
                table: "KnowledgeEntries");

            migrationBuilder.DropIndex(
                name: "IX_KnowledgeEntries_Project",
                table: "KnowledgeEntries");

            migrationBuilder.DropIndex(
                name: "IX_KnowledgeEntries_Status",
                table: "KnowledgeEntries");

            migrationBuilder.CreateTable(
                name: "KnowledgeSearchIndex",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Embedding = table.Column<Vector>(type: "vector(1536)", nullable: true),
                    EmbeddingModel = table.Column<string>(type: "text", nullable: false),
                    EmbeddingVersion = table.Column<string>(type: "text", nullable: false),
                    KnowledgeEntryId = table.Column<Guid>(type: "uuid", nullable: false),
                    LastError = table.Column<string>(type: "text", nullable: true),
                    SearchableContent = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_KnowledgeSearchIndex", x => x.Id);
                    table.ForeignKey(
                        name: "FK_KnowledgeSearchIndex_KnowledgeEntries_KnowledgeEntryId",
                        column: x => x.KnowledgeEntryId,
                        principalTable: "KnowledgeEntries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_KnowledgeSearchIndex_KnowledgeEntryId",
                table: "KnowledgeSearchIndex",
                column: "KnowledgeEntryId",
                unique: true);
        }
    }
}
