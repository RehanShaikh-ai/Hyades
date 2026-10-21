"""Unit tests for v0.5.1 Job Progress Persistence and Retry Accounting.

Contract references:
    CONTRACT_v0.5.1.md:
    §4.1  — Existing index_jobs table: total_items, completed_items, failed_items, current_stage, updated_at.
    §6.7  — Idempotency and retry:
            - A retry of a failed item MUST move that item from failed to pending and decrement failed_items by one.
            - A retry MUST NOT increment total_items for the same logical item.
            - Progress counts MUST represent unique logical items, not HTTP requests.
    §10.1 — Progress model:
            - Every long-running job MUST report: total_items, completed_items, failed_items, current_stage, updated_at.
            - Counts MUST refer to unique logical items.
            - Progress MUST be persisted atomically.
            - Frontend refresh MUST NOT erase execution progress.
"""

from sqlalchemy.orm import Session

from app.models.action_execution import ActionExecution
from app.models.index_job import IndexJob
from app.models.user import User
from app.models.workspace import Workspace
from app.services.job_progress_service import (
    record_retry_progress,
    update_action_execution_stage,
    update_index_job_progress,
)


def test_index_job_progress_atomic_persistence(db_session: Session):
    """Verify IndexJob progress updates are saved atomically with updated_at timestamp."""
    user = User(display_name="Progress User")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Progress Workspace", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    job = IndexJob(
        workspace_id=workspace.id,
        job_type="index_workspace",
        status="running",
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    # Initial update
    updated_job = update_index_job_progress(
        db_session,
        job.id,
        total_items=50,
        completed_items=10,
        failed_items=1,
        current_stage="extracting",
        extra_metadata={"details": "batch 1"},
    )

    assert updated_job.total_items == 50
    assert updated_job.completed_items == 10
    assert updated_job.failed_items == 1
    assert updated_job.current_stage == "extracting"
    assert updated_job.updated_at is not None

    # Simulate client page refresh by retrieving fresh instance from DB
    db_session.expire_all()
    fresh_job = db_session.get(IndexJob, job.id)
    assert fresh_job is not None
    assert fresh_job.progress["total_items"] == 50
    assert fresh_job.progress["completed_items"] == 10
    assert fresh_job.progress["failed_items"] == 1
    assert fresh_job.progress["current_stage"] == "extracting"
    assert fresh_job.progress["details"] == "batch 1"


def test_retry_accounting_decrements_failed_and_does_not_increment_total():
    """Verify §6.7 rules: retry moves item from failed to pending/completed without inflating total_items."""
    # Step 1: Initial progress with 10 total items, 8 completed, 2 failed
    item_a_id = "item-uuid-a"
    item_b_id = "item-uuid-b"
    initial_progress = {
        "total_items": 10,
        "completed_items": 8,
        "failed_items": 2,
        "failed_notes": [
            {"item_id": item_a_id, "error": "timeout"},
            {"item_id": item_b_id, "error": "parse error"},
        ],
    }

    # Step 2: Retry item_a successfully
    updated = record_retry_progress(initial_progress, item_a_id, success=True)

    # Assert total_items remains 10 (NOT incremented to 11)
    assert updated["total_items"] == 10
    # completed_items increments from 8 to 9
    assert updated["completed_items"] == 9
    # failed_items decrements from 2 to 1
    assert updated["failed_items"] == 1
    # item_a is removed from failed_notes
    remaining_failed_ids = [f["item_id"] for f in updated["failed_notes"]]
    assert item_a_id not in remaining_failed_ids
    assert item_b_id in remaining_failed_ids

    # Step 3: Retry item_b and it fails again
    retry_fail = record_retry_progress(updated, item_b_id, success=False)
    # total_items remains 10
    assert retry_fail["total_items"] == 10
    # completed_items remains 9
    assert retry_fail["completed_items"] == 9
    # failed_items remains 1 (was previously failed, decremented then re-added)
    assert retry_fail["failed_items"] == 1


def test_action_execution_stage_updates(db_session: Session):
    """Verify action execution stage updates and timestamp transitions."""
    user = User(display_name="Stage User")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Stage Workspace", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    execution = ActionExecution(
        workspace_id=workspace.id,
        action_id="knowledge.generate_brief",
        status="pending",
        initiated_by="user",
        idempotency_key="brief-001",
        input_payload={},
    )
    db_session.add(execution)
    db_session.commit()
    db_session.refresh(execution)

    assert execution.started_at is None
    assert execution.completed_at is None

    # Transition to running
    update_action_execution_stage(
        db_session,
        execution.id,
        current_stage="retrieving_context",
        status="running",
    )
    db_session.refresh(execution)
    assert execution.status == "running"
    assert execution.current_stage == "retrieving_context"
    assert execution.started_at is not None
    assert execution.completed_at is None

    # Transition to succeeded
    update_action_execution_stage(
        db_session,
        execution.id,
        current_stage="completed",
        status="succeeded",
        result_payload={"brief": "Generated summary"},
    )
    db_session.refresh(execution)
    assert execution.status == "succeeded"
    assert execution.current_stage == "completed"
    assert execution.completed_at is not None
    assert execution.result_payload == {"brief": "Generated summary"}
