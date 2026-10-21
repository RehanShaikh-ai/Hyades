"""Unit tests for v0.5.1 SQLAlchemy models per CONTRACT v0.5.1 §4.1, §6.1, §6.2, §6.4.

Verifies:
- ActionExecution, ActionProposal, and ActionChangeSet are registered on Base.metadata
- Primary keys and defaults
- Foreign keys to workspaces and execution
- Unique constraint (workspace_id, action_id, idempotency_key) on action_executions
- Confirmation token hash persistence (never raw token)
- Change-set before/after state persistence
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models import ActionChangeSet, ActionExecution, ActionProposal, User, Workspace


def test_v0_5_1_tables_registered_on_base_metadata():
    """Verify all v0.5.1 tables are registered on Base.metadata per Contract §4.1."""
    tables = Base.metadata.tables.keys()
    assert "action_executions" in tables
    assert "action_proposals" in tables
    assert "action_change_sets" in tables


def test_action_execution_lifecycle_and_idempotency_constraint(db_session: Session):
    """Verify ActionExecution model, default values, and unique constraint on idempotency key."""
    user = User(display_name="Execution Owner")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Execution Workspace", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    execution = ActionExecution(
        workspace_id=workspace.id,
        action_id="notes.summarize",
        status="pending",
        initiated_by="user",
        idempotency_key="idemp-key-001",
        input_payload={"note_id": str(uuid.uuid4())},
    )
    db_session.add(execution)
    db_session.commit()
    db_session.refresh(execution)

    assert execution.id is not None
    assert isinstance(execution.id, uuid.UUID)
    assert execution.status == "pending"
    assert execution.initiated_by == "user"
    assert execution.created_at is not None
    assert execution.updated_at is not None

    # Attempt to insert duplicate (workspace_id, action_id, idempotency_key)
    duplicate = ActionExecution(
        workspace_id=workspace.id,
        action_id="notes.summarize",
        status="pending",
        initiated_by="user",
        idempotency_key="idemp-key-001",
        input_payload={"note_id": str(uuid.uuid4())},
    )
    db_session.add(duplicate)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_action_proposal_model_and_token_hash(db_session: Session):
    """Verify ActionProposal model stores hash, expires_at, and links to execution."""
    user = User(display_name="Proposal Owner")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Proposal Workspace", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    execution = ActionExecution(
        workspace_id=workspace.id,
        action_id="notes.create",
        status="proposed",
        initiated_by="user",
        idempotency_key="idemp-prop-001",
        input_payload={"title": "Proposed Note"},
    )
    db_session.add(execution)
    db_session.commit()

    proposal = ActionProposal(
        execution_id=execution.id,
        workspace_id=workspace.id,
        action_id="notes.create",
        proposal_payload={"title": "Proposed Note", "content": "Body content"},
        confirmation_token_hash="abc123hash",
        status="pending",
        expires_at=datetime.now(UTC) + timedelta(minutes=15),
    )
    db_session.add(proposal)
    db_session.commit()
    db_session.refresh(proposal)

    assert proposal.id is not None
    assert proposal.execution_id == execution.id
    assert proposal.confirmation_token_hash == "abc123hash"
    assert proposal.status == "pending"
    assert proposal.committed_at is None
    assert proposal.rejected_at is None


def test_action_change_set_model(db_session: Session):
    """Verify ActionChangeSet records before/after state and undo status per §6.4."""
    user = User(display_name="ChangeSet Owner")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="ChangeSet Workspace", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    execution = ActionExecution(
        workspace_id=workspace.id,
        action_id="notes.update",
        status="succeeded",
        initiated_by="user",
        idempotency_key="idemp-cs-001",
        input_payload={},
    )
    db_session.add(execution)
    db_session.commit()

    note_id = str(uuid.uuid4())
    change_set = ActionChangeSet(
        workspace_id=workspace.id,
        execution_id=execution.id,
        action_id="notes.update",
        affected_item_ids=[note_id],
        before_state={"content": "Old Content"},
        after_state={"content": "New Content"},
        undo_status="not_undone",
    )
    db_session.add(change_set)
    db_session.commit()
    db_session.refresh(change_set)

    assert change_set.id is not None
    assert change_set.affected_item_ids == [note_id]
    assert change_set.before_state == {"content": "Old Content"}
    assert change_set.after_state == {"content": "New Content"}
    assert change_set.undo_status == "not_undone"
    assert change_set.undone_at is None


def test_index_job_updated_at_and_progress_accessors(db_session: Session):
    """Verify IndexJob updated_at column and progress properties per §4.1, §10.1."""
    from app.models import IndexJob

    user = User(display_name="Job Owner")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Job Workspace", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    job = IndexJob(
        workspace_id=workspace.id,
        job_type="index_workspace",
        status="running",
        progress={
            "total_items": 100,
            "completed_items": 45,
            "failed_items": 2,
            "current_stage": "chunking",
        },
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    assert job.updated_at is not None
    assert job.total_items == 100
    assert job.completed_items == 45
    assert job.failed_items == 2
    assert job.current_stage == "chunking"

    # Also verify fallback to legacy keys
    legacy_job = IndexJob(
        workspace_id=workspace.id,
        job_type="index_note",
        status="completed",
        progress={
            "total_notes": 10,
            "processed_notes": 9,
            "failed_notes": [{"note_id": "xyz", "error": "failed"}],
            "stage": "finalizing",
        },
    )
    db_session.add(legacy_job)
    db_session.commit()
    db_session.refresh(legacy_job)

    assert legacy_job.total_items == 10
    assert legacy_job.completed_items == 9
    assert legacy_job.failed_items == 1
    assert legacy_job.current_stage == "finalizing"
