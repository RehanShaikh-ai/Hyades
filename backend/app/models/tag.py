"""Tag SQLAlchemy model.

Canonical model per contract §6.1.
"""

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.note import Note
    from app.models.workspace import Workspace


class Tag(Base):
    """Tag database model.

    Contract §6.1:
        id: UUID primary key (SQLAlchemy-generated)
        workspace_id: UUID foreign key -> workspaces.id with ON DELETE CASCADE
        name: String(50), required (lowercase, trimmed, no whitespace)
        Unique constraint on (workspace_id, name)
    """

    __tablename__ = "tags"
    __table_args__ = (
        UniqueConstraint("workspace_id", "name", name="uq_tags_workspace_name"),
        Index("idx_tags_workspace_name", "workspace_id", "name", unique=True),
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
    name: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    workspace: Mapped["Workspace"] = relationship("Workspace")
    notes: Mapped[list["Note"]] = relationship(
        "Note",
        secondary="note_tags",
        back_populates="tags",
    )
