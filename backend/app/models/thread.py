"""Thread models per CONTRACT v0.4.2 §5.1, §7.1.

Models:
- Thread
- ThreadNote
- ThreadSource
- ThreadEntity
- ThreadConversation
- ThreadQuestion
- ThreadDiscovery
"""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.conversation import Conversation
    from app.models.graph_entity import GraphEntity
    from app.models.note import Note
    from app.models.source import Source
    from app.models.user import User
    from app.models.workspace import Workspace


class Thread(Base):
    """Thread database model per CONTRACT v0.4.2 §7.1."""

    __tablename__ = "threads"
    __table_args__ = (
        Index("idx_threads_workspace_status_updated", "workspace_id", "status", "updated_at"),
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
    title: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )
    question: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="active",
        nullable=False,
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
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

    workspace: Mapped["Workspace"] = relationship("Workspace")
    creator: Mapped["User"] = relationship("User")

    thread_notes: Mapped[list["ThreadNote"]] = relationship(
        "ThreadNote", back_populates="thread", cascade="all, delete-orphan"
    )
    thread_sources: Mapped[list["ThreadSource"]] = relationship(
        "ThreadSource", back_populates="thread", cascade="all, delete-orphan"
    )
    thread_entities: Mapped[list["ThreadEntity"]] = relationship(
        "ThreadEntity", back_populates="thread", cascade="all, delete-orphan"
    )
    thread_conversations: Mapped[list["ThreadConversation"]] = relationship(
        "ThreadConversation", back_populates="thread", cascade="all, delete-orphan"
    )
    questions: Mapped[list["ThreadQuestion"]] = relationship(
        "ThreadQuestion", back_populates="thread", cascade="all, delete-orphan"
    )
    discoveries: Mapped[list["ThreadDiscovery"]] = relationship(
        "ThreadDiscovery", back_populates="thread", cascade="all, delete-orphan"
    )


class ThreadNote(Base):
    """Thread Note membership."""

    __tablename__ = "thread_notes"
    __table_args__ = (Index("idx_thread_notes_note_id", "note_id"),)

    thread_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("threads.id", ondelete="CASCADE"),
        primary_key=True,
    )
    note_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )

    thread: Mapped["Thread"] = relationship("Thread", back_populates="thread_notes")
    note: Mapped["Note"] = relationship("Note")


class ThreadSource(Base):
    """Thread Source membership."""

    __tablename__ = "thread_sources"
    __table_args__ = (Index("idx_thread_sources_source_id", "source_id"),)

    thread_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("threads.id", ondelete="CASCADE"),
        primary_key=True,
    )
    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sources.id", ondelete="CASCADE"),
        primary_key=True,
    )
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )

    thread: Mapped["Thread"] = relationship("Thread", back_populates="thread_sources")
    source: Mapped["Source"] = relationship("Source")


class ThreadEntity(Base):
    """Thread Entity membership."""

    __tablename__ = "thread_entities"
    __table_args__ = (Index("idx_thread_entities_entity_id", "entity_id"),)

    thread_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("threads.id", ondelete="CASCADE"),
        primary_key=True,
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("graph_entities.id", ondelete="CASCADE"),
        primary_key=True,
    )
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )

    thread: Mapped["Thread"] = relationship("Thread", back_populates="thread_entities")
    entity: Mapped["GraphEntity"] = relationship("GraphEntity")


class ThreadConversation(Base):
    """Thread Conversation membership."""

    __tablename__ = "thread_conversations"
    __table_args__ = (Index("idx_thread_conversations_conversation_id", "conversation_id"),)

    thread_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("threads.id", ondelete="CASCADE"),
        primary_key=True,
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )

    thread: Mapped["Thread"] = relationship("Thread", back_populates="thread_conversations")
    conversation: Mapped["Conversation"] = relationship("Conversation")


class ThreadQuestion(Base):
    """Thread Question per CONTRACT v0.4.2 §7.1."""

    __tablename__ = "thread_questions"
    __table_args__ = (Index("idx_thread_questions_thread_id", "thread_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    thread_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("threads.id", ondelete="CASCADE"),
        nullable=False,
    )
    text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    is_resolved: Mapped[bool] = mapped_column(
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
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    thread: Mapped["Thread"] = relationship("Thread", back_populates="questions")


class ThreadDiscovery(Base):
    """Thread Discovery per CONTRACT v0.4.2 §7.1."""

    __tablename__ = "thread_discoveries"
    __table_args__ = (Index("idx_thread_discoveries_thread_id", "thread_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    thread_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("threads.id", ondelete="CASCADE"),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )

    thread: Mapped["Thread"] = relationship("Thread", back_populates="discoveries")
