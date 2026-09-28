"""Graph indexing and extraction service.

Canonical service per CONTRACT v0.3.2 §5.3, §7, §8.1-§8.4, §12.2 and CONTRACT v0.4.1.
Coordinates entity/relationship extraction, vector payload synchronization, and reindexing.
Explicitly separates Extraction (LLM-based entity/relationship discovery)
from Reindexing (rebuilding clusters, suggestions, and vector payloads from persisted knowledge).
"""

import logging
import uuid
from typing import Any

from sqlalchemy import delete, func, select
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
    """Run entity and relationship extraction for a single note.

    Persists extracted entities, relationships, and provenance in PostgreSQL,
    then updates link suggestions and vector chunk payloads.
    Never wipes out previously persisted entities/relationships on failure.
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

    # Step 4: Update Qdrant chunk payloads with entity_ids and cluster_id
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


def extract_workspace_graph(
    db: Session,
    workspace_id: uuid.UUID,
    job: Any | None = None,
    note_ids: list[str] | list[uuid.UUID] | None = None,
) -> dict[str, Any]:
    """Perform LLM-based entity and relationship extraction for workspace notes.

    Iterates note-by-note, updates progress, and preserves all previously
    persisted knowledge without destructive deletion.
    """
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError("Workspace not found.")

    if note_ids:
        target_ids = [uuid.UUID(str(nid)) for nid in note_ids]
        notes = db.scalars(
            select(Note).where(Note.workspace_id == workspace_id, Note.id.in_(target_ids))
        ).all()
    else:
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

    _update_job_progress("Extracting entities & relationships", 0, None, 0, 0, [])

    total_entities_count = 0
    total_relationships_count = 0
    failed_notes: list[dict[str, str]] = []

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
            res = index_note_graph(db, note.id)
            total_entities_count += res.get("entities_extracted", 0)
            total_relationships_count += res.get("relationships_extracted", 0)
            if res.get("failed_steps"):
                failed_notes.append(
                    {
                        "note_id": str(note.id),
                        "title": note.title,
                        "error": "; ".join(res["failed_steps"]),
                    }
                )
        except Exception as e:
            logger.warning("Extraction failed for note %s (%s): %s", note.id, note.title, e)
            failed_notes.append({"note_id": str(note.id), "title": note.title, "error": str(e)})

    # Run clustering and link suggestions if at least some notes were processed
    if total_notes > 0 and len(failed_notes) < total_notes:
        try:
            cluster_service.cluster_workspace(db, workspace_id)
        except Exception as e:
            logger.warning("Clustering failed for workspace %s: %s", workspace_id, e)
        try:
            link_suggestion_service.generate_link_suggestions(db, workspace_id)
        except Exception as e:
            logger.warning("Link suggestions failed for workspace %s: %s", workspace_id, e)

    # Persisted totals in workspace
    persisted_entities_count = (
        db.scalar(
            select(func.count(GraphEntity.id)).where(GraphEntity.workspace_id == workspace_id)
        )
        or 0
    )
    persisted_relationships_count = (
        db.scalar(
            select(func.count(GraphRelationship.id)).where(
                GraphRelationship.workspace_id == workspace_id
            )
        )
        or 0
    )

    _update_job_progress(
        "Finalizing",
        total_notes,
        None,
        persisted_entities_count,
        persisted_relationships_count,
        failed_notes,
    )

    summary = {
        "extracted_entities": total_entities_count or persisted_entities_count,
        "extracted_relationships": total_relationships_count or persisted_relationships_count,
        "notes_processed": total_notes - len(failed_notes),
        "total_notes": total_notes,
        "failed_notes": failed_notes,
    }
    logger.info("Extraction complete for workspace %s: %s", workspace_id, summary)
    return summary


def reindex_workspace_graph(
    db: Session,
    workspace_id: uuid.UUID,
    job: Any | None = None,
) -> dict[str, Any]:
    """Rebuild search and index representations from ALREADY-PERSISTED knowledge.

    Performs:
    1. Workspace note clustering based on existing entities
    2. Link suggestions generation based on shared entities
    3. Qdrant vector chunk payload synchronization (entity_ids and cluster_id)

    Explicitly:
    - Does NOT invoke the LLM to re-extract notes
    - Does NOT delete existing GraphEntity or GraphRelationship records
    - Preserves all valid graph knowledge safely
    """
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError("Workspace not found.")

    notes = db.scalars(
        select(Note).where(Note.workspace_id == workspace_id, Note.is_archived.is_(False))
    ).all()
    total_notes = len(notes)

    persisted_entities_count = (
        db.scalar(
            select(func.count(GraphEntity.id)).where(GraphEntity.workspace_id == workspace_id)
        )
        or 0
    )
    persisted_relationships_count = (
        db.scalar(
            select(func.count(GraphRelationship.id)).where(
                GraphRelationship.workspace_id == workspace_id
            )
        )
        or 0
    )

    def _update_job_progress(stage: str, processed: int):
        if job is not None:
            job.progress = {
                "stage": stage,
                "processed_notes": processed,
                "total_notes": total_notes,
                "current_note_title": None,
                "extracted_entities": persisted_entities_count,
                "extracted_relationships": persisted_relationships_count,
                "failed_notes": [],
                "summary": f"{stage}: {processed}/{total_notes} notes",
            }
            db.commit()

    # Stage 1: Clustering
    _update_job_progress("Clustering", 0)
    try:
        cluster_service.cluster_workspace(db, workspace_id)
    except Exception as e:
        logger.warning("Clustering failed during reindex for workspace %s: %s", workspace_id, e)

    # Stage 2: Link Suggestions
    _update_job_progress("Building suggestions", 0)
    try:
        link_suggestion_service.generate_link_suggestions(db, workspace_id)
    except Exception as e:
        logger.warning(
            "Link suggestion generation failed during reindex for workspace %s: %s", workspace_id, e
        )

    # Stage 3: Updating Qdrant vector chunk payloads from persisted entity_chunks & cluster members
    _update_job_progress("Updating indexes", 0)
    for idx, note in enumerate(notes, start=1):
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
            try:
                vector_service.update_chunk_payloads(workspace_id, payload_updates)
            except Exception as e:
                logger.warning("Vector payload update failed for note %s: %s", note.id, e)
        if idx % 10 == 0:
            _update_job_progress("Updating indexes", idx)

    # Stage 4: Finalizing
    _update_job_progress("Finalizing", total_notes)

    summary = {
        "extracted_entities": persisted_entities_count,
        "extracted_relationships": persisted_relationships_count,
        "notes_processed": total_notes,
        "total_notes": total_notes,
        "failed_notes": [],
    }
    logger.info("Reindex completed for workspace %s: %s", workspace_id, summary)
    return summary


def delete_note_graph(db: Session, note_id: uuid.UUID) -> None:
    """Remove provenance when a note is deleted per CONTRACT §14.1."""
    note = db.get(Note, note_id)
    if not note:
        return

    # Delete entity_chunk provenance rows
    db.execute(delete(EntityChunk).where(EntityChunk.note_id == note_id))
    db.commit()
