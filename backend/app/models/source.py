"""Source SQLAlchemy model.

Canonical model per contract §5.1 (v0.2.2) and CONTRACT v0.4.1 §6.1.
Tracks import provenance, deduplication, and file-upload processing lifecycle.
"""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.dialects.sqlite import JSON as SQLITE_JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.note import Note
    from app.models.workspace import Workspace


class Source(Base):
    """Source database model.

    Contract §6.1:
        id: UUID primary key, SQLAlchemy-generated
        workspace_id: UUID foreign key -> workspaces.id with ON DELETE CASCADE
        note_id: UUID foreign key -> notes.id with ON DELETE SET NULL (nullable)
        source_type: String(30), required (markdown, text, pdf, obsidian_vault, obsidian_note)
        original_path: String(500), required
        source_identifier: String(500), required (stable dedup key - normalized original_path)
        content_hash: String(64), required (SHA-256 hex digest)
        import_batch_id: UUID, required
        import_status: String(20), required (pending, processing, completed, failed, skipped)
        raw_metadata: JSONB, nullable
        error_message: Text, nullable
        imported_at: DateTime(UTC), required
        last_synced_at: DateTime(UTC), nullable

    v0.4.1 extensions (§6.1):
        processing_stage: String(50), required
            (upload, extract, normalize, chunk, embed, index, complete)
        processing_status: String(20), required (PENDING, PROCESSING, READY, FAILED)
        file_size_bytes: BigInteger, nullable
        page_count: Integer, nullable
        chunk_count: Integer, nullable
        error_stage: String(50), nullable
    """

    __tablename__ = "sources"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "source_identifier", name="uq_sources_workspace_identifier"
        ),
        Index("idx_sources_workspace_identifier", "workspace_id", "source_identifier", unique=True),
        Index("idx_sources_workspace_batch", "workspace_id", "import_batch_id"),
        Index("idx_sources_note_id", "note_id"),
        Index("idx_source_extensions", "workspace_id", "processing_status"),
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
    note_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notes.id", ondelete="SET NULL"),
        nullable=True,
    )
    source_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )
    original_path: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )
    source_identifier: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )
    content_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    import_batch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
    )
    import_status: Mapped[str] = mapped_column(
        String(20),
        default="pending",
        nullable=False,
    )
    raw_metadata: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB().with_variant(SQLITE_JSON(), "sqlite"),
        nullable=True,
    )
    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # v0.4.1 extensions (§6.1)
    processing_stage: Mapped[str] = mapped_column(
        String(50),
        default="upload",
        nullable=False,
    )
    processing_status: Mapped[str] = mapped_column(
        String(20),
        default="PENDING",
        nullable=False,
    )
    file_size_bytes: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
    )
    page_count: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    chunk_count: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    error_stage: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    workspace: Mapped["Workspace"] = relationship("Workspace")
    note: Mapped["Note | None"] = relationship("Note", back_populates="source")
