"""Assistant Pydantic schemas.

Canonical schemas per CONTRACT v0.4.1 §4.2, §9.2.
"""

import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.message import MessageCitationResponse, MessageResponse


class AssistantQueryRequest(BaseModel):
    """Request schema for querying the AI assistant within a conversation."""

    content: str = Field(..., min_length=1, max_length=4000)
    stream: bool = True


class AssistantStreamEvent(BaseModel):
    """SSE event payload emitted during assistant response streaming."""

    type: str  # "user_message_created" | "chunk" | "done" | "error"
    message_id: uuid.UUID | None = None
    content: str | None = None
    citations: list[MessageCitationResponse] | None = None
    provider: str | None = None
    model: str | None = None
    code: str | None = None
    message: str | None = None
    metadata: dict[str, Any] | None = None


class AssistantResponse(BaseModel):
    """Non-streaming response schema containing user message and generated assistant reply."""

    user_message: MessageResponse
    assistant_message: MessageResponse

    model_config = ConfigDict(from_attributes=True)
