"""Handlers for the 12 Read Actions per CONTRACT v0.5.1 §7.1, §8.1, §8.2.

Actions:
1. knowledge.search_all
2. notes.get
3. notes.search
4. sources.get
5. sources.search
6. sources.get_processing_status
7. entities.get
8. entities.search
9. graph.get_neighbors
10. graph.find_path
11. collections.get
12. threads.get
"""

import uuid
from typing import Any
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.actions.types import (
    ActionHandlerResult,
    CollectionsGetInput,
    EntitiesGetInput,
    EntitiesSearchInput,
    GraphFindPathInput,
    GraphGetNeighborsInput,
    KnowledgeSearchAllInput,
    NotesGetInput,
    NotesSearchInput,
    SourcesGetInput,
    SourcesGetProcessingStatusInput,
    SourcesSearchInput,
    ThreadsGetInput,
)
from app.core.exceptions import (
    AppException,
    EntityNotFoundError,
    NoteNotFoundError,
    SourceNotFoundError,
)
from app.models.collection import (
    Collection,
    CollectionConversation,
    CollectionEntity,
    CollectionNote,
    CollectionSource,
)
from app.models.graph_entity import GraphEntity
from app.models.graph_relationship import GraphRelationship
from app.models.note import Note
from app.models.source import Source
from app.models.thread import (
    Thread,
    ThreadConversation,
    ThreadDiscovery,
    ThreadEntity,
    ThreadNote,
    ThreadQuestion,
    ThreadSource,
)
from app.schemas.action import EvidenceItem
from app.services import (
    graph_service,
    note_service,
    source_service,
    thread_service,
    vector_service,
)


def handle_knowledge_search_all(
    db: Session, workspace_id: uuid.UUID, data: KnowledgeSearchAllInput
) -> ActionHandlerResult:
    """Cross-knowledge search across Notes, Sources, Entities, Collections, and Threads (§8.1)."""
    query_str = data.query.strip()
    limit = data.limit
    requested_types = set(data.types)

    merged_items: list[dict[str, Any]] = []
    evidence_items: list[EvidenceItem] = []

    # 1. Notes (Vector search + Lexical search per §8.1)
    if "notes" in requested_types:
        # Lexical
        lex_notes = db.scalars(
            select(Note)
            .where(
                Note.workspace_id == workspace_id,
                Note.is_archived.is_(False),
                or_(
                    Note.title.ilike(f"%{query_str}%"),
                    Note.content.ilike(f"%{query_str}%"),
                ),
            )
            .limit(limit)
        ).all()
        for note in lex_notes:
            item_dict = {
                "item_type": "note",
                "item_id": str(note.id),
                "title": note.title,
                "excerpt": note.content[:200] if note.content else "",
                "search_method": "lexical",
                "similarity_score": 0.85,
            }
            merged_items.append(item_dict)
            evidence_items.append(
                EvidenceItem(
                    item_type="note",
                    item_id=note.id,
                    similarity_score=0.85,
                    excerpt=note.content[:200] if note.content else note.title,
                )
            )

        # Vector search if vector store available
        try:
            vec_results = vector_service.search_vectors(
                workspace_id=workspace_id,
                query=query_str,
                limit=limit,
            )
            for v_res in vec_results:
                if v_res.get("item_type") == "note":
                    note_id_str = str(v_res.get("note_id") or v_res.get("item_id"))
                    score = float(v_res.get("score", 0.0))
                    merged_items.append(
                        {
                            "item_type": "note",
                            "item_id": note_id_str,
                            "title": v_res.get("title", ""),
                            "excerpt": v_res.get("content", "")[:200],
                            "search_method": "vector",
                            "similarity_score": score,
                        }
                    )
                    evidence_items.append(
                        EvidenceItem(
                            item_type="note",
                            item_id=note_id_str,
                            chunk_id=v_res.get("chunk_id"),
                            similarity_score=score,
                            excerpt=v_res.get("content", "")[:200],
                        )
                    )
        except Exception:
            pass

    # 2. Sources (Vector search + Lexical search per §8.1)
    if "sources" in requested_types:
        lex_sources = db.scalars(
            select(Source)
            .where(
                Source.workspace_id == workspace_id,
                or_(
                    Source.original_path.ilike(f"%{query_str}%"),
                    Source.extracted_text.ilike(f"%{query_str}%"),
                ),
            )
            .limit(limit)
        ).all()
        for src in lex_sources:
            item_dict = {
                "item_type": "source",
                "item_id": str(src.id),
                "title": src.original_path or "Source Document",
                "excerpt": (src.extracted_text or "")[:200],
                "search_method": "lexical",
                "similarity_score": 0.80,
            }
            merged_items.append(item_dict)
            evidence_items.append(
                EvidenceItem(
                    item_type="source",
                    item_id=src.id,
                    source_id=src.id,
                    similarity_score=0.80,
                    excerpt=(src.extracted_text or src.original_path or "")[:200],
                )
            )

    # 3. Entities (Name-based lexical search per §8.1)
    if "entities" in requested_types:
        entities = db.scalars(
            select(GraphEntity)
            .where(
                GraphEntity.workspace_id == workspace_id,
                GraphEntity.name.ilike(f"%{query_str}%"),
            )
            .limit(limit)
        ).all()
        for ent in entities:
            merged_items.append(
                {
                    "item_type": "entity",
                    "item_id": str(ent.id),
                    "title": ent.name,
                    "excerpt": ent.description or f"Entity of type {ent.entity_type}",
                    "search_method": "lexical",
                    "similarity_score": None,
                }
            )

    # 4. Collections (Title-based lexical search per §8.1)
    if "collections" in requested_types:
        collections = db.scalars(
            select(Collection)
            .where(
                Collection.workspace_id == workspace_id,
                Collection.name.ilike(f"%{query_str}%"),
            )
            .limit(limit)
        ).all()
        for coll in collections:
            merged_items.append(
                {
                    "item_type": "collection",
                    "item_id": str(coll.id),
                    "title": coll.name,
                    "excerpt": coll.description or "",
                    "search_method": "lexical",
                    "similarity_score": None,
                }
            )

    # 5. Threads (Title-based lexical search per §8.1)
    if "threads" in requested_types:
        threads = db.scalars(
            select(Thread)
            .where(
                Thread.workspace_id == workspace_id,
                or_(
                    Thread.title.ilike(f"%{query_str}%"),
                    Thread.question.ilike(f"%{query_str}%"),
                ),
            )
            .limit(limit)
        ).all()
        for thr in threads:
            merged_items.append(
                {
                    "item_type": "thread",
                    "item_id": str(thr.id),
                    "title": thr.title,
                    "excerpt": thr.question or "",
                    "search_method": "lexical",
                    "similarity_score": None,
                }
            )

    # Sort merged items by similarity_score desc (placing None scores at end)
    def _sort_key(item: dict[str, Any]) -> float:
        s = item.get("similarity_score")
        return float(s) if s is not None else 0.0

    merged_items.sort(key=_sort_key, reverse=True)

    return ActionHandlerResult(
        result={"items": merged_items, "total": len(merged_items)},
        evidence=evidence_items,
        interpretation=f"Found {len(merged_items)} cross-knowledge results for query '{query_str}'.",
    )


def handle_notes_get(
    db: Session, workspace_id: uuid.UUID, data: NotesGetInput
) -> ActionHandlerResult:
    """Return one note and its supported metadata (§7.1)."""
    note = note_service.get_note(db, data.note_id)
    if not note or note.workspace_id != workspace_id:
        raise NoteNotFoundError("Note not found in workspace.")

    note_data = {
        "id": str(note.id),
        "workspace_id": str(note.workspace_id),
        "title": note.title,
        "content": note.content,
        "is_pinned": note.is_pinned,
        "is_archived": note.is_archived,
        "tags": [t.name for t in note.tags] if note.tags else [],
        "created_at": note.created_at.isoformat(),
        "updated_at": note.updated_at.isoformat(),
    }
    evidence = [
        EvidenceItem(
            item_type="note",
            item_id=note.id,
            excerpt=note.content[:200] if note.content else note.title,
        )
    ]
    return ActionHandlerResult(result={"note": note_data}, evidence=evidence)


def handle_notes_search(
    db: Session, workspace_id: uuid.UUID, data: NotesSearchInput
) -> ActionHandlerResult:
    """Search notes by text and supported search criteria (§7.1)."""
    query_str = data.query.strip()
    notes = db.scalars(
        select(Note)
        .where(
            Note.workspace_id == workspace_id,
            Note.is_archived.is_(False),
            or_(
                Note.title.ilike(f"%{query_str}%"),
                Note.content.ilike(f"%{query_str}%"),
            ),
        )
        .limit(data.limit)
    ).all()

    items = [
        {
            "id": str(n.id),
            "title": n.title,
            "excerpt": n.content[:200] if n.content else "",
            "tags": [t.name for t in n.tags] if n.tags else [],
            "updated_at": n.updated_at.isoformat(),
        }
        for n in notes
    ]
    evidence = [
        EvidenceItem(
            item_type="note",
            item_id=n.id,
            excerpt=n.content[:200] if n.content else n.title,
        )
        for n in notes
    ]
    return ActionHandlerResult(
        result={"items": items, "total": len(items)},
        evidence=evidence,
    )


def handle_sources_get(
    db: Session, workspace_id: uuid.UUID, data: SourcesGetInput
) -> ActionHandlerResult:
    """Return one source and its supported metadata (§7.1)."""
    source = db.get(Source, data.source_id)
    if not source or source.workspace_id != workspace_id:
        raise SourceNotFoundError("Source not found in workspace.")

    source_data = {
        "id": str(source.id),
        "workspace_id": str(source.workspace_id),
        "title": source.original_path or "Source Document",
        "source_type": source.source_type,
        "processing_status": source.processing_status,
        "file_size_bytes": source.file_size_bytes,
        "created_at": source.created_at.isoformat(),
        "updated_at": source.updated_at.isoformat(),
    }
    evidence = [
        EvidenceItem(
            item_type="source",
            item_id=source.id,
            source_id=source.id,
            excerpt=(source.extracted_text or source.original_path or "")[:200],
        )
    ]
    return ActionHandlerResult(result={"source": source_data}, evidence=evidence)


def handle_sources_search(
    db: Session, workspace_id: uuid.UUID, data: SourcesSearchInput
) -> ActionHandlerResult:
    """Search sources by text (§7.1)."""
    query_str = data.query.strip()
    sources = db.scalars(
        select(Source)
        .where(
            Source.workspace_id == workspace_id,
            or_(
                Source.original_path.ilike(f"%{query_str}%"),
                Source.extracted_text.ilike(f"%{query_str}%"),
            ),
        )
        .limit(data.limit)
    ).all()

    items = [
        {
            "id": str(s.id),
            "title": s.original_path or "Source Document",
            "source_type": s.source_type,
            "processing_status": s.processing_status,
            "excerpt": (s.extracted_text or "")[:200],
        }
        for s in sources
    ]
    evidence = [
        EvidenceItem(
            item_type="source",
            item_id=s.id,
            source_id=s.id,
            excerpt=(s.extracted_text or s.original_path or "")[:200],
        )
        for s in sources
    ]
    return ActionHandlerResult(
        result={"items": items, "total": len(items)},
        evidence=evidence,
    )


def handle_sources_get_processing_status(
    db: Session, workspace_id: uuid.UUID, data: SourcesGetProcessingStatusInput
) -> ActionHandlerResult:
    """Return processing state for one source (§7.1)."""
    source = db.get(Source, data.source_id)
    if not source or source.workspace_id != workspace_id:
        raise SourceNotFoundError("Source not found in workspace.")

    return ActionHandlerResult(
        result={
            "source_id": str(source.id),
            "processing_status": source.processing_status,
            "detected_count": getattr(source, "detected_count", None),
            "error_message": source.processing_error,
        }
    )


def handle_entities_get(
    db: Session, workspace_id: uuid.UUID, data: EntitiesGetInput
) -> ActionHandlerResult:
    """Return one entity and its supported metadata (§7.1)."""
    entity = db.get(GraphEntity, data.entity_id)
    if not entity or entity.workspace_id != workspace_id:
        raise EntityNotFoundError("Entity not found in workspace.")

    ent_data = {
        "id": str(entity.id),
        "workspace_id": str(entity.workspace_id),
        "name": entity.name,
        "entity_type": entity.entity_type,
        "description": entity.description,
        "created_at": entity.created_at.isoformat(),
        "updated_at": entity.updated_at.isoformat(),
    }
    evidence = [
        EvidenceItem(
            item_type="entity",
            item_id=entity.id,
            excerpt=entity.description or f"Entity {entity.name} ({entity.entity_type})",
        )
    ]
    return ActionHandlerResult(result={"entity": ent_data}, evidence=evidence)


def handle_entities_search(
    db: Session, workspace_id: uuid.UUID, data: EntitiesSearchInput
) -> ActionHandlerResult:
    """Search entities by name and supported lexical criteria (§7.1)."""
    query_str = data.query.strip()
    filters = [
        GraphEntity.workspace_id == workspace_id,
        GraphEntity.name.ilike(f"%{query_str}%"),
    ]
    if data.entity_type:
        filters.append(GraphEntity.entity_type == data.entity_type)

    entities = db.scalars(select(GraphEntity).where(*filters).limit(data.limit)).all()
    items = [
        {
            "id": str(e.id),
            "name": e.name,
            "entity_type": e.entity_type,
            "description": e.description,
        }
        for e in entities
    ]
    evidence = [
        EvidenceItem(
            item_type="entity",
            item_id=e.id,
            excerpt=e.description or f"Entity {e.name} ({e.entity_type})",
        )
        for e in entities
    ]
    return ActionHandlerResult(
        result={"items": items, "total": len(items)},
        evidence=evidence,
    )


def handle_graph_get_neighbors(
    db: Session, workspace_id: uuid.UUID, data: GraphGetNeighborsInput
) -> ActionHandlerResult:
    """Return the neighbors of a graph node (§7.1)."""
    entity = db.get(GraphEntity, data.entity_id)
    if not entity or entity.workspace_id != workspace_id:
        raise EntityNotFoundError("Entity not found in workspace.")

    relationships = db.scalars(
        select(GraphRelationship).where(
            GraphRelationship.workspace_id == workspace_id,
            or_(
                GraphRelationship.source_entity_id == entity.id,
                GraphRelationship.target_entity_id == entity.id,
            ),
        )
    ).all()

    node_ids = {entity.id}
    edges = []
    for r in relationships:
        node_ids.add(r.source_entity_id)
        node_ids.add(r.target_entity_id)
        edges.append(
            {
                "id": str(r.id),
                "source": str(r.source_entity_id),
                "target": str(r.target_entity_id),
                "relationship_type": r.relationship_type,
                "description": r.description,
            }
        )

    nodes_db = db.scalars(
        select(GraphEntity).where(
            GraphEntity.workspace_id == workspace_id,
            GraphEntity.id.in_(node_ids),
        )
    ).all()

    nodes = [
        {
            "id": str(n.id),
            "name": n.name,
            "entity_type": n.entity_type,
            "description": n.description,
        }
        for n in nodes_db
    ]

    return ActionHandlerResult(result={"nodes": nodes, "edges": edges})


def handle_graph_find_path(
    db: Session, workspace_id: uuid.UUID, data: GraphFindPathInput
) -> ActionHandlerResult:
    """Find a path between supported graph nodes (§7.1)."""
    src_ent = db.get(GraphEntity, data.source_entity_id)
    tgt_ent = db.get(GraphEntity, data.target_entity_id)
    if not src_ent or src_ent.workspace_id != workspace_id:
        raise EntityNotFoundError("Source entity not found in workspace.")
    if not tgt_ent or tgt_ent.workspace_id != workspace_id:
        raise EntityNotFoundError("Target entity not found in workspace.")

    # BFS path search up to max_depth
    queue = [[src_ent.id]]
    visited = {src_ent.id}
    found_path = None

    while queue:
        current_path = queue.pop(0)
        current_node = current_path[-1]

        if current_node == tgt_ent.id:
            found_path = current_path
            break

        if len(current_path) > data.max_depth:
            continue

        neighbors_rel = db.scalars(
            select(GraphRelationship).where(
                GraphRelationship.workspace_id == workspace_id,
                or_(
                    GraphRelationship.source_entity_id == current_node,
                    GraphRelationship.target_entity_id == current_node,
                ),
            )
        ).all()

        for rel in neighbors_rel:
            neighbor = (
                rel.target_entity_id
                if rel.source_entity_id == current_node
                else rel.source_entity_id
            )
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(current_path + [neighbor])

    path_items = []
    if found_path:
        entities_dict = {
            e.id: e
            for e in db.scalars(
                select(GraphEntity).where(GraphEntity.id.in_(found_path))
            ).all()
        }
        path_items = [
            {
                "id": str(nid),
                "name": entities_dict[nid].name if nid in entities_dict else "",
                "entity_type": (
                    entities_dict[nid].entity_type if nid in entities_dict else ""
                ),
            }
            for nid in found_path
        ]

    return ActionHandlerResult(
        result={"found": found_path is not None, "path": path_items}
    )


def handle_collections_get(
    db: Session, workspace_id: uuid.UUID, data: CollectionsGetInput
) -> ActionHandlerResult:
    """Return one collection and its items (§7.1)."""
    coll = db.get(Collection, data.collection_id)
    if not coll or coll.workspace_id != workspace_id:
        raise AppException(404, "COLLECTION_NOT_FOUND", "Collection not found.")

    notes = db.scalars(
        select(CollectionNote).where(CollectionNote.collection_id == coll.id)
    ).all()
    sources = db.scalars(
        select(CollectionSource).where(CollectionSource.collection_id == coll.id)
    ).all()
    entities = db.scalars(
        select(CollectionEntity).where(CollectionEntity.collection_id == coll.id)
    ).all()
    convs = db.scalars(
        select(CollectionConversation).where(
            CollectionConversation.collection_id == coll.id
        )
    ).all()

    items = []
    for n in notes:
        items.append({"item_type": "note", "item_id": str(n.note_id)})
    for s in sources:
        items.append({"item_type": "source", "item_id": str(s.source_id)})
    for e in entities:
        items.append({"item_type": "entity", "item_id": str(e.entity_id)})
    for c in convs:
        items.append(
            {"item_type": "conversation", "item_id": str(c.conversation_id)}
        )

    coll_data = {
        "id": str(coll.id),
        "name": coll.name,
        "description": coll.description,
        "color": coll.color,
        "icon": coll.icon,
        "created_at": coll.created_at.isoformat(),
        "updated_at": coll.updated_at.isoformat(),
    }
    return ActionHandlerResult(result={"collection": coll_data, "items": items})


def handle_threads_get(
    db: Session, workspace_id: uuid.UUID, data: ThreadsGetInput
) -> ActionHandlerResult:
    """Return one investigation Thread and its attached information (§7.1)."""
    thread = db.get(Thread, data.thread_id)
    if not thread or thread.workspace_id != workspace_id:
        raise AppException(404, "THREAD_NOT_FOUND", "Thread not found in workspace.")

    questions = db.scalars(
        select(ThreadQuestion).where(ThreadQuestion.thread_id == thread.id)
    ).all()
    discoveries = db.scalars(
        select(ThreadDiscovery).where(ThreadDiscovery.thread_id == thread.id)
    ).all()

    notes = db.scalars(
        select(ThreadNote).where(ThreadNote.thread_id == thread.id)
    ).all()
    sources = db.scalars(
        select(ThreadSource).where(ThreadSource.thread_id == thread.id)
    ).all()
    entities = db.scalars(
        select(ThreadEntity).where(ThreadEntity.thread_id == thread.id)
    ).all()
    convs = db.scalars(
        select(ThreadConversation).where(ThreadConversation.thread_id == thread.id)
    ).all()

    items = []
    for n in notes:
        items.append({"item_type": "note", "item_id": str(n.note_id)})
    for s in sources:
        items.append({"item_type": "source", "item_id": str(s.source_id)})
    for e in entities:
        items.append({"item_type": "entity", "item_id": str(e.entity_id)})
    for c in convs:
        items.append(
            {"item_type": "conversation", "item_id": str(c.conversation_id)}
        )

    thread_data = {
        "id": str(thread.id),
        "title": thread.title,
        "question": thread.question,
        "status": thread.status,
        "created_at": thread.created_at.isoformat(),
        "updated_at": thread.updated_at.isoformat(),
    }
    q_list = [{"id": str(q.id), "question": q.question} for q in questions]
    d_list = [{"id": str(d.id), "discovery": d.discovery} for d in discoveries]

    return ActionHandlerResult(
        result={
            "thread": thread_data,
            "questions": q_list,
            "discoveries": d_list,
            "items": items,
        }
    )
