"""Integration tests for Actions API endpoints per CONTRACT v0.5.1 §3.1, §5, §6, §9, §11.

Covers:
- GET /actions (catalogue)
- POST /actions/{id}/execute (two-phase proposal, confirmation, read action execution)
- Validation errors and unknown action handling
- Confirmation token validation (invalid, expired, reused)
- POST /actions/proposals/{id}/reject
- POST /actions/change-sets/{id}/undo
- GET /actions/executions/{id}
- GET /actions/executions (listing and pagination)
- POST /actions/executions/{id}/cancel
- Workspace isolation and scoping
- Concurrency limiting (§11.2)
- Idempotency deduplication (§11.3)
"""

import uuid
from datetime import UTC, datetime
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import ActionChangeSet, ActionExecution, ActionProposal, Note, User, Workspace


def _create_workspace_and_user(db: Session) -> tuple[Workspace, User]:
    user = User(display_name="API Tester")
    db.add(user)
    db.commit()
    ws = Workspace(name="API Test WS", owner_id=user.id)
    db.add(ws)
    db.commit()
    return ws, user


def test_catalogue_endpoint(client: TestClient):
    """GET /actions returns exactly 37 canonical actions with id and metadata."""
    response = client.get("/api/v1/actions")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 37
    assert len(data["actions"]) == 37
    action_ids = [a["id"] for a in data["actions"]]
    assert "knowledge.search_all" in action_ids
    assert "notes.create" in action_ids
    assert "notes.delete" in action_ids


def test_execute_unknown_action_returns_404(client: TestClient, db_session: Session):
    """Executing an unregistered action returns 404 NOT_FOUND."""
    ws, _ = _create_workspace_and_user(db_session)
    response = client.post(
        "/api/v1/actions/unknown.action/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={"mode": "read", "input": {}, "idempotency_key": str(uuid.uuid4())},
    )
    assert response.status_code == 404


def test_execute_invalid_parameters_returns_422(client: TestClient, db_session: Session):
    """Executing an action with missing or invalid parameters returns 422."""
    ws, _ = _create_workspace_and_user(db_session)
    # notes.get requires note_id
    response = client.post(
        "/api/v1/actions/notes.get/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={"mode": "read", "input": {}, "idempotency_key": str(uuid.uuid4())},
    )
    assert response.status_code == 422


def test_execute_read_action_lifecycle(client: TestClient, db_session: Session):
    """Read action executes immediately and transitions to succeeded."""
    ws, user = _create_workspace_and_user(db_session)
    note = Note(workspace_id=ws.id, created_by=user.id, title="Test Note", content="Sample content")
    db_session.add(note)
    db_session.commit()

    response = client.post(
        "/api/v1/actions/notes.get/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "read",
            "input": {"note_id": str(note.id)},
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "succeeded"
    assert data["action_id"] == "notes.get"
    assert data["result"]["note"]["title"] == "Test Note"
    assert len(data["evidence"]) >= 1


def test_two_phase_controlled_write_lifecycle(client: TestClient, db_session: Session):
    """Phase 1 creates a proposal; Phase 2 with confirmation token commits it."""
    ws, user = _create_workspace_and_user(db_session)

    # 1. Propose note creation
    response = client.post(
        "/api/v1/actions/notes.create/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "propose",
            "input": {"title": "Proposed Note", "content": "Body text"},
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert response.status_code == 200
    prop_data = response.json()
    assert prop_data["status"] == "proposed"
    assert len(prop_data["proposals"]) == 1
    proposal = prop_data["proposals"][0]
    token = proposal["confirmation_token"]
    assert token is not None
    assert proposal["changes"]["title"] == "Proposed Note"

    # Verify no Note exists in DB yet
    notes_in_db = db_session.query(Note).filter_by(workspace_id=ws.id, title="Proposed Note").all()
    assert len(notes_in_db) == 0

    # 2. Commit with confirmation token
    commit_response = client.post(
        "/api/v1/actions/notes.create/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "commit",
            "input": {"title": "Proposed Note", "content": "Body text"},
            "idempotency_key": str(uuid.uuid4()),
            "confirmation_token": token,
        },
    )
    assert commit_response.status_code == 200
    commit_data = commit_response.json()
    assert commit_data["status"] == "succeeded"
    assert commit_data["result"]["title"] == "Proposed Note"
    assert len(commit_data["committed_changes"]) == 1
    assert commit_data["committed_changes"][0]["change_set_id"] is not None

    # Note now exists in DB
    created_note = db_session.query(Note).filter_by(workspace_id=ws.id, title="Proposed Note").first()
    assert created_note is not None


def test_confirmation_token_reuse_rejected(client: TestClient, db_session: Session):
    """Attempting to reuse a confirmation token returns 409 Conflict."""
    ws, _ = _create_workspace_and_user(db_session)

    # Propose
    r1 = client.post(
        "/api/v1/actions/notes.create/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "propose",
            "input": {"title": "One-Time Note"},
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    token = r1.json()["proposals"][0]["confirmation_token"]

    # Commit 1 (success)
    r2 = client.post(
        "/api/v1/actions/notes.create/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "commit",
            "input": {"title": "One-Time Note"},
            "idempotency_key": str(uuid.uuid4()),
            "confirmation_token": token,
        },
    )
    assert r2.status_code == 200

    # Commit 2 (reuse attempt -> 409)
    r3 = client.post(
        "/api/v1/actions/notes.create/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "commit",
            "input": {"title": "One-Time Note"},
            "idempotency_key": str(uuid.uuid4()),
            "confirmation_token": token,
        },
    )
    assert r3.status_code == 409


def test_invalid_confirmation_token_rejected(client: TestClient, db_session: Session):
    """Providing a non-existent or invalid confirmation token returns 400/404."""
    ws, _ = _create_workspace_and_user(db_session)
    response = client.post(
        "/api/v1/actions/notes.create/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "commit",
            "input": {"title": "Fail Note"},
            "idempotency_key": str(uuid.uuid4()),
            "confirmation_token": "bogus-fake-token-12345",
        },
    )
    assert response.status_code in (400, 404)


def test_reject_proposal(client: TestClient, db_session: Session):
    """Rejecting a proposal prevents confirmation."""
    ws, _ = _create_workspace_and_user(db_session)

    # Propose
    r = client.post(
        "/api/v1/actions/notes.create/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "propose",
            "input": {"title": "To Reject"},
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    proposal = r.json()["proposals"][0]
    token = proposal["confirmation_token"]
    proposal_id = proposal["proposal_id"]

    # Reject
    rej = client.post(
        f"/api/v1/actions/proposals/{proposal_id}/reject",
        headers={"X-Workspace-Id": str(ws.id)},
    )
    assert rej.status_code == 200
    assert rej.json()["status"] == "rejected"

    # Attempt commit after rejection -> 409
    commit_res = client.post(
        "/api/v1/actions/notes.create/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "commit",
            "input": {"title": "To Reject"},
            "idempotency_key": str(uuid.uuid4()),
            "confirmation_token": token,
        },
    )
    assert commit_res.status_code == 409


def test_undo_change_set_lifecycle(client: TestClient, db_session: Session):
    """Committed change set can be undone via POST /actions/change-sets/{id}/undo."""
    ws, _ = _create_workspace_and_user(db_session)

    # 1. Propose & commit note creation
    r1 = client.post(
        "/api/v1/actions/notes.create/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "propose",
            "input": {"title": "Undo Me Note", "content": "Initial content"},
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    token = r1.json()["proposals"][0]["confirmation_token"]

    r2 = client.post(
        "/api/v1/actions/notes.create/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "commit",
            "input": {"title": "Undo Me Note", "content": "Initial content"},
            "idempotency_key": str(uuid.uuid4()),
            "confirmation_token": token,
        },
    )
    change_set_id = r2.json()["committed_changes"][0]["change_set_id"]
    note_id = r2.json()["result"]["note_id"]

    # Verify note exists and not archived
    note = db_session.get(Note, uuid.UUID(note_id))
    assert note is not None
    assert note.is_archived is False

    # 2. Undo
    undo_res = client.post(
        f"/api/v1/actions/change-sets/{change_set_id}/undo",
        headers={"X-Workspace-Id": str(ws.id)},
    )
    assert undo_res.status_code == 200
    assert undo_res.json()["undo_status"] == "undone"

    # Check note is archived or deleted
    db_session.expire_all()
    note_after = db_session.get(Note, uuid.UUID(note_id))
    assert note_after is None or note_after.is_archived is True

    # 3. Re-undo attempt returns 409
    re_undo = client.post(
        f"/api/v1/actions/change-sets/{change_set_id}/undo",
        headers={"X-Workspace-Id": str(ws.id)},
    )
    assert re_undo.status_code == 409


def test_get_execution_status_and_listing(client: TestClient, db_session: Session):
    """GET /actions/executions/{id} and GET /actions/executions work as expected."""
    ws, _ = _create_workspace_and_user(db_session)

    r = client.post(
        "/api/v1/actions/knowledge.search_all/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "read",
            "input": {"query": "test query"},
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    exec_id = r.json()["execution_id"]

    # Single execution status
    st = client.get(
        f"/api/v1/actions/executions/{exec_id}",
        headers={"X-Workspace-Id": str(ws.id)},
    )
    assert st.status_code == 200
    assert st.json()["execution_id"] == exec_id
    assert st.json()["status"] == "succeeded"

    # List executions
    lst = client.get(
        "/api/v1/actions/executions",
        headers={"X-Workspace-Id": str(ws.id)},
    )
    assert lst.status_code == 200
    assert lst.json()["total"] >= 1
    assert any(e["execution_id"] == exec_id for e in lst.json()["items"])


def test_cancel_execution(client: TestClient, db_session: Session):
    """Active execution can be cancelled."""
    ws, _ = _create_workspace_and_user(db_session)

    # Create a proposal execution (which is proposed / awaiting_confirmation)
    r = client.post(
        "/api/v1/actions/notes.create/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "propose",
            "input": {"title": "Will Cancel"},
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    exec_id = r.json()["execution_id"]

    cancel_res = client.post(
        f"/api/v1/actions/executions/{exec_id}/cancel",
        headers={"X-Workspace-Id": str(ws.id)},
    )
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "cancelled"


def test_workspace_scoping_isolation(client: TestClient, db_session: Session):
    """Executions and change sets from Workspace A cannot be accessed from Workspace B."""
    ws_a, _ = _create_workspace_and_user(db_session)
    ws_b, _ = _create_workspace_and_user(db_session)

    r = client.post(
        "/api/v1/actions/knowledge.search_all/execute",
        headers={"X-Workspace-Id": str(ws_a.id)},
        json={
            "mode": "read",
            "input": {"query": "test"},
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    exec_id = r.json()["execution_id"]

    # Access from WS B returns 404
    foreign = client.get(
        f"/api/v1/actions/executions/{exec_id}",
        headers={"X-Workspace-Id": str(ws_b.id)},
    )
    assert foreign.status_code == 404


def test_concurrency_limit_enforcement(client: TestClient, db_session: Session):
    """Contract §11.2: If 2 concurrent executions running, third returns 429."""
    ws, _ = _create_workspace_and_user(db_session)

    # Insert 2 running executions
    e1 = ActionExecution(
        workspace_id=ws.id,
        action_id="knowledge.search_all",
        status="running",
        initiated_by="user",
        idempotency_key="conc-1",
        input_payload={},
    )
    e2 = ActionExecution(
        workspace_id=ws.id,
        action_id="knowledge.search_all",
        status="running",
        initiated_by="user",
        idempotency_key="conc-2",
        input_payload={},
    )
    db_session.add_all([e1, e2])
    db_session.commit()

    # Attempt to execute a 3rd action
    r = client.post(
        "/api/v1/actions/knowledge.search_all/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "read",
            "input": {"query": "overflow"},
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert r.status_code == 429


def test_idempotency_deduplication(client: TestClient, db_session: Session):
    """Contract §11.3: Repeating identical request with same idempotency_key returns cached result."""
    ws, _ = _create_workspace_and_user(db_session)
    key = "unique-idempotency-key-xyz"

    r1 = client.post(
        "/api/v1/actions/knowledge.search_all/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "read",
            "input": {"query": "memoized query"},
            "idempotency_key": key,
        },
    )
    assert r1.status_code == 200
    exec_id_1 = r1.json()["execution_id"]

    r2 = client.post(
        "/api/v1/actions/knowledge.search_all/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "read",
            "input": {"query": "memoized query"},
            "idempotency_key": key,
        },
    )
    assert r2.status_code == 200
    exec_id_2 = r2.json()["execution_id"]

    assert exec_id_1 == exec_id_2
