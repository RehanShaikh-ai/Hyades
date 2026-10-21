"""Create v0.5.1 action_executions, action_proposals, action_change_sets tables and index_jobs extensions.

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-21

Contract references:
    CONTRACT_v0.5.1.md:
    §4.1  — Required schema changes:
            - action_executions: id, workspace_id, action_id, status, initiated_by,
              idempotency_key, input_payload, result_payload, error_code, error_message,
              current_stage, created_at, started_at, updated_at, completed_at.
              Unique constraint: (workspace_id, action_id, idempotency_key).
            - action_proposals: id, execution_id, workspace_id, action_id, proposal_payload,
              confirmation_token_hash, status, created_at, updated_at, expires_at,
              committed_at, rejected_at.
            - action_change_sets: id, workspace_id, execution_id, action_id, affected_item_ids,
              before_state, after_state, committed_at, undo_status, undone_at.
            - index_jobs: updated_at added, reuses existing progress JSONB field for
              total_items, completed_items, failed_items, current_stage.
    §4.2  — Migration Gate (reversible, verified against copy of current schema, data preserved).
    §4.3  — Drift Gate (migrations, Base.metadata, and DB must agree).
    §6.1  — Execution statuses.
    §6.2  — Two-phase writes and confirmation tokens.
    §6.4  — Change sets and undo state tracking.
    §10.1 — Progress reporting model.
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Apply v0.5.1 schema additions."""
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"
    json_type = sa.JSON() if is_sqlite else JSONB()
    now_func = sa.text("CURRENT_TIMESTAMP") if is_sqlite else sa.text("now()")

    # ── 1. action_executions (§4.1, §6.1, §6.7) ──────────────────────────────
    op.create_table(
        "action_executions",
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
        sa.Column("action_id", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=30), server_default="pending", nullable=False),
        sa.Column("initiated_by", sa.String(length=20), server_default="user", nullable=False),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("input_payload", json_type, nullable=False),
        sa.Column("result_payload", json_type, nullable=True),
        sa.Column("error_code", sa.String(length=100), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("current_stage", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=now_func,
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=now_func,
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "workspace_id",
            "action_id",
            "idempotency_key",
            name="uq_action_executions_workspace_action_idempotency",
        ),
    )
    op.create_index(
        "idx_action_executions_workspace_status",
        "action_executions",
        ["workspace_id", "status"],
    )
    op.create_index(
        "idx_action_executions_workspace_created",
        "action_executions",
        ["workspace_id", "created_at"],
    )

    # ── 2. action_proposals (§4.1, §6.2) ─────────────────────────────────────
    op.create_table(
        "action_proposals",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            default=uuid.uuid4,
            nullable=False,
        ),
        sa.Column(
            "execution_id",
            UUID(as_uuid=True),
            sa.ForeignKey("action_executions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("action_id", sa.String(length=100), nullable=False),
        sa.Column("proposal_payload", json_type, nullable=False),
        sa.Column("confirmation_token_hash", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=30), server_default="pending", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=now_func,
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=now_func,
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("committed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "idx_action_proposals_execution",
        "action_proposals",
        ["execution_id"],
    )
    op.create_index(
        "idx_action_proposals_token_hash",
        "action_proposals",
        ["confirmation_token_hash"],
    )
    op.create_index(
        "idx_action_proposals_workspace_status",
        "action_proposals",
        ["workspace_id", "status"],
    )

    # ── 3. action_change_sets (§6.4, §6.5) ───────────────────────────────────
    op.create_table(
        "action_change_sets",
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
            "execution_id",
            UUID(as_uuid=True),
            sa.ForeignKey("action_executions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("action_id", sa.String(length=100), nullable=False),
        sa.Column("affected_item_ids", json_type, nullable=False),
        sa.Column("before_state", json_type, nullable=True),
        sa.Column("after_state", json_type, nullable=True),
        sa.Column(
            "committed_at",
            sa.DateTime(timezone=True),
            server_default=now_func,
            nullable=False,
        ),
        sa.Column("undo_status", sa.String(length=30), server_default="not_undone", nullable=False),
        sa.Column("undone_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "idx_action_change_sets_execution",
        "action_change_sets",
        ["execution_id"],
    )
    op.create_index(
        "idx_action_change_sets_workspace",
        "action_change_sets",
        ["workspace_id"],
    )

    # ── 4. index_jobs extensions (§4.1, §10.1) ────────────────────────────────
    # Add updated_at column to index_jobs. Existing progress column is reused.
    with op.batch_alter_table("index_jobs") as batch_op:
        batch_op.add_column(
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=now_func,
                nullable=False,
            )
        )


def downgrade() -> None:
    """Revert v0.5.1 schema additions."""
    # 1. Drop updated_at from index_jobs
    with op.batch_alter_table("index_jobs") as batch_op:
        batch_op.drop_column("updated_at")

    # 2. Drop action_change_sets
    op.drop_index("idx_action_change_sets_workspace", table_name="action_change_sets")
    op.drop_index("idx_action_change_sets_execution", table_name="action_change_sets")
    op.drop_table("action_change_sets")

    # 3. Drop action_proposals
    op.drop_index("idx_action_proposals_workspace_status", table_name="action_proposals")
    op.drop_index("idx_action_proposals_token_hash", table_name="action_proposals")
    op.drop_index("idx_action_proposals_execution", table_name="action_proposals")
    op.drop_table("action_proposals")

    # 4. Drop action_executions
    op.drop_index("idx_action_executions_workspace_created", table_name="action_executions")
    op.drop_index("idx_action_executions_workspace_status", table_name="action_executions")
    op.drop_table("action_executions")
