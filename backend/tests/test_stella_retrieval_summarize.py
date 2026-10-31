"""Regression and verification tests for Stella retrieval, summarization, and suggestions.

Verifies:
- Bug 1: Newly created note is immediately retrievable and summarizable using real content.
- Suggestions endpoint returns argument candidates with correct types and metadata.
- Context assembly falls back and includes full target note content.
"""

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.collection import Collection
from app.models.graph_entity import GraphEntity
from app.models.note import Note
from app.models.user import User
from app.models.workspace import Workspace
from app.services import assistant_service


def test_created_note_is_immediately_retrievable_and_summarizable(
    client: TestClient, db_session: Session
):
    """Bug 1 Regression Test: A created note can be summarized and found immediately."""
    user = User(display_name="Industrial Scholar")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="History Workspace", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    # 1. Draft a note on Industrial Revolution via Stella
    draft_res = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/create-note/draft",
        json={"topic": "Industrial Revolution"},
    )
    assert draft_res.status_code == 200, draft_res.text
    draft_data = draft_res.json()
    assert draft_data["status"] == "proposed"
    assert "Industrial Revolution" in draft_data["title"]
    assert draft_data["word_count"] > 100

    # 2. Commit the note draft
    commit_res = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/create-note/commit",
        json={
            "proposal_id": draft_data["proposal_id"],
            "confirmation_token": draft_data["confirmation_token"],
            "title": draft_data["title"],
            "content": draft_data["content"],
        },
    )
    assert commit_res.status_code == 200, commit_res.text
    commit_data = commit_res.json()
    note_id = commit_data["note_id"]
    note_title = commit_data["title"]

    # Verify Note exists in DB
    note_in_db = db_session.get(Note, uuid.UUID(note_id))
    assert note_in_db is not None
    assert note_in_db.title == note_title

    # 3. Test assistant context assembly with /summarize <target>
    ctx_text, citations, _ = assistant_service.build_assistant_context(
        db_session,
        workspace_id=workspace.id,
        query=f"/summarize {note_title}",
    )
    assert "TARGET NOTE:" in ctx_text or "NOTE:" in ctx_text
    assert note_title in ctx_text
    # Ensure real content from the note is present, not merely the title!
    assert "mechanization" in ctx_text.lower() or "production" in ctx_text.lower() or "economic" in ctx_text.lower()
    assert len(citations) >= 1
    assert str(citations[0]["note_id"]) == str(note_id)

    # 4. Test dedicated /summarize endpoint
    sum_res = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/summarize",
        json={"target": note_title},
    )
    assert sum_res.status_code == 200, sum_res.text
    sum_data = sum_res.json()
    assert sum_data["target_id"] == str(note_id)
    assert sum_data["target_title"] == note_title
    assert sum_data["summary_title"] == f"Summary: {note_title}"
    assert len(sum_data["key_points"]) >= 3
    assert "Based on 1 note" in sum_data["meta_description"]


def test_command_suggestions_endpoint(client: TestClient, db_session: Session):
    """Verify suggestions endpoint returns items matching query with formatted metadata."""
    user = User(display_name="Curator")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Curated Workspace", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    # Create Notes
    n1 = Note(
        workspace_id=workspace.id,
        title="The Industrial Revolution",
        content="Detailed examination of industrial steam engines and factories.",
        created_by=user.id,
    )
    n2 = Note(
        workspace_id=workspace.id,
        title="Quantum Computing Overview",
        content="Qubits, superposition, and quantum algorithms.",
        created_by=user.id,
    )
    # Create Entity and Collection
    e1 = GraphEntity(
        workspace_id=workspace.id,
        name="Steam Engine",
        entity_type="concept",
        description="Heat engine performing mechanical work using steam.",
    )
    c1 = Collection(
        workspace_id=workspace.id,
        name="Industrialization and Society",
        description="Curated primary sources on social transitions.",
        created_by=user.id,
    )
    db_session.add_all([n1, n2, e1, c1])
    db_session.commit()

    # Query suggestions for /summarize
    res_sum = client.get(
        f"/api/v1/workspaces/{workspace.id}/stella/suggestions",
        params={"command": "/summarize", "q": "industrial"},
    )
    assert res_sum.status_code == 200, res_sum.text
    items_sum = res_sum.json()["items"]
    assert len(items_sum) >= 1
    assert items_sum[0]["title"] == "The Industrial Revolution"
    assert "Note" in items_sum[0]["subtitle"]
    assert "words" in items_sum[0]["subtitle"]

    # Query suggestions for /summarize without query (includes notes, entities, collections)
    res_multi = client.get(
        f"/api/v1/workspaces/{workspace.id}/stella/suggestions",
        params={"command": "/summarize", "q": ""},
    )
    assert res_multi.status_code == 200, res_multi.text
    items_multi = res_multi.json()["items"]
    types_multi = {item["item_type"] for item in items_multi}
    assert "note" in types_multi
    assert "entity" in types_multi
    assert "collection" in types_multi

    # Query suggestions for placeholder command (/link-notes) should return []
    res_link = client.get(
        f"/api/v1/workspaces/{workspace.id}/stella/suggestions",
        params={"command": "/link-notes", "q": ""},
    )
    assert res_link.status_code == 200, res_link.text
    assert res_link.json()["items"] == []

    # Query suggestions for resource-targeting command (/split-note targeting notes)
    res_split = client.get(
        f"/api/v1/workspaces/{workspace.id}/stella/suggestions",
        params={"command": "/split-note", "q": ""},
    )
    assert res_split.status_code == 200, res_split.text
    items_split = res_split.json()["items"]
    types_split = {item["item_type"] for item in items_split}
    assert "note" in types_split
    assert "entity" not in types_split
