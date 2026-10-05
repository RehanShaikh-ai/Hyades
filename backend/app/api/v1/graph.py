"""Knowledge Graph endpoints.

Canonical endpoints per CONTRACT v0.3.2 §9.1, §9.4, §16.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.graph import (
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
