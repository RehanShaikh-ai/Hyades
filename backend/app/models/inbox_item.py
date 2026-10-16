"""InboxItem SQLAlchemy model.

Canonical model per CONTRACT v0.4.2 §5.1, §7.1.
Tracks uploaded sources through dry-run concept detection and user review lifecycle.
"""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.dialects.sqlite import JSON as SQLITE_JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.index_job import IndexJob
    from app.models.source import Source
    from app.models.workspace import Workspace


class InboxItem(Base):
    """Inbox review item for an uploaded source per Contract v0.4.2 §7.1."""

    __tablename__ = "inbox_items"
    __table_args__ = (
        UniqueConstraint("source_id", name="uq_inbox_items_source_id"),
        Index("idx_inbox_items_workspace_status", "workspace_id", "status"),
        Index("idx_inbox_items_source", "source_id"),
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
    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sources.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="pending",
        nullable=False,
    )
    detection_status: Mapped[str] = mapped_column(
        String(20),
        default="pending",
        nullable=False,
    )
    detected_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    detected_entities: Mapped[list[Any]] = mapped_column(
        JSONB().with_variant(SQLITE_JSON(), "sqlite"),
        default=list,
        nullable=False,
    )
    detection_truncated: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    extraction_job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("index_jobs.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )
    decided_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    workspace: Mapped["Workspace"] = relationship("Workspace")
    source: Mapped["Source"] = relationship("Source")
    extraction_job: Mapped["IndexJob | None"] = relationship("IndexJob")
