"""Conversation Pydantic schemas.

Canonical schemas per CONTRACT v0.4.1 §4.2, §6.3, and §9.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.message import MessageResponse


class ConversationCreate(BaseModel):
    """Request schema for creating a new conversation."""

    title: str | None = Field(default=None, max_length=200)


class ConversationRenameRequest(BaseModel):
    """Request schema for renaming a conversation."""

    title: str = Field(..., min_length=1, max_length=200)


class ConversationResponse(BaseModel):
    """Response schema for a single conversation."""

    id: uuid.UUID
    workspace_id: uuid.UUID
    title: str | None = None
    created_at: datetime
    updated_at: datetime
    messages: list[MessageResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class ConversationListResponse(BaseModel):
    """Paginated list of conversations."""

    items: list[ConversationResponse]
    total: int
    page: int
    page_size: int
