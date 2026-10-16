"""Integration tests for Collections and Membership API per CONTRACT v0.4.2 §8.1, §6.2, §14.1, §14.3.

Verifies:
- Collections CRUD: create, get, list, patch, delete
- Unique (workspace_id, name) returns 409 CONFLICT
- Adding items: note, source, entity, conversation
- Duplicate membership returns 409 CONFLICT
- Cross-workspace item returns 422 VALIDATION_ERROR
- Deleting membership removes link without deleting target object
- Stats endpoint returns accurate type breakdown
- Related knowledge computes linked entities dynamically without mutating graph
"""

import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.collection import Collection
from app.models.graph_entity import GraphEntity
from app.models.note import Note
from app.models.source import Source
from app.models.user import User
from app.models.workspace import Workspace


@pytest.fixture
def setup_workspace(db_session: Session):
    user = User(display_name="Collection Tester")
    db_session.add(user)
    db_session.commit()

    ws = Workspace(name="Test Collection WS", owner_id=user.id)
    db_session.add(ws)
    db_session.commit()
    db_session.refresh(ws)
    db_session.refresh(user)
    return ws, user


def test_collections_crud(client: TestClient, setup_workspace):
    ws, user = setup_workspace

    # 1. Create collection
    create_payload = {
        "workspace_id": str(ws.id),
        "name": "Machine Learning",
        "description": "ML papers and notes",
        "icon": "brain",
    }
    r = client.post("/api/v1/collections", json=create_payload)
    assert r.status_code == 201
    coll_data = r.json()
    coll_id = coll_data["id"]
    assert coll_data["name"] == "Machine Learning"
    assert coll_data["description"] == "ML papers and notes"

    # 2. Duplicate name in same workspace returns 409
    r_dup = client.post("/api/v1/collections", json=create_payload)
    assert r_dup.status_code == 409

    # 3. Get collection
    r_get = client.get(f"/api/v1/collections/{coll_id}")
    assert r_get.status_code == 200
    assert r_get.json()["name"] == "Machine Learning"

    # 4. List collections
    r_list = client.get(f"/api/v1/collections?workspace_id={ws.id}")
    assert r_list.status_code == 200
    assert r_list.json()["total"] == 1
    assert r_list.json()["items"][0]["id"] == coll_id

    # 5. Patch collection
    r_patch = client.patch(f"/api/v1/collections/{coll_id}", json={"name": "Deep Learning"})
    assert r_patch.status_code == 200
    assert r_patch.json()["name"] == "Deep Learning"

    # 6. Delete collection
    r_del = client.delete(f"/api/v1/collections/{coll_id}")
    assert r_del.status_code == 204

    # Verify 404 after delete
    r_after = client.get(f"/api/v1/collections/{coll_id}")
    assert r_after.status_code == 404


def test_collection_membership_and_cross_workspace_rejection(client: TestClient, setup_workspace, db_session: Session):
    ws, user = setup_workspace

    # Create another workspace for cross-workspace testing
    ws_other = Workspace(name="Other WS", owner_id=user.id)
    db_session.add(ws_other)
    db_session.commit()

    # Create note in WS 1
    note1 = Note(workspace_id=ws.id, created_by=user.id, title="PyTorch Guide", content="Guide text")
    # Create note in WS Other
    note_other = Note(workspace_id=ws_other.id, created_by=user.id, title="Other WS Note", content="Secret text")
    # Create source in WS 1
    src1 = Source(
        workspace_id=ws.id, source_type="pdf", original_path="/path/test.pdf",
        source_identifier="/path/test.pdf", content_hash="123", import_batch_id=uuid.uuid4(),
        import_status="completed"
    )
    # Create entity in WS 1
    ent1 = GraphEntity(workspace_id=ws.id, name="Gradient Descent", entity_type="concept", is_manual=True)

    db_session.add_all([note1, note_other, src1, ent1])
    db_session.commit()

    # Create Collection in WS 1
    r_coll = client.post("/api/v1/collections", json={"workspace_id": str(ws.id), "name": "AI Foundations"})
    coll_id = r_coll.json()["id"]

    # 1. Add Note to collection
    r_add_note = client.post(f"/api/v1/collections/{coll_id}/items", json={"item_type": "note", "item_id": str(note1.id)})
    assert r_add_note.status_code == 201
    assert r_add_note.json()["title"] == "PyTorch Guide"

    # 2. Duplicate item returns 409 CONFLICT (§6.2)
    r_dup = client.post(f"/api/v1/collections/{coll_id}/items", json={"item_type": "note", "item_id": str(note1.id)})
    assert r_dup.status_code == 409

    # 3. Cross-workspace item returns 422 (§6.2, §6.3)
    r_cross = client.post(f"/api/v1/collections/{coll_id}/items", json={"item_type": "note", "item_id": str(note_other.id)})
    assert r_cross.status_code == 422

    # 4. Add Source and Entity
    client.post(f"/api/v1/collections/{coll_id}/items", json={"item_type": "source", "item_id": str(src1.id)})
    client.post(f"/api/v1/collections/{coll_id}/items", json={"item_type": "entity", "item_id": str(ent1.id)})

    # 5. List items
    r_items = client.get(f"/api/v1/collections/{coll_id}/items")
    assert r_items.status_code == 200
    assert r_items.json()["total"] == 3
    types = [it["item_type"] for it in r_items.json()["items"]]
    assert "note" in types
    assert "source" in types
    assert "entity" in types

    # 6. Check Stats endpoint (§8.1)
    r_stats = client.get(f"/api/v1/collections/{coll_id}/stats")
    assert r_stats.status_code == 200
    stats = r_stats.json()
    assert stats["note_count"] == 1
    assert stats["source_count"] == 1
    assert stats["entity_count"] == 1
    assert stats["total_items"] == 3

    # 7. Remove item from collection without deleting target note (§6.2)
    r_del_item = client.delete(f"/api/v1/collections/{coll_id}/items/note/{note1.id}")
    assert r_del_item.status_code == 204

    # Verify note still exists in DB
    assert db_session.query(Note).filter(Note.id == note1.id).first() is not None

    # Verify item removed from collection
    r_after = client.get(f"/api/v1/collections/{coll_id}/items")
    assert r_after.json()["total"] == 2


from app.models.content_chunk import ContentChunk
from app.models.entity_chunk import EntityChunk
from app.models.graph_relationship import GraphRelationship


def test_collection_related_knowledge_dynamic_without_graph_mutation(client: TestClient, setup_workspace, db_session: Session):
    ws, user = setup_workspace

    note = Note(workspace_id=ws.id, created_by=user.id, title="Quantum Computing", content="Qubits and entanglement")
    ent = GraphEntity(workspace_id=ws.id, name="Superposition", entity_type="concept", is_manual=True)
    db_session.add_all([note, ent])
    db_session.commit()

    chunk = ContentChunk(
        workspace_id=ws.id, note_id=note.id, chunk_index=0, content="Entanglement",
        content_hash="h1", token_count=1, embedding_model="bge", embedding_dimension=384
    )
    db_session.add(chunk)
    db_session.commit()

    ec = EntityChunk(
        entity_id=ent.id, chunk_id=chunk.id, note_id=note.id, workspace_id=ws.id,
        extraction_model="test", confidence=1.0
    )
    db_session.add(ec)
    db_session.commit()

    # Create collection with only the note (not the entity)
    r_coll = client.post("/api/v1/collections", json={"workspace_id": str(ws.id), "name": "Physics"})
    coll_id = r_coll.json()["id"]
    client.post(f"/api/v1/collections/{coll_id}/items", json={"item_type": "note", "item_id": str(note.id)})

    rel_count_before = db_session.query(GraphRelationship).count()

    # Call related knowledge
    r_rel = client.get(f"/api/v1/collections/{coll_id}/related")
    assert r_rel.status_code == 200
    rel_data = r_rel.json()
    assert rel_data["total"] >= 1
    titles = [it["title"] for it in rel_data["items"]]
    assert "Superposition" in titles

    # Contract §14.3: Never mutates graph relationships table
    rel_count_after = db_session.query(GraphRelationship).count()
    assert rel_count_before == rel_count_after
