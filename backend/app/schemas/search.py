"""Search schemas for semantic, lexical, and hybrid search.

Canonical schemas per CONTRACT v0.3.1 §5.2, §9.2, §9.3 and CONTRACT v0.4.1 §8.
"""

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SearchRequest(BaseModel):
    """Search request body per CONTRACT §9.3."""

    query: str = Field(min_length=1, max_length=500)
    mode: Literal["semantic", "lexical", "hybrid"] = "hybrid"
    limit: int = Field(default=10, ge=1, le=50)
    include_archived: bool = False
    rerank: bool = False


class SearchResultItem(BaseModel):
    """Search result item per CONTRACT §9.2 and CONTRACT v0.4.1 §8."""

    note_id: uuid.UUID | None = None
    source_id: uuid.UUID | None = None
    chunk_id: uuid.UUID | None = None
    title: str
    excerpt: str
    score: float
    score_meaning: str
    search_mode: str
    is_archived: bool = False

    model_config = ConfigDict(from_attributes=True)


class SearchResponse(BaseModel):
    """Search response returning ranked results."""

    query: str
    mode: str
    total: int
    items: list[SearchResultItem]
    reranking_applied: bool = False
