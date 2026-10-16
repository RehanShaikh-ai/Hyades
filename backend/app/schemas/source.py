"""Source Pydantic schemas.

Canonical schemas per CONTRACT §4.2, §5.1, §6.1, and CONTRACT v0.4.1 §4.2.
"""

import os
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
    extract_knowledge: bool = True

    # Extended content fields per CONTRACT v0.4.2 §11, §14
    title: str | None = None
    file_name: str | None = None
    excerpt: str | None = None
    extracted_text: str | None = None

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def populate_extracted_metadata(cls, data: Any) -> Any:
        if hasattr(data, "raw_metadata"):
            meta = getattr(data, "raw_metadata", None) or {}
            orig_path = getattr(data, "original_path", "") or ""
            fn = meta.get("file_name") or (os.path.basename(orig_path) if orig_path else None)
            ti = meta.get("title") or fn
            ex = meta.get("excerpt")
            tx = meta.get("extracted_text")
            return {
                "id": getattr(data, "id", None),
                "workspace_id": getattr(data, "workspace_id", None),
                "note_id": getattr(data, "note_id", None),
                "source_type": getattr(data, "source_type", ""),
                "original_path": orig_path,
                "source_identifier": getattr(data, "source_identifier", ""),
                "content_hash": getattr(data, "content_hash", ""),
                "import_batch_id": getattr(data, "import_batch_id", None),
                "import_status": getattr(data, "import_status", "pending"),
                "raw_metadata": meta,
                "error_message": getattr(data, "error_message", None),
                "imported_at": getattr(data, "imported_at", None),
                "last_synced_at": getattr(data, "last_synced_at", None),
                "processing_stage": getattr(data, "processing_stage", "upload"),
                "processing_status": getattr(data, "processing_status", "PENDING"),
                "file_size_bytes": getattr(data, "file_size_bytes", None),
                "page_count": getattr(data, "page_count", None),
                "chunk_count": getattr(data, "chunk_count", None),
                "error_stage": getattr(data, "error_stage", None),
                "extract_knowledge": getattr(data, "extract_knowledge", True),
                "title": ti,
                "file_name": fn,
                "excerpt": ex,
                "extracted_text": tx,
                "stage_timings": meta.get("stage_timings"),
            }
        elif isinstance(data, dict):
            meta = data.get("raw_metadata") or {}
            orig_path = data.get("original_path", "") or ""
            fn = data.get("file_name") or meta.get("file_name") or (os.path.basename(orig_path) if orig_path else None)
            ti = data.get("title") or meta.get("title") or fn
            ex = data.get("excerpt") or meta.get("excerpt")
            tx = data.get("extracted_text") or meta.get("extracted_text")
            data["title"] = ti
            data["file_name"] = fn
            data["excerpt"] = ex
            data["extracted_text"] = tx
            data["stage_timings"] = meta.get("stage_timings")
            return data
        return data


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
    extract_knowledge: bool = True
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


class SourceDocumentPreviewResponse(BaseModel):
    """Schema for document preview representation."""

    source_id: uuid.UUID
    title: str
    file_name: str
    format: str
    markdown_content: str
    is_converted: bool
    converter: str
    file_size_bytes: int | None = None

    model_config = ConfigDict(from_attributes=True)
