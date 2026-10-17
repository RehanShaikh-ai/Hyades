"""Knowledge Inbox service per CONTRACT v0.4.2 §7.1, §8.4, §12."""

import logging
import os
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AppException, WorkspaceNotFoundError
from app.models.inbox_item import InboxItem
from app.models.source import Source
from app.models.workspace import Workspace
from app.schemas.inbox import InboxItemUpdate
from app.services import entity_extraction_service, source_processing_service
from app.services.extractors import get_extractor
from app.services.file_validation_service import resolve_and_verify_storage_path

logger = logging.getLogger("app.services.inbox_service")


class InboxItemNotFoundError(AppException):
    def __init__(self, message: str = "Inbox item not found.") -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, "INBOX_ITEM_NOT_FOUND", message)


def _populate_item_metadata(item: InboxItem) -> None:
    """Helper to populate dynamic source metadata on InboxItem response."""
    if item.source:
        orig = item.source.original_path or "Uploaded Source"
        meta = item.source.raw_metadata or {}
        # If user explicitly renamed source, original_path contains the new name
        title = orig if orig and orig != meta.get("file_name") else (meta.get("title") or orig)
        item.source_title = title
        item.source_type = item.source.source_type
        item.file_size_bytes = item.source.file_size_bytes
        item.extract_knowledge = getattr(item.source, "extract_knowledge", True)
        item.raw_metadata = item.source.raw_metadata


def create_inbox_item_for_source(db: Session, source: Source) -> InboxItem:
    """Create an InboxItem for an uploaded source and perform dry-run detection."""
    existing = db.scalars(select(InboxItem).where(InboxItem.source_id == source.id)).first()
    if existing:
        return existing

    is_image = source.source_type == "image"
    item = InboxItem(
        workspace_id=source.workspace_id,
        source_id=source.id,
        status="pending",
        detection_status="not_applicable" if is_image else "queued",
        detected_count=0,
        detected_entities=[],
        detection_truncated=False,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    if not is_image:
        run_dry_run_detection(db, item)
        db.refresh(item)

    return item


def run_dry_run_detection(db: Session, inbox_item: InboxItem) -> None:
    """Dry-run concept detection storing up to 100 concepts per CONTRACT § 12.3.

    Writes NO graph records (no GraphEntity, GraphRelationship, ContentChunk, etc).
    """
    source = inbox_item.source or db.get(Source, inbox_item.source_id)
    if not source or source.source_type == "image":
        inbox_item.detection_status = "not_applicable"
        db.commit()
        return

    inbox_item.detection_status = "processing"
    db.commit()

    file_bytes: bytes | None = None
    if source.raw_metadata and "content_base64" in source.raw_metadata:
        import base64

        try:
            file_bytes = base64.b64decode(source.raw_metadata["content_base64"])
        except Exception:
            pass

    if file_bytes is None and source.raw_metadata and "storage_path" in source.raw_metadata:
        path = Path(source.raw_metadata["storage_path"])
        if path.exists():
            file_bytes = path.read_bytes()

    if not file_bytes:
        inbox_item.detection_status = "failed"
        db.commit()
        return

    try:
        extractor = get_extractor(source.source_type)
        extracted = extractor.extract(file_bytes, source.original_path or "source")
        text = extracted.text or ""

        # Update source metadata with real derived title, clean filename, genuine excerpt, and extracted text
        filename = os.path.basename(source.original_path or "")
        clean_name = os.path.splitext(filename)[0].replace("-", " ").replace("_", " ").strip()
        derived_title = clean_name.title() if clean_name else "Source Document"
        for line in text.splitlines()[:10]:
            line_clean = line.strip().lstrip("#").strip()
            if line_clean and 2 < len(line_clean) < 120:
                derived_title = line_clean
                break
        excerpt_lines = [
            line_str.strip()
            for line_str in text.splitlines()
            if line_str.strip() and not line_str.strip().startswith("#")
        ]
        excerpt = " ".join(excerpt_lines)[:300] if excerpt_lines else text[:300]

        meta = dict(source.raw_metadata or {})
        meta["title"] = derived_title
        meta["file_name"] = filename
        meta["excerpt"] = excerpt
        meta["extracted_text"] = text[:15000]
        source.raw_metadata = meta
        db.commit()

        # Dry run entity extraction: zero DB mutations
        # Guard provider availability to prevent hanging uploads when external LLMs are down
        raw_entities = []
        if text.strip():
            from app.services import llm_service

            provider = llm_service.get_llm_provider()
            if not provider.health_check():
                logger.info("LLM provider unavailable during dry run; setting status to queued")
                inbox_item.detection_status = "queued"
                db.commit()
                return

            try:
                raw_entities = entity_extraction_service.extract_entities(text)
            except Exception as llm_err:
                logger.info(
                    "LLM entity extraction failed during dry run (%s); setting status to queued",
                    llm_err,
                )
                inbox_item.detection_status = "queued"
                db.commit()
                return

        max_limit = 100
        truncated = len(raw_entities) > max_limit
        selected_entities = raw_entities[:max_limit]

        inbox_item.detected_entities = selected_entities
        inbox_item.detected_count = len(selected_entities)
        inbox_item.detection_truncated = truncated
        inbox_item.detection_status = "completed"
        db.commit()
        logger.info(
            "Dry-run detection completed for inbox item %s: %d concepts (truncated: %s)",
            inbox_item.id,
            len(selected_entities),
            truncated,
        )
    except Exception as exc:
        logger.warning("Dry-run detection failed for inbox item %s: %s", inbox_item.id, exc)
        inbox_item.detection_status = "failed"
        db.commit()


def list_inbox_items(
    db: Session,
    workspace_id: uuid.UUID,
    status_filter: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[InboxItem], int]:
    """List inbox items for a workspace with pagination."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError("Workspace not found")

    query = select(InboxItem).where(InboxItem.workspace_id == workspace_id)
    count_query = select(func.count(InboxItem.id)).where(InboxItem.workspace_id == workspace_id)

    if status_filter and status_filter.strip().lower() != "all":
        query = query.where(InboxItem.status == status_filter.strip().lower())
        count_query = count_query.where(InboxItem.status == status_filter.strip().lower())

    query = query.order_by(InboxItem.created_at.desc())
    offset = (page - 1) * page_size
    total = db.scalar(count_query) or 0
    items = list(db.scalars(query.offset(offset).limit(page_size)).all())

    for item in items:
        _populate_item_metadata(item)

    return items, total


def get_inbox_item(db: Session, inbox_item_id: uuid.UUID) -> InboxItem:
    """Get inbox item details by ID."""
    item = db.get(InboxItem, inbox_item_id)
    if not item:
        raise InboxItemNotFoundError("Inbox item not found")
    _populate_item_metadata(item)
    return item


def update_inbox_item(db: Session, inbox_item_id: uuid.UUID, data: InboxItemUpdate) -> InboxItem:
    """Update editable fields of an inbox item (title, extract_knowledge).

    Detected concepts are read-only per CONTRACT A 8.4.
    """
    item = get_inbox_item(db, inbox_item_id)
    if item.status != "pending":
        raise AppException(
            status.HTTP_409_CONFLICT,
            "INVALID_STATE_TRANSITION",
            f"Cannot update inbox item in '{item.status}' state",
        )
    source = item.source

    if data.source_title is not None and data.source_title.strip():
        new_title = data.source_title.strip()
        source.original_path = new_title
        meta = dict(source.raw_metadata or {})
        meta["title"] = new_title
        source.raw_metadata = meta
    if data.extract_knowledge is not None:
        source.extract_knowledge = data.extract_knowledge

    db.commit()
    db.refresh(source)
    db.refresh(item)
    _populate_item_metadata(item)
    return item


def accept_inbox_item(db: Session, inbox_item_id: uuid.UUID) -> tuple[InboxItem, bool]:
    """Accept an inbox item and optionally start extraction."""
    item = get_inbox_item(db, inbox_item_id)
    if item.status != "pending":
        raise AppException(
            status.HTTP_409_CONFLICT,
            "INVALID_STATE_TRANSITION",
            f"Cannot accept inbox item in '{item.status}' state",
        )
    source = item.source

    item.status = "accepted"
    item.decided_at = datetime.now(UTC)
    db.commit()
    db.refresh(item)

    extraction_started = False
    if getattr(source, "extract_knowledge", True) and source.source_type != "image":
        try:
            source_processing_service.process_source(db, source.id)
            extraction_started = True
        except Exception as exc:
            logger.warning("Extraction on accept failed for source %s: %s", source.id, exc)

    _populate_item_metadata(item)
    return item, extraction_started


def reject_inbox_item(db: Session, inbox_item_id: uuid.UUID) -> uuid.UUID:
    """Reject an inbox item, permanently removing disk storage, chunks, and vectors, while retaining status."""
    item = get_inbox_item(db, inbox_item_id)
    if item.status != "pending":
        raise AppException(
            status.HTTP_409_CONFLICT,
            "INVALID_STATE_TRANSITION",
            f"Cannot reject inbox item in '{item.status}' state",
        )
    source = item.source
    source_id = source.id
    workspace_id = item.workspace_id

    # 1. Delete associated disk files safely within SOURCE_STORAGE_ROOT
    storage_root = getattr(settings, "SOURCE_STORAGE_ROOT", "/app/data/sources")
    clean_filename = os.path.basename(source.original_path or "uploaded_source")
    try:
        source_file = resolve_and_verify_storage_path(
            storage_root, workspace_id, source_id, clean_filename
        )
        if source_file.exists():
            source_file.unlink()
        parent_dir = source_file.parent
        if parent_dir.exists() and not any(parent_dir.iterdir()):
            parent_dir.rmdir()
    except Exception as exc:
        logger.warning("Disk cleanup during rejection encountered: %s", exc)

    # Clean legacy git repo root storage path if recorded
    if source.raw_metadata and "storage_path" in source.raw_metadata:
        try:
            p = Path(source.raw_metadata["storage_path"])
            if p.exists():
                p.unlink()
        except Exception:
            pass

    # 2. Delete vectors and chunks
    try:
        source_processing_service.delete_source_chunks(db, source_id)
    except Exception as exc:
        logger.warning("Vector chunk cleanup during rejection failed: %s", exc)

    # 3. Transition status and retain audit record
    item.status = "rejected"
    item.decided_at = datetime.now(UTC)
    source.import_status = "skipped"
    source.processing_status = "FAILED"
    source.error_message = "Rejected by user in Knowledge Inbox."
    db.commit()
    db.refresh(item)
    db.refresh(source)

    logger.info(
        "Permanently rejected and purged content for inbox item %s and source %s",
        inbox_item_id,
        source_id,
    )
    return source_id


def redetect_inbox_item(db: Session, inbox_item_id: uuid.UUID) -> InboxItem:
    """Re-run dry run detection on an inbox item."""
    item = get_inbox_item(db, inbox_item_id)
    if item.status != "pending":
        raise AppException(
            status.HTTP_409_CONFLICT,
            "INVALID_STATE_TRANSITION",
            f"Cannot re-detect concepts on inbox item in '{item.status}' state",
        )
    run_dry_run_detection(db, item)
    db.refresh(item)
    _populate_item_metadata(item)
    return item
