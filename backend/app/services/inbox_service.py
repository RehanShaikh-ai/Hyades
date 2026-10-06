"""Inbox service per CONTRACT v0.4.2 §5.3, §8.4, §12."""

import os
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError
from app.models.inbox_item import InboxItem
from app.models.source import Source
from app.schemas.inbox import InboxItemUpdate


def create_inbox_item_for_source(
    session: Session,
    source: Source,
) -> InboxItem:
    detection_status = "not_applicable" if source.source_type == "image" else "queued"
    inbox_item = InboxItem(
        workspace_id=source.workspace_id,
        source_id=source.id,
        status="pending",
        detection_status=detection_status,
        detected_count=0,
        detected_entities=[],
        detection_truncated=False,
    )
    session.add(inbox_item)
    session.commit()
    session.refresh(inbox_item)
    return inbox_item


def get_inbox_item(session: Session, inbox_item_id: UUID) -> InboxItem:
    item = session.get(InboxItem, inbox_item_id)
    if not item:
        raise NotFoundError(f"Inbox item '{inbox_item_id}' not found")
    return item


def list_inbox_items(
    session: Session,
    workspace_id: UUID,
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
) -> tuple[list[dict], int]:
    stmt = select(InboxItem, Source).join(Source, InboxItem.source_id == Source.id).where(InboxItem.workspace_id == workspace_id)
    count_stmt = select(func.count(InboxItem.id)).where(InboxItem.workspace_id == workspace_id)

    if status:
        stmt = stmt.where(InboxItem.status == status)
        count_stmt = count_stmt.where(InboxItem.status == status)

    stmt = stmt.order_by(InboxItem.created_at.desc())

    total = session.scalar(count_stmt) or 0
    results = session.execute(stmt.offset((page - 1) * page_size).limit(page_size)).all()

    items = []
    for inbox_item, source in results:
        items.append({
            "id": inbox_item.id,
            "workspace_id": inbox_item.workspace_id,
            "source_id": inbox_item.source_id,
            "status": inbox_item.status,
            "detection_status": inbox_item.detection_status,
            "detected_count": inbox_item.detected_count,
            "detected_entities": inbox_item.detected_entities,
            "detection_truncated": inbox_item.detection_truncated,
            "extraction_job_id": inbox_item.extraction_job_id,
            "created_at": inbox_item.created_at,
            "decided_at": inbox_item.decided_at,
            "source_title": source.original_path.split("/")[-1],
            "source_type": source.source_type,
            "file_size_bytes": source.file_size_bytes,
            "extract_knowledge": source.extract_knowledge,
        })

    return items, total


def update_inbox_item(
    session: Session,
    inbox_item_id: UUID,
    data: InboxItemUpdate,
) -> InboxItem:
    item = get_inbox_item(session, inbox_item_id)
    source = session.get(Source, item.source_id)

    if source and data.extract_knowledge is not None:
        source.extract_knowledge = data.extract_knowledge

    session.commit()
    session.refresh(item)
    return item


def accept_inbox_item(session: Session, inbox_item_id: UUID) -> InboxItem:
    item = get_inbox_item(session, inbox_item_id)
    if item.status != "pending":
        raise ValidationError(f"Inbox item is already in '{item.status}' state")

    item.status = "accepted"
    item.decided_at = datetime.now(UTC)

    source = session.get(Source, item.source_id)
    if source:
        source.import_status = "completed"
        source.processing_status = "READY"

    session.commit()
    session.refresh(item)
    return item


def reject_inbox_item(session: Session, inbox_item_id: UUID) -> None:
    item = get_inbox_item(session, inbox_item_id)
    source = session.get(Source, item.source_id)

    if source and getattr(source, "raw_metadata", None):
        storage_path = source.raw_metadata.get("storage_path")
        if storage_path and os.path.exists(storage_path):
            try:
                os.remove(storage_path)
            except OSError:
                pass

    if source:
        session.delete(source)

    session.delete(item)
    session.commit()
