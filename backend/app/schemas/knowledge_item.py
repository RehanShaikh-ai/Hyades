"""Knowledge Item membership Pydantic schemas per CONTRACT v0.4.2 §5.2, §6.1, §14.1."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

KnowledgeItemType = Literal["note", "source", "entity", "conversation"]


class KnowledgeItemAddRequest(BaseModel):
    item_type: KnowledgeItemType
    item_id: UUID


class KnowledgeItemResponse(BaseModel):
    item_type: KnowledgeItemType
    item_id: UUID
    title: str
    added_at: datetime
    metadata: dict | None = None

    model_config = ConfigDict(from_attributes=True)


class KnowledgeItemListResponse(BaseModel):
    items: list[KnowledgeItemResponse]
    total: int
    page: int
    page_size: int
