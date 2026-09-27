"""MessageCitation SQLAlchemy model.

Canonical model per CONTRACT v0.4.1 §4.1, §6.5.
Stores citations linked to assistant messages pointing to retrieved ContentChunks.
"""

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Float, ForeignKey, Index, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.content_chunk import ContentChunk
    from app.models.message import Message
    from app.models.note import Note
    from app.models.source import Source


class MessageCitation(Base):
    """MessageCitation database model.

    Contract §6.5:
        id: UUID primary key, SQLAlchemy-generated
        message_id: UUID FK -> messages.id ON DELETE CASCADE
        chunk_id: UUID FK -> content_chunks.id ON DELETE CASCADE
        note_id: UUID FK -> notes.id ON DELETE SET NULL (nullable)
        source_id: UUID FK -> sources.id ON DELETE SET NULL (nullable)
        workspace_id: UUID denormalized
        similarity_score: Float (0.0 - 1.0), retrieval similarity (never confidence)
        rank: Integer, 1-indexed retrieval position
    """

    __tablename__ = "message_citations"
    __table_args__ = (Index("idx_message_citations_message", "message_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("messages.id", ondelete="CASCADE"),
        nullable=False,
    )
    chunk_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("content_chunks.id", ondelete="CASCADE"),
        nullable=False,
    )
    note_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notes.id", ondelete="SET NULL"),
        nullable=True,
    )
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sources.id", ondelete="SET NULL"),
        nullable=True,
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
    )
    similarity_score: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )
    rank: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    # Relationships
    message: Mapped["Message"] = relationship("Message", back_populates="citations")
    chunk: Mapped["ContentChunk"] = relationship("ContentChunk")
    note: Mapped["Note | None"] = relationship("Note")
    source: Mapped["Source | None"] = relationship("Source")
