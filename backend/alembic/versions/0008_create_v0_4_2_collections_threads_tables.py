"""create v0.4.2 collections, threads, saved views, and inbox tables

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-06 06:00:00.000000

CONTRACT_v0.4.2.md §7:
- Add `extract_knowledge` to notes
- Add `extract_knowledge` and `mime_type` to sources
- Make `entity_chunks.note_id` nullable and add `entity_chunks.source_id` FK
- Create `collections` table and membership tables (`collection_notes`, `collection_sources`, `collection_entities`, `collection_conversations`)
- Create `threads` table and membership tables (`thread_notes`, `thread_sources`, `thread_entities`, `thread_conversations`)
- Create `thread_questions` and `thread_discoveries`
- Create `saved_views` table
- Create `inbox_items` table
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql, sqlite

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Extend notes table
    op.add_column(
        "notes",
        sa.Column(
            "extract_knowledge",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )

    # 2. Extend sources table
    op.add_column(
        "sources",
        sa.Column(
            "extract_knowledge",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "sources",
        sa.Column("mime_type", sa.String(length=100), nullable=True),
    )

    # 3. Extend entity_chunks table
    op.alter_column(
        "entity_chunks",
        "note_id",
        existing_type=sa.UUID(),
        nullable=True,
    )
    op.add_column(
        "entity_chunks",
        sa.Column("source_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_entity_chunks_source_id",
        "entity_chunks",
        "sources",
        ["source_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "idx_entity_chunks_source",
        "entity_chunks",
        ["source_id"],
        unique=False,
    )

    # 4. Create collections table
    op.create_table(
        "collections",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icon", sa.String(length=32), nullable=True),
        sa.Column("created_by", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "name", name="uq_collections_workspace_name"),
    )
    op.create_index(
        "idx_collections_workspace_updated",
        "collections",
        ["workspace_id", "updated_at"],
        unique=False,
    )

    # Collection memberships
    op.create_table(
        "collection_notes",
        sa.Column("collection_id", sa.UUID(), nullable=False),
        sa.Column("note_id", sa.UUID(), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["collection_id"], ["collections.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("collection_id", "note_id"),
    )
    op.create_index("idx_collection_notes_note_id", "collection_notes", ["note_id"])

    op.create_table(
        "collection_sources",
        sa.Column("collection_id", sa.UUID(), nullable=False),
        sa.Column("source_id", sa.UUID(), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["collection_id"], ["collections.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("collection_id", "source_id"),
    )
    op.create_index("idx_collection_sources_source_id", "collection_sources", ["source_id"])

    op.create_table(
        "collection_entities",
        sa.Column("collection_id", sa.UUID(), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["collection_id"], ["collections.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["entity_id"], ["graph_entities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("collection_id", "entity_id"),
    )
    op.create_index("idx_collection_entities_entity_id", "collection_entities", ["entity_id"])

    op.create_table(
        "collection_conversations",
        sa.Column("collection_id", sa.UUID(), nullable=False),
        sa.Column("conversation_id", sa.UUID(), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["collection_id"], ["collections.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("collection_id", "conversation_id"),
    )
    op.create_index("idx_collection_conversations_conversation_id", "collection_conversations", ["conversation_id"])

    # 5. Create threads table
    op.create_table(
        "threads",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("question", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="active", nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_threads_workspace_status_updated",
        "threads",
        ["workspace_id", "status", "updated_at"],
        unique=False,
    )

    # Thread memberships
    op.create_table(
        "thread_notes",
        sa.Column("thread_id", sa.UUID(), nullable=False),
        sa.Column("note_id", sa.UUID(), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["thread_id"], ["threads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("thread_id", "note_id"),
    )
    op.create_index("idx_thread_notes_note_id", "thread_notes", ["note_id"])

    op.create_table(
        "thread_sources",
        sa.Column("thread_id", sa.UUID(), nullable=False),
        sa.Column("source_id", sa.UUID(), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["thread_id"], ["threads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("thread_id", "source_id"),
    )
    op.create_index("idx_thread_sources_source_id", "thread_sources", ["source_id"])

    op.create_table(
        "thread_entities",
        sa.Column("thread_id", sa.UUID(), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["thread_id"], ["threads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["entity_id"], ["graph_entities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("thread_id", "entity_id"),
    )
    op.create_index("idx_thread_entities_entity_id", "thread_entities", ["entity_id"])

    op.create_table(
        "thread_conversations",
        sa.Column("thread_id", sa.UUID(), nullable=False),
        sa.Column("conversation_id", sa.UUID(), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["thread_id"], ["threads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("thread_id", "conversation_id"),
    )
    op.create_index("idx_thread_conversations_conversation_id", "thread_conversations", ["conversation_id"])

    # 6. Thread questions and discoveries
    op.create_table(
        "thread_questions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("thread_id", sa.UUID(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("is_resolved", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["thread_id"], ["threads.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_thread_questions_thread_id", "thread_questions", ["thread_id"])

    op.create_table(
        "thread_discoveries",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("thread_id", sa.UUID(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["thread_id"], ["threads.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_thread_discoveries_thread_id", "thread_discoveries", ["thread_id"])

    # 7. Saved views
    json_type = postgresql.JSONB(astext_type=sa.Text()).with_variant(sqlite.JSON(), "sqlite")
    op.create_table(
        "saved_views",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("state", json_type, nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "name", name="uq_saved_views_workspace_name"),
    )
    op.create_index("idx_saved_views_workspace", "saved_views", ["workspace_id"])

    # 8. Inbox items
    op.create_table(
        "inbox_items",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("source_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("detection_status", sa.String(length=20), server_default="queued", nullable=False),
        sa.Column("detected_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("detected_entities", json_type, nullable=True),
        sa.Column("detection_truncated", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("extraction_job_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_id", name="uq_inbox_items_source_id"),
    )
    op.create_index("idx_inbox_items_workspace_status", "inbox_items", ["workspace_id", "status"])


def downgrade() -> None:
    """Reversible downgrade per CONTRACT v0.4.2 §7.4.

    Note: Downgrade deletes source-derived `entity_chunks` rows before restoring `note_id NOT NULL`.
    """
    op.drop_index("idx_inbox_items_workspace_status", table_name="inbox_items")
    op.drop_table("inbox_items")

    op.drop_index("idx_saved_views_workspace", table_name="saved_views")
    op.drop_table("saved_views")

    op.drop_index("idx_thread_discoveries_thread_id", table_name="thread_discoveries")
    op.drop_table("thread_discoveries")

    op.drop_index("idx_thread_questions_thread_id", table_name="thread_questions")
    op.drop_table("thread_questions")

    op.drop_index("idx_thread_conversations_conversation_id", table_name="thread_conversations")
    op.drop_table("thread_conversations")

    op.drop_index("idx_thread_entities_entity_id", table_name="thread_entities")
    op.drop_table("thread_entities")

    op.drop_index("idx_thread_sources_source_id", table_name="thread_sources")
    op.drop_table("thread_sources")

    op.drop_index("idx_thread_notes_note_id", table_name="thread_notes")
    op.drop_table("thread_notes")

    op.drop_index("idx_threads_workspace_status_updated", table_name="threads")
    op.drop_table("threads")

    op.drop_index("idx_collection_conversations_conversation_id", table_name="collection_conversations")
    op.drop_table("collection_conversations")

    op.drop_index("idx_collection_entities_entity_id", table_name="collection_entities")
    op.drop_table("collection_entities")

    op.drop_index("idx_collection_sources_source_id", table_name="collection_sources")
    op.drop_table("collection_sources")

    op.drop_index("idx_collection_notes_note_id", table_name="collection_notes")
    op.drop_table("collection_notes")

    op.drop_index("idx_collections_workspace_updated", table_name="collections")
    op.drop_table("collections")

    # Delete source-derived entity_chunks before restoring NOT NULL on note_id
    op.execute("DELETE FROM entity_chunks WHERE note_id IS NULL")

    op.drop_constraint("fk_entity_chunks_source_id", "entity_chunks", type_="foreignkey")
    op.drop_index("idx_entity_chunks_source", table_name="entity_chunks")
    op.drop_column("entity_chunks", "source_id")
    op.alter_column("entity_chunks", "note_id", existing_type=sa.UUID(), nullable=False)

    op.drop_column("sources", "mime_type")
    op.drop_column("sources", "extract_knowledge")
    op.drop_column("notes", "extract_knowledge")
