"""NoteTag association SQLAlchemy model.

Canonical model per contract §6.2.
"""

import uuid

from sqlalchemy import ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class NoteTag(Base):
    """NoteTag association model.

    Contract §6.2:
        note_id: UUID foreign key -> notes.id with ON DELETE CASCADE
        tag_id: UUID foreign key -> tags.id with ON DELETE CASCADE
        Composite primary key: (note_id, tag_id)
    """

    __tablename__ = "note_tags"
    __table_args__ = (
        Index("idx_note_tags_tag_id", "tag_id"),
    )

    note_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    )
