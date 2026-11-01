import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models.workspace import Workspace
from app.models.user import User
from app.models.note import Note
from app.models.source import Source
from app.models.conversation import Conversation
from app.models.message import Message
from app.services import vector_service


def test_command_suggestions_returns_notes_and_sources_beyond_eight_limit(client: TestClient, db_session: Session):
    """Test Bug 2: ensure command suggestions returns all matching notes and sources (>8 items)."""
    user = User(display_name="Suggestions Tester")
    db_session.add(user)
    db_session.commit()

    ws = Workspace(name="Suggestions Test WS", owner_id=user.id)
    db_session.add(ws)
    db_session.commit()

    # Create 12 notes
    created_notes = []
    for i in range(12):
        n = Note(
            workspace_id=ws.id,
            title=f"Sample Research Note {i + 1:02d}",
            content=f"Detailed research content for note {i + 1}.",
            created_by=user.id,
        )
        db_session.add(n)
        created_notes.append(n)

    # Create 5 sources
    created_sources = []
    for j in range(5):
        s = Source(
            workspace_id=ws.id,
            source_type="file",
            original_path=f"archive/source_{j + 1:02d}.pdf",
            source_identifier=f"Source Doc {j + 1:02d}",
            content_hash=f"hash_src_{j + 1}_{ws.id.hex[:6]}",
            import_batch_id=uuid.uuid4(),
            import_status="completed",
        )
        db_session.add(s)
        created_sources.append(s)

    db_session.commit()

    # Request suggestions for /summarize (which allows both 'note' and 'source') with limit=50
    resp = client.get(
        f"/api/v1/workspaces/{ws.id}/stella/suggestions",
        params={"command": "/summarize", "limit": 50, "arg_index": 0},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    items = data["items"]

    # All 12 notes and 5 sources must be returned
    note_items = [it for it in items if it["item_type"] == "note"]
    source_items = [it for it in items if it["item_type"] == "source"]

    assert len(items) == 17, f"Expected 17 total items, got {len(items)}"
    assert len(note_items) == 12, f"Expected 12 notes, got {len(note_items)}"
    assert len(source_items) == 5, f"Expected 5 sources, got {len(source_items)}"
    assert data["total"] == 17, f"Expected total=17, got {data['total']}"


def test_flashcard_generation_returns_structured_deck_and_action_envelope(client: TestClient, db_session: Session):
    """Test Bug 1: /generate-flashcards returns structured deck and records action result."""
    user = User(display_name="Flashcard Tester")
    db_session.add(user)
    db_session.commit()

    ws = Workspace(name="Flashcard Test WS", owner_id=user.id)
    db_session.add(ws)
    db_session.commit()

    note = Note(
        workspace_id=ws.id,
        title="Distributed Consensus and Paxos",
        content="Paxos is a family of protocols for solving consensus in a network of unreliable or fallible processors. Consensus is the process of agreeing on one result among a group of participants. This problem becomes difficult when the participants or their communication medium may experience failures.",
        created_by=user.id,
    )
    db_session.add(note)

    conv = Conversation(workspace_id=ws.id, title="Study Session")
    db_session.add(conv)
    db_session.commit()

    resp = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={
            "command": "/generate-flashcards",
            "args": [note.title],
            "conversation_id": str(conv.id),
        },
    )
    assert resp.status_code == 200, resp.text
    result = resp.json()

    assert result["status"] == "completed"
    assert result["command"] == "/generate-flashcards"
    assert "data" in result
    deck = result["data"]
    assert "cards" in deck
    assert len(deck["cards"]) > 0

    # Ensure each card has an ID and question/answer
    for c in deck["cards"]:
        assert "id" in c
        assert "question" in c
        assert "answer" in c

    # Verify conversation history has proper action result comment tag
    messages = list(
        db_session.scalars(
            select(Message)
            .where(Message.conversation_id == conv.id)
            .order_by(Message.created_at.asc())
        ).all()
    )
    assert len(messages) >= 2
    user_msg = messages[-2]
    asst_msg = messages[-1]

    assert user_msg.role == "user"
    assert asst_msg.role == "assistant"
    assert "<!--hyades-action-result:" in asst_msg.content
    assert '"card_type": "flashcards"' in asst_msg.content


def test_enrich_note_handles_unindexed_vector_store_gracefully(client: TestClient, db_session: Session):
    """Test Bug 3: /enrich-note succeeds even when workspace has no Qdrant collection yet."""
    user = User(display_name="Enrich Tester")
    db_session.add(user)
    db_session.commit()

    ws = Workspace(name="Enrichment Resilient WS", owner_id=user.id)
    db_session.add(ws)
    db_session.commit()

    note = Note(
        workspace_id=ws.id,
        title="Conflict-Free Replicated Data Types (CRDTs) in Distributed Systems",
        content="A Conflict-Free Replicated Data Type (CRDT) is a data structure that simplifies distributed data storage systems and multi-user applications.",
        created_by=user.id,
    )
    db_session.add(note)
    db_session.commit()

    # Explicitly test that vector search does not raise 404
    vec_results = vector_service.search_vectors(
        workspace_id=ws.id,
        query_vector=[0.0] * 1536,
        limit=5,
    )
    assert isinstance(vec_results, list)

    # Test /enrich-note execution
    resp = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={
            "command": "/enrich-note",
            "args": [note.title],
        },
    )
    assert resp.status_code == 200, resp.text
    result = resp.json()
    assert result["status"] in ("completed", "proposed")
    assert "Vector search failed: Unexpected Response: 404" not in result.get("message", "")
