"""Source Pydantic schemas.

Canonical schemas per CONTRACT §4.2, §5.1, §6.1, and CONTRACT v0.4.1 §4.2.
"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class DetectedNote(BaseModel):
    """Note detected during import preview."""

    original_path: str
    title: str
    tag_count: int = 0
    outgoing_link_count: int = 0
    is_duplicate: bool = False
    will_update_existing: bool = False


class SourcePreviewResponse(BaseModel):
    """Response schema for POST /api/v1/workspaces/{id}/sources/preview."""

    detected_notes: list[DetectedNote] = Field(default_factory=list)
    unresolved_link_count: int = 0
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class SourceImportResult(BaseModel):
    """Result for an individual source in commit import."""

    original_path: str
    status: str
    note_id: uuid.UUID | None = None
    error: str | None = None


class SourceImportResponse(BaseModel):
    """Response schema for POST /api/v1/workspaces/{id}/sources/import."""

    import_batch_id: uuid.UUID
    imported: int = 0
    updated: int = 0
    skipped: int = 0
    failed: int = 0
    removed_since_last_import: int = 0
    results: list[SourceImportResult] = Field(default_factory=list)


class SourceResponse(BaseModel):
    """Response schema for single Source record."""

    id: uuid.UUID
    workspace_id: uuid.UUID
    note_id: uuid.UUID | None = None
    source_type: str
    original_path: str
    source_identifier: str
    content_hash: str
    import_batch_id: uuid.UUID
    import_status: str
    raw_metadata: dict[str, Any] | None = None
    error_message: str | None = None
    imported_at: datetime
    last_synced_at: datetime | None = None
    processing_stage: str = "upload"
    processing_status: str = "PENDING"
    file_size_bytes: int | None = None
    page_count: int | None = None
    chunk_count: int | None = None
    error_stage: str | None = None

    model_config = ConfigDict(from_attributes=True)


class SourceListResponse(BaseModel):
    """Paginated list of Source records."""

    items: list[SourceResponse]
    total: int
    page: int
    page_size: int


class SourceProcessingStatusResponse(BaseModel):
    """Response schema for source processing status."""

    id: uuid.UUID
    processing_stage: str
    processing_status: str
    chunk_count: int | None = None
    page_count: int | None = None
    error_stage: str | None = None
    error_message: str | None = None

    model_config = ConfigDict(from_attributes=True)


class SourceLinkRequest(BaseModel):
    """Request schema for linking a source to a note."""

    note_id: uuid.UUID


class SourceNoteLink(BaseModel):
    """Response schema for a source-note association."""

    source_id: uuid.UUID
    note_id: uuid.UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
