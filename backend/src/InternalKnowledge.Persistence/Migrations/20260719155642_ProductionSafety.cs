using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InternalKnowledge.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ProductionSafety : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_IndexingJobs_KnowledgeEntryId",
                table: "IndexingJobs");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LeaseExpiresAt",
                table: "IndexingJobs",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.Sql("""
                WITH duplicates AS (
                    SELECT "Id", ROW_NUMBER() OVER (PARTITION BY "KnowledgeEntryId" ORDER BY "CreatedAt" DESC) AS row_number
                    FROM "IndexingJobs" WHERE "Status" IN ('Pending','Processing')
                )
                UPDATE "IndexingJobs" SET "Status"='Completed', "LastError"='Superseded while enabling active-job uniqueness'
                WHERE "Id" IN (SELECT "Id" FROM duplicates WHERE row_number > 1);
                """);

            migrationBuilder.CreateIndex(
                name: "IX_KnowledgeRevisions_KnowledgeEntryId_RevisionNumber",
                table: "KnowledgeRevisions",
                columns: new[] { "KnowledgeEntryId", "RevisionNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UX_IndexingJobs_ActiveEntry",
                table: "IndexingJobs",
                column: "KnowledgeEntryId",
                unique: true,
                filter: "\"Status\" IN ('Pending','Processing')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_KnowledgeRevisions_KnowledgeEntryId_RevisionNumber",
                table: "KnowledgeRevisions");

            migrationBuilder.DropIndex(
                name: "UX_IndexingJobs_ActiveEntry",
                table: "IndexingJobs");

            migrationBuilder.DropColumn(
                name: "LeaseExpiresAt",
                table: "IndexingJobs");

            migrationBuilder.CreateIndex(
                name: "IX_IndexingJobs_KnowledgeEntryId",
                table: "IndexingJobs",
                column: "KnowledgeEntryId");
        }
    }
}
