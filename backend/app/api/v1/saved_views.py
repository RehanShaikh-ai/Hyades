"""Saved Observatory Views API routes per CONTRACT v0.4.2 §8.3."""

from typing import Annotated
import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.saved_view import (
    SavedViewCreate,
    SavedViewListResponse,
    SavedViewResponse,
    SavedViewRestoreResponse,
    SavedViewUpdate,
)
from app.services import saved_view_service

router = APIRouter(prefix="/saved-views", tags=["saved-views"])


@router.post("", response_model=SavedViewResponse, status_code=status.HTTP_201_CREATED)
def create_saved_view(
    data: SavedViewCreate,
    db: Annotated[Session, Depends(get_db)],
):
    """Save an Observatory view state."""
    return saved_view_service.create_saved_view(db, data)


@router.get("", response_model=SavedViewListResponse)
def list_saved_views(
    workspace_id: Annotated[uuid.UUID, Query(..., description="Workspace ID")],
    db: Annotated[Session, Depends(get_db)],
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
):
    """List saved observatory views in a workspace."""
    items, total = saved_view_service.list_saved_views(
        db, workspace_id=workspace_id, page=page, page_size=page_size
    )
    return SavedViewListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/{saved_view_id}", response_model=SavedViewResponse)
def get_saved_view(
    saved_view_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
):
    """Get a saved observatory view by ID."""
    return saved_view_service.get_saved_view(db, saved_view_id)


@router.patch("/{saved_view_id}", response_model=SavedViewResponse)
def update_saved_view(
    saved_view_id: uuid.UUID,
    data: SavedViewUpdate,
    db: Annotated[Session, Depends(get_db)],
):
    """Update a saved observatory view's name or state."""
    return saved_view_service.update_saved_view(db, saved_view_id, data)


@router.delete("/{saved_view_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_view(
    saved_view_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
):
    """Delete a saved observatory view."""
    saved_view_service.delete_saved_view(db, saved_view_id)


@router.post("/{saved_view_id}/restore", response_model=SavedViewRestoreResponse)
def restore_saved_view(
    saved_view_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
):
    """Restore a saved view onto current graph state."""
    return saved_view_service.restore_saved_view(db, saved_view_id)
