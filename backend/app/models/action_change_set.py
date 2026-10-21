"""ActionChangeSet SQLAlchemy model.

Canonical model per CONTRACT v0.5.1 §6.4, §6.5.
Persists committed mutations, affected record IDs, before/after states, and undo records.
"""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.dialects.sqlite import JSON as SQLITE_JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.action_execution import ActionExecution
    from app.models.workspace import Workspace


class ActionChangeSet(Base):
    """Action change-set record tracking committed mutations and undo per Contract v0.5.1 §6.4."""

    __tablename__ = "action_change_sets"
    __table_args__ = (
        Index("idx_action_change_sets_execution", "execution_id"),
        Index("idx_action_change_sets_workspace", "workspace_id"),
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
    execution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("action_executions.id", ondelete="CASCADE"),
        nullable=False,
    )
    action_id: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    affected_item_ids: Mapped[list[str]] = mapped_column(
        JSONB().with_variant(SQLITE_JSON(), "sqlite"),
        nullable=False,
        default=list,
    )
    before_state: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB().with_variant(SQLITE_JSON(), "sqlite"),
        nullable=True,
        default=None,
    )
    after_state: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB().with_variant(SQLITE_JSON(), "sqlite"),
        nullable=True,
        default=None,
    )
    committed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )
    undo_status: Mapped[str] = mapped_column(
        String(30),
        default="not_undone",
        nullable=False,
    )
    undone_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Relationships
    execution: Mapped["ActionExecution"] = relationship(
        "ActionExecution",
        back_populates="change_sets",
    )
    workspace: Mapped["Workspace"] = relationship("Workspace")
