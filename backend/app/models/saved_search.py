"""SavedSearch SQLAlchemy model.

Canonical model per CONTRACT v0.3.1 §5.1, §6.4.

Stores a user's named search query with its mode for quick re-execution.
"""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Index, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.workspace import Workspace


class SavedSearch(Base):
    """A named, saved search query belonging to a workspace.

    Contract §6.4 fields:
        id: UUID primary key (SQLAlchemy-generated)
        workspace_id: FK → workspaces.id ON DELETE CASCADE
        name: String(150), display name
        query: String(500), saved query text
        search_mode: String(20) — "semantic", "lexical", or "hybrid"
        created_at: DateTime(UTC), immutable
    """

    __tablename__ = "saved_searches"
    __table_args__ = (
        Index("idx_saved_searches_workspace", "workspace_id"),
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
    # Display name shown in the SavedSearchList component (§5.7).
    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )
    # The query text that will be re-submitted when the saved search is run.
    query: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )
    # One of the three search modes defined in §9.1.
    search_mode: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace")
