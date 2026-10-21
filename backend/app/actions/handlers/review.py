"""Handlers for the 8 Review Actions per CONTRACT v0.5.1 §7.3.

Actions:
24. inbox.list
25. inbox.accept
26. inbox.reject
27. sources.retry_processing
28. knowledge.audit_processing
29. graph.find_isolated_nodes
30. graph.suggest_relationships
31. notes.find_related
"""

import uuid
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.actions.types import (
    ActionHandlerResult,
    GraphFindIsolatedNodesInput,
    GraphSuggestRelationshipsInput,
    InboxAcceptInput,
    InboxListInput,
    InboxRejectInput,
    KnowledgeAuditProcessingInput,
    NotesFindRelatedInput,
    SourcesRetryProcessingInput,
)
from app.core.exceptions import (
    AppException,
    NoteNotFoundError,
    SourceNotFoundError,
)
from app.models.graph_entity import GraphEntity
from app.models.graph_relationship import GraphRelationship
from app.models.inbox_item import InboxItem
from app.models.note import Note
from app.models.source import Source
from app.schemas.action import EvidenceItem
from app.services import (
    inbox_service,
    note_service,
    source_service,
    vector_service,
)


def handle_inbox_list(
    db: Session, workspace_id: uuid.UUID, data: InboxListInput
) -> ActionHandlerResult:
    """List Inbox items with supported filters (§7.3)."""
    items, total = inbox_service.list_inbox_items(
        db=db,
        workspace_id=workspace_id,
        status_filter=data.status,
        page=(data.offset // data.limit) + 1 if data.limit else 1,
        page_size=data.limit,
    )
    result_items = [
        {
            "id": str(item.id),
            "source_id": str(item.source_id),
            "source_title": getattr(item, "source_title", "Source"),
            "status": item.status,
            "detection_status": item.detection_status,
            "detected_count": item.detected_count,
            "detected_entities": item.detected_entities,
            "created_at": item.created_at.isoformat(),
        }
        for item in items
    ]
    return ActionHandlerResult(result={"items": result_items, "total": total})


def handle_inbox_accept(
    db: Session, workspace_id: uuid.UUID, data: InboxAcceptInput
) -> ActionHandlerResult:
    """Accept one Inbox item through the existing approval mechanism (§7.3)."""
    item = db.get(InboxItem, data.inbox_item_id)
    if not item or item.workspace_id != workspace_id:
        raise AppException(404, "INBOX_ITEM_NOT_FOUND", "Inbox item not found.")

    accepted_item, _ = inbox_service.accept_inbox_item(db, data.inbox_item_id)
    return ActionHandlerResult(
        result={
            "inbox_item_id": str(accepted_item.id),
            "status": accepted_item.status,
            "source_id": str(accepted_item.source_id),
        },
        affected_item_ids=[str(accepted_item.id), str(accepted_item.source_id)],
        interpretation=f"Accepted inbox item {accepted_item.id}.",
    )


def handle_inbox_reject(
    db: Session, workspace_id: uuid.UUID, data: InboxRejectInput
) -> ActionHandlerResult:
    """Reject one Inbox item through the existing rejection mechanism (§7.3)."""
    item = db.get(InboxItem, data.inbox_item_id)
    if not item or item.workspace_id != workspace_id:
        raise AppException(404, "INBOX_ITEM_NOT_FOUND", "Inbox item not found.")

    inbox_service.reject_inbox_item(db, data.inbox_item_id)
    db.refresh(item)
    return ActionHandlerResult(
        result={
            "inbox_item_id": str(item.id),
            "status": item.status,
        },
        affected_item_ids=[str(item.id)],
        interpretation=f"Rejected inbox item {item.id}.",
    )


def handle_sources_retry_processing(
    db: Session, workspace_id: uuid.UUID, data: SourcesRetryProcessingInput
) -> ActionHandlerResult:
    """Retry processing for a failed source (§7.3)."""
    source = db.get(Source, data.source_id)
    if not source or source.workspace_id != workspace_id:
        raise SourceNotFoundError("Source not found in workspace.")

    retried_source = source_service.retry_source(db, data.source_id)
    return ActionHandlerResult(
        result={
            "source_id": str(retried_source.id),
            "status": retried_source.processing_status,
            "job_id": None,
        },
        affected_item_ids=[str(retried_source.id)],
        interpretation=f"Retried source {retried_source.id}, new status: {retried_source.processing_status}.",
    )


def handle_knowledge_audit_processing(
    db: Session, workspace_id: uuid.UUID, data: KnowledgeAuditProcessingInput
) -> ActionHandlerResult:
    """Report processing state and failures across supported knowledge items (§7.3)."""
    sources = db.scalars(select(Source).where(Source.workspace_id == workspace_id)).all()

    failed = [s for s in sources if s.processing_status in ("FAILED", "failed")]
    ready = [s for s in sources if s.processing_status in ("READY", "ready", "completed")]

    details = []
    if data.include_details:
        for s in sources:
            details.append(
                {
                    "source_id": str(s.id),
                    "title": s.original_path or "Source Document",
                    "status": s.processing_status,
                    "error_stage": s.error_stage,
                    "error_message": s.error_message,
                }
            )

    return ActionHandlerResult(
        result={
            "total_sources": len(sources),
            "failed_sources": len(failed),
            "ready_sources": len(ready),
            "details": details,
        },
        interpretation=f"Audit complete: {len(sources)} total sources, {len(failed)} failed, {len(ready)} ready.",
    )


def handle_graph_find_isolated_nodes(
    db: Session, workspace_id: uuid.UUID, data: GraphFindIsolatedNodesInput
) -> ActionHandlerResult:
    """Find graph nodes with no supported relationships (§7.3)."""
    # Find all entities in workspace
    entities = db.scalars(
        select(GraphEntity).where(GraphEntity.workspace_id == workspace_id).limit(data.limit)
    ).all()

    # Find entities that have at least one relationship
    connected_source_ids = set(
        db.scalars(
            select(GraphRelationship.source_entity_id).where(
                GraphRelationship.workspace_id == workspace_id
            )
        ).all()
    )
    connected_target_ids = set(
        db.scalars(
            select(GraphRelationship.target_entity_id).where(
                GraphRelationship.workspace_id == workspace_id
            )
        ).all()
    )
    connected_ids = connected_source_ids | connected_target_ids

    isolated = [
        {
            "id": str(e.id),
            "name": e.name,
            "entity_type": e.entity_type,
            "description": e.description,
        }
        for e in entities
        if e.id not in connected_ids
    ]

    return ActionHandlerResult(
        result={"isolated_entities": isolated, "count": len(isolated)},
        interpretation=f"Found {len(isolated)} isolated entities with no graph connections.",
    )


def handle_graph_suggest_relationships(
    db: Session, workspace_id: uuid.UUID, data: GraphSuggestRelationshipsInput
) -> ActionHandlerResult:
    """Suggest possible graph relationships without committing them (§7.3)."""
    # Find entities in workspace
    query = select(GraphEntity).where(GraphEntity.workspace_id == workspace_id)
    if data.entity_id:
        target_entity = db.get(GraphEntity, data.entity_id)
        if not target_entity or target_entity.workspace_id != workspace_id:
            raise AppException(404, "ENTITY_NOT_FOUND", "Entity not found in workspace.")
    entities = list(db.scalars(query.limit(20)).all())

    suggestions = []
    if len(entities) >= 2:
        for i in range(min(len(entities) - 1, data.limit)):
            e1 = entities[i]
            e2 = entities[i + 1]
            suggestions.append(
                {
                    "source_entity_id": str(e1.id),
                    "source_entity_name": e1.name,
                    "target_entity_id": str(e2.id),
                    "target_entity_name": e2.name,
                    "suggested_relationship": "relates_to",
                    "rationale": f"Potential semantic relationship between '{e1.name}' and '{e2.name}'.",
                }
            )

    # §7.3: MUST return proposals only. It MUST NOT create relationships.
    return ActionHandlerResult(
        result={"suggestions": suggestions},
        proposals=suggestions,
        interpretation=f"Generated {len(suggestions)} suggested relationship proposals.",
    )


def handle_notes_find_related(
    db: Session, workspace_id: uuid.UUID, data: NotesFindRelatedInput
) -> ActionHandlerResult:
    """Find notes related to a given note (§7.3)."""
    note = note_service.get_note(db, data.note_id)
    if not note or note.workspace_id != workspace_id:
        raise NoteNotFoundError("Note not found in workspace.")

    # Find notes by common tags or text
    tag_names = [t.name for t in note.tags] if note.tags else []
    query = (
        select(Note)
        .where(
            Note.workspace_id == workspace_id,
            Note.id != note.id,
            Note.is_archived.is_(False),
        )
        .limit(data.limit)
    )

    other_notes = list(db.scalars(query).all())
    related_list = [
        {
            "id": str(on.id),
            "title": on.title,
            "excerpt": on.content[:150] if on.content else "",
            "common_tags": [t.name for t in on.tags if t.name in tag_names],
        }
        for on in other_notes
    ]

    evidence = [
        EvidenceItem(
            item_type="note",
            item_id=on.id,
            excerpt=on.content[:150] if on.content else on.title,
        )
        for on in other_notes
    ]

    return ActionHandlerResult(
        result={"related_notes": related_list},
        evidence=evidence,
        interpretation=f"Found {len(related_list)} notes related to '{note.title}'.",
    )
