"""IndexJob SQLAlchemy model.

Canonical model per CONTRACT v0.3.1 §5.1, §6.3.

Tracks the lifecycle of an ARQ background indexing job.
The job id doubles as the ARQ job key (§12.1).
"""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.dialects.sqlite import JSON as SQLITE_JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.workspace import Workspace


class IndexJob(Base):
    """ARQ indexing job state, persisted in PostgreSQL.

    Contract §6.3 fields:
        id: UUID primary key; also the ARQ job key
        workspace_id: FK → workspaces.id ON DELETE CASCADE
        job_type: String(50) — "index_workspace" or "index_note"
        status: String(20) — "queued", "running", "completed", "failed"
        note_ids: JSONB, optional list of specific note UUIDs; null = full workspace reindex
        retry_count: Integer, default 0
        max_retries: Integer, from JOB_MAX_RETRIES env var
        enqueued_at: DateTime(UTC), immutable
        started_at: DateTime(UTC), set when job begins
        completed_at: DateTime(UTC), set on completion or terminal failure
        error_message: Text, sanitized — no internal paths or stack traces (§12.4)

    Valid status transitions:
        queued → running → completed
        queued → running → failed
        failed → queued  (retry, if retry_count < max_retries)
    """

    __tablename__ = "index_jobs"
    __table_args__ = (Index("idx_index_jobs_workspace_status", "workspace_id", "status"),)

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
    # "index_workspace" for full-workspace reindex; "index_note" for targeted reindex.
    job_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    # Job lifecycle status — see valid transitions above.
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="queued",
    )
    # Optional list of note UUIDs to index. Null means reindex the entire workspace.
    note_ids: Mapped[list[str] | None] = mapped_column(
        JSONB().with_variant(SQLITE_JSON(), "sqlite"),
        nullable=True,
        default=None,
    )
    retry_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    max_retries: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=3,
    )
    enqueued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )
    # Set to current time when worker picks up the job.
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    # Set to current time on terminal state (completed or failed after max retries).
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    # Sanitized error description — internal paths and stack traces must never
    # be written here (§12.4, §14 error contract).
    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    progress: Mapped[dict | None] = mapped_column(
        JSONB().with_variant(SQLITE_JSON(), "sqlite"),
        nullable=True,
        default=None,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace")
