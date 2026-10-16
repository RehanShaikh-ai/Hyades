"""Collection and membership schemas per CONTRACT v0.4.2 §5.2, §8.1.
"""

from datetime import datetime
from typing import Any, Literal
import uuid
from pydantic import BaseModel, ConfigDict, Field

KnowledgeItemType = Literal["note", "source", "entity", "conversation"]


class KnowledgeItemAddRequest(BaseModel):
    item_type: KnowledgeItemType
    item_id: uuid.UUID


class KnowledgeItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    item_type: KnowledgeItemType
    item_id: uuid.UUID
    title: str
    added_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class KnowledgeItemListResponse(BaseModel):
    items: list[KnowledgeItemResponse]
    total: int
    page: int
    page_size: int


class CollectionCreate(BaseModel):
    workspace_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=150)
    description: str | None = None
    icon: str | None = Field(default=None, max_length=32)
    created_by: uuid.UUID | None = None


class CollectionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = None
    icon: str | None = Field(default=None, max_length=32)


class CollectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    description: str | None
    icon: str | None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    item_count: int | None = 0


class CollectionListResponse(BaseModel):
    items: list[CollectionResponse]
    total: int
    page: int
    page_size: int


class CollectionStatsResponse(BaseModel):
    collection_id: uuid.UUID
    note_count: int
    source_count: int
    entity_count: int
    conversation_count: int
    total_items: int


class RelatedKnowledgeItem(BaseModel):
    item_type: KnowledgeItemType
    item_id: uuid.UUID
    title: str
    relationship_type: str | None = None
    score: float | None = None


class CollectionRelatedResponse(BaseModel):
    collection_id: uuid.UUID
    items: list[RelatedKnowledgeItem]
    total: int
