"""Collection Pydantic schemas per CONTRACT v0.4.2 §5.2."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CollectionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    description: str | None = None
    icon: str | None = Field(default=None, max_length=32)


class CollectionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = None
    icon: str | None = Field(default=None, max_length=32)


class CollectionResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    name: str
    description: str | None = None
    icon: str | None = None
    created_by: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CollectionListResponse(BaseModel):
    items: list[CollectionResponse]
    total: int
    page: int
    page_size: int


class CollectionStatsResponse(BaseModel):
    collection_id: UUID
    note_count: int = 0
    source_count: int = 0
    entity_count: int = 0
    conversation_count: int = 0


class RelatedEntity(BaseModel):
    id: UUID
    name: str
    entity_type: str
    connection_count: int = 0


class CollectionRelatedResponse(BaseModel):
    collection_id: UUID
    related_entities: list[RelatedEntity] = Field(default_factory=list)
