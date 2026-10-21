# Hyades v0.5.1 Contract
## Manual Actions, Safe Execution, and Performance

**Document type:** Implementation contract  
**Release:** v0.5.1  
**Status:** Proposed baseline for implementation  
**Repository:** `knowledge-atlas`  
**Product name:** Hyades

---

## 0. Purpose and release scope

Hyades v0.5.1 MUST provide a reliable manual action system.

The user MUST be able to select an action, provide its inputs, review its output, and control any resulting changes.

The backend MUST own action validation, execution state, confirmation, cancellation, idempotency, and result reporting.

The frontend MUST use the backend action registry. The frontend MUST NOT maintain a separate action catalogue.

This release MUST include:

1. The 37 actions in Section 7.
2. A persistent execution and proposal model.
3. Server-enforced confirmation for proposed changes.
4. Reviewable change sets and undo for supported mutations.
5. Execution progress, failure reporting, and cancellation.
6. Latency benchmarks and action evaluation tests.
7. The existing Hyades visual design and established application behavior.

This release MUST NOT include autonomous action selection, multi-step agent planning, or Stella personality selection. These features belong to v0.5.2.

The implementation MUST NOT add an action because an existing backend function makes it easy to add. The frozen list in Section 7 defines the release scope.

## 1. Normative language

The terms **MUST**, **MUST NOT**, and **ONLY** define mandatory requirements.

A requirement without a test or a verifiable result is incomplete.

The implementation MUST NOT use phrases such as “where supported”, “where appropriate”, or “when possible” to avoid a requirement in this contract.

## 2. Baseline verification

Before implementation, the team MUST inspect the repository and verify the current v0.4.2 baseline.

The team MUST record the result of each check.

1. Confirm the current branch and working-tree state.
2. Confirm that the application starts with the existing Compose configuration.
3. Confirm the current database schema and applied migrations.
4. Confirm the current action-related backend and frontend code.
5. Confirm the existing AI-edit approval mechanism from v0.3.1.
6. Confirm the existing suggestion accept/reject mechanism from v0.3.2.
7. Confirm the actual meaning of Threads in v0.4.2.
8. Confirm whether “Sky” and “Observatory” refer to the same graph interface.
9. Confirm whether authentication and authorization exist.
10. Confirm that the v0.4.2 behavior used by this contract exists in the repository.

The team MUST NOT assume that a feature exists because an earlier contract describes it.

If authentication does not exist, the team MUST record that fact. For v0.5.1, workspace scoping MUST define the data-isolation boundary. The team MUST NOT describe workspace scoping as authentication or user-level authorization.

The team MUST NOT add an authorization test for a nonexistent authorization system.

The team MUST NOT delete tables, reset the database, or remove existing data as part of baseline verification.

Any conflict between the actual repository and this contract MUST be recorded before implementation. The team MUST resolve the conflict through the contract and schema handoff process in Section 4.

## 3. Architecture and boundaries

### 3.1 Action registry

The backend MUST define the canonical action registry at:

`backend/app/actions/registry.py`

The registry MUST define every action in Section 7.

Each action MUST have:

- A unique action ID.
- A human-readable name.
- A description.
- An input schema.
- An output schema.
- A side-effect classification.
- A handler.
- A timeout class.
- A matching automated test.

The action ID MUST follow this pattern:

`<domain>.<verb>`

Example: `notes.summarize`.

The side-effect classification MUST use one of these values:

- `read`: Reads existing data.
- `propose`: Produces a proposed change without applying it.
- `write`: Applies a permitted change.
- `destructive`: Deletes or irreversibly changes data.

An action MUST NOT execute if its ID is absent from the registry.

### 3.2 Execution service

The backend MUST validate each request before execution.

The backend MUST verify the action ID, input schema, workspace scope, confirmation requirements, and idempotency key.

The backend MUST NOT accept an arbitrary function name or executable instruction from the client.

The backend MUST NOT convert natural-language model output directly into an action call.

In v0.5.1, an LLM action MUST return text, evidence, or a proposal. The action executor MUST receive a validated action request through the registered interface.

### 3.3 Frontend catalogue

The frontend MUST retrieve available actions from `GET /actions`.

The frontend MUST use the returned action IDs, descriptions, input schemas, and classifications.

The frontend MUST NOT hard-code a second authoritative list of actions.

The frontend MUST display required inputs and validation errors before execution.

The frontend MUST display execution status, output, evidence, proposals, committed changes, and errors returned by the backend.

### 3.4 Responsibilities

The work MUST use these ownership boundaries:

| Workstream | Owner | Primary responsibility |
|---|---|---|
| **Backend** | **Rehan** | Action registry, handlers, API, validation, execution state, two-phase writes, proposals, commits, change sets, undo, and search merging |
| **Infrastructure** | **Ali** | Database schemas, Alembic migrations, drift gates, job queue/ARQ, progress persistence, concurrency limits, and latency benchmarks |
| **Frontend** | **Hamza** | Action catalogue UI, input forms, result views, proposal confirmation UI, Markdown previews, deduplication, and accessibility |

The named owner MUST review changes to files within that workstream.

The team MUST identify the actual file owners after baseline verification. The table above defines responsibility, not permission to overwrite existing code.

Shared files MUST have one designated integration owner for each change.

### 3.5 File conflict protocol

Before a contributor edits a shared file, the contributor MUST check the current branch and working-tree state.

Contributors MUST NOT overwrite another contributor’s uncommitted changes.

If two workstreams need the same file, the owners MUST agree on the interface before either workstream changes that interface.

The contributor MUST commit a coherent change before handing a shared file to another workstream.

The integration owner MUST review the combined diff and run the affected tests.

The team MUST NOT solve a merge conflict by deleting a feature without approval from its owner.

## 4. Schema handoff and migration control

### 4.1 Required schema changes

This release requires persistent execution state and proposal state. It also requires more detailed job progress.

The implementation MUST define and document the following schema changes before it applies a migration.

**`action_executions`**

The table MUST store:

- `id`: execution UUID and primary key.
- `workspace_id`: workspace scope.
- `action_id`: registered action ID.
- `status`: current execution status.
- `initiated_by`: `user` in v0.5.1.
- `idempotency_key`: client-provided execution key.
- `input_payload`: validated input data.
- `result_payload`: action result.
- `error_code`: stable error code, when execution fails.
- `error_message`: safe error message, when execution fails.
- `current_stage`: current stage.
- `created_at`: creation time.
- `started_at`: start time, when started.
- `updated_at`: last update time.
- `completed_at`: completion time, when finished.

The database MUST enforce uniqueness for `(workspace_id, action_id, idempotency_key)`.

**`action_proposals`**

The table MUST store:

- `id`: proposal UUID and primary key.
- `execution_id`: associated execution.
- `workspace_id`: workspace scope.
- `action_id`: registered action ID.
- `proposal_payload`: proposed changes.
- `confirmation_token_hash`: hash of the confirmation token.
- `status`: proposal status.
- `created_at`: creation time.
- `updated_at`: last update time.
- `expires_at`: token expiry time.
- `committed_at`: commit time, when committed.
- `rejected_at`: rejection time, when rejected.

The database MUST NOT store the raw confirmation token.

**Existing `index_jobs` table**

The table MUST contain:

- `total_items`
- `completed_items`
- `failed_items`
- `current_stage`
- `updated_at`

The implementation MUST preserve existing job data.

If an equivalent column already exists, the schema handoff MUST document its reuse. The migration MUST NOT create a duplicate column.

### 4.2 Migration gate

The schema owner MUST produce a migration plan and an updated schema description.

The backend owner MUST review the migration.

The team MUST apply migrations through the existing project migration system.

The team MUST verify that the migration works against a copy of the current schema.

The team MUST verify that existing records remain available after migration.

The team MUST NOT apply an unreviewed schema change.

The team MUST NOT drop an existing table or column to make this contract easier to implement.

### 4.3 Drift gate

Before integration, the team MUST compare:

1. Migration files.
2. The schema expected by the application.
3. The schema in the development database.

The three MUST agree.

The team MUST record any existing drift and resolve it before release acceptance.

## 5. HTTP API

The backend MUST expose these endpoints.

| Method | Endpoint | Requirement |
|---|---|---|
| `GET` | `/actions` | Return the canonical action catalogue. |
| `POST` | `/actions/{id}/execute` | Validate and start an action execution. |
| `GET` | `/actions/executions/{id}` | Return execution status and result. |
| `POST` | `/actions/executions/{id}/cancel` | Request cancellation of an active execution. |
| `GET` | `/actions/executions` | List executions within the current workspace. |

Every endpoint MUST enforce workspace scope.

An unknown action ID MUST return a client error. It MUST NOT invoke a fallback handler.

Invalid input MUST return a validation error with the invalid field names.

An execution ID from another workspace MUST NOT reveal its result or proposal.

The execution-list endpoint MUST support pagination.

The API MUST use the project’s existing response and error conventions where they exist. Any new response fields MUST be documented.

### 5.1 Execute request

An execution request MUST include:

- `mode`: `read`, `propose`, or `commit`.
- `input`: action-specific input.
- `idempotency_key`: a unique key for the logical execution.

A `commit` request MUST also include `confirmation_token`.

The backend MUST reject a mode that conflicts with the action classification.

The backend MUST NOT accept a client request to change an action’s registered classification.

### 5.2 Action catalogue response

Each catalogue entry MUST include:

- `id`
- `name`
- `description`
- `input_schema`
- `output_schema`
- `side_effect`
- `timeout_class`

The response MUST contain exactly the 37 actions in Section 7, unless an action is temporarily disabled because its dependency is unavailable. A disabled action MUST remain visible with a clear disabled reason. It MUST NOT be silently removed from the catalogue.

## 6. Execution lifecycle and safe changes

### 6.1 Execution statuses

The system MUST support these statuses:

- `pending`
- `running`
- `proposed`
- `awaiting_confirmation`
- `succeeded`
- `failed`
- `cancelling`
- `cancelled`

The backend MUST validate every status transition.

A completed execution MUST NOT return to `running`.

A cancelled execution MUST NOT commit a proposed change.

A failed execution MUST return a stable error code and a safe explanation.

### 6.2 Two-phase writes

All proposed writes MUST use a server-enforced two-phase process.

**Phase 1: Propose**

The client sends `mode: propose`.

The backend validates the request and creates a persistent proposal.

The backend returns:

- The execution ID.
- The proposal ID.
- The proposed changes.
- The affected item IDs.
- A confirmation token.
- The token expiry time.
- The execution status.

The backend MUST NOT apply the proposed changes during this phase.

**Phase 2: Commit**

The client sends `mode: commit` with the confirmation token.

The backend MUST verify the token, workspace, proposal status, expiry time, and affected items.

The backend MUST reject an expired, invalid, already-used, or out-of-scope token.

The backend MUST apply the proposed changes only after successful validation.

The backend MUST record the committed changes and the commit time.

The confirmation decision MUST be enforced by the server. A frontend-only confirmation is not sufficient.

### 6.3 Existing approval mechanisms

The implementation MUST reuse the existing AI-edit approval mechanism from v0.3.1 and the existing suggestion accept/reject mechanism from v0.3.2.

The implementation MUST NOT create a third independent approval system.

The baseline verification MUST identify the existing interfaces. The team MUST document how action proposals use those interfaces.

If the existing interfaces cannot support the required server-side checks, the team MUST document the gap and implement the smallest compatible extension.

### 6.4 Change sets

Every committed write MUST produce a change-set record.

A change set MUST contain:

- A change-set ID.
- The execution ID.
- The action ID.
- The affected item IDs.
- The before-state or a recoverable reference to it.
- The after-state or a recoverable reference to it.
- The commit time.
- The undo status.

Before commit, the UI MUST display a reviewable summary of the proposed changes.

The user MUST be able to accept or reject a proposal.

The UI MUST identify the affected records before a bulk commit.

A proposal MUST NOT change data before confirmation.

### 6.5 Undo

The system MUST provide an undo operation for every supported mutation in Section 7 that has a recoverable prior state.

Undo MUST create a new recorded mutation. It MUST NOT erase the original execution history.

Undo MUST verify that the affected record has not changed in a way that would make restoration unsafe.

If safe restoration is not possible, the backend MUST reject undo and explain why.

The UI MUST NOT show undo as successful until the backend confirms it.

The implementation MUST test undo for `notes.create`, `notes.update`, `notes.link`, `collections.add_item`, and `graph.add_relationship`.

For `notes.delete`, the backend MUST retain sufficient recovery data to restore the note during the supported undo period.

### 6.6 Destructive actions

`notes.delete` is the only destructive action in the frozen list.

It MUST require a valid confirmation token.

The proposal MUST identify the note by ID and title.

The backend MUST verify the note’s workspace scope before deletion.

The backend MUST reject deletion if the note no longer matches the proposal.

The backend MUST record the deletion and retain the information required for supported undo.

The backend MUST NOT silently cascade-delete unrelated records.

### 6.7 Idempotency and retry

Every execution MUST have an `idempotency_key`.

A repeated request with the same workspace, action ID, and key MUST NOT create a second logical execution or duplicate a committed mutation.

The backend MUST return the existing execution or its current state for a repeated request.

A retry of a failed item MUST move that item from `failed` to `pending` and decrement `failed_items` by one.

A retry MUST NOT increment `total_items` for the same logical item.

Progress counts MUST represent unique logical items, not HTTP requests.

The backend MUST use a transaction or equivalent atomic mechanism to protect idempotency and commit state.

### 6.8 Cancellation

The client MUST be able to request cancellation for a running execution.

The backend MUST transition the execution to `cancelling` before it reports that cancellation is in progress.

The backend MUST transition to `cancelled` only after the handler confirms that execution has stopped.

The frontend MUST NOT claim that an execution has stopped while the backend reports `cancelling`.

The backend MUST NOT commit a proposal after cancellation has been confirmed.

If the underlying operation cannot be interrupted, the backend MUST report that limitation. It MUST NOT report a false cancellation.

## 7. Frozen action inventory

This section defines the complete action scope for v0.5.1.

The release MUST implement exactly these 37 actions. An action MUST NOT be replaced by a similarly named action without a contract change.

### 7.1 Read actions: 12

| Action ID | Required behavior | Classification |
|---|---|---|
| `knowledge.search_all` | Search notes, sources, entities, collections, and threads. | `read` |
| `notes.get` | Return one note and its supported metadata. | `read` |
| `notes.search` | Search notes by text and supported search criteria. | `read` |
| `sources.get` | Return one source and its supported metadata. | `read` |
| `sources.search` | Search sources by text and supported search criteria. | `read` |
| `sources.get_processing_status` | Return processing state for one source. | `read` |
| `entities.get` | Return one entity and its supported metadata. | `read` |
| `entities.search` | Search entities by name and supported lexical criteria. | `read` |
| `graph.get_neighbors` | Return the neighbors of a graph node. | `read` |
| `graph.find_path` | Find a path between supported graph nodes. | `read` |
| `collections.get` | Return one collection and its items. | `read` |
| `threads.get` | Return one investigation Thread and its attached information. | `read` |

### 7.2 Understand actions: 11

| Action ID | Required behavior | Classification |
|---|---|---|
| `notes.summarize` | Produce a summary of a note. | `read` |
| `sources.summarize` | Produce a summary of a source. | `read` |
| `collections.summarize` | Produce a summary of a collection and its supported items. | `read` |
| `threads.summarize` | Produce a summary of a Thread’s investigation material. | `read` |
| `entities.summarize` | Produce a summary of an entity and its available evidence. | `read` |
| `notes.compare` | Compare two or more notes. | `read` |
| `sources.compare` | Compare two or more sources. | `read` |
| `knowledge.answer` | Answer a question using retrieved Hyades knowledge. | `read` |
| `knowledge.generate_brief` | Generate a structured brief from retrieved knowledge. | `read` |
| `notes.extract_concepts` | Extract concepts from a note. | `read` |
| `notes.suggest_tags` | Suggest tags for a note. | `read` |

An understand action MUST NOT commit a change to stored knowledge.

If an action generates a proposed edit, it MUST return the proposal. A separate confirmation and commit operation MUST apply it.

### 7.3 Review actions: 8

| Action ID | Required behavior | Classification |
|---|---|---|
| `inbox.list` | List Inbox items with supported filters. | `read` |
| `inbox.accept` | Accept one Inbox item through the existing approval mechanism. | `write` |
| `inbox.reject` | Reject one Inbox item through the existing rejection mechanism. | `write` |
| `sources.retry_processing` | Retry processing for a failed source. | `write` |
| `knowledge.audit_processing` | Report processing state and known processing failures across supported knowledge items. | `read` |
| `graph.find_isolated_nodes` | Find graph nodes with no supported relationships. | `read` |
| `graph.suggest_relationships` | Suggest possible graph relationships without committing them. | `read` |
| `notes.find_related` | Find notes related to a given note. | `read` |

`inbox.accept` and `inbox.reject` MUST use the existing approval and rejection mechanisms. They MUST NOT create a second Inbox state model.

The backend MUST report the resulting Inbox state.

`sources.retry_processing` MUST use the existing processing system. It MUST report the job or execution ID.

`graph.suggest_relationships` MUST return proposals only. It MUST NOT create relationships.

### 7.4 Controlled writes: 6

| Action ID | Required behavior | Classification |
|---|---|---|
| `notes.create` | Create a note from validated content and metadata. | `propose` |
| `notes.update` | Propose updates to an existing note. | `propose` |
| `notes.link` | Propose a link between supported note records. | `propose` |
| `collections.add_item` | Propose adding a supported item to a collection. | `propose` |
| `graph.add_relationship` | Propose a relationship between supported graph nodes. | `propose` |
| `notes.delete` | Propose deletion of one note. | `destructive` |

The six controlled-write actions MUST validate their target IDs and workspace scope.

The commit operation MUST revalidate the target records before applying the proposal.

`collections.add_item` MUST support the item types already supported by v0.4.2 collections. The action MUST NOT assume that collections contain notes only.

The action MUST use the ID `collections.add_item`. The old name `collections.add_note` MUST NOT appear as a second registered action.

### 7.5 Action count and registry tests

The registry MUST contain 37 unique action IDs.

The registry MUST contain 12 read actions, 11 understand actions, 8 review actions, and 6 controlled-write actions.

CI MUST fail if the count or the required IDs do not match this contract.

CI MUST iterate over the registry and verify that every action has a matching test named:

`test_action_<action_id>`

The test naming convention MUST replace the dot in the action ID with an underscore if required by the test framework. The mapping MUST be deterministic.

### 7.6 Deferred actions

The following actions MUST NOT be implemented as new v0.5.1 action IDs.

| Deferred capability | Reason |
|---|---|
| Duplicate-finding actions across multiple domains | Duplicate scope. Reconsider after the first release. |
| Additional processing-status actions | Duplicate of the canonical source status and processing audit actions. |
| Claims extraction, search, and trace | Claims data model is not part of the verified baseline. |
| Evidence Graph actions | Evidence Graph is a later roadmap capability. |
| Source version history | Version model must be verified and designed separately. |
| Graph contradiction detection | Requires a defined contradiction model. |
| Entity merge and split | Requires provenance-preserving merge and split semantics. |
| Archive actions for sources, entities, and collections | Archive behavior and restoration rules are not established by this contract. |
| Workspace export | Export format and scope are not defined here. |
| Inbox restore | v0.4.2 rejection may be irreversible. Restoration semantics must be designed first. |
| Additional collection mutation actions | Only `collections.add_item` is in scope. |
| Additional Thread conversation actions | Threads are investigation workspaces, not Stella conversations. |
| Autonomous action selection and multi-step planning | Planned for v0.5.2. |
| Stella personality selection | Planned for v0.5.2. |

Deferred actions MUST NOT be exposed through hidden endpoints or alternate frontend controls.

## 8. Search and evidence

### 8.1 Search method by item type

`knowledge.search_all` MUST search all five supported item types.

| Item type | Required search method |
|---|---|
| Notes | Vector search and lexical search. |
| Sources | Vector search and lexical search. |
| Entities | Name-based lexical search. |
| Collections | Title-based lexical search. |
| Threads | Title-based lexical search. |

The action MUST merge and rank the supported results.

The action MUST identify the item type and item ID for each result.

The action MUST NOT claim semantic search for an item type that only uses lexical search.

`notes.search` and `sources.search` MUST use the existing supported search infrastructure.

The implementation MUST preserve the established source and chunk identification rules.

### 8.2 Evidence structure

The API MUST use `similarity_score` for similarity values.

The API MUST NOT label a similarity value as `confidence`.

Each evidence item MUST include:

- `chunk_id`, when the evidence comes from a chunk.
- `source_id`, when the evidence belongs to a source.
- `similarity_score`, when a similarity score exists.
- The supported item type and item ID.
- A text excerpt or reference sufficient to locate the evidence.

Fields that do not apply MUST be omitted or set to `null` according to the project’s API conventions.

### 8.3 Evidence and interpretation

The response MUST keep retrieved evidence separate from model interpretation.

Evidence MUST identify the stored material that supports the result.

Interpretation MUST contain the generated explanation, comparison, summary, or answer.

The model MUST NOT present an unsupported interpretation as retrieved evidence.

If the system has no relevant evidence, it MUST report that limitation.

The system MUST NOT invent a source ID, chunk ID, quote, or similarity score.

## 9. Result envelope

Every execution endpoint MUST return a consistent result envelope.

The following example defines the required shape:

```json
{
  "execution_id": "uuid",
  "action_id": "notes.summarize",
  "status": "succeeded",
  "initiated_by": "user",
  "result": {},
  "evidence": [
    {
      "chunk_id": "uuid",
      "source_id": "uuid",
      "similarity_score": 0.87
    }
  ],
  "interpretation": "string",
  "proposals": [],
  "committed_changes": [],
  "duration_ms": 1240
}
```

The API MUST return these fields:

- `execution_id`
- `action_id`
- `status`
- `initiated_by`
- `result`
- `evidence`
- `interpretation`
- `proposals`
- `committed_changes`
- `duration_ms`

`initiated_by` MUST be `user` for all v0.5.1 executions.

The schema MUST allow `agent` as a future value. The v0.5.1 UI MUST NOT offer agent initiation.

The backend MUST return an empty array for `evidence`, `proposals`, or `committed_changes` when no items exist.

The backend MUST return `null` for an absent interpretation when the action produces none.

`duration_ms` MUST represent the elapsed time of the execution. It MUST NOT be an estimated value.

The backend MUST return the current status for an active execution.

The backend MUST return the final status and result for a completed execution.

The result envelope MUST NOT expose secrets, raw confirmation tokens, provider credentials, or internal stack traces.

## 10. Progress, bulk operations, and failures

### 10.1 Progress model

Every long-running job MUST report:

- `total_items`
- `completed_items`
- `failed_items`
- `current_stage`
- `updated_at`

The counts MUST refer to unique logical items.

The backend MUST update progress when an item changes state.

The backend MUST persist progress. A frontend refresh MUST NOT erase execution progress.

The backend MUST report an explicit stage for queued, running, committing, cancelling, completed, and failed work.

The implementation MUST reuse the existing `index_jobs` table where it represents the relevant work. It MUST NOT create a duplicate progress system for the same job type.

### 10.2 Partial failure

Bulk Inbox operations MUST return a result for each item.

The response MUST identify each item by ID.

Each item result MUST include its status and error information when it fails.

A bulk operation MUST NOT use all-or-nothing semantics.

The backend MUST report successful items even when other items fail.

The backend MUST NOT retry a successful item merely because another item failed.

Before a bulk commit, the UI MUST show the complete list of affected item IDs.

The backend MUST validate each item before it changes that item.

### 10.3 Failure behavior

The backend MUST distinguish:

- Invalid input.
- Missing records.
- Workspace-scope violations.
- Expired confirmation tokens.
- Conflicting record changes.
- Provider timeouts.
- Rate-limit failures.
- Cancellation.
- Internal execution errors.

The backend MUST return stable error codes for these conditions.

The frontend MUST show an actionable message for each failure class.

The frontend MUST NOT convert a failed request into a success message.

The frontend MUST NOT hide failed items from a bulk result.

## 11. Performance and resource limits

### 11.1 Timeouts

The backend MUST enforce these timeout rules:

| Operation class | Timeout |
|---|---:|
| Read actions | 5 seconds |
| Search actions | 10 seconds |
| LLM actions | `PROVIDER_TIMEOUT_SECONDS` |

The LLM timeout MUST use the configured provider timeout.

The implementation MUST NOT use an unbounded timeout.

A timeout MUST produce a stable error code and a recorded execution result.

### 11.2 Concurrency

The backend MUST support the environment variable:

`ACTION_MAX_CONCURRENT_PER_WORKSPACE`

The default value MUST be `2`.

The backend MUST enforce this limit per workspace.

The backend MUST NOT start additional concurrent actions for a workspace after it reaches the limit.

The backend MUST return a clear queued or concurrency-limit status.

The concurrency limit MUST apply to LLM actions and other registered actions.

### 11.3 Latency benchmark

The team MUST create:

`docs/benchmarks/v0.5.1-latency.md`

The benchmark MUST use a reproducible fixture containing:

- 100 notes.
- 20 sources.
- Fixed seed data.
- Fixed benchmark queries.
- Documented hardware and runtime configuration.
- Documented model and provider configuration for LLM actions.

The benchmark MUST measure p50 and p95 latency for each tested operation.

The benchmark MUST include:

- Note retrieval.
- Source retrieval.
- Note search.
- Source search.
- Cross-knowledge search.
- Note summarization.
- Knowledge answering.
- Proposal creation.
- Proposal commit.
- Execution-status retrieval.

The team MUST record the baseline before performance changes.

The team MUST compare the final measurements against the baseline under the same conditions.

No measured operation may regress by more than 10% against baseline without a documented and approved exception.

A claimed performance improvement MUST include the baseline and final p50 and p95 values.

The team MUST NOT claim a performance improvement based only on subjective testing.

### 11.4 Action evaluation

The test suite MUST contain a fixed set of golden questions and expected evidence for the fixture workspace.

The evaluation MUST measure:

- Retrieval recall@5.
- Mean reciprocal rank (MRR).
- Citation precision.
- Whether the answer is supported by retrieved evidence.

The expected answers and evidence IDs MUST be version-controlled.

The test MUST fail when a required evidence item is missing or when a citation points to an unrelated record.

The evaluation MUST use deterministic checks where possible.

Any model-based judge MUST have a documented model, prompt, threshold, and failure policy. A model-based judge MUST NOT be the only check for critical action behavior.

The team MUST record the baseline evaluation result and the v0.5.1 result.

The release MUST NOT reduce the baseline retrieval metrics without an approved explanation and a passing regression review.

## 12. Markdown and document previews

The frontend MUST render Markdown with:

- `react-markdown`
- `remark-gfm`
- `rehype-sanitize`

The renderer MUST sanitize untrusted content.

The renderer MUST NOT execute scripts or unsafe HTML from imported documents.

The test suite MUST include a malicious Markdown fixture.

The renderer MUST support the `[[wikilinks]]` syntax used by imported Obsidian notes.

A wikilink MUST render as a link when its target resolves to a supported Hyades record.

An unresolved wikilink MUST remain readable. It MUST NOT produce a broken application view.

The preview MUST preserve headings, lists, tables, code blocks, and other supported Markdown structure.

## 13. Interface requirements

The interface MUST use the existing Hyades design system and “Ivory Observatory” visual direction.

The implementation MUST NOT introduce a separate visual theme for the action catalogue.

The interface MUST use the existing navigation and layout conventions.

The action catalogue MUST show the action name, description, inputs, side-effect classification, and execution status.

The result view MUST distinguish:

- Retrieved evidence.
- Generated interpretation.
- Proposed changes.
- Committed changes.
- Errors and failed items.

The user MUST be able to identify the affected records before confirming a write.

The user MUST be able to inspect a completed execution.

The user MUST be able to distinguish a proposal from a committed change.

The UI MUST NOT show a completed, cancelled, or committed state before the backend confirms it.

### 13.1 Existing Library controls

The Library UI MUST NOT show duplicate controls for the same operation.

The implementation MUST inspect the relevant components and files.

The team MUST compare the handlers and actual behavior of the redundant controls.

If two controls invoke the same operation, the team MUST retain one control and remove the duplicate.

The team MUST record the component names, file paths, handler comparison, and decision in the pull request.

The decision MUST NOT depend on a screenshot that other contributors cannot access.

### 13.2 Viewports and overflow

The frontend MUST be tested at these viewport sizes:

- 1280 × 720.
- 1440 × 900.
- 1920 × 1080.
- Minimum supported width: 768 pixels.

The application MUST NOT have unintended horizontal page overflow at these widths.

The action catalogue MUST remain usable at the minimum supported width.

The frontend MUST include automated accessibility checks with `@axe-core/playwright`.

The checks MUST cover the action catalogue, execution form, proposal review, confirmation flow, and result view.

The team MUST fix serious accessibility violations introduced by this release.

## 14. Security and data integrity

The backend MUST validate all action inputs.

The backend MUST enforce workspace scoping for every read, proposal, commit, and execution lookup.

The backend MUST NOT rely on frontend checks for data isolation.

The backend MUST verify confirmation tokens on the server.

The backend MUST reject expired and reused tokens.

The backend MUST apply commits atomically where the underlying data store supports transactions.

If a commit fails, the backend MUST report which changes were applied and which were not. It MUST NOT claim that a partial commit was atomic.

LLM output MUST NOT be parsed as executable action instructions.

LLM-generated proposals MUST pass the same validation and confirmation process as other proposals.

Imported content MUST be treated as untrusted data. Instructions found inside a source MUST NOT override the action registry, user request, or server validation.

The application MUST NOT expose provider credentials, confirmation tokens, or internal stack traces in action results.

## 15. Automated test requirements

### 15.1 Registry tests

CI MUST verify:

- Exactly 37 registered actions exist.
- Every required action ID exists.
- No duplicate action ID exists.
- Every action has an input schema.
- Every action has an output schema.
- Every action has a valid side-effect classification.
- Every action has a handler.
- Every action has a matching test.

### 15.2 API tests

The API test suite MUST cover:

- Catalogue retrieval.
- Valid and invalid inputs.
- Unknown action IDs.
- Execution creation.
- Execution status retrieval.
- Workspace scoping.
- Pagination.
- Confirmation-token validation.
- Expired and reused tokens.
- Idempotent repeated requests.
- Retry accounting.
- Cancellation.
- Provider timeouts.
- Concurrency limits.
- Partial bulk failures.
- Safe error responses.

### 15.3 Mutation tests

The test suite MUST verify propose, commit, and undo for:

- `notes.create`
- `notes.update`
- `notes.link`
- `collections.add_item`
- `graph.add_relationship`

The test suite MUST verify confirmation and recovery behavior for `notes.delete`.

The test suite MUST verify that rejected or expired proposals do not modify stored data.

The test suite MUST verify that a failed commit does not produce a false success response.

### 15.4 Frontend tests

Playwright tests MUST verify:

- Catalogue loading from the backend.
- Input validation.
- Execution progress.
- Proposal review.
- Confirmation and rejection.
- Committed-change reporting.
- Undo.
- Cancellation states.
- Partial-failure display.
- Markdown sanitization.
- Wikilink rendering.
- Accessibility checks.
- No unintended horizontal overflow at every required viewport.

The tests MUST exercise the actual running application.

A successful build alone MUST NOT count as frontend verification.

### 15.5 Regression requirements

The team MUST run the relevant existing test suite before and after implementation.

The team MUST NOT weaken or delete an existing assertion merely to make a test pass.

Any changed assertion MUST have a documented reason.

The team MUST fix release-blocking regressions before acceptance.

## 16. Release acceptance criteria

v0.5.1 is accepted only when all of the following conditions pass.

- [ ] Baseline verification is recorded.
- [ ] The action registry contains the exact 37-action inventory.
- [ ] All required API endpoints work.
- [ ] Schema changes pass the migration and drift gates.
- [ ] Server-side confirmation protects all proposed writes.
- [ ] Destructive note deletion requires confirmation.
- [ ] Change sets record every committed write.
- [ ] Supported mutations pass undo tests.
- [ ] Idempotency prevents duplicate logical executions.
- [ ] Progress counts remain correct after retries.
- [ ] Cancellation reports the actual backend state.
- [ ] Bulk operations report per-item results.
- [ ] Search uses the defined method for each item type.
- [ ] Evidence and interpretation remain separate.
- [ ] Timeout and concurrency limits work.
- [ ] The latency benchmark reports baseline and final p50/p95 values.
- [ ] No measured operation regresses by more than 10% without an approved exception.
- [ ] Golden-question evaluation passes its regression criteria.
- [ ] Markdown sanitization and wikilink tests pass.
- [ ] Required Playwright and accessibility checks pass.
- [ ] No unintended horizontal overflow exists at the required viewports.
- [ ] Existing regression tests pass.
- [ ] Each workstream has reviewed its changes.
- [ ] The final integrated diff contains no unrelated changes.
- [ ] All deviations from this contract are documented.

The release MUST NOT be marked complete while a required acceptance criterion fails.

## 17. Required implementation report

At completion, the team MUST report:

1. The branch name.
2. The commit IDs.
3. The files changed.
4. The migrations added and applied.
5. The actions implemented and tested.
6. The API endpoints verified.
7. The tests run and their results.
8. The benchmark baseline and final results.
9. The accessibility and viewport results.
10. Any contract deviations.
11. Any known defects.
12. The final working-tree state.

The report MUST distinguish verified results from incomplete work.

A feature MUST NOT be described as complete unless its acceptance tests pass.

---

**End of contract.**