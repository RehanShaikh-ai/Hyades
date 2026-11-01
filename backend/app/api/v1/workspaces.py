"""Workspace API routes.

Canonical module per contract §12, §14.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlalchemy.orm import Session

from app.core.exceptions import WorkspaceNotFoundError
from app.db.session import get_db
from app.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceListResponse,
    WorkspaceResponse,
)
from app.services import workspace_service

router = APIRouter()


@router.post(
    "/workspaces",
    response_model=WorkspaceResponse,
    status_code=status.HTTP_201_CREATED,
    name="create_workspace",
)
def create_workspace(
    workspace_in: WorkspaceCreate,
    db: Annotated[Session, Depends(get_db)],
) -> WorkspaceResponse:
    """Create a new workspace.

    Contract §12.1:
        POST /api/v1/workspaces -> 201 Created (or 404 USER_NOT_FOUND if owner missing)
    """
    workspace = workspace_service.create_workspace(db=db, workspace_in=workspace_in)
    return WorkspaceResponse.model_validate(workspace)


@router.get(
    "/workspaces/{workspace_id}",
    response_model=WorkspaceResponse,
    status_code=status.HTTP_200_OK,
    name="get_workspace",
)
def get_workspace(
    workspace_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> WorkspaceResponse:
    """Retrieve a single workspace by ID.

    Contract §12.2:
        GET /api/v1/workspaces/{workspace_id} -> 200 OK (or 404 WORKSPACE_NOT_FOUND)
    """
    workspace = workspace_service.get_workspace(db=db, workspace_id=workspace_id)
    if not workspace:
        raise WorkspaceNotFoundError()
    return WorkspaceResponse.model_validate(workspace)


@router.get(
    "/workspaces",
    response_model=WorkspaceListResponse,
    status_code=status.HTTP_200_OK,
    name="list_workspaces",
)
def list_workspaces(
    db: Annotated[Session, Depends(get_db)],
) -> WorkspaceListResponse:
    """List all workspaces.

    Contract §12.3:
        GET /api/v1/workspaces -> 200 OK
    """
    workspaces, total = workspace_service.list_workspaces(db=db)
    return WorkspaceListResponse(
        items=[WorkspaceResponse.model_validate(w) for w in workspaces],
        total=total,
    )

@router.delete(
    "/workspaces/{workspace_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    name="delete_workspace",
)
def delete_workspace(
    workspace_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    requesting_user_id: Annotated[uuid.UUID | None, Header(alias="X-User-Id")] = None,
    user_id: Annotated[uuid.UUID | None, Query(alias="user_id")] = None,
) -> Response:
    """Delete a workspace and cascade-clean all associated data."""
    effective_user_id = requesting_user_id or user_id
    workspace_service.delete_workspace(
        db=db,
        workspace_id=workspace_id,
        requesting_user_id=effective_user_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)

