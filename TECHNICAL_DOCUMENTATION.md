# Knowledge Desk technical documentation

## Purpose and security boundary

Knowledge Desk captures engineering notes, structures them into reusable entries, indexes them at field/chunk level, and answers questions with grounded citations. The login is deliberately a **dummy UI gate** (`admin` / `admin`) stored in browser session storage. It provides no identity, authorization, or server security and must be replaced before exposure to untrusted users.

The default `Ai:Provider` is `Local`. Local extraction, hash embeddings, and deterministic answers keep development and automated tests offline. OpenAI is opt-in only.

## Architecture

- React, TypeScript, Vite, TanStack Query: login, capture/review, library management, and assistant.
- ASP.NET Core 10 minimal API: validation, duplicate policy, lifecycle operations, revisions, health, and metrics.
- Application/Domain projects: contracts and the knowledge entity.
- AI project: local and OpenAI providers, multi-entry parsing, grounded answer assembly.
- Persistence project: EF Core/PostgreSQL repository, pgvector search, chunking, durable indexing jobs, worker, revisions.
- PostgreSQL with pgvector: canonical records, revisions, feedback, question history, chunks, embeddings, and indexing jobs.

## Data model

`KnowledgeEntries` contains the complete structured record: type, title, summary, original input, problem, root cause, solution, prevention, details, category, severity, project, module, affected service, confidence, status, tags, technologies, and timestamps. `KnowledgeSearchChunks` is one-to-many and stores chunk type, content, embedding metadata, state, and error. Chunks use `vector(1536)`. `IndexingJobs` is the durable retry queue. `KnowledgeRevisions` stores immutable JSON snapshots. Feedback and assistant question history are stored separately.

## Request flows

Capture calls `POST /api/knowledge/analyze`. OpenAI JSON may contain `entries[]`; the local provider splits substantial blank-line-separated problems. The UI reviews and saves each proposal independently. Create validates the complete entry, performs a semantic duplicate check, writes the entry and revision, and queues indexing. A likely match (similarity at least 0.95) returns HTTP 409 unless `allowDuplicate=true`; updating the existing record is always available through PUT.

Edit writes a new revision and requeues indexing. Archive and restore change status, create revisions, and queue a refresh. Archived entries are excluded from ordinary lists and semantic retrieval. The library uses server-side filters, sorting, counts, and pagination.

Assistant requests include at most ten validated history turns. Retrieval returns full structured fields plus the best matching chunk. The answer prompt receives all grounding fields. The response returns citations with entry ID, chunk ID, chunk type, exact snippet, title, and similarity; the UI renders these source cards separately.

## Chunking, indexing, and retries

`KnowledgeChunker` emits Overview, Problem, RootCause, Solution, Prevention, Details, and Metadata chunks. Long values are bounded to roughly 1,200 characters. Save operations only enqueue work, keeping request latency independent of embeddings. The hosted worker claims due jobs, indexes every chunk, and retries failures up to five times with exponential delays (`10, 20, 40, 80…` seconds). Terminal failures and truncated error messages remain queryable in `IndexingJobs` and appear in metrics.

The `ChunkIndexingAndJobs` migration copies the legacy single search record into a `LegacyOverview` chunk, marks it for reindex, enqueues every existing entry, creates filter indexes and the HNSW vector index, then removes the old table. Apply migrations using `dotnet tool restore` and `dotnet tool run dotnet-ef database update --project src/InternalKnowledge.Persistence --startup-project src/InternalKnowledge.Api` from `backend`.

## API summary

- `GET /api/knowledge`: `query`, `entryType`, `project`, `module`, `severity`, `status`, `technology`, `tag`, `sort`, `page`, `pageSize`, `includeArchived`.
- `GET/PUT /api/knowledge/{id}`; `POST .../archive`, `.../restore`, `.../reindex`; `GET .../revisions`.
- `POST /api/knowledge?allowDuplicate=false`, `/api/knowledge/analyze`, `/api/search/semantic`, `/api/assistant/ask`.
- `GET /health/live` is process liveness. `/health/ready` and `/health` verify PostgreSQL. `/api/admin/metrics` reports queue counters and database job states.

## Local setup

Requirements are .NET 10, Node 22/pnpm, Docker, and PowerShell. Copy `backend/.env.example` as appropriate, keep `Ai__Provider=Local`, start PostgreSQL with `docker compose` in `backend`, and run `./start-local.ps1` from the repository root. The frontend normally uses the Vite proxy/API URL from its environment. Sign in with the dummy credentials above.

Never put API keys in committed JSON, `.env`, Compose files, images, or frontend variables. Use .NET user secrets locally.

## Current development deployment

The repository intentionally has one Docker definition: `backend/docker-compose.yml`. It runs PostgreSQL with pgvector and pgAdmin while the API and Vite frontend run directly on the developer machine through `start-local.ps1`. PostgreSQL data persists in the `backend_knowledge_postgres` named volume. Production containerization is intentionally deferred until the application is ready for deployment.

## Testing

Run `dotnet test KnowledgeDesk.slnx` in `backend`; run `pnpm build`, `pnpm lint`, and `pnpm test:e2e` in the frontend. The Playwright suite mocks API responses and stays offline. For PostgreSQL-backed verification, start the local database and API with `Ai__Provider=Local`, then run `backend/tests/integration-api.ps1`. Tests use local providers/fakes only. No automated suite should contain or use a real OpenAI key.

## OpenAI manual test procedure

This is manual and never part of CI: create a disposable secret with `dotnet user-secrets`, set `Ai:Provider=OpenAI`, set extraction/chat/embedding model names and 1,536 dimensions, start the API, submit a non-sensitive note, verify multiple entries and chunk citations, then remove the secret and return the provider to Local. Monitor costs and never paste confidential production content without organizational approval.

## Troubleshooting

- Readiness 503: verify database DNS, credentials, pgvector image health, and migration logs.
- Entries not searchable: inspect `/api/admin/metrics` and failed `IndexingJobs`; requeue the entry or use the bounded admin reindex endpoint after fixing the dependency.
- Vector dimension errors: database, local/OpenAI embedding configuration, and model dimensions must all be 1,536.
- Duplicate 409: update the returned match, or explicitly confirm a separate occurrence in the review UI.
- Frontend unavailable: verify the Vite process started successfully through `start-local.ps1` and that its configured API URL matches the local API port.
