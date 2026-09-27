"""NoteVersion SQLAlchemy model.

Canonical model per CONTRACT v0.3.1 §5.1, §6.1, and CONTRACT v0.4.1 §6.2.

Each row represents a single Git snapshot of a note's content.
The commit_hash links this record to the Git object in the repository.
"""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.content_chunk import ContentChunk
    from app.models.note import Note
    from app.models.user import User
    from app.models.workspace import Workspace


class NoteVersion(Base):
    """Git-backed snapshot of a note at a specific commit.

    Contract §6.1 fields:
        id: UUID primary key (SQLAlchemy-generated)
        note_id: FK → notes.id ON DELETE CASCADE
        workspace_id: UUID, denormalized; FK → workspaces.id ON DELETE CASCADE
        commit_hash: String(40) — Git SHA-1 of the snapshot commit
        author_id: FK → users.id ON DELETE RESTRICT
        message: String(500), optional commit message
        is_ai_edit: Boolean — True for AI-originated commits (§11.4)
        created_at: DateTime(UTC), immutable

    Constraint: unique on (note_id, commit_hash).
    """

    __tablename__ = "note_versions"
    __table_args__ = (
        UniqueConstraint("note_id", "commit_hash", name="uq_note_versions_note_commit"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
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
    # Git SHA-1 is always exactly 40 hex characters.
    commit_hash: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    # Optional human-readable commit message (e.g. "Saved from editor").
    message: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )
    # True when the snapshot was created via the AI-edit approval flow (§11.4).
    # False for all human-originated saves.
    is_ai_edit: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    note: Mapped["Note"] = relationship("Note")
    workspace: Mapped["Workspace"] = relationship("Workspace")
    author: Mapped["User"] = relationship("User")
    chunks: Mapped[list["ContentChunk"]] = relationship(
        "ContentChunk",
        back_populates="version",
        passive_deletes=True,
    )
