"""Conversation SQLAlchemy model.

Canonical model per CONTRACT v0.4.1 §4.1, §6.3.
Stores persistent assistant conversation threads scoped to workspaces.
"""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.message import Message
    from app.models.workspace import Workspace


class Conversation(Base):
    """Conversation database model.

    Contract §6.3:
        id: UUID primary key, SQLAlchemy-generated
        workspace_id: UUID FK -> workspaces.id ON DELETE CASCADE
        title: String(200), nullable until first user message is sent
        created_at: DateTime(UTC), immutable
        updated_at: DateTime(UTC), updated on every new message
    """

    __tablename__ = "conversations"
    __table_args__ = (Index("idx_conversations_workspace", "workspace_id", "updated_at"),)

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
    title: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
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

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace")
    messages: Mapped[list["Message"]] = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
        passive_deletes=True,
    )
