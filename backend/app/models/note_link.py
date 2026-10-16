"""NoteLink SQLAlchemy model.

Canonical model per contract §7.1.
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


class NoteLink(Base):
    """NoteLink database model.

    Contract §7.1:
        source_note_id: UUID foreign key -> notes.id with ON DELETE CASCADE
        target_note_id: UUID foreign key -> notes.id with ON DELETE CASCADE
        created_at: DateTime(UTC), set on creation, immutable
        Composite primary key: (source_note_id, target_note_id)
    """

    __tablename__ = "note_links"
    __table_args__ = (
        Index("idx_note_links_target", "target_note_id"),
    )

    source_note_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    target_note_id: Mapped[uuid.UUID] = mapped_column(
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

    source_note: Mapped["Note"] = relationship(
        "Note",
        foreign_keys=[source_note_id],
        back_populates="outgoing_links",
    )
    target_note: Mapped["Note"] = relationship(
        "Note",
        foreign_keys=[target_note_id],
        back_populates="incoming_links",
    )
