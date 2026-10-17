"""Membership service managing polymorphic typed members in Collections and Threads.

Canonical module per CONTRACT v0.4.2 §5.3, §6.1, §6.2.
Enforces deduplication (409), cross-workspace isolation (422), and cascade semantics.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.collection import (
    Collection,
    CollectionConversation,
    CollectionEntity,
    CollectionNote,
    CollectionSource,
)
from app.models.conversation import Conversation
from app.models.graph_entity import GraphEntity
from app.models.note import Note
from app.models.source import Source
from app.models.thread import (
    Thread,
    ThreadConversation,
    ThreadEntity,
    ThreadNote,
    ThreadSource,
)
from app.schemas.collection import (
    CollectionStatsResponse,
    KnowledgeItemListResponse,
    KnowledgeItemResponse,
    KnowledgeItemType,
)


def _get_target_object_and_validate(
    db: Session, workspace_id: uuid.UUID, item_type: KnowledgeItemType, item_id: uuid.UUID
) -> tuple[Any, str, dict[str, Any]]:
    """Verify target item exists and belongs to the workspace, returning (obj, title, metadata)."""
    if item_type == "note":
        note = db.query(Note).filter(Note.id == item_id).first()
        if not note:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=f"Note {item_id} not found"
            )
        if note.workspace_id != workspace_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Item belongs to a different workspace",
            )
        return note, note.title, {"is_pinned": note.is_pinned, "is_archived": note.is_archived}

    elif item_type == "source":
        source = db.query(Source).filter(Source.id == item_id).first()
        if not source:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=f"Source {item_id} not found"
            )
        if source.workspace_id != workspace_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Item belongs to a different workspace",
            )
        title = source.original_path.split("/")[-1].split("\\")[-1] or source.source_identifier
        return source, title, {"source_type": source.source_type, "mime_type": source.mime_type}

    elif item_type == "entity":
        entity = db.query(GraphEntity).filter(GraphEntity.id == item_id).first()
        if not entity:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=f"Entity {item_id} not found"
            )
        if entity.workspace_id != workspace_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Item belongs to a different workspace",
            )
        return (
            entity,
            entity.name,
            {"entity_type": entity.entity_type, "is_manual": entity.is_manual},
        )

    elif item_type == "conversation":
        conv = db.query(Conversation).filter(Conversation.id == item_id).first()
        if not conv:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=f"Conversation {item_id} not found"
            )
        if conv.workspace_id != workspace_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Item belongs to a different workspace",
            )
        return (
            conv,
            conv.title or "Untitled Conversation",
            {"message_count": len(conv.messages) if hasattr(conv, "messages") else 0},
        )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid item_type '{item_type}'"
    )


def add_collection_item(
    db: Session, collection: Collection, item_type: KnowledgeItemType, item_id: uuid.UUID
) -> KnowledgeItemResponse:
    """Add a member to a collection. Enforces 409 on duplicate, 422 on cross-workspace."""
    obj, title, meta = _get_target_object_and_validate(
        db, collection.workspace_id, item_type, item_id
    )
    now = datetime.now(UTC)

    if item_type == "note":
        existing = (
            db.query(CollectionNote).filter_by(collection_id=collection.id, note_id=item_id).first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Note already exists in collection"
            )
        member = CollectionNote(collection_id=collection.id, note_id=item_id, added_at=now)
        db.add(member)

    elif item_type == "source":
        existing = (
            db.query(CollectionSource)
            .filter_by(collection_id=collection.id, source_id=item_id)
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Source already exists in collection"
            )
        member = CollectionSource(collection_id=collection.id, source_id=item_id, added_at=now)
        db.add(member)

    elif item_type == "entity":
        existing = (
            db.query(CollectionEntity)
            .filter_by(collection_id=collection.id, entity_id=item_id)
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Entity already exists in collection"
            )
        member = CollectionEntity(collection_id=collection.id, entity_id=item_id, added_at=now)
        db.add(member)

    elif item_type == "conversation":
        existing = (
            db.query(CollectionConversation)
            .filter_by(collection_id=collection.id, conversation_id=item_id)
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Conversation already exists in collection",
            )
        member = CollectionConversation(
            collection_id=collection.id, conversation_id=item_id, added_at=now
        )
        db.add(member)

    collection.updated_at = now
    db.commit()

    return KnowledgeItemResponse(
        item_type=item_type,
        item_id=item_id,
        title=title,
        added_at=now,
        metadata=meta,
    )


def remove_collection_item(
    db: Session, collection: Collection, item_type: KnowledgeItemType, item_id: uuid.UUID
) -> None:
    """Remove a member from a collection without deleting the target object."""
    deleted = 0
    if item_type == "note":
        deleted = (
            db.query(CollectionNote)
            .filter_by(collection_id=collection.id, note_id=item_id)
            .delete()
        )
    elif item_type == "source":
        deleted = (
            db.query(CollectionSource)
            .filter_by(collection_id=collection.id, source_id=item_id)
            .delete()
        )
    elif item_type == "entity":
        deleted = (
            db.query(CollectionEntity)
            .filter_by(collection_id=collection.id, entity_id=item_id)
            .delete()
        )
    elif item_type == "conversation":
        deleted = (
            db.query(CollectionConversation)
            .filter_by(collection_id=collection.id, conversation_id=item_id)
            .delete()
        )

    if deleted == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{item_type.capitalize()} not in collection",
        )

    collection.updated_at = datetime.now(UTC)
    db.commit()


def list_collection_items(
    db: Session, collection: Collection, page: int = 1, page_size: int = 20
) -> KnowledgeItemListResponse:
    """List members across all 4 types sorted by added_at descending."""
    items: list[KnowledgeItemResponse] = []

    # Notes
    for cn in db.query(CollectionNote).filter_by(collection_id=collection.id).all():
        n = db.query(Note).filter(Note.id == cn.note_id).first()
        if n:
            items.append(
                KnowledgeItemResponse(
                    item_type="note",
                    item_id=n.id,
                    title=n.title,
                    added_at=cn.added_at,
                    metadata={"is_pinned": n.is_pinned, "is_archived": n.is_archived},
                )
            )

    # Sources
    for cs in db.query(CollectionSource).filter_by(collection_id=collection.id).all():
        s = db.query(Source).filter(Source.id == cs.source_id).first()
        if s:
            title = s.original_path.split("/")[-1].split("\\")[-1] or s.source_identifier
            items.append(
                KnowledgeItemResponse(
                    item_type="source",
                    item_id=s.id,
                    title=title,
                    added_at=cs.added_at,
                    metadata={"source_type": s.source_type, "mime_type": s.mime_type},
                )
            )

    # Entities
    for ce in db.query(CollectionEntity).filter_by(collection_id=collection.id).all():
        e = db.query(GraphEntity).filter(GraphEntity.id == ce.entity_id).first()
        if e:
            items.append(
                KnowledgeItemResponse(
                    item_type="entity",
                    item_id=e.id,
                    title=e.name,
                    added_at=ce.added_at,
                    metadata={"entity_type": e.entity_type, "is_manual": e.is_manual},
                )
            )

    # Conversations
    for cc in db.query(CollectionConversation).filter_by(collection_id=collection.id).all():
        c = db.query(Conversation).filter(Conversation.id == cc.conversation_id).first()
        if c:
            items.append(
                KnowledgeItemResponse(
                    item_type="conversation",
                    item_id=c.id,
                    title=c.title or "Untitled Conversation",
                    added_at=cc.added_at,
                    metadata={},
                )
            )

    items.sort(key=lambda x: x.added_at, reverse=True)
    total = len(items)

    start = (page - 1) * page_size
    end = start + page_size
    paginated = items[start:end]

    return KnowledgeItemListResponse(
        items=paginated,
        total=total,
        page=page,
        page_size=page_size,
    )


def get_collection_stats(db: Session, collection: Collection) -> CollectionStatsResponse:
    """Return counts for each membership type in a collection."""
    notes = db.query(CollectionNote).filter_by(collection_id=collection.id).count()
    sources = db.query(CollectionSource).filter_by(collection_id=collection.id).count()
    entities = db.query(CollectionEntity).filter_by(collection_id=collection.id).count()
    conversations = db.query(CollectionConversation).filter_by(collection_id=collection.id).count()

    return CollectionStatsResponse(
        collection_id=collection.id,
        note_count=notes,
        source_count=sources,
        entity_count=entities,
        conversation_count=conversations,
        total_items=notes + sources + entities + conversations,
    )


# -- Thread Membership Functions (§8.2) --


def add_thread_item(
    db: Session, thread: Thread, item_type: KnowledgeItemType, item_id: uuid.UUID
) -> KnowledgeItemResponse:
    """Add a member to a thread. Enforces 409 on duplicate, 422 on cross-workspace."""
    obj, title, meta = _get_target_object_and_validate(db, thread.workspace_id, item_type, item_id)
    now = datetime.now(UTC)

    if item_type == "note":
        existing = db.query(ThreadNote).filter_by(thread_id=thread.id, note_id=item_id).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Note already exists in thread"
            )
        db.add(ThreadNote(thread_id=thread.id, note_id=item_id, added_at=now))

    elif item_type == "source":
        existing = db.query(ThreadSource).filter_by(thread_id=thread.id, source_id=item_id).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Source already exists in thread"
            )
        db.add(ThreadSource(thread_id=thread.id, source_id=item_id, added_at=now))

    elif item_type == "entity":
        existing = db.query(ThreadEntity).filter_by(thread_id=thread.id, entity_id=item_id).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Entity already exists in thread"
            )
        db.add(ThreadEntity(thread_id=thread.id, entity_id=item_id, added_at=now))

    elif item_type == "conversation":
        existing = (
            db.query(ThreadConversation)
            .filter_by(thread_id=thread.id, conversation_id=item_id)
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Conversation already exists in thread"
            )
        db.add(ThreadConversation(thread_id=thread.id, conversation_id=item_id, added_at=now))

    thread.updated_at = now
    db.commit()

    return KnowledgeItemResponse(
        item_type=item_type,
        item_id=item_id,
        title=title,
        added_at=now,
        metadata=meta,
    )


def remove_thread_item(
    db: Session, thread: Thread, item_type: KnowledgeItemType, item_id: uuid.UUID
) -> None:
    """Remove a member from a thread without deleting target object."""
    deleted = 0
    if item_type == "note":
        deleted = db.query(ThreadNote).filter_by(thread_id=thread.id, note_id=item_id).delete()
    elif item_type == "source":
        deleted = db.query(ThreadSource).filter_by(thread_id=thread.id, source_id=item_id).delete()
    elif item_type == "entity":
        deleted = db.query(ThreadEntity).filter_by(thread_id=thread.id, entity_id=item_id).delete()
    elif item_type == "conversation":
        deleted = (
            db.query(ThreadConversation)
            .filter_by(thread_id=thread.id, conversation_id=item_id)
            .delete()
        )

    if deleted == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"{item_type.capitalize()} not in thread"
        )

    thread.updated_at = datetime.now(UTC)
    db.commit()


def list_thread_items(
    db: Session, thread: Thread, page: int = 1, page_size: int = 20
) -> KnowledgeItemListResponse:
    """List thread members across all 4 types sorted by added_at descending."""
    items: list[KnowledgeItemResponse] = []

    for tn in db.query(ThreadNote).filter_by(thread_id=thread.id).all():
        n = db.query(Note).filter(Note.id == tn.note_id).first()
        if n:
            items.append(
                KnowledgeItemResponse(
                    item_type="note",
                    item_id=n.id,
                    title=n.title,
                    added_at=tn.added_at,
                    metadata={"is_pinned": n.is_pinned, "is_archived": n.is_archived},
                )
            )

    for ts in db.query(ThreadSource).filter_by(thread_id=thread.id).all():
        s = db.query(Source).filter(Source.id == ts.source_id).first()
        if s:
            title = s.original_path.split("/")[-1].split("\\")[-1] or s.source_identifier
            items.append(
                KnowledgeItemResponse(
                    item_type="source",
                    item_id=s.id,
                    title=title,
                    added_at=ts.added_at,
                    metadata={"source_type": s.source_type, "mime_type": s.mime_type},
                )
            )

    for te in db.query(ThreadEntity).filter_by(thread_id=thread.id).all():
        e = db.query(GraphEntity).filter(GraphEntity.id == te.entity_id).first()
        if e:
            items.append(
                KnowledgeItemResponse(
                    item_type="entity",
                    item_id=e.id,
                    title=e.name,
                    added_at=te.added_at,
                    metadata={"entity_type": e.entity_type, "is_manual": e.is_manual},
                )
            )

    for tc in db.query(ThreadConversation).filter_by(thread_id=thread.id).all():
        c = db.query(Conversation).filter(Conversation.id == tc.conversation_id).first()
        if c:
            items.append(
                KnowledgeItemResponse(
                    item_type="conversation",
                    item_id=c.id,
                    title=c.title or "Untitled Conversation",
                    added_at=tc.added_at,
                    metadata={},
                )
            )

    items.sort(key=lambda x: x.added_at, reverse=True)
    total = len(items)

    start = (page - 1) * page_size
    end = start + page_size
    paginated = items[start:end]

    return KnowledgeItemListResponse(
        items=paginated,
        total=total,
        page=page,
        page_size=page_size,
    )
