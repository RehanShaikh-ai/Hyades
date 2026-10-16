"""Schemas for Knowledge Inbox per CONTRACT v0.4.2 §7.1, §8.4, §12."""

from datetime import datetime
from typing import Any
import uuid

from pydantic import BaseModel, ConfigDict, Field


class DetectedConcept(BaseModel):
    name: str
    type: str = "concept"
    description: str | None = None


class InboxItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    source_id: uuid.UUID
    status: str
    detection_status: str
    detected_count: int
    detection_truncated: bool
    created_at: datetime
    decided_at: datetime | None = None
    source_title: str = ""
    source_type: str = ""
    file_size_bytes: int | None = None
    extract_knowledge: bool = True


class InboxItemDetailResponse(InboxItemResponse):
    detected_entities: list[dict[str, Any]] = Field(default_factory=list)
    raw_metadata: dict[str, Any] | None = None


class InboxItemListResponse(BaseModel):
    items: list[InboxItemResponse]
    total: int
    page: int
    page_size: int


class InboxItemUpdate(BaseModel):
    source_title: str | None = Field(None, min_length=1, max_length=255)
    extract_knowledge: bool | None = None


class InboxAcceptResponse(BaseModel):
    status: str = "accepted"
    inbox_item_id: uuid.UUID
    source_id: uuid.UUID
    extraction_started: bool


class InboxRejectResponse(BaseModel):
    status: str = "rejected"
    deleted_source_id: uuid.UUID
