"""ActionExecution SQLAlchemy model.

Canonical model per CONTRACT v0.5.1 §4.1, §6.1, §6.7.
Tracks the lifecycle, idempotency, input/result payloads, and status of action executions.
"""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.dialects.sqlite import JSON as SQLITE_JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.action_change_set import ActionChangeSet
    from app.models.action_proposal import ActionProposal
    from app.models.workspace import Workspace


class ActionExecution(Base):
    """Action execution record tracking lifecycle and idempotency per Contract v0.5.1 §4.1."""

    __tablename__ = "action_executions"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "action_id",
            "idempotency_key",
            name="uq_action_executions_workspace_action_idempotency",
        ),
        Index("idx_action_executions_workspace_status", "workspace_id", "status"),
        Index("idx_action_executions_workspace_created", "workspace_id", "created_at"),
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
    action_id: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(30),
        default="pending",
        nullable=False,
    )
    initiated_by: Mapped[str] = mapped_column(
        String(20),
        default="user",
        nullable=False,
    )
    idempotency_key: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    input_payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB().with_variant(SQLITE_JSON(), "sqlite"),
        nullable=False,
        default=dict,
    )
    result_payload: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB().with_variant(SQLITE_JSON(), "sqlite"),
        nullable=True,
        default=None,
    )
    error_code: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )
    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    current_stage: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace")
    proposals: Mapped[list["ActionProposal"]] = relationship(
        "ActionProposal",
        back_populates="execution",
        cascade="all, delete-orphan",
    )
    change_sets: Mapped[list["ActionChangeSet"]] = relationship(
        "ActionChangeSet",
        back_populates="execution",
        cascade="all, delete-orphan",
    )
