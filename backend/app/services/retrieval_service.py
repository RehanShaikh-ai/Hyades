"""Retrieval service supporting semantic, lexical, and hybrid search.

Canonical service per CONTRACT v0.3.1 §5.3, §9.1, §9.2 and CONTRACT v0.4.1 §8, §14.1.
Provides search_semantic, search_lexical, search_hybrid.
"""

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.content_chunk import ContentChunk
from app.models.note import Note
from app.models.source import Source
from app.schemas.search import SearchResultItem
from app.services import embedding_service, search_service, vector_service

logger = logging.getLogger("app.services.retrieval_service")


def search_semantic(
    db: Session,
    workspace_id: uuid.UUID,
    query: str,
    limit: int = 10,
    include_archived: bool = False,
    min_score: float | None = None,
) -> list[SearchResultItem]:
    """Semantic vector search against Qdrant per CONTRACT §9.1, §9.2 and CONTRACT v0.4.1 §14.1."""
    if not query.strip():
        return []

    # Get query embedding
    query_vector = embedding_service.get_embedding(query)

    # Note exclusion filters if archived are excluded
    excluded_note_ids: list[uuid.UUID] = []
    if not include_archived:
        archived_ids = db.scalars(
            select(Note.id).where(Note.workspace_id == workspace_id, Note.is_archived.is_(True))
        ).all()
        excluded_note_ids = list(archived_ids)

    # Search vectors
    points = vector_service.search_vectors(
        workspace_id=workspace_id,
        query_vector=query_vector,
        limit=max(limit * 3, 20),
        excluded_note_ids=excluded_note_ids,
    )

    threshold = min_score
    seen_notes: set[uuid.UUID] = set()
    seen_sources: set[uuid.UUID] = set()
    results: list[SearchResultItem] = []
    for pt in points:
        pt_score = float(pt.get("score", 0.0))
        if threshold is not None and pt_score < threshold:
            continue

        payload = pt.get("payload", {})
        note_id_str = payload.get("note_id")
        source_id_str = payload.get("source_id")
        chunk_id_str = payload.get("chunk_id")

        if note_id_str:
            n_id = uuid.UUID(note_id_str)
            if n_id in seen_notes:
                continue

            note = db.get(Note, n_id)
            if not note or (note.is_archived and not include_archived):
                continue

            seen_notes.add(n_id)

            excerpt = ""
            c_id: uuid.UUID | None = None
            if chunk_id_str:
                try:
                    c_id = uuid.UUID(chunk_id_str)
                    chunk = db.get(ContentChunk, c_id)
                    if chunk:
                        excerpt = chunk.content[:500]
                except Exception:
                    pass

            if not excerpt:
                excerpt = (note.content or "")[:500]

            results.append(
                SearchResultItem(
                    note_id=note.id,
                    source_id=None,
                    chunk_id=c_id,
                    title=note.title,
                    excerpt=excerpt,
                    score=round(float(pt.get("score", 0.0)), 4),
                    score_meaning="cosine_similarity",
                    search_mode="semantic",
                    is_archived=note.is_archived,
                )
            )
        elif source_id_str:
            s_id = uuid.UUID(source_id_str)
            if s_id in seen_sources:
                continue

            source = db.get(Source, s_id)
            if not source:
                continue

            seen_sources.add(s_id)

            excerpt = ""
            c_id = None
            if chunk_id_str:
                try:
                    c_id = uuid.UUID(chunk_id_str)
                    chunk = db.get(ContentChunk, c_id)
                    if chunk:
                        excerpt = chunk.content[:500]
                except Exception:
                    pass

            source_title = (
                source.original_path.replace("\\", "/").split("/")[-1] or source.source_identifier
            )
            results.append(
                SearchResultItem(
                    note_id=None,
                    source_id=source.id,
                    chunk_id=c_id,
                    title=source_title,
                    excerpt=excerpt,
                    score=round(float(pt.get("score", 0.0)), 4),
                    score_meaning="cosine_similarity",
                    search_mode="semantic",
                    is_archived=False,
                )
            )

        if len(results) >= limit:
            break

    return results


def search_lexical(
    db: Session,
    workspace_id: uuid.UUID,
    query: str,
    limit: int = 10,
    include_archived: bool = False,
) -> list[SearchResultItem]:
    """Lexical text search per CONTRACT §9.1, §9.2."""
    notes, _ = search_service.search_notes(
        db,
        workspace_id,
        query=query,
        page=1,
        page_size=limit,
    )

    results: list[SearchResultItem] = []
    for rank, note in enumerate(notes):
        if note.is_archived and not include_archived:
            continue
        # Lexical score normalized from position
        rank_score = round(1.0 / (rank + 1), 4)
        results.append(
            SearchResultItem(
                note_id=note.id,
                source_id=None,
                chunk_id=None,
                title=note.title,
                excerpt=(note.content or "")[:500],
                score=rank_score,
                score_meaning="bm25",
                search_mode="lexical",
                is_archived=note.is_archived,
            )
        )
    return results[:limit]


def search_hybrid(
    db: Session,
    workspace_id: uuid.UUID,
    query: str,
    limit: int = 10,
    include_archived: bool = False,
    min_score: float | None = None,
) -> list[SearchResultItem]:
    """Hybrid search combining semantic and lexical via Reciprocal Rank Fusion (RRF)."""
    # Fetch top candidates from both modes
    semantic_results = search_semantic(
        db,
        workspace_id,
        query,
        limit=limit * 2,
        include_archived=include_archived,
        min_score=min_score,
    )
    lexical_results = search_lexical(
        db, workspace_id, query, limit=limit * 2, include_archived=include_archived
    )

    # RRF with standard constant k = 60
    k = 60
    rrf_scores: dict[str, float] = {}
    items_by_key: dict[str, SearchResultItem] = {}

    for rank, item in enumerate(semantic_results):
        key = f"note:{item.note_id}" if item.note_id else f"source:{item.source_id}"
        score = 1.0 / (k + rank + 1)
        rrf_scores[key] = rrf_scores.get(key, 0.0) + score
        items_by_key[key] = item

    for rank, item in enumerate(lexical_results):
        key = f"note:{item.note_id}" if item.note_id else f"source:{item.source_id}"
        score = 1.0 / (k + rank + 1)
        rrf_scores[key] = rrf_scores.get(key, 0.0) + score
        if key not in items_by_key:
            items_by_key[key] = item

    sorted_keys = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)

    final_results: list[SearchResultItem] = []
    for key, combined_score in sorted_keys[:limit]:
        orig = items_by_key[key]
        final_results.append(
            SearchResultItem(
                note_id=orig.note_id,
                source_id=orig.source_id,
                chunk_id=orig.chunk_id,
                title=orig.title,
                excerpt=orig.excerpt,
                score=round(combined_score, 4),
                score_meaning="rrf_combined",
                search_mode="hybrid",
                is_archived=orig.is_archived,
            )
        )

    return final_results
