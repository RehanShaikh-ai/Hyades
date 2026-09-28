"""Knowledge Graph service.

Canonical service per CONTRACT v0.3.2 §5.3, §9.1, §9.2, §9.3.
Provides workspace entity graph queries, CRUD for entities and relationships,
provenance lookup, neighborhood graph traversal, and graph search.
"""

import uuid
from collections import defaultdict
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import (
    ConflictError,
    EntityNotFoundError,
    NoteNotFoundError,
    RelationshipNotFoundError,
    ValidationError,
    WorkspaceNotFoundError,
)
from app.models.entity_chunk import EntityChunk
from app.models.graph_entity import VALID_ENTITY_TYPES, GraphEntity
from app.models.graph_relationship import GraphRelationship
from app.models.link_suggestion import LinkSuggestion
from app.models.note import Note
from app.models.note_cluster import NoteCluster
from app.models.note_link import NoteLink
from app.models.workspace import Workspace
from app.schemas.graph import (
    EntityProvenanceResponse,
    EntitySourceResponse,
    GraphClusterSummary,
    GraphEdge,
    GraphEdgeResponse,
    GraphNode,
    GraphNodeResponse,
    GraphResponse,
    GraphSearchEntityMatch,
    GraphSearchNoteMatch,
    GraphSearchResponse,
    GraphStats,
    NoteGraphResponse,
)
from app.schemas.graph_entity import GraphEntityCreate, GraphEntityUpdate
from app.schemas.graph_relationship import (
    GraphRelationshipCreate,
    GraphRelationshipUpdate,
)


def get_workspace_graph(
    db: Session,
    workspace_id: uuid.UUID,
    entity_type: str | None = None,
    cluster_id: uuid.UUID | None = None,
    note_id: uuid.UUID | None = None,
    relationship_type: str | None = None,
    min_confidence: float = 0.0,
    limit: int = 500,
) -> GraphResponse:
    """Return the entity knowledge graph for a workspace per CONTRACT §9.1."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError("Workspace not found.")

    if limit < 1 or limit > 2000:
        raise ValidationError("Limit must be between 1 and 2000.")

    # Base query for entities
    base_query = select(GraphEntity).where(GraphEntity.workspace_id == workspace_id)

    if entity_type:
        base_query = base_query.where(GraphEntity.entity_type == entity_type.strip().lower())

    if cluster_id:
        base_query = base_query.where(GraphEntity.cluster_id == cluster_id)

    if note_id:
        # Filter to entities connected to this note via EntityChunk
        base_query = (
            base_query.join(EntityChunk, EntityChunk.entity_id == GraphEntity.id)
            .where(EntityChunk.note_id == note_id)
            .distinct()
        )

    # Total matching count
    count_query = select(func.count()).select_from(base_query.subquery())
    total_matching = db.scalar(count_query) or 0
    is_truncated = total_matching > limit

    entities = db.scalars(
        base_query.order_by(GraphEntity.created_at.desc(), GraphEntity.id.asc()).limit(limit)
    ).all()
    entity_ids = {e.id for e in entities}

    # Fetch relationships between the returned entities
    edges: list[GraphEdgeResponse] = []
    degrees: dict[uuid.UUID, int] = defaultdict(int)

    if entity_ids:
        rel_query = select(GraphRelationship).where(
            GraphRelationship.workspace_id == workspace_id,
            GraphRelationship.source_entity_id.in_(entity_ids),
            GraphRelationship.target_entity_id.in_(entity_ids),
            GraphRelationship.confidence >= min_confidence,
        )
        if relationship_type:
            rel_query = rel_query.where(
                GraphRelationship.relationship_type == relationship_type.strip().lower()
            )

        raw_relationships = db.scalars(rel_query).all()
        for r in raw_relationships:
            degrees[r.source_entity_id] += 1
            degrees[r.target_entity_id] += 1
            edges.append(
                GraphEdgeResponse(
                    id=r.id,
                    source_entity_id=r.source_entity_id,
                    target_entity_id=r.target_entity_id,
                    relationship_type=r.relationship_type,
                    confidence=r.confidence,
                    is_manual=r.is_manual,
                )
            )

    # Note count per entity
    note_counts: dict[uuid.UUID, int] = defaultdict(int)
    if entity_ids:
        nc_query = (
            select(EntityChunk.entity_id, func.count(func.distinct(EntityChunk.note_id)))
            .where(EntityChunk.entity_id.in_(entity_ids))
            .group_by(EntityChunk.entity_id)
        )
        for eid, count in db.execute(nc_query).all():
            note_counts[eid] = count

    nodes = [
        GraphNodeResponse(
            id=e.id,
            name=e.name,
            entity_type=e.entity_type,
            description=e.description,
            cluster_id=e.cluster_id,
            is_manual=e.is_manual,
            degree=degrees[e.id],
            note_count=note_counts[e.id],
        )
        for e in entities
    ]

    # Fetch clusters for workspace
    clusters_raw = db.scalars(
        select(NoteCluster)
        .options(selectinload(NoteCluster.members))
        .where(NoteCluster.workspace_id == workspace_id)
    ).all()

    clusters = [
        GraphClusterSummary(
            id=c.id,
            label=c.label,
            member_count=len(c.members),
        )
        for c in clusters_raw
    ]

    isolated_count = sum(1 for e in entities if degrees[e.id] == 0)

    stats = GraphStats(
        node_count=len(nodes),
        edge_count=len(edges),
        cluster_count=len(clusters),
        isolated_count=isolated_count,
        truncated=is_truncated,
    )

    return GraphResponse(nodes=nodes, edges=edges, clusters=clusters, stats=stats)


def get_entity(db: Session, entity_id: uuid.UUID) -> GraphEntity:
    """Retrieve an entity by ID per CONTRACT §9.2."""
    entity = db.get(GraphEntity, entity_id)
    if not entity:
        raise EntityNotFoundError(f"Entity {entity_id} not found.")
    return entity


def list_entities(
    db: Session,
    workspace_id: uuid.UUID,
    entity_type: str | None = None,
    cluster_id: uuid.UUID | None = None,
    limit: int = 500,
) -> list[GraphEntity]:
    """List entities in a workspace."""
    query = select(GraphEntity).where(GraphEntity.workspace_id == workspace_id)
    if entity_type:
        query = query.where(GraphEntity.entity_type == entity_type)
    if cluster_id:
        query = query.where(GraphEntity.cluster_id == cluster_id)
    return db.scalars(query.order_by(GraphEntity.name.asc()).limit(limit)).all()


def create_entity(
    db: Session,
    workspace_id: uuid.UUID,
    data: GraphEntityCreate,
) -> GraphEntity:
    """Manually create an entity in a workspace per CONTRACT §9.2."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError("Workspace not found.")

    if data.entity_type not in VALID_ENTITY_TYPES:
        raise ValidationError(f"Invalid entity_type. Must be one of {VALID_ENTITY_TYPES}.")

    # Check for duplicate entity name in workspace
    existing = db.scalars(
        select(GraphEntity).where(
            GraphEntity.workspace_id == workspace_id,
            func.lower(GraphEntity.name) == data.name.strip().lower(),
        )
    ).first()

    if existing:
        raise ConflictError(f"Entity with name '{data.name}' already exists in this workspace.")

    entity = GraphEntity(
        workspace_id=workspace_id,
        name=data.name.strip(),
        entity_type=data.entity_type,
        description=data.description,
        is_manual=True,
    )
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return entity


def update_entity(
    db: Session,
    entity_id: uuid.UUID,
    data: GraphEntityUpdate,
) -> GraphEntity:
    """Update an existing entity (PATCH) per CONTRACT §9.2."""
    entity = get_entity(db, entity_id)

    if data.name is not None:
        new_name = data.name.strip()
        if not new_name:
            raise ValidationError("Entity name cannot be empty.")
        # Check name conflict if changed
        if new_name.lower() != entity.name.lower():
            conflict = db.scalars(
                select(GraphEntity).where(
                    GraphEntity.workspace_id == entity.workspace_id,
                    func.lower(GraphEntity.name) == new_name.lower(),
                    GraphEntity.id != entity_id,
                )
            ).first()
            if conflict:
                raise ConflictError(f"Entity with name '{new_name}' already exists.")
        entity.name = new_name

    if data.entity_type is not None:
        if data.entity_type not in VALID_ENTITY_TYPES:
            raise ValidationError(f"Invalid entity_type. Must be one of {VALID_ENTITY_TYPES}.")
        entity.entity_type = data.entity_type

    if data.description is not None:
        entity.description = data.description

    entity.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(entity)
    return entity


def delete_entity(db: Session, entity_id: uuid.UUID) -> None:
    """Delete an entity and clean up cascade relationships per CONTRACT §9.2."""
    entity = get_entity(db, entity_id)
    entity_id_str = str(entity.id)

    # Clean up LinkSuggestions where this entity is in shared_entity_ids (§9.2)
    sug_query = select(LinkSuggestion).where(LinkSuggestion.workspace_id == entity.workspace_id)
    suggestions = db.scalars(sug_query).all()
    for s in suggestions:
        if s.shared_entity_ids and entity_id_str in [str(x) for x in s.shared_entity_ids]:
            updated_ids = [x for x in s.shared_entity_ids if str(x) != entity_id_str]
            if not updated_ids:
                db.delete(s)
            else:
                s.shared_entity_ids = updated_ids

    db.delete(entity)
    db.commit()


def create_relationship(
    db: Session,
    workspace_id: uuid.UUID,
    data: GraphRelationshipCreate,
) -> GraphRelationship:
    """Manually create a relationship between two entities per CONTRACT §9.3."""
    if data.source_entity_id == data.target_entity_id:
        raise ValidationError("Self-relationships are not allowed.")

    source = db.get(GraphEntity, data.source_entity_id)
    target = db.get(GraphEntity, data.target_entity_id)

    if not source or source.workspace_id != workspace_id:
        raise EntityNotFoundError(f"Source entity {data.source_entity_id} not found in workspace.")
    if not target or target.workspace_id != workspace_id:
        raise EntityNotFoundError(f"Target entity {data.target_entity_id} not found in workspace.")

    rel_type = data.relationship_type.strip().lower().replace(" ", "_")
    if not rel_type:
        raise ValidationError("Relationship type cannot be empty.")

    # Check for existing relationship
    existing = db.scalars(
        select(GraphRelationship).where(
            GraphRelationship.workspace_id == workspace_id,
            GraphRelationship.source_entity_id == data.source_entity_id,
            GraphRelationship.target_entity_id == data.target_entity_id,
            GraphRelationship.relationship_type == rel_type,
        )
    ).first()

    if existing:
        raise ConflictError("Relationship with same source, target, and type already exists.")

    rel = GraphRelationship(
        workspace_id=workspace_id,
        source_entity_id=data.source_entity_id,
        target_entity_id=data.target_entity_id,
        relationship_type=rel_type,
        description=data.description,
        confidence=1.0,
        is_manual=True,
    )
    db.add(rel)
    db.commit()
    db.refresh(rel)
    return rel


def get_relationship(db: Session, relationship_id: uuid.UUID) -> GraphRelationship:
    """Retrieve a relationship by ID per CONTRACT §9.3."""
    rel = db.get(GraphRelationship, relationship_id)
    if not rel:
        raise RelationshipNotFoundError(f"Relationship {relationship_id} not found.")
    return rel


def update_relationship(
    db: Session,
    relationship_id: uuid.UUID,
    data: GraphRelationshipUpdate,
) -> GraphRelationship:
    """Update relationship type or description per CONTRACT §9.3."""
    rel = get_relationship(db, relationship_id)

    if data.relationship_type is not None:
        new_type = data.relationship_type.strip().lower().replace(" ", "_")
        if not new_type:
            raise ValidationError("Relationship type cannot be empty.")
        if new_type != rel.relationship_type:
            conflict = db.scalars(
                select(GraphRelationship).where(
                    GraphRelationship.workspace_id == rel.workspace_id,
                    GraphRelationship.source_entity_id == rel.source_entity_id,
                    GraphRelationship.target_entity_id == rel.target_entity_id,
                    GraphRelationship.relationship_type == new_type,
                    GraphRelationship.id != relationship_id,
                )
            ).first()
            if conflict:
                raise ConflictError("Relationship with same type already exists.")
            rel.relationship_type = new_type

    if data.description is not None:
        rel.description = data.description

    rel.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(rel)
    return rel


def delete_relationship(db: Session, relationship_id: uuid.UUID) -> None:
    """Delete a relationship per CONTRACT §9.3."""
    rel = get_relationship(db, relationship_id)
    db.delete(rel)
    db.commit()


def get_entity_neighborhood(db: Session, entity_id: uuid.UUID) -> GraphResponse:
    """Return the 1-hop graph neighborhood for an entity per CONTRACT §9.2."""
    get_entity(db, entity_id)

    # Find all relationships where entity is source or target
    rels = db.scalars(
        select(GraphRelationship).where(
            or_(
                GraphRelationship.source_entity_id == entity_id,
                GraphRelationship.target_entity_id == entity_id,
            )
        )
    ).all()

    neighbor_ids = {entity_id}
    for r in rels:
        neighbor_ids.add(r.source_entity_id)
        neighbor_ids.add(r.target_entity_id)

    entities = db.scalars(select(GraphEntity).where(GraphEntity.id.in_(neighbor_ids))).all()

    degrees: dict[uuid.UUID, int] = defaultdict(int)
    edges: list[GraphEdgeResponse] = []
    for r in rels:
        degrees[r.source_entity_id] += 1
        degrees[r.target_entity_id] += 1
        edges.append(
            GraphEdgeResponse(
                id=r.id,
                source_entity_id=r.source_entity_id,
                target_entity_id=r.target_entity_id,
                relationship_type=r.relationship_type,
                confidence=r.confidence,
                is_manual=r.is_manual,
            )
        )

    nodes = [
        GraphNodeResponse(
            id=e.id,
            name=e.name,
            entity_type=e.entity_type,
            description=e.description,
            cluster_id=e.cluster_id,
            is_manual=e.is_manual,
            degree=degrees[e.id],
            note_count=0,
        )
        for e in entities
    ]

    stats = GraphStats(
        node_count=len(nodes),
        edge_count=len(edges),
        cluster_count=0,
        isolated_count=0,
        truncated=False,
    )

    return GraphResponse(nodes=nodes, edges=edges, clusters=[], stats=stats)


def get_entity_provenance(db: Session, entity_id: uuid.UUID) -> EntityProvenanceResponse:
    """Return provenance source chunks for an entity per CONTRACT §9.2."""
    get_entity(db, entity_id)

    prov_chunks = db.scalars(
        select(EntityChunk)
        .options(selectinload(EntityChunk.chunk), selectinload(EntityChunk.note))
        .where(EntityChunk.entity_id == entity_id)
        .order_by(EntityChunk.created_at.desc())
    ).all()

    sources: list[EntitySourceResponse] = []
    for pc in prov_chunks:
        note_title = pc.note.title if pc.note else "Untitled Note"
        content = pc.chunk.content if pc.chunk else ""
        excerpt = content[:300] + ("..." if len(content) > 300 else "")
        sources.append(
            EntitySourceResponse(
                chunk_id=pc.chunk_id,
                note_id=pc.note_id,
                note_title=note_title,
                excerpt=excerpt,
                extraction_model=pc.extraction_model,
                confidence=pc.confidence,
            )
        )

    return EntityProvenanceResponse(entity_id=entity_id, sources=sources)


def search_graph(
    db: Session,
    workspace_id: uuid.UUID,
    q: str,
    limit: int = 20,
) -> GraphSearchResponse:
    """Search knowledge graph entities and connected notes per CONTRACT §9.1."""
    if not q or not q.strip():
        raise ValidationError("Search query 'q' cannot be empty.")

    query_str = q.strip()
    if len(query_str) > 200:
        raise ValidationError("Search query 'q' cannot exceed 200 characters.")

    # Match entities by name or description
    entities = db.scalars(
        select(GraphEntity)
        .where(
            GraphEntity.workspace_id == workspace_id,
            or_(
                GraphEntity.name.ilike(f"%{query_str}%"),
                GraphEntity.description.ilike(f"%{query_str}%"),
            ),
        )
        .order_by(GraphEntity.name.asc())
        .limit(limit)
    ).all()

    matched_entity_ids = [e.id for e in entities]

    entity_matches = [
        GraphSearchEntityMatch(
            id=e.id,
            name=e.name,
            entity_type=e.entity_type,
            match_field="name" if query_str.lower() in e.name.lower() else "description",
        )
        for e in entities
    ]

    # Find notes containing matched entities
    note_matches: list[GraphSearchNoteMatch] = []
    if matched_entity_ids:
        provs = db.scalars(
            select(EntityChunk)
            .options(selectinload(EntityChunk.note), selectinload(EntityChunk.entity))
            .where(
                EntityChunk.workspace_id == workspace_id,
                EntityChunk.entity_id.in_(matched_entity_ids),
            )
            .limit(limit)
        ).all()

        seen_notes: set[uuid.UUID] = set()
        for p in provs:
            if p.note and p.note_id not in seen_notes:
                seen_notes.add(p.note_id)
                ent_name = p.entity.name if p.entity else "Entity"
                note_matches.append(
                    GraphSearchNoteMatch(
                        id=p.note.id,
                        title=p.note.title,
                        match_reason=f"contains entity '{ent_name}'",
                    )
                )

    total = len(entity_matches) + len(note_matches)
    return GraphSearchResponse(
        entities=entity_matches,
        notes=note_matches,
        total=total,
    )


# ── Note-Level Neighborhood (v0.2.2 Compatibility) ────────────────────────────


def get_note_neighborhood(db: Session, note_id: uuid.UUID) -> NoteGraphResponse:
    """Return the 1-hop note-level neighborhood graph for a note per CONTRACT §16."""
    note = db.get(Note, note_id)
    if not note:
        raise NoteNotFoundError("Note not found.")

    links = db.scalars(
        select(NoteLink).where(
            or_(NoteLink.source_note_id == note_id, NoteLink.target_note_id == note_id)
        )
    ).all()

    connected_ids = {note_id}
    for lnk in links:
        connected_ids.add(lnk.source_note_id)
        connected_ids.add(lnk.target_note_id)

    notes = db.scalars(
        select(Note).options(selectinload(Note.tags)).where(Note.id.in_(connected_ids))
    ).all()

    degrees: dict[uuid.UUID, int] = defaultdict(int)
    edges = []
    for lnk in links:
        degrees[lnk.source_note_id] += 1
        degrees[lnk.target_note_id] += 1
        edges.append(
            GraphEdge(source_note_id=lnk.source_note_id, target_note_id=lnk.target_note_id)
        )

    nodes = [
        GraphNode(
            id=n.id,
            title=n.title,
            is_pinned=n.is_pinned,
            tag_names=[t.name for t in n.tags],
            degree=degrees[n.id],
        )
        for n in notes
    ]

    stats = GraphStats(
        node_count=len(nodes),
        edge_count=len(edges),
        isolated_count=0,
        truncated=False,
    )

    return NoteGraphResponse(nodes=nodes, edges=edges, stats=stats)
