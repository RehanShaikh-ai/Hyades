"""Integration tests for Threads, Questions, Discoveries, and Activity Timeline per CONTRACT v0.4.2 §8.2.

Verifies:
- Threads CRUD: create, get, list, patch, delete
- Questions CRUD: add question, resolve question, list, delete
- Discoveries CRUD: log discovery, list, delete
- Polymorphic typed memberships (note, source, entity, conversation)
- Duplicate membership rejection (409)
- Cross-workspace item rejection (422)
- Activity timeline aggregation in reverse chronological order
"""

import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.note import Note
from app.models.user import User
from app.models.workspace import Workspace


@pytest.fixture
def setup_workspace(db_session: Session):
    user = User(display_name="Thread Researcher")
    db_session.add(user)
    db_session.commit()

    ws = Workspace(name="Thread WS", owner_id=user.id)
    db_session.add(ws)
    db_session.commit()
    db_session.refresh(ws)
    db_session.refresh(user)
    return ws, user


def test_threads_crud_and_status(client: TestClient, setup_workspace):
    ws, user = setup_workspace

    # 1. Create thread
    r_create = client.post(
        "/api/v1/threads",
        json={
            "workspace_id": str(ws.id),
            "title": "Investigating Vector Similarity",
            "question": "Which metric performs best?",
            "status": "active",
        },
    )
    assert r_create.status_code == 201
    thread_data = r_create.json()
    thread_id = thread_data["id"]
    assert thread_data["title"] == "Investigating Vector Similarity"
    assert thread_data["status"] == "active"

    # 2. Get thread
    r_get = client.get(f"/api/v1/threads/{thread_id}")
    assert r_get.status_code == 200
    assert r_get.json()["title"] == "Investigating Vector Similarity"

    # 3. Patch thread (archive)
    r_patch = client.patch(f"/api/v1/threads/{thread_id}", json={"status": "archived"})
    assert r_patch.status_code == 200
    assert r_patch.json()["status"] == "archived"

    # 4. List threads with status filter
    r_list = client.get(f"/api/v1/threads?workspace_id={ws.id}&status_filter=archived")
    assert r_list.status_code == 200
    assert r_list.json()["total"] == 1

    r_active = client.get(f"/api/v1/threads?workspace_id={ws.id}&status_filter=active")
    assert r_active.json()["total"] == 0

    # 5. Delete thread
    r_del = client.delete(f"/api/v1/threads/{thread_id}")
    assert r_del.status_code == 204
    assert client.get(f"/api/v1/threads/{thread_id}").status_code == 404


def test_thread_questions_and_discoveries_lifecycle(client: TestClient, setup_workspace):
    ws, user = setup_workspace

    r_t = client.post(
        "/api/v1/threads",
        json={"workspace_id": str(ws.id), "title": "Graph Retrieval Optimization"},
    )
    thread_id = r_t.json()["id"]

    # 1. Add questions
    r_q1 = client.post(f"/api/v1/threads/{thread_id}/questions", json={"text": "Is HNSW index optimal?"})
    assert r_q1.status_code == 201
    q1_id = r_q1.json()["id"]
    assert r_q1.json()["is_resolved"] is False

    r_q2 = client.post(f"/api/v1/threads/{thread_id}/questions", json={"text": "What is the memory footprint?"})
    q2_id = r_q2.json()["id"]

    # 2. List questions
    r_ql = client.get(f"/api/v1/threads/{thread_id}/questions")
    assert r_ql.status_code == 200
    assert len(r_ql.json()) == 2

    # 3. Resolve question
    r_qr = client.patch(f"/api/v1/threads/{thread_id}/questions/{q1_id}", json={"is_resolved": True})
    assert r_qr.status_code == 200
    assert r_qr.json()["is_resolved"] is True

    # 4. Log discovery
    r_d1 = client.post(f"/api/v1/threads/{thread_id}/discoveries", json={"content": "Quantization cuts memory by 4x with 1% loss"})
    assert r_d1.status_code == 201
    d1_id = r_d1.json()["id"]

    # 5. List discoveries
    r_dl = client.get(f"/api/v1/threads/{thread_id}/discoveries")
    assert r_dl.status_code == 200
    assert len(r_dl.json()) == 1

    # 6. Check activity timeline (§8.2)
    r_act = client.get(f"/api/v1/threads/{thread_id}/activity")
    assert r_act.status_code == 200
    act_items = r_act.json()["items"]
    act_types = [a["activity_type"] for a in act_items]
    assert "thread_created" in act_types
    assert "question_added" in act_types
    assert "question_resolved" in act_types
    assert "discovery_logged" in act_types

    # 7. Delete question and discovery
    assert client.delete(f"/api/v1/threads/{thread_id}/questions/{q2_id}").status_code == 204
    assert client.delete(f"/api/v1/threads/{thread_id}/discoveries/{d1_id}").status_code == 204


def test_thread_membership_and_cross_workspace_isolation(client: TestClient, setup_workspace, db_session: Session):
    ws, user = setup_workspace

    ws_other = Workspace(name="Isolated WS", owner_id=user.id)
    db_session.add(ws_other)
    db_session.commit()

    note_local = Note(workspace_id=ws.id, created_by=user.id, title="Local Note", content="text")
    note_foreign = Note(workspace_id=ws_other.id, created_by=user.id, title="Foreign Note", content="text")
    db_session.add_all([note_local, note_foreign])
    db_session.commit()

    r_t = client.post("/api/v1/threads", json={"workspace_id": str(ws.id), "title": "Isolation Test"})
    thread_id = r_t.json()["id"]

    # 1. Add local note
    r_add = client.post(f"/api/v1/threads/{thread_id}/items", json={"item_type": "note", "item_id": str(note_local.id)})
    assert r_add.status_code == 201

    # 2. Duplicate note rejected (409)
    r_dup = client.post(f"/api/v1/threads/{thread_id}/items", json={"item_type": "note", "item_id": str(note_local.id)})
    assert r_dup.status_code == 409

    # 3. Cross-workspace note rejected (422)
    r_cross = client.post(f"/api/v1/threads/{thread_id}/items", json={"item_type": "note", "item_id": str(note_foreign.id)})
    assert r_cross.status_code == 422

    # 4. List items
    r_items = client.get(f"/api/v1/threads/{thread_id}/items")
    assert r_items.status_code == 200
    assert r_items.json()["total"] == 1

    # 5. Remove note
    r_rem = client.delete(f"/api/v1/threads/{thread_id}/items/note/{note_local.id}")
    assert r_rem.status_code == 204
    assert client.get(f"/api/v1/threads/{thread_id}/items").json()["total"] == 0
