"""RAG schemas for retrieval-augmented generation.

Canonical schemas per CONTRACT v0.3.1 §5.2, §10.2, §10.3 and CONTRACT v0.4.1 §8.
"""

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.graph_rag import GraphRAGContext


class RAGRequest(BaseModel):
    """RAG request body per CONTRACT §10.2."""

    query: str = Field(min_length=1, max_length=500)
    search_mode: Literal["semantic", "lexical", "hybrid"] = "hybrid"
    rerank: bool = True
    context_limit: int = Field(default=5, ge=1, le=20)
    max_hops: int = Field(default=2, ge=1, le=2)
    stream: bool = False
    model: str | None = None
    history: list[dict[str, str]] | None = None


class CitedSource(BaseModel):
    """Cited source item linking answer to note or source chunk per CONTRACT §10.3 & v0.4.1 §8."""

    chunk_id: uuid.UUID
    note_id: uuid.UUID | None = None
    source_id: uuid.UUID | None = None
    title: str
    excerpt: str
    score: float

    model_config = ConfigDict(from_attributes=True)


class RAGResponse(BaseModel):
    """Grounded RAG response with citations per CONTRACT §10.3."""

    answer: str
    citations: list[CitedSource]
    graph_context: GraphRAGContext | None = None
    context_chunk_count: int
    provider: str
    model: str
    latency_ms: int
    reranking_applied: bool = False
    pending_ai_edit: str | None = None
    ai_unavailable: bool = False
