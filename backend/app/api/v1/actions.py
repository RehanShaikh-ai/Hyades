"""Actions API routes per CONTRACT v0.5.1 §3.1, §5, §6.2, §6.5, §6.8, §9.

Endpoints:
- GET /actions: Return the canonical action catalogue
- POST /actions/{id}/execute: Validate and start an action execution
- GET /actions/executions/{id}: Return execution status and result
- POST /actions/executions/{id}/cancel: Request cancellation of active execution
- GET /actions/executions: List executions within the workspace
- POST /actions/proposals/{id}/reject: Reject a pending proposal
- POST /actions/change-sets/{id}/undo: Revert a committed mutation
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, status
from sqlalchemy.orm import Session

from app.actions.registry import get_catalogue
from app.core.exceptions import ValidationError
from app.db.session import get_db
from app.schemas.action import (
    ActionCatalogueResponse,
    ActionExecuteRequest,
    ActionResultEnvelope,
    ExecutionListResponse,
    UndoResponse,
)
from app.services import action_execution_service

router = APIRouter(tags=["actions"])


def _resolve_workspace_id(
    path_ws: uuid.UUID | None = None,
    query_ws: uuid.UUID | None = None,
    header_ws: str | None = None,
) -> uuid.UUID:
    """Resolve workspace ID from path, query parameter, or X-Workspace-Id header."""
    if path_ws:
        return path_ws
    if query_ws:
        return query_ws
    if header_ws:
        try:
            return uuid.UUID(header_ws.strip())
        except ValueError as err:
            raise ValidationError(f"Invalid UUID in X-Workspace-Id header: {header_ws}") from err
    raise ValidationError(
        "workspace_id must be provided via query parameter, path, or X-Workspace-Id header."
    )


# ─────────────────────────────────────────────────────────────────────────────
# 1. Action Catalogue (§5, §5.2)
# ─────────────────────────────────────────────────────────────────────────────


@router.get(
    "/actions",
    response_model=ActionCatalogueResponse,
    status_code=status.HTTP_200_OK,
    summary="Get canonical action catalogue",
)
def get_action_catalogue() -> ActionCatalogueResponse:
    """Return the frozen canonical action catalogue containing all 37 registered actions."""
    items = get_catalogue()
    return ActionCatalogueResponse(actions=items, total=len(items))


@router.get(
    "/workspaces/{workspace_id}/actions",
    response_model=ActionCatalogueResponse,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
def get_workspace_action_catalogue(workspace_id: uuid.UUID) -> ActionCatalogueResponse:
    """Convenience alias for workspace catalogue."""
    items = get_catalogue()
    return ActionCatalogueResponse(actions=items, total=len(items))


# ─────────────────────────────────────────────────────────────────────────────
# 2. Action Execution (§5, §5.1, §6.2)
# ─────────────────────────────────────────────────────────────────────────────


@router.post(
    "/actions/{action_id}/execute",
    response_model=ActionResultEnvelope,
    status_code=status.HTTP_200_OK,
    summary="Execute an action in read, propose, or commit mode",
)
def execute_action_endpoint(
    action_id: str,
    request: ActionExecuteRequest,
    db: Annotated[Session, Depends(get_db)],
    workspace_id: Annotated[uuid.UUID | None, Query(description="Workspace scope UUID")] = None,
    x_workspace_id: Annotated[str | None, Header(alias="X-Workspace-Id")] = None,
) -> ActionResultEnvelope:
    """Validate and execute an action execution per Contract v0.5.1 §5.1."""
    ws_id = _resolve_workspace_id(query_ws=workspace_id, header_ws=x_workspace_id)
    return action_execution_service.execute_action(
        db=db,
        workspace_id=ws_id,
        action_id=action_id,
        request=request,
    )


@router.post(
    "/workspaces/{workspace_id}/actions/{action_id}/execute",
    response_model=ActionResultEnvelope,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
def execute_action_workspace_endpoint(
    workspace_id: uuid.UUID,
    action_id: str,
    request: ActionExecuteRequest,
    db: Annotated[Session, Depends(get_db)],
) -> ActionResultEnvelope:
    """Hierarchical workspace action execute route alias."""
    return action_execution_service.execute_action(
        db=db,
        workspace_id=workspace_id,
        action_id=action_id,
        request=request,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 3. Execution Status & Results (§5, §9)
# ─────────────────────────────────────────────────────────────────────────────


@router.get(
    "/actions/executions/{execution_id}",
    response_model=ActionResultEnvelope,
    status_code=status.HTTP_200_OK,
    summary="Get execution status and result envelope",
)
def get_execution_status(
    execution_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    workspace_id: Annotated[uuid.UUID | None, Query(description="Workspace scope UUID")] = None,
    x_workspace_id: Annotated[str | None, Header(alias="X-Workspace-Id")] = None,
) -> ActionResultEnvelope:
    """Return execution status and full result envelope scoped to workspace."""
    ws_id = _resolve_workspace_id(query_ws=workspace_id, header_ws=x_workspace_id)
    return action_execution_service.get_execution(db, ws_id, execution_id)


@router.get(
    "/workspaces/{workspace_id}/actions/executions/{execution_id}",
    response_model=ActionResultEnvelope,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
def get_workspace_execution_status(
    workspace_id: uuid.UUID,
    execution_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> ActionResultEnvelope:
    """Hierarchical alias for get execution status."""
    return action_execution_service.get_execution(db, workspace_id, execution_id)


# ─────────────────────────────────────────────────────────────────────────────
# 4. Action Cancellation (§5, §6.8)
# ─────────────────────────────────────────────────────────────────────────────


@router.post(
    "/actions/executions/{execution_id}/cancel",
    response_model=ActionResultEnvelope,
    status_code=status.HTTP_200_OK,
    summary="Request cancellation of active execution",
)
def cancel_execution_endpoint(
    execution_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    workspace_id: Annotated[uuid.UUID | None, Query(description="Workspace scope UUID")] = None,
    x_workspace_id: Annotated[str | None, Header(alias="X-Workspace-Id")] = None,
) -> ActionResultEnvelope:
    """Request cancellation of an active execution."""
    ws_id = _resolve_workspace_id(query_ws=workspace_id, header_ws=x_workspace_id)
    return action_execution_service.cancel_execution(db, ws_id, execution_id)


@router.post(
    "/workspaces/{workspace_id}/actions/executions/{execution_id}/cancel",
    response_model=ActionResultEnvelope,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
def cancel_workspace_execution_endpoint(
    workspace_id: uuid.UUID,
    execution_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> ActionResultEnvelope:
    """Hierarchical alias for cancellation."""
    return action_execution_service.cancel_execution(db, workspace_id, execution_id)


# ─────────────────────────────────────────────────────────────────────────────
# 5. Execution Listing & Pagination (§5)
# ─────────────────────────────────────────────────────────────────────────────


@router.get(
    "/actions/executions",
    response_model=ExecutionListResponse,
    status_code=status.HTTP_200_OK,
    summary="List action executions within workspace",
)
def list_executions_endpoint(
    db: Annotated[Session, Depends(get_db)],
    workspace_id: Annotated[uuid.UUID | None, Query(description="Workspace scope UUID")] = None,
    x_workspace_id: Annotated[str | None, Header(alias="X-Workspace-Id")] = None,
    offset: Annotated[int, Query(ge=0, description="Pagination offset")] = 0,
    limit: Annotated[int, Query(ge=1, le=100, description="Pagination limit")] = 20,
) -> ExecutionListResponse:
    """List executions scoped to workspace with pagination."""
    ws_id = _resolve_workspace_id(query_ws=workspace_id, header_ws=x_workspace_id)
    return action_execution_service.list_executions(db, ws_id, offset=offset, limit=limit)


@router.get(
    "/workspaces/{workspace_id}/actions/executions",
    response_model=ExecutionListResponse,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
def list_workspace_executions_endpoint(
    workspace_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ExecutionListResponse:
    """Hierarchical alias for execution listing."""
    return action_execution_service.list_executions(db, workspace_id, offset=offset, limit=limit)


# ─────────────────────────────────────────────────────────────────────────────
# 6. Proposal Rejection & Safe Undo (§6.4, §6.5)
# ─────────────────────────────────────────────────────────────────────────────


@router.post(
    "/actions/proposals/{proposal_id}/reject",
    status_code=status.HTTP_200_OK,
    summary="Reject an action proposal",
)
def reject_proposal_endpoint(
    proposal_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    workspace_id: Annotated[uuid.UUID | None, Query(description="Workspace scope UUID")] = None,
    x_workspace_id: Annotated[str | None, Header(alias="X-Workspace-Id")] = None,
):
    """Reject a proposed change so it cannot be confirmed."""
    ws_id = _resolve_workspace_id(query_ws=workspace_id, header_ws=x_workspace_id)
    return action_execution_service.reject_proposal(db, ws_id, proposal_id)


@router.post(
    "/actions/change-sets/{change_set_id}/undo",
    response_model=UndoResponse,
    status_code=status.HTTP_200_OK,
    summary="Undo a committed change set",
)
def undo_change_set_endpoint(
    change_set_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    workspace_id: Annotated[uuid.UUID | None, Query(description="Workspace scope UUID")] = None,
    x_workspace_id: Annotated[str | None, Header(alias="X-Workspace-Id")] = None,
) -> UndoResponse:
    """Safely undo a previously committed mutation per Contract v0.5.1 §6.5."""
    ws_id = _resolve_workspace_id(query_ws=workspace_id, header_ws=x_workspace_id)
    return action_execution_service.undo_change_set(db, ws_id, change_set_id)
