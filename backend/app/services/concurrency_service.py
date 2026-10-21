"""Per-workspace action execution concurrency enforcement service.

Contract references:
    CONTRACT_v0.5.1.md:
    §11.2 — Concurrency:
            - The backend MUST support the environment variable ACTION_MAX_CONCURRENT_PER_WORKSPACE.
            - The default value MUST be 2.
            - The backend MUST enforce this limit per workspace.
            - The backend MUST NOT start additional concurrent actions for a workspace after it reaches the limit.
            - The backend MUST return a clear queued or concurrency-limit status.
            - The concurrency limit MUST apply to LLM actions and other registered actions.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AppException
from app.models.action_execution import ActionExecution

# Statuses that occupy an active concurrency execution slot
ACTIVE_STATUSES = ("running", "cancelling")


def get_active_workspace_executions_count(db: Session, workspace_id: uuid.UUID) -> int:
    """Return the count of currently active executions within the specified workspace."""
    stmt = select(func.count(ActionExecution.id)).where(
        ActionExecution.workspace_id == workspace_id,
        ActionExecution.status.in_(ACTIVE_STATUSES),
    )
    count = db.scalar(stmt)
    return count or 0


def check_action_concurrency(
    db: Session,
    workspace_id: uuid.UUID,
    max_concurrent: int | None = None,
) -> int:
    """Verify that the workspace has not exceeded its concurrency limit per §11.2.

    Raises:
        AppException(429, "CONCURRENCY_LIMIT_REACHED", ...): When limit is reached.

    Returns:
        The current active executions count.
    """
    if max_concurrent is None:
        max_concurrent = settings.ACTION_MAX_CONCURRENT_PER_WORKSPACE

    active_count = get_active_workspace_executions_count(db, workspace_id)
    if active_count >= max_concurrent:
        raise AppException(
            status_code=429,
            code="CONCURRENCY_LIMIT_REACHED",
            message=(
                f"Active action concurrency limit of {max_concurrent} reached for workspace "
                f"{workspace_id}. Wait for active actions to complete or cancel them."
            ),
        )
    return active_count


def can_start_execution(
    db: Session,
    workspace_id: uuid.UUID,
    max_concurrent: int | None = None,
) -> bool:
    """Return True if workspace has available concurrency capacity."""
    if max_concurrent is None:
        max_concurrent = settings.ACTION_MAX_CONCURRENT_PER_WORKSPACE
    active_count = get_active_workspace_executions_count(db, workspace_id)
    return active_count < max_concurrent
