# Hyades — Contract v0.4.2

**Release:** v0.4.2
**Name:** Collections, Threads & Working Knowledge
**Project:** Hyades (repository: `knowledge-atlas`)
**Status:** Final engineering contract
**Predecessor:** `CONTRACT_v0.4.1.md`

> This contract incorporates the supplied v0.4.2 draft and its audit decisions. The audit findings are treated as binding engineering constraints, especially schema handoff ownership, reindex safety, source provenance, Inbox dry-run extraction, and workspace-scoped isolation.

---

# 0. Cross-Workstream Conflict Prevention Protocol

## 0.1 Schema Handoff Gate

Workstream C (Infrastructure) must not write any Alembic migration until Workstream B (Backend) has merged a PR titled exactly:

`schema-handoff/v0.4.2`

That PR contains only the new/modified model files and `backend/app/models/__init__.py`. It contains no routes, services, or schemas.

Its description must include a **Schema Summary** listing every table, column, constraint, and index added or changed using §7 terminology.

If a model changes after handoff, Workstream B opens `schema-handoff/v0.4.2-patch-N`. Workstream C updates the migration accordingly. No model is edited silently after handoff.

## 0.2 Compose Lock

- Any change to `docker-compose.yml` requires a Compose Change Notice before the branch is created.
- Only one Compose PR may be open at a time.
- Workstream B files a notice when backend work needs a new service, volume, or mount.
- The expected Compose change is persistent source storage (§18.1), plus explicitly approved integration changes.

## 0.3 Environment Variable Handoff

All new environment variables are listed in §17. Workstream C adds them to `.env.example` in `infra/v0.4.2-env`, which must merge before backend code references them.

## 0.4 Model Registration

Every new or modified model must be imported in `backend/app/models/__init__.py` in the same backend commit. Workstream C verifies this before generating the migration.

## 0.5 File Ownership

| Path | Owner | Rule |
|---|---|---|
| `frontend/**` | A — Hamza | Read-only for others |
| `tests/e2e/**` | A — Hamza | C owns CI wiring only |
| `backend/app/**`, `backend/tests/**` | B — Ali | Read-only for others |
| `backend/app/jobs/**` | B — Ali | C must not edit |
| `backend/pyproject.toml`, `backend/uv.lock` | B — Ali | Dependency changes by B |
| `backend/alembic/**`, `backend/alembic.ini` | C — Rehan | B must not edit |
| `docker-compose.yml`, `docker/**`, `.env.example`, `scripts/**` | C — Rehan | Follow §0.2/§0.3 |
| `.github/workflows/**`, `tests/integration/**` | C — Rehan | A/B request changes |
| `docs/**`, `README.md` | C maintains | A/B contribute through PRs |
| `CONTRACT_v0.4.2.md` | C maintains | Amendments through §0.7 |

If ownership is ambiguous, stop and resolve it before editing.

## 0.6 Migration Drift Gate

CI must run against a clean database:

```bash
uv run alembic upgrade head
uv run alembic check
uv run alembic downgrade -1
uv run alembic upgrade head
```

`alembic check` must report no model/schema differences. A model change without a matching migration fails CI.

## 0.7 API Conformance and Amendment Path

Endpoint paths, request bodies, and response shapes are fixed by §8–§14.

- Workstream B writes contract tests for every new endpoint.
- Workstream A TypeScript types mirror those shapes exactly.
- If the contract is incomplete or incorrect, work stops and a `contract-amendment/v0.4.2-N` PR updates this document.
- All three contributors approve amendments.
- No unilateral endpoint or response-shape changes are permitted.

## 0.8 Branch Hygiene

- Keep feature branches current by merging `main`.
- Never rebase a pushed shared branch.
- Never force-push.
- Keep PRs focused.

## 0.9 Integration Branch

Workstream C creates `review/v0.4.2-integration` only after schema handoff, environment handoff, and all workstream branches have passing CI.

Integration order is `infra → backend → frontend`. The integration branch is not merged into source branches.

---

# 1. Objective

v0.4.2 expands Hyades from a knowledge workspace into a system for organizing and actively working with knowledge.

It introduces:

- **Collections** — organize related knowledge without duplicating it.
- **Threads** — a workspace around a question, investigation, or learning goal.
- **Extraction controls** — control whether material enters the knowledge graph.
- **Expanded import** — DOCX, HTML, EPUB, JSON, CSV, and images.
- **Saved Observatory views** — save and restore graph view state.
- **Knowledge Inbox** — review imported material before it becomes permanent graph knowledge.

## 1.1 Glossary

| UI term | Meaning | Code/API identifiers |
|---|---|---|
| Library | Workspace-wide view of notes and sources | `notes`, `sources` |
| Observatory | Interactive knowledge-graph workspace | `/graph`, `ConstellationGraph` |
| Stella | Persistent AI assistant | `conversations`, `messages`, `assistant_service` |
| Ivory Observatory | Existing frontend design system | N/A |

UI terms do not become API/database names.

---

# 2. Scope

## 2.1 Included

- Collections with typed membership over existing knowledge.
- Threads with attached knowledge, open questions, discoveries, and derived activity.
- `extract_knowledge` on notes and sources.
- Entity and relationship extraction for textual source chunks.
- DOCX, HTML, EPUB, JSON, CSV, and image imports.
- Image storage/display without interpretation.
- Saved Observatory views.
- Knowledge Inbox for single-file uploads.
- Additive database migration.
- Backend, frontend, integration, and E2E tests.

## 2.2 Explicitly Excluded

- Authentication and authorization.
- Image OCR, vision, captioning, image entity extraction, or image relationship extraction.
- EXIF/GPS metadata extraction.
- SVG images.
- Image thumbnails.
- Thread/Collection-scoped Stella retrieval.
- Nested Collections.
- Collection cover images.
- Sharing/collaboration/permissions on Collections or Threads.
- Automatic or AI-generated Collections/Threads.
- New activity event types.
- Inbox review for Obsidian vault imports.
- Bulk Inbox accept/reject.
- Inbox items for manually created notes.
- AI-generated content entering the Inbox.
- Batch upload endpoints.
- Rendering imported HTML.
- Production deployment, billing, and real-time collaboration.

## 2.3 Resolved Design Decisions

| Question | Decision |
|---|---|
| Are Collection relationships stored as members? | No. They are derived from relationships whose endpoints are both member entities. |
| What are Inbox items? | Sources created by source upload with `review_mode=inbox`. |
| What can be edited before Inbox acceptance? | Source title and `extract_knowledge`. Detected concepts are read-only preview. |
| What does Reject do? | Permanently deletes the source, chunks, vectors, Inbox item, and stored file. |
| What does detected concepts mean? | Dry-run entity extraction over the first N chunks. It writes nothing to graph tables. |
| Is Stella retrieval scoped to Threads? | No. Threads reference conversations only. |
| What is a Collection icon? | Short emoji or icon-key string. |
| What is visible-node state? | Filters plus an optional capped focus list of entity IDs. |

---

# 3. Workstream Ownership

## 3.1 Workstream A — Frontend

**Primary:** Hamza
**Backup:** Rehan

Responsible for Collections UI, Threads UI, Inbox UI, Saved View UI, extraction controls, new import formats/image display, frontend types/API modules/components, UI states/accessibility, frontend tests, Playwright test files, and production build verification.

Primary directory: `frontend/`.

Must not modify backend Python, models, migrations, or Docker files.

## 3.2 Workstream B — Backend

**Primary:** Ali
**Backup:** Hamza

Responsible for SQLAlchemy models, Collections, Threads, Saved Views, Inbox services/routes, extraction policy, source-chunk entity/relationship extraction, format validation/extractors, Pydantic schemas, ARQ jobs, contract tests, backend tests, and reindex safety.

Primary directories: `backend/app/`, `backend/tests/`.

Must not modify `backend/alembic/`, Docker files, or frontend files.

## 3.3 Workstream C — Infrastructure, Database & Integration

**Primary:** Rehan
**Backup:** Ali

Responsible for Alembic after schema handoff, Docker Compose/source storage, `.env.example`, CI/migration drift gate, integration tests, Playwright CI wiring, cross-workstream integration, release validation, contract, and documentation.

Production deployment remains excluded.

---

# 4. Baseline Verification

Before implementation, Rehan records `docs/baseline-v0.4.2.md` and verifies:

1. v0.4.1 is merged and health returns 200.
2. Alembic head matches current models.
3. Existing source metadata fields are present.
4. Uploaded originals have known persistent storage.
5. `entity_chunks.note_id` is currently NOT NULL.
6. Note extraction and workspace reindex exist.
7. Source-chunk graph extraction does not already exist.
8. Playwright E2E infrastructure exists.
9. Graph query parameters match the current graph contract.

If an assumption is false, amend this contract before implementation.

---

# 5. Canonical Naming Contract

## 5.1 Backend Models

| Model | File | Status |
|---|---|---|
| `Collection`, `CollectionNote`, `CollectionSource`, `CollectionEntity`, `CollectionConversation` | `backend/app/models/collection.py` | New |
| `Thread`, `ThreadNote`, `ThreadSource`, `ThreadEntity`, `ThreadConversation`, `ThreadQuestion`, `ThreadDiscovery` | `backend/app/models/thread.py` | New |
| `SavedView` | `backend/app/models/saved_view.py` | New |
| `InboxItem` | `backend/app/models/inbox_item.py` | New |
| `Source` | `backend/app/models/source.py` | Extended |
| `Note` | `backend/app/models/note.py` | Extended |
| `EntityChunk` | `backend/app/models/entity_chunk.py` | Extended |

## 5.2 Backend Schemas

```text
CollectionCreate / CollectionUpdate / CollectionResponse / CollectionListResponse
CollectionStatsResponse / CollectionRelatedResponse
KnowledgeItemAddRequest / KnowledgeItemResponse / KnowledgeItemListResponse
ThreadCreate / ThreadUpdate / ThreadResponse / ThreadListResponse
ThreadQuestionCreate / ThreadQuestionUpdate / ThreadQuestionResponse
ThreadDiscoveryCreate / ThreadDiscoveryResponse
ThreadActivityItem / ThreadActivityResponse
SavedViewState / SavedViewCreate / SavedViewUpdate / SavedViewResponse / SavedViewListResponse
InboxItemResponse / InboxListResponse / InboxItemUpdate
SourceUpdate
```

## 5.3 Backend Services

```text
services/membership_service.py
services/collection_service.py
services/thread_service.py
services/saved_view_service.py
services/inbox_service.py
services/extraction_policy_service.py
services/file_validation_service.py
services/extractors/
```

## 5.4 Background Jobs

```text
detect_source_concepts_job
extract_source_graph_job
```

New `index_jobs.job_type` values:

```text
detect_source_concepts
extract_source_graph
```

## 5.5 Frontend Types

```text
KnowledgeItemType / KnowledgeItem / KnowledgeItemAddRequest
Collection / CollectionCreate / CollectionStats / CollectionRelated
Thread / ThreadCreate / ThreadQuestion / ThreadDiscovery / ThreadActivityItem
SavedView / SavedViewState / SavedViewCreate
InboxItem
```

## 5.6 Frontend API Modules

```text
api/collections.ts
api/threads.ts
api/saved_views.ts
api/inbox.ts
api/sources.ts
api/notes.ts
```

## 5.7 Frontend Components

```text
KnowledgeItemPicker / KnowledgeItemList
CollectionList / CollectionCard / CollectionForm / CollectionDetailView
CollectionStatsPanel / CollectionRelatedPanel
ThreadList / ThreadCard / ThreadForm / ThreadWorkspace
ThreadQuestionList / ThreadDiscoveryList / ThreadActivityFeed
ExtractionToggle / ImportProgressList / ImageSourcePreview
SavedViewMenu / SaveViewDialog
InboxList / InboxItemCard / InboxReviewPanel / InboxBadge
```

Existing source/note/editor/Observatory components are extended where appropriate.

## 5.8 Frontend Routes

```text
collections
collections/:collectionId
threads
threads/:threadId
inbox
```

Saved Views remain inside Observatory.

---

# 6. Shared Rules

## 6.1 Knowledge Item Types

```text
note | source | entity | conversation
```

These are the only valid Collection/Thread membership types.

## 6.2 Membership Semantics

- Membership references existing objects.
- No knowledge object is cloned.
- An object can belong to many Collections and Threads.
- Deleting a Collection/Thread deletes memberships only.
- Deleting a referenced object cascades its memberships.
- Cross-workspace membership is rejected.
- Duplicate membership returns `409 CONFLICT`.

## 6.3 Workspace Isolation Without Authentication

Authentication remains out of scope.

Isolation means:

- list endpoints are scoped by workspace;
- object endpoints derive scope from the object;
- cross-workspace membership is forbidden;
- references cannot connect objects across workspaces.

Knowing an object ID remains sufficient to request it, as in previous releases.

## 6.4 `created_by`

Collections, Threads, and Saved Views carry `created_by`, following the existing note pattern. It is metadata, not authorization.

## 6.5 Pagination

List endpoints use `page` (default 1) and `page_size` (default 20, maximum 100) and return:

```json
{"items": [], "total": 0, "page": 1, "page_size": 20}
```

---

# 7. Database Schema Contract

All UUID primary keys use the established `uuid.uuid4` default. Timestamps are UTC.

## 7.1 New Tables

### `collections`

```text
id UUID PK
workspace_id UUID NOT NULL
name String(150) NOT NULL
description Text NULL
icon String(32) NULL
created_by UUID NOT NULL
created_at DateTime NOT NULL
updated_at DateTime NOT NULL
```

Unique `(workspace_id, name)`.

### Collection membership

```text
collection_notes
collection_sources
collection_entities
collection_conversations
```

Each contains the parent ID, target object ID, and `added_at`, with composite primary keys and real foreign keys.

### `threads`

```text
id UUID PK
workspace_id UUID NOT NULL
title String(200) NOT NULL
question Text NULL
status String(20) NOT NULL
created_by UUID NOT NULL
created_at DateTime NOT NULL
updated_at DateTime NOT NULL
```

Status is `active` or `archived`.

### Thread membership

```text
thread_notes
thread_sources
thread_entities
thread_conversations
```

### `thread_questions`

```text
id
thread_id
text
is_resolved
created_at
updated_at
```

### `thread_discoveries`

```text
id
thread_id
content
created_at
```

### `saved_views`

```text
id
workspace_id
name
state JSONB
created_by
created_at
updated_at
```

Unique `(workspace_id, name)`.

### `inbox_items`

```text
id
workspace_id
source_id
status
 detection_status
detected_count
detected_entities JSONB
detection_truncated
extraction_job_id
created_at
decided_at
```

One Inbox item per source.

## 7.2 Existing Table Changes

### `notes`

Add:

```text
extract_knowledge BOOLEAN NOT NULL DEFAULT true
```

### `sources`

Add:

```text
extract_knowledge BOOLEAN NOT NULL DEFAULT true
mime_type String(100) NULL
```

### `entity_chunks`

Change `note_id` to nullable and add:

```text
source_id UUID nullable
```

`source_id` references `sources.id ON DELETE CASCADE`.

Exactly one of `note_id` and `source_id` must be populated.

Existing rows are backfilled with `extract_knowledge=true`.

## 7.3 Required Indexes

Indexes must exist for:

- Collection workspace/update ordering.
- Collection membership reverse lookups.
- Thread workspace/status ordering.
- Thread membership reverse lookups.
- Thread questions.
- Thread discoveries.
- Saved Views by workspace.
- Inbox workspace/status.
- `entity_chunks.source_id`.

## 7.4 Migration Requirements

A single Alembic revision implements the release schema.

It must:

- be created only after schema handoff;
- create all new tables;
- add all required columns/indexes;
- be reversible;
- pass the migration drift gate;
- upgrade a clean database;
- upgrade a database seeded with v0.4.1 data.

Downgrade may delete source-derived `entity_chunks` rows before restoring `note_id NOT NULL`; this data loss must be documented in the migration docstring.

## 7.5 Reindex Safety

Existing graph reindex behavior must **not** delete entities that are members of a Collection or Thread.

Before removing an AI-extracted entity during reindex, the backend must determine whether it is referenced by:

```text
collection_entities
thread_entities
```

Referenced entities must be retained.

Ali must update the reindex service if required and add regression tests. Reindex must never silently destroy user organization.

---

# 8. API Contract

All new endpoints are under:

`/api/v1/workspaces/{workspace_id}`

unless otherwise stated.

## 8.1 Collections

```text
POST   /collections
GET    /collections
GET    /collections/{collection_id}
PATCH  /collections/{collection_id}
DELETE /collections/{collection_id}

GET    /collections/{collection_id}/items
POST   /collections/{collection_id}/items
DELETE /collections/{collection_id}/items/{item_type}/{item_id}

GET    /collections/{collection_id}/stats
GET    /collections/{collection_id}/related
```

Create:

```json
{"name":"Machine Learning","description":"My ML knowledge","icon":"book"}
```

Add item:

```json
{"item_type":"note","item_id":"uuid"}
```

Collection relationships are derived, not stored.

## 8.2 Threads

```text
POST   /threads
GET    /threads
GET    /threads/{thread_id}
PATCH  /threads/{thread_id}
DELETE /threads/{thread_id}

GET    /threads/{thread_id}/items
POST   /threads/{thread_id}/items
DELETE /threads/{thread_id}/items/{item_type}/{item_id}

GET    /threads/{thread_id}/questions
POST   /threads/{thread_id}/questions
PATCH  /threads/{thread_id}/questions/{question_id}
DELETE /threads/{thread_id}/questions/{question_id}

GET    /threads/{thread_id}/discoveries
POST   /threads/{thread_id}/discoveries
DELETE /threads/{thread_id}/discoveries/{discovery_id}

GET    /threads/{thread_id}/activity
```

Thread creation:

```json
{"title":"How does RAG work?","question":"Understand the complete RAG pipeline."}
```

## 8.3 Saved Views

```text
POST   /saved-views
GET    /saved-views
GET    /saved-views/{saved_view_id}
PATCH  /saved-views/{saved_view_id}
DELETE /saved-views/{saved_view_id}
```

## 8.4 Knowledge Inbox

Source upload:

```text
POST /sources/upload?review_mode=inbox
```

Inbox:

```text
GET    /inbox
GET    /inbox/{inbox_item_id}
PATCH  /inbox/{inbox_item_id}
POST   /inbox/{inbox_item_id}/accept
POST   /inbox/{inbox_item_id}/reject
POST   /inbox/{inbox_item_id}/redetect
```

PATCH may change source title and `extract_knowledge`. Detected concepts are read-only.

## 8.5 Extraction Fields

Notes and Sources expose:

```json
{"extract_knowledge":true}
```

Changing the setting does not automatically delete already-extracted graph objects.

## 8.6 Upload Formats

Existing:

```text
markdown | txt | pdf
```

New:

```text
docx | html | epub | json | csv | image
```

Server-side validation is mandatory.

---

# 9. Error Contract

Use the existing API error envelope.

Relevant errors:

```text
VALIDATION_ERROR
NOT_FOUND
CONFLICT
UNSUPPORTED_MEDIA_TYPE
PROCESSING_ERROR
```

Examples:

- duplicate membership → `409 CONFLICT`
- cross-workspace item → `422 VALIDATION_ERROR`
- unknown resource → `404 NOT_FOUND`
- unsupported file → `415 UNSUPPORTED_MEDIA_TYPE`

Do not create a second error-envelope system.

---

# 10. Extraction and Graph Behavior

## 10.1 Note Extraction

Existing note extraction continues, except `extract_knowledge=false` prevents automatic extraction.

The decision is centralized in `services/extraction_policy_service.py`.

## 10.2 Source Extraction

Textual source extraction:

1. Parse source content.
2. Chunk source content.
3. Extract entities.
4. Record provenance through `entity_chunks.source_id`.
5. Extract relationships.
6. Update graph indexes.

Images skip entity and relationship extraction.

## 10.3 Extraction Disabled

A source/note with extraction disabled remains available to Library, search, Collections, Threads, and Stella references.

## 10.4 Inbox Dry Run

Inbox detection must not mutate graph entities, relationships, provenance, or graph indexes.

It stores preview results only in Inbox staging fields and is limited to the first N chunks and 100 concepts.

## 10.5 Source Graph Job

`extract_source_graph_job` must:

- respect extraction policy;
- be idempotent;
- preserve provenance;
- report failures;
- update indexing state.

---

# 11. Import System

## 11.1 Extractor Interface

New extractors are resolved through `services/extractors/__init__.py` using:

```python
get_extractor(source_type)
```

Textual extractors produce normalized text and metadata.

## 11.2 DOCX

Extract readable text. DOCX is ZIP-based and must use safe archive limits.

## 11.3 HTML

Extract readable textual content. Imported HTML is never rendered directly in the application.

## 11.4 EPUB

Extract readable book/chapter text. EPUB is ZIP-based and must use safe archive limits.

## 11.5 JSON

Convert structured JSON into deterministic textual content. Reject structures exceeding configured depth/size limits.

## 11.6 CSV

Convert rows into deterministic textual content. Existing upload-size limits apply.

## 11.7 Images

Raster image formats only.

Images are validated, stored, registered as Sources, and expose MIME type plus width/height/format where available.

Images do not run OCR, vision models, captions, visual embeddings, entity extraction, relationship extraction, or EXIF/GPS extraction.

SVG is rejected.

## 11.8 Dependencies

Ali owns backend dependency additions required for DOCX, EPUB, HTML, and image validation. Dependencies must be added explicitly to the backend manifest and lockfile and must not be introduced by Infrastructure.

---

# 12. Knowledge Inbox Behavior

## 12.1 Creation

Inbox mode is created by `review_mode=inbox` during source upload.

The Source is created immediately, but permanent graph extraction is deferred.

## 12.2 Pending State

Text source:

```text
status = pending
detection_status = queued
```

Image:

```text
status = pending
detection_status = not_applicable
```

## 12.3 Detection

Dry-run detection stores up to 100 concepts and writes no graph records.

## 12.4 Acceptance

Accept:

1. marks the Inbox item accepted;
2. records `decided_at`;
3. starts normal extraction if enabled;
4. keeps the Source in the Library.

Images become normal Library Sources without graph extraction.

## 12.5 Rejection

Reject requires UI confirmation and permanently removes the Inbox item, Source, chunks, vectors, and stored original.

---

# 13. Saved Observatory Views

## 13.1 Purpose

A Saved View stores Observatory UI state, not a graph snapshot.

## 13.2 Versioned State

Canonical state:

```json
{
  "version": 1,
  "zoom": 1.0,
  "center": {"x": 0.0, "y": 0.0},
  "filters": {},
  "focus_entity_ids": []
}
```

The backend validates this schema, rejects unknown keys, and enforces a serialized-state size cap.

## 13.3 Restore

Restoring a Saved View loads the state onto the current graph, ignores deleted focus entities, and never modifies graph data.

---

# 14. Response and Provenance Requirements

## 14.1 Membership Responses

Membership responses contain:

```text
item_type
item_id
title/name
added_at
```

plus sufficient metadata for normal frontend rendering.

## 14.2 Entity Provenance

Entity provenance distinguishes `note_id` and `source_id`.

Source-derived provenance uses `source_id`; note-derived provenance continues using `note_id`.

## 14.3 Collection Related Knowledge

Related knowledge is computed at request time. Displaying related knowledge never creates a graph edge.

---

# 15. Frontend Behavior

## 15.1 Collections

Provide list, create, edit, delete, member picker, member list, statistics, and related knowledge. Collections are not nested folders.

## 15.2 Threads

The Thread workspace clearly distinguishes the guiding question, attached knowledge, open questions, discoveries, Stella conversation references, and activity. It must not imply Thread-scoped Stella retrieval.

## 15.3 Extraction Toggle

The UI explains that disabling extraction stores material without automatically extracting it into the graph. It does not hide the material from Library, search, Collections, Threads, or Stella references.

## 15.4 Inbox

Display source title, file type, extraction setting, detection status, detected concept preview, and accept/reject actions. Reject requires confirmation.

## 15.5 Images

Images display real previews in Library/source detail. The UI must not claim image contents have been understood.

---

# 16. Testing Requirements

## 16.1 Backend

Ali adds tests for Collections, membership, duplicate membership, cross-workspace rejection, Threads, questions, discoveries, Saved Views, extraction policy, all import formats, image handling, Inbox lifecycle, source graph extraction, provenance, reindex safety, and exact response shapes.

Every new endpoint gets contract tests.

## 16.2 Frontend

Hamza tests Collection flows, Thread flows, extraction toggle, import UI, image display, Inbox review, Saved Views, and loading/error/empty states.

## 16.3 Integration

Rehan adds coverage for:

```text
upload → source creation → Inbox → accept → extraction job → graph
```

```text
note/source → Collection → Observatory
```

```text
note/source → Thread → Stella reference
```

## 16.4 E2E

Playwright covers at minimum:

1. Create Collection and add existing knowledge.
2. Create Thread and attach existing knowledge.
3. Import a textual file into Inbox and accept it.
4. Import an image and verify display without extraction.
5. Save and restore an Observatory View.
6. Disable extraction and verify no new graph extraction occurs.
7. Reindex and verify Collection/Thread entity memberships survive.

---

# 17. Environment Variables

Expected new storage variable:

```text
SOURCE_STORAGE_ROOT=/app/data/sources
```

If v0.4.1 already provides an equivalent storage variable, the existing variable replaces this one through the amendment process.

No secrets are committed. `.env.example` documents all required development variables.

---

# 18. Docker and Storage

## 18.1 Source Storage Volume

Source storage persists across container recreation. Only Workstream C modifies Compose.

## 18.2 Compose Watch

Existing Compose Watch behavior remains intact. Source synchronization must never overwrite persistent source storage. Database volumes remain untouched.

## 18.3 Image Storage

Images use the same persistent source-storage mechanism as other uploaded originals. No separate image service is introduced.

---

# 19. Documentation

Rehan maintains:

```text
docs/baseline-v0.4.2.md
docs/v0.4.2-api.md
docs/v0.4.2-imports.md
docs/v0.4.2-integration.md
```

Documentation covers baseline verification, API behavior, supported formats, image limitations, extraction controls, Inbox lifecycle, Saved View state, and integration verification.

README changes are limited to user-visible v0.4.2 capabilities.

---

# 20. Acceptance Criteria

v0.4.2 is complete only when:

- [ ] Collections can be created, edited, deleted, and listed.
- [ ] Notes, Sources, Entities, and Conversations can be attached to Collections.
- [ ] Collection membership never duplicates underlying knowledge.
- [ ] Collection statistics work.
- [ ] Related knowledge works without creating graph edges.
- [ ] Threads can be created, edited, archived, deleted, and listed.
- [ ] Threads can reference Notes, Sources, Entities, and Conversations.
- [ ] Threads support open questions and discoveries.
- [ ] Thread activity is derived from supported existing events.
- [ ] `extract_knowledge` exists on Notes and Sources.
- [ ] Extraction policy is centralized.
- [ ] Textual Sources can participate in entity and relationship extraction.
- [ ] Source-derived provenance is preserved.
- [ ] DOCX, HTML, EPUB, JSON, and CSV imports work.
- [ ] Raster image imports work.
- [ ] SVG is rejected.
- [ ] Images are never interpreted.
- [ ] EXIF/GPS metadata is not extracted.
- [ ] Saved Observatory Views can be created, restored, renamed, and deleted.
- [ ] Saved Views do not snapshot or duplicate the graph.
- [ ] Inbox uploads can be reviewed.
- [ ] Inbox detection is a dry run.
- [ ] Inbox acceptance triggers normal extraction when enabled.
- [ ] Inbox rejection permanently removes the uploaded source and stored data.
- [ ] Reindex cannot destroy entities referenced by Collections or Threads.
- [ ] Existing v0.4.1 functionality continues to work.
- [ ] API contract tests pass.
- [ ] Backend tests pass.
- [ ] Frontend tests pass.
- [ ] Integration tests pass.
- [ ] Playwright E2E tests pass in CI.
- [ ] Type checking passes.
- [ ] Lint passes.
- [ ] Alembic drift checks pass.
- [ ] Clean database migration passes.
- [ ] Existing v0.4.1 database upgrades successfully.
- [ ] Docker Compose builds and starts the stack.
- [ ] Source storage survives container recreation.
- [ ] No production mock data is introduced.
- [ ] No authentication/authorization is introduced.
- [ ] No image interpretation is introduced.
- [ ] No unrelated feature work is included.

---

# 21. Release Sequence

```text
1. Baseline verification
        ↓
2. Environment handoff
        ↓
3. Backend schema handoff
        ↓
4. Database migration
        ↓
5. Backend + frontend implementation in parallel
        ↓
6. Integration tests
        ↓
7. E2E / CI verification
        ↓
8. Integration branch
        ↓
9. Final review
        ↓
10. Merge to main
```

Frontend and backend may implement in parallel once canonical API and schema shapes are fixed.

No workstream may bypass a gate in §0.

---

# 22. Final Product Principle

v0.4.2 should make Hyades a system for **working with knowledge**, not merely storing it.

**Collections** answer:

> Where does this knowledge belong?

**Threads** answer:

> What am I trying to understand or investigate?

**Library** stores the material.

**Observatory** shows relationships.

**Stella** helps investigate.

**Inbox** controls what enters the permanent knowledge workflow.

The graph remains the shared underlying knowledge structure.

Collections and Threads are organizational/workflow layers over the same underlying knowledge, not duplicated folders or isolated copies.
