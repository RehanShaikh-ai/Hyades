"""Knowledge Graph endpoints.

Canonical endpoints per CONTRACT v0.3.2 §9.1, §9.4, §16.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entity_chunk import EntityChunk
from app.models.index_job import IndexJob
from app.models.note import Note
from app.models.source import Source
from app.models.workspace import Workspace
from app.schemas.graph import (
    ExtractionCategorySummary,
    ExtractionStatusItem,
    ExtractionStatusResponse,
    GraphResponse,
    GraphSearchResponse,
    NoteGraphResponse,
)
from app.schemas.job import ExtractionJobResponse, IndexJobRequest
from app.services import graph_service, job_service

router = APIRouter(tags=["graph"])


@router.get(
    "/workspaces/{workspace_id}/graph",
    response_model=GraphResponse,
    status_code=status.HTTP_200_OK,
)
def get_workspace_graph(
    workspace_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    entity_type: Annotated[str | None, Query(description="Filter nodes to this type")] = None,
    cluster_id: Annotated[
        uuid.UUID | None, Query(description="Filter to nodes in this cluster")
    ] = None,
    note_id: Annotated[
        uuid.UUID | None, Query(description="Filter to entities connected to this note")
    ] = None,
    relationship_type: Annotated[
        str | None, Query(description="Filter edges to this relationship type")
    ] = None,
    min_confidence: Annotated[
        float, Query(ge=0.0, le=1.0, description="Exclude relationships below this confidence")
    ] = 0.0,
    limit: Annotated[int, Query(ge=1, le=2000, description="Max nodes returned (max 2000)")] = 500,
) -> GraphResponse:
    """Return the workspace entity knowledge graph per CONTRACT §9.1."""
    return graph_service.get_workspace_graph(
        db=db,
        workspace_id=workspace_id,
        entity_type=entity_type,
        cluster_id=cluster_id,
        note_id=note_id,
        relationship_type=relationship_type,
        min_confidence=min_confidence,
        limit=limit,
    )


@router.get(
    "/workspaces/{workspace_id}/graph/search",
    response_model=GraphSearchResponse,
    status_code=status.HTTP_200_OK,
)
def search_graph(
    workspace_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    q: Annotated[str, Query(min_length=1, max_length=200, description="Search query string")],
    limit: Annotated[int, Query(ge=1, le=100, description="Max results returned")] = 20,
) -> GraphSearchResponse:
    """Search knowledge graph entities and connected notes per CONTRACT §9.1."""
    return graph_service.search_graph(
        db=db,
        workspace_id=workspace_id,
        q=q,
        limit=limit,
    )


@router.post(
    "/workspaces/{workspace_id}/graph/extract",
    response_model=ExtractionJobResponse,
    status_code=status.HTTP_200_OK,
)
def trigger_graph_extraction(
    workspace_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    payload: IndexJobRequest | None = None,
) -> ExtractionJobResponse:
    """Trigger asynchronous entity and relationship extraction per CONTRACT §9.4."""
    note_ids = payload.note_ids if payload else None
    job = job_service.enqueue_extract_job(db, workspace_id, note_ids=note_ids)
    return ExtractionJobResponse(job_id=job.id, status=job.status)


@router.post(
    "/workspaces/{workspace_id}/graph/reindex",
    response_model=ExtractionJobResponse,
    status_code=status.HTTP_200_OK,
)
def trigger_graph_reindex(
    workspace_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> ExtractionJobResponse:
    """Trigger full workspace graph reindexing per CONTRACT §9.4, §12.2."""
    job = job_service.enqueue_reindex_graph_job(db, workspace_id)
    return ExtractionJobResponse(job_id=job.id, status=job.status)


@router.get(
    "/notes/{note_id}/graph",
    response_model=NoteGraphResponse,
    status_code=status.HTTP_200_OK,
)
def get_note_neighborhood(
    note_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> NoteGraphResponse:
    """Return the 1-hop note-level neighborhood graph for a note per CONTRACT §16."""
    return graph_service.get_note_neighborhood(db, note_id)


@router.get(
    "/workspaces/{workspace_id}/graph/extraction-status",
    response_model=ExtractionStatusResponse,
    status_code=status.HTTP_200_OK,
)
def get_workspace_extraction_status(
    workspace_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> ExtractionStatusResponse:
    """Return telemetry on knowledge extraction status across all workspace notes and sources.
    Uses actual database state (not visible items).
    Distinguishes extracted, pending, failed, and ineligible items with failure explanations.
    """
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    notes = (
        db.query(Note)
        .filter(
            Note.workspace_id == workspace_id,
            Note.is_archived.is_(False),
        )
        .order_by(Note.created_at.desc())
        .all()
    )

    sources = (
        db.query(Source)
        .filter(
            Source.workspace_id == workspace_id,
        )
        .order_by(Source.imported_at.desc())
        .all()
    )

    # Query distinct note_ids and source_ids with extracted provenance
    extracted_note_ids = set(
        r[0]
        for r in db.query(EntityChunk.note_id)
        .filter(
            EntityChunk.workspace_id == workspace_id,
            EntityChunk.note_id.isnot(None),
        )
        .distinct()
        .all()
    )

    extracted_source_ids = set(
        r[0]
        for r in db.query(EntityChunk.source_id)
        .filter(
            EntityChunk.workspace_id == workspace_id,
            EntityChunk.source_id.isnot(None),
        )
        .distinct()
        .all()
    )

    # Check latest indexing job for failed note records
    latest_job = (
        db.query(IndexJob)
        .filter(
            IndexJob.workspace_id == workspace_id,
        )
        .order_by(IndexJob.enqueued_at.desc())
        .first()
    )

    failed_notes_map: dict[str, str] = {}
    if latest_job and isinstance(latest_job.progress, dict):
        for fn in latest_job.progress.get("failed_notes", []):
            if isinstance(fn, dict) and fn.get("note_id"):
                failed_notes_map[str(fn["note_id"])] = fn.get("error", "Extraction failed")

    items: list[ExtractionStatusItem] = []

    # Process Notes
    notes_eligible = 0
    notes_extracted = 0
    notes_pending = 0
    notes_failed = 0
    notes_ineligible = 0

    for note in notes:
        is_eligible = bool(getattr(note, "extract_knowledge", True))
        err_msg = None
        if not is_eligible:
            item_status = "ineligible"
            notes_ineligible += 1
        else:
            notes_eligible += 1
            if note.id in extracted_note_ids:
                item_status = "extracted"
                notes_extracted += 1
            elif str(note.id) in failed_notes_map:
                item_status = "failed"
                err_msg = failed_notes_map[str(note.id)]
                notes_failed += 1
            else:
                item_status = "pending"
                notes_pending += 1

        items.append(
            ExtractionStatusItem(
                id=note.id,
                type="note",
                title=note.title,
                extract_knowledge=is_eligible,
                status=item_status,
                error_message=err_msg,
            )
        )

    # Process Sources
    sources_eligible = 0
    sources_extracted = 0
    sources_pending = 0
    sources_failed = 0
    sources_ineligible = 0

    for source in sources:
        is_eligible = bool(getattr(source, "extract_knowledge", True))
        err_msg = source.error_message
        proc_status = (source.processing_status or "").upper()
        orig_title = (
            getattr(source, "title", None)
            or (source.raw_metadata or {}).get("title")
            or source.original_path
        )

        if not is_eligible:
            item_status = "ineligible"
            sources_ineligible += 1
        else:
            sources_eligible += 1
            if source.id in extracted_source_ids or proc_status == "COMPLETED":
                item_status = "extracted"
                sources_extracted += 1
            elif proc_status == "FAILED":
                item_status = "failed"
                err_msg = err_msg or "Source document parsing/extraction failed"
                sources_failed += 1
            else:
                item_status = "pending"
                sources_pending += 1

        items.append(
            ExtractionStatusItem(
                id=source.id,
                type="source",
                title=orig_title,
                extract_knowledge=is_eligible,
                status=item_status,
                error_message=err_msg,
            )
        )

    total_eligible = notes_eligible + sources_eligible
    total_extracted = notes_extracted + sources_extracted
    total_pending = notes_pending + sources_pending
    total_failed = notes_failed + sources_failed
    total_ineligible = notes_ineligible + sources_ineligible
    summary_str = f"{total_extracted}/{total_eligible} extracted"

    return ExtractionStatusResponse(
        total_items=len(notes) + len(sources),
        eligible_count=total_eligible,
        extracted_count=total_extracted,
        pending_count=total_pending,
        failed_count=total_failed,
        ineligible_count=total_ineligible,
        summary=summary_str,
        notes=ExtractionCategorySummary(
            total=len(notes),
            eligible=notes_eligible,
            extracted=notes_extracted,
            pending=notes_pending,
            failed=notes_failed,
            ineligible=notes_ineligible,
        ),
        sources=ExtractionCategorySummary(
            total=len(sources),
            eligible=sources_eligible,
            extracted=sources_extracted,
            pending=sources_pending,
            failed=sources_failed,
            ineligible=sources_ineligible,
        ),
        items=items,
    )
