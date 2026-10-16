"""Contract & API tests for Knowledge Inbox per CONTRACT v0.4.2 §7.1, §8.4, §12."""

import io
import uuid
from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from app.models.graph_entity import GraphEntity
from app.models.inbox_item import InboxItem
from app.models.source import Source
from app.models.user import User
from app.models.workspace import Workspace


@pytest.fixture
def workspace_with_user(db_session: Session) -> tuple[Workspace, User]:
    user = User(display_name=f"InboxTester_{uuid.uuid4().hex[:6]}")
    db_session.add(user)
    db_session.commit()

    ws = Workspace(name=f"Inbox WS {uuid.uuid4().hex[:6]}", owner_id=user.id)
    db_session.add(ws)
    db_session.commit()
    db_session.refresh(ws)
    return ws, user


def test_inbox_upload_and_dry_run_detection(client: TestClient, db_session: Session, workspace_with_user):
    ws, _ = workspace_with_user

    # 1. Upload markdown file with review_mode=inbox
    file_content = b"# Quantum Computing\nQuantum computing uses qubits and superposition to solve complex problems."
    files = {"file": ("quantum.md", io.BytesIO(file_content), "text/markdown")}
    
    res = client.post(f"/api/v1/sources/upload?workspace_id={ws.id}&review_mode=inbox", files=files)
    assert res.status_code == 201, res.text
    source_data = res.json()
    source_id = source_data["id"]

    # 2. Verify InboxItem was created
    res = client.get(f"/api/v1/inbox?workspace_id={ws.id}")
    assert res.status_code == 200
    inbox_items = res.json()["items"]
    assert len(inbox_items) >= 1
    item = next(i for i in inbox_items if i["source_id"] == source_id)
    assert item["status"] == "pending"
    assert item["detection_status"] in ("completed", "queued", "processing")
    inbox_item_id = item["id"]

    # 3. Check detailed view with detected concepts
    res = client.get(f"/api/v1/inbox/{inbox_item_id}")
    assert res.status_code == 200
    detail = res.json()
    assert detail["id"] == inbox_item_id
    assert "detected_entities" in detail

    # CONTRACT §12.3: Dry run writes NO graph records!
    entities_count = db_session.query(GraphEntity).filter(GraphEntity.workspace_id == ws.id).count()
    assert entities_count == 0, "Dry run detection must write ZERO graph entities!"


def test_inbox_patch_read_only_detected_concepts(client: TestClient, workspace_with_user):
    ws, _ = workspace_with_user

    # Upload file
    files = {"file": ("notes.txt", io.BytesIO(b"General notes"), "text/plain")}
    res = client.post(f"/api/v1/sources/upload?workspace_id={ws.id}&review_mode=inbox", files=files)
    assert res.status_code == 201

    res = client.get(f"/api/v1/inbox?workspace_id={ws.id}")
    inbox_item_id = res.json()["items"][0]["id"]

    # PATCH title and extraction setting
    patch_payload = {
        "source_title": "Renamed General Notes",
        "extract_knowledge": False,
    }
    res = client.patch(f"/api/v1/inbox/{inbox_item_id}", json=patch_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["source_title"] == "Renamed General Notes"
    assert data["extract_knowledge"] is False


def test_inbox_accept_lifecycle(client: TestClient, db_session: Session, workspace_with_user):
    ws, _ = workspace_with_user

    files = {"file": ("accepted.txt", io.BytesIO(b"Content for acceptance"), "text/plain")}
    res = client.post(f"/api/v1/sources/upload?workspace_id={ws.id}&review_mode=inbox", files=files)
    assert res.status_code == 201
    source_id = res.json()["id"]

    res = client.get(f"/api/v1/inbox?workspace_id={ws.id}")
    inbox_item_id = res.json()["items"][0]["id"]

    # Accept
    res = client.post(f"/api/v1/inbox/{inbox_item_id}/accept")
    assert res.status_code == 200
    assert res.json()["status"] == "accepted"

    # Verify source remains in Library
    source = db_session.get(Source, uuid.UUID(source_id))
    assert source is not None

    # Verify status changed to accepted
    res = client.get(f"/api/v1/inbox/{inbox_item_id}")
    assert res.status_code == 200
    assert res.json()["status"] == "accepted"
    assert res.json()["decided_at"] is not None


def test_inbox_reject_lifecycle_and_content_purge(client: TestClient, db_session: Session, workspace_with_user):
    ws, _ = workspace_with_user

    files = {"file": ("rejected.txt", io.BytesIO(b"Content to reject"), "text/plain")}
    res = client.post(f"/api/v1/sources/upload?workspace_id={ws.id}&review_mode=inbox", files=files)
    assert res.status_code == 201
    source_id = res.json()["id"]

    res = client.get(f"/api/v1/inbox?workspace_id={ws.id}&status=pending")
    inbox_item_id = res.json()["items"][0]["id"]

    # Reject item
    res = client.post(f"/api/v1/inbox/{inbox_item_id}/reject")
    assert res.status_code == 200
    assert res.json()["status"] == "rejected"

    # Verify item is absent from pending and present in rejected
    pending_res = client.get(f"/api/v1/inbox?workspace_id={ws.id}&status=pending")
    assert len(pending_res.json()["items"]) == 0

    rejected_res = client.get(f"/api/v1/inbox?workspace_id={ws.id}&status=rejected")
    assert len(rejected_res.json()["items"]) == 1
    assert rejected_res.json()["items"][0]["id"] == inbox_item_id
    assert rejected_res.json()["items"][0]["status"] == "rejected"

    # Verify second reject attempt is rejected with 409 Conflict
    conflict_res = client.post(f"/api/v1/inbox/{inbox_item_id}/reject")
    assert conflict_res.status_code == 409


def test_inbox_status_transitions_and_filtering(client: TestClient, workspace_with_user):
    ws, _ = workspace_with_user

    # 1. Upload three distinct items
    item_ids = []
    for name in ["doc_alpha.txt", "doc_beta.txt", "doc_gamma.txt"]:
        files = {"file": (name, io.BytesIO(f"Content of {name}".encode("utf-8")), "text/plain")}
        res = client.post(f"/api/v1/sources/upload?workspace_id={ws.id}&review_mode=inbox", files=files)
        assert res.status_code == 201

    # Fetch initial pending items
    res = client.get(f"/api/v1/inbox?workspace_id={ws.id}&status=pending")
    assert res.status_code == 200
    assert len(res.json()["items"]) == 3
    items = res.json()["items"]
    alpha_id, beta_id, gamma_id = items[0]["id"], items[1]["id"], items[2]["id"]

    # 2. Accept doc alpha
    res_acc = client.post(f"/api/v1/inbox/{alpha_id}/accept")
    assert res_acc.status_code == 200
    assert res_acc.json()["status"] == "accepted"

    # Duplicate accept rejected with 409
    res_acc_dup = client.post(f"/api/v1/inbox/{alpha_id}/accept")
    assert res_acc_dup.status_code == 409

    # 3. Reject doc beta
    res_rej = client.post(f"/api/v1/inbox/{beta_id}/reject")
    assert res_rej.status_code == 200
    assert res_rej.json()["status"] == "rejected"

    # Duplicate reject rejected with 409
    res_rej_dup = client.post(f"/api/v1/inbox/{beta_id}/reject")
    assert res_rej_dup.status_code == 409

    # 4. Check filters:
    # Pending: exactly 1 item (gamma)
    res_pending = client.get(f"/api/v1/inbox?workspace_id={ws.id}&status=pending")
    assert res_pending.status_code == 200
    assert len(res_pending.json()["items"]) == 1
    assert res_pending.json()["items"][0]["id"] == gamma_id

    # Accepted: exactly 1 item (alpha)
    res_accepted = client.get(f"/api/v1/inbox?workspace_id={ws.id}&status=accepted")
    assert res_accepted.status_code == 200
    assert len(res_accepted.json()["items"]) == 1
    assert res_accepted.json()["items"][0]["id"] == alpha_id

    # Rejected: exactly 1 item (beta)
    res_rejected = client.get(f"/api/v1/inbox?workspace_id={ws.id}&status=rejected")
    assert res_rejected.status_code == 200
    assert len(res_rejected.json()["items"]) == 1
    assert res_rejected.json()["items"][0]["id"] == beta_id

    # All: exactly 3 items with distinct statuses
    res_all = client.get(f"/api/v1/inbox?workspace_id={ws.id}&status=all")
    assert res_all.status_code == 200
    all_items = res_all.json()["items"]
    assert len(all_items) == 3
    statuses = {item["id"]: item["status"] for item in all_items}
    assert statuses[alpha_id] == "accepted"
    assert statuses[beta_id] == "rejected"
    assert statuses[gamma_id] == "pending" 


def test_inbox_image_detection_not_applicable(client: TestClient, workspace_with_user):
    ws, _ = workspace_with_user

    # Minimal 1x1 PNG bytes
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    files = {"file": ("test.png", io.BytesIO(png_bytes), "image/png")}
    
    res = client.post(f"/api/v1/sources/upload?workspace_id={ws.id}&review_mode=inbox", files=files)
    assert res.status_code == 201
    source_id = res.json()["id"]

    res = client.get(f"/api/v1/inbox?workspace_id={ws.id}")
    assert res.status_code == 200
    item = next(i for i in res.json()["items"] if i["source_id"] == source_id)
    # CONTRACT §12.2: Image detection_status = not_applicable
    assert item["detection_status"] == "not_applicable"
    assert item["detected_count"] == 0
