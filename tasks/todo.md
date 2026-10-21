# Tasks: v0.5.1 Backend Workstream (Rehan)

- [x] Phase 0: Baseline Verification & Documentation
  - [x] Baseline verification report (`docs/architecture/v0.5.1-baseline-verification.md`)
  - [x] Schema handoff document (`docs/architecture/v0.5.1-schema-handoff.md`)
  - [x] Master implementation plan (`tasks/plan.md`)

- [x] Phase 1: Models & Schemas
  - [x] Create `ActionExecution` model (`backend/app/models/action_execution.py`)
  - [x] Create `ActionProposal` model (`backend/app/models/action_proposal.py`)
  - [x] Create `ActionChangeSet` model (`backend/app/models/action_change_set.py`)
  - [x] Register new models in `backend/app/models/__init__.py`
  - [x] Add unit test `backend/tests/test_v0_5_1_models.py`
  - [x] Run pytest to verify model registration and SQLite in-memory constraints

- [x] Phase 2: Action Registry & Catalogue Schemas
  - [x] Create `backend/app/schemas/action.py`
  - [x] Create `backend/app/actions/registry.py` with 37 frozen actions
  - [x] Add `backend/tests/test_action_registry.py` validating §7.5 and §15.1
  - [x] Run pytest to verify registry integrity

- [x] Phase 3: Action Handlers
  - [x] Implement read handlers (12 actions) in `backend/app/actions/handlers/read.py`
  - [x] Implement understand handlers (11 actions) in `backend/app/actions/handlers/understand.py`
  - [x] Implement review handlers (8 actions) in `backend/app/actions/handlers/review.py`
  - [x] Implement controlled write handlers (6 actions) in `backend/app/actions/handlers/writes.py`
  - [x] Add and run individual tests for all 37 actions in `backend/tests/actions/test_actions_individual.py`

- [x] Phase 4: Execution Service, Two-Phase Writes, & Undo
  - [x] Implement `ActionExecutionService` in `backend/app/services/action_execution_service.py`
  - [x] Implement propose/commit/reject token management with SHA-256 token hashing
  - [x] Implement change set tracking and safe undo for all 6 reversible write mutations
  - [x] Implement cancellation, idempotency deduplication, and workspace concurrency limiting (§11.2)
  - [x] Run service unit and mutation tests in `backend/tests/test_actions_mutations.py`

- [x] Phase 5: API Endpoints & Routing
  - [x] Implement API endpoints in `backend/app/api/v1/actions.py`
  - [x] Mount router in `backend/app/api/v1/router.py`
  - [x] Implement comprehensive API tests in `backend/tests/test_actions_api.py`

- [x] Phase 6: Final Integration & Regression Verification
  - [x] Verify all 37 action tests (`test_action_<action_id>`)
  - [x] Verify full regression suite (206 baseline + 67 new tests = 273 passed)
  - [x] Generate v0.5.1 implementation report (§17)
