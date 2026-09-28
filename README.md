# Knowledge Atlas 🗺️

> *Build knowledge, not just notes.*

---

## What is Knowledge Atlas?

Most tools help you **store** information. Knowledge Atlas helps you **understand** it.

It's a personal knowledge platform that connects what you know, surfaces what you're missing, and helps you build understanding that actually holds up — not just a pile of notes you'll never read again.

---

## The Problem

You save articles. You write notes. You highlight PDFs.

And then six months later you're starting from scratch because nothing connected.

Standard notes apps are just digital filing cabinets. Knowledge graphs are powerful but hard to maintain. AI chatbots hallucinate and cite nothing. RAG tools return text chunks with no understanding of *why* something matters.

None of them help you **build and verify** understanding over time.

---

## What We're Building

Knowledge Atlas is a system that actively helps you capture, connect, and improve your knowledge — not just retrieve it.

```
Capture
   ↓
Organize
   ↓
Connect
   ↓
Verify
   ↓
Explore
   ↓
Understand
```

At its core it's:

- **A structured notes system** — write naturally, keep it organized
- **A knowledge graph** — concepts, relationships, and how they connect
- **A search and retrieval layer** — find what you need, even when you don't know exactly what to search for
- **An AI layer** — that works *with* your knowledge, not instead of it
- **A learning environment** — that helps you test, improve, and actually retain understanding

The goal isn't to replace thinking. It's to make thinking more reliable.

---

## Current State

Knowledge Atlas is in active development under strict engineering contracts.

**What exists now (v0.4.1 Usability, Sources & Persistent Assistant):**

- ✅ **Unified AppShell & Navigation** — Coherent sidebar navigation across Notes, Sources, Semantic Search, Knowledge Graph, and AI Assistant
- ✅ **Source Ingestion System** — Direct ingestion pipeline for PDF, Markdown, and plain text files with stage tracking, error inspection, idempotency, and retry
- ✅ **Persistent AI Assistant** — Multi-turn conversation sessions persisted across page reloads with token-by-token SSE streaming
- ✅ **Provenance & Grounded Citations** — Accurate chunk citations linking assistant responses directly to source documents and notes with verified Similarity scoring
- ✅ **Knowledge Graph Modernization** — Benchmarked visualization performance with LOD label culling and zero continuous frame consumption at rest
- ✅ **Semantic, Lexical & Hybrid Search** — Vector similarity (Qdrant), Reciprocal Rank Fusion (RRF), exact match highlighting, and saved searches
- ✅ **Git-Based Note Versioning** — Git-backed note history, visual diff viewer, and safe rollback restore flow
- ✅ **Background Queue & Real-time Progress** — Non-blocking processing via ARQ + Redis, with real-time job status tracking and retry support
- ✅ **End-to-End Playwright Validation** — Automated E2E test suites covering ingestion, assistant citations, conversation persistence, retry, and fault tolerance

**What's coming (v0.5.x+):**

- Study tools, quizzes, and learning progress tracking
- Personal Knowledge Twin and Contradiction Tracker
- Multi-user collaboration and shared workspaces

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Mod + Space` | Open Semantic / Hybrid Search modal |
| `Mod + J` | Open AI Assistant (RAG) modal |
| `Mod + N` | Create a new note |
| `Escape` | Close active modals and note editor |

> **Note:** `Mod` refers to `Cmd` (⌘) on macOS and `Ctrl` on Windows/Linux.

---

## Why It's Different

There's no shortage of notes apps. What makes this worth building:

**1. Knowledge, not just storage.**
The system is designed around *concepts and relationships*, not just documents and folders. What you know about a topic and how that connects to everything else is a first-class concept.

**2. Verification, not just retrieval.**
We're building tools to actively surface gaps, contradictions, and unsupported claims — so you know not just what you've captured, but whether it actually holds together.

**3. AI that stays honest.**
AI features are grounded in your own knowledge base with citations. The system doesn't pretend to know things it doesn't, and it doesn't silently replace your thinking.

**4. Built to last.**
Strict engineering contracts, clean migrations, replaceable infrastructure. This is designed as a long-term system, not a prototype.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Tailwind CSS, Vite, Lucide Icons |
| Backend | Python 3.12, FastAPI, SQLAlchemy, Alembic, ARQ |
| Database & Storage | PostgreSQL 16, Qdrant (Vector DB), Redis (Job Queue), Git (Note Revisions) |
| AI & Embeddings | FastEmbed (default local), Ollama, OmniRoute, FreeLLMAPI |
| Infrastructure | Docker Compose, GitHub Actions |

The AI layer is designed to be provider-agnostic from the start. No hard dependency on any single model or service.

---

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 20+
- Python 3.12+
- `uv` (Python package manager)

### Quick Start

```bash
git clone <repo-url>
cd knowledge-atlas

# Set up environment files
cp .env.example .env
cp frontend/.env.example frontend/.env

# Start the full stack
docker compose up --build
```

Open **http://localhost:5173**.

That's it. PostgreSQL, migrations, backend, and frontend all start in the right order automatically.

### Local Development

If you'd rather run services individually:

```bash
# Backend
cd backend
uv sync
uv run alembic upgrade head
uv run python -m uvicorn app.main:app --reload --port 8080

# Frontend (in a separate terminal)
cd frontend
npm install
npm run dev
```

---

### Database and integration validation

The v0.2.2 migration creates sources for import provenance and adds nullable
notes.metadata (JSONB). It is additive and reversible. Run:

    uv run python scripts/verify_migrations.py
    uv run pytest tests/integration -v
    docker compose config --quiet

The integration suite uses Testcontainers with PostgreSQL 16, so Docker must be
running locally. The source import, graph, and dashboard API implementation is
delivered by the backend/frontend workstreams against this schema.

## API

Base URL: `http://localhost:8080/api/v1`

**Current endpoints:**

```http
GET    /api/v1/health

POST   /api/v1/users
GET    /api/v1/users
GET    /api/v1/users/{id}

POST   /api/v1/workspaces
GET    /api/v1/workspaces
GET    /api/v1/workspaces/{id}

POST   /api/v1/workspaces/{workspace_id}/notes
GET    /api/v1/workspaces/{workspace_id}/notes
GET    /api/v1/notes/{note_id}
PATCH  /api/v1/notes/{note_id}
DELETE /api/v1/notes/{note_id}

POST   /api/v1/notes/{note_id}/tags
DELETE /api/v1/notes/{note_id}/tags/{tag_id}
GET    /api/v1/workspaces/{workspace_id}/tags

POST   /api/v1/notes/{note_id}/links
DELETE /api/v1/notes/{note_id}/links/{target_note_id}
GET    /api/v1/notes/{note_id}/links

POST   /api/v1/workspaces/{workspace_id}/sources/upload
GET    /api/v1/workspaces/{workspace_id}/sources
GET    /api/v1/sources/{source_id}
DELETE /api/v1/sources/{source_id}
POST   /api/v1/sources/{source_id}/retry
POST   /api/v1/sources/{source_id}/link-note
DELETE /api/v1/sources/{source_id}/link-note/{note_id}

POST   /api/v1/workspaces/{workspace_id}/conversations
GET    /api/v1/workspaces/{workspace_id}/conversations
GET    /api/v1/conversations/{conversation_id}
PATCH  /api/v1/conversations/{conversation_id}
DELETE /api/v1/conversations/{conversation_id}
POST   /api/v1/conversations/{conversation_id}/messages
GET    /api/v1/conversations/{conversation_id}/messages

POST   /api/v1/workspaces/{workspace_id}/search
GET    /api/v1/workspaces/{workspace_id}/saved-searches
POST   /api/v1/workspaces/{workspace_id}/saved-searches
DELETE /api/v1/workspaces/{workspace_id}/saved-searches/{id}

POST   /api/v1/workspaces/{workspace_id}/rag

GET    /api/v1/workspaces/{workspace_id}/jobs
POST   /api/v1/jobs/{job_id}/retry

GET    /api/v1/notes/{note_id}/versions
GET    /api/v1/notes/{note_id}/versions/{version_id}/diff
POST   /api/v1/notes/{note_id}/versions/{version_id}/restore

GET    /api/v1/workspaces/{workspace_id}/activity
GET    /api/v1/workspaces/{workspace_id}/dashboard
GET    /api/v1/workspaces/{workspace_id}/graph
```

Full API documentation is generated automatically at `http://localhost:8080/docs` when the backend is running.

---

## Project Structure

```
knowledge-atlas/
├── backend/          # FastAPI application
│   ├── app/
│   │   ├── api/      # Route handlers
│   │   ├── models/   # SQLAlchemy models
│   │   ├── schemas/  # Pydantic schemas
│   │   ├── services/ # Business logic
│   │   └── core/     # Config, error handling
│   ├── tests/
│   └── alembic/      # Database migrations
│
├── frontend/         # React + TypeScript application
│   └── src/
│       ├── api/      # API client modules
│       ├── components/
│       ├── pages/
│       └── types/
│
├── tests/
│   └── integration/  # Full-stack integration tests
│
├── docs/             # Engineering contracts and architecture
├── scripts/          # Development utilities
└── docker-compose.yml
```

---

## Engineering Approach

Knowledge Atlas uses a **contract-driven development** process.

Before any feature is built, a formal engineering contract defines:
- Exact API interfaces
- Database schema and relationships
- Ownership boundaries across the team
- Error handling requirements
- Test coverage requirements
- What is and isn't in scope

This keeps three independent contributors from building incompatible things. Every interface is defined before anyone writes code.

Contracts live in `docs/`.

---

## Contributing

The project uses three workstreams:

| Workstream | Scope |
|---|---|
| Frontend | React application, TypeScript, UI |
| Backend | FastAPI, SQLAlchemy, Pydantic, services |
| Infrastructure | Docker, Alembic, CI, integration |

Before contributing to any workstream, read the relevant engineering contract in `docs/`. The contract defines what you can change, what you must use, and what you must not touch.

Branch naming:

```
frontend/<description>
backend/<description>
infra/<description>
```

All changes land via pull request. Cross-workstream files (like `docker-compose.yml` and contracts) require approval from all three workstreams.

---

## Status

This is an early-stage project with an intentionally long build horizon. The foundation is being built to support a system significantly more capable than what currently exists.

If the vision sounds interesting and you want to follow along, watch the repo.

---

## License

[TBD]

---

*Knowledge Atlas — because understanding is more than storage.*
