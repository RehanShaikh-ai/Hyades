"""Knowledge Inbox API endpoints per CONTRACT v0.4.2 §8.4."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.inbox import (
    InboxItemResponse,
    InboxItemUpdate,
    InboxListResponse,
)
from app.services import inbox_service

router = APIRouter(tags=["inbox"])


@router.get(
    "/workspaces/{workspace_id}/inbox",
    response_model=InboxListResponse,
)
def list_inbox_items(
    workspace_id: UUID,
    session: Annotated[Session, Depends(get_db)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: str | None = Query(default=None),
):
    items, total = inbox_service.list_inbox_items(
        session=session,
        workspace_id=workspace_id,
        page=page,
        page_size=page_size,
        status=status,
    )
    return InboxListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/workspaces/{workspace_id}/inbox/{inbox_item_id}",
    response_model=InboxItemResponse,
)
def get_inbox_item(
    workspace_id: UUID,
    inbox_item_id: UUID,
    session: Annotated[Session, Depends(get_db)],
):
    return inbox_service.get_inbox_item(session, inbox_item_id)


@router.patch(
    "/workspaces/{workspace_id}/inbox/{inbox_item_id}",
    response_model=InboxItemResponse,
)
def update_inbox_item(
    workspace_id: UUID,
    inbox_item_id: UUID,
    data: InboxItemUpdate,
    session: Annotated[Session, Depends(get_db)],
):
    return inbox_service.update_inbox_item(session, inbox_item_id, data)


@router.post(
    "/workspaces/{workspace_id}/inbox/{inbox_item_id}/accept",
    response_model=InboxItemResponse,
)
def accept_inbox_item(
    workspace_id: UUID,
    inbox_item_id: UUID,
    session: Annotated[Session, Depends(get_db)],
):
    return inbox_service.accept_inbox_item(session, inbox_item_id)


@router.post(
    "/workspaces/{workspace_id}/inbox/{inbox_item_id}/reject",
    status_code=status.HTTP_204_NO_CONTENT,
)
def reject_inbox_item(
    workspace_id: UUID,
    inbox_item_id: UUID,
    session: Annotated[Session, Depends(get_db)],
):
    inbox_service.reject_inbox_item(session, inbox_item_id)


@router.post(
    "/workspaces/{workspace_id}/inbox/{inbox_item_id}/redetect",
    response_model=InboxItemResponse,
)
def redetect_inbox_item(
    workspace_id: UUID,
    inbox_item_id: UUID,
    session: Annotated[Session, Depends(get_db)],
):
    return inbox_service.get_inbox_item(session, inbox_item_id)
