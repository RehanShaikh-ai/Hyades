"""Graph indexing service.

Canonical service per CONTRACT v0.3.2 §5.3, §7, §8.1-§8.4, §12.2.
Coordinates entity/relationship extraction pipeline, vector payload synchronization, and reindexing.
"""

import logging
import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.exceptions import NoteNotFoundError, WorkspaceNotFoundError
from app.models.content_chunk import ContentChunk
from app.models.entity_chunk import EntityChunk
from app.models.graph_entity import GraphEntity
from app.models.graph_relationship import GraphRelationship
from app.models.note import Note
from app.models.note_cluster_member import NoteClusterMember
from app.models.workspace import Workspace
from app.services import (
    cluster_service,
    entity_extraction_service,
    link_suggestion_service,
    relationship_extraction_service,
    vector_service,
)

logger = logging.getLogger("app.services.graph_index_service")


def index_note_graph(db: Session, note_id: uuid.UUID) -> dict[str, Any]:
    """Run full graph extraction and indexing pipeline for a note per CONTRACT §8.1.

    Processes note extraction with bounded failure tolerance.
    """
    note = db.get(Note, note_id)
    if not note:
        raise NoteNotFoundError("Note not found.")

    entities: list[GraphEntity] = []
    relationships: list[GraphRelationship] = []
    failed_steps: list[str] = []

    # Step 1: Extract entities
    try:
        entities = entity_extraction_service.extract_entities_for_note(db, note_id)
    except Exception as e:
        logger.warning("Entity extraction failed for note %s (%s): %s", note_id, note.title, e)
        failed_steps.append(f"entities: {e}")

    # Step 2: Extract relationships
    try:
        relationships = relationship_extraction_service.extract_relationships_for_note(db, note_id)
    except Exception as e:
        logger.warning(
            "Relationship extraction failed for note %s (%s): %s", note_id, note.title, e
        )
        failed_steps.append(f"relationships: {e}")

    # Step 3: Update link suggestions for workspace
    try:
        link_suggestion_service.generate_link_suggestions(db, note.workspace_id)
    except Exception as e:
        logger.warning(
            "Link suggestion generation failed for workspace %s: %s", note.workspace_id, e
        )

    # Step 4: Update Qdrant chunk payloads with entity_ids and cluster_id (§7)
    chunks = db.scalars(select(ContentChunk).where(ContentChunk.note_id == note_id)).all()
    if chunks:
        cluster_member = db.scalars(
            select(NoteClusterMember).where(NoteClusterMember.note_id == note_id)
        ).first()
        cluster_id_str = str(cluster_member.cluster_id) if cluster_member else None

        entity_chunks = db.scalars(select(EntityChunk).where(EntityChunk.note_id == note_id)).all()
        chunk_entities: dict[uuid.UUID, list[str]] = {c.id: [] for c in chunks}
        for ec in entity_chunks:
            if ec.chunk_id in chunk_entities:
                chunk_entities[ec.chunk_id].append(str(ec.entity_id))

        payload_updates: dict[uuid.UUID, dict[str, Any]] = {}
        for chunk in chunks:
            payload_updates[chunk.id] = {
                "entity_ids": chunk_entities.get(chunk.id, []),
                "cluster_id": cluster_id_str,
            }

        try:
            vector_service.update_chunk_payloads(note.workspace_id, payload_updates)
        except Exception as e:
            logger.warning("Vector payload update failed for note %s: %s", note_id, e)

    logger.info(
        "Indexed note graph for %s: %d entities, %d relationships (failed steps: %s)",
        note_id,
        len(entities),
        len(relationships),
        failed_steps,
    )
    return {
        "entities_extracted": len(entities),
        "relationships_extracted": len(relationships),
        "failed_steps": failed_steps,
    }


def reindex_workspace_graph(
    db: Session,
    workspace_id: uuid.UUID,
    job: Any | None = None,
) -> dict[str, Any]:
    """Reindex knowledge graph for an entire workspace per CONTRACT §8.4, §12.2.

    Deletes only AI-extracted entities and relationships, preserves manual ones,
    re-extracts all notes, re-generates link suggestions, and runs clustering.
    Reports progress through stages to the attached job if present.
    """
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError("Workspace not found.")

    notes = db.scalars(
        select(Note).where(Note.workspace_id == workspace_id, Note.is_archived.is_(False))
    ).all()
    total_notes = len(notes)

    def _update_job_progress(
        stage: str,
        processed: int,
        current_title: str | None = None,
        entities: int = 0,
        rels: int = 0,
        failures: list[dict] | None = None,
    ):
        if job is not None:
            job.progress = {
                "stage": stage,
                "processed_notes": processed,
                "total_notes": total_notes,
                "current_note_title": current_title,
                "extracted_entities": entities,
                "extracted_relationships": rels,
                "failed_notes": failures or [],
                "summary": f"{processed} / {total_notes} notes processed",
            }
            db.commit()

    # Stage: Preparing
    _update_job_progress("Preparing", 0, None, 0, 0, [])

    # 1. Delete all provenance rows for workspace
    db.execute(delete(EntityChunk).where(EntityChunk.workspace_id == workspace_id))

    # 2. Delete all AI-extracted relationships (is_manual == False)
    db.execute(
        delete(GraphRelationship).where(
            GraphRelationship.workspace_id == workspace_id,
            GraphRelationship.is_manual.is_(False),
        )
    )

    # 3. Delete all AI-extracted entities (is_manual == False)
    db.execute(
        delete(GraphEntity).where(
            GraphEntity.workspace_id == workspace_id,
            GraphEntity.is_manual.is_(False),
        )
    )
    db.commit()

    total_entities_count = 0
    total_relationships_count = 0
    failed_notes: list[dict[str, str]] = []

    # Stage: Extracting
    for idx, note in enumerate(notes, start=1):
        _update_job_progress(
            "Extracting entities & relationships",
            idx - 1,
            note.title,
            total_entities_count,
            total_relationships_count,
            failed_notes,
        )
        try:
            ents = entity_extraction_service.extract_entities_for_note(db, note.id)
            rels = relationship_extraction_service.extract_relationships_for_note(db, note.id)
            total_entities_count += len(ents)
            total_relationships_count += len(rels)
        except Exception as e:
            logger.warning("Extraction failed for note %s (%s): %s", note.id, note.title, e)
            failed_notes.append({"note_id": str(note.id), "title": note.title, "error": str(e)})

    # Stage: Building graph
    _update_job_progress(
        "Building graph & suggestions",
        total_notes,
        None,
        total_entities_count,
        total_relationships_count,
        failed_notes,
    )
    link_suggestion_service.generate_link_suggestions(db, workspace_id)

    # Stage: Clustering
    _update_job_progress(
        "Clustering",
        total_notes,
        None,
        total_entities_count,
        total_relationships_count,
        failed_notes,
    )
    cluster_service.cluster_workspace(db, workspace_id)

    # Stage: Updating indexes
    _update_job_progress(
        "Updating indexes",
        total_notes,
        None,
        total_entities_count,
        total_relationships_count,
        failed_notes,
    )
    for note in notes:
        chunks = db.scalars(select(ContentChunk).where(ContentChunk.note_id == note.id)).all()
        if chunks:
            cluster_member = db.scalars(
                select(NoteClusterMember).where(NoteClusterMember.note_id == note.id)
            ).first()
            cluster_id_str = str(cluster_member.cluster_id) if cluster_member else None

            entity_chunks = db.scalars(
                select(EntityChunk).where(EntityChunk.note_id == note.id)
            ).all()
            chunk_entities = {c.id: [] for c in chunks}
            for ec in entity_chunks:
                if ec.chunk_id in chunk_entities:
                    chunk_entities[ec.chunk_id].append(str(ec.entity_id))

            payload_updates = {}
            for chunk in chunks:
                payload_updates[chunk.id] = {
                    "entity_ids": chunk_entities.get(chunk.id, []),
                    "cluster_id": cluster_id_str,
                }
            vector_service.update_chunk_payloads(workspace_id, payload_updates)

    # Stage: Finalizing
    _update_job_progress(
        "Finalizing",
        total_notes,
        None,
        total_entities_count,
        total_relationships_count,
        failed_notes,
    )

    summary = {
        "extracted_entities": total_entities_count,
        "extracted_relationships": total_relationships_count,
        "notes_processed": len(notes) - len(failed_notes),
        "total_notes": len(notes),
        "failed_notes": failed_notes,
    }
    logger.info("Reindexed graph for workspace %s: %s", workspace_id, summary)
    return summary


def delete_note_graph(db: Session, note_id: uuid.UUID) -> None:
    """Remove provenance and update vector payload when a note is deleted per CONTRACT §14.1."""
    note = db.get(Note, note_id)
    if not note:
        return

    # Delete entity_chunk provenance rows
    db.execute(delete(EntityChunk).where(EntityChunk.note_id == note_id))
    db.commit()

    # Note vectors are deleted via vector_service.delete_note_vectors in note_service
