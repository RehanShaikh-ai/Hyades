"""Source ingestion and management endpoints.

Canonical endpoints per contract §7 (v0.2.2) and CONTRACT v0.4.1 §10.1.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.source import (
    SourceImportResponse,
    SourceLinkRequest,
    SourceListResponse,
    SourceNoteLink,
    SourcePreviewResponse,
    SourceResponse,
)
from app.services import source_service

router = APIRouter(tags=["sources"])


@router.post(
    "/workspaces/{workspace_id}/sources/upload",
    response_model=SourceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_source(
    workspace_id: uuid.UUID,
    file: Annotated[UploadFile, File(...)],
    db: Annotated[Session, Depends(get_db)],
) -> SourceResponse:
    """Upload single file and trigger background processing pipeline per CONTRACT v0.4.1 §10.1."""
    content = await file.read()
    source = source_service.upload_source(
        db=db,
        workspace_id=workspace_id,
        file_content=content,
        filename=file.filename or "uploaded_source",
        content_type=file.content_type,
    )
    return SourceResponse.model_validate(source)


@router.post(
    "/workspaces/{workspace_id}/sources/preview",
    response_model=SourcePreviewResponse,
    status_code=status.HTTP_200_OK,
)
def preview_sources(
    workspace_id: uuid.UUID,
    files: Annotated[list[UploadFile], File(...)],
    db: Annotated[Session, Depends(get_db)],
) -> SourcePreviewResponse:
    """Preview a batch vault import without writing to the database."""
    return source_service.preview_import(db, workspace_id, files)


@router.post(
    "/workspaces/{workspace_id}/sources/import",
    response_model=SourceImportResponse,
    status_code=status.HTTP_201_CREATED,
)
def commit_sources(
    workspace_id: uuid.UUID,
    created_by: Annotated[uuid.UUID, Form(...)],
    files: Annotated[list[UploadFile], File(...)],
    db: Annotated[Session, Depends(get_db)],
) -> SourceImportResponse:
    """Commit a batch vault import with deduplication and upsert handling."""
    return source_service.commit_import(
        db=db,
        workspace_id=workspace_id,
        files=files,
        created_by=created_by,
    )


@router.get(
    "/workspaces/{workspace_id}/sources",
    response_model=SourceListResponse,
    status_code=status.HTTP_200_OK,
)
def list_workspace_sources(
    workspace_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
    processing_status: Annotated[str | None, Query()] = None,
) -> SourceListResponse:
    """List paginated sources for a workspace filterable by status per CONTRACT v0.4.1 §10.1."""
    return source_service.list_sources(
        db=db,
        workspace_id=workspace_id,
        page=page,
        page_size=page_size,
        processing_status=processing_status,
    )


@router.get(
    "/sources/{source_id}",
    response_model=SourceResponse,
    status_code=status.HTTP_200_OK,
)
def get_source(
    source_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> SourceResponse:
    """Get a single source record per CONTRACT §10.1."""
    source = source_service.get_source(db, source_id)
    return SourceResponse.model_validate(source)


@router.delete(
    "/sources/{source_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_source(
    source_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Delete a source and all associated chunks and vectors per CONTRACT v0.4.1 §10.1."""
    source_service.delete_source(db, source_id)


@router.post(
    "/sources/{source_id}/retry",
    response_model=SourceResponse,
    status_code=status.HTTP_200_OK,
)
def retry_source(
    source_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> SourceResponse:
    """Retry processing for a failed source per CONTRACT v0.4.1 §7.3, §10.1."""
    source = source_service.retry_source(db, source_id)
    return SourceResponse.model_validate(source)


@router.post(
    "/sources/{source_id}/link-note",
    response_model=SourceNoteLink,
    status_code=status.HTTP_201_CREATED,
)
def link_source_to_note(
    source_id: uuid.UUID,
    request: SourceLinkRequest,
    db: Annotated[Session, Depends(get_db)],
) -> SourceNoteLink:
    """Associate a source with a note per CONTRACT v0.4.1 §6.6, §10.1."""
    link = source_service.link_source_to_note(db, source_id, request.note_id)
    return SourceNoteLink.model_validate(link)


@router.delete(
    "/sources/{source_id}/link-note/{note_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def unlink_source_from_note(
    source_id: uuid.UUID,
    note_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Remove an association between a source and a note per CONTRACT v0.4.1 §6.6, §10.1."""
    source_service.unlink_source_from_note(db, source_id, note_id)
