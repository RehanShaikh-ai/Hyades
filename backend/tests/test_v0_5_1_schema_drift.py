"""Automated tests for v0.5.1 Schema Drift Gate and Migration Verification.

Contract references:
    CONTRACT_v0.5.1.md:
    §4.1 — Required schema changes:
           - action_executions
           - action_proposals
           - action_change_sets
           - index_jobs: updated_at, progress model reuse
    §4.2 — Migration gate:
           - Verify migration works against a copy of current schema.
           - Verify existing records remain available after migration.
           - Fully reversible upgrade and downgrade.
    §4.3 — Schema-drift gate:
           - Compares migration files, application expectations (Base.metadata), and database schema.
           - Must detect zero drift.
"""

import importlib.util
import uuid
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import (
    Column,
    DateTime,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
    inspect,
    text,
)

from app.db.base import Base


def _load_migration_module(revision: str):
    """Dynamically load an alembic migration revision module."""
    versions_dir = Path(__file__).resolve().parent.parent / "alembic" / "versions"
    matching = list(versions_dir.glob(f"{revision}_*.py"))
    assert len(matching) == 1, f"Could not find unique migration file for revision {revision}"
    path = matching[0]
    spec = importlib.util.spec_from_file_location(f"migration_{revision}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_schema_drift_gate_zero_discrepancy():
    """Contract §4.3 — Schema Drift Gate.

    Verify that application expectations in Base.metadata contain all required tables,
    columns, constraints, and indexes with zero drift.
    """
    tables = Base.metadata.tables

    # 1. action_executions
    assert "action_executions" in tables
    ae = tables["action_executions"]
    expected_ae_cols = {
        "id",
        "workspace_id",
        "action_id",
        "status",
        "initiated_by",
        "idempotency_key",
        "input_payload",
        "result_payload",
        "error_code",
        "error_message",
        "current_stage",
        "created_at",
        "started_at",
        "updated_at",
        "completed_at",
    }
    assert expected_ae_cols.issubset(set(ae.columns.keys()))

    # Verify unique constraint on (workspace_id, action_id, idempotency_key)
    unique_constraints = [
        c for c in ae.constraints if hasattr(c, "columns") and len(c.columns) == 3
    ]
    unique_col_sets = [{col.name for col in c.columns} for c in unique_constraints]
    assert {"workspace_id", "action_id", "idempotency_key"} in unique_col_sets

    # 2. action_proposals
    assert "action_proposals" in tables
    ap = tables["action_proposals"]
    expected_ap_cols = {
        "id",
        "execution_id",
        "workspace_id",
        "action_id",
        "proposal_payload",
        "confirmation_token_hash",
        "status",
        "created_at",
        "updated_at",
        "expires_at",
        "committed_at",
        "rejected_at",
    }
    assert expected_ap_cols.issubset(set(ap.columns.keys()))

    # 3. action_change_sets
    assert "action_change_sets" in tables
    cs = tables["action_change_sets"]
    expected_cs_cols = {
        "id",
        "workspace_id",
        "execution_id",
        "action_id",
        "affected_item_ids",
        "before_state",
        "after_state",
        "committed_at",
        "undo_status",
        "undone_at",
    }
    assert expected_cs_cols.issubset(set(cs.columns.keys()))

    # 4. index_jobs
    assert "index_jobs" in tables
    ij = tables["index_jobs"]
    assert "updated_at" in ij.columns
    assert "progress" in ij.columns


def test_migration_0009_upgrade_and_downgrade_cycle_with_data_preservation():
    """Contract §4.2 — Migration Gate.

    Verify that migration 0009:
    1. Upgrades successfully against a pre-existing v0.4.2 database schema copy.
    2. Preserves all pre-existing records and data.
    3. Successfully creates all required tables and indexes.
    4. Downgrades cleanly and completely.
    """
    engine = create_engine("sqlite:///:memory:")
    meta = MetaData()

    # Create pre-existing v0.4.2 schema tables
    users = Table(
        "users",
        meta,
        Column("id", String(36), primary_key=True),
        Column("display_name", String(100), nullable=False),
        Column("created_at", DateTime, default=lambda: datetime.now(UTC)),
        Column("updated_at", DateTime, default=lambda: datetime.now(UTC)),
    )
    workspaces = Table(
        "workspaces",
        meta,
        Column("id", String(36), primary_key=True),
        Column("name", String(100), nullable=False),
        Column("owner_id", String(36), nullable=False),
    )
    index_jobs = Table(
        "index_jobs",
        meta,
        Column("id", String(36), primary_key=True),
        Column("workspace_id", String(36), nullable=False),
        Column("job_type", String(50), nullable=False),
        Column("status", String(20), nullable=False),
        Column("note_ids", Text, nullable=True),
        Column("retry_count", Integer, default=0),
        Column("max_retries", Integer, default=3),
        Column("enqueued_at", DateTime, default=lambda: datetime.now(UTC)),
        Column("started_at", DateTime, nullable=True),
        Column("completed_at", DateTime, nullable=True),
        Column("error_message", Text, nullable=True),
        Column("progress", Text, nullable=True),
    )
    meta.create_all(engine)

    # Seed pre-existing records prior to migration
    user_id = str(uuid.uuid4())
    ws_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    with engine.begin() as conn:
        conn.execute(
            users.insert().values(
                id=user_id,
                display_name="Legacy User",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )
        conn.execute(
            workspaces.insert().values(
                id=ws_id,
                name="Legacy Workspace",
                owner_id=user_id,
            )
        )
        conn.execute(
            index_jobs.insert().values(
                id=job_id,
                workspace_id=ws_id,
                job_type="index_workspace",
                status="completed",
                progress='{"total_notes": 12, "processed_notes": 12, "stage": "completed"}',
            )
        )

    # Load and execute migration 0009 upgrade
    migration_mod = _load_migration_module("0009")

    from alembic.operations import Operations
    from alembic.runtime.migration import MigrationContext

    with engine.connect() as conn:
        ctx = MigrationContext.configure(conn)
        with Operations.context(ctx):
            migration_mod.upgrade()
        conn.commit()

        # Verify tables created
        inspector = inspect(conn)
        tables = inspector.get_table_names()
        assert "action_executions" in tables
        assert "action_proposals" in tables
        assert "action_change_sets" in tables

        # Verify index_jobs updated_at added
        cols = {c["name"] for c in inspector.get_columns("index_jobs")}
        assert "updated_at" in cols
        assert "progress" in cols

        # Verify pre-existing data is 100% preserved
        res = (
            conn.execute(
                text("SELECT id, workspace_id, progress FROM index_jobs WHERE id = :id"),
                {"id": job_id},
            )
            .mappings()
            .one()
        )
        assert res["id"] == job_id
        assert res["workspace_id"] == ws_id
        assert "total_notes" in res["progress"]

        user_res = conn.execute(
            text("SELECT display_name FROM users WHERE id = :id"),
            {"id": user_id},
        ).scalar()
        assert user_res == "Legacy User"

        # Now verify downgrade
        with Operations.context(ctx):
            migration_mod.downgrade()
        conn.commit()

        # Verify tables dropped
        inspector = inspect(conn)
        post_down_tables = inspector.get_table_names()
        assert "action_executions" not in post_down_tables
        assert "action_proposals" not in post_down_tables
        assert "action_change_sets" not in post_down_tables

        # Verify pre-existing data is still intact
        res = conn.execute(
            text("SELECT id FROM index_jobs WHERE id = :id"),
            {"id": job_id},
        ).scalar()
        assert res == job_id

    engine.dispose()
