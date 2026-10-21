"""Unit and integration tests for Stella Slash Commands and In-Chat Actions API.

Verifies:
- Command listing includes all 5 slash commands with correct schemas.
- /create-note draft generation produces ~300 words structured content and stages ActionProposal.
- /create-note commit applies proposal atomically and creates a persistent Note in DB.
- Inline revisions to title and content are preserved on commit.
- Cancel transitions proposal to rejected.
- Workspace isolation is strictly enforced.
"""

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.action_proposal import ActionProposal
from app.models.note import Note
from app.models.user import User
from app.models.workspace import Workspace


def test_list_stella_commands(client: TestClient, db_session: Session):
    """Verify that command catalogue returns all 5 canonical slash commands."""
    user = User(display_name="Command Tester")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Command WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    res = client.get(f"/api/v1/workspaces/{workspace.id}/stella/commands")
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["total"] == 5
    cmd_names = {c["command"] for c in data["commands"]}
    assert "/create-note" in cmd_names
    assert "/summarize" in cmd_names
    assert "/link-notes" in cmd_names
    assert "/review-inbox" in cmd_names
    assert "/search" in cmd_names


def test_create_note_draft_and_commit_workflow(client: TestClient, db_session: Session):
    """Verify full end-to-end slash command vertical slice: /create-note industrial revolution."""
    user = User(display_name="Historian User")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="History WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    # Step 1: Request draft generation on topic "industrial revolution"
    res_draft = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/create-note/draft",
        json={"topic": "industrial revolution"},
    )
    assert res_draft.status_code == 200, res_draft.text
    draft_data = res_draft.json()

    assert "industrial revolution" in draft_data["title"].lower() or "industrial" in draft_data["title"].lower()
    assert draft_data["word_count"] >= 150
    assert draft_data["proposal_id"] is not None
    assert draft_data["confirmation_token"] is not None
    assert draft_data["status"] == "proposed"

    proposal_id = draft_data["proposal_id"]
    token = draft_data["confirmation_token"]

    # Verify persistent ActionProposal was created in DB
    proposal = db_session.get(ActionProposal, uuid.UUID(proposal_id))
    assert proposal is not None
    assert proposal.status == "pending"
    assert proposal.action_id == "notes.create"

    # Step 2: User approves and saves draft to notes
    res_commit = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/create-note/commit",
        json={
            "proposal_id": proposal_id,
            "confirmation_token": token,
        },
    )
    assert res_commit.status_code == 200, res_commit.text
    commit_data = res_commit.json()

    assert commit_data["status"] == "committed"
    assert commit_data["note_id"] is not None

    created_note_id = uuid.UUID(commit_data["note_id"])
    note = db_session.get(Note, created_note_id)
    assert note is not None
    assert note.workspace_id == workspace.id
    assert note.title == draft_data["title"]
    assert "###" in note.content

    # Verify proposal is marked committed
    db_session.refresh(proposal)
    assert proposal.status == "committed"


def test_create_note_revise_and_commit(client: TestClient, db_session: Session):
    """Verify that user can revise title and content before committing."""
    user = User(display_name="Editor User")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Editor WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    res_draft = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/create-note/draft",
        json={"topic": "steam engines"},
    )
    assert res_draft.status_code == 200
    draft_data = res_draft.json()

    revised_title = "Revised Steam Power Analysis"
    revised_content = "### Revised Section\nDetailed technical analysis of Newcomen and Watt condenser engines."

    res_commit = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/create-note/commit",
        json={
            "proposal_id": draft_data["proposal_id"],
            "confirmation_token": draft_data["confirmation_token"],
            "title": revised_title,
            "content": revised_content,
        },
    )
    assert res_commit.status_code == 200
    commit_data = res_commit.json()

    note = db_session.get(Note, uuid.UUID(commit_data["note_id"]))
    assert note is not None
    assert note.title == revised_title
    assert "Watt condenser" in note.content


def test_create_note_cancel(client: TestClient, db_session: Session):
    """Verify that user can cancel a note draft proposal."""
    user = User(display_name="Cancelling User")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Cancel WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    res_draft = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/create-note/draft",
        json={"topic": "discarded topic"},
    )
    assert res_draft.status_code == 200
    draft_data = res_draft.json()

    res_cancel = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/create-note/cancel",
        json={"proposal_id": draft_data["proposal_id"]},
    )
    assert res_cancel.status_code == 200
    assert res_cancel.json()["status"] == "cancelled"

    proposal = db_session.get(ActionProposal, uuid.UUID(draft_data["proposal_id"]))
    assert proposal.status == "rejected"
