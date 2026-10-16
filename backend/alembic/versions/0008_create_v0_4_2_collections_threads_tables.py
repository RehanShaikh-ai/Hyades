"""Create v0.4.2 collections, threads, saved_views, inbox_items tables and model extensions.

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-16

Contract references:
    CONTRACT_v0.4.2.md:
    §7.1 — New Tables:
           - collections, collection_notes, collection_sources, collection_entities, collection_conversations
           - threads, thread_notes, thread_sources, thread_entities, thread_conversations
           - thread_questions, thread_discoveries
           - saved_views
           - inbox_items
    §7.2 — Existing Table Changes:
           - notes: extract_knowledge (boolean default true)
           - sources: extract_knowledge (boolean default true), mime_type (varchar(100) nullable)
           - entity_chunks: note_id nullable, source_id UUID nullable with FK to sources(id) ON DELETE CASCADE,
             check constraint ck_entity_chunks_single_parent
    §7.3 — Required Indexes
    §7.4 — Migration Requirements (reversible, clean upgrade, seeded upgrade)
"""

import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply v0.4.2 schema changes."""
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"
    json_type = sa.JSON() if is_sqlite else JSONB()

    # 1. collections
    op.create_table(
        "collections",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icon", sa.String(length=32), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("workspace_id", "name", name="uq_collections_workspace_name"),
    )
    op.create_index("idx_collections_workspace", "collections", ["workspace_id"])
    op.create_index("idx_collections_workspace_updated", "collections", ["workspace_id", "updated_at"])

    # 2. collection memberships
    op.create_table(
        "collection_notes",
        sa.Column("collection_id", UUID(as_uuid=True), sa.ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("note_id", UUID(as_uuid=True), sa.ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_collection_notes_note", "collection_notes", ["note_id"])

    op.create_table(
        "collection_sources",
        sa.Column("collection_id", UUID(as_uuid=True), sa.ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("source_id", UUID(as_uuid=True), sa.ForeignKey("sources.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_collection_sources_source", "collection_sources", ["source_id"])

    op.create_table(
        "collection_entities",
        sa.Column("collection_id", UUID(as_uuid=True), sa.ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("graph_entities.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_collection_entities_entity", "collection_entities", ["entity_id"])

    op.create_table(
        "collection_conversations",
        sa.Column("collection_id", UUID(as_uuid=True), sa.ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("conversation_id", UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_collection_conversations_conversation", "collection_conversations", ["conversation_id"])

    # 3. threads
    op.create_table(
        "threads",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("question", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="active", nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_threads_workspace_status", "threads", ["workspace_id", "status"])
    op.create_index("idx_threads_workspace_updated", "threads", ["workspace_id", "updated_at"])

    # 4. thread memberships
    op.create_table(
        "thread_notes",
        sa.Column("thread_id", UUID(as_uuid=True), sa.ForeignKey("threads.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("note_id", UUID(as_uuid=True), sa.ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_thread_notes_note", "thread_notes", ["note_id"])

    op.create_table(
        "thread_sources",
        sa.Column("thread_id", UUID(as_uuid=True), sa.ForeignKey("threads.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("source_id", UUID(as_uuid=True), sa.ForeignKey("sources.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_thread_sources_source", "thread_sources", ["source_id"])

    op.create_table(
        "thread_entities",
        sa.Column("thread_id", UUID(as_uuid=True), sa.ForeignKey("threads.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("graph_entities.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_thread_entities_entity", "thread_entities", ["entity_id"])

    op.create_table(
        "thread_conversations",
        sa.Column("thread_id", UUID(as_uuid=True), sa.ForeignKey("threads.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("conversation_id", UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_thread_conversations_conversation", "thread_conversations", ["conversation_id"])

    # 5. thread questions & discoveries
    op.create_table(
        "thread_questions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False),
        sa.Column("thread_id", UUID(as_uuid=True), sa.ForeignKey("threads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("is_resolved", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_thread_questions_thread", "thread_questions", ["thread_id"])

    op.create_table(
        "thread_discoveries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False),
        sa.Column("thread_id", UUID(as_uuid=True), sa.ForeignKey("threads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_thread_discoveries_thread", "thread_discoveries", ["thread_id"])

    # 6. saved_views
    op.create_table(
        "saved_views",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("state", json_type, nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("workspace_id", "name", name="uq_saved_views_workspace_name"),
    )
    op.create_index("idx_saved_views_workspace", "saved_views", ["workspace_id"])

    # 7. inbox_items
    op.create_table(
        "inbox_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_id", UUID(as_uuid=True), sa.ForeignKey("sources.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("detection_status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("detected_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("detected_entities", json_type, server_default=sa.text("'[]'::jsonb" if not is_sqlite else "'[]'"), nullable=False),
        sa.Column("detection_truncated", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("extraction_job_id", UUID(as_uuid=True), sa.ForeignKey("index_jobs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("source_id", name="uq_inbox_items_source_id"),
    )
    op.create_index("idx_inbox_items_source", "inbox_items", ["source_id"])
    op.create_index("idx_inbox_items_workspace_status", "inbox_items", ["workspace_id", "status"])

    # 8. notes extensions (§7.2)
    op.add_column(
        "notes",
        sa.Column("extract_knowledge", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )

    # 9. sources extensions (§7.2)
    op.add_column(
        "sources",
        sa.Column("extract_knowledge", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )
    op.add_column(
        "sources",
        sa.Column("mime_type", sa.String(length=100), nullable=True),
    )
    op.create_unique_constraint("uq_sources_workspace_identifier", "sources", ["workspace_id", "source_identifier"])

    # 10. entity_chunks extensions (§7.2)
    if is_sqlite:
        with op.batch_alter_table("entity_chunks") as batch_op:
            batch_op.alter_column("note_id", nullable=True)
            batch_op.add_column(sa.Column("source_id", UUID(as_uuid=True), sa.ForeignKey("sources.id", ondelete="CASCADE"), nullable=True))
            batch_op.create_index("idx_entity_chunks_source", ["source_id"])
            batch_op.create_check_constraint(
                "ck_entity_chunks_single_parent",
                "(note_id IS NOT NULL AND source_id IS NULL) OR (note_id IS NULL AND source_id IS NOT NULL)",
            )
    else:
        op.alter_column("entity_chunks", "note_id", nullable=True)
        op.add_column(
            "entity_chunks",
            sa.Column("source_id", UUID(as_uuid=True), sa.ForeignKey("sources.id", ondelete="CASCADE"), nullable=True),
        )
        op.create_index("idx_entity_chunks_source", "entity_chunks", ["source_id"])
        op.create_check_constraint(
            "ck_entity_chunks_single_parent",
            "entity_chunks",
            "(note_id IS NOT NULL AND source_id IS NULL) OR (note_id IS NULL AND source_id IS NOT NULL)",
        )


def downgrade() -> None:
    """Revert v0.4.2 schema changes.

    Data Loss Warning (§7.4):
        Downgrade will permanently delete source-derived entity_chunks (where source_id IS NOT NULL)
        prior to restoring note_id NOT NULL constraint.
    """
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    # 1. entity_chunks revert
    if is_sqlite:
        # SQLite: delete source-derived rows first
        bind.execute(sa.text("DELETE FROM entity_chunks WHERE source_id IS NOT NULL"))
        with op.batch_alter_table("entity_chunks") as batch_op:
            batch_op.drop_constraint("ck_entity_chunks_single_parent", type_="check")
            batch_op.drop_index("idx_entity_chunks_source")
            batch_op.drop_column("source_id")
            batch_op.alter_column("note_id", nullable=False)
    else:
        op.drop_constraint("ck_entity_chunks_single_parent", "entity_chunks", type_="check")
        op.drop_index("idx_entity_chunks_source", table_name="entity_chunks")
        # §7.4: Delete source-derived rows before restoring note_id NOT NULL
        bind.execute(sa.text("DELETE FROM entity_chunks WHERE source_id IS NOT NULL"))
        op.drop_column("entity_chunks", "source_id")
        op.alter_column("entity_chunks", "note_id", nullable=False)

    # 2. sources extensions revert
    op.drop_constraint("uq_sources_workspace_identifier", "sources", type_="unique")
    op.drop_column("sources", "mime_type")
    op.drop_column("sources", "extract_knowledge")

    # 3. notes extensions revert
    op.drop_column("notes", "extract_knowledge")

    # 4. drop new tables
    op.drop_index("idx_inbox_items_workspace_status", table_name="inbox_items")
    op.drop_index("idx_inbox_items_source", table_name="inbox_items")
    op.drop_table("inbox_items")

    op.drop_index("idx_saved_views_workspace", table_name="saved_views")
    op.drop_table("saved_views")

    op.drop_index("idx_thread_discoveries_thread", table_name="thread_discoveries")
    op.drop_table("thread_discoveries")

    op.drop_index("idx_thread_questions_thread", table_name="thread_questions")
    op.drop_table("thread_questions")

    op.drop_index("idx_thread_conversations_conversation", table_name="thread_conversations")
    op.drop_table("thread_conversations")

    op.drop_index("idx_thread_entities_entity", table_name="thread_entities")
    op.drop_table("thread_entities")

    op.drop_index("idx_thread_sources_source", table_name="thread_sources")
    op.drop_table("thread_sources")

    op.drop_index("idx_thread_notes_note", table_name="thread_notes")
    op.drop_table("thread_notes")

    op.drop_index("idx_threads_workspace_updated", table_name="threads")
    op.drop_index("idx_threads_workspace_status", table_name="threads")
    op.drop_table("threads")

    op.drop_index("idx_collection_conversations_conversation", table_name="collection_conversations")
    op.drop_table("collection_conversations")

    op.drop_index("idx_collection_entities_entity", table_name="collection_entities")
    op.drop_table("collection_entities")

    op.drop_index("idx_collection_sources_source", table_name="collection_sources")
    op.drop_table("collection_sources")

    op.drop_index("idx_collection_notes_note", table_name="collection_notes")
    op.drop_table("collection_notes")

    op.drop_index("idx_collections_workspace_updated", table_name="collections")
    op.drop_index("idx_collections_workspace", table_name="collections")
    op.drop_table("collections")
