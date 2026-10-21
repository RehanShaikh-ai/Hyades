# Implementation Plan: v0.5.1 Backend Workstream (Rehan)

**Contract:** `docs/contracts/CONTRACT_v0.5.1.md`  
**Owner:** Rehan (Backend)  
**Status:** In Progress  

---

## 1. Architectural Strategy & Shared Interfaces

### 1.1 Boundaries & Collaboration
- **Backend (Rehan):** Action registry, handlers, API, validation, execution state, two-phase writes, proposals, commits, change sets, undo, and search merging.
- **Infrastructure (Ali):** Database schemas, Alembic migrations, drift gates, job queue/ARQ, progress persistence, concurrency limits, and latency benchmarks.
- **Frontend (Hamza):** Action catalogue UI, input forms, result views, proposal confirmation UI, Markdown previews, deduplication, and accessibility.

### 1.2 Shared Interface Contracts
- **Canonical Action Registry:** Defined exclusively at `backend/app/actions/registry.py`. Frontend consumes `GET /actions` and must never maintain a second action catalogue.
- **Result Envelope Shape (§9):**
  - `execution_id: UUID`
  - `action_id: str`
  - `status: str`
  - `initiated_by: "user"`
  - `result: dict`
  - `evidence: list[dict]`
  - `interpretation: str | None`
  - `proposals: list[dict]`
  - `committed_changes: list[dict]`
  - `duration_ms: int`
- **Execution Lifecycle & Transitions (§6.1):**
  `pending` → `running` → `proposed` / `awaiting_confirmation` / `succeeded` / `failed` / `cancelling` / `cancelled`

---

## 2. Work Breakdown Structure

### Phase 1: Database Models & Schemas (Schema Handoff)
- [x] Baseline verification recorded (`docs/architecture/v0.5.1-baseline-verification.md`)
- [x] Schema handoff document written (`docs/architecture/v0.5.1-schema-handoff.md`)
- [ ] Implement SQLAlchemy models:
  - `ActionExecution` (`backend/app/models/action_execution.py`)
  - `ActionProposal` (`backend/app/models/action_proposal.py`)
  - `ActionChangeSet` (`backend/app/models/action_change_set.py`)
  - Register in `backend/app/models/__init__.py`
- [ ] Add model unit tests in `backend/tests/test_v0_5_1_models.py`
- [ ] Verify model creation against SQLite in-memory test database

### Phase 2: Action Registry & Schemas
- [ ] Create `backend/app/schemas/action.py` (Pydantic request, response, catalogue, and execution models)
- [ ] Create `backend/app/actions/registry.py`:
  - Exactly 37 frozen action definitions (12 read, 11 understand, 8 review, 6 controlled writes)
  - Input & output schemas for all 37 actions
  - Side effect classifications (`read`, `propose`, `write`, `destructive`)
  - Timeout classes (`read`, `search`, `llm`)
- [ ] Add registry verification tests in `backend/tests/test_action_registry.py` (§15.1, §7.5):
  - Exactly 37 unique action IDs
  - No duplicate IDs
  - Input & output schema present
  - Matching test naming convention `test_action_<action_id>`

### Phase 3: Action Handlers Implementation (`backend/app/actions/handlers/`)
- [ ] Read Action Handlers (12 actions):
  - `knowledge.search_all`: Cross-type search (notes, sources, entities, collections, threads), merged ranking, similarity scores
  - `notes.get`, `notes.search`
  - `sources.get`, `sources.search`, `sources.get_processing_status`
  - `entities.get`, `entities.search`
  - `graph.get_neighbors`, `graph.find_path`
  - `collections.get`
  - `threads.get`
- [ ] Understand Action Handlers (11 actions):
  - `notes.summarize`, `sources.summarize`, `collections.summarize`, `threads.summarize`, `entities.summarize`
  - `notes.compare`, `sources.compare`
  - `knowledge.answer`, `knowledge.generate_brief`
  - `notes.extract_concepts`, `notes.suggest_tags`
- [ ] Review Action Handlers (8 actions):
  - `inbox.list`, `inbox.accept`, `inbox.reject` (using existing v0.3.1/v0.3.2 mechanisms)
  - `sources.retry_processing`
  - `knowledge.audit_processing`
  - `graph.find_isolated_nodes`, `graph.suggest_relationships`
  - `notes.find_related`
- [ ] Controlled Write Handlers (6 actions):
  - `notes.create`
  - `notes.update`
  - `notes.link`
  - `collections.add_item` (polymorphic: note, source, entity, conversation)
  - `graph.add_relationship`
  - `notes.delete` (destructive, requires title & id confirmation, snapshot for undo)

### Phase 4: Execution Service, Two-Phase Writes, & Undo Engine
- [ ] `ActionExecutionService` (`backend/app/services/action_execution_service.py`):
  - Idempotency check with atomic uniqueness `(workspace_id, action_id, idempotency_key)`
  - Concurrency limiter per workspace (`ACTION_MAX_CONCURRENT_PER_WORKSPACE`, default 2)
  - Timeouts (5s read, 10s search, configured provider timeout for LLM)
  - Phase 1: Propose (generate secure token, SHA-256 hash, expiry, persist proposal, return proposal envelope)
  - Phase 2: Commit (verify token hash, verify unexpired and uncommitted, revalidate target records, atomic mutation, record change set)
  - Rejection: mark proposal rejected
  - Change Set Recording: store affected IDs, before-state snapshot, after-state
  - Undo Engine:
    - Safe verification (target record hasn't changed unsafely)
    - Apply reverse mutation, create new version/record, update undo status
    - Test undo for notes.create, notes.update, notes.link, collections.add_item, graph.add_relationship, notes.delete
  - Cancellation Engine: transition to `cancelling`, abort handler execution, transition to `cancelled`

### Phase 5: HTTP API Endpoints & Routing
- [ ] Create `backend/app/api/v1/actions.py`:
  - `GET /actions`: Canonical catalogue
  - `POST /actions/{id}/execute`: Workspace-scoped execution (modes: `read`, `propose`, `commit`)
  - `GET /actions/executions/{id}`: Result envelope and progress
  - `POST /actions/executions/{id}/cancel`: Cancellation request
  - `GET /actions/executions`: Paginated list of workspace executions
  - `POST /actions/proposals/{id}/reject`: Proposal rejection
  - `POST /actions/change-sets/{id}/undo`: Undo endpoint
- [ ] Register router in `backend/app/api/v1/router.py`
- [ ] Ensure consistent error handling with stable error codes (§10.3)

### Phase 6: Automated Test Suite & Regression Verification
- [ ] Create 37 individual action tests (`test_action_<action_id>`) in `backend/tests/actions/test_action_*.py`
- [ ] API integration tests in `backend/tests/test_actions_api.py` (§15.2):
  - Catalogue retrieval, unknown action ID, invalid schema
  - Workspace scoping enforcement
  - Idempotency deduplication
  - Two-phase write & confirmation token expiry/hash verification
  - Destructive note deletion confirmation & undo
  - Concurrency limits & timeouts
  - Cancellation state transitions
- [ ] Run full test suite and confirm all baseline (206) + new tests pass
