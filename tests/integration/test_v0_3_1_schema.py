"""Integration tests: v0.3.1 Alembic migration and schema validation.

Contract references (CONTRACT_v0.3.1.md):
    §6.1  — note_versions columns, FKs, unique constraint
    §6.2  — note_chunks columns, FKs, unique constraint, chunk_id == Qdrant point id
    §6.3  — index_jobs columns, JSONB note_ids, workspace FK cascade
    §6.4  — saved_searches columns, workspace FK cascade
    §6.5  — Migration is additive (no existing table modified) and reversible
    §6.6  — Five required BTree indexes
    §11.4 — is_ai_edit flag stored correctly
    §17.3 — Integration steps 1-2, 13

Uses Testcontainers (PostgreSQL 16) — same pattern as test_migrations_and_schema.py.
"""

import json
import os
import sys
import uuid

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from alembic import command as alembic_command  # noqa: E402
from alembic.config import Config  # noqa: E402

try:
    from testcontainers.community.postgres import PostgresContainer  # noqa: E402
except ImportError:
    from testcontainers.postgres import PostgresContainer  # noqa: E402


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_alembic_cfg(db_url: str) -> Config:
    try:
        from app.core.config import settings

        object.__setattr__(settings, "DATABASE_URL", db_url)
    except Exception:
        os.environ["DATABASE_URL"] = db_url
    alembic_ini = os.path.join(BACKEND_DIR, "alembic.ini")
    cfg = Config(alembic_ini)
    cfg.set_main_option("sqlalchemy.url", db_url)
    return cfg


def _upgrade(db_url: str, target: str = "0004") -> None:
    alembic_command.upgrade(_make_alembic_cfg(db_url), target)


def _downgrade(db_url: str, target: str) -> None:
    alembic_command.downgrade(_make_alembic_cfg(db_url), target)


def _seed(conn, user_id, workspace_id, note_id) -> None:
    """Insert user + workspace + note to satisfy FK constraints."""
    conn.execute(
        text(
            "INSERT INTO users (id, display_name, created_at, updated_at) "
            "VALUES (:id, 'Tester', now(), now()) ON CONFLICT DO NOTHING"
        ),
        {"id": str(user_id)},
    )
    conn.execute(
        text(
            "INSERT INTO workspaces (id, name, owner_id, created_at, updated_at) "
            "VALUES (:id, 'WS', :owner, now(), now()) ON CONFLICT DO NOTHING"
        ),
        {"id": str(workspace_id), "owner": str(user_id)},
    )
    conn.execute(
        text(
            "INSERT INTO notes (id, workspace_id, created_by, title, content, "
            "created_at, updated_at) "
            "VALUES (:id, :ws, :u, 'Note', 'body', now(), now()) ON CONFLICT DO NOTHING"
        ),
        {"id": str(note_id), "ws": str(workspace_id), "u": str(user_id)},
    )


def _insert_version(conn, vid, note_id, ws_id, user_id, commit_hash: str) -> None:
    conn.execute(
        text(
            "INSERT INTO note_versions "
            "(id, note_id, workspace_id, commit_hash, author_id, is_ai_edit, created_at) "
            "VALUES (:id, :n, :w, :c, :a, false, now())"
        ),
        {"id": str(vid), "n": str(note_id), "w": str(ws_id), "c": commit_hash, "a": str(user_id)},
    )


def _insert_chunk(conn, cid, note_id, ver_id, ws_id, idx: int) -> None:
    conn.execute(
        text(
            "INSERT INTO note_chunks "
            "(id, note_id, version_id, workspace_id, chunk_index, content, "
            "content_hash, token_count, embedding_model, embedding_dimension, created_at) "
            "VALUES (:id, :n, :v, :w, :idx, 'text', :h, 100, "
            "'BAAI/bge-small-en-v1.5', 384, now())"
        ),
        {
            "id": str(cid),
            "n": str(note_id),
            "v": str(ver_id),
            "w": str(ws_id),
            "idx": idx,
            "h": str(idx) * 64,
        },
    )


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def postgres_container():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg


@pytest.fixture(scope="module")
def db_url(postgres_container):
    host = postgres_container.get_container_host_ip()
    port = postgres_container.get_exposed_port(5432)
    return (
        f"postgresql+psycopg://{postgres_container.username}:"
        f"{postgres_container.password}@{host}:{port}/{postgres_container.dbname}"
    )


@pytest.fixture(scope="module")
def migrated_engine(db_url):
    _upgrade(db_url)
    engine = create_engine(db_url)
    yield engine
    engine.dispose()


# ── 1. Tables created, existing tables untouched ─────────────────────────────


def test_all_four_new_tables_exist(migrated_engine):
    """§6.5 — migration 0004 creates note_versions, note_chunks, index_jobs, saved_searches."""
    tables = inspect(migrated_engine).get_table_names()
    for t in ["note_versions", "note_chunks", "index_jobs", "saved_searches"]:
        assert t in tables, f"{t} missing after migration 0004"


def test_existing_tables_untouched(migrated_engine):
    """§6.5 — migration 0004 must not drop or alter any pre-existing table or column."""
    tables = inspect(migrated_engine).get_table_names()
    for t in ["users", "workspaces", "notes", "tags", "note_tags", "note_links", "sources"]:
        assert t in tables, f"pre-existing table {t} must not be removed"
    note_cols = {c["name"] for c in inspect(migrated_engine).get_columns("notes")}
    for col in [
        "id",
        "workspace_id",
        "created_by",
        "title",
        "content",
        "created_at",
        "updated_at",
        "is_pinned",
        "is_archived",
        "search_vector",
        "metadata",
    ]:
        assert col in note_cols, f"notes.{col} must not be removed"


# ── 2. note_versions schema ───────────────────────────────────────────────────


def test_note_versions_columns(migrated_engine):
    """§6.1 — all columns, types, nullability."""
    cols = {c["name"]: c for c in inspect(migrated_engine).get_columns("note_versions")}
    for col in [
        "id",
        "note_id",
        "workspace_id",
        "commit_hash",
        "author_id",
        "message",
        "is_ai_edit",
        "created_at",
    ]:
        assert col in cols, f"note_versions.{col} missing"

    assert cols["commit_hash"]["type"].length == 40
    assert cols["message"]["nullable"] is True
    assert cols["is_ai_edit"]["nullable"] is False
    assert cols["note_id"]["nullable"] is False
    assert cols["workspace_id"]["nullable"] is False
    assert cols["author_id"]["nullable"] is False

    pk = inspect(migrated_engine).get_pk_constraint("note_versions")
    assert "id" in pk["constrained_columns"]


def test_note_versions_fk_behaviors(migrated_engine):
    """§6.1 — note_id CASCADE, workspace_id CASCADE, author_id RESTRICT."""
    fks = {
        tuple(f["constrained_columns"]): f
        for f in inspect(migrated_engine).get_foreign_keys("note_versions")
    }
    assert fks[("note_id",)]["referred_table"] == "notes"
    assert fks[("note_id",)]["options"].get("ondelete", "").upper() == "CASCADE"
    assert fks[("workspace_id",)]["referred_table"] == "workspaces"
    assert fks[("workspace_id",)]["options"].get("ondelete", "").upper() == "CASCADE"
    assert fks[("author_id",)]["referred_table"] == "users"
    assert fks[("author_id",)]["options"].get("ondelete", "").upper() == "RESTRICT"


def test_note_versions_unique_note_commit(migrated_engine):
    """§6.1 — duplicate (note_id, commit_hash) must be rejected."""
    u, w, n = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    commit = "a" * 40
    with migrated_engine.begin() as conn:
        _seed(conn, u, w, n)
        _insert_version(conn, uuid.uuid4(), n, w, u, commit)
    with pytest.raises(IntegrityError):
        with migrated_engine.begin() as conn:
            _insert_version(conn, uuid.uuid4(), n, w, u, commit)


def test_note_versions_cascade_on_note_delete(migrated_engine):
    """§6.1 — deleting the note cascades to its versions."""
    u, w, n, v = uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    with migrated_engine.begin() as conn:
        _seed(conn, u, w, n)
        _insert_version(conn, v, n, w, u, "b" * 40)
    with migrated_engine.begin() as conn:
        conn.execute(text("DELETE FROM notes WHERE id=:id"), {"id": str(n)})
    with migrated_engine.connect() as conn:
        assert (
            conn.execute(
                text("SELECT count(*) FROM note_versions WHERE note_id=:id"), {"id": str(n)}
            ).scalar()
            == 0
        )


def test_note_versions_restrict_on_author_delete(migrated_engine):
    """§6.1 — deleting a user referenced as author_id must be blocked."""
    u, w, n = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    with migrated_engine.begin() as conn:
        _seed(conn, u, w, n)
        _insert_version(conn, uuid.uuid4(), n, w, u, "c" * 40)
    with pytest.raises(IntegrityError):
        with migrated_engine.begin() as conn:
            conn.execute(text("DELETE FROM users WHERE id=:id"), {"id": str(u)})


def test_note_versions_is_ai_edit_flag(migrated_engine):
    """§6.1, §11.4 — is_ai_edit stores True/False correctly."""
    u, w, n = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    v_human, v_ai = uuid.uuid4(), uuid.uuid4()
    with migrated_engine.begin() as conn:
        _seed(conn, u, w, n)
        conn.execute(
            text(
                "INSERT INTO note_versions "
                "(id, note_id, workspace_id, commit_hash, author_id, is_ai_edit, created_at) "
                "VALUES (:id,:n,:w,:c,:a,false,now())"
            ),
            {"id": str(v_human), "n": str(n), "w": str(w), "c": "d" * 40, "a": str(u)},
        )
        conn.execute(
            text(
                "INSERT INTO note_versions "
                "(id, note_id, workspace_id, commit_hash, author_id, is_ai_edit, created_at) "
                "VALUES (:id,:n,:w,:c,:a,true,now())"
            ),
            {"id": str(v_ai), "n": str(n), "w": str(w), "c": "e" * 40, "a": str(u)},
        )
    with migrated_engine.connect() as conn:
        assert (
            conn.execute(
                text("SELECT is_ai_edit FROM note_versions WHERE id=:id"), {"id": str(v_human)}
            ).scalar()
            is False
        )
        assert (
            conn.execute(
                text("SELECT is_ai_edit FROM note_versions WHERE id=:id"), {"id": str(v_ai)}
            ).scalar()
            is True
        )


# ── 3. note_chunks schema ─────────────────────────────────────────────────────


def test_note_chunks_columns(migrated_engine):
    """§6.2 — all columns, types, nullability."""
    cols = {c["name"]: c for c in inspect(migrated_engine).get_columns("note_chunks")}
    for col in [
        "id",
        "note_id",
        "version_id",
        "workspace_id",
        "chunk_index",
        "content",
        "content_hash",
        "token_count",
        "embedding_model",
        "embedding_dimension",
        "created_at",
    ]:
        assert col in cols, f"note_chunks.{col} missing"

    assert cols["content_hash"]["type"].length == 64
    assert cols["embedding_model"]["type"].length == 100
    assert cols["chunk_index"]["nullable"] is False
    assert cols["content"]["nullable"] is False
    assert cols["token_count"]["nullable"] is False
    assert cols["embedding_model"]["nullable"] is False
    assert cols["embedding_dimension"]["nullable"] is False

    pk = inspect(migrated_engine).get_pk_constraint("note_chunks")
    assert "id" in pk["constrained_columns"]


def test_note_chunks_fk_behaviors(migrated_engine):
    """§6.2 — all three FKs with CASCADE."""
    fks = {
        tuple(f["constrained_columns"]): f
        for f in inspect(migrated_engine).get_foreign_keys("note_chunks")
    }
    assert fks[("note_id",)]["referred_table"] == "notes"
    assert fks[("note_id",)]["options"].get("ondelete", "").upper() == "CASCADE"
    assert fks[("version_id",)]["referred_table"] == "note_versions"
    assert fks[("version_id",)]["options"].get("ondelete", "").upper() == "CASCADE"
    assert fks[("workspace_id",)]["referred_table"] == "workspaces"
    assert fks[("workspace_id",)]["options"].get("ondelete", "").upper() == "CASCADE"


def test_note_chunks_unique_version_chunk_index(migrated_engine):
    """§6.2 — duplicate (version_id, chunk_index) must be rejected."""
    u, w, n, v = uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    with migrated_engine.begin() as conn:
        _seed(conn, u, w, n)
        _insert_version(conn, v, n, w, u, "f" * 40)
        _insert_chunk(conn, uuid.uuid4(), n, v, w, 0)
    with pytest.raises(IntegrityError):
        with migrated_engine.begin() as conn:
            _insert_chunk(conn, uuid.uuid4(), n, v, w, 0)


def test_note_chunks_cascade_on_version_delete(migrated_engine):
    """§6.2 — deleting a version cascades to its chunks."""
    u, w, n, v, c = (uuid.uuid4() for _ in range(5))
    with migrated_engine.begin() as conn:
        _seed(conn, u, w, n)
        _insert_version(conn, v, n, w, u, "1" * 40)
        _insert_chunk(conn, c, n, v, w, 0)
    with migrated_engine.begin() as conn:
        conn.execute(text("DELETE FROM note_versions WHERE id=:id"), {"id": str(v)})
    with migrated_engine.connect() as conn:
        assert (
            conn.execute(
                text("SELECT count(*) FROM note_chunks WHERE version_id=:id"), {"id": str(v)}
            ).scalar()
            == 0
        )


def test_note_chunk_uuid_roundtrip(migrated_engine):
    """§6.2, §7.2 — chunk id (Qdrant point id) survives a round-trip unchanged."""
    u, w, n, v, c = (uuid.uuid4() for _ in range(5))
    with migrated_engine.begin() as conn:
        _seed(conn, u, w, n)
        _insert_version(conn, v, n, w, u, "2" * 40)
        _insert_chunk(conn, c, n, v, w, 0)
    with migrated_engine.connect() as conn:
        result = conn.execute(
            text("SELECT id FROM note_chunks WHERE id=:id"), {"id": str(c)}
        ).scalar()
    assert str(result) == str(c)


# ── 4. index_jobs schema ──────────────────────────────────────────────────────


def test_index_jobs_columns(migrated_engine):
    """§6.3 — all columns, types, nullability."""
    cols = {c["name"]: c for c in inspect(migrated_engine).get_columns("index_jobs")}
    for col in [
        "id",
        "workspace_id",
        "job_type",
        "status",
        "note_ids",
        "retry_count",
        "max_retries",
        "enqueued_at",
        "started_at",
        "completed_at",
        "error_message",
    ]:
        assert col in cols, f"index_jobs.{col} missing"

    assert cols["job_type"]["type"].length == 50
    assert cols["status"]["type"].length == 20
    assert cols["note_ids"]["nullable"] is True
    assert cols["started_at"]["nullable"] is True
    assert cols["completed_at"]["nullable"] is True
    assert cols["error_message"]["nullable"] is True
    assert cols["retry_count"]["nullable"] is False
    assert cols["max_retries"]["nullable"] is False


def test_index_jobs_note_ids_jsonb_null_and_list(migrated_engine):
    """§6.3 — note_ids accepts NULL (full reindex) and a JSON list (targeted)."""
    u, w, n = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    j_null, j_list = uuid.uuid4(), uuid.uuid4()
    targets = [str(uuid.uuid4()), str(uuid.uuid4())]

    with migrated_engine.begin() as conn:
        _seed(conn, u, w, n)
        conn.execute(
            text(
                "INSERT INTO index_jobs "
                "(id,workspace_id,job_type,status,note_ids,retry_count,max_retries,enqueued_at) "
                "VALUES (:id,:w,'index_workspace','queued',NULL,0,3,now())"
            ),
            {"id": str(j_null), "w": str(w)},
        )
        conn.execute(
            text(
                "INSERT INTO index_jobs "
                "(id,workspace_id,job_type,status,note_ids,retry_count,max_retries,enqueued_at) "
                "VALUES (:id,:w,'index_note','queued',CAST(:nids AS jsonb),0,3,now())"
            ),
            {"id": str(j_list), "w": str(w), "nids": json.dumps(targets)},
        )

    with migrated_engine.connect() as conn:
        null_val = conn.execute(
            text("SELECT note_ids FROM index_jobs WHERE id=:id"), {"id": str(j_null)}
        ).scalar()
        list_val = conn.execute(
            text("SELECT note_ids FROM index_jobs WHERE id=:id"), {"id": str(j_list)}
        ).scalar()

    assert null_val is None
    assert isinstance(list_val, list) and len(list_val) == 2


def test_index_jobs_cascade_on_workspace_delete(migrated_engine):
    """§6.3 — deleting a workspace cascades to index_jobs."""
    u, w, n, j = uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    with migrated_engine.begin() as conn:
        _seed(conn, u, w, n)
        conn.execute(
            text(
                "INSERT INTO index_jobs "
                "(id,workspace_id,job_type,status,retry_count,max_retries,enqueued_at) "
                "VALUES (:id,:w,'index_workspace','queued',0,3,now())"
            ),
            {"id": str(j), "w": str(w)},
        )
    with migrated_engine.begin() as conn:
        conn.execute(text("DELETE FROM workspaces WHERE id=:id"), {"id": str(w)})
    with migrated_engine.connect() as conn:
        assert (
            conn.execute(
                text("SELECT count(*) FROM index_jobs WHERE id=:id"), {"id": str(j)}
            ).scalar()
            == 0
        )


# ── 5. saved_searches schema ──────────────────────────────────────────────────


def test_saved_searches_columns(migrated_engine):
    """§6.4 — all columns, types, nullability."""
    cols = {c["name"]: c for c in inspect(migrated_engine).get_columns("saved_searches")}
    for col in ["id", "workspace_id", "name", "query", "search_mode", "created_at"]:
        assert col in cols, f"saved_searches.{col} missing"

    assert cols["name"]["type"].length == 150
    assert cols["query"]["type"].length == 500
    assert cols["search_mode"]["type"].length == 20
    assert cols["name"]["nullable"] is False
    assert cols["query"]["nullable"] is False
    assert cols["search_mode"]["nullable"] is False

    pk = inspect(migrated_engine).get_pk_constraint("saved_searches")
    assert "id" in pk["constrained_columns"]


def test_saved_searches_cascade_on_workspace_delete(migrated_engine):
    """§6.4 — deleting a workspace cascades to saved_searches."""
    u, w, n, ss = uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    with migrated_engine.begin() as conn:
        _seed(conn, u, w, n)
        conn.execute(
            text(
                "INSERT INTO saved_searches "
                "(id,workspace_id,name,query,search_mode,created_at) "
                "VALUES (:id,:w,'My Search','quantum','semantic',now())"
            ),
            {"id": str(ss), "w": str(w)},
        )
    with migrated_engine.begin() as conn:
        conn.execute(text("DELETE FROM workspaces WHERE id=:id"), {"id": str(w)})
    with migrated_engine.connect() as conn:
        assert (
            conn.execute(
                text("SELECT count(*) FROM saved_searches WHERE id=:id"), {"id": str(ss)}
            ).scalar()
            == 0
        )


def test_saved_searches_crud(migrated_engine):
    """§6.4, §13.3 — create / read / delete round-trip for a saved search."""
    u, w, n, ss = uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    with migrated_engine.begin() as conn:
        _seed(conn, u, w, n)
        conn.execute(
            text(
                "INSERT INTO saved_searches "
                "(id,workspace_id,name,query,search_mode,created_at) "
                "VALUES (:id,:w,'Hybrid Search','machine learning','hybrid',now())"
            ),
            {"id": str(ss), "w": str(w)},
        )
    with migrated_engine.connect() as conn:
        row = conn.execute(
            text("SELECT name,query,search_mode FROM saved_searches WHERE id=:id"),
            {"id": str(ss)},
        ).fetchone()
    assert row[0] == "Hybrid Search"
    assert row[1] == "machine learning"
    assert row[2] == "hybrid"

    # DELETE
    with migrated_engine.begin() as conn:
        conn.execute(text("DELETE FROM saved_searches WHERE id=:id"), {"id": str(ss)})
    with migrated_engine.connect() as conn:
        assert (
            conn.execute(
                text("SELECT count(*) FROM saved_searches WHERE id=:id"), {"id": str(ss)}
            ).scalar()
            == 0
        )


# ── 6. Required indexes (§6.6) ────────────────────────────────────────────────


def test_all_five_required_indexes_exist(migrated_engine):
    """§6.6 — all five BTree indexes from the contract must be present."""
    inspector = inspect(migrated_engine)

    ver_idx = {i["name"] for i in inspector.get_indexes("note_versions")}
    assert "idx_note_versions_note_id" in ver_idx, (
        "idx_note_versions_note_id missing from note_versions"
    )

    chunk_idx = {i["name"] for i in inspector.get_indexes("note_chunks")}
    assert "idx_note_chunks_version_id" in chunk_idx, (
        "idx_note_chunks_version_id missing from note_chunks"
    )
    assert "idx_note_chunks_note_id" in chunk_idx, (
        "idx_note_chunks_note_id missing from note_chunks"
    )

    job_idx = {i["name"] for i in inspector.get_indexes("index_jobs")}
    assert "idx_index_jobs_workspace_status" in job_idx, (
        "idx_index_jobs_workspace_status missing from index_jobs"
    )

    ss_idx = {i["name"] for i in inspector.get_indexes("saved_searches")}
    assert "idx_saved_searches_workspace" in ss_idx, (
        "idx_saved_searches_workspace missing from saved_searches"
    )


# ── 7. Migration reversibility (§6.5) ────────────────────────────────────────


def test_downgrade_to_0003_removes_v0_3_1_tables_only(db_url):
    """§6.5 — downgrade to 0003 drops the four new tables, nothing else."""
    _downgrade(db_url, "0003")
    engine = create_engine(db_url)
    try:
        tables = inspect(engine).get_table_names()
        # v0.3.1 tables gone
        for t in ["note_versions", "note_chunks", "index_jobs", "saved_searches"]:
            assert t not in tables, f"{t} must be removed after downgrade to 0003"
        # v0.2.x tables intact
        for t in ["users", "workspaces", "notes", "tags", "note_tags", "note_links", "sources"]:
            assert t in tables, f"{t} must remain after downgrade to 0003"
    finally:
        engine.dispose()

    # Re-apply so subsequent tests still have a migrated DB
    _upgrade(db_url)


def test_full_downgrade_and_reupgrade_are_reversible(db_url):
    """§6.5 — complete downgrade to base then upgrade to head must be idempotent."""
    _downgrade(db_url, "base")
    engine = create_engine(db_url)
    try:
        tables = inspect(engine).get_table_names()
        for t in [
            "users",
            "workspaces",
            "notes",
            "note_versions",
            "note_chunks",
            "index_jobs",
            "saved_searches",
        ]:
            assert t not in tables, f"{t} must be gone after full downgrade"
    finally:
        engine.dispose()

    _upgrade(db_url)
    engine = create_engine(db_url)
    try:
        tables = inspect(engine).get_table_names()
        for t in [
            "users",
            "workspaces",
            "notes",
            "tags",
            "note_tags",
            "note_links",
            "sources",
            "note_versions",
            "note_chunks",
            "index_jobs",
            "saved_searches",
        ]:
            assert t in tables, f"{t} must exist after re-upgrade to head"
    finally:
        engine.dispose()
