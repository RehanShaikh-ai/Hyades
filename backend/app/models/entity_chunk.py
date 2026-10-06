"""EntityChunk SQLAlchemy model (Provenance).

Canonical model per CONTRACT v0.3.2 §5.1, §6.3, and CONTRACT v0.4.1 §6.2.
Maps extracted entities and relationships back to the specific content chunks that originated them.
"""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.orm import relationship as sa_relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.content_chunk import ContentChunk
    from app.models.graph_entity import GraphEntity
    from app.models.graph_relationship import GraphRelationship
    from app.models.note import Note
    from app.models.workspace import Workspace


class EntityChunk(Base):
    """Provenance tracking for an extracted entity or relationship."""

    __tablename__ = "entity_chunks"
    __table_args__ = (
        UniqueConstraint("entity_id", "chunk_id", name="uq_entity_chunks_entity_chunk"),
        Index("idx_entity_chunks_entity", "entity_id"),
        Index("idx_entity_chunks_chunk", "chunk_id"),
        Index("idx_entity_chunks_note", "note_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("graph_entities.id", ondelete="CASCADE"),
        nullable=False,
    )
    chunk_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("content_chunks.id", ondelete="CASCADE"),
        nullable=False,
    )
    relationship_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("graph_relationships.id", ondelete="CASCADE"),
        nullable=True,
    )
    note_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notes.id", ondelete="CASCADE"),
        nullable=False,
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    extraction_model: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    confidence: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=1.0,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    entity: Mapped["GraphEntity"] = sa_relationship("GraphEntity", back_populates="chunks")
    chunk: Mapped["ContentChunk"] = sa_relationship("ContentChunk")
    relationship: Mapped["GraphRelationship | None"] = sa_relationship(
        "GraphRelationship", back_populates="provenance_chunks"
    )
    note: Mapped["Note"] = sa_relationship("Note")
    workspace: Mapped["Workspace"] = sa_relationship("Workspace")
