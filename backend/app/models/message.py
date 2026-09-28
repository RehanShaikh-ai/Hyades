"""Message SQLAlchemy model.

Canonical model per CONTRACT v0.4.1 §4.1, §6.4.
Stores individual chat messages for conversations.
"""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.conversation import Conversation
    from app.models.message_citation import MessageCitation
    from app.models.workspace import Workspace


class Message(Base):
    """Message database model.

    Contract §6.4:
        id: UUID primary key, SQLAlchemy-generated
        conversation_id: UUID FK -> conversations.id ON DELETE CASCADE
        workspace_id: UUID denormalized; FK -> workspaces.id ON DELETE CASCADE
        role: String(20), required ("user" or "assistant")
        content: Text, required
        provider: String(50), nullable (assistant messages only)
        model: String(100), nullable (assistant messages only)
        latency_ms: Integer, nullable (assistant messages only)
        created_at: DateTime(UTC), immutable
    """

    __tablename__ = "messages"
    __table_args__ = (Index("idx_messages_conversation", "conversation_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    provider: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )
    model: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )
    latency_ms: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="messages")
    workspace: Mapped["Workspace"] = relationship("Workspace")
    citations: Mapped[list["MessageCitation"]] = relationship(
        "MessageCitation",
        back_populates="message",
        cascade="all, delete-orphan",
        order_by="MessageCitation.rank",
        passive_deletes=True,
    )
