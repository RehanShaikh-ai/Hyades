"""ActionProposal SQLAlchemy model.

Canonical model per CONTRACT v0.5.1 §4.1, §6.2.
Stores proposed changes for review, two-phase writes, and server-side confirmation tokens.
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


class ActionProposal(Base):
    """Action proposal awaiting confirmation per Contract v0.5.1 §4.1, §6.2."""

    __tablename__ = "action_proposals"
    __table_args__ = (
        Index("idx_action_proposals_execution", "execution_id"),
        Index("idx_action_proposals_token_hash", "confirmation_token_hash"),
        Index("idx_action_proposals_workspace_status", "workspace_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    execution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("action_executions.id", ondelete="CASCADE"),
        nullable=False,
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
    proposal_payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB().with_variant(SQLITE_JSON(), "sqlite"),
        nullable=False,
        default=dict,
    )
    confirmation_token_hash: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(30),
        default="pending",
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
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    committed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    rejected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Relationships
    execution: Mapped["ActionExecution"] = relationship(
        "ActionExecution",
        back_populates="proposals",
    )
    workspace: Mapped["Workspace"] = relationship("Workspace")
