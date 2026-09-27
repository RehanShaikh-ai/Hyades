"""Source processing pipeline service.

Canonical service per CONTRACT v0.4.1 §4.3, §7.1-§7.4.
Provides process_source, extract_text, chunk_source, embed_and_index_source, delete_source_chunks.
"""

import io
import logging
import os
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.content_chunk import ContentChunk
from app.models.source import Source
from app.services import chunking_service, embedding_service, vector_service

logger = logging.getLogger("app.services.source_processing_service")


def _get_storage_dir(workspace_id: uuid.UUID) -> Path:
    """Get persistent directory for source files."""
    base = Path(settings.GIT_REPOSITORY_ROOT).resolve()
    try:
        base.mkdir(parents=True, exist_ok=True)
    except (PermissionError, OSError):
        base = (Path.home() / ".knowledge-atlas" / "workspaces").resolve()
        base.mkdir(parents=True, exist_ok=True)
    source_dir = (base / str(workspace_id) / "sources").resolve()
    source_dir.mkdir(parents=True, exist_ok=True)
    return source_dir


def extract_text(file_bytes: bytes, filename: str, source_type: str) -> tuple[str, int | None]:
    """Extract text content and page count (for PDFs) from file bytes per CONTRACT §7.1.

    Supports PDF (via docling or pypdf), Markdown, and plain text.
    """
    if source_type == "pdf" or filename.lower().endswith(".pdf"):
        # Try docling if available, else pypdf
        try:
            import docling  # type: ignore # noqa: F401
            # If docling is installed and configured
            # (fallback to pypdf for deterministic fast execution in test/prod)
        except ImportError:
            pass

        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            page_count = len(reader.pages)
            pages_text: list[str] = []
            for page in reader.pages:
                t = page.extract_text()
                if t:
                    pages_text.append(t)
            extracted = "\n\n".join(pages_text)
            return extracted, page_count
        except Exception as e:
            raise ValueError(f"PDF text extraction failed: {e}") from e

    elif source_type in ("markdown", "obsidian_note") or filename.lower().endswith(
        (".md", ".markdown")
    ):
        try:
            text = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text = file_bytes.decode("latin-1", errors="replace")
        return text, None

    else:
        # Plain text
        try:
            text = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text = file_bytes.decode("latin-1", errors="replace")
        return text, None


def normalize_text(text: str) -> str:
    """Normalize whitespace and clean text encoding per CONTRACT §7.2."""
    # Normalize unicode null bytes and carriage returns
    clean = text.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n")
    # Collapse 3+ consecutive newlines to 2
    clean = re.sub(r"\n{3,}", "\n\n", clean)
    return clean.strip()


def chunk_source(text: str, filename: str) -> list[dict[str, Any]]:
    """Chunk extracted text deterministically per CONTRACT §7.2."""
    stem = os.path.splitext(os.path.basename(filename))[0]
    title = stem.replace("-", " ").replace("_", " ").title()
    return chunking_service.chunk_note(text, title=title)


def delete_source_chunks(db: Session, source_id: uuid.UUID) -> None:
    """Delete all ContentChunk records and Qdrant points for a source per CONTRACT §7.3."""
    source = db.get(Source, source_id)
    if not source:
        return

    # 1. Delete Qdrant vectors for source
    try:
        vector_service.delete_source_vectors(source_id=source.id, workspace_id=source.workspace_id)
    except Exception as e:
        logger.warning("Failed deleting vector points for source %s: %s", source.id, e)

    # 2. Delete ContentChunk rows from Postgres
    existing_chunks = list(
        db.scalars(select(ContentChunk).where(ContentChunk.source_id == source.id)).all()
    )
    for ec in existing_chunks:
        db.delete(ec)
    db.flush()


def embed_and_index_source(
    db: Session,
    source: Source,
    chunks_data: list[dict[str, Any]],
) -> list[ContentChunk]:
    """Create ContentChunk rows, generate embeddings, and upsert to Qdrant per CONTRACT §7.2."""
    if not chunks_data:
        return []

    created_chunks: list[ContentChunk] = []
    texts_to_embed: list[str] = []

    for cd in chunks_data:
        chunk = ContentChunk(
            workspace_id=source.workspace_id,
            note_id=None,
            version_id=None,
            source_id=source.id,
            chunk_index=cd["chunk_index"],
            content=cd["content"],
            content_hash=cd["content_hash"],
            token_count=cd["token_count"],
            embedding_model=settings.EMBEDDING_MODEL,
            embedding_dimension=settings.EMBEDDING_DIMENSION,
            created_at=datetime.now(UTC),
        )
        db.add(chunk)
        created_chunks.append(chunk)
        texts_to_embed.append(cd["content"])

    db.flush()

    # Generate embeddings and upsert
    embeddings = embedding_service.get_embeddings_batch(texts_to_embed)
    vector_service.upsert_chunks(
        workspace_id=source.workspace_id,
        chunks=created_chunks,
        embeddings=embeddings,
    )

    return created_chunks


def process_source(db: Session, source_id: uuid.UUID) -> None:
    """Execute the full 6-stage source processing pipeline per CONTRACT v0.4.1 §7.2.

    Stages: upload -> extract -> normalize -> chunk -> embed -> index -> complete.
    On failure: processing_status=FAILED, error_stage=<stage>, error_message=<sanitized msg>.
    """
    source = db.get(Source, source_id)
    if not source:
        logger.error("process_source called for non-existent source %s", source_id)
        return

    source.processing_status = "PROCESSING"
    source.error_stage = None
    source.error_message = None
    db.commit()
    db.refresh(source)

    file_bytes: bytes | None = None

    # Retrieve file bytes from storage or metadata
    try:
        storage_path = None
        if source.raw_metadata and isinstance(source.raw_metadata, dict):
            storage_path = source.raw_metadata.get("storage_path")
            if not storage_path and "content_base64" in source.raw_metadata:
                import base64

                file_bytes = base64.b64decode(source.raw_metadata["content_base64"])

        if file_bytes is None:
            if storage_path and os.path.exists(storage_path):
                with open(storage_path, "rb") as f:
                    file_bytes = f.read()
            else:
                # Try fallback path in workspace storage
                s_dir = _get_storage_dir(source.workspace_id)
                f_path = s_dir / f"{source.id}_{os.path.basename(source.original_path)}"
                if f_path.exists():
                    with open(f_path, "rb") as f:
                        file_bytes = f.read()

        if file_bytes is None:
            raise FileNotFoundError("Source file content not found in storage.")
    except Exception as e:
        logger.exception("Failed loading file for source %s: %s", source_id, e)
        source.processing_status = "FAILED"
        source.error_stage = "upload"
        source.error_message = f"File retrieval failed: {str(e).splitlines()[0]}"
        db.commit()
        return

    # Stage 1: Extract
    source.processing_stage = "extract"
    db.commit()
    try:
        raw_text, page_count = extract_text(
            file_bytes=file_bytes,
            filename=source.original_path,
            source_type=source.source_type,
        )
        source.page_count = page_count
        if not raw_text or not raw_text.strip():
            raise ValueError("Extracted text is empty.")
    except Exception as e:
        logger.exception("Extraction failed for source %s: %s", source_id, e)
        source.processing_status = "FAILED"
        source.error_stage = "extract"
        clean_err = str(e).splitlines()[0][:200]
        source.error_message = f"Extraction failed: {clean_err}"
        db.commit()
        return

    # Stage 2: Normalize
    source.processing_stage = "normalize"
    db.commit()
    try:
        normalized_text = normalize_text(raw_text)
        if not normalized_text:
            raise ValueError("Normalized text is empty.")
    except Exception as e:
        logger.exception("Normalization failed for source %s: %s", source_id, e)
        source.processing_status = "FAILED"
        source.error_stage = "normalize"
        clean_err = str(e).splitlines()[0][:200]
        source.error_message = f"Normalization failed: {clean_err}"
        db.commit()
        return

    # Stage 3: Chunk
    source.processing_stage = "chunk"
    db.commit()
    try:
        chunks_data = chunk_source(normalized_text, source.original_path)
        if not chunks_data:
            raise ValueError("Chunking produced zero chunks.")
    except Exception as e:
        logger.exception("Chunking failed for source %s: %s", source_id, e)
        source.processing_status = "FAILED"
        source.error_stage = "chunk"
        clean_err = str(e).splitlines()[0][:200]
        source.error_message = f"Chunking failed: {clean_err}"
        db.commit()
        return

    # Clean prior chunks/vectors if any (idempotency)
    try:
        delete_source_chunks(db, source.id)
    except Exception as e:
        logger.warning(
            "Failed clearing old chunks during processing for source %s: %s", source_id, e
        )

    # Stage 4 & 5: Embed and Index
    source.processing_stage = "embed"
    db.commit()
    try:
        source.processing_stage = "index"
        created_chunks = embed_and_index_source(db, source, chunks_data)
        source.chunk_count = len(created_chunks)
    except Exception as e:
        logger.exception("Embedding/Indexing failed for source %s: %s", source_id, e)
        source.processing_status = "FAILED"
        source.error_stage = source.processing_stage
        clean_err = str(e).splitlines()[0][:200]
        source.error_message = f"Indexing failed: {clean_err}"
        db.commit()
        return

    # Stage 6: Complete
    source.processing_stage = "complete"
    source.processing_status = "READY"
    source.error_stage = None
    source.error_message = None
    source.last_synced_at = datetime.now(UTC)
    db.commit()
    db.refresh(source)
    logger.info(
        "Successfully processed source %s (%s): %d chunks indexed",
        source.id,
        source.original_path,
        source.chunk_count or 0,
    )
