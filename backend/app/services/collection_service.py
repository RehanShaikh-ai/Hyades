"""Collection service per CONTRACT v0.4.2 §5.3, §8.1."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError
from app.models.collection import (
    Collection,
    CollectionConversation,
    CollectionEntity,
    CollectionNote,
    CollectionSource,
)
from app.models.conversation import Conversation
from app.models.graph_entity import GraphEntity
from app.models.graph_relationship import GraphRelationship
from app.models.note import Note
from app.models.source import Source
from app.schemas.collection import CollectionCreate, CollectionUpdate, RelatedEntity


def create_collection(
    session: Session,
    workspace_id: UUID,
    created_by: UUID,
    data: CollectionCreate,
) -> Collection:
    existing = session.scalar(
        select(Collection).where(
            Collection.workspace_id == workspace_id,
            Collection.name == data.name,
        )
    )
    if existing:
        raise ConflictError(f"Collection with name '{data.name}' already exists in workspace")

    collection = Collection(
        workspace_id=workspace_id,
        created_by=created_by,
        name=data.name,
        description=data.description,
        icon=data.icon,
    )
    session.add(collection)
    session.commit()
    session.refresh(collection)
    return collection


def get_collection(session: Session, collection_id: UUID) -> Collection:
    collection = session.get(Collection, collection_id)
    if not collection:
        raise NotFoundError(f"Collection '{collection_id}' not found")
    return collection


def list_collections(
    session: Session,
    workspace_id: UUID,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Collection], int]:
    stmt = (
        select(Collection)
        .where(Collection.workspace_id == workspace_id)
        .order_by(Collection.updated_at.desc())
    )
    count_stmt = select(func.count(Collection.id)).where(Collection.workspace_id == workspace_id)

    total = session.scalar(count_stmt) or 0
    items = session.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()

    return list(items), total


def update_collection(
    session: Session,
    collection_id: UUID,
    data: CollectionUpdate,
) -> Collection:
    collection = get_collection(session, collection_id)
    if data.name is not None and data.name != collection.name:
        existing = session.scalar(
            select(Collection).where(
                Collection.workspace_id == collection.workspace_id,
                Collection.name == data.name,
            )
        )
        if existing:
            raise ConflictError(f"Collection with name '{data.name}' already exists in workspace")
        collection.name = data.name

    if data.description is not None:
        collection.description = data.description
    if data.icon is not None:
        collection.icon = data.icon

    session.commit()
    session.refresh(collection)
    return collection


def delete_collection(session: Session, collection_id: UUID) -> None:
    collection = get_collection(session, collection_id)
    session.delete(collection)
    session.commit()


def get_collection_items(session: Session, collection_id: UUID) -> list[dict]:
    collection = get_collection(session, collection_id)
    items = []

    notes_res = session.execute(
        select(CollectionNote, Note)
        .join(Note, CollectionNote.note_id == Note.id)
        .where(CollectionNote.collection_id == collection.id)
    )
    for cn, note in notes_res.all():
        items.append({
            "item_type": "note",
            "item_id": note.id,
            "title": note.title,
            "added_at": cn.added_at,
        })

    sources_res = session.execute(
        select(CollectionSource, Source)
        .join(Source, CollectionSource.source_id == Source.id)
        .where(CollectionSource.collection_id == collection.id)
    )
    for cs, src in sources_res.all():
        items.append({
            "item_type": "source",
            "item_id": src.id,
            "title": src.original_path.split("/")[-1],
            "added_at": cs.added_at,
        })

    entities_res = session.execute(
        select(CollectionEntity, GraphEntity)
        .join(GraphEntity, CollectionEntity.entity_id == GraphEntity.id)
        .where(CollectionEntity.collection_id == collection.id)
    )
    for ce, ent in entities_res.all():
        items.append({
            "item_type": "entity",
            "item_id": ent.id,
            "title": ent.name,
            "added_at": ce.added_at,
        })

    convs_res = session.execute(
        select(CollectionConversation, Conversation)
        .join(Conversation, CollectionConversation.conversation_id == Conversation.id)
        .where(CollectionConversation.collection_id == collection.id)
    )
    for cc, conv in convs_res.all():
        items.append({
            "item_type": "conversation",
            "item_id": conv.id,
            "title": conv.title,
            "added_at": cc.added_at,
        })

    return items


def get_collection_stats(session: Session, collection_id: UUID) -> dict:
    collection = get_collection(session, collection_id)

    note_count = session.scalar(
        select(func.count(CollectionNote.note_id)).where(CollectionNote.collection_id == collection.id)
    ) or 0

    source_count = session.scalar(
        select(func.count(CollectionSource.source_id)).where(CollectionSource.collection_id == collection.id)
    ) or 0

    entity_count = session.scalar(
        select(func.count(CollectionEntity.entity_id)).where(CollectionEntity.collection_id == collection.id)
    ) or 0

    conversation_count = session.scalar(
        select(func.count(CollectionConversation.conversation_id)).where(CollectionConversation.collection_id == collection.id)
    ) or 0

    return {
        "collection_id": collection.id,
        "note_count": note_count,
        "source_count": source_count,
        "entity_count": entity_count,
        "conversation_count": conversation_count,
    }


def get_collection_related(session: Session, collection_id: UUID) -> list[RelatedEntity]:
    collection = get_collection(session, collection_id)

    member_entities = session.scalars(
        select(CollectionEntity.entity_id).where(CollectionEntity.collection_id == collection.id)
    ).all()

    if not member_entities:
        return []

    stmt = select(GraphRelationship).where(
        GraphRelationship.source_entity_id.in_(member_entities),
        GraphRelationship.target_entity_id.in_(member_entities),
    )
    rels = session.scalars(stmt).all()

    related = []
    for r in rels:
        ent = session.get(GraphEntity, r.target_entity_id)
        if ent:
            related.append(RelatedEntity(
                id=ent.id,
                name=ent.name,
                entity_type=ent.entity_type,
                connection_count=1,
            ))
    return related
