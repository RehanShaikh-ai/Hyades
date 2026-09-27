"""ContentChunk Pydantic schemas.

Canonical schemas per CONTRACT v0.4.1 §4.2, §6.2.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ContentChunkResponse(BaseModel):
    """Response schema for a ContentChunk record."""

    id: uuid.UUID
    workspace_id: uuid.UUID
    note_id: uuid.UUID | None = None
    version_id: uuid.UUID | None = None
    source_id: uuid.UUID | None = None
    chunk_index: int
    content: str
    content_hash: str
    token_count: int
    embedding_model: str
    embedding_dimension: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
