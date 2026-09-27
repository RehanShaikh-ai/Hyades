"""ContentChunk SQLAlchemy model.

Canonical model per CONTRACT v0.4.1 §4.1, §6.2.
Unifies NoteChunk and source chunks into a single content_chunks table.
Each row represents one text chunk of either a note version or an uploaded source.
The chunk's UUID (id) is also used as chunk_id in the Qdrant payload,
creating a stable join key between PostgreSQL metadata and Qdrant vectors.
"""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.note import Note
    from app.models.note_version import NoteVersion
    from app.models.source import Source
    from app.models.workspace import Workspace


class ContentChunk(Base):
    """A single text chunk of a versioned note or an uploaded source, with embedding metadata.

    Contract §6.2 fields:
        id: UUID primary key; also used as chunk_id in Qdrant payload
        workspace_id: UUID FK -> workspaces.id ON DELETE CASCADE
        note_id: UUID FK -> notes.id ON DELETE CASCADE (nullable)
        version_id: UUID FK -> note_versions.id ON DELETE CASCADE (nullable)
        source_id: UUID FK -> sources.id ON DELETE CASCADE (nullable)
        chunk_index: Integer, 0-based position
        content: Text, raw chunk text
        content_hash: String(64), SHA-256 hex digest of content
        token_count: Integer, tokens at time of chunking
        embedding_model: String(100), model identifier
        embedding_dimension: Integer, matches Qdrant collection vector dimension
        created_at: DateTime(UTC), immutable
    """

    __tablename__ = "content_chunks"
    __table_args__ = (
        Index("idx_content_chunks_note", "note_id"),
        Index("idx_content_chunks_source", "source_id"),
        Index("idx_content_chunks_workspace", "workspace_id"),
        UniqueConstraint("version_id", "chunk_index", name="uq_content_chunks_version_index"),
        UniqueConstraint("source_id", "chunk_index", name="uq_content_chunks_source_index"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    note_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notes.id", ondelete="CASCADE"),
        nullable=True,
    )
    version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("note_versions.id", ondelete="CASCADE"),
        nullable=True,
    )
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sources.id", ondelete="CASCADE"),
        nullable=True,
    )
    chunk_index: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    content_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    token_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    embedding_model: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    embedding_dimension: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    note: Mapped["Note | None"] = relationship("Note")
    version: Mapped["NoteVersion | None"] = relationship("NoteVersion", back_populates="chunks")
    source: Mapped["Source | None"] = relationship("Source")
    workspace: Mapped["Workspace"] = relationship("Workspace")
