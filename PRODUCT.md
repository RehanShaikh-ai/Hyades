# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary users:** Researchers, engineers, scholars, and deep thinkers managing multi-format literature, research notes, and long-running inquiries.
- **Situation & job:** Synthesizing dense documents, papers, and evolving notes across topics without losing verified source provenance, drowning in uncurated entity-graph noise, or relying on ungrounded AI summaries.
- **Team & deployment context:** Primarily local-first or self-hosted deployments used by individual researchers and small collaborative teams with isolated workspaces.

## Product Purpose

Hyades is a contract-driven personal and workspace knowledge-intelligence platform that transforms static documents and notes into an interconnected, verifiable knowledge system. It exists to bridge the gap between passive note archives, noisy auto-generated concept graphs, and ungrounded conversational AI. Success means a researcher can ingest source material, curate extracted concepts before they enter the permanent graph, navigate cross-topic relationships spatially, and synthesize findings with deterministic citation provenance.

## Positioning

Unlike passive note-taking apps (storage without synthesis), raw RAG chat tools (ungrounded claims without graph structure), or fully automatic graph builders (polluted entity graphs), Hyades combines:
1. **A human-in-the-loop Knowledge Inbox gate** that stages dry-run concept and relationship extractions for review before committing them to the permanent graph.
2. **Reciprocal Rank Fusion (RRF) hybrid retrieval** combining dense vector similarity (Qdrant) with lexical matching (PostgreSQL).
3. **Git-backed note versioning** with line-level diffs and one-click revision rollback.
4. **Grounded multi-turn synthesis (Stella)** streaming via Server-Sent Events (SSE) where every claim is tied to verified source chunks and similarity scores.

## Operating Context

- **Core destinations & workflows:**
  - **Overview:** Central workspace desk surfacing summary metrics (*Your Knowledge*), active notes (*Continue Working*), cross-topic discoveries (*New Connections*), timeline (*Recent Activity*), and actionable diagnostics (*Knowledge Health*).
  - **Library:** Unified repository of ingested sources/papers and markdown synthesis notes, with contextual concept extraction and Git revision history.
  - **Knowledge Inbox:** Staging queue for newly uploaded documents to inspect dry-run extracted concepts, edit metadata, and accept or reject items before graph commitment.
  - **Observatory:** Interactive spatial graph (*ConstellationGraph*) with level-of-detail culling, semantic clustering, fullscreen focus mode, and persistent camera/filter *Saved Views*.
  - **Stella:** Persistent conversational research companion with workspace/source scope controls, grounding flow visibility, and a real-time citations dossier.
  - **Collections & Threads:** Non-destructive thematic groupings (*Collections*) and structured hypothesis/inquiry workspaces (*Threads*).
  - **Actions:** Actionable tasks and research follow-ups linked to workspace knowledge.
- **Ingestion materials:** PDF, Markdown, plaintext, DOCX, EPUB, HTML, JSON, CSV, and image assets processed asynchronously via Redis and ARQ workers.
- **Global keyboard-first ergonomics:** Explicit cross-platform shortcuts (`Ctrl/Cmd + K` or `Win/Super + Space` for Global Search, `Ctrl/Cmd + J` for Stella, `Ctrl/Cmd + N` for New Note, `Escape` to dismiss).

## Capabilities and Constraints

- **Stack & runtime:** React 18.3 + TypeScript + Vite SPA frontend (`frontend/`); FastAPI + SQLAlchemy 2.0 + Alembic backend (`backend/`); PostgreSQL 16 (relational & JSONB), Qdrant 1.9.1 (workspace-isolated vector collections), Redis 7 + ARQ background workers, FastEmbed (`BAAI/bge-small-en-v1.5`) / Ollama / FreeLLMAPI, and local Git repositories for note versioning.
- **Workspace isolation:** All sources, notes, concepts, vector collections, conversations, collections, and threads are strictly scoped to a workspace boundary.
- **Contract-driven governance:** Database schemas, migrations (`alembic check` zero-drift gate), and `/api/v1` REST/SSE payload contracts are governed by versioned engineering contracts.
- **Telemetry restraint:** Only surface real, actionable system state (e.g., backend health, indexing status, disconnected notes needing synthesis); never display artificial status badges or decorative developer telemetry.

## Brand Commitments

- **Naming:** User-facing product name is **Hyades**; the AI research companion is **Stella**. Internal repository, package, and Docker service identifiers retain `knowledge-atlas` where established.
- **Voice & tone formula:** *Sophisticated World + Simple Interface* — calm, scholarly, editorial, and intellectually lucid, while keeping UI labels plain, direct, and immediately understandable to a new user without academic graph-theory jargon.
- **Plain-language taxonomy (binding):**
  - Use **Your Knowledge** (not *Epistemic Horizon*)
  - Use **Continue Working** (not *Active Investigation Folio*)
  - Use **New Connections** (not *Emerging Epistemic Bridges*)
  - Use **Recent Activity** (not *Archival Ingestion Stream*)
  - Use **Knowledge Health** (not *System Diagnostics / Epistemic Diagnostics*)
  - Use **Concepts** (not *Entities*)
  - Use **Connections** (not *Constellation Relationships / Edges*)
  - Use **Sources** (not *Literature Corpus*)
  - Use **Topics** (not *Semantic Sectors*)

## Evidence on Hand

- **Implemented application surfaces:** Full React frontend (`frontend/src/pages/`) and FastAPI backend (`backend/app/`) with end-to-end flows for Overview, Library, Knowledge Inbox, Observatory, Stella, Collections, Threads, Actions, Global Search, and Account/Workspace administration.
- **Visual design specification:** Existing `DESIGN.md` defining the incumbent visual system.
- **Absence constraints:** No external customer testimonials, third-party press quotes, commercial pricing tiers, or cloud SLA claims exist; future surfaces must not fabricate them.

## Product Principles

1. **Provenance Before Assertion:** Every synthesized answer, concept node, and discovered connection must trace transparently back to verifiable source chunks or user notes.
2. **Curated Graph Hygiene:** Automated extraction proposes; the researcher disposes. Staging in the Knowledge Inbox prevents unverified noise from polluting the permanent knowledge graph.
3. **Plain Language Over Jargon:** Never force the user to learn graph theory or astronomical terminology to operate the tool; everyday words label every control and metric.
4. **Focus by Default:** Secondary panels, dossiers, and shelves stay collapsible so reading, writing, and spatial exploration command the viewport without competing chrome.
5. **Deterministic Contracts:** Frontend and backend evolve through explicit, tested API and schema contracts rather than ad-hoc coupling.

## Accessibility & Inclusion

- **Target standard:** WCAG 2.1 Level AA compliance across all application views and interactive modals (verified via `@axe-core/playwright` in the E2E suite).
- **Keyboard & motion support:** Complete keyboard operability for global search, navigation, and modal dismissal, alongside reduced-motion respect and zero-idle-frame canvas rendering in the Observatory.
