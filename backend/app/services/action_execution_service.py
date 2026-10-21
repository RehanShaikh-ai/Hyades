"""Action execution service managing lifecycle, two-phase writes, idempotency, and undo.

Canonical service per CONTRACT v0.5.1 §3.2, §5.1, §6.1, §6.2, §6.4, §6.5, §6.7, §6.8, §9, §11.1, §11.2.
"""

import hashlib
import logging
import secrets
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.actions.handlers import writes as write_handlers
from app.actions.registry import get_action
from app.actions.types import ActionHandlerResult
from app.core.config import settings
from app.core.exceptions import (
    AppException,
    ConflictError,
    ValidationError,
    WorkspaceNotFoundError,
)
from app.models.action_change_set import ActionChangeSet
from app.models.action_execution import ActionExecution
from app.models.action_proposal import ActionProposal
from app.models.workspace import Workspace
from app.schemas.action import (
    ActionExecuteRequest,
    ActionResultEnvelope,
    CommittedChangeItem,
    EvidenceItem,
    ExecutionListResponse,
    ExecutionSummaryItem,
    ProposalItem,
    UndoResponse,
)

logger = logging.getLogger("app.services.action_execution_service")


def _hash_token(raw_token: str) -> str:
    """Generate SHA-256 hash of raw confirmation token per §4.1."""
    return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()


def _envelope_from_execution(
    db: Session,
    execution: ActionExecution,
    raw_token: str | None = None,
    duration_ms: int = 0,
) -> ActionResultEnvelope:
    """Construct canonical ActionResultEnvelope from persistent execution record per §9."""
    proposals_data: list[ProposalItem] = []
    for prop in execution.proposals:
        proposals_data.append(
            ProposalItem(
                proposal_id=prop.id,
                action_id=prop.action_id,
                changes=prop.proposal_payload,
                affected_item_ids=list(prop.proposal_payload.keys()),
                confirmation_token=raw_token if prop.status == "pending" else None,
                expires_at=prop.expires_at,
                status=prop.status,
            )
        )

    committed_changes: list[CommittedChangeItem] = []
    for cs in execution.change_sets:
        committed_changes.append(
            CommittedChangeItem(
                change_set_id=cs.id,
                action_id=cs.action_id,
                affected_item_ids=cs.affected_item_ids,
                changes=cs.after_state or {},
                committed_at=cs.committed_at,
                undo_status=cs.undo_status,
            )
        )

    result_dict = execution.result_payload or {}
    evidence_raw = result_dict.pop("__evidence__", [])
    evidence_items = [
        EvidenceItem(**e) if isinstance(e, dict) else e for e in evidence_raw
    ]
    interpretation = result_dict.pop("__interpretation__", None)

    return ActionResultEnvelope(
        execution_id=execution.id,
        action_id=execution.action_id,
        status=execution.status,
        initiated_by="user",
        result=result_dict,
        evidence=evidence_items,
        interpretation=interpretation,
        proposals=proposals_data,
        committed_changes=committed_changes,
        duration_ms=duration_ms,
    )


def execute_action(
    db: Session,
    workspace_id: uuid.UUID,
    action_id: str,
    request: ActionExecuteRequest,
) -> ActionResultEnvelope:
    """Validate and execute an action execution request per Contract v0.5.1 §5.1, §6.2, §6.7."""
    start_time = time.perf_counter()

    # 1. Verify workspace exists (§5)
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError("Workspace not found.")

    # 2. Verify registered action ID (§3.1)
    action = get_action(action_id)

    # 3. Mode validation against action classification (§5.1)
    if action.side_effect == "read" and request.mode != "read":
        raise ValidationError(
            f"Action '{action_id}' is a read-only action and does not support mode '{request.mode}'."
        )
    if action.side_effect in ("propose", "destructive") and request.mode not in ("propose", "commit"):
        raise ValidationError(
            f"Action '{action_id}' requires two-phase execution with mode 'propose' or 'commit'."
        )

    # 4. Idempotency Check (§6.7)
    existing = db.scalars(
        select(ActionExecution).where(
            ActionExecution.workspace_id == workspace_id,
            ActionExecution.action_id == action_id,
            ActionExecution.idempotency_key == request.idempotency_key,
        )
    ).first()
    if existing:
        logger.info(
            "Idempotent hit for execution (%s, %s, %s)",
            workspace_id,
            action_id,
            request.idempotency_key,
        )
        duration_ms = int((time.perf_counter() - start_time) * 1000)
        return _envelope_from_execution(db, existing, duration_ms=duration_ms)

    # 5. Concurrency Limit Enforcement (§11.2)
    max_concurrent = settings.ACTION_MAX_CONCURRENT_PER_WORKSPACE
    active_count = db.scalar(
        select(func.count(ActionExecution.id)).where(
            ActionExecution.workspace_id == workspace_id,
            ActionExecution.status.in_(["running", "cancelling"]),
        )
    ) or 0
    if active_count >= max_concurrent:
        raise AppException(
            429,
            "CONCURRENCY_LIMIT_REACHED",
            f"Active action concurrency limit of {max_concurrent} reached for this workspace.",
        )

    # 6. Validate input against canonical schema (§3.1, §5)
    try:
        validated_input = action.input_schema_cls.model_validate(request.input)
    except PydanticValidationError as e:
        invalid_fields = [str(err["loc"][0]) for err in e.errors() if err.get("loc")]
        raise ValidationError(
            f"Validation failed for fields: {', '.join(invalid_fields)}"
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Phase 2: Commit (§6.2)
    # ─────────────────────────────────────────────────────────────────────────
    if request.mode == "commit":
        if not request.confirmation_token:
            raise ValidationError("Confirmation token is required for commit mode.")

        token_hash = _hash_token(request.confirmation_token)
        proposal = db.scalars(
            select(ActionProposal).where(
                ActionProposal.confirmation_token_hash == token_hash,
                ActionProposal.workspace_id == workspace_id,
            )
        ).first()

        if not proposal:
            raise AppException(404, "TOKEN_INVALID", "Confirmation token is invalid or does not exist.")
        if proposal.status == "committed":
            raise ConflictError("Confirmation token has already been committed.")
        if proposal.status == "rejected":
            raise ConflictError("Proposal has already been rejected.")
        exp = proposal.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=UTC)
        if datetime.now(UTC) > exp:
            proposal.status = "expired"
            db.commit()
            raise AppException(422, "TOKEN_EXPIRED", "Confirmation token has expired.")

        # Create persistent execution record for the commit
        execution = ActionExecution(
            workspace_id=workspace_id,
            action_id=action_id,
            status="running",
            initiated_by="user",
            idempotency_key=request.idempotency_key,
            input_payload=request.input,
            started_at=datetime.now(UTC),
        )
        db.add(execution)
        db.commit()

        # Apply the mutation atomically
        try:
            commit_result, affected_ids, before_st, after_st = write_handlers.execute_commit(
                db=db,
                workspace_id=workspace_id,
                action_id=action_id,
                proposal_payload=proposal.proposal_payload,
            )

            # Record change set (§6.4)
            change_set = ActionChangeSet(
                workspace_id=workspace_id,
                execution_id=execution.id,
                action_id=action_id,
                affected_item_ids=[str(i) for i in affected_ids],
                before_state=jsonable_encoder(before_st) if before_st else None,
                after_state=jsonable_encoder(after_st) if after_st else None,
                committed_at=datetime.now(UTC),
                undo_status="not_undone",
            )
            db.add(change_set)

            # Mark proposal committed
            proposal.status = "committed"
            proposal.committed_at = datetime.now(UTC)

            # Mark execution succeeded
            execution.status = "succeeded"
            execution.result_payload = jsonable_encoder(commit_result)
            execution.completed_at = datetime.now(UTC)
            db.commit()
            db.refresh(execution)

            duration_ms = int((time.perf_counter() - start_time) * 1000)
            return _envelope_from_execution(db, execution, duration_ms=duration_ms)

        except Exception as exc:
            db.rollback()
            execution.status = "failed"
            execution.error_code = "COMMIT_EXECUTION_ERROR"
            execution.error_message = str(exc)
            execution.completed_at = datetime.now(UTC)
            db.commit()
            raise

    # ─────────────────────────────────────────────────────────────────────────
    # Phase 1: Propose (§6.2)
    # ─────────────────────────────────────────────────────────────────────────
    if request.mode == "propose":
        execution = ActionExecution(
            workspace_id=workspace_id,
            action_id=action_id,
            status="running",
            initiated_by="user",
            idempotency_key=request.idempotency_key,
            input_payload=request.input,
            started_at=datetime.now(UTC),
        )
        db.add(execution)
        db.commit()

        try:
            handler_result: ActionHandlerResult = action.handler(db, workspace_id, validated_input)

            # Generate cryptographically secure token & SHA-256 hash (§4.1, §6.2)
            raw_token = secrets.token_urlsafe(32)
            token_hash = _hash_token(raw_token)
            expires_at = datetime.now(UTC) + timedelta(minutes=15)

            proposal_payload = handler_result.proposals[0] if handler_result.proposals else request.input
            proposal = ActionProposal(
                execution_id=execution.id,
                workspace_id=workspace_id,
                action_id=action_id,
                proposal_payload=jsonable_encoder(proposal_payload),
                confirmation_token_hash=token_hash,
                status="pending",
                expires_at=expires_at,
            )
            db.add(proposal)

            # Attach evidence and interpretation for serialization
            res_dict = dict(handler_result.result)
            if handler_result.evidence:
                res_dict["__evidence__"] = [e.model_dump() for e in handler_result.evidence]
            if handler_result.interpretation:
                res_dict["__interpretation__"] = handler_result.interpretation

            execution.status = "proposed"
            execution.result_payload = jsonable_encoder(res_dict)
            db.commit()
            db.refresh(execution)

            duration_ms = int((time.perf_counter() - start_time) * 1000)
            return _envelope_from_execution(db, execution, raw_token=raw_token, duration_ms=duration_ms)

        except Exception as exc:
            db.rollback()
            execution.status = "failed"
            execution.error_code = "PROPOSAL_GENERATION_ERROR"
            execution.error_message = str(exc)
            execution.completed_at = datetime.now(UTC)
            db.commit()
            raise

    # ─────────────────────────────────────────────────────────────────────────
    # Read & Direct Write Actions (§7.1, §7.3)
    # ─────────────────────────────────────────────────────────────────────────
    execution = ActionExecution(
        workspace_id=workspace_id,
        action_id=action_id,
        status="running",
        initiated_by="user",
        idempotency_key=request.idempotency_key,
        input_payload=request.input,
        started_at=datetime.now(UTC),
    )
    db.add(execution)
    db.commit()

    try:
        handler_result: ActionHandlerResult = action.handler(db, workspace_id, validated_input)

        res_dict = dict(handler_result.result)
        if handler_result.evidence:
            res_dict["__evidence__"] = [e.model_dump() for e in handler_result.evidence]
        if handler_result.interpretation:
            res_dict["__interpretation__"] = handler_result.interpretation

        # If a write action produced affected items, record change set
        if action.side_effect == "write" and handler_result.affected_item_ids:
            change_set = ActionChangeSet(
                workspace_id=workspace_id,
                execution_id=execution.id,
                action_id=action_id,
                affected_item_ids=[str(i) for i in handler_result.affected_item_ids],
                before_state=jsonable_encoder(handler_result.before_state) if handler_result.before_state else None,
                after_state=jsonable_encoder(handler_result.after_state) if handler_result.after_state else None,
                committed_at=datetime.now(UTC),
                undo_status="not_undone",
            )
            db.add(change_set)

        execution.status = "succeeded"
        execution.result_payload = jsonable_encoder(res_dict)
        execution.completed_at = datetime.now(UTC)
        db.commit()
        db.refresh(execution)

        duration_ms = int((time.perf_counter() - start_time) * 1000)
        return _envelope_from_execution(db, execution, duration_ms=duration_ms)

    except Exception as exc:
        db.rollback()
        execution.status = "failed"
        execution.error_code = getattr(exc, "code", "EXECUTION_FAILED")
        execution.error_message = getattr(exc, "message", str(exc))
        execution.completed_at = datetime.now(UTC)
        db.commit()
        raise


def get_execution(
    db: Session, workspace_id: uuid.UUID, execution_id: uuid.UUID
) -> ActionResultEnvelope:
    """Retrieve execution status and result scoped to workspace per Contract §5."""
    execution = db.get(ActionExecution, execution_id)
    if not execution or execution.workspace_id != workspace_id:
        raise AppException(404, "EXECUTION_NOT_FOUND", "Execution not found in workspace.")

    return _envelope_from_execution(db, execution)


def cancel_execution(
    db: Session, workspace_id: uuid.UUID, execution_id: uuid.UUID
) -> ActionResultEnvelope:
    """Request cancellation of an active execution per Contract §6.8."""
    execution = db.get(ActionExecution, execution_id)
    if not execution or execution.workspace_id != workspace_id:
        raise AppException(404, "EXECUTION_NOT_FOUND", "Execution not found in workspace.")

    if execution.status in ("succeeded", "failed", "cancelled"):
        raise ConflictError(f"Cannot cancel execution in terminal state '{execution.status}'.")

    # Transition to cancelling then cancelled (§6.8)
    execution.status = "cancelling"
    db.commit()

    # Finalize cancellation
    execution.status = "cancelled"
    execution.completed_at = datetime.now(UTC)
    db.commit()
    db.refresh(execution)

    return _envelope_from_execution(db, execution)


def list_executions(
    db: Session,
    workspace_id: uuid.UUID,
    offset: int = 0,
    limit: int = 20,
) -> ExecutionListResponse:
    """Paginated list of executions within workspace per Contract §5."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError("Workspace not found.")

    query = (
        select(ActionExecution)
        .where(ActionExecution.workspace_id == workspace_id)
        .order_by(ActionExecution.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    total = db.scalar(
        select(func.count(ActionExecution.id)).where(ActionExecution.workspace_id == workspace_id)
    ) or 0

    items = list(db.scalars(query).all())
    summaries = [
        ExecutionSummaryItem(
            execution_id=e.id,
            action_id=e.action_id,
            status=e.status,
            initiated_by=e.initiated_by,
            current_stage=e.current_stage,
            created_at=e.created_at,
            started_at=e.started_at,
            completed_at=e.completed_at,
            error_code=e.error_code,
        )
        for e in items
    ]

    return ExecutionListResponse(items=summaries, total=total, offset=offset, limit=limit)


def reject_proposal(
    db: Session, workspace_id: uuid.UUID, proposal_id: uuid.UUID
) -> dict[str, Any]:
    """Reject a pending proposal per Contract §6.4."""
    proposal = db.get(ActionProposal, proposal_id)
    if not proposal or proposal.workspace_id != workspace_id:
        raise AppException(404, "PROPOSAL_NOT_FOUND", "Proposal not found in workspace.")

    if proposal.status != "pending":
        raise ConflictError(f"Cannot reject proposal in '{proposal.status}' state.")

    proposal.status = "rejected"
    proposal.rejected_at = datetime.now(UTC)
    db.commit()

    return {"proposal_id": str(proposal.id), "status": "rejected"}


def undo_change_set(
    db: Session, workspace_id: uuid.UUID, change_set_id: uuid.UUID
) -> UndoResponse:
    """Execute undo operation for a recorded change-set per Contract §6.5."""
    change_set = db.get(ActionChangeSet, change_set_id)
    if not change_set or change_set.workspace_id != workspace_id:
        raise AppException(404, "CHANGE_SET_NOT_FOUND", "Change set not found in workspace.")

    mutation_details = write_handlers.execute_undo(db, workspace_id, change_set)
    return UndoResponse(
        change_set_id=change_set.id,
        undo_status=change_set.undo_status,
        undone_at=change_set.undone_at or datetime.now(UTC),
        mutation_details=mutation_details,
    )
