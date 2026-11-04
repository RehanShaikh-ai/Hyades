"""Comprehensive tests for Note Split Service & Workflow (/split-note).

Verifies:
1. Source note metadata extraction (word count, sections, topic, preview)
2. Semantic decomposition under 'preserve' mode (preserves original phrasing)
3. Semantic decomposition under 'adapt' mode (contextualized standalone notes)
4. Note count handling: Automatic clustering vs Custom target count (2 to 15)
5. Non-destructive guarantee: Original source note remains completely untouched
6. Interactive note selection card when /split-note is called without arguments
7. Proposal staging and commit via ActionProposal and writes handler
8. Decompose API endpoint for interactive configuration updates
"""

import uuid
import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.core.exceptions import AppException
from app.models.action_proposal import ActionProposal
from app.models.note import Note
from app.models.note_link import NoteLink
from app.models.user import User
from app.models.workspace import Workspace
from app.services import note_split_service, stella_command_service
from app.schemas.stella_commands import (
    StellaCommandExecuteRequest,
    StellaSplitNoteDecomposeRequest,
)


@pytest.fixture
def split_test_data(db_session: Session):
    user = User(display_name="Split Architect")
    db_session.add(user)
    db_session.commit()

    ws = Workspace(name="Split Test WS", owner_id=user.id)
    db_session.add(ws)
    db_session.commit()

    note_text = (
        "# Vector Embeddings and Approximate Nearest Neighbor Search\n\n"
        "Vector embeddings map high-dimensional semantic relationships into dense vector spaces.\n\n"
        "## Exact Nearest Neighbors\n"
        "Exact search evaluates cosine similarity across every stored embedding vector. "
        "While producing 100% recall, exhaustive search scales linearly O(N), becoming infeasible at scale.\n\n"
        "## Approximate Nearest Neighbors\n"
        "Approximate Nearest Neighbor (ANN) algorithms trade exact precision for logarithmic search latency. "
        "Prominent index structures include Hierarchical Navigable Small World (HNSW) and Inverted File Index (IVF).\n\n"
        "## Trade-offs and Parameter Tuning\n"
        "Key tuning parameters include M (bidirectional link count) and ef_search (dynamic search list depth). "
        "Higher ef_search values improve recall at the cost of higher query latency."
    )

    source_note = Note(
        workspace_id=ws.id,
        title="Vector Embeddings and Approximate Nearest Neighbor Search",
        content=note_text,
        created_by=user.id,
    )
    db_session.add(source_note)
    db_session.commit()

    return {"user": user, "ws": ws, "note": source_note}


def test_extract_source_note_metadata(split_test_data):
    note = split_test_data["note"]
    meta = note_split_service.extract_source_note_metadata(note)

    assert meta.id == str(note.id)
    assert meta.title == note.title
    assert meta.word_count > 80
    assert meta.section_count >= 3
    assert "Exact Nearest Neighbors" in meta.sections
    assert "Approximate Nearest Neighbors" in meta.sections
    assert len(meta.content_preview) > 0


def test_decompose_preserve_mode(split_test_data):
    note = split_test_data["note"]
    result = note_split_service.decompose_note_semantically(
        note, content_mode="preserve", count_mode="auto"
    )

    assert result.content_mode == "preserve"
    assert result.count_mode == "auto"
    assert len(result.proposed_parts) >= 2
    assert result.coverage_percentage == 100
    assert "preservation" in result.decomposition_advice.lower() or "partitioned" in result.decomposition_advice.lower()

    for part in result.proposed_parts:
        assert part.title
        assert part.focus
        assert part.content
        assert part.word_count > 0
        assert "_Extracted from:" in part.content


def test_decompose_adapt_mode(split_test_data):
    note = split_test_data["note"]
    result = note_split_service.decompose_note_semantically(
        note, content_mode="adapt", count_mode="auto"
    )

    assert result.content_mode == "adapt"
    assert len(result.proposed_parts) >= 2
    for part in result.proposed_parts:
        assert "Context:" in part.content or "analysis" in part.focus.lower()


def test_decompose_custom_count_target(split_test_data):
    note = split_test_data["note"]

    # Target 3 notes
    res_3 = note_split_service.decompose_note_semantically(
        note, content_mode="preserve", count_mode="custom", target_count=3
    )
    assert res_3.target_count == 3
    assert len(res_3.proposed_parts) == 3

    # Clamping tests: < 2 becomes 2, > 15 becomes 15
    res_clamp_low = note_split_service.decompose_note_semantically(
        note, content_mode="preserve", count_mode="custom", target_count=1
    )
    assert res_clamp_low.target_count == 2

    res_clamp_high = note_split_service.decompose_note_semantically(
        note, content_mode="preserve", count_mode="custom", target_count=20
    )
    assert res_clamp_high.target_count == 15


def test_stage_split_proposal(db_session: Session, split_test_data):
    ws = split_test_data["ws"]
    note = split_test_data["note"]

    decomp = note_split_service.decompose_note_semantically(
        note, content_mode="preserve", count_mode="auto"
    )
    staged = note_split_service.stage_split_proposal(db_session, ws.id, note, decomp)

    assert staged["proposal_id"] is not None
    assert staged["confirmation_token"] is not None
    assert staged["data"]["workflow"] == "split_note"
    assert staged["data"]["original_note_id"] == str(note.id)
    assert staged["data"]["part_count"] == len(decomp.proposed_parts)

    prop = db_session.get(ActionProposal, uuid.UUID(staged["proposal_id"]))
    assert prop is not None
    assert prop.proposal_payload["original_title"] == note.title


def test_stella_split_note_no_args_returns_interactive_selector(db_session: Session, split_test_data):
    ws = split_test_data["ws"]

    response = stella_command_service.execute_stella_action_command(
        db=db_session,
        workspace_id=ws.id,
        command="/split-note",
        args=[],
    )

    assert response.status == "completed"
    assert response.data.get("card_type") == "select_note"
    assert response.data.get("workflow") == "split_note"
    assert len(response.data.get("notes", [])) >= 1
    assert any(n["title"] == split_test_data["note"].title for n in response.data["notes"])


def test_stella_split_note_with_args_creates_configured_proposal(db_session: Session, split_test_data):
    ws = split_test_data["ws"]
    note = split_test_data["note"]

    response = stella_command_service.execute_stella_action_command(
        db=db_session,
        workspace_id=ws.id,
        command=f'/split-note "{note.title}"',
        args=[note.title],
    )

    assert response.status == "proposed"
    assert response.requires_confirmation is True
    assert response.proposal_id is not None
    assert response.data.get("workflow") == "split_note"
    assert response.data.get("card_type") == "split_note_plan"
    assert response.data.get("stage") == "configure"
    assert response.data.get("source_note")["title"] == note.title
    assert response.data.get("part_count") >= 2


def test_original_note_untouched_on_split_commit(db_session: Session, split_test_data):
    """Critical: The original note must remain completely untouched when split notes are created."""
    ws = split_test_data["ws"]
    note = split_test_data["note"]
    original_content_before = note.content
    original_title_before = note.title
    original_id = note.id

    # 1. Propose split
    response = stella_command_service.execute_stella_action_command(
        db=db_session,
        workspace_id=ws.id,
        command=f'/split-note "{note.title}"',
        args=[note.title],
    )
    proposal_id = uuid.UUID(response.proposal_id)
    confirmation_token = response.confirmation_token

    # 2. Commit proposal
    commit_response = stella_command_service.execute_stella_action_command(
        db=db_session,
        workspace_id=ws.id,
        command="/split-note",
        proposal_id=proposal_id,
        confirmation_token=confirmation_token,
    )

    assert commit_response.status in ("completed", "split_committed", "proposed")
    created_count = commit_response.data.get("created_count", 0)
    assert created_count >= 2

    # Verify original note is COMPLETELY UNTOUCHED
    db_session.refresh(note)
    assert note.id == original_id
    assert note.title == original_title_before
    assert note.content == original_content_before

    # Verify links exist connecting original note to created notes
    links = list(db_session.query(NoteLink).filter(NoteLink.source_note_id == original_id).all())
    assert len(links) == created_count


def test_decompose_endpoint(client: TestClient, db_session: Session, split_test_data):
    ws = split_test_data["ws"]
    note = split_test_data["note"]

    resp = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/split-note/decompose",
        json={
            "note_id": str(note.id),
            "content_mode": "adapt",
            "count_mode": "custom",
            "target_count": 3,
        },
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["content_mode"] == "adapt"
    assert data["count_mode"] == "custom"
    assert data["target_count"] == 3
    assert len(data["proposed_parts"]) == 3
    assert data["source_note"]["id"] == str(note.id)
