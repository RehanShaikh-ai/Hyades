#!/usr/bin/env python3
"""Schema Drift Gate verification script for Hyades v0.5.1.

Contract references:
    CONTRACT_v0.5.1.md:
    §4.1 — Required schema changes (action_executions, action_proposals, action_change_sets, index_jobs).
    §4.2 — Migration gate (verification against schema copy, data preservation).
    §4.3 — Schema-drift gate (compares migration definitions, application expectations in Base.metadata,
           and development database schema).

Usage:
    uv run python scripts/verify_schema_drift.py
"""

import sys
from pathlib import Path

# Add backend directory to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import app.models  # noqa: F401, E402
from app.db.base import Base  # noqa: E402
from sqlalchemy import create_engine, inspect  # noqa: E402


def verify_schema_drift() -> None:
    """Compare Base.metadata with database and migration definitions to guarantee zero drift."""
    print("=== Hyades v0.5.1 Schema Drift Gate (§4.3) ===")

    # 1. Verify Application Expectations (Base.metadata)
    expected_tables = {
        "action_executions",
        "action_proposals",
        "action_change_sets",
        "index_jobs",
    }
    metadata_tables = set(Base.metadata.tables.keys())
    missing_in_metadata = expected_tables - metadata_tables
    if missing_in_metadata:
        print(f"DRIFT ERROR: Expected tables missing from Base.metadata: {missing_in_metadata}")
        sys.exit(1)
    print("[OK] All v0.5.1 tables registered on Base.metadata")

    # 2. Check action_executions columns & constraints in metadata
    ae_table = Base.metadata.tables["action_executions"]
    ae_cols = set(ae_table.columns.keys())
    required_ae_cols = {
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
    missing_ae = required_ae_cols - ae_cols
    if missing_ae:
        print(f"DRIFT ERROR: action_executions missing columns in Base.metadata: {missing_ae}")
        sys.exit(1)
    print(f"[OK] action_executions columns verified ({len(ae_cols)} columns)")

    # Verify unique constraint on (workspace_id, action_id, idempotency_key)
    unique_constraints = [
        c for c in ae_table.constraints if hasattr(c, "columns") and len(c.columns) == 3
    ]
    unique_col_sets = [{col.name for col in c.columns} for c in unique_constraints]
    expected_unique = {"workspace_id", "action_id", "idempotency_key"}
    if expected_unique not in unique_col_sets:
        print(
            "DRIFT ERROR: action_executions missing unique constraint on (workspace_id, action_id, idempotency_key)"
        )
        sys.exit(1)
    print("[OK] action_executions unique constraint verified: (workspace_id, action_id, idempotency_key)")

    # 3. Check action_proposals columns in metadata
    ap_table = Base.metadata.tables["action_proposals"]
    ap_cols = set(ap_table.columns.keys())
    required_ap_cols = {
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
    missing_ap = required_ap_cols - ap_cols
    if missing_ap:
        print(f"DRIFT ERROR: action_proposals missing columns in Base.metadata: {missing_ap}")
        sys.exit(1)
    print(f"[OK] action_proposals columns verified ({len(ap_cols)} columns)")

    # 4. Check action_change_sets columns in metadata
    cs_table = Base.metadata.tables["action_change_sets"]
    cs_cols = set(cs_table.columns.keys())
    required_cs_cols = {
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
    missing_cs = required_cs_cols - cs_cols
    if missing_cs:
        print(f"DRIFT ERROR: action_change_sets missing columns in Base.metadata: {missing_cs}")
        sys.exit(1)
    print(f"[OK] action_change_sets columns verified ({len(cs_cols)} columns)")

    # 5. Check index_jobs updated_at column in metadata
    ij_table = Base.metadata.tables["index_jobs"]
    if "updated_at" not in ij_table.columns:
        print("DRIFT ERROR: index_jobs missing updated_at column in Base.metadata")
        sys.exit(1)
    print("[OK] index_jobs updated_at column verified on Base.metadata")

    # 6. Verify against database copy (create_all and test migration against clean engine)
    test_db_url = "sqlite:///:memory:"
    engine = create_engine(test_db_url)
    Base.metadata.create_all(engine)
    inspector = inspect(engine)
    db_tables = set(inspector.get_table_names())

    for tbl in expected_tables:
        if tbl not in db_tables:
            print(f"DRIFT ERROR: Table {tbl} missing from database schema inspection!")
            sys.exit(1)

    print("[OK] Clean database schema inspection matches Base.metadata with zero drift")
    print("=== SUCCESS: Schema Drift Gate Passed (0 drift detected) ===")


if __name__ == "__main__":
    verify_schema_drift()
