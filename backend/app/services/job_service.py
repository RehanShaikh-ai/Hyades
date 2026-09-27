"""Job management service for background indexing and graph extraction.

Canonical service per CONTRACT v0.3.1 §5.3, §12.1-§12.4 and CONTRACT v0.3.2 §5.3, §5.4, §12.1-§12.4.
Provides enqueue_index_job, enqueue_extract_job, enqueue_reindex_graph_job,
enqueue_cluster_job, get_job, retry_job, process_index_job.
"""

import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import JobNotFoundError, ValidationError, WorkspaceNotFoundError
from app.models.content_chunk import ContentChunk
from app.models.index_job import IndexJob
from app.models.note import Note
from app.models.note_version import NoteVersion
from app.models.workspace import Workspace
from app.services import (
    chunking_service,
    cluster_service,
    embedding_service,
    graph_index_service,
    vector_service,
    version_service,
)

logger = logging.getLogger("app.services.job_service")


def enqueue_index_job(
    db: Session,
    workspace_id: uuid.UUID,
    note_ids: list[uuid.UUID] | None = None,
) -> IndexJob:
    """Enqueue an indexing job in PostgreSQL and Redis/ARQ per CONTRACT §12.1."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError("Workspace not found.")

    job_type = "index_note" if note_ids else "index_workspace"
    n_ids_str = [str(nid) for nid in note_ids] if note_ids else None

    job = IndexJob(
        workspace_id=workspace_id,
        job_type=job_type,
        status="queued",
        note_ids=n_ids_str,
        retry_count=0,
        max_retries=settings.JOB_MAX_RETRIES,
        enqueued_at=datetime.now(UTC),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # In testing or development mode, process immediately to ensure Qdrant & chunks update
    if settings.APP_ENV in ("testing", "development"):
        try:
            process_index_job(db, job.id)
            db.refresh(job)
        except Exception as e:
            logger.warning("Inline processing failed for index job %s: %s", job.id, e)

    return job


def enqueue_extract_job(
    db: Session,
    workspace_id: uuid.UUID,
    note_ids: list[uuid.UUID] | None = None,
) -> IndexJob:
    """Enqueue an entity/relationship extraction job per CONTRACT v0.3.2 §9.4, §12.1."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError("Workspace not found.")

    n_ids_str = [str(nid) for nid in note_ids] if note_ids else None

    job = IndexJob(
        workspace_id=workspace_id,
        job_type="extract_entities",
        status="queued",
        note_ids=n_ids_str,
        retry_count=0,
        max_retries=settings.JOB_MAX_RETRIES,
        enqueued_at=datetime.now(UTC),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    if settings.APP_ENV in ("testing", "development"):
        try:
            process_index_job(db, job.id)
            db.refresh(job)
        except Exception as e:
            logger.warning("Inline processing failed for extraction job %s: %s", job.id, e)

    return job


def enqueue_reindex_graph_job(
    db: Session,
    workspace_id: uuid.UUID,
) -> IndexJob:
    """Enqueue a full workspace graph reindexing job per CONTRACT v0.3.2 §9.4, §12.2."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError("Workspace not found.")

    job = IndexJob(
        workspace_id=workspace_id,
        job_type="reindex_graph",
        status="queued",
        note_ids=None,
        retry_count=0,
        max_retries=settings.JOB_MAX_RETRIES,
        enqueued_at=datetime.now(UTC),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    if settings.APP_ENV in ("testing", "development"):
        try:
            process_index_job(db, job.id)
            db.refresh(job)
        except Exception as e:
            logger.warning("Inline processing failed for reindex job %s: %s", job.id, e)

    return job


def enqueue_cluster_job(
    db: Session,
    workspace_id: uuid.UUID,
) -> IndexJob:
    """Enqueue a workspace clustering job per CONTRACT v0.3.2 §9.6."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError("Workspace not found.")

    job = IndexJob(
        workspace_id=workspace_id,
        job_type="cluster_notes",
        status="queued",
        note_ids=None,
        retry_count=0,
        max_retries=settings.JOB_MAX_RETRIES,
        enqueued_at=datetime.now(UTC),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    if settings.APP_ENV in ("testing", "development"):
        try:
            process_index_job(db, job.id)
            db.refresh(job)
        except Exception as e:
            logger.warning("Inline processing failed for cluster job %s: %s", job.id, e)

    return job


def get_job(db: Session, job_id: uuid.UUID) -> IndexJob:
    """Retrieve IndexJob status per CONTRACT §12.2."""
    job = db.get(IndexJob, job_id)
    if not job:
        raise JobNotFoundError(f"Job {job_id} not found.")
    return job


def retry_job(db: Session, job_id: uuid.UUID) -> IndexJob:
    """Retry a failed index job per CONTRACT §12.3."""
    job = get_job(db, job_id)
    if job.status != "failed":
        raise ValidationError(
            f"Job is in '{job.status}' status. Only 'failed' jobs can be retried."
        )

    if job.retry_count >= job.max_retries:
        raise ValidationError("Job has reached maximum retry attempts.")

    job.status = "queued"
    job.retry_count += 1
    job.started_at = None
    job.completed_at = None
    job.error_message = None
    db.commit()
    db.refresh(job)

    if settings.APP_ENV == "testing":
        process_index_job(db, job.id)
        db.refresh(job)

    return job


def process_index_job(db: Session, job_id: uuid.UUID) -> None:
    """Execute the job based on job_type per CONTRACT v0.3.1 §12 & CONTRACT v0.3.2 §8, §12."""
    job = db.get(IndexJob, job_id)
    if not job:
        return

    job.status = "running"
    job.started_at = datetime.now(UTC)
    db.commit()

    try:
        if job.job_type == "cluster_notes":
            cluster_service.cluster_workspace(db, job.workspace_id)
            job.status = "completed"
            job.completed_at = datetime.now(UTC)
            job.error_message = None
            db.commit()
            return

        if job.job_type == "reindex_graph":
            summary = graph_index_service.reindex_workspace_graph(db, job.workspace_id, job=job)
            job.status = "completed"
            job.completed_at = datetime.now(UTC)
            job.error_message = (
                f"Extracted {summary['extracted_entities']} entities, "
                f"{summary['extracted_relationships']} relationships from "
                f"{summary['notes_processed']} notes"
            )
            job.progress = {
                "stage": "completed",
                "processed_notes": summary["notes_processed"],
                "total_notes": summary["total_notes"],
                "current_note_title": None,
                "extracted_entities": summary["extracted_entities"],
                "extracted_relationships": summary["extracted_relationships"],
                "failed_notes": summary["failed_notes"],
                "summary": (
                    f"Completed: {summary['extracted_entities']} entities, "
                    f"{summary['extracted_relationships']} relationships across "
                    f"{summary['notes_processed']}/{summary['total_notes']} notes "
                    f"({len(summary['failed_notes'])} failures)"
                ),
            }
            db.commit()
            return

        if job.job_type in ("extract_entities", "extract_relationships"):
            if job.note_ids:
                target_ids = [uuid.UUID(nid) for nid in job.note_ids]
            else:
                target_ids = list(
                    db.scalars(
                        select(Note.id).where(
                            Note.workspace_id == job.workspace_id, Note.is_archived.is_(False)
                        )
                    ).all()
                )

            total_notes = len(target_ids)
            total_entities = 0
            total_relationships = 0
            failed_notes: list[dict[str, str]] = []

            for idx, nid in enumerate(target_ids, start=1):
                note = db.get(Note, nid)
                note_title = note.title if note else str(nid)
                job.progress = {
                    "stage": "extracting",
                    "processed_notes": idx - 1,
                    "total_notes": total_notes,
                    "current_note_title": note_title,
                    "extracted_entities": total_entities,
                    "extracted_relationships": total_relationships,
                    "failed_notes": failed_notes,
                    "summary": f"{idx - 1} / {total_notes} notes processed",
                }
                db.commit()

                try:
                    res = graph_index_service.index_note_graph(db, nid)
                    total_entities += res.get("entities_extracted", 0)
                    total_relationships += res.get("relationships_extracted", 0)
                except Exception as e:
                    logger.warning("Extraction failed for note %s (%s): %s", nid, note_title, e)
                    failed_notes.append({"note_id": str(nid), "title": note_title, "error": str(e)})

            job.status = "completed"
            job.completed_at = datetime.now(UTC)
            job.error_message = None
            job.progress = {
                "stage": "completed",
                "processed_notes": total_notes - len(failed_notes),
                "total_notes": total_notes,
                "current_note_title": None,
                "extracted_entities": total_entities,
                "extracted_relationships": total_relationships,
                "failed_notes": failed_notes,
                "summary": (
                    f"Completed: {total_entities} entities, {total_relationships} relationships "
                    f"across {total_notes - len(failed_notes)}/{total_notes} notes "
                    f"({len(failed_notes)} failures)"
                ),
            }
            db.commit()
            return

        # Default text index job: index_workspace / index_note
        if job.note_ids:
            target_ids = [uuid.UUID(nid) for nid in job.note_ids]
            notes = list(
                db.scalars(
                    select(Note).where(
                        Note.workspace_id == job.workspace_id, Note.id.in_(target_ids)
                    )
                ).all()
            )
        else:
            notes = list(
                db.scalars(
                    select(Note).where(
                        Note.workspace_id == job.workspace_id, Note.is_archived.is_(False)
                    )
                ).all()
            )

        for note in notes:
            # Ensure latest version exists
            stmt = (
                select(NoteVersion)
                .where(NoteVersion.note_id == note.id)
                .order_by(NoteVersion.created_at.desc())
            )
            latest_version = db.scalars(stmt).first()
            if not latest_version:
                latest_version = version_service.create_version(
                    db=db,
                    workspace_id=note.workspace_id,
                    note_id=note.id,
                    author_id=note.created_by,
                    message="Initial index snapshot",
                )

            # Chunk note content
            raw_chunks = chunking_service.chunk_note(note.content or "", title=note.title)
            if not raw_chunks:
                continue

            # Remove all previous vector points and chunks for this note
            try:
                vector_service.delete_note_vectors(note_id=note.id, workspace_id=note.workspace_id)
            except Exception as e:
                logger.warning("Failed deleting old vectors for note %s: %s", note.id, e)

            existing_chunks = list(
                db.scalars(select(ContentChunk).where(ContentChunk.note_id == note.id)).all()
            )
            for ec in existing_chunks:
                db.delete(ec)
            db.flush()

            # Create ContentChunk records
            created_chunks: list[ContentChunk] = []
            texts_to_embed: list[str] = []
            for rc in raw_chunks:
                nc = ContentChunk(
                    note_id=note.id,
                    version_id=latest_version.id,
                    source_id=None,
                    workspace_id=note.workspace_id,
                    chunk_index=rc["chunk_index"],
                    content=rc["content"],
                    content_hash=rc["content_hash"],
                    token_count=rc["token_count"],
                    embedding_model=settings.EMBEDDING_MODEL,
                    embedding_dimension=settings.EMBEDDING_DIMENSION,
                    created_at=datetime.now(UTC),
                )
                db.add(nc)
                created_chunks.append(nc)
                texts_to_embed.append(rc["content"])

            db.flush()

            # Generate embeddings and upsert to Qdrant
            embeddings = embedding_service.get_embeddings_batch(texts_to_embed)
            vector_service.upsert_chunks(
                workspace_id=note.workspace_id,
                chunks=created_chunks,
                embeddings=embeddings,
            )

            # Trigger graph indexing for this note per CONTRACT v0.3.2 §8.1
            try:
                graph_index_service.index_note_graph(db, note.id)
            except Exception as e:
                logger.warning("Graph indexing step failed for note %s: %s", note.id, e)

        job.status = "completed"
        job.completed_at = datetime.now(UTC)
        job.error_message = None
        db.commit()

    except Exception as e:
        logger.exception("Job %s failed: %s", job_id, e)
        job.status = "failed"
        job.completed_at = datetime.now(UTC)
        clean_msg = str(e).split("\n")[0][:200]
        job.error_message = f"Job failed: {clean_msg}"
        db.commit()
