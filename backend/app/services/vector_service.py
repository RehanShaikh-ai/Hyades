"""Qdrant vector store service.

Canonical service per CONTRACT v0.3.1 §5.3, §7.1-§7.5, CONTRACT v0.3.2 §4, §7,
and CONTRACT v0.4.1 §6.2, §7.3.
Provides collection_name, upsert_chunks, delete_note_vectors, delete_source_vectors,
search_vectors, update_chunk_payloads.
"""

import logging
import uuid
from typing import Any

import httpx
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels

from app.core.config import settings
from app.core.exceptions import (
    EmbeddingDimensionMismatchError,
    VectorStoreUnavailableError,
)
from app.models.content_chunk import ContentChunk

logger = logging.getLogger("app.services.vector_service")

# In-memory store for testing without Qdrant service
_in_memory_collections: dict[str, list[dict[str, Any]]] = {}


def collection_name(workspace_id: str | uuid.UUID) -> str:
    """Canonical collection name formula per CONTRACT §7.1."""
    return f"{settings.QDRANT_COLLECTION_PREFIX}_{workspace_id}"


def _get_qdrant_client() -> QdrantClient | None:
    """Get QdrantClient or None if in test mode without running Qdrant."""
    if settings.APP_ENV == "testing":
        return None
    try:
        client = QdrantClient(url=settings.QDRANT_URL, timeout=2.0)
        client.get_collections()
        return client
    except Exception as e:
        logger.error("Failed to connect to Qdrant at %s: %s", settings.QDRANT_URL, e)
        raise VectorStoreUnavailableError(f"Vector store unavailable: {e}") from e


def _ensure_collection(client: QdrantClient, c_name: str, dimension: int) -> None:
    try:
        collections = client.get_collections().collections
        exists = any(c.name == c_name for c in collections)
        if not exists:
            client.create_collection(
                collection_name=c_name,
                vectors_config=qmodels.VectorParams(
                    size=dimension,
                    distance=qmodels.Distance.COSINE,
                ),
            )
    except Exception as e:
        logger.error("Failed ensuring Qdrant collection %s: %s", c_name, e)
        raise VectorStoreUnavailableError(f"Vector store unavailable: {e}") from e


def upsert_chunks(
    workspace_id: uuid.UUID,
    chunks: list[ContentChunk],
    embeddings: list[list[float]],
) -> None:
    """Upsert content chunks (notes/sources) into workspace vector collection.

    Complies with CONTRACT §6.2, §7.2, §7.4.
    """
    if not chunks:
        return

    expected_dim = settings.EMBEDDING_DIMENSION
    c_name = collection_name(workspace_id)

    # Validate dimensions
    for emb in embeddings:
        if len(emb) != expected_dim:
            raise EmbeddingDimensionMismatchError(
                f"Embedding dimension {len(emb)} != expected {expected_dim}"
            )

    client = _get_qdrant_client()
    if client is None:
        # In-memory test store
        if c_name not in _in_memory_collections:
            _in_memory_collections[c_name] = []
        for chunk, emb in zip(chunks, embeddings, strict=True):
            payload = {
                "chunk_id": str(chunk.id),
                "note_id": str(chunk.note_id) if chunk.note_id else None,
                "source_id": str(chunk.source_id) if chunk.source_id else None,
                "workspace_id": str(workspace_id),
                "version_id": str(chunk.version_id) if chunk.version_id else None,
                "chunk_index": chunk.chunk_index,
                "content_hash": chunk.content_hash,
                "embedding_model": chunk.embedding_model,
                "embedding_dimension": chunk.embedding_dimension,
                "entity_ids": [],
                "cluster_id": None,
            }
            # Remove existing point with same chunk_id if exists
            _in_memory_collections[c_name] = [
                p for p in _in_memory_collections[c_name] if p["id"] != str(chunk.id)
            ]
            _in_memory_collections[c_name].append(
                {"id": str(chunk.id), "vector": emb, "payload": payload}
            )
        return

    try:
        _ensure_collection(client, c_name, expected_dim)
        points: list[qmodels.PointStruct] = []
        for chunk, emb in zip(chunks, embeddings, strict=True):
            # Payload follows CONTRACT §6.2 & v0.3.2 §7
            payload = {
                "chunk_id": str(chunk.id),
                "note_id": str(chunk.note_id) if chunk.note_id else None,
                "source_id": str(chunk.source_id) if chunk.source_id else None,
                "workspace_id": str(workspace_id),
                "version_id": str(chunk.version_id) if chunk.version_id else None,
                "chunk_index": chunk.chunk_index,
                "content_hash": chunk.content_hash,
                "embedding_model": chunk.embedding_model,
                "embedding_dimension": chunk.embedding_dimension,
                "entity_ids": [],
                "cluster_id": None,
            }
            points.append(
                qmodels.PointStruct(
                    id=str(chunk.id),
                    vector=emb,
                    payload=payload,
                )
            )

        client.upsert(collection_name=c_name, points=points)
    except Exception as e:
        logger.error("Failed upserting vectors to %s: %s", c_name, e)
        raise VectorStoreUnavailableError(f"Vector store unavailable: {e}") from e


def update_chunk_payloads(
    workspace_id: uuid.UUID,
    chunk_payload_updates: dict[uuid.UUID, dict[str, Any]],
) -> None:
    """Update payload fields (e.g. entity_ids, cluster_id) on existing chunks
    per CONTRACT v0.3.2 §7.
    """
    if not chunk_payload_updates:
        return

    c_name = collection_name(workspace_id)
    client = _get_qdrant_client()

    if client is None:
        if c_name in _in_memory_collections:
            for item in _in_memory_collections[c_name]:
                cid = uuid.UUID(item["id"]) if isinstance(item["id"], str) else item["id"]
                if cid in chunk_payload_updates:
                    item["payload"].update(chunk_payload_updates[cid])
        return

    try:
        for chunk_id, updates in chunk_payload_updates.items():
            client.set_payload(
                collection_name=c_name,
                payload=updates,
                points=[str(chunk_id)],
            )
    except Exception as e:
        logger.warning("Failed updating Qdrant payloads for workspace %s: %s", workspace_id, e)


def delete_note_vectors(note_id: uuid.UUID, workspace_id: uuid.UUID) -> None:
    """Delete all vector points for note_id in workspace per CONTRACT §7.5."""
    c_name = collection_name(workspace_id)
    client = _get_qdrant_client()
    if client is None:
        if c_name in _in_memory_collections:
            _in_memory_collections[c_name] = [
                p
                for p in _in_memory_collections[c_name]
                if p["payload"].get("note_id") != str(note_id)
            ]
        return

    try:
        client.delete(
            collection_name=c_name,
            points_selector=qmodels.FilterSelector(
                filter=qmodels.Filter(
                    must=[
                        qmodels.FieldCondition(
                            key="note_id",
                            match=qmodels.MatchValue(value=str(note_id)),
                        )
                    ]
                )
            ),
        )
    except Exception as e:
        logger.warning("Error deleting vectors for note %s: %s", note_id, e)


def delete_source_vectors(source_id: uuid.UUID, workspace_id: uuid.UUID) -> None:
    """Delete all vector points for source_id in workspace per CONTRACT v0.4.1 §7.3."""
    c_name = collection_name(workspace_id)
    client = _get_qdrant_client()
    if client is None:
        if c_name in _in_memory_collections:
            _in_memory_collections[c_name] = [
                p
                for p in _in_memory_collections[c_name]
                if p["payload"].get("source_id") != str(source_id)
            ]
        return

    try:
        client.delete(
            collection_name=c_name,
            points_selector=qmodels.FilterSelector(
                filter=qmodels.Filter(
                    must=[
                        qmodels.FieldCondition(
                            key="source_id",
                            match=qmodels.MatchValue(value=str(source_id)),
                        )
                    ]
                )
            ),
        )
    except Exception as e:
        logger.warning("Error deleting vectors for source %s: %s", source_id, e)


def search_vectors(
    workspace_id: uuid.UUID,
    query_vector: list[float],
    limit: int = 10,
    excluded_note_ids: list[uuid.UUID] | None = None,
) -> list[dict[str, Any]]:
    """Search Qdrant collection with server-side workspace filtering per CONTRACT §7.3, §6.2."""
    c_name = collection_name(workspace_id)
    client = _get_qdrant_client()

    if client is None:
        # In-memory cosine similarity
        results = []
        col = _in_memory_collections.get(c_name, [])
        for item in col:
            # Workspace filter enforcement (§7.3)
            if item["payload"].get("workspace_id") != str(workspace_id):
                continue
            if excluded_note_ids and item["payload"].get("note_id") in [
                str(nid) for nid in excluded_note_ids
            ]:
                continue
            # Cosine similarity between query_vector and item['vector']
            vec = item["vector"]
            dot = sum(a * b for a, b in zip(query_vector, vec, strict=False))
            norm_q = sum(a * a for a in query_vector) ** 0.5 or 1.0
            norm_v = sum(b * b for b in vec) ** 0.5 or 1.0
            sim = dot / (norm_q * norm_v)

            payload = item["payload"]
            payload.setdefault("entity_ids", [])
            payload.setdefault("cluster_id", None)
            payload.setdefault("source_id", None)
            payload.setdefault("note_id", None)

            results.append(
                {
                    "id": item["id"],
                    "score": round(sim, 4),
                    "payload": payload,
                }
            )
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:limit]

    try:
        must_filters: list[Any] = [
            qmodels.FieldCondition(
                key="workspace_id",
                match=qmodels.MatchValue(value=str(workspace_id)),
            )
        ]
        must_not_filters: list[Any] = []
        if excluded_note_ids:
            for nid in excluded_note_ids:
                must_not_filters.append(
                    qmodels.FieldCondition(
                        key="note_id",
                        match=qmodels.MatchValue(value=str(nid)),
                    )
                )

        qfilter = qmodels.Filter(must=must_filters, must_not=must_not_filters)
        try:
            url = f"{settings.QDRANT_URL.rstrip('/')}/collections/{c_name}/points/search"
            payload_filter = (
                qfilter.model_dump(exclude_none=True)
                if hasattr(qfilter, "model_dump")
                else qfilter.dict(exclude_none=True)
            )
            res = httpx.post(
                url,
                json={
                    "vector": query_vector,
                    "filter": payload_filter,
                    "limit": limit,
                    "with_payload": True,
                },
                timeout=10.0,
            )
            if res.status_code == 200:
                raw_pts = res.json().get("result", [])
                out = []
                for pt in raw_pts:
                    pl = pt.get("payload") or {}
                    pl.setdefault("entity_ids", [])
                    pl.setdefault("cluster_id", None)
                    pl.setdefault("source_id", None)
                    pl.setdefault("note_id", None)
                    out.append(
                        {
                            "id": str(pt["id"]),
                            "score": float(pt["score"]),
                            "payload": pl,
                        }
                    )
                return out
        except Exception as e:
            logger.warning("Direct Qdrant search HTTP request failed: %s", e)

        query_res = client.query_points(
            collection_name=c_name,
            query=query_vector,
            query_filter=qfilter,
            limit=limit,
        )
        points_list = query_res.points
        out = []
        for r in points_list:
            pl = r.payload or {}
            pl.setdefault("entity_ids", [])
            pl.setdefault("cluster_id", None)
            pl.setdefault("source_id", None)
            pl.setdefault("note_id", None)
            out.append(
                {
                    "id": str(r.id),
                    "score": float(r.score),
                    "payload": pl,
                }
            )
        return out
    except Exception as e:
        logger.error("Vector search failed on %s: %s", c_name, e)
        raise VectorStoreUnavailableError(f"Vector search failed: {e}") from e
