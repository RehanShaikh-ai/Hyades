"""Contract & API tests for Saved Observatory Views per CONTRACT v0.4.2 §7.1, §7.5, §8.3, §13."""

import uuid
from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from app.models.collection import Collection, CollectionEntity
from app.models.graph_entity import GraphEntity
from app.models.saved_view import SavedView
from app.models.thread import Thread, ThreadEntity
from app.models.user import User
from app.models.workspace import Workspace
from app.services.graph_index_service import is_entity_referenced_in_memberships


@pytest.fixture
def workspace_with_user(db_session: Session) -> tuple[Workspace, User]:
    user = User(display_name=f"Tester_{uuid.uuid4().hex[:6]}")
    db_session.add(user)
    db_session.commit()

    ws = Workspace(name=f"Observatory WS {uuid.uuid4().hex[:6]}", owner_id=user.id)
    db_session.add(ws)
    db_session.commit()
    db_session.refresh(ws)
    return ws, user


def test_saved_views_crud_lifecycle(client: TestClient, db_session: Session, workspace_with_user):
    ws, user = workspace_with_user

    # 1. Create a Saved View
    payload = {
        "workspace_id": str(ws.id),
        "name": "Cluster Analysis View",
        "state": {
            "version": 1,
            "zoom": 1.5,
            "center": {"x": 120.5, "y": -45.0},
            "filters": {"type": "concept"},
            "focus_entity_ids": [str(uuid.uuid4())],
        },
        "created_by": str(user.id),
    }
    res = client.post("/api/v1/saved-views", json=payload)
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["name"] == "Cluster Analysis View"
    assert data["state"]["zoom"] == 1.5
    view_id = data["id"]

    # 2. Get by ID
    res = client.get(f"/api/v1/saved-views/{view_id}")
    assert res.status_code == 200
    assert res.json()["id"] == view_id

    # 3. List
    res = client.get(f"/api/v1/saved-views?workspace_id={ws.id}")
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) >= 1
    assert any(v["id"] == view_id for v in items)

    # 4. Patch / Rename & Update state
    patch_payload = {
        "name": "Updated Cluster View",
        "state": {
            "version": 1,
            "zoom": 2.0,
            "center": {"x": 0.0, "y": 0.0},
            "filters": {},
            "focus_entity_ids": [],
        },
    }
    res = client.patch(f"/api/v1/saved-views/{view_id}", json=patch_payload)
    assert res.status_code == 200
    assert res.json()["name"] == "Updated Cluster View"
    assert res.json()["state"]["zoom"] == 2.0

    # 5. Duplicate name in same workspace rejected with 409
    dup_payload = {
        "workspace_id": str(ws.id),
        "name": "Updated Cluster View",
        "state": {
            "version": 1,
            "zoom": 1.0,
            "center": {"x": 0.0, "y": 0.0},
            "filters": {},
            "focus_entity_ids": [],
        },
    }
    res = client.post("/api/v1/saved-views", json=dup_payload)
    assert res.status_code == 409

    # 6. Delete
    res = client.delete(f"/api/v1/saved-views/{view_id}")
    assert res.status_code == 204

    # 7. Confirm 404 after deletion
    res = client.get(f"/api/v1/saved-views/{view_id}")
    assert res.status_code == 404


def test_saved_view_schema_validation_and_size_limit(client: TestClient, workspace_with_user):
    ws, _ = workspace_with_user

    # Reject unknown keys in state
    bad_payload = {
        "workspace_id": str(ws.id),
        "name": "Invalid State View",
        "state": {
            "version": 1,
            "zoom": 1.0,
            "center": {"x": 0.0, "y": 0.0},
            "filters": {},
            "focus_entity_ids": [],
            "unknown_extra_field": "disallowed",
        },
    }
    res = client.post("/api/v1/saved-views", json=bad_payload)
    assert res.status_code == 422

    # Reject state exceeding 50KB limit
    large_filters = {"data": "x" * 55000}
    oversized_payload = {
        "workspace_id": str(ws.id),
        "name": "Oversized State View",
        "state": {
            "version": 1,
            "zoom": 1.0,
            "center": {"x": 0.0, "y": 0.0},
            "filters": large_filters,
            "focus_entity_ids": [],
        },
    }
    res = client.post("/api/v1/saved-views", json=oversized_payload)
    assert res.status_code == 422


def test_saved_view_restore_ignores_deleted_entities(client: TestClient, db_session: Session, workspace_with_user):
    ws, _ = workspace_with_user

    # Create real entity
    ent = GraphEntity(workspace_id=ws.id, name="Active Concept", entity_type="concept")
    db_session.add(ent)
    db_session.commit()
    db_session.refresh(ent)

    deleted_or_missing_id = str(uuid.uuid4())

    # Create saved view referencing real entity and missing entity
    payload = {
        "workspace_id": str(ws.id),
        "name": "Restore Test View",
        "state": {
            "version": 1,
            "zoom": 1.0,
            "center": {"x": 10.0, "y": 20.0},
            "filters": {},
            "focus_entity_ids": [str(ent.id), deleted_or_missing_id],
        },
    }
    res = client.post("/api/v1/saved-views", json=payload)
    assert res.status_code == 201
    view_id = res.json()["id"]

    # Call restore
    res = client.post(f"/api/v1/saved-views/{view_id}/restore")
    assert res.status_code == 200
    restore_data = res.json()
    assert str(ent.id) in [str(x) for x in restore_data["active_focus_entity_ids"]]
    assert deleted_or_missing_id in restore_data["missing_focus_entity_ids"]


def test_reindex_safety_referenced_entities_protected(db_session: Session, workspace_with_user):
    """CONTRACT §7.5: Verify reindex safety preserves entities referenced in collections or threads."""
    ws, user = workspace_with_user

    # 1. Create entities
    ent_in_coll = GraphEntity(workspace_id=ws.id, name="Collection Protected Concept", entity_type="concept")
    ent_in_thread = GraphEntity(workspace_id=ws.id, name="Thread Protected Concept", entity_type="concept")
    ent_orphan = GraphEntity(workspace_id=ws.id, name="Unreferenced Concept", entity_type="concept")
    db_session.add_all([ent_in_coll, ent_in_thread, ent_orphan])
    db_session.flush()

    # 2. Add to Collection
    coll = Collection(workspace_id=ws.id, name=f"Safety Coll {uuid.uuid4().hex[:6]}", created_by=user.id)
    db_session.add(coll)
    db_session.flush()
    db_session.add(CollectionEntity(collection_id=coll.id, entity_id=ent_in_coll.id))

    # 3. Add to Thread
    thread = Thread(workspace_id=ws.id, title=f"Safety Thread {uuid.uuid4().hex[:6]}", created_by=user.id)
    db_session.add(thread)
    db_session.flush()
    db_session.add(ThreadEntity(thread_id=thread.id, entity_id=ent_in_thread.id))

    db_session.commit()

    # 4. Verify is_entity_referenced_in_memberships
    assert is_entity_referenced_in_memberships(db_session, ent_in_coll.id) is True
    assert is_entity_referenced_in_memberships(db_session, ent_in_thread.id) is True
    assert is_entity_referenced_in_memberships(db_session, ent_orphan.id) is False
