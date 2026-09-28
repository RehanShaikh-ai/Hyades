"""SourceNoteLink SQLAlchemy model.

Canonical model per CONTRACT v0.4.1 §4.1, §6.6.
Manages many-to-many associations between sources and notes.
"""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.note import Note
    from app.models.source import Source


class SourceNoteLink(Base):
    """Many-to-many link between sources and notes.

    Contract §6.6:
        source_id: UUID FK -> sources.id ON DELETE CASCADE
        note_id: UUID FK -> notes.id ON DELETE CASCADE
        created_at: DateTime(UTC), immutable
        Composite PK: (source_id, note_id)
    """

    __tablename__ = "source_note_links"
    __table_args__ = (
        Index("idx_source_note_links_source", "source_id"),
        Index("idx_source_note_links_note", "note_id"),
    )

    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sources.id", ondelete="CASCADE"),
        primary_key=True,
    )
    note_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    source: Mapped["Source"] = relationship("Source")
    note: Mapped["Note"] = relationship("Note")
