"""Job and action execution progress persistence service.

Contract references:
    CONTRACT_v0.5.1.md:
    §4.1  — Existing index_jobs table: total_items, completed_items, failed_items, current_stage, updated_at.
    §6.7  — Idempotency & retry accounting:
            - A retry of a failed item MUST move that item from failed to pending and decrement failed_items by one.
            - A retry MUST NOT increment total_items for the same logical item.
            - Progress counts MUST represent unique logical items, not HTTP requests.
    §10.1 — Progress model:
            - Every long-running job MUST report: total_items, completed_items, failed_items, current_stage, updated_at.
            - Progress MUST be persisted atomically to PostgreSQL.
            - Frontend refresh MUST NOT erase execution progress.
            - Explicit stages for queued, running, committing, cancelling, completed, and failed work.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models.action_execution import ActionExecution
from app.models.index_job import IndexJob


def update_index_job_progress(
    db: Session,
    job_id: uuid.UUID,
    total_items: int,
    completed_items: int,
    failed_items: int,
    current_stage: str,
    extra_metadata: dict[str, Any] | None = None,
) -> IndexJob:
    """Atomically update and persist progress for an IndexJob per §10.1.

    Guarantees progress is committed immediately so client refreshes never lose state.
    """
    job = db.get(IndexJob, job_id)
    if job is None:
        raise ValueError(f"IndexJob {job_id} not found")

    progress_payload: dict[str, Any] = {
        "total_items": total_items,
        "completed_items": completed_items,
        "failed_items": failed_items,
        "current_stage": current_stage,
        # Legacy compatibility keys
        "total_notes": total_items,
        "processed_notes": completed_items,
        "stage": current_stage,
    }
    if extra_metadata:
        progress_payload.update(extra_metadata)

    job.progress = progress_payload
    job.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(job)
    return job


def record_retry_progress(
    current_progress: dict[str, Any] | None,
    item_id: str,
    success: bool,
) -> dict[str, Any]:
    """Calculate progress update following a retry per §6.7 rules.

    Rules:
    - Retry must not increment total_items for the same logical item.
    - If previously failed, decrement failed_items by one.
    - If retry succeeded, increment completed_items by one.
    - Counts represent unique logical items.
    """
    progress = dict(current_progress or {})
    total_items = progress.get("total_items", progress.get("total_notes", 0))
    completed_items = progress.get("completed_items", progress.get("processed_notes", 0))
    failed_items = progress.get("failed_items", 0)

    failed_list = list(progress.get("failed_notes", []))
    previously_failed = any(
        (isinstance(f, dict) and f.get("item_id") == item_id or f.get("note_id") == item_id)
        for f in failed_list
    )

    if previously_failed:
        # Move from failed to pending/processed
        failed_items = max(0, failed_items - 1)
        failed_list = [
            f for f in failed_list
            if not (isinstance(f, dict) and (f.get("item_id") == item_id or f.get("note_id") == item_id))
        ]

    if success:
        completed_items += 1
    else:
        failed_items += 1
        failed_list.append({"item_id": item_id, "failed_at": datetime.now(UTC).isoformat()})

    progress["total_items"] = total_items
    progress["completed_items"] = completed_items
    progress["failed_items"] = failed_items
    progress["failed_notes"] = failed_list
    progress["total_notes"] = total_items
    progress["processed_notes"] = completed_items
    return progress


def update_action_execution_stage(
    db: Session,
    execution_id: uuid.UUID,
    current_stage: str,
    status: str | None = None,
    error_code: str | None = None,
    error_message: str | None = None,
    result_payload: dict[str, Any] | None = None,
) -> ActionExecution:
    """Persist execution stage and status atomically per §6.1, §10.1."""
    execution = db.get(ActionExecution, execution_id)
    if execution is None:
        raise ValueError(f"ActionExecution {execution_id} not found")

    execution.current_stage = current_stage
    execution.updated_at = datetime.now(UTC)

    if status is not None:
        execution.status = status
        if status == "running" and execution.started_at is None:
            execution.started_at = datetime.now(UTC)
        elif status in ("succeeded", "failed", "cancelled") and execution.completed_at is None:
            execution.completed_at = datetime.now(UTC)

    if error_code is not None:
        execution.error_code = error_code
    if error_message is not None:
        execution.error_message = error_message
    if result_payload is not None:
        execution.result_payload = result_payload

    db.commit()
    db.refresh(execution)
    return execution
