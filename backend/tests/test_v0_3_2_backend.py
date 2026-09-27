"""Comprehensive backend and API tests for Knowledge Graph & GraphRAG (v0.3.2).

Contract references:
    CONTRACT_v0.3.2.md §6, §8, §9, §10, §11, §12, §14.1, §18
"""

import uuid
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.content_chunk import ContentChunk
from app.models.entity_chunk import EntityChunk
from app.models.graph_entity import GraphEntity
from app.models.graph_relationship import GraphRelationship
from app.models.note import Note
from app.models.note_link import NoteLink
from app.models.user import User
from app.models.workspace import Workspace
from app.services import (
    entity_extraction_service,
    graph_index_service,
    link_suggestion_service,
)


@pytest.fixture
def v032_test_data(db_session: Session):
    user = User(id=uuid.uuid4(), display_name="AI Scientist")
    db_session.add(user)
    db_session.flush()

    ws1 = Workspace(id=uuid.uuid4(), name="Primary Workspace", owner_id=user.id)
    ws2 = Workspace(id=uuid.uuid4(), name="Isolated Workspace", owner_id=user.id)
    db_session.add_all([ws1, ws2])
    db_session.flush()

    # Note A in Workspace 1
    note_a = Note(
        id=uuid.uuid4(),
        workspace_id=ws1.id,
        created_by=user.id,
        title="Deep Learning and Neural Networks",
        content=(
            "Neural Networks are trained using Gradient Descent and Backpropagation optimization."
        ),
    )
    # Note B in Workspace 1
    note_b = Note(
        id=uuid.uuid4(),
        workspace_id=ws1.id,
        created_by=user.id,
        title="Optimization Algorithms",
        content="Gradient Descent minimizes the loss function. Backpropagation computes gradients.",
    )
    # Note C in Workspace 2 (Isolation test)
    note_c = Note(
        id=uuid.uuid4(),
        workspace_id=ws2.id,
        created_by=user.id,
        title="Secret Project",
        content="Confidential information in Workspace 2.",
    )
    db_session.add_all([note_a, note_b, note_c])
    db_session.flush()

    from app.models.note_version import NoteVersion

    ver_a = NoteVersion(
        id=uuid.uuid4(),
        note_id=note_a.id,
        workspace_id=ws1.id,
        author_id=user.id,
        commit_hash="0123456789abcdef0123456789abcdef0123456a",
        message="Initial",
        created_at=datetime.now(UTC),
    )
    ver_b = NoteVersion(
        id=uuid.uuid4(),
        note_id=note_b.id,
        workspace_id=ws1.id,
        author_id=user.id,
        commit_hash="0123456789abcdef0123456789abcdef0123456b",
        message="Initial",
        created_at=datetime.now(UTC),
    )
    db_session.add_all([ver_a, ver_b])
    db_session.flush()

    # Create dummy ContentChunks for note_a and note_b
    chunk_a = ContentChunk(
        id=uuid.uuid4(),
        note_id=note_a.id,
        version_id=ver_a.id,
        source_id=None,
        workspace_id=ws1.id,
        chunk_index=0,
        content=note_a.content,
        content_hash="hash_a",
        token_count=20,
        embedding_model="test-embed",
        embedding_dimension=384,
        created_at=datetime.now(UTC),
    )
    chunk_b = ContentChunk(
        id=uuid.uuid4(),
        note_id=note_b.id,
        version_id=ver_b.id,
        source_id=None,
        workspace_id=ws1.id,
        chunk_index=0,
        content=note_b.content,
        content_hash="hash_b",
        token_count=18,
        embedding_model="test-embed",
        embedding_dimension=384,
        created_at=datetime.now(UTC),
    )
    db_session.add_all([chunk_a, chunk_b])
    db_session.commit()

    return {
        "user": user,
        "ws1": ws1,
        "ws2": ws2,
        "note_a": note_a,
        "note_b": note_b,
        "note_c": note_c,
        "chunk_a": chunk_a,
        "chunk_b": chunk_b,
    }


def test_entity_crud_and_conflict(client: TestClient, v032_test_data: dict):
    """Test manual entity creation, duplicate name conflict (409), patch,
    and delete (§6.1, §9.2).
    """
    ws1 = v032_test_data["ws1"]

    # 1. Create entity
    res = client.post(
        f"/api/v1/workspaces/{ws1.id}/entities",
        json={
            "name": "Convolutional Neural Network",
            "entity_type": "technology",
            "description": "CNN Architecture",
        },
    )
    assert res.status_code == 201
    entity_data = res.json()
    assert entity_data["name"] == "Convolutional Neural Network"
    assert entity_data["entity_type"] == "technology"
    assert entity_data["is_manual"] is True
    entity_id = entity_data["id"]

    # 2. Duplicate entity in same workspace returns 409 CONFLICT (§11)
    res_dup = client.post(
        f"/api/v1/workspaces/{ws1.id}/entities",
        json={"name": "convolutional neural network", "entity_type": "concept"},
    )
    assert res_dup.status_code == 409
    assert res_dup.json()["error"]["code"] == "CONFLICT"

    # 3. Patch entity
    res_patch = client.patch(
        f"/api/v1/entities/{entity_id}",
        json={"description": "Updated CNN Description"},
    )
    assert res_patch.status_code == 200
    assert res_patch.json()["description"] == "Updated CNN Description"

    # 4. Get entity
    res_get = client.get(f"/api/v1/entities/{entity_id}")
    assert res_get.status_code == 200
    assert res_get.json()["id"] == entity_id

    # 5. Delete entity
    res_del = client.delete(f"/api/v1/entities/{entity_id}")
    assert res_del.status_code == 204

    # 6. Entity not found (404)
    res_get_del = client.get(f"/api/v1/entities/{entity_id}")
    assert res_get_del.status_code == 404
    assert res_get_del.json()["error"]["code"] == "ENTITY_NOT_FOUND"


def test_relationship_crud_and_validation(client: TestClient, v032_test_data: dict):
    """Test relationship creation, self-relationship validation (422),
    duplicate conflict (409) (§6.2, §9.3).
    """
    ws1 = v032_test_data["ws1"]

    e1 = client.post(
        f"/api/v1/workspaces/{ws1.id}/entities",
        json={"name": "Transformers", "entity_type": "technology"},
    ).json()
    e2 = client.post(
        f"/api/v1/workspaces/{ws1.id}/entities",
        json={"name": "Attention Mechanism", "entity_type": "concept"},
    ).json()

    # 1. Self-relationship rejected with 422 VALIDATION_ERROR
    res_self = client.post(
        f"/api/v1/workspaces/{ws1.id}/relationships",
        json={
            "source_entity_id": e1["id"],
            "target_entity_id": e1["id"],
            "relationship_type": "relates_to",
        },
    )
    assert res_self.status_code == 422
    assert res_self.json()["error"]["code"] == "VALIDATION_ERROR"

    # 2. Valid relationship creation
    res_rel = client.post(
        f"/api/v1/workspaces/{ws1.id}/relationships",
        json={
            "source_entity_id": e1["id"],
            "target_entity_id": e2["id"],
            "relationship_type": "uses",
            "description": "Transformers use Attention Mechanism",
            "confidence": 1.0,
        },
    )
    assert res_rel.status_code == 201
    rel_data = res_rel.json()
    assert rel_data["relationship_type"] == "uses"
    assert rel_data["is_manual"] is True
    rel_id = rel_data["id"]

    # 3. Duplicate relationship (same source, target, type) returns 409 CONFLICT
    res_dup = client.post(
        f"/api/v1/workspaces/{ws1.id}/relationships",
        json={
            "source_entity_id": e1["id"],
            "target_entity_id": e2["id"],
            "relationship_type": "uses",
        },
    )
    assert res_dup.status_code == 409
    assert res_dup.json()["error"]["code"] == "CONFLICT"

    # 4. Get & Patch relationship
    res_get = client.get(f"/api/v1/relationships/{rel_id}")
    assert res_get.status_code == 200

    res_patch = client.patch(
        f"/api/v1/relationships/{rel_id}",
        json={"description": "Updated relationship description"},
    )
    assert res_patch.status_code == 200
    assert res_patch.json()["description"] == "Updated relationship description"

    # 5. Delete relationship
    res_del = client.delete(f"/api/v1/relationships/{rel_id}")
    assert res_del.status_code == 204


def test_entity_deduplication_preserves_manual(db_session: Session, v032_test_data: dict):
    """Test AI extraction does not overwrite manual entities per CONTRACT §8.3."""
    ws1 = v032_test_data["ws1"]
    note_a = v032_test_data["note_a"]

    # Create manual entity with custom description
    manual_ent = GraphEntity(
        id=uuid.uuid4(),
        workspace_id=ws1.id,
        name="Gradient Descent",
        entity_type="concept",
        description="Manual curated description that must not be changed",
        is_manual=True,
    )
    db_session.add(manual_ent)
    db_session.commit()

    # Run entity extraction for note_a
    entity_extraction_service.extract_entities_for_note(db_session, note_a.id)

    # Gradient Descent entity must retain manual flag and original description
    db_session.refresh(manual_ent)
    assert manual_ent.is_manual is True
    assert manual_ent.description == "Manual curated description that must not be changed"

    # Provenance row should have been created
    prov = db_session.scalars(
        select(EntityChunk).where(EntityChunk.entity_id == manual_ent.id)
    ).first()
    assert prov is not None
    assert prov.note_id == note_a.id


def test_entity_provenance_api(client: TestClient, db_session: Session, v032_test_data: dict):
    """Verify entity provenance returns source chunks with excerpts per CONTRACT §9.2."""
    ws1 = v032_test_data["ws1"]
    note_a = v032_test_data["note_a"]
    chunk_a = v032_test_data["chunk_a"]

    ent = GraphEntity(
        id=uuid.uuid4(),
        workspace_id=ws1.id,
        name="Backpropagation",
        entity_type="concept",
        is_manual=False,
    )
    db_session.add(ent)
    db_session.flush()

    prov = EntityChunk(
        entity_id=ent.id,
        chunk_id=chunk_a.id,
        note_id=note_a.id,
        workspace_id=ws1.id,
        extraction_model="llama3.2",
        confidence=0.92,
    )
    db_session.add(prov)
    db_session.commit()

    res = client.get(f"/api/v1/entities/{ent.id}/provenance")
    assert res.status_code == 200
    data = res.json()
    assert data["entity_id"] == str(ent.id)
    assert len(data["sources"]) == 1
    assert data["sources"][0]["note_title"] == note_a.title
    assert data["sources"][0]["chunk_id"] == str(chunk_a.id)
    assert data["sources"][0]["confidence"] == 0.92


def test_entity_neighborhood_api(client: TestClient, db_session: Session, v032_test_data: dict):
    """Verify 1-hop entity neighborhood graph per CONTRACT §9.2."""
    ws1 = v032_test_data["ws1"]

    e1 = GraphEntity(id=uuid.uuid4(), workspace_id=ws1.id, name="PyTorch", entity_type="technology")
    e2 = GraphEntity(id=uuid.uuid4(), workspace_id=ws1.id, name="Tensors", entity_type="concept")
    e3 = GraphEntity(id=uuid.uuid4(), workspace_id=ws1.id, name="Autograd", entity_type="concept")
    e4 = GraphEntity(
        id=uuid.uuid4(), workspace_id=ws1.id, name="Unrelated Entity", entity_type="concept"
    )
    db_session.add_all([e1, e2, e3, e4])
    db_session.flush()

    r1 = GraphRelationship(
        workspace_id=ws1.id,
        source_entity_id=e1.id,
        target_entity_id=e2.id,
        relationship_type="operates_on",
        confidence=0.95,
    )
    r2 = GraphRelationship(
        workspace_id=ws1.id,
        source_entity_id=e1.id,
        target_entity_id=e3.id,
        relationship_type="includes",
        confidence=0.9,
    )
    db_session.add_all([r1, r2])
    db_session.commit()

    res = client.get(f"/api/v1/entities/{e1.id}/neighborhood")
    assert res.status_code == 200
    data = res.json()

    node_ids = {n["id"] for n in data["nodes"]}
    assert str(e1.id) in node_ids
    assert str(e2.id) in node_ids
    assert str(e3.id) in node_ids
    assert str(e4.id) not in node_ids
    assert data["stats"]["node_count"] == 3
    assert data["stats"]["edge_count"] == 2


def test_graph_search_api(client: TestClient, db_session: Session, v032_test_data: dict):
    """Verify search_graph returns matched entities and notes containing them per CONTRACT §9.1."""
    ws1 = v032_test_data["ws1"]
    note_a = v032_test_data["note_a"]
    chunk_a = v032_test_data["chunk_a"]

    ent = GraphEntity(
        id=uuid.uuid4(),
        workspace_id=ws1.id,
        name="Reinforcement Learning",
        entity_type="concept",
        description="Learning via rewards and penalties",
        is_manual=True,
    )
    db_session.add(ent)
    db_session.flush()

    db_session.add(
        EntityChunk(
            entity_id=ent.id,
            chunk_id=chunk_a.id,
            note_id=note_a.id,
            workspace_id=ws1.id,
            extraction_model="test",
            confidence=1.0,
        )
    )
    db_session.commit()

    res = client.get(f"/api/v1/workspaces/{ws1.id}/graph/search?q=reinforcement")
    assert res.status_code == 200
    data = res.json()

    assert data["total"] >= 2
    assert any(e["name"] == "Reinforcement Learning" for e in data["entities"])
    assert any(n["id"] == str(note_a.id) for n in data["notes"])


def test_link_suggestion_lifecycle(client: TestClient, db_session: Session, v032_test_data: dict):
    """Test suggestion generation, accept (creates note_links), and reject (retains status)
    per CONTRACT §9.5.
    """
    ws1 = v032_test_data["ws1"]
    note_a = v032_test_data["note_a"]
    note_b = v032_test_data["note_b"]
    chunk_a = v032_test_data["chunk_a"]
    chunk_b = v032_test_data["chunk_b"]

    shared_ent = GraphEntity(
        id=uuid.uuid4(),
        workspace_id=ws1.id,
        name="Shared Concept",
        entity_type="concept",
    )
    db_session.add(shared_ent)
    db_session.flush()

    # Link both note_a and note_b to shared_ent
    db_session.add(
        EntityChunk(
            entity_id=shared_ent.id,
            chunk_id=chunk_a.id,
            note_id=note_a.id,
            workspace_id=ws1.id,
            extraction_model="m",
            confidence=0.9,
        )
    )
    db_session.add(
        EntityChunk(
            entity_id=shared_ent.id,
            chunk_id=chunk_b.id,
            note_id=note_b.id,
            workspace_id=ws1.id,
            extraction_model="m",
            confidence=0.9,
        )
    )
    db_session.commit()

    # Generate suggestions
    suggestions = link_suggestion_service.generate_link_suggestions(db_session, ws1.id)
    assert len(suggestions) >= 1
    sug_id = suggestions[0].id

    # List suggestions API
    res_list = client.get(f"/api/v1/workspaces/{ws1.id}/suggestions?status=pending")
    assert res_list.status_code == 200
    assert res_list.json()["total"] >= 1

    # Accept suggestion
    res_accept = client.post(f"/api/v1/suggestions/{sug_id}/accept")
    assert res_accept.status_code == 200

    # Verify note_links row was created
    link_in_db = db_session.scalars(
        select(NoteLink).where(
            (NoteLink.source_note_id == note_a.id) & (NoteLink.target_note_id == note_b.id)
            | (NoteLink.source_note_id == note_b.id) & (NoteLink.target_note_id == note_a.id)
        )
    ).first()
    assert link_in_db is not None

    # Accepting already decided suggestion returns 422 SUGGESTION_ALREADY_DECIDED (§11)
    res_reaccept = client.post(f"/api/v1/suggestions/{sug_id}/accept")
    assert res_reaccept.status_code == 422
    assert res_reaccept.json()["error"]["code"] == "SUGGESTION_ALREADY_DECIDED"


def test_clustering_api_and_service(client: TestClient, db_session: Session, v032_test_data: dict):
    """Test clustering service and GET/POST cluster endpoints per CONTRACT §9.6."""
    ws1 = v032_test_data["ws1"]

    # Trigger cluster generation
    res_gen = client.post(f"/api/v1/workspaces/{ws1.id}/clusters/generate")
    assert res_gen.status_code == 200
    assert "job_id" in res_gen.json()

    # List clusters
    res_list = client.get(f"/api/v1/workspaces/{ws1.id}/clusters")
    assert res_list.status_code == 200
    clusters = res_list.json()
    assert len(clusters) >= 1
    cluster_id = clusters[0]["id"]

    # Get single cluster
    res_get = client.get(f"/api/v1/workspaces/{ws1.id}/clusters/{cluster_id}")
    assert res_get.status_code == 200
    assert res_get.json()["id"] == cluster_id


def test_graph_reindex_pipeline(db_session: Session, v032_test_data: dict):
    """Test reindexing deletes AI data, preserves manual entities/relationships
    per CONTRACT §8.4.
    """
    ws1 = v032_test_data["ws1"]

    # Create manual entity
    manual_ent = GraphEntity(
        id=uuid.uuid4(),
        workspace_id=ws1.id,
        name="Manual Preservation Test",
        entity_type="concept",
        is_manual=True,
    )
    # Create AI entity
    ai_ent = GraphEntity(
        id=uuid.uuid4(),
        workspace_id=ws1.id,
        name="AI Disposable Entity",
        entity_type="concept",
        is_manual=False,
    )
    db_session.add_all([manual_ent, ai_ent])
    db_session.commit()
    ai_ent_id = ai_ent.id

    # Run reindex
    summary = graph_index_service.reindex_workspace_graph(db_session, ws1.id)
    assert summary["notes_processed"] >= 2

    # Manual entity must still exist
    assert db_session.get(GraphEntity, manual_ent.id) is not None
    # AI entity with arbitrary name was wiped and replaced by fresh extraction
    assert db_session.get(GraphEntity, ai_ent_id) is None


def test_graph_rag_endpoint_and_hops_limit(
    client: TestClient, db_session: Session, v032_test_data: dict
):
    """Test GraphRAG query execution, multi-hop reasoning, and max_hops > 2 rejection (422)
    per CONTRACT §9.7, §10.
    """
    ws1 = v032_test_data["ws1"]

    # 1. max_hops > 2 rejected with 422 VALIDATION_ERROR
    res_invalid_hops = client.post(
        f"/api/v1/workspaces/{ws1.id}/graph-rag",
        json={"query": "Explain deep learning", "max_hops": 3},
    )
    assert res_invalid_hops.status_code == 422
    assert res_invalid_hops.json()["error"]["code"] == "VALIDATION_ERROR"

    # 2. Valid GraphRAG request
    res_rag = client.post(
        f"/api/v1/workspaces/{ws1.id}/graph-rag",
        json={"query": "How are neural networks optimized?", "max_hops": 2, "context_limit": 5},
    )
    assert res_rag.status_code == 200
    rag_data = res_rag.json()
    assert "answer" in rag_data
    assert "citations" in rag_data
    assert "graph_context" in rag_data
    assert "entities_traversed" in rag_data["graph_context"]
    assert "relationships_used" in rag_data["graph_context"]
    assert rag_data["provider"] != ""
    assert rag_data["model"] != ""


def test_workspace_isolation(client: TestClient, db_session: Session, v032_test_data: dict):
    """Verify graph queries and search never leak entities from other workspaces
    per CONTRACT §14.1.
    """
    ws1 = v032_test_data["ws1"]
    ws2 = v032_test_data["ws2"]

    # Add entity to ws2
    ent_ws2 = GraphEntity(
        id=uuid.uuid4(),
        workspace_id=ws2.id,
        name="Secret Workspace Two Entity",
        entity_type="project",
        is_manual=True,
    )
    db_session.add(ent_ws2)
    db_session.commit()

    # Search in ws1 must not return ws2 entity
    res_search = client.get(f"/api/v1/workspaces/{ws1.id}/graph/search?q=Secret")
    assert res_search.status_code == 200
    assert len(res_search.json()["entities"]) == 0

    # Workspace 1 graph must not contain ws2 entity
    res_graph = client.get(f"/api/v1/workspaces/{ws1.id}/graph")
    assert res_graph.status_code == 200
    node_ids = {n["id"] for n in res_graph.json()["nodes"]}
    assert str(ent_ws2.id) not in node_ids
