"""Collection and typed membership SQLAlchemy models.

Canonical models per CONTRACT v0.4.2 §5.1, §7.1.
Supports grouping notes, sources, entities, and conversations within a workspace.
"""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
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


class Collection(Base):
    """Collection model grouping knowledge items per Contract v0.4.2 §7.1."""

    __tablename__ = "collections"
    __table_args__ = (
        UniqueConstraint("workspace_id", "name", name="uq_collections_workspace_name"),
        Index("idx_collections_workspace_updated", "workspace_id", "updated_at"),
        Index("idx_collections_workspace", "workspace_id"),
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
        String(150),
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    icon: Mapped[str | None] = mapped_column(
        String(32),
        nullable=True,
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

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace")
    creator: Mapped["User"] = relationship("User")

    notes: Mapped[list["CollectionNote"]] = relationship(
        "CollectionNote",
        back_populates="collection",
        cascade="all, delete-orphan",
    )
    sources: Mapped[list["CollectionSource"]] = relationship(
        "CollectionSource",
        back_populates="collection",
        cascade="all, delete-orphan",
    )
    entities: Mapped[list["CollectionEntity"]] = relationship(
        "CollectionEntity",
        back_populates="collection",
        cascade="all, delete-orphan",
    )
    conversations: Mapped[list["CollectionConversation"]] = relationship(
        "CollectionConversation",
        back_populates="collection",
        cascade="all, delete-orphan",
    )


class CollectionNote(Base):
    """Many-to-many membership between Collection and Note."""

    __tablename__ = "collection_notes"
    __table_args__ = (
        Index("idx_collection_notes_note", "note_id"),
    )

    collection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("collections.id", ondelete="CASCADE"),
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

    collection: Mapped["Collection"] = relationship("Collection", back_populates="notes")
    note: Mapped["Note"] = relationship("Note")


class CollectionSource(Base):
    """Many-to-many membership between Collection and Source."""

    __tablename__ = "collection_sources"
    __table_args__ = (
        Index("idx_collection_sources_source", "source_id"),
    )

    collection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("collections.id", ondelete="CASCADE"),
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

    collection: Mapped["Collection"] = relationship("Collection", back_populates="sources")
    source: Mapped["Source"] = relationship("Source")


class CollectionEntity(Base):
    """Many-to-many membership between Collection and GraphEntity."""

    __tablename__ = "collection_entities"
    __table_args__ = (
        Index("idx_collection_entities_entity", "entity_id"),
    )

    collection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("collections.id", ondelete="CASCADE"),
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

    collection: Mapped["Collection"] = relationship("Collection", back_populates="entities")
    entity: Mapped["GraphEntity"] = relationship("GraphEntity")


class CollectionConversation(Base):
    """Many-to-many membership between Collection and Conversation."""

    __tablename__ = "collection_conversations"
    __table_args__ = (
        Index("idx_collection_conversations_conversation", "conversation_id"),
    )

    collection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("collections.id", ondelete="CASCADE"),
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

    collection: Mapped["Collection"] = relationship("Collection", back_populates="conversations")
    conversation: Mapped["Conversation"] = relationship("Conversation")
