# Tasks: v0.5.1 Backend Workstream (Rehan)

- [x] Phase 0: Baseline Verification & Documentation
  - [x] Baseline verification report (`docs/architecture/v0.5.1-baseline-verification.md`)
  - [x] Schema handoff document (`docs/architecture/v0.5.1-schema-handoff.md`)
  - [x] Master implementation plan (`tasks/plan.md`)

- [ ] Phase 1: Models & Schemas
  - [ ] Create `ActionExecution` model (`backend/app/models/action_execution.py`)
  - [ ] Create `ActionProposal` model (`backend/app/models/action_proposal.py`)
  - [ ] Create `ActionChangeSet` model (`backend/app/models/action_change_set.py`)
  - [ ] Register new models in `backend/app/models/__init__.py`
  - [ ] Add unit test `backend/tests/test_v0_5_1_models.py`
  - [ ] Run pytest to verify model registration and SQLite in-memory constraints

- [ ] Phase 2: Action Registry & Catalogue Schemas
  - [ ] Create `backend/app/schemas/action.py`
  - [ ] Create `backend/app/actions/registry.py` with 37 frozen actions
  - [ ] Add `backend/tests/test_action_registry.py` validating §7.5 and §15.1
  - [ ] Run pytest to verify registry integrity

- [ ] Phase 3: Action Handlers
  - [ ] Implement read handlers (12 actions)
  - [ ] Implement understand handlers (11 actions)
  - [ ] Implement review handlers (8 actions)
  - [ ] Implement controlled write handlers (6 actions)
  - [ ] Run pytest on action handler tests

- [ ] Phase 4: Execution Service, Two-Phase Writes, & Undo
  - [ ] Implement `ActionExecutionService` in `backend/app/services/action_execution_service.py`
  - [ ] Implement propose/commit/reject token management
  - [ ] Implement change set tracking and safe undo
  - [ ] Implement cancellation and workspace concurrency limiting
  - [ ] Run service unit tests

- [ ] Phase 5: API Endpoints & Routing
  - [ ] Implement API endpoints in `backend/app/api/v1/actions.py`
  - [ ] Mount router in `backend/app/api/v1/router.py`
  - [ ] Implement comprehensive API tests in `backend/tests/test_actions_api.py`

- [ ] Phase 6: Final Integration & Regression Verification
  - [ ] Verify all 37 action tests (`test_action_<action_id>`)
  - [ ] Verify full regression suite (206 baseline + all new tests)
  - [ ] Generate v0.5.1 implementation report (§17)
