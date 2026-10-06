"""Note SQLAlchemy model.

Canonical model per contract §5.1.
"""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, DateTime, FetchedValue, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID
from sqlalchemy.dialects.sqlite import JSON as SQLITE_JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.note_link import NoteLink
    from app.models.source import Source
    from app.models.tag import Tag
    from app.models.user import User
    from app.models.workspace import Workspace


class Note(Base):
    """Note database model.

    Contract §5.1:
        id: UUID primary key (SQLAlchemy-generated)
        workspace_id: UUID foreign key -> workspaces.id with ON DELETE CASCADE
        created_by: UUID foreign key -> users.id with ON DELETE RESTRICT
        title: String(255), required
        content: Text, required (raw Markdown source)
        created_at: DateTime(UTC), immutable
        updated_at: DateTime(UTC), updated on edit
        is_pinned: Boolean, default False
        is_archived: Boolean, default False
    """

    __tablename__ = "notes"

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
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(
        Text,
        default="",
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )
    is_pinned: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    is_archived: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    search_vector: Mapped[str | None] = mapped_column(
        TSVECTOR().with_variant(Text(), "sqlite"),
        server_default=FetchedValue(),
        nullable=True,
    )
    # Contract §6.2 (v0.2.2): nullable JSONB column for frontmatter mirrored from
    # the linked Source.raw_metadata. NULL for manually created notes.
    # NOTE: "metadata" is reserved by SQLAlchemy's Declarative API so we use
    # the Python attribute name "metadata_" mapped to the DB column "metadata".
    metadata_: Mapped[dict[str, Any] | None] = mapped_column(
        "metadata",
        JSONB().with_variant(SQLITE_JSON(), "sqlite"),
        nullable=True,
        default=None,
    )

    workspace: Mapped["Workspace"] = relationship("Workspace")
    creator: Mapped["User"] = relationship("User")
    tags: Mapped[list["Tag"]] = relationship(
        "Tag",
        secondary="note_tags",
        back_populates="notes",
    )
    outgoing_links: Mapped[list["NoteLink"]] = relationship(
        "NoteLink",
        foreign_keys="NoteLink.source_note_id",
        back_populates="source_note",
        passive_deletes=True,
    )
    incoming_links: Mapped[list["NoteLink"]] = relationship(
        "NoteLink",
        foreign_keys="NoteLink.target_note_id",
        back_populates="target_note",
        passive_deletes=True,
    )
    source: Mapped["Source | None"] = relationship(
        "Source",
        back_populates="note",
        uselist=False,
    )
