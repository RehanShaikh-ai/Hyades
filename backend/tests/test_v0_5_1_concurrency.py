"""Unit tests for v0.5.1 Action Concurrency Enforcement.

Contract references:
    CONTRACT_v0.5.1.md:
    §11.2 — Concurrency:
            - The backend MUST support the environment variable ACTION_MAX_CONCURRENT_PER_WORKSPACE.
            - The default value MUST be 2.
            - The backend MUST enforce this limit per workspace.
            - The backend MUST NOT start additional concurrent actions for a workspace after it reaches the limit.
            - The backend MUST return a clear queued or concurrency-limit status (429 CONCURRENCY_LIMIT_REACHED).
            - The concurrency limit MUST apply to LLM actions and other registered actions.
            - Workspace isolation: Workspace 1 at limit does not block Workspace 2.
"""

import uuid

import pytest
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AppException
from app.models.action_execution import ActionExecution
from app.models.user import User
from app.models.workspace import Workspace
from app.services.concurrency_service import (
    can_start_execution,
    check_action_concurrency,
    get_active_workspace_executions_count,
)


def _create_workspace(db_session: Session, name: str) -> Workspace:
    user = User(display_name=f"{name} Owner")
    db_session.add(user)
    db_session.commit()
    ws = Workspace(name=name, owner_id=user.id)
    db_session.add(ws)
    db_session.commit()
    return ws


def _create_execution(
    db_session: Session,
    workspace_id: uuid.UUID,
    action_id: str,
    status: str,
    idemp_key: str,
) -> ActionExecution:
    execution = ActionExecution(
        workspace_id=workspace_id,
        action_id=action_id,
        status=status,
        initiated_by="user",
        idempotency_key=idemp_key,
        input_payload={},
    )
    db_session.add(execution)
    db_session.commit()
    return execution


def test_concurrency_default_value():
    """Verify default ACTION_MAX_CONCURRENT_PER_WORKSPACE is 2 per Contract §11.2."""
    assert settings.ACTION_MAX_CONCURRENT_PER_WORKSPACE == 2


def test_concurrency_limit_enforced_per_workspace(db_session: Session):
    """Verify concurrency limit blocks execution when workspace reaches limit."""
    ws1 = _create_workspace(db_session, "Workspace 1")

    # Initially 0 active actions
    assert get_active_workspace_executions_count(db_session, ws1.id) == 0
    assert can_start_execution(db_session, ws1.id, max_concurrent=2) is True
    check_action_concurrency(db_session, ws1.id, max_concurrent=2)

    # Start 1st active action
    _create_execution(db_session, ws1.id, "notes.summarize", "running", "ws1-act-1")
    assert get_active_workspace_executions_count(db_session, ws1.id) == 1
    assert can_start_execution(db_session, ws1.id, max_concurrent=2) is True

    # Start 2nd active action (reaches limit of 2)
    _create_execution(db_session, ws1.id, "knowledge.answer", "running", "ws1-act-2")
    assert get_active_workspace_executions_count(db_session, ws1.id) == 2
    assert can_start_execution(db_session, ws1.id, max_concurrent=2) is False

    # Attempting to check concurrency now raises 429 CONCURRENCY_LIMIT_REACHED
    with pytest.raises(AppException) as exc_info:
        check_action_concurrency(db_session, ws1.id, max_concurrent=2)

    assert exc_info.value.status_code == 429
    assert exc_info.value.code == "CONCURRENCY_LIMIT_REACHED"
    assert "Active action concurrency limit of 2 reached" in exc_info.value.message


def test_workspace_isolation_in_concurrency_limits(db_session: Session):
    """Verify Workspace 1 reaching limit does NOT block Workspace 2."""
    ws1 = _create_workspace(db_session, "Workspace Isolation 1")
    ws2 = _create_workspace(db_session, "Workspace Isolation 2")

    # Max out ws1 with 2 running actions
    _create_execution(db_session, ws1.id, "notes.summarize", "running", "iso-ws1-1")
    _create_execution(db_session, ws1.id, "knowledge.answer", "running", "iso-ws1-2")

    # Verify ws1 is blocked
    assert can_start_execution(db_session, ws1.id, max_concurrent=2) is False
    with pytest.raises(AppException):
        check_action_concurrency(db_session, ws1.id, max_concurrent=2)

    # Verify ws2 has 0 active actions and can start freely
    assert get_active_workspace_executions_count(db_session, ws2.id) == 0
    assert can_start_execution(db_session, ws2.id, max_concurrent=2) is True
    check_action_concurrency(db_session, ws2.id, max_concurrent=2)


def test_completed_or_failed_actions_free_concurrency_slots(db_session: Session):
    """Verify completed, failed, or cancelled actions release their concurrency slots."""
    ws = _create_workspace(db_session, "Slot Release Workspace")

    exec1 = _create_execution(db_session, ws.id, "notes.summarize", "running", "rel-1")
    exec2 = _create_execution(db_session, ws.id, "notes.compare", "running", "rel-2")

    assert can_start_execution(db_session, ws.id, max_concurrent=2) is False

    # exec1 succeeds
    exec1.status = "succeeded"
    db_session.commit()

    # Slot is freed!
    assert get_active_workspace_executions_count(db_session, ws.id) == 1
    assert can_start_execution(db_session, ws.id, max_concurrent=2) is True
    check_action_concurrency(db_session, ws.id, max_concurrent=2)

    # exec2 fails
    exec2.status = "failed"
    db_session.commit()

    # Both slots are now free
    assert get_active_workspace_executions_count(db_session, ws.id) == 0
    assert can_start_execution(db_session, ws.id, max_concurrent=2) is True
