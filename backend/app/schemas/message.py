"""Message and MessageCitation Pydantic schemas.

Canonical schemas per CONTRACT v0.4.1 §4.2, §6.4, §6.5, and §8.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class MessageCitationResponse(BaseModel):
    """Response schema for a citation linked to an assistant message."""

    id: uuid.UUID
    message_id: uuid.UUID
    chunk_id: uuid.UUID
    note_id: uuid.UUID | None = None
    source_id: uuid.UUID | None = None
    workspace_id: uuid.UUID
    similarity_score: float = Field(..., ge=0.0, le=1.0)
    rank: int
    source_title: str | None = None
    note_title: str | None = None
    excerpt: str | None = None
    page_number: int | None = None

    model_config = ConfigDict(from_attributes=True)


class MessageCreate(BaseModel):
    """Request schema for sending a user message in a conversation."""

    content: str = Field(..., min_length=1, max_length=4000)
    stream: bool = True


class MessageResponse(BaseModel):
    """Response schema for a single message in a conversation."""

    id: uuid.UUID
    conversation_id: uuid.UUID
    workspace_id: uuid.UUID
    role: str
    content: str
    provider: str | None = None
    model: str | None = None
    latency_ms: int | None = None
    created_at: datetime
    citations: list[MessageCitationResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
