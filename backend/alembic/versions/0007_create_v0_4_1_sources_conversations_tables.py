"""Create v0.4.1 sources extensions, content_chunks, conversations, messages,
citations, and source_note_links tables.

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-27

Contract references:
    CONTRACT_v0.4.1.md:
    §6.1  — sources extensions: processing_stage, processing_status, file_size_bytes,
            page_count, chunk_count, error_stage, idx_source_extensions
    §6.2  — content_chunks model: replaces note_chunks, data migration,
            FK behavior, unique constraints
    §6.3  — conversations model: fields, FK behavior, idx_conversations_workspace
    §6.4  — messages model: fields, FK behavior, idx_messages_conversation
    §6.5  — message_citations model: fields, FK behavior, idx_message_citations_message
    §6.6  — source_note_links model: composite PK, FK behavior, required indexes
    §6.7  — Required indexes
    §6.8  — Migration requirements: data migration from note_chunks to content_chunks,
            update entity_chunks FK, drop note_chunks, fully reversible
"""

import uuid

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Apply v0.4.1 schema changes."""
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    # ── 1. sources extensions (§6.1) ──────────────────────────────────────────
    op.add_column(
        "sources",
        sa.Column(
            "processing_stage",
            sa.String(length=50),
            server_default="upload",
            nullable=False,
        ),
    )
    op.add_column(
        "sources",
        sa.Column(
            "processing_status",
            sa.String(length=20),
            server_default="PENDING",
            nullable=False,
        ),
    )
    op.add_column(
        "sources",
        sa.Column(
            "file_size_bytes",
            sa.BigInteger(),
            nullable=True,
        ),
    )
    op.add_column(
        "sources",
        sa.Column(
            "page_count",
            sa.Integer(),
            nullable=True,
        ),
    )
    op.add_column(
        "sources",
        sa.Column(
            "chunk_count",
            sa.Integer(),
            nullable=True,
        ),
    )
    op.add_column(
        "sources",
        sa.Column(
            "error_stage",
            sa.String(length=50),
            nullable=True,
        ),
    )
    op.create_index(
        "idx_source_extensions",
        "sources",
        ["workspace_id", "processing_status"],
    )

    # ── 2. content_chunks (§6.2) ─────────────────────────────────────────────
    op.create_table(
        "content_chunks",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            default=uuid.uuid4,
            nullable=False,
        ),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "note_id",
            UUID(as_uuid=True),
            sa.ForeignKey("notes.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "version_id",
            UUID(as_uuid=True),
            sa.ForeignKey("note_versions.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "source_id",
            UUID(as_uuid=True),
            sa.ForeignKey("sources.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=False),
        sa.Column("embedding_model", sa.String(length=100), nullable=False),
        sa.Column("embedding_dimension", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("version_id", "chunk_index", name="uq_content_chunks_version_index"),
        sa.UniqueConstraint("source_id", "chunk_index", name="uq_content_chunks_source_index"),
    )

    op.create_index(
        "idx_content_chunks_note",
        "content_chunks",
        ["note_id"],
    )
    op.create_index(
        "idx_content_chunks_source",
        "content_chunks",
        ["source_id"],
    )
    op.create_index(
        "idx_content_chunks_workspace",
        "content_chunks",
        ["workspace_id"],
    )

    # ── 3. Data migration: note_chunks -> content_chunks (§6.8) ──────────────
    op.execute(
        """
        INSERT INTO content_chunks (
            id, workspace_id, note_id, version_id, source_id,
            chunk_index, content, content_hash, token_count,
            embedding_model, embedding_dimension, created_at
        )
        SELECT
            id, workspace_id, note_id, version_id, NULL,
            chunk_index, content, content_hash, token_count,
            embedding_model, embedding_dimension, created_at
        FROM note_chunks
        """
    )

    # ── 4. Update entity_chunks FK to content_chunks (§6.8) ───────────────────
    if not is_sqlite:
        op.drop_constraint("entity_chunks_chunk_id_fkey", "entity_chunks", type_="foreignkey")
        op.create_foreign_key(
            "entity_chunks_chunk_id_fkey",
            "entity_chunks",
            "content_chunks",
            ["chunk_id"],
            ["id"],
            ondelete="CASCADE",
        )

    # ── 5. Drop note_chunks (§6.8) ────────────────────────────────────────────
    op.drop_index("idx_note_chunks_note_id", table_name="note_chunks")
    op.drop_index("idx_note_chunks_version_id", table_name="note_chunks")
    op.drop_table("note_chunks")

    # ── 6. conversations (§6.3) ──────────────────────────────────────────────
    op.create_table(
        "conversations",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            default=uuid.uuid4,
            nullable=False,
        ),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "title",
            sa.String(length=200),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_conversations_workspace",
        "conversations",
        ["workspace_id", "updated_at"],
    )

    # ── 7. messages (§6.4) ───────────────────────────────────────────────────
    op.create_table(
        "messages",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            default=uuid.uuid4,
            nullable=False,
        ),
        sa.Column(
            "conversation_id",
            UUID(as_uuid=True),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "role",
            sa.String(length=20),
            nullable=False,
        ),
        sa.Column(
            "content",
            sa.Text(),
            nullable=False,
        ),
        sa.Column(
            "provider",
            sa.String(length=50),
            nullable=True,
        ),
        sa.Column(
            "model",
            sa.String(length=100),
            nullable=True,
        ),
        sa.Column(
            "latency_ms",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_messages_conversation",
        "messages",
        ["conversation_id", "created_at"],
    )

    # ── 8. message_citations (§6.5) ──────────────────────────────────────────
    op.create_table(
        "message_citations",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            default=uuid.uuid4,
            nullable=False,
        ),
        sa.Column(
            "message_id",
            UUID(as_uuid=True),
            sa.ForeignKey("messages.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "chunk_id",
            UUID(as_uuid=True),
            sa.ForeignKey("content_chunks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "note_id",
            UUID(as_uuid=True),
            sa.ForeignKey("notes.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "source_id",
            UUID(as_uuid=True),
            sa.ForeignKey("sources.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "similarity_score",
            sa.Float(),
            nullable=False,
        ),
        sa.Column(
            "rank",
            sa.Integer(),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_message_citations_message",
        "message_citations",
        ["message_id"],
    )

    # ── 9. source_note_links (§6.6) ──────────────────────────────────────────
    op.create_table(
        "source_note_links",
        sa.Column(
            "source_id",
            UUID(as_uuid=True),
            sa.ForeignKey("sources.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "note_id",
            UUID(as_uuid=True),
            sa.ForeignKey("notes.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_source_note_links_source",
        "source_note_links",
        ["source_id"],
    )
    op.create_index(
        "idx_source_note_links_note",
        "source_note_links",
        ["note_id"],
    )


def downgrade() -> None:
    """Revert v0.4.1 schema changes."""
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    # Drop source_note_links
    op.drop_index("idx_source_note_links_note", table_name="source_note_links")
    op.drop_index("idx_source_note_links_source", table_name="source_note_links")
    op.drop_table("source_note_links")

    # Drop message_citations
    op.drop_index("idx_message_citations_message", table_name="message_citations")
    op.drop_table("message_citations")

    # Drop messages
    op.drop_index("idx_messages_conversation", table_name="messages")
    op.drop_table("messages")

    # Drop conversations
    op.drop_index("idx_conversations_workspace", table_name="conversations")
    op.drop_table("conversations")

    # Recreate note_chunks table
    op.create_table(
        "note_chunks",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            default=uuid.uuid4,
            nullable=False,
        ),
        sa.Column(
            "note_id",
            UUID(as_uuid=True),
            sa.ForeignKey("notes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "version_id",
            UUID(as_uuid=True),
            sa.ForeignKey("note_versions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=False),
        sa.Column("embedding_model", sa.String(length=100), nullable=False),
        sa.Column("embedding_dimension", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("version_id", "chunk_index", name="uq_note_chunks_version_index"),
    )
    op.create_index(
        "idx_note_chunks_version_id",
        "note_chunks",
        ["version_id"],
    )
    op.create_index(
        "idx_note_chunks_note_id",
        "note_chunks",
        ["note_id"],
    )

    # Migrate note chunks data back
    op.execute(
        """
        INSERT INTO note_chunks (
            id, workspace_id, note_id, version_id,
            chunk_index, content, content_hash, token_count,
            embedding_model, embedding_dimension, created_at
        )
        SELECT
            id, workspace_id, note_id, version_id,
            chunk_index, content, content_hash, token_count,
            embedding_model, embedding_dimension, created_at
        FROM content_chunks
        WHERE version_id IS NOT NULL AND note_id IS NOT NULL
        """
    )

    # Update entity_chunks FK back to note_chunks
    if not is_sqlite:
        op.drop_constraint("entity_chunks_chunk_id_fkey", "entity_chunks", type_="foreignkey")
        op.create_foreign_key(
            "entity_chunks_chunk_id_fkey",
            "entity_chunks",
            "note_chunks",
            ["chunk_id"],
            ["id"],
            ondelete="CASCADE",
        )

    # Drop content_chunks
    op.drop_index("idx_content_chunks_workspace", table_name="content_chunks")
    op.drop_index("idx_content_chunks_source", table_name="content_chunks")
    op.drop_index("idx_content_chunks_note", table_name="content_chunks")
    op.drop_table("content_chunks")

    # Drop sources extensions
    op.drop_index("idx_source_extensions", table_name="sources")
    op.drop_column("sources", "error_stage")
    op.drop_column("sources", "chunk_count")
    op.drop_column("sources", "page_count")
    op.drop_column("sources", "file_size_bytes")
    op.drop_column("sources", "processing_status")
    op.drop_column("sources", "processing_stage")
