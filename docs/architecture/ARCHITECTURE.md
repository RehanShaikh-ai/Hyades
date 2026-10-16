# Hyades System Architecture

**Current Release:** v0.4.2 — Collections, Threads, Saved Observatory Views & Knowledge Inbox
**Contract Reference:** `docs/contracts/CONTRACT_v0.4.2.md`

---

## 1. High-Level Architecture Overview

Hyades (Knowledge Atlas) is a local-first, privacy-respecting personal knowledge graph and research assistant.
The system is composed of:
1. **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Cytoscape.js for interactive knowledge graph exploration.
2. **Backend**: FastAPI (Python 3.11+ / 3.12 / uv), SQLAlchemy 2.0 (asyncio + asyncpg / psycopg), Pydantic v2.
3. **Database**: PostgreSQL 16 for relational models, entity graph, conversation history, collections, threads, and views.
4. **Vector Store**: Qdrant 1.9.1 (`qdrant/qdrant:v1.9.1`) for vector similarity search over text/source chunks.
5. **Job Queue & Cache**: Redis 7 + ARQ for asynchronous background tasks (extraction, chunking, embedding, knowledge inbox detection).
6. **AI Orchestraction**: Unified AI router supporting local Ollama and FreeLLMAPI with automatic fallback.

---

## 2. Storage Subsystems & Volume Architecture

Hyades isolates persistent state across three dedicated persistent volumes:

### 2.1 Relational Storage (`postgres_data`)
- Volume name: `knowledge_atlas_postgres_data`
- Mount target: `/var/lib/postgresql/data`
- Stores structured metadata, users, workspaces, notes, sources, content chunks, graph nodes/edges, collections, threads, questions, discoveries, and saved observatory views.

### 2.2 Git-Versioned Note Storage (`git_repositories`)
- Volume name: `knowledge_atlas_git_repositories`
- Configured via: `GIT_REPOSITORY_ROOT` (default `/data/workspaces`)
- Mounted in: `backend` and `worker` containers at `/data/workspaces`.
- Stores raw Markdown notes with Git version history per workspace.

### 2.3 Persistent Source Storage (`source_storage`) — Added in v0.4.2 (§1.1, §17)
- Volume name: `knowledge_atlas_source_storage`
- Configured via: `SOURCE_STORAGE_ROOT` (default `/app/data/sources` in container; `./data/sources` in local development).
- Mounted in: `backend` and `worker` containers at `/app/data/sources`.
- Storage directory structure:
  `${SOURCE_STORAGE_ROOT}/{workspace_id}/{source_id}/{original_filename}`
- **Security & Integrity Constraints**:
  - All file access paths must be canonically resolved against `SOURCE_STORAGE_ROOT`.
  - Path traversal attempts (e.g. `../`) are rejected with `400 Bad Request`.
  - Rejection / deletion of inbox items only purges files strictly inside the workspace's subfolder under `SOURCE_STORAGE_ROOT`.
  - No symlinks pointing outside `SOURCE_STORAGE_ROOT` are followed.

---

## 3. Worker Architecture & Background Jobs

Asynchronous background processing is handled by ARQ workers consuming from Redis (`REDIS_URL`):
- `extract_knowledge_job`: Ingestion and entity/relation extraction for accepted sources.
- `detect_concepts_job`: Dry-run asynchronous extraction for Knowledge Inbox items without persisting entities to the graph.
- `reindex_workspace_job`: Re-embedding and graph reconciliation with strict protection for entities referenced by collection and thread memberships.
