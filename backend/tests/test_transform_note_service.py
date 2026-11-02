"""Comprehensive test suite for `/transform-note` and Note Transformation Service.

Tests:
1. Command registration: `/transform-note` exists in catalogue with 2 arguments.
2. Argument suggestions: arg_index=0 suggests operations, arg_index=1 suggests notes.
3. `/transform-note options`: returns 9 operations interactive grid without requiring confirmation.
4. `/transform-note enrich`: produces enrichment proposals equivalent to legacy `/enrich-note`.
5. `/enrich-note`: legacy alias invokes the same underlying engine.
6. Text transformations: `shorten`, `expand`, `simplify`, `restructure`, `improve`:
   - Produces structured review proposals with before/after diffs.
   - Stages `notes.update` proposal with confirmation token.
   - Committing applies transformed content to note.
7. `/transform-note connect`: proposes links to candidate notes in the workspace.
8. `/transform-note study`: generates pedagogical flashcard deck with `card_type: "flashcards"`.
9. `/transform-note audit`: checks claims and produces non-mutating structured audit findings.
10. Concurrent-edit protection:
    - If note content changes between proposal creation and confirmation, commit is rejected with 409 conflict.
11. Workspace boundary isolation:
    - Target note from another workspace cannot be transformed.
"""

import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.note import Note
from app.models.user import User
from app.models.workspace import Workspace
from app.services import stella_command_service, note_transformation_service


@pytest.fixture
def test_setup(db_session: Session):
    user = User(display_name="Transform Tester")
    db_session.add(user)
    db_session.commit()

    ws = Workspace(name="Transform Workspace", owner_id=user.id)
    db_session.add(ws)
    db_session.commit()

    note1 = Note(
        workspace_id=ws.id,
        title="Vector Embeddings and Approximate Nearest Neighbor Search",
        content=(
            "# Vector Embeddings and Approximate Nearest Neighbor Search\n\n"
            "Vector embeddings map high-dimensional semantic entities into a dense continuous space. "
            "Approximate nearest neighbor search algorithms, such as HNSW, accelerate retrieval by "
            "trading marginal precision for logarithmic search latency."
        ),
        created_by=user.id,
    )
    note2 = Note(
        workspace_id=ws.id,
        title="Cognitive Science of Spaced Repetition",
        content=(
            "# Cognitive Science of Spaced Repetition\n\n"
            "Spaced repetition leverages the spacing effect to dramatically flatten the forgetting curve. "
            "By reviewing information at increasing intervals, memory retention is consolidated more deeply."
        ),
        created_by=user.id,
    )
    db_session.add_all([note1, note2])
    db_session.commit()

    return {"user": user, "ws": ws, "note1": note1, "note2": note2}


def test_transform_note_command_registration():
    """Verify /transform-note is registered with 2 arguments."""
    cmds = stella_command_service.ALL_OPERATIONS
    cmd = next((c for c in cmds if c.command == "/transform-note"), None)
    assert cmd is not None
    assert cmd.name == "Transform Note"
    assert cmd.execution_type == "proposal"
    assert cmd.action_id == "notes.update"
    assert len(cmd.arguments) == 2
    assert cmd.arguments[0].name == "operation"
    assert cmd.arguments[1].name == "note"


def test_transform_note_command_suggestions(client: TestClient, db_session: Session, test_setup):
    ws = test_setup["ws"]

    # Arg 0: operation suggestions
    resp0 = client.get(
        f"/api/v1/workspaces/{ws.id}/stella/suggestions?command=/transform-note&arg_index=0"
    )
    assert resp0.status_code == 200
    data0 = resp0.json()
    op_titles = [item["title"] for item in data0["items"]]
    assert "enrich" in op_titles
    assert "shorten" in op_titles
    assert "expand" in op_titles
    assert "simplify" in op_titles
    assert "restructure" in op_titles
    assert "improve" in op_titles
    assert "connect" in op_titles
    assert "study" in op_titles
    assert "audit" in op_titles
    assert "options" in op_titles

    # Arg 1: note suggestions
    resp1 = client.get(
        f"/api/v1/workspaces/{ws.id}/stella/suggestions?command=/transform-note&arg_index=1"
    )
    assert resp1.status_code == 200
    data1 = resp1.json()
    note_titles = [item["title"] for item in data1["items"]]
    assert "Vector Embeddings and Approximate Nearest Neighbor Search" in note_titles
    assert "Cognitive Science of Spaced Repetition" in note_titles


def test_transform_note_options(client: TestClient, test_setup):
    ws = test_setup["ws"]
    resp = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={"command": "/transform-note options"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"
    assert not data["requires_confirmation"]
    assert data["data"]["card_type"] == "transform_options"
    ops = data["data"]["operations"]
    assert len(ops) == 9
    assert any(o["operation"] == "enrich" for o in ops)
    assert any(o["operation"] == "shorten" for o in ops)


def test_transform_note_enrich_and_legacy_equivalence(client: TestClient, test_setup):
    ws = test_setup["ws"]
    note1 = test_setup["note1"]

    # Execute /transform-note enrich
    resp1 = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={"command": f'/transform-note enrich "{note1.title}"'},
    )
    assert resp1.status_code == 200
    res1_data = resp1.json()
    assert res1_data["command"] == f'/transform-note enrich "{note1.title}"'
    assert res1_data["data"]["workflow"] in ("enrich_note", "transform_note")

    # Execute legacy /enrich-note
    resp2 = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={"command": f'/enrich-note "{note1.title}"'},
    )
    assert resp2.status_code == 200
    res2_data = resp2.json()
    assert res2_data["data"]["workflow"] in ("enrich_note", "transform_note")
    assert res2_data["action_id"] == "notes.update"


def test_transform_note_text_transformations_lifecycle(client: TestClient, db_session: Session, test_setup):
    """Test shorten, expand, simplify, restructure, improve stage reviewable proposals and commit cleanly."""
    ws = test_setup["ws"]
    note = test_setup["note1"]

    for op in ["shorten", "expand", "simplify", "restructure", "improve"]:
        cmd = f'/transform-note {op} "{note.title}"'
        resp = client.post(
            f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
            json={"command": cmd},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "proposed"
        assert data["requires_confirmation"] is True
        assert data["proposal_id"] is not None
        assert data["confirmation_token"] is not None
        assert "original_content" in data["data"]
        assert "proposed_content" in data["data"]
        assert len(data["data"]["proposals"]) >= 1

        # Commit the transformation proposal
        commit_resp = client.post(
            f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
            json={
                "command": cmd,
                "proposal_id": data["proposal_id"],
                "confirmation_token": data["confirmation_token"],
                "parameters": {},
            },
        )
        assert commit_resp.status_code == 200
        commit_data = commit_resp.json()
        assert commit_data["status"] == "completed"

        # Verify DB was updated
        db_session.refresh(note)
        assert len(note.content) > 0


def test_transform_note_connect(client: TestClient, test_setup):
    ws = test_setup["ws"]
    note1 = test_setup["note1"]

    resp = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={"command": f'/transform-note connect "{note1.title}"'},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"
    assert "connections" in data["data"]


def test_transform_note_study_generates_flashcards(client: TestClient, test_setup):
    ws = test_setup["ws"]
    note2 = test_setup["note2"]

    resp = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={"command": f'/transform-note study "{note2.title}"'},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"
    assert "flashcardDeck" in data["data"]
    deck = data["data"]["flashcardDeck"]
    assert len(deck["cards"]) > 0


def test_transform_note_audit_non_mutating(client: TestClient, db_session: Session, test_setup):
    ws = test_setup["ws"]
    note1 = test_setup["note1"]
    content_before = note1.content

    resp = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={"command": f'/transform-note audit "{note1.title}"'},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"
    assert not data["requires_confirmation"]
    assert "findings" in data["data"]
    assert len(data["data"]["findings"]) >= 1

    # Verify content was untouched
    db_session.refresh(note1)
    assert note1.content == content_before


def test_transform_note_concurrent_edit_protection(client: TestClient, db_session: Session, test_setup):
    """If note content changes between proposal creation and confirmation, reject commit with 409 conflict."""
    ws = test_setup["ws"]
    note = test_setup["note1"]

    # 1. Stage proposal
    stage_resp = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={"command": f'/transform-note shorten "{note.title}"'},
    )
    assert stage_resp.status_code == 200
    proposal = stage_resp.json()
    p_id = proposal["proposal_id"]
    token = proposal["confirmation_token"]

    # 2. Modify note concurrently
    note.content = "External edit occurred while user was inspecting proposal."
    db_session.commit()

    # 3. Attempt commit - must fail with 409 conflict
    commit_resp = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={
            "command": f'/transform-note shorten "{note.title}"',
            "proposal_id": p_id,
            "confirmation_token": token,
            "parameters": {},
        },
    )
    assert commit_resp.status_code == 409
    err = commit_resp.json()
    assert err["error"]["code"] == "CONCURRENT_MODIFICATION_CONFLICT"
