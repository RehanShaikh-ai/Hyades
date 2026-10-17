"""Knowledge Inbox API routes per CONTRACT v0.4.2 §8.4."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.inbox import (
    InboxAcceptResponse,
    InboxItemDetailResponse,
    InboxItemListResponse,
    InboxItemUpdate,
    InboxRejectResponse,
)
from app.services import inbox_service

router = APIRouter(prefix="/inbox", tags=["inbox"])


@router.get("", response_model=InboxItemListResponse)
def list_inbox(
    workspace_id: Annotated[uuid.UUID, Query(..., description="Workspace ID")],
    db: Annotated[Session, Depends(get_db)],
    status: Annotated[
        str | None, Query(description="Filter by status (pending, accepted, rejected)")
    ] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    """List inbox items in a workspace."""
    items, total = inbox_service.list_inbox_items(
        db=db, workspace_id=workspace_id, status_filter=status, page=page, page_size=page_size
    )
    return InboxItemListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/{inbox_item_id}", response_model=InboxItemDetailResponse)
def get_inbox_item(
    inbox_item_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
):
    """Get detailed inbox item with detected concept preview."""
    return inbox_service.get_inbox_item(db, inbox_item_id)


@router.patch("/{inbox_item_id}", response_model=InboxItemDetailResponse)
def update_inbox_item(
    inbox_item_id: uuid.UUID,
    data: InboxItemUpdate,
    db: Annotated[Session, Depends(get_db)],
):
    """Update source title or extraction toggle on an inbox item."""
    return inbox_service.update_inbox_item(db, inbox_item_id, data)


@router.post("/{inbox_item_id}/accept", response_model=InboxAcceptResponse)
def accept_inbox_item(
    inbox_item_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
):
    """Accept an inbox item and trigger real extraction if enabled."""
    item, started = inbox_service.accept_inbox_item(db, inbox_item_id)
    return InboxAcceptResponse(
        status="accepted",
        inbox_item_id=item.id,
        source_id=item.source_id,
        extraction_started=started,
    )


@router.post("/{inbox_item_id}/reject", response_model=InboxRejectResponse)
def reject_inbox_item(
    inbox_item_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
):
    """Permanently reject and remove an inbox item, source, and storage file."""
    deleted_id = inbox_service.reject_inbox_item(db, inbox_item_id)
    return InboxRejectResponse(
        status="rejected",
        deleted_source_id=deleted_id,
    )


@router.post("/{inbox_item_id}/redetect", response_model=InboxItemDetailResponse)
def redetect_inbox_item(
    inbox_item_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
):
    """Re-run dry run concept detection on an inbox item."""
    return inbox_service.redetect_inbox_item(db, inbox_item_id)
