"""Comprehensive tests verifying graph data persistence, extraction vs reindexing separation,
resilience against provider failure, idempotency, and workspace isolation.
"""

import uuid
from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.exceptions import LLMProviderUnavailableError
from app.models.content_chunk import ContentChunk
from app.models.graph_entity import GraphEntity
from app.models.graph_relationship import GraphRelationship
from app.models.note import Note
from app.models.note_version import NoteVersion
from app.models.user import User
from app.models.workspace import Workspace
from app.services import entity_extraction_service, graph_index_service, job_service


@pytest.fixture
def graph_persistence_env(db_session: Session):
    user = User(id=uuid.uuid4(), display_name="Persistence Tester")
    ws_a = Workspace(id=uuid.uuid4(), name="Workspace A", owner_id=user.id)
    ws_b = Workspace(id=uuid.uuid4(), name="Workspace B", owner_id=user.id)
    db_session.add_all([user, ws_a, ws_b])
    db_session.flush()

    note_a1 = Note(
        id=uuid.uuid4(),
        workspace_id=ws_a.id,
        created_by=user.id,
        title="Knowledge Representation",
        content=(
            "Knowledge Representation utilizes Knowledge Graphs "
            "and Description Logic for reasoning."
        ),
    )
    note_a2 = Note(
        id=uuid.uuid4(),
        workspace_id=ws_a.id,
        created_by=user.id,
        title="Graph Databases",
        content="Graph Databases store Nodes and Directed Edges efficiently.",
    )
    note_b1 = Note(
        id=uuid.uuid4(),
        workspace_id=ws_b.id,
        created_by=user.id,
        title="Secret Project",
        content="Secret Project in Workspace B contains Classified Concept B.",
    )
    db_session.add_all([note_a1, note_a2, note_b1])
    db_session.flush()

    for n in [note_a1, note_a2, note_b1]:
        ver = NoteVersion(
            id=uuid.uuid4(),
            note_id=n.id,
            workspace_id=n.workspace_id,
            author_id=user.id,
            commit_hash=f"hash_{n.id.hex[:12]}",
            message="Initial snapshot",
            created_at=datetime.now(UTC),
        )
        db_session.add(ver)
        db_session.flush()

        nc = ContentChunk(
            id=uuid.uuid4(),
            note_id=n.id,
            version_id=ver.id,
            source_id=None,
            workspace_id=n.workspace_id,
            chunk_index=0,
            content=n.content,
            content_hash=f"hash_{n.id.hex[:8]}",
            token_count=20,
            embedding_model="test-embed",
            embedding_dimension=384,
            created_at=datetime.now(UTC),
        )
        db_session.add(nc)

    db_session.commit()
    return {
        "user": user,
        "ws_a": ws_a,
        "ws_b": ws_b,
        "note_a1": note_a1,
        "note_a2": note_a2,
        "note_b1": note_b1,
    }


def test_successful_extraction_persists_entities_and_relationships(
    db_session: Session, graph_persistence_env: dict
):
    """Verify that extraction extracts and persists entities and relationships into PostgreSQL."""
    ws_a = graph_persistence_env["ws_a"]
    note_a1 = graph_persistence_env["note_a1"]

    summary = graph_index_service.index_note_graph(db_session, note_a1.id)
    assert summary["entities_extracted"] >= 2
    assert summary["failed_steps"] == []

    # Check entities in database
    entities = db_session.scalars(
        entity_extraction_service.select(GraphEntity).where(GraphEntity.workspace_id == ws_a.id)
    ).all()
    assert len(entities) >= 2

    # Check relationships in database
    relationships = db_session.scalars(
        entity_extraction_service.select(GraphRelationship).where(
            GraphRelationship.workspace_id == ws_a.id
        )
    ).all()
    assert len(relationships) >= 1
    assert relationships[0].source_entity_id is not None
    assert relationships[0].target_entity_id is not None
    assert relationships[0].relationship_type != ""


def test_graph_api_returns_persisted_entities_and_relationships(
    client: TestClient, db_session: Session, graph_persistence_env: dict
):
    """Verify that GET /workspaces/{id}/graph returns the persisted entities and edges."""
    ws_a = graph_persistence_env["ws_a"]
    note_a1 = graph_persistence_env["note_a1"]

    # Extract
    graph_index_service.index_note_graph(db_session, note_a1.id)

    # Query Graph API
    res = client.get(f"/api/v1/workspaces/{ws_a.id}/graph")
    assert res.status_code == 200
    data = res.json()

    assert data["stats"]["node_count"] >= 2
    assert len(data["nodes"]) >= 2
    assert len(data["edges"]) >= 1

    # Verify edge source and target are valid node ids
    node_ids = {n["id"] for n in data["nodes"]}
    for edge in data["edges"]:
        assert edge["source_entity_id"] in node_ids
        assert edge["target_entity_id"] in node_ids
        assert "relationship_type" in edge
        assert "confidence" in edge


def test_reading_graph_does_not_trigger_extraction(
    client: TestClient, db_session: Session, graph_persistence_env: dict
):
    """Verify reading graph API reads persisted data and never calls LLM extraction."""
    ws_a = graph_persistence_env["ws_a"]
    note_a1 = graph_persistence_env["note_a1"]

    # Populate persisted graph data
    graph_index_service.index_note_graph(db_session, note_a1.id)

    with patch.object(
        entity_extraction_service,
        "extract_entities",
        side_effect=Exception("Should not be called"),
    ):
        # Refresh 1
        res1 = client.get(f"/api/v1/workspaces/{ws_a.id}/graph")
        assert res1.status_code == 200
        # Refresh 2
        res2 = client.get(f"/api/v1/workspaces/{ws_a.id}/graph")
        assert res2.status_code == 200

        assert res1.json() == res2.json()


def test_repeated_reindexing_does_not_invoke_llm(db_session: Session, graph_persistence_env: dict):
    """Verify that reindexing rebuilds search/cluster index without calling LLM."""
    ws_a = graph_persistence_env["ws_a"]
    note_a1 = graph_persistence_env["note_a1"]

    # Extract once
    graph_index_service.index_note_graph(db_session, note_a1.id)

    persisted_ents_before = db_session.scalars(
        entity_extraction_service.select(GraphEntity).where(GraphEntity.workspace_id == ws_a.id)
    ).all()
    assert len(persisted_ents_before) >= 2

    # Patch extract_entities to throw if called
    with patch.object(
        entity_extraction_service,
        "extract_entities",
        side_effect=AssertionError("LLM should not be called on reindex"),
    ):
        summary = graph_index_service.reindex_workspace_graph(db_session, ws_a.id)
        assert summary["notes_processed"] == 2
        assert summary["extracted_entities"] == len(persisted_ents_before)
        assert summary["failed_notes"] == []

    # Verify persisted entities were preserved intact
    persisted_ents_after = db_session.scalars(
        entity_extraction_service.select(GraphEntity).where(GraphEntity.workspace_id == ws_a.id)
    ).all()
    assert len(persisted_ents_after) == len(persisted_ents_before)


def test_failed_provider_calls_produce_real_failure_state(
    db_session: Session, graph_persistence_env: dict
):
    """Verify provider failure produces a real failure state rather than silent completion."""
    ws_a = graph_persistence_env["ws_a"]

    with patch.object(
        entity_extraction_service.llm_service,
        "get_llm_provider",
        side_effect=LLMProviderUnavailableError("Ollama connection refused"),
    ):
        job = job_service.enqueue_extract_job(db_session, ws_a.id)
        assert job.status == "failed"
        assert "Extraction failed" in (job.error_message or "")
        assert "connection refused" in (job.error_message or "").lower()


def test_failed_extraction_does_not_erase_previously_persisted_data(
    db_session: Session, graph_persistence_env: dict
):
    """Verify failed extraction attempt does not erase valid persisted graph data."""
    ws_a = graph_persistence_env["ws_a"]
    note_a1 = graph_persistence_env["note_a1"]

    # First extraction succeeds
    graph_index_service.index_note_graph(db_session, note_a1.id)
    entities_count_before = len(
        db_session.scalars(
            entity_extraction_service.select(GraphEntity).where(GraphEntity.workspace_id == ws_a.id)
        ).all()
    )
    assert entities_count_before >= 2

    # Second extraction attempt fails (e.g. LLM timeout)
    with patch.object(
        entity_extraction_service.llm_service,
        "get_llm_provider",
        side_effect=LLMProviderUnavailableError("LLM timed out"),
    ):
        res = graph_index_service.index_note_graph(db_session, note_a1.id)
        assert len(res["failed_steps"]) > 0

    # Ensure previously valid entities and relationships are still present
    entities_count_after = len(
        db_session.scalars(
            entity_extraction_service.select(GraphEntity).where(GraphEntity.workspace_id == ws_a.id)
        ).all()
    )
    assert entities_count_after == entities_count_before


def test_repeated_processing_idempotent_no_duplicates(
    db_session: Session, graph_persistence_env: dict
):
    """Verify repeated extraction on the same note does not create duplicate nodes or edges."""
    ws_a = graph_persistence_env["ws_a"]
    note_a1 = graph_persistence_env["note_a1"]

    # Run 1
    graph_index_service.index_note_graph(db_session, note_a1.id)
    nodes_1 = len(
        db_session.scalars(
            entity_extraction_service.select(GraphEntity).where(GraphEntity.workspace_id == ws_a.id)
        ).all()
    )
    edges_1 = len(
        db_session.scalars(
            entity_extraction_service.select(GraphRelationship).where(
                GraphRelationship.workspace_id == ws_a.id
            )
        ).all()
    )

    # Run 2
    graph_index_service.index_note_graph(db_session, note_a1.id)
    nodes_2 = len(
        db_session.scalars(
            entity_extraction_service.select(GraphEntity).where(GraphEntity.workspace_id == ws_a.id)
        ).all()
    )
    edges_2 = len(
        db_session.scalars(
            entity_extraction_service.select(GraphRelationship).where(
                GraphRelationship.workspace_id == ws_a.id
            )
        ).all()
    )

    assert nodes_1 == nodes_2
    assert edges_1 == edges_2


def test_workspace_isolation_strictly_enforced(
    client: TestClient, db_session: Session, graph_persistence_env: dict
):
    """Verify that graph operations never leak entities or relationships between workspaces."""
    ws_a = graph_persistence_env["ws_a"]
    ws_b = graph_persistence_env["ws_b"]
    note_a1 = graph_persistence_env["note_a1"]
    note_b1 = graph_persistence_env["note_b1"]

    # Extract in Workspace A
    graph_index_service.index_note_graph(db_session, note_a1.id)
    # Extract in Workspace B
    graph_index_service.index_note_graph(db_session, note_b1.id)

    # Query Workspace A
    res_a = client.get(f"/api/v1/workspaces/{ws_a.id}/graph")
    data_a = res_a.json()
    names_a = [n["name"] for n in data_a["nodes"]]

    # Query Workspace B
    res_b = client.get(f"/api/v1/workspaces/{ws_b.id}/graph")
    data_b = res_b.json()
    names_b = [n["name"] for n in data_b["nodes"]]

    # Assert no cross-contamination
    assert not any("Classified Concept B" in name for name in names_a)
    assert any("Classified Concept B" in name or "Secret Project" in name for name in names_b)
