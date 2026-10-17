"""Collection service per CONTRACT v0.4.2 §5.3, §8.1, §14.3."""

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.collection import (
    Collection,
    CollectionConversation,
    CollectionEntity,
    CollectionNote,
    CollectionSource,
)
from app.models.entity_chunk import EntityChunk
from app.models.graph_entity import GraphEntity
from app.models.graph_relationship import GraphRelationship
from app.models.workspace import Workspace
from app.schemas.collection import (
    CollectionCreate,
    CollectionRelatedResponse,
    CollectionResponse,
    CollectionUpdate,
    RelatedKnowledgeItem,
)


def _get_item_count(db: Session, collection_id: uuid.UUID) -> int:
    n = db.query(CollectionNote).filter_by(collection_id=collection_id).count()
    s = db.query(CollectionSource).filter_by(collection_id=collection_id).count()
    e = db.query(CollectionEntity).filter_by(collection_id=collection_id).count()
    c = db.query(CollectionConversation).filter_by(collection_id=collection_id).count()
    return n + s + e + c


def create_collection(
    db: Session, workspace_id: uuid.UUID, data: CollectionCreate, user_id: uuid.UUID | None = None
) -> CollectionResponse:
    """Create a new collection. Enforces unique name per workspace."""
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    creator_id = user_id or data.created_by
    if not creator_id:
        creator_id = ws.owner_id

    # Check unique (workspace_id, name)
    existing = (
        db.query(Collection).filter_by(workspace_id=workspace_id, name=data.name.strip()).first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A collection with this name already exists in this workspace",
        )

    now = datetime.now(UTC)
    coll = Collection(
        workspace_id=workspace_id,
        name=data.name.strip(),
        description=data.description,
        icon=data.icon,
        created_by=creator_id,
        created_at=now,
        updated_at=now,
    )
    db.add(coll)
    db.commit()
    db.refresh(coll)

    resp = CollectionResponse.model_validate(coll)
    resp.item_count = 0
    return resp


def get_collection(db: Session, collection_id: uuid.UUID) -> Collection:
    """Retrieve collection by id or raise 404."""
    coll = db.query(Collection).filter(Collection.id == collection_id).first()
    if not coll:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")
    return coll


def list_collections(
    db: Session, workspace_id: uuid.UUID, page: int = 1, page_size: int = 20
) -> tuple[list[CollectionResponse], int]:
    """List collections in a workspace ordered by updated_at descending."""
    q = db.query(Collection).filter(Collection.workspace_id == workspace_id)
    total = q.count()
    collections = (
        q.order_by(Collection.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = []
    for c in collections:
        r = CollectionResponse.model_validate(c)
        r.item_count = _get_item_count(db, c.id)
        items.append(r)

    return items, total


def update_collection(
    db: Session, collection_id: uuid.UUID, data: CollectionUpdate
) -> CollectionResponse:
    """Update collection fields."""
    coll = get_collection(db, collection_id)

    if data.name is not None and data.name.strip() != coll.name:
        existing = (
            db.query(Collection)
            .filter_by(workspace_id=coll.workspace_id, name=data.name.strip())
            .filter(Collection.id != collection_id)
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A collection with this name already exists in this workspace",
            )
        coll.name = data.name.strip()

    if data.description is not None:
        coll.description = data.description
    if data.icon is not None:
        coll.icon = data.icon

    coll.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(coll)

    resp = CollectionResponse.model_validate(coll)
    resp.item_count = _get_item_count(db, coll.id)
    return resp


def delete_collection(db: Session, collection_id: uuid.UUID) -> None:
    """Delete a collection. Memberships cascade-delete automatically."""
    coll = get_collection(db, collection_id)
    db.delete(coll)
    db.commit()


def get_related_knowledge(db: Session, collection: Collection) -> CollectionRelatedResponse:
    """Compute related knowledge dynamically per Contract §14.3 without writing or mutating graph edges."""
    # Collect IDs of items in collection
    note_ids = [
        cn.note_id
        for cn in db.query(CollectionNote.note_id).filter_by(collection_id=collection.id).all()
    ]
    source_ids = [
        cs.source_id
        for cs in db.query(CollectionSource.source_id).filter_by(collection_id=collection.id).all()
    ]
    member_entity_ids = set(
        ce.entity_id
        for ce in db.query(CollectionEntity.entity_id).filter_by(collection_id=collection.id).all()
    )

    # Find entities connected through provenance (entity_chunks) of notes & sources in collection
    provenance_entity_ids = set()
    if note_ids:
        for (eid,) in (
            db.query(EntityChunk.entity_id).filter(EntityChunk.note_id.in_(note_ids)).distinct()
        ):
            provenance_entity_ids.add(eid)
    if source_ids:
        for (eid,) in (
            db.query(EntityChunk.entity_id).filter(EntityChunk.source_id.in_(source_ids)).distinct()
        ):
            provenance_entity_ids.add(eid)

    # Find neighbor entities connected via graph relationships to collection entities
    connected_entity_ids = set()
    all_starting_entities = member_entity_ids | provenance_entity_ids
    if all_starting_entities:
        for rel in (
            db.query(GraphRelationship)
            .filter(
                (GraphRelationship.source_entity_id.in_(all_starting_entities))
                | (GraphRelationship.target_entity_id.in_(all_starting_entities))
            )
            .limit(100)
            .all()
        ):
            if rel.source_entity_id not in all_starting_entities:
                connected_entity_ids.add(rel.source_entity_id)
            if rel.target_entity_id not in all_starting_entities:
                connected_entity_ids.add(rel.target_entity_id)

    # Combine and exclude items already in collection
    target_eids = (provenance_entity_ids | connected_entity_ids) - member_entity_ids

    items: list[RelatedKnowledgeItem] = []
    if target_eids:
        entities = db.query(GraphEntity).filter(GraphEntity.id.in_(list(target_eids)[:50])).all()
        for e in entities:
            items.append(
                RelatedKnowledgeItem(
                    item_type="entity",
                    item_id=e.id,
                    title=e.name,
                    relationship_type=e.entity_type,
                    score=1.0,
                )
            )

    return CollectionRelatedResponse(
        collection_id=collection.id,
        items=items,
        total=len(items),
    )
