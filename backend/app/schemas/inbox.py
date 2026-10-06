"""Inbox Pydantic schemas per CONTRACT v0.4.2 §5.2, §12."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class InboxItemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    extract_knowledge: bool | None = None


class DetectedConcept(BaseModel):
    name: str
    entity_type: str
    confidence: float = 1.0


class InboxItemResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    source_id: UUID
    status: str
    detection_status: str
    detected_count: int
    detected_entities: list[dict] | None = None
    detection_truncated: bool
    extraction_job_id: UUID | None = None
    created_at: datetime
    decided_at: datetime | None = None

    # Enriched source detail fields
    source_title: str | None = None
    source_type: str | None = None
    file_size_bytes: int | None = None
    extract_knowledge: bool = True

    model_config = ConfigDict(from_attributes=True)


class InboxListResponse(BaseModel):
    items: list[InboxItemResponse]
    total: int
    page: int
    page_size: int
