"""Saved Views API endpoints per CONTRACT v0.4.2 §8.3."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.workspace import Workspace
from app.schemas.saved_view import (
    SavedViewCreate,
    SavedViewListResponse,
    SavedViewResponse,
    SavedViewUpdate,
)
from app.services import saved_view_service

router = APIRouter(tags=["saved-views"])


@router.post(
    "/workspaces/{workspace_id}/saved-views",
    response_model=SavedViewResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_saved_view(
    workspace_id: UUID,
    data: SavedViewCreate,
    session: Annotated[Session, Depends(get_db)],
):
    ws = session.get(Workspace, workspace_id)
    if not ws:
        from app.core.exceptions import NotFoundError

        raise NotFoundError(f"Workspace '{workspace_id}' not found")

    return saved_view_service.create_saved_view(
        session=session,
        workspace_id=workspace_id,
        created_by=ws.owner_id,
        data=data,
    )


@router.get(
    "/workspaces/{workspace_id}/saved-views",
    response_model=SavedViewListResponse,
)
def list_saved_views(
    workspace_id: UUID,
    session: Annotated[Session, Depends(get_db)],
):
    items = saved_view_service.list_saved_views(session, workspace_id)
    return SavedViewListResponse(items=items, total=len(items))


@router.get(
    "/workspaces/{workspace_id}/saved-views/{saved_view_id}",
    response_model=SavedViewResponse,
)
def get_saved_view(
    workspace_id: UUID,
    saved_view_id: UUID,
    session: Annotated[Session, Depends(get_db)],
):
    return saved_view_service.get_saved_view(session, saved_view_id)


@router.patch(
    "/workspaces/{workspace_id}/saved-views/{saved_view_id}",
    response_model=SavedViewResponse,
)
def update_saved_view(
    workspace_id: UUID,
    saved_view_id: UUID,
    data: SavedViewUpdate,
    session: Annotated[Session, Depends(get_db)],
):
    return saved_view_service.update_saved_view(session, saved_view_id, data)


@router.delete(
    "/workspaces/{workspace_id}/saved-views/{saved_view_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_saved_view(
    workspace_id: UUID,
    saved_view_id: UUID,
    session: Annotated[Session, Depends(get_db)],
):
    saved_view_service.delete_saved_view(session, saved_view_id)
