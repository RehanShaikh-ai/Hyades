"""Tests for Collections, Threads, Saved Views, Knowledge Inbox, and Extractors (v0.4.2)."""

import uuid
import pytest
from fastapi.testclient import TestClient

from app.models.user import User
from app.models.workspace import Workspace


@pytest.fixture
def workspace_fixture(db_session):
    user = User(
        id=uuid.uuid4(),
        display_name="Test User",
    )
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(
        id=uuid.uuid4(),
        name=f"Workspace_{uuid.uuid4().hex[:8]}",
        owner_id=user.id,
    )
    db_session.add(workspace)
    db_session.commit()
    return workspace


def test_collections_crud_flow(client, workspace_fixture):
    ws_id = str(workspace_fixture.id)

    # 1. Create collection
    res = client.post(
        f"/api/v1/workspaces/{ws_id}/collections",
        json={"name": "Machine Learning", "description": "AI & ML notes"},
    )
    assert res.status_code == 201
    data = res.json()
    col_id = data["id"]
    assert data["name"] == "Machine Learning"

    # 2. List collections
    res = client.get(f"/api/v1/workspaces/{ws_id}/collections")
    assert res.status_code == 200
    list_data = res.json()
    assert list_data["total"] >= 1

    # 3. Get collection
    res = client.get(f"/api/v1/workspaces/{ws_id}/collections/{col_id}")
    assert res.status_code == 200

    # 4. Update collection
    res = client.patch(
        f"/api/v1/workspaces/{ws_id}/collections/{col_id}",
        json={"description": "Updated ML notes"},
    )
    assert res.status_code == 200
    assert res.json()["description"] == "Updated ML notes"

    # 5. Get stats
    res = client.get(f"/api/v1/workspaces/{ws_id}/collections/{col_id}/stats")
    assert res.status_code == 200
    assert res.json()["note_count"] == 0

    # 6. Delete collection
    res = client.delete(f"/api/v1/workspaces/{ws_id}/collections/{col_id}")
    assert res.status_code == 204


def test_threads_crud_flow(client, workspace_fixture):
    ws_id = str(workspace_fixture.id)

    # 1. Create thread
    res = client.post(
        f"/api/v1/workspaces/{ws_id}/threads",
        json={"title": "RAG Investigation", "question": "How does context truncation work?"},
    )
    assert res.status_code == 201
    th_id = res.json()["id"]

    # 2. Add question
    res = client.post(
        f"/api/v1/workspaces/{ws_id}/threads/{th_id}/questions",
        json={"text": "What is the token limit?"},
    )
    assert res.status_code == 201
    q_id = res.json()["id"]

    # 3. List questions
    res = client.get(f"/api/v1/workspaces/{ws_id}/threads/{th_id}/questions")
    assert res.status_code == 200
    assert len(res.json()) == 1

    # 4. Add discovery
    res = client.post(
        f"/api/v1/workspaces/{ws_id}/threads/{th_id}/discoveries",
        json={"content": "Discovered context token limit is 4096."},
    )
    assert res.status_code == 201

    # 5. Get activity feed
    res = client.get(f"/api/v1/workspaces/{ws_id}/threads/{th_id}/activity")
    assert res.status_code == 200
    assert res.json()["total"] >= 2


def test_saved_views_flow(client, workspace_fixture):
    ws_id = str(workspace_fixture.id)

    # Save view
    res = client.post(
        f"/api/v1/workspaces/{ws_id}/saved-views",
        json={
          "name": "Main Cluster View",
          "state": {
            "version": 1,
            "zoom": 1.5,
            "center": {"x": 100.0, "y": 200.0},
            "filters": {},
            "focus_entity_ids": []
          }
        },
    )
    assert res.status_code == 201
    sv_id = res.json()["id"]

    # List saved views
    res = client.get(f"/api/v1/workspaces/{ws_id}/saved-views")
    assert res.status_code == 200
    assert res.json()["total"] >= 1

    # Delete view
    res = client.delete(f"/api/v1/workspaces/{ws_id}/saved-views/{sv_id}")
    assert res.status_code == 204
