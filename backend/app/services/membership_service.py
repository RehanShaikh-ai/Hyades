"""Membership service per CONTRACT v0.4.2 §6.1, §6.2.

Provides reusable methods for Collection and Thread memberships across notes, sources, entities, and conversations.
"""

from typing import Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, ValidationError
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

ItemType = Literal["note", "source", "entity", "conversation"]


def add_collection_item(
    session: Session,
    collection: Collection,
    item_type: ItemType,
    item_id: UUID,
) -> None:
    if item_type == "note":
        item = session.get(Note, item_id)
        if not item or item.workspace_id != collection.workspace_id:
            raise ValidationError("Target note not found or from different workspace")
        existing = session.scalar(
            select(CollectionNote).where(
                CollectionNote.collection_id == collection.id,
                CollectionNote.note_id == item_id,
            )
        )
        if existing:
            raise ConflictError("Item is already a member of this collection")
        session.add(CollectionNote(collection_id=collection.id, note_id=item_id))

    elif item_type == "source":
        item = session.get(Source, item_id)
        if not item or item.workspace_id != collection.workspace_id:
            raise ValidationError("Target source not found or from different workspace")
        existing = session.scalar(
            select(CollectionSource).where(
                CollectionSource.collection_id == collection.id,
                CollectionSource.source_id == item_id,
            )
        )
        if existing:
            raise ConflictError("Item is already a member of this collection")
        session.add(CollectionSource(collection_id=collection.id, source_id=item_id))

    elif item_type == "entity":
        item = session.get(GraphEntity, item_id)
        if not item or item.workspace_id != collection.workspace_id:
            raise ValidationError("Target entity not found or from different workspace")
        existing = session.scalar(
            select(CollectionEntity).where(
                CollectionEntity.collection_id == collection.id,
                CollectionEntity.entity_id == item_id,
            )
        )
        if existing:
            raise ConflictError("Item is already a member of this collection")
        session.add(CollectionEntity(collection_id=collection.id, entity_id=item_id))

    elif item_type == "conversation":
        item = session.get(Conversation, item_id)
        if not item or item.workspace_id != collection.workspace_id:
            raise ValidationError("Target conversation not found or from different workspace")
        existing = session.scalar(
            select(CollectionConversation).where(
                CollectionConversation.collection_id == collection.id,
                CollectionConversation.conversation_id == item_id,
            )
        )
        if existing:
            raise ConflictError("Item is already a member of this collection")
        session.add(CollectionConversation(collection_id=collection.id, conversation_id=item_id))

    session.commit()


def add_thread_item(
    session: Session,
    thread: Thread,
    item_type: ItemType,
    item_id: UUID,
) -> None:
    if item_type == "note":
        item = session.get(Note, item_id)
        if not item or item.workspace_id != thread.workspace_id:
            raise ValidationError("Target note not found or from different workspace")
        existing = session.scalar(
            select(ThreadNote).where(
                ThreadNote.thread_id == thread.id,
                ThreadNote.note_id == item_id,
            )
        )
        if existing:
            raise ConflictError("Item is already attached to this thread")
        session.add(ThreadNote(thread_id=thread.id, note_id=item_id))

    elif item_type == "source":
        item = session.get(Source, item_id)
        if not item or item.workspace_id != thread.workspace_id:
            raise ValidationError("Target source not found or from different workspace")
        existing = session.scalar(
            select(ThreadSource).where(
                ThreadSource.thread_id == thread.id,
                ThreadSource.source_id == item_id,
            )
        )
        if existing:
            raise ConflictError("Item is already attached to this thread")
        session.add(ThreadSource(thread_id=thread.id, source_id=item_id))

    elif item_type == "entity":
        item = session.get(GraphEntity, item_id)
        if not item or item.workspace_id != thread.workspace_id:
            raise ValidationError("Target entity not found or from different workspace")
        existing = session.scalar(
            select(ThreadEntity).where(
                ThreadEntity.thread_id == thread.id,
                ThreadEntity.entity_id == item_id,
            )
        )
        if existing:
            raise ConflictError("Item is already attached to this thread")
        session.add(ThreadEntity(thread_id=thread.id, entity_id=item_id))

    elif item_type == "conversation":
        item = session.get(Conversation, item_id)
        if not item or item.workspace_id != thread.workspace_id:
            raise ValidationError("Target conversation not found or from different workspace")
        existing = session.scalar(
            select(ThreadConversation).where(
                ThreadConversation.thread_id == thread.id,
                ThreadConversation.conversation_id == item_id,
            )
        )
        if existing:
            raise ConflictError("Item is already attached to this thread")
        session.add(ThreadConversation(thread_id=thread.id, conversation_id=item_id))

    session.commit()
