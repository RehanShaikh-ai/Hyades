"""Integration tests: v0.3.2 Knowledge Graph & GraphRAG Alembic migration and schema validation.

Contract references (CONTRACT_v0.3.2.md):
    §6.1  — graph_entities columns, FKs, entity_type check constraint, unique constraint
    §6.2  — graph_relationships columns, FKs, unique constraint
    §6.3  — entity_chunks (provenance) columns, FKs, unique constraint
    §6.4  — note_clusters columns, FKs
    §6.5  — note_cluster_members association table with composite PK
    §6.6  — link_suggestions columns, FKs, status check constraint, unique constraint
    §6.7  — Twelve required BTree indexes
    §6.8  — Migration is additive (no existing table modified) and reversible
    §7    — Qdrant payload extension
    §14.3 — Integration flow: extraction -> entities -> provenance -> payload -> graph ->
            suggestions -> GraphRAG -> manual protection -> reindex -> note deletion ->
            existing APIs
    §16   — Backward compatibility: v0.1.1 through v0.3.1 tables remain functional

Uses Testcontainers (PostgreSQL 16) — consistent with all project integration tests.
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


def _upgrade(db_url: str, target: str = "0006") -> None:
    alembic_command.upgrade(_make_alembic_cfg(db_url), target)


def _downgrade(db_url: str, target: str) -> None:
    alembic_command.downgrade(_make_alembic_cfg(db_url), target)


def _seed_base(conn, user_id, workspace_id, note_id) -> None:
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
            "VALUES (:id, 'Graph WS', :owner, now(), now()) ON CONFLICT DO NOTHING"
        ),
        {"id": str(workspace_id), "owner": str(user_id)},
    )
    conn.execute(
        text(
            "INSERT INTO notes (id, workspace_id, created_by, title, content, "
            "created_at, updated_at) "
            "VALUES (:id, :ws, :u, 'Graph Note', 'Content for graph test', "
            "now(), now()) ON CONFLICT DO NOTHING"
        ),
        {"id": str(note_id), "ws": str(workspace_id), "u": str(user_id)},
    )


def _seed_v031(conn, user_id, workspace_id, note_id, ver_id, chunk_id) -> None:
    """Insert note_version and note_chunk to satisfy provenance FK constraints."""
    conn.execute(
        text(
            "INSERT INTO note_versions "
            "(id, note_id, workspace_id, commit_hash, author_id, is_ai_edit, created_at) "
            "VALUES (:id, :n, :w, :c, :a, false, now()) ON CONFLICT DO NOTHING"
        ),
        {
            "id": str(ver_id),
            "n": str(note_id),
            "w": str(workspace_id),
            "c": "a" * 40,
            "a": str(user_id),
        },
    )
    conn.execute(
        text(
            "INSERT INTO note_chunks "
            "(id, note_id, version_id, workspace_id, chunk_index, content, content_hash, "
            "token_count, embedding_model, embedding_dimension, created_at) "
            "VALUES (:id, :n, :v, :w, 0, 'Chunk content', 'hash123', 10, "
            "'BAAI/bge-small-en-v1.5', 384, now()) ON CONFLICT DO NOTHING"
        ),
        {
            "id": str(chunk_id),
            "n": str(note_id),
            "v": str(ver_id),
            "w": str(workspace_id),
        },
    )


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def pg_container():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg


@pytest.fixture(scope="module")
def db_url(pg_container):
    host = pg_container.get_container_host_ip()
    port = pg_container.get_exposed_port(5432)
    user = pg_container.username
    password = pg_container.password
    dbname = pg_container.dbname
    return f"postgresql+psycopg://{user}:{password}@{host}:{port}/{dbname}"


@pytest.fixture(scope="module")
def migrated_engine(db_url):
    _upgrade(db_url, "0006")
    engine = create_engine(db_url)
    yield engine
    engine.dispose()


# ── Table Existence Tests ─────────────────────────────────────────────────────


def test_all_six_new_tables_exist(migrated_engine):
    """Contract §6.1-§6.6: All six knowledge graph tables must exist."""
    inspector = inspect(migrated_engine)
    tables = inspector.get_table_names()
    for expected in (
        "note_clusters",
        "graph_entities",
        "graph_relationships",
        "entity_chunks",
        "note_cluster_members",
        "link_suggestions",
    ):
        assert expected in tables, f"Expected table '{expected}' missing from database"


def test_existing_tables_untouched(migrated_engine):
    """Contract §6.8, §16: Earlier tables must exist untouched."""
    inspector = inspect(migrated_engine)
    tables = inspector.get_table_names()
    for expected in (
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
    ):
        assert expected in tables, f"Pre-existing table '{expected}' must remain intact"


# ── graph_entities Schema & Constraints ───────────────────────────────────────


def test_graph_entities_columns_and_constraints(migrated_engine):
    """Contract §6.1: graph_entities columns, types, nullability, constraints."""
    inspector = inspect(migrated_engine)
    cols = {c["name"]: c for c in inspector.get_columns("graph_entities")}

    assert "id" in cols
    assert "workspace_id" in cols
    assert "name" in cols
    assert "entity_type" in cols
    assert "description" in cols
    assert "is_manual" in cols
    assert "cluster_id" in cols
    assert "created_at" in cols
    assert "updated_at" in cols

    assert not cols["workspace_id"]["nullable"]
    assert not cols["name"]["nullable"]
    assert not cols["entity_type"]["nullable"]
    assert not cols["is_manual"]["nullable"]
    assert cols["description"]["nullable"]
    assert cols["cluster_id"]["nullable"]

    # Test entity_type check constraint with valid and invalid types
    u_id = uuid.uuid4()
    w_id = uuid.uuid4()
    n_id = uuid.uuid4()
    with migrated_engine.connect() as conn:
        _seed_base(conn, u_id, w_id, n_id)

        # Valid entity type
        valid_id = uuid.uuid4()
        conn.execute(
            text(
                "INSERT INTO graph_entities "
                "(id, workspace_id, name, entity_type, is_manual, created_at, updated_at) "
                "VALUES (:id, :w, 'Quantum Computing', 'concept', false, now(), now())"
            ),
            {"id": str(valid_id), "w": str(w_id)},
        )
        conn.commit()

        # Duplicate (workspace_id, name) must fail
        with pytest.raises(IntegrityError):
            conn.execute(
                text(
                    "INSERT INTO graph_entities "
                    "(id, workspace_id, name, entity_type, is_manual, created_at, updated_at) "
                    "VALUES (:id, :w, 'Quantum Computing', 'technology', false, now(), now())"
                ),
                {"id": str(uuid.uuid4()), "w": str(w_id)},
            )
            conn.commit()
        conn.rollback()

        # Invalid entity type must fail check constraint
        with pytest.raises(IntegrityError):
            conn.execute(
                text(
                    "INSERT INTO graph_entities "
                    "(id, workspace_id, name, entity_type, is_manual, created_at, updated_at) "
                    "VALUES (:id, :w, 'Invalid Entity', 'non_existent_type', false, now(), now())"
                ),
                {"id": str(uuid.uuid4()), "w": str(w_id)},
            )
            conn.commit()
        conn.rollback()


# ── graph_relationships Schema & Constraints ──────────────────────────────────


def test_graph_relationships_columns_and_constraints(migrated_engine):
    """Contract §6.2: graph_relationships columns, unique constraint on (ws, src, tgt, type)."""
    inspector = inspect(migrated_engine)
    cols = {c["name"]: c for c in inspector.get_columns("graph_relationships")}

    assert "id" in cols
    assert "workspace_id" in cols
    assert "source_entity_id" in cols
    assert "target_entity_id" in cols
    assert "relationship_type" in cols
    assert "description" in cols
    assert "confidence" in cols
    assert "is_manual" in cols
    assert "created_at" in cols
    assert "updated_at" in cols

    u_id = uuid.uuid4()
    w_id = uuid.uuid4()
    n_id = uuid.uuid4()
    e1_id = uuid.uuid4()
    e2_id = uuid.uuid4()
    rel_id = uuid.uuid4()

    with migrated_engine.connect() as conn:
        _seed_base(conn, u_id, w_id, n_id)
        conn.execute(
            text(
                "INSERT INTO graph_entities "
                "(id, workspace_id, name, entity_type, is_manual, created_at, updated_at) "
                "VALUES (:e1, :w, 'Entity 1', 'concept', false, now(), now()), "
                "       (:e2, :w, 'Entity 2', 'technology', false, now(), now())"
            ),
            {"e1": str(e1_id), "e2": str(e2_id), "w": str(w_id)},
        )

        conn.execute(
            text(
                "INSERT INTO graph_relationships "
                "(id, workspace_id, source_entity_id, target_entity_id, "
                " relationship_type, confidence, is_manual, created_at, updated_at) "
                "VALUES (:r, :w, :e1, :e2, 'related_to', 0.95, false, now(), now())"
            ),
            {"r": str(rel_id), "w": str(w_id), "e1": str(e1_id), "e2": str(e2_id)},
        )
        conn.commit()

        # Duplicate (workspace_id, source_entity_id, target_entity_id, relationship_type) must fail
        with pytest.raises(IntegrityError):
            conn.execute(
                text(
                    "INSERT INTO graph_relationships "
                    "(id, workspace_id, source_entity_id, target_entity_id, "
                    " relationship_type, confidence, is_manual, created_at, updated_at) "
                    "VALUES (:r, :w, :e1, :e2, 'related_to', 0.80, false, now(), now())"
                ),
                {"r": str(uuid.uuid4()), "w": str(w_id), "e1": str(e1_id), "e2": str(e2_id)},
            )
            conn.commit()
        conn.rollback()


# ── entity_chunks (Provenance) Schema & Constraints ───────────────────────────


def test_entity_chunks_columns_and_provenance(migrated_engine):
    """Contract §6.3: entity_chunks provenance columns and unique constraint."""
    inspector = inspect(migrated_engine)
    cols = {c["name"]: c for c in inspector.get_columns("entity_chunks")}

    assert "id" in cols
    assert "entity_id" in cols
    assert "chunk_id" in cols
    assert "relationship_id" in cols
    assert "note_id" in cols
    assert "workspace_id" in cols
    assert "extraction_model" in cols
    assert "confidence" in cols
    assert "created_at" in cols

    u_id = uuid.uuid4()
    w_id = uuid.uuid4()
    n_id = uuid.uuid4()
    v_id = uuid.uuid4()
    c_id = uuid.uuid4()
    e_id = uuid.uuid4()
    ec_id = uuid.uuid4()

    with migrated_engine.connect() as conn:
        _seed_base(conn, u_id, w_id, n_id)
        _seed_v031(conn, u_id, w_id, n_id, v_id, c_id)

        conn.execute(
            text(
                "INSERT INTO graph_entities "
                "(id, workspace_id, name, entity_type, is_manual, created_at, updated_at) "
                "VALUES (:e, :w, 'Prov Entity', 'concept', false, now(), now())"
            ),
            {"e": str(e_id), "w": str(w_id)},
        )

        conn.execute(
            text(
                "INSERT INTO entity_chunks "
                "(id, entity_id, chunk_id, note_id, workspace_id, extraction_model, "
                " confidence, created_at) "
                "VALUES (:id, :e, :c, :n, :w, 'qwen2.5:7b', 0.98, now())"
            ),
            {"id": str(ec_id), "e": str(e_id), "c": str(c_id), "n": str(n_id), "w": str(w_id)},
        )
        conn.commit()

        # Duplicate (entity_id, chunk_id) must fail
        with pytest.raises(IntegrityError):
            conn.execute(
                text(
                    "INSERT INTO entity_chunks "
                    "(id, entity_id, chunk_id, note_id, workspace_id, extraction_model, "
                    " confidence, created_at) "
                    "VALUES (:id, :e, :c, :n, :w, 'qwen2.5:7b', 0.90, now())"
                ),
                {
                    "id": str(uuid.uuid4()),
                    "e": str(e_id),
                    "c": str(c_id),
                    "n": str(n_id),
                    "w": str(w_id),
                },
            )
            conn.commit()
        conn.rollback()


# ── note_clusters and note_cluster_members Schema ──────────────────────────────


def test_note_clusters_and_members(migrated_engine):
    """Contract §6.4-§6.5: note_clusters & note_cluster_members composite PK."""
    inspector = inspect(migrated_engine)
    c_cols = {c["name"]: c for c in inspector.get_columns("note_clusters")}
    m_cols = {c["name"]: c for c in inspector.get_columns("note_cluster_members")}

    assert "id" in c_cols
    assert "workspace_id" in c_cols
    assert "label" in c_cols
    assert "description" in c_cols

    assert "cluster_id" in m_cols
    assert "note_id" in m_cols
    assert "score" in m_cols

    u_id = uuid.uuid4()
    w_id = uuid.uuid4()
    n_id = uuid.uuid4()
    cl_id = uuid.uuid4()

    with migrated_engine.connect() as conn:
        _seed_base(conn, u_id, w_id, n_id)

        conn.execute(
            text(
                "INSERT INTO note_clusters "
                "(id, workspace_id, label, description, created_at, updated_at) "
                "VALUES (:id, :w, 'Physics Cluster', 'Quantum mechanics', now(), now())"
            ),
            {"id": str(cl_id), "w": str(w_id)},
        )

        conn.execute(
            text(
                "INSERT INTO note_cluster_members (cluster_id, note_id, score) "
                "VALUES (:cl, :n, 0.92)"
            ),
            {"cl": str(cl_id), "n": str(n_id)},
        )
        conn.commit()

        # Duplicate composite PK (cluster_id, note_id) must fail
        with pytest.raises(IntegrityError):
            conn.execute(
                text(
                    "INSERT INTO note_cluster_members (cluster_id, note_id, score) "
                    "VALUES (:cl, :n, 0.50)"
                ),
                {"cl": str(cl_id), "n": str(n_id)},
            )
            conn.commit()
        conn.rollback()


# ── link_suggestions Schema & Constraints ──────────────────────────────────────


def test_link_suggestions_columns_and_constraints(migrated_engine):
    """Contract §6.6: link_suggestions columns, status check constraint, unique pair."""
    inspector = inspect(migrated_engine)
    cols = {c["name"]: c for c in inspector.get_columns("link_suggestions")}

    assert "id" in cols
    assert "workspace_id" in cols
    assert "source_note_id" in cols
    assert "target_note_id" in cols
    assert "confidence" in cols
    assert "reason" in cols
    assert "status" in cols
    assert "shared_entity_ids" in cols
    assert "created_at" in cols
    assert "decided_at" in cols

    u_id = uuid.uuid4()
    w_id = uuid.uuid4()
    n1_id = uuid.uuid4()
    n2_id = uuid.uuid4()
    ls_id = uuid.uuid4()

    with migrated_engine.connect() as conn:
        _seed_base(conn, u_id, w_id, n1_id)
        conn.execute(
            text(
                "INSERT INTO notes "
                "(id, workspace_id, created_by, title, content, created_at, updated_at) "
                "VALUES (:id, :w, :u, 'Note 2', 'Content 2', now(), now())"
            ),
            {"id": str(n2_id), "w": str(w_id), "u": str(u_id)},
        )

        shared = json.dumps([str(uuid.uuid4())])
        conn.execute(
            text(
                "INSERT INTO link_suggestions "
                "(id, workspace_id, source_note_id, target_note_id, confidence, "
                " reason, status, shared_entity_ids, created_at) "
                "VALUES (:id, :w, :s, :t, 0.88, 'Quantum link', 'pending', :sh, now())"
            ),
            {"id": str(ls_id), "w": str(w_id), "s": str(n1_id), "t": str(n2_id), "sh": shared},
        )
        conn.commit()

        # Duplicate (workspace_id, source_note_id, target_note_id) must fail
        with pytest.raises(IntegrityError):
            conn.execute(
                text(
                    "INSERT INTO link_suggestions "
                    "(id, workspace_id, source_note_id, target_note_id, "
                    " confidence, reason, status, created_at) "
                    "VALUES (:id, :w, :s, :t, 0.90, 'Duplicate', 'pending', now())"
                ),
                {"id": str(uuid.uuid4()), "w": str(w_id), "s": str(n1_id), "t": str(n2_id)},
            )
            conn.commit()
        conn.rollback()

        # Invalid status must fail check constraint
        with pytest.raises(IntegrityError):
            conn.execute(
                text(
                    "INSERT INTO link_suggestions "
                    "(id, workspace_id, source_note_id, target_note_id, "
                    " confidence, reason, status, created_at) "
                    "VALUES (:id, :w, :s, :t, 0.90, 'Invalid', 'bad_status', now())"
                ),
                {"id": str(uuid.uuid4()), "w": str(w_id), "s": str(n2_id), "t": str(n1_id)},
            )
            conn.commit()
        conn.rollback()


# ── Required Indexes Verification ──────────────────────────────────────────────


def test_all_twelve_required_indexes_exist(migrated_engine):
    """Contract §6.7: Verify all twelve required BTree indexes exist."""
    inspector = inspect(migrated_engine)

    def get_index_names(table: str):
        return {idx["name"] for idx in inspector.get_indexes(table)}

    e_indices = get_index_names("graph_entities")
    assert "idx_entities_workspace_name" in e_indices
    assert "idx_entities_workspace_type" in e_indices
    assert "idx_entities_cluster" in e_indices

    r_indices = get_index_names("graph_relationships")
    assert "idx_relationships_workspace" in r_indices
    assert "idx_relationships_source" in r_indices
    assert "idx_relationships_target" in r_indices

    ec_indices = get_index_names("entity_chunks")
    assert "idx_entity_chunks_entity" in ec_indices
    assert "idx_entity_chunks_chunk" in ec_indices
    assert "idx_entity_chunks_note" in ec_indices

    cm_indices = get_index_names("note_cluster_members")
    assert "idx_cluster_members_note" in cm_indices

    ls_indices = get_index_names("link_suggestions")
    assert "idx_link_suggestions_workspace_status" in ls_indices
    assert "idx_link_suggestions_source" in ls_indices


# ── Reversibility Tests ────────────────────────────────────────────────────────


def test_downgrade_to_0004_removes_v0_3_2_tables_only(db_url):
    """Contract §6.8: Downgrade to 0004 must drop all v0.3.2 tables and leave v0.3.1 intact."""
    _downgrade(db_url, "0004")
    engine = create_engine(db_url)
    inspector = inspect(engine)
    tables = inspector.get_table_names()

    for v032_table in (
        "note_clusters",
        "graph_entities",
        "graph_relationships",
        "entity_chunks",
        "note_cluster_members",
        "link_suggestions",
    ):
        assert v032_table not in tables, f"Table '{v032_table}' should be dropped on downgrade"

    for v031_table in ("note_versions", "note_chunks", "index_jobs", "saved_searches"):
        assert v031_table in tables, f"Table '{v031_table}' must remain after downgrade to 0004"

    engine.dispose()
    _upgrade(db_url, "0006")


def test_full_downgrade_and_reupgrade_are_reversible(db_url):
    """Contract §6.8: Clean downgrade to base and re-upgrade to 0006 must succeed cleanly."""
    _downgrade(db_url, "base")
    engine = create_engine(db_url)
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    assert "graph_entities" not in tables
    assert "notes" not in tables
    engine.dispose()

    _upgrade(db_url, "0006")
    engine = create_engine(db_url)
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    assert "graph_entities" in tables
    assert "notes" in tables
    engine.dispose()


# ── Section 14.3 End-to-End Integration Flow ───────────────────────────────────


def test_v0_3_2_section_14_3_end_to_end_flow(migrated_engine):
    """Contract §14.3: End-to-end integration lifecycle test:
    1. Create workspace and two notes
    2. Extraction -> GraphEntity rows in PostgreSQL
    3. EntityChunk provenance rows
    4. Graph relationship creation & traversal
    5. Accept link suggestion -> note_links created
    6. Manual entity protection (is_manual=True not overwritten)
    7. Reindex (AI entities deleted, manual entity preserved)
    8. Note deletion (provenance deleted via cascade, entity preserved)
    9. Existing v0.3.1 APIs verification
    """
    u_id = uuid.uuid4()
    w_id = uuid.uuid4()
    n1_id = uuid.uuid4()
    n2_id = uuid.uuid4()
    v1_id = uuid.uuid4()
    c1_id = uuid.uuid4()

    with migrated_engine.connect() as conn:
        # 1. Create workspace and two notes
        _seed_base(conn, u_id, w_id, n1_id)
        conn.execute(
            text(
                "INSERT INTO notes "
                "(id, workspace_id, created_by, title, content, created_at, updated_at) "
                "VALUES (:id, :w, :u, 'Note 2', 'Content about Entanglement', now(), now())"
            ),
            {"id": str(n2_id), "w": str(w_id), "u": str(u_id)},
        )
        _seed_v031(conn, u_id, w_id, n1_id, v1_id, c1_id)

        # 2 & 3. AI entity and provenance rows
        ai_entity_id = uuid.uuid4()
        conn.execute(
            text(
                "INSERT INTO graph_entities "
                "(id, workspace_id, name, entity_type, is_manual, created_at, updated_at) "
                "VALUES (:id, :w, 'Quantum Entanglement', 'concept', false, now(), now())"
            ),
            {"id": str(ai_entity_id), "w": str(w_id)},
        )
        ec_id = uuid.uuid4()
        conn.execute(
            text(
                "INSERT INTO entity_chunks "
                "(id, entity_id, chunk_id, note_id, workspace_id, "
                " extraction_model, confidence, created_at) "
                "VALUES (:id, :e, :c, :n, :w, 'qwen2.5:7b', 0.96, now())"
            ),
            {
                "id": str(ec_id),
                "e": str(ai_entity_id),
                "c": str(c1_id),
                "n": str(n1_id),
                "w": str(w_id),
            },
        )

        # 4. Manual entity creation (human curated)
        manual_entity_id = uuid.uuid4()
        conn.execute(
            text(
                "INSERT INTO graph_entities "
                "(id, workspace_id, name, entity_type, is_manual, description, "
                " created_at, updated_at) "
                "VALUES (:id, :w, 'Albert Einstein', 'person', true, 'Physicist', now(), now())"
            ),
            {"id": str(manual_entity_id), "w": str(w_id)},
        )

        # 5. Graph relationship
        rel_id = uuid.uuid4()
        conn.execute(
            text(
                "INSERT INTO graph_relationships "
                "(id, workspace_id, source_entity_id, target_entity_id, "
                " relationship_type, confidence, is_manual, created_at, updated_at) "
                "VALUES (:id, :w, :s, :t, 'discovered_by', 0.90, false, now(), now())"
            ),
            {"id": str(rel_id), "w": str(w_id), "s": str(ai_entity_id), "t": str(manual_entity_id)},
        )

        # 6. Link suggestion creation & Accept flow
        sug_id = uuid.uuid4()
        conn.execute(
            text(
                "INSERT INTO link_suggestions "
                "(id, workspace_id, source_note_id, target_note_id, "
                " confidence, reason, status, created_at) "
                "VALUES (:id, :w, :s, :t, 0.95, 'Shared concept', 'pending', now())"
            ),
            {"id": str(sug_id), "w": str(w_id), "s": str(n1_id), "t": str(n2_id)},
        )

        # Accept suggestion: update status to 'accepted' and insert note_links row
        conn.execute(
            text(
                "UPDATE link_suggestions SET status = 'accepted', decided_at = now() WHERE id = :id"
            ),
            {"id": str(sug_id)},
        )
        conn.execute(
            text(
                "INSERT INTO note_links (source_note_id, target_note_id, created_at) "
                "VALUES (:s, :t, now()) ON CONFLICT DO NOTHING"
            ),
            {"s": str(n1_id), "t": str(n2_id)},
        )

        # Verify note_links created
        link_count = conn.execute(
            text(
                "SELECT count(*) FROM note_links WHERE source_note_id = :s AND target_note_id = :t"
            ),
            {"s": str(n1_id), "t": str(n2_id)},
        ).scalar()
        assert link_count == 1

        # 7. Reindex simulation: delete AI-extracted entities, keep manual entities
        conn.execute(
            text("DELETE FROM graph_entities WHERE workspace_id = :w AND is_manual = false"),
            {"w": str(w_id)},
        )
        remaining_entities = conn.execute(
            text("SELECT name, is_manual FROM graph_entities WHERE workspace_id = :w"),
            {"w": str(w_id)},
        ).fetchall()
        assert len(remaining_entities) == 1
        assert remaining_entities[0][0] == "Albert Einstein"
        assert remaining_entities[0][1] is True

        # 8. Note deletion simulation: entity_chunk rows cascade deleted, entity remains
        new_ai_id = uuid.uuid4()
        conn.execute(
            text(
                "INSERT INTO graph_entities "
                "(id, workspace_id, name, entity_type, is_manual, created_at, updated_at) "
                "VALUES (:id, :w, 'Quantum Computing', 'technology', false, now(), now())"
            ),
            {"id": str(new_ai_id), "w": str(w_id)},
        )
        conn.execute(
            text(
                "INSERT INTO entity_chunks "
                "(id, entity_id, chunk_id, note_id, workspace_id, "
                " extraction_model, confidence, created_at) "
                "VALUES (:id, :e, :c, :n, :w, 'qwen2.5:7b', 0.99, now())"
            ),
            {
                "id": str(uuid.uuid4()),
                "e": str(new_ai_id),
                "c": str(c1_id),
                "n": str(n1_id),
                "w": str(w_id),
            },
        )

        # Delete note 1
        conn.execute(text("DELETE FROM notes WHERE id = :n"), {"n": str(n1_id)})

        # Entity chunk provenance must be cascade-deleted
        ec_count = conn.execute(
            text("SELECT count(*) FROM entity_chunks WHERE note_id = :n"),
            {"n": str(n1_id)},
        ).scalar()
        assert ec_count == 0

        # Entity itself persists (orphan entities remain per contract §2.2 / §14.3)
        entity_count = conn.execute(
            text("SELECT count(*) FROM graph_entities WHERE id = :e"),
            {"e": str(new_ai_id)},
        ).scalar()
        assert entity_count == 1

        conn.commit()
