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
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.action_proposal import ActionProposal
from app.models.collection import Collection, CollectionNote
from app.models.conversation import Conversation
from app.models.graph_entity import GraphEntity
from app.models.inbox_item import InboxItem
from app.models.message import Message
from app.models.note import Note
from app.models.note_link import NoteLink
from app.models.source import Source
from app.models.tag import Tag
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
    assert data["total"] == 19
    cmd_names = {c["command"] for c in data["commands"]}

    # Verify all 12 prioritized agentic commands
    assert "/create-note" in cmd_names
    assert "/create-source" in cmd_names
    assert "/enrich-note" in cmd_names
    assert "/merge-notes" in cmd_names
    assert "/split-note" in cmd_names
    assert "/link-notes" in cmd_names
    assert "/organize-knowledge" in cmd_names
    assert "/populate-collection" in cmd_names
    assert "/extract-entities" in cmd_names
    assert "/reconcile-duplicates" in cmd_names
    assert "/resolve-conflicts" in cmd_names
    assert "/process-inbox" in cmd_names

    # Verify retained user-facing commands
    assert "/summarize" in cmd_names
    assert "/review-inbox" in cmd_names
    assert "/analyze" in cmd_names
    assert "/generate-flashcards" in cmd_names
    assert "/find-sources" in cmd_names
    assert "/ask-about" in cmd_names
    assert "/explore-graph" in cmd_names

    # Verify internal agent actions (/add-to-collection, /search) and routine CRUD operations are NOT exposed in user-facing slash menu
    assert "/add-to-collection" not in cmd_names
    assert "/search" not in cmd_names
    assert "/rename-note" not in cmd_names
    assert "/duplicate-note" not in cmd_names
    assert "/archive-note" not in cmd_names
    assert "/restore-note" not in cmd_names
    assert "/pin-note" not in cmd_names
    assert "/unpin-note" not in cmd_names
    assert "/create-collection" not in cmd_names
    assert "/delete-source" not in cmd_names
    assert "/create-entity" not in cmd_names
    assert "/tag-note" not in cmd_names
    assert "/delete-relation" not in cmd_names
    assert "/new-conversation" not in cmd_names


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
    assert "Definition & Core Concept" in note.content
    assert "How It Works" in note.content

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


def test_search_free_text_no_suggestions(client: TestClient, db_session: Session):
    """Verify that /search (free-text command) returns zero resource suggestions."""
    user = User(display_name="Search Tester")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Search WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    note = Note(workspace_id=workspace.id, title="Renaissance Astronomy", content="Notes on Kepler and Galileo.", created_by=user.id)
    db_session.add(note)
    db_session.commit()

    res = client.get(
        f"/api/v1/workspaces/{workspace.id}/stella/suggestions?command=/search&q=&limit=10"
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["items"] == []
    assert data["total"] == 0


def test_add_to_collection_two_stage_suggestions(client: TestClient, db_session: Session):
    """Verify that /add-to-collection suggests items at arg 0 and collections at arg 1."""
    user = User(display_name="Collection Tester")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Collection WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    note = Note(workspace_id=workspace.id, title="Steam Engine Mechanics", content="James Watt engine.", created_by=user.id)
    coll = Collection(workspace_id=workspace.id, name="History of Engineering", created_by=user.id)
    db_session.add_all([note, coll])
    db_session.commit()

    # Arg 0: items (notes, sources, entities) - should contain note, NOT collection
    res_arg0 = client.get(
        f"/api/v1/workspaces/{workspace.id}/stella/suggestions?command=/add-to-collection&arg_index=0"
    )
    assert res_arg0.status_code == 200
    items_0 = res_arg0.json()["items"]
    assert any(it["title"] == "Steam Engine Mechanics" for it in items_0)
    assert not any(it["item_type"] == "collection" for it in items_0)

    # Arg 1: collections - should contain collection, NOT note
    res_arg1 = client.get(
        f"/api/v1/workspaces/{workspace.id}/stella/suggestions?command=/add-to-collection&arg_index=1"
    )
    assert res_arg1.status_code == 200
    items_1 = res_arg1.json()["items"]
    assert any(it["title"] == "History of Engineering" for it in items_1)
    assert not any(it["item_type"] == "note" for it in items_1)


def test_execute_search_multidomain(client: TestClient, db_session: Session):
    """Verify that /search endpoint searches across multiple domains."""
    user = User(display_name="Multidomain Tester")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Multidomain WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    note = Note(workspace_id=workspace.id, title="Quantum Computing Foundations", content="Qubits and superposition.", created_by=user.id)
    coll = Collection(workspace_id=workspace.id, name="Quantum Physics Archive", created_by=user.id)
    db_session.add_all([note, coll])
    db_session.commit()

    res = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/search",
        json={"query": "Quantum", "limit": 10},
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["query"] == "Quantum"
    assert data["total"] >= 2
    types = {item["item_type"] for item in data["items"]}
    assert "note" in types
    assert "collection" in types


def test_review_inbox_authoritative(client: TestClient, db_session: Session):
    """Verify that /review-inbox accesses real inbox_items table without vector RAG."""
    user = User(display_name="Inbox Tester")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Inbox WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    # Empty inbox initially
    res_empty = client.get(f"/api/v1/workspaces/{workspace.id}/stella/commands/inbox")
    assert res_empty.status_code == 200, res_empty.text
    assert res_empty.json()["total_pending"] == 0

    # Add a pending inbox item
    source = Source(
        workspace_id=workspace.id,
        source_type="markdown",
        original_path="draft-paper.md",
        source_identifier="draft-paper.md",
        content_hash="abc1234567890",
        import_batch_id=uuid.uuid4(),
        import_status="completed",
        processing_stage="complete",
        processing_status="READY",
    )
    db_session.add(source)
    db_session.commit()

    inbox_item = InboxItem(
        workspace_id=workspace.id,
        source_id=source.id,
        status="pending",
        detection_status="completed",
        detected_count=3,
        detected_entities=["Concept A", "Concept B", "Concept C"],
    )
    db_session.add(inbox_item)
    db_session.commit()

    res_with_item = client.get(f"/api/v1/workspaces/{workspace.id}/stella/commands/inbox")
    assert res_with_item.status_code == 200, res_with_item.text
    data = res_with_item.json()
    assert data["total_pending"] == 1
    assert data["items"][0]["source_title"] == "draft-paper.md"
    assert data["items"][0]["detected_count"] == 3


def test_add_to_collection_draft_and_commit(client: TestClient, db_session: Session):
    """Verify two-phase add-to-collection proposal and commit."""
    user = User(display_name="Collector")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Collector WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    note = Note(workspace_id=workspace.id, title="Telescope Optics", content="Concave mirror design.", created_by=user.id)
    coll = Collection(workspace_id=workspace.id, name="Optics Instruments", created_by=user.id)
    db_session.add_all([note, coll])
    db_session.commit()

    # 1. Draft proposal
    res_draft = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/add-to-collection/draft",
        json={
            "item_id": str(note.id),
            "item_type": "note",
            "collection_id": str(coll.id),
        },
    )
    assert res_draft.status_code == 200, res_draft.text
    draft_data = res_draft.json()
    assert draft_data["status"] == "proposed"
    assert draft_data["item_title"] == "Telescope Optics"
    assert draft_data["collection_name"] == "Optics Instruments"

    # 2. Commit proposal
    res_commit = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/add-to-collection/commit",
        json={
            "proposal_id": draft_data["proposal_id"],
            "confirmation_token": draft_data["confirmation_token"],
        },
    )
    assert res_commit.status_code == 200, res_commit.text
    assert res_commit.json()["status"] == "committed"


# ─────────────────────────────────────────────────────────────────────────────
# Bug 1-10 Manual QA Regression Tests
# ─────────────────────────────────────────────────────────────────────────────


def test_bug1_create_source_free_text_and_file_validation(client: TestClient, db_session: Session):
    """Bug 1: /create-source distinguishes free-text input from filenames and validates extensions."""
    user = User(display_name="Source QA User")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Source QA WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    # 1. Exact reproduction: free-text input without extension
    res_free = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/create-source",
            "parameters": {"query": "difference between noble and royal families. easy words"},
        },
    )
    assert res_free.status_code == 200, res_free.text
    free_data = res_free.json()
    assert free_data["status"] == "proposed"
    assert free_data["requires_confirmation"] is True
    assert free_data["data"]["title"] != "difference"
    assert "noble and royal families" in free_data["data"]["title"].lower()
    assert len(free_data["data"]["content"]) > 50
    assert free_data["data"]["source_type"] == "text"
    assert "Research Brief" in free_data["data"]["content"]
    assert "Comparison & Analysis" in free_data["data"]["content"]
    assert "| Dimension | Royal Family |" in free_data["data"]["content"]
    assert "Traceable References" in free_data["data"]["content"]

    # Ensure not persisted before confirmation
    assert db_session.query(Source).filter(Source.workspace_id == workspace.id).count() == 0

    # Confirm free-text source proposal -> must succeed without UNSUPPORTED_SOURCE_TYPE
    res_commit = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/create-source",
            "proposal_id": free_data["proposal_id"],
            "confirmation_token": free_data["confirmation_token"],
        },
    )
    assert res_commit.status_code == 200, res_commit.text
    commit_data = res_commit.json()
    assert commit_data["status"] == "completed"
    source_id = uuid.UUID(commit_data["data"]["source_id"])
    created_source = db_session.get(Source, source_id)
    assert created_source is not None
    assert created_source.workspace_id == workspace.id

    # 2. Valid filename with supported extension (.md)
    res_md = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/create-source",
            "parameters": {"query": "feudal-hierarchy.md Notes on dukes, earls, and monarchs."},
        },
    )
    assert res_md.status_code == 200, res_md.text
    md_data = res_md.json()
    assert md_data["status"] == "proposed"
    assert md_data["data"]["title"] == "feudal-hierarchy.md"
    assert md_data["data"]["source_type"] == "document"

    # Cancel proposal leaves source count at 1
    res_cancel = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/create-source",
            "proposal_id": md_data["proposal_id"],
            "parameters": {"cancel": True},
        },
    )
    assert res_cancel.status_code == 200
    assert res_cancel.json()["status"] == "cancelled"
    assert db_session.query(Source).filter(Source.workspace_id == workspace.id).count() == 1

    # 3. Invalid file extension (.exe) rejected at proposal time with 422 UNSUPPORTED_SOURCE_TYPE
    res_bad = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/create-source",
            "parameters": {"query": "malware.exe some binary payload"},
        },
    )
    assert res_bad.status_code == 422, res_bad.text
    assert res_bad.json()["error"]["code"] == "UNSUPPORTED_SOURCE_TYPE"


def test_bug2_enrich_note_proposal_commit_and_cancel(client: TestClient, db_session: Session):
    """Bug 2: /enrich-note retrieves note, stages reviewable proposal without premature overwrite, commits or cancels."""
    user = User(display_name="Enrich QA User")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Enrich QA WS", owner_id=user.id)
    other_ws = Workspace(name="Other WS", owner_id=user.id)
    db_session.add_all([workspace, other_ws])
    db_session.commit()

    original_content = "Initial brief notes on Baghdad House of Wisdom translation movement."
    note = Note(
        workspace_id=workspace.id,
        title="House of Wisdom Overview",
        content=original_content,
        created_by=user.id,
    )
    other_note = Note(
        workspace_id=other_ws.id,
        title="Foreign Workspace Note",
        content="Secret content",
        created_by=user.id,
    )
    db_session.add_all([note, other_note])
    db_session.commit()

    # 1. Stage enrichment proposal
    res_prop = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/enrich-note",
            "parameters": {"query": '"House of Wisdom Overview"'},
        },
    )
    assert res_prop.status_code == 200, res_prop.text
    prop_data = res_prop.json()
    assert prop_data["status"] == "proposed"
    assert prop_data["requires_confirmation"] is True
    assert prop_data["action_id"] == "notes.update"
    assert prop_data["data"]["note_id"] == str(note.id)
    assert "Contextual Enrichment" in prop_data["data"]["enrichment_addition"]
    assert original_content in prop_data["data"]["proposed_content"]

    # Ensure note is NOT overwritten before confirmation
    db_session.refresh(note)
    assert note.content == original_content

    # 2. Cancel first proposal -> note remains unchanged
    res_cancel = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/enrich-note",
            "proposal_id": prop_data["proposal_id"],
            "parameters": {"cancel": True},
        },
    )
    assert res_cancel.status_code == 200
    assert res_cancel.json()["status"] == "cancelled"
    db_session.refresh(note)
    assert note.content == original_content

    # 3. Stage and confirm enrichment -> note content is updated in DB
    res_prop2 = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/enrich-note",
            "parameters": {"note_id": str(note.id)},
        },
    )
    assert res_prop2.status_code == 200
    prop2_data = res_prop2.json()

    res_commit = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/enrich-note",
            "proposal_id": prop2_data["proposal_id"],
            "confirmation_token": prop2_data["confirmation_token"],
        },
    )
    assert res_commit.status_code == 200, res_commit.text
    assert res_commit.json()["status"] == "completed"
    db_session.refresh(note)
    assert "Contextual Enrichment" in note.content

    # 4. Missing or cross-workspace note returns 404
    res_missing = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/enrich-note",
            "parameters": {"note_id": str(other_note.id)},
        },
    )
    assert res_missing.status_code == 404


def test_bug3_merge_notes_multi_selection_and_validation(client: TestClient, db_session: Session):
    """Bug 3: /merge-notes supports multi-note selection, validates duplicates/missing, and merges on confirm."""
    user = User(display_name="Merge QA User")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Merge QA WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    note1 = Note(workspace_id=workspace.id, title="Astrolabe Construction", content="Brass rete and tympan plates.", created_by=user.id)
    note2 = Note(workspace_id=workspace.id, title="Astrolabe Navigation", content="Measuring altitude of stars at sea.", created_by=user.id)
    note3 = Note(workspace_id=workspace.id, title="Celestial Globes", content="Three-dimensional spherical star maps.", created_by=user.id)
    db_session.add_all([note1, note2, note3])
    db_session.commit()

    # Verify suggestions endpoint works for arg_index 0, 1, and 2
    for idx in (0, 1, 2):
        res_sug = client.get(
            f"/api/v1/workspaces/{workspace.id}/stella/suggestions?command=/merge-notes&arg_index={idx}"
        )
        assert res_sug.status_code == 200
        assert len(res_sug.json()["items"]) == 3

    # 1. Single note selection is rejected clearly with 422
    res_single = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/merge-notes",
            "parameters": {"query": '"Astrolabe Construction"'},
        },
    )
    assert res_single.status_code == 422

    # 2. Duplicate note selection is rejected clearly with 422
    res_dup = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/merge-notes",
            "parameters": {"query": '"Astrolabe Construction" "Astrolabe Construction"'},
        },
    )
    assert res_dup.status_code == 422
    assert "distinct" in res_dup.json()["error"]["message"].lower()

    # 3. Valid multi-note merge stages proposal with source_notes
    res_prop = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/merge-notes",
            "parameters": {"query": '"Astrolabe Construction" "Astrolabe Navigation"'},
        },
    )
    assert res_prop.status_code == 200, res_prop.text
    prop_data = res_prop.json()
    assert prop_data["status"] == "proposed"
    assert prop_data["requires_confirmation"] is True
    assert len(prop_data["data"]["source_notes"]) == 2
    assert "Brass rete" in prop_data["data"]["content"]
    assert "Measuring altitude" in prop_data["data"]["content"]

    # Confirm merge -> creates merged note and links to source notes while preserving source notes
    res_commit = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/merge-notes",
            "proposal_id": prop_data["proposal_id"],
            "confirmation_token": prop_data["confirmation_token"],
        },
    )
    assert res_commit.status_code == 200, res_commit.text
    commit_data = res_commit.json()
    assert commit_data["status"] == "completed"
    merged_note_id = uuid.UUID(commit_data["data"]["note_id"])
    merged_note = db_session.get(Note, merged_note_id)
    assert merged_note is not None
    assert "Astrolabe Construction" in merged_note.title

    links = db_session.query(NoteLink).filter(NoteLink.source_note_id == merged_note_id).all()
    assert len(links) == 2


def test_bug4_split_note_proposal_and_commit_persists_modular_notes(client: TestClient, db_session: Session):
    """Bug 4: /split-note stages a reviewable proposal (not 'completed') and creates modular notes on confirmation."""
    user = User(display_name="Split QA User")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Split QA WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    orig_note = Note(
        workspace_id=workspace.id,
        title="Islamic Golden Era: Foundations, Dynamics, and Significance",
        content=(
            "### Historical Foundations\n"
            "The Abbasid Caliphate established major centers of learning in Baghdad and Cordoba.\n\n"
            "### Scientific and Cultural Dynamics\n"
            "Scholars advanced algebra, optics, medicine, and astronomical instrumentation.\n\n"
            "### Long-Term Significance\n"
            "Translations of Arabic treatises catalyzed the European Renaissance."
        ),
        tags=[
            Tag(workspace_id=workspace.id, name="history"),
            Tag(workspace_id=workspace.id, name="golden-era"),
        ],
        created_by=user.id,
    )
    db_session.add(orig_note)
    db_session.commit()

    # 1. Run /split-note -> MUST return status="proposed" and requires_confirmation=True
    res_prop = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/split-note",
            "parameters": {"query": '"Islamic Golden Era: Foundations, Dynamics, and Significance"'},
        },
    )
    assert res_prop.status_code == 200, res_prop.text
    prop_data = res_prop.json()
    assert prop_data["status"] == "proposed"
    assert prop_data["requires_confirmation"] is True
    assert prop_data["data"]["status"] == "awaiting_confirmation"
    proposed_parts = prop_data["data"]["proposed_parts"]
    assert len(proposed_parts) >= 2
    assert all("content" in part and len(part["content"]) > 20 for part in proposed_parts)

    # Verify no new notes created yet
    assert db_session.query(Note).filter(Note.workspace_id == workspace.id).count() == 1

    # 2. Confirm split -> creates all modular notes in Library, preserves tags, and links to original note
    res_commit = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/split-note",
            "proposal_id": prop_data["proposal_id"],
            "confirmation_token": prop_data["confirmation_token"],
        },
    )
    assert res_commit.status_code == 200, res_commit.text
    commit_data = res_commit.json()
    assert commit_data["status"] == "completed"
    created_notes = commit_data["data"]["created_notes"]
    assert len(created_notes) == len(proposed_parts)

    all_notes = db_session.query(Note).filter(Note.workspace_id == workspace.id).all()
    assert len(all_notes) == 1 + len(proposed_parts)

    for cn in created_notes:
        db_note = db_session.get(Note, uuid.UUID(cn["note_id"]))
        assert db_note is not None
        assert {t.name for t in db_note.tags} == {"history", "golden-era"}

    links = db_session.query(NoteLink).filter(NoteLink.source_note_id == orig_note.id).all()
    assert len(links) == len(proposed_parts)


def test_bug5_link_notes_connect_persists_relationship_without_re_querying(client: TestClient, db_session: Session):
    """Bug 5: /link-notes Connect creates persistent NoteLink idempotently without re-running /link-notes."""
    user = User(display_name="Link QA User")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Link QA WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    tag_graph = Tag(workspace_id=workspace.id, name="graph")
    n1 = Note(
        workspace_id=workspace.id,
        title="Vector Embeddings for Spatial Navigation",
        content="High-dimensional vector representations for semantic similarity and graph navigation.",
        tags=[Tag(workspace_id=workspace.id, name="vectors"), tag_graph],
        created_by=user.id,
    )
    n2 = Note(
        workspace_id=workspace.id,
        title="Incremental Knowledge Gardening",
        content="Evergreen note maintenance and graph navigation across semantic clusters.",
        tags=[Tag(workspace_id=workspace.id, name="gardening"), tag_graph],
        created_by=user.id,
    )
    db_session.add_all([n1, n2])
    db_session.commit()

    # 1. Discover link candidates
    res_links = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/link-notes",
        json={"target": "Vector Embeddings for Spatial Navigation"},
    )
    assert res_links.status_code == 200, res_links.text
    link_data = res_links.json()
    assert link_data["source_note_id"] == str(n1.id)
    cand = next(c for c in link_data["candidates"] if c["note_id"] == str(n2.id))
    assert cand["already_linked"] is False

    # 2. Click Connect -> creates persistent NoteLink
    res_conn = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/link-notes/connect",
        json={
            "source_note_id": str(n1.id),
            "target_note_id": str(n2.id),
        },
    )
    assert res_conn.status_code == 200, res_conn.text
    conn_data = res_conn.json()
    assert conn_data["status"] == "linked"
    assert conn_data["source_note_id"] == str(n1.id)
    assert conn_data["target_note_id"] == str(n2.id)

    # Verify in DB
    links = db_session.query(NoteLink).filter(
        NoteLink.source_note_id == n1.id, NoteLink.target_note_id == n2.id
    ).all()
    assert len(links) == 1

    # 3. Repeated Connect click is idempotent (no duplicate link row)
    res_conn_again = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/link-notes/connect",
        json={
            "source_note_id": str(n1.id),
            "target_note_id": str(n2.id),
        },
    )
    assert res_conn_again.status_code == 200
    assert res_conn_again.json()["status"] == "already_linked"
    assert db_session.query(NoteLink).filter(
        NoteLink.source_note_id == n1.id, NoteLink.target_note_id == n2.id
    ).count() == 1

    # 4. Re-running /link-notes reflects already_linked=True
    res_links_after = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/link-notes",
        json={"target": "Vector Embeddings for Spatial Navigation"},
    )
    cand_after = next(c for c in res_links_after.json()["candidates"] if c["note_id"] == str(n2.id))
    assert cand_after["already_linked"] is True


def test_bug6_organize_knowledge_scoped_clusters_and_apply(client: TestClient, db_session: Session):
    """Bug 6: /organize-knowledge honors optional scope, returns structured clusters, and can stage collection creation."""
    user = User(display_name="Organize QA User")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Organize QA WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    n1 = Note(workspace_id=workspace.id, title="Umar Governance Reforms", content="Administrative diwan and judicial separation.", tags=[Tag(workspace_id=workspace.id, name="caliphate")], created_by=user.id)
    n2 = Note(workspace_id=workspace.id, title="Abbasid House of Wisdom", content="Translation movement and astronomy in Baghdad.", tags=[Tag(workspace_id=workspace.id, name="golden-era")], created_by=user.id)
    db_session.add_all([n1, n2])
    db_session.commit()

    # 1. Workspace-wide analysis
    res_ws = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={"command": "/organize-knowledge", "parameters": {}},
    )
    assert res_ws.status_code == 200, res_ws.text
    ws_data = res_ws.json()
    assert ws_data["status"] == "completed"
    assert ws_data["data"]["status"] == "recommendations_ready"
    assert ws_data["data"]["total_notes"] == 2
    assert len(ws_data["data"]["suggested_clusters"]) >= 2

    # 2. Scoped analysis to a single note
    res_scoped = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={"command": "/organize-knowledge", "parameters": {"query": '"Umar Governance Reforms"'}},
    )
    assert res_scoped.status_code == 200, res_scoped.text
    scoped_data = res_scoped.json()
    assert scoped_data["data"]["scope_type"] == "note"
    assert "Umar Governance Reforms" in scoped_data["data"]["scope"]

    # 3. Invalid scope returns 404
    res_bad = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={"command": "/organize-knowledge", "parameters": {"query": '"Nonexistent Scope XYZ"'}},
    )
    assert res_bad.status_code == 404


def test_bug7_populate_collection_missing_404_and_two_phase_commit(client: TestClient, db_session: Session):
    """Bug 7: /populate-collection returns 404 for missing collection instead of 500, and populates on confirm."""
    user = User(display_name="Populate QA User")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Populate QA WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    # 1. Reproduction: /populate-collection "stuff" when collection doesn't exist -> 404 (not 500!)
    res_missing = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={"command": "/populate-collection", "parameters": {"query": '"stuff"'}},
    )
    assert res_missing.status_code == 404, res_missing.text
    assert res_missing.json()["error"]["code"] == "COLLECTION_NOT_FOUND"

    # 2. Valid collection stages proposal with candidate items
    tag_islamic = Tag(workspace_id=workspace.id, name="islamic")
    coll = Collection(workspace_id=workspace.id, name="Islamic History", description="Caliphate and Golden Age", created_by=user.id)
    n1 = Note(workspace_id=workspace.id, title="Islamic Caliphate Timeline", content="Rashidun and Umayyad history.", tags=[tag_islamic, Tag(workspace_id=workspace.id, name="history")], created_by=user.id)
    n2 = Note(workspace_id=workspace.id, title="Baghdad Scholars", content="Islamic Golden Age science and history.", tags=[tag_islamic], created_by=user.id)
    db_session.add_all([coll, n1, n2])
    db_session.commit()

    res_prop = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={"command": "/populate-collection", "parameters": {"query": '"Islamic History"'}},
    )
    assert res_prop.status_code == 200, res_prop.text
    prop_data = res_prop.json()
    assert prop_data["status"] == "proposed"
    assert prop_data["requires_confirmation"] is True
    assert prop_data["data"]["collection_id"] == str(coll.id)
    assert len(prop_data["data"]["candidate_items"]) == 2

    # Ensure no items added before confirmation
    assert db_session.query(CollectionNote).filter(CollectionNote.collection_id == coll.id).count() == 0

    # 3. Confirm proposal -> items added to collection
    res_commit = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/populate-collection",
            "proposal_id": prop_data["proposal_id"],
            "confirmation_token": prop_data["confirmation_token"],
        },
    )
    assert res_commit.status_code == 200, res_commit.text
    commit_data = res_commit.json()
    assert commit_data["status"] == "completed"
    assert commit_data["data"]["added_count"] == 2
    assert db_session.query(CollectionNote).filter(CollectionNote.collection_id == coll.id).count() == 2


def test_bug8_extract_entities_grounded_extraction_and_deduplicated_persistence(client: TestClient, db_session: Session):
    """Bug 8: /extract-entities extracts grounded entities, avoids fabrication on empty notes, and persists on confirm."""
    user = User(display_name="Entity QA User")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Entity QA WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    note = Note(
        workspace_id=workspace.id,
        title="House of Wisdom Scholars",
        content=(
            "Al-Khwarizmi developed algebra in Baghdad under Caliph Al-Ma'mun at the House of Wisdom. "
            "Ibn al-Haytham wrote the Book of Optics in Cairo."
        ),
        tags=[
            Tag(workspace_id=workspace.id, name="mathematics"),
            Tag(workspace_id=workspace.id, name="optics"),
        ],
        created_by=user.id,
    )
    empty_note = Note(
        workspace_id=workspace.id,
        title="Blank Draft",
        content="   ",
        created_by=user.id,
    )
    existing_entity = GraphEntity(
        workspace_id=workspace.id,
        name="Baghdad",
        entity_type="place",
        description="Existing city entity",
    )
    db_session.add_all([note, empty_note, existing_entity])
    db_session.commit()

    # 1. Empty note returns completed with 0 entities (never fabricates fallback entities)
    res_empty = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={"command": "/extract-entities", "parameters": {"note_id": str(empty_note.id)}},
    )
    assert res_empty.status_code == 200, res_empty.text
    empty_data = res_empty.json()
    assert empty_data["status"] == "completed"
    assert empty_data["data"]["entities"] == []

    # 2. Grounded note stages proposal with extracted entities
    res_prop = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={"command": "/extract-entities", "parameters": {"query": '"House of Wisdom Scholars"'}},
    )
    assert res_prop.status_code == 200, res_prop.text
    prop_data = res_prop.json()
    assert prop_data["status"] == "proposed"
    assert prop_data["requires_confirmation"] is True
    extracted_names = {e["name"] for e in prop_data["data"]["entities"]}
    assert len(extracted_names) >= 2
    assert any("Baghdad" in name or "House of Wisdom" in name or "Al-Khwarizmi" in name for name in extracted_names)

    # 3. Confirm extraction -> persists new entities and deduplicates existing "Baghdad"
    res_commit = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/extract-entities",
            "proposal_id": prop_data["proposal_id"],
            "confirmation_token": prop_data["confirmation_token"],
        },
    )
    assert res_commit.status_code == 200, res_commit.text
    commit_data = res_commit.json()
    assert commit_data["status"] == "completed"
    assert commit_data["data"]["created_count"] >= 1

    baghdad_rows = db_session.query(GraphEntity).filter(
        GraphEntity.workspace_id == workspace.id,
        GraphEntity.name == "Baghdad",
    ).all()
    assert len(baghdad_rows) == 1


def test_bug9_reconcile_duplicates_near_duplicate_and_scoped_detection(client: TestClient, db_session: Session):
    """Bug 9: /reconcile-duplicates detects exact and near-duplicate notes and respects optional scope."""
    user = User(display_name="Dup QA User")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Dup QA WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    # Exact reproduction from Bug 9 report
    tag_umar = Tag(workspace_id=workspace.id, name="umar")
    tag_caliphate = Tag(workspace_id=workspace.id, name="caliphate")
    umar_1 = Note(
        workspace_id=workspace.id,
        title="Life of Umar ibn al-Khattab",
        content=(
            "Umar ibn al-Khattab was the second Rashidun caliph. His caliphate introduced major administrative "
            "reforms including the diwan treasury system, judicial separation, and the Hijri calendar."
        ),
        tags=[tag_umar, tag_caliphate, Tag(workspace_id=workspace.id, name="reforms")],
        created_by=user.id,
    )
    umar_2 = Note(
        workspace_id=workspace.id,
        title="Umar ibn al-Khattab: Caliphate and Reforms",
        content=(
            "During the caliphate of Umar ibn al-Khattab, administrative reforms established the diwan "
            "stipend registry, independent judges, and the Islamic Hijri calendar."
        ),
        tags=[tag_umar, tag_caliphate],
        created_by=user.id,
    )
    unrelated = Note(
        workspace_id=workspace.id,
        title="Quantum Entanglement in Photons",
        content="Bell inequality violations and polarization states in optical experiments.",
        tags=[Tag(workspace_id=workspace.id, name="physics")],
        created_by=user.id,
    )
    db_session.add_all([umar_1, umar_2, unrelated])
    db_session.commit()

    # 1. Scoped to "Life of Umar ibn al-Khattab" -> detects near-duplicate Umar note
    res_scoped = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={"command": "/reconcile-duplicates", "parameters": {"query": '"Life of Umar ibn al-Khattab"'}},
    )
    assert res_scoped.status_code == 200, res_scoped.text
    data = res_scoped.json()["data"]
    assert data["notes_examined_count"] == 3
    assert data["scope_type"] == "note"
    assert "Life of Umar ibn al-Khattab" in data["scope_examined"]
    assert len(data["pairs"]) >= 1
    top_pair = data["pairs"][0]
    pair_ids = {top_pair["original_id"], top_pair["duplicate_id"]}
    assert pair_ids == {str(umar_1.id), str(umar_2.id)}

    # 2. Invalid scope returns 404
    res_bad = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={"command": "/reconcile-duplicates", "parameters": {"query": '"Missing Note Title"'}},
    )
    assert res_bad.status_code == 404


def test_bug10_resolve_conflicts_claim_comparison_and_edge_cases(client: TestClient, db_session: Session):
    """Bug 10: /resolve-conflicts compares multiple notes/sources, identifies conflicts, and handles 0/1 source."""
    user = User(display_name="Conflict QA User")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Conflict QA WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    n1 = Note(
        workspace_id=workspace.id,
        title="Jabir ibn Hayyan Corpus",
        content="Jabir ibn Hayyan died in 815 CE in Kufa and authored treatises on alchemy.",
        created_by=user.id,
    )
    n2 = Note(
        workspace_id=workspace.id,
        title="Debates on Jabir Chronology",
        content="Some historians argue Jabir ibn Hayyan died in 806 CE rather than 815 CE, and was not the sole author.",
        created_by=user.id,
    )
    n_single = Note(
        workspace_id=workspace.id,
        title="Unique Telescope Mount",
        content="Equatorial mount tracking stellar rotation.",
        created_by=user.id,
    )
    db_session.add_all([n1, n2, n_single])
    db_session.commit()

    # 1. Empty scope rejected with 422
    res_empty = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={"command": "/resolve-conflicts", "parameters": {"query": ""}},
    )
    assert res_empty.status_code == 422

    # 2. Multi-source topic with conflicting dates/polarity detects conflict without crashing
    res_conflict = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={"command": "/resolve-conflicts", "parameters": {"query": "Jabir ibn Hayyan"}},
    )
    assert res_conflict.status_code == 200, res_conflict.text
    c_data = res_conflict.json()["data"]
    assert c_data["status"] == "conflicts_detected"
    assert len(c_data["sources_analyzed"]) == 2
    assert len(c_data["conflicts"]) >= 1
    assert c_data["conflicts"][0]["claim_a"]
    assert c_data["conflicts"][0]["claim_b"]

    # 3. Single matching source explains insufficient sources for comparison
    res_single = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={"command": "/resolve-conflicts", "parameters": {"query": "Unique Telescope Mount"}},
    )
    assert res_single.status_code == 200, res_single.text
    assert res_single.json()["data"]["status"] == "single_source_only"
    assert len(res_single.json()["data"]["sources_analyzed"]) == 1


def test_organize_knowledge_planner_modes_and_recommendations(
    client: TestClient, db_session: Session
):
    """v0.5.1 Planner: Topic mode, Note-seed mode, Source-seed mode, Disambiguation, Workspace Audit, and Empty/Adequate states."""
    from app.models.collection import CollectionSource
    from app.models.source import Source

    user = User(display_name="Planner QA User")
    db_session.add(user)
    db_session.commit()

    ws = Workspace(name="Islamic Scholarship WS", owner_id=user.id)
    empty_ws = Workspace(name="Empty WS", owner_id=user.id)
    db_session.add_all([ws, empty_ws])
    db_session.commit()

    # 1. Empty workspace returns adequate_organization with 0 fabricated recommendations
    res_empty = client.post(
        f"/api/v1/workspaces/{empty_ws.id}/stella/commands/execute",
        json={"command": "/organize-knowledge", "parameters": {}},
    )
    assert res_empty.status_code == 200, res_empty.text
    empty_data = res_empty.json()["data"]
    assert empty_data["entry_mode"] == "workspace_audit"
    assert empty_data["recommendations"] == []
    assert empty_data["organization_status"] == "adequate_organization"

    # Seed notes, sources, and an existing collection in ws
    tag_hist = Tag(workspace_id=ws.id, name="islamic-history")
    tag_opt = Tag(workspace_id=ws.id, name="optics")

    n_umar = Note(
        workspace_id=ws.id,
        title="Life of Umar ibn al-Khattab",
        content="Caliph Umar ibn al-Khattab established the Diwan and judicial reforms in Medina and Damascus.",
        tags=[tag_hist],
        created_by=user.id,
    )
    n_rashidun = Note(
        workspace_id=ws.id,
        title="Rashidun Administrative Reforms",
        content="Umar ibn al-Khattab organized provincial governance and fiscal registries across Islamic history.",
        tags=[tag_hist],
        created_by=user.id,
    )
    n_optics = Note(
        workspace_id=ws.id,
        title="Ibn al-Haytham Book of Optics",
        content="Experimental camera obscura and visual ray theories in Cairo during Islamic history.",
        tags=[tag_opt],
        created_by=user.id,
    )
    src_chronicle = Source(
        workspace_id=ws.id,
        source_type="text",
        source_identifier="Tabari Chronicle on Umar.txt",
        original_path="Tabari Chronicle on Umar.txt",
        content_hash="a" * 64,
        import_batch_id=uuid.uuid4(),
        import_status="completed",
        processing_status="READY",
        raw_metadata={
            "title": "Tabari Chronicle on Umar.txt",
            "description": "Primary historical source covering Umar ibn al-Khattab and early Islamic history.",
        },
    )
    existing_col = Collection(
        workspace_id=ws.id,
        name="Early Caliphate Archive",
        description="Already contains Life of Umar",
        created_by=user.id,
    )
    db_session.add_all([n_umar, n_rashidun, n_optics, src_chronicle, existing_col])
    db_session.commit()

    # Add n_umar to existing_col so we can verify existing collection memberships are surfaced and preserved
    db_session.add(CollectionNote(collection_id=existing_col.id, note_id=n_umar.id))
    db_session.commit()

    # 2. Topic-based organization: `/organize-knowledge "Islamic history"`
    res_topic = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={"command": "/organize-knowledge", "parameters": {"query": '"Islamic history"'}},
    )
    assert res_topic.status_code == 200, res_topic.text
    topic_data = res_topic.json()["data"]
    assert topic_data["entry_mode"] == "topic"
    assert topic_data["scope_type"] == "topic"
    assert topic_data["total_notes"] >= 2
    assert topic_data["total_sources"] >= 1
    # Because topic matches notes with disjoint tags (islamic-history vs optics), ambiguity metadata is surfaced
    assert topic_data["is_ambiguous"] is True
    assert topic_data["ambiguity_metadata"] is not None
    # Verify recommendations include collection, thread, and entities grounded in workspace items
    rec_types = {r["artifact_type"] for r in topic_data["recommendations"]}
    assert "collection" in rec_types
    assert "thread" in rec_types
    assert "entities" in rec_types
    # Verify existing collection membership is reported on n_umar candidate item
    col_recs = [r for r in topic_data["recommendations"] if r["artifact_type"] == "collection"]
    all_cands = [c for r in col_recs for c in r["candidate_items"]]
    umar_cand = next(c for c in all_cands if c["item_id"] == str(n_umar.id))
    assert "Early Caliphate Archive" in umar_cand["existing_collections"]

    # 3. Note-title input resolves the target note and finds related notes & sources
    res_note_seed = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={
            "command": "/organize-knowledge",
            "parameters": {"query": '"Life of Umar ibn al-Khattab"'},
        },
    )
    assert res_note_seed.status_code == 200, res_note_seed.text
    ns_data = res_note_seed.json()["data"]
    assert ns_data["entry_mode"] == "item_seeded"
    assert ns_data["scope_type"] == "note"
    assert ns_data["seed_item"]["id"] == str(n_umar.id)
    assert ns_data["seed_item"]["item_type"] == "note"
    assert ns_data["total_sources"] >= 1

    # 4. Source-title input resolves the target source and finds related notes
    res_src_seed = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={
            "command": "/organize-knowledge",
            "parameters": {"query": '"Tabari Chronicle on Umar.txt"'},
        },
    )
    assert res_src_seed.status_code == 200, res_src_seed.text
    ss_data = res_src_seed.json()["data"]
    assert ss_data["entry_mode"] == "item_seeded"
    assert ss_data["scope_type"] == "source"
    assert ss_data["seed_item"]["id"] == str(src_chronicle.id)
    assert ss_data["seed_item"]["item_type"] == "source"
    assert ss_data["total_notes"] >= 1

    # 5. Ambiguous item prefix matching multiple items returns disambiguation_options
    res_ambig = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={"command": "/organize-knowledge", "parameters": {"query": '"Umar"'}},
    )
    assert res_ambig.status_code == 200, res_ambig.text
    amb_data = res_ambig.json()["data"]
    assert amb_data["is_ambiguous"] is True
    assert len(amb_data["disambiguation_options"]) >= 2

    # 6. Workspace-wide audit mode (no arguments)
    res_audit = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={"command": "/organize-knowledge", "parameters": {}},
    )
    assert res_audit.status_code == 200, res_audit.text
    audit_data = res_audit.json()["data"]
    assert audit_data["entry_mode"] == "workspace_audit"
    assert audit_data["examined_scope"]["notes_examined"] == 3
    assert audit_data["examined_scope"]["sources_examined"] == 1
    assert len(audit_data["recommendations"]) >= 2


def test_organize_knowledge_stage_configure_exclude_commit_and_isolation(
    client: TestClient, db_session: Session
):
    """v0.5.1 Planner Execution: Customizing collection name/description, excluding items, preserving memberships, thread/entity commit, and workspace isolation."""
    from app.models.collection import CollectionSource
    from app.models.source import Source
    from app.models.thread import Thread, ThreadNote, ThreadSource

    user = User(display_name="Exec QA User")
    db_session.add(user)
    db_session.commit()

    ws = Workspace(name="Active Exec WS", owner_id=user.id)
    foreign_ws = Workspace(name="Foreign Exec WS", owner_id=user.id)
    db_session.add_all([ws, foreign_ws])
    db_session.commit()

    n1 = Note(workspace_id=ws.id, title="Note Alpha", content="Alpha content.", created_by=user.id)
    n2 = Note(workspace_id=ws.id, title="Note Beta", content="Beta content.", created_by=user.id)
    src1 = Source(
        workspace_id=ws.id,
        source_type="text",
        source_identifier="Source Gamma.txt",
        original_path="Source Gamma.txt",
        content_hash="b" * 64,
        import_batch_id=uuid.uuid4(),
        import_status="completed",
        processing_status="READY",
        raw_metadata={"title": "Source Gamma.txt"},
    )
    foreign_note = Note(
        workspace_id=foreign_ws.id,
        title="Foreign Secret Note",
        content="Should never be accessible.",
        created_by=user.id,
    )
    prior_col = Collection(
        workspace_id=ws.id, name="Prior Collection", description="Existing", created_by=user.id
    )
    db_session.add_all([n1, n2, src1, foreign_note, prior_col])
    db_session.commit()

    # Put n1 in prior_col so we can verify existing memberships are preserved
    db_session.add(CollectionNote(collection_id=prior_col.id, note_id=n1.id))
    db_session.commit()

    # 1. Validation: Empty collection name rejected with 422
    res_empty_name = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={
            "command": "/organize-knowledge",
            "parameters": {
                "apply_recommendation": {
                    "operation": "create_collection",
                    "name": "   ",
                    "selected_items": [{"item_id": str(n1.id), "item_type": "note", "title": n1.title}],
                }
            },
        },
    )
    assert res_empty_name.status_code == 422

    # 2. Validation: Zero selected items rejected with 422
    res_zero_items = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={
            "command": "/organize-knowledge",
            "parameters": {
                "apply_recommendation": {
                    "operation": "create_collection",
                    "name": "Valid Name",
                    "selected_items": [
                        {"item_id": str(n1.id), "item_type": "note", "title": n1.title, "selected": False}
                    ],
                }
            },
        },
    )
    assert res_zero_items.status_code == 422

    # 3. Validation: Duplicate collection name conflict rejected with 409
    res_dup_col = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={
            "command": "/organize-knowledge",
            "parameters": {
                "apply_recommendation": {
                    "operation": "create_collection",
                    "name": "Prior Collection",
                    "selected_items": [{"item_id": str(n1.id), "item_type": "note", "title": n1.title}],
                }
            },
        },
    )
    assert res_dup_col.status_code == 409

    # 4. Security: Cross-workspace item ID rejected with 404
    res_cross_ws = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={
            "command": "/organize-knowledge",
            "parameters": {
                "apply_recommendation": {
                    "operation": "create_collection",
                    "name": "Attempted Leak",
                    "selected_items": [
                        {"item_id": str(foreign_note.id), "item_type": "note", "title": "Foreign"}
                    ],
                }
            },
        },
    )
    assert res_cross_ws.status_code == 404

    # 5. Stage new collection with n1 + src1 selected and n2 excluded (selected=False)
    res_stage_col = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={
            "command": "/organize-knowledge",
            "parameters": {
                "apply_recommendation": {
                    "operation": "create_collection",
                    "name": "Custom Curated Dossier",
                    "description": "Custom edited description",
                    "selected_items": [
                        {"item_id": str(n1.id), "item_type": "note", "title": n1.title, "selected": True},
                        {"item_id": str(n2.id), "item_type": "note", "title": n2.title, "selected": False},
                        {"item_id": str(src1.id), "item_type": "source", "title": "Source Gamma.txt", "selected": True},
                    ],
                }
            },
        },
    )
    assert res_stage_col.status_code == 200, res_stage_col.text
    stage_payload = res_stage_col.json()
    assert stage_payload["status"] == "proposed"
    assert stage_payload["requires_confirmation"] is True
    # Ensure collection is NOT created before confirmation
    assert (
        db_session.query(Collection)
        .filter(Collection.workspace_id == ws.id, Collection.name == "Custom Curated Dossier")
        .count()
        == 0
    )

    # Confirm creation -> creates collection, adds ONLY n1 and src1 (excludes n2), and preserves n1 in prior_col
    res_commit_col = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={
            "command": "/organize-knowledge",
            "proposal_id": stage_payload["proposal_id"],
            "confirmation_token": stage_payload["confirmation_token"],
        },
    )
    assert res_commit_col.status_code == 200, res_commit_col.text
    commit_col_data = res_commit_col.json()["data"]
    new_col_id = uuid.UUID(commit_col_data["collection_id"])
    assert commit_col_data["added_count"] == 2
    assert (
        db_session.query(CollectionNote)
        .filter(CollectionNote.collection_id == new_col_id, CollectionNote.note_id == n1.id)
        .count()
        == 1
    )
    assert (
        db_session.query(CollectionNote)
        .filter(CollectionNote.collection_id == new_col_id, CollectionNote.note_id == n2.id)
        .count()
        == 0
    )
    assert (
        db_session.query(CollectionSource)
        .filter(CollectionSource.collection_id == new_col_id, CollectionSource.source_id == src1.id)
        .count()
        == 1
    )
    # Prior collection membership for n1 is still intact!
    assert (
        db_session.query(CollectionNote)
        .filter(CollectionNote.collection_id == prior_col.id, CollectionNote.note_id == n1.id)
        .count()
        == 1
    )

    # 6. Populate existing collection via /populate-collection with commit-time item exclusion
    res_pop_stage = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={"command": "/populate-collection", "parameters": {"query": '"Prior Collection"'}},
    )
    assert res_pop_stage.status_code == 200, res_pop_stage.text
    pop_stage_data = res_pop_stage.json()
    # n1 is already in Prior Collection, so only n2 and src1 are candidates
    cand_ids = {c["item_id"] for c in pop_stage_data["data"]["candidate_items"]}
    assert str(n1.id) not in cand_ids
    assert str(n2.id) in cand_ids

    # Confirm /populate-collection with only n2 selected (src1 unchecked)
    res_pop_commit = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={
            "command": "/populate-collection",
            "proposal_id": pop_stage_data["proposal_id"],
            "confirmation_token": pop_stage_data["confirmation_token"],
            "parameters": {
                "selected_items": [
                    {"item_id": str(n2.id), "item_type": "note", "title": n2.title, "selected": True}
                ]
            },
        },
    )
    assert res_pop_commit.status_code == 200, res_pop_commit.text
    assert res_pop_commit.json()["data"]["added_count"] == 1
    assert (
        db_session.query(CollectionNote)
        .filter(CollectionNote.collection_id == prior_col.id, CollectionNote.note_id == n2.id)
        .count()
        == 1
    )
    assert (
        db_session.query(CollectionSource)
        .filter(CollectionSource.collection_id == prior_col.id, CollectionSource.source_id == src1.id)
        .count()
        == 0
    )

    # 7. Stage and commit a Research Thread recommendation
    res_stage_thread = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={
            "command": "/organize-knowledge",
            "parameters": {
                "apply_recommendation": {
                    "operation": "create_thread",
                    "name": "Alpha-Gamma Research Inquiry",
                    "question": "How does Source Gamma corroborate Note Alpha?",
                    "selected_items": [
                        {"item_id": str(n1.id), "item_type": "note", "title": n1.title, "selected": True},
                        {"item_id": str(src1.id), "item_type": "source", "title": "Source Gamma.txt", "selected": True},
                    ],
                }
            },
        },
    )
    assert res_stage_thread.status_code == 200, res_stage_thread.text
    t_stage = res_stage_thread.json()
    res_commit_thread = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={
            "command": "/organize-knowledge",
            "proposal_id": t_stage["proposal_id"],
            "confirmation_token": t_stage["confirmation_token"],
        },
    )
    assert res_commit_thread.status_code == 200, res_commit_thread.text
    t_data = res_commit_thread.json()["data"]
    assert t_data["status"] == "thread_created"
    thread_uuid = uuid.UUID(t_data["thread_id"])
    assert db_session.get(Thread, thread_uuid) is not None
    assert db_session.query(ThreadNote).filter(ThreadNote.thread_id == thread_uuid).count() == 1
    assert db_session.query(ThreadSource).filter(ThreadSource.thread_id == thread_uuid).count() == 1

    # 8. Stage and commit Entities & Relationships recommendation
    res_stage_ents = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={
            "command": "/organize-knowledge",
            "parameters": {
                "apply_recommendation": {
                    "operation": "create_entities_and_relationships",
                    "name": "Extracted Graph Concepts",
                    "selected_entities": [
                        {"name": "Medina Diwan", "entity_type": "concept", "description": "Fiscal registry", "selected": True},
                        {"name": "Damascus Registry", "entity_type": "location", "description": "Provincial archive", "selected": True},
                    ],
                    "selected_relationships": [
                        {
                            "source_entity": "Medina Diwan",
                            "target_entity": "Damascus Registry",
                            "relationship_type": "related_to",
                            "description": "Linked administrative registries",
                            "selected": True,
                        }
                    ],
                }
            },
        },
    )
    assert res_stage_ents.status_code == 200, res_stage_ents.text
    e_stage = res_stage_ents.json()
    res_commit_ents = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={
            "command": "/organize-knowledge",
            "proposal_id": e_stage["proposal_id"],
            "confirmation_token": e_stage["confirmation_token"],
        },
    )
    assert res_commit_ents.status_code == 200, res_commit_ents.text
    e_commit_data = res_commit_ents.json()["data"]
    assert e_commit_data["created_count"] == 2
    assert e_commit_data["relationships_created_count"] == 1


def test_reconcile_duplicates_preserves_detailed_message_and_action_result(client: TestClient, db_session: Session):
    """Test that /reconcile-duplicates persists full user prompt and structured action result in message content."""
    from sqlalchemy import select
    import json
    import re

    user = User(display_name="Reconcile Refresh User")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Reconcile WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    conv = Conversation(workspace_id=workspace.id, title="Reconciliation Session")
    db_session.add(conv)
    db_session.commit()

    note1 = Note(
        workspace_id=workspace.id,
        title="Life of Umar ibn al-Khattab",
        content="Early administrative reforms and fiscal diwans.",
        created_by=user.id,
    )
    db_session.add(note1)
    db_session.commit()

    raw_prompt = '/reconcile-duplicates "Life of Umar ibn al-Khattab"'
    res = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/reconcile-duplicates",
            "args": ["Life of Umar ibn al-Khattab"],
            "conversation_id": str(conv.id),
            "prompt": raw_prompt,
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "completed"
    assert data["message"] == "Duplicate reconciliation check complete: 0 duplicate pairs identified."
    assert data["data"]["duplicate_count"] == 0
    assert data["data"]["status"] == "reconciled"

    # Verify persisted messages in conversation thread
    res_msgs = client.get(f"/api/v1/conversations/{conv.id}/messages")
    assert res_msgs.status_code == 200, res_msgs.text
    raw_data = res_msgs.json()
    msgs = raw_data if isinstance(raw_data, list) else raw_data.get("items", [])
    assert len(msgs) == 2

    # 1. User message preserves exact prompt with quotes
    user_msg = msgs[0]
    assert user_msg["role"] == "user"
    assert user_msg["content"] == raw_prompt

    # 2. Assistant message contains human readable text AND structured action result comment
    asst_msg = msgs[1]
    assert asst_msg["role"] == "assistant"
    assert "Duplicate reconciliation check complete: 0 duplicate pairs identified." in asst_msg["content"]
    assert "<!--hyades-action-result:" in asst_msg["content"]

    match = re.search(r"<!--hyades-action-result:(.*?)-->", asst_msg["content"], re.DOTALL)
    assert match is not None
    payload = json.loads(match.group(1))
    assert payload["command"] == "/reconcile-duplicates"
    assert payload["status"] == "completed"
    assert payload["data"]["duplicate_count"] == 0
    assert payload["data"]["status"] == "reconciled"

    # 3. LLM history builder strips the hidden comment
    from app.services.assistant_service import _build_history_messages
    history = _build_history_messages(db_session, conv.id)
    assert len(history) == 2
    assert "<!--hyades-action-result:" not in history[1]["content"]
    assert history[1]["content"] == "Duplicate reconciliation check complete: 0 duplicate pairs identified."


def test_summarize_and_create_note_persistence_across_refresh(client: TestClient, db_session: Session):
    """Verify that /summarize, /create-note (draft & commit), and generic proposals persist full structured envelopes in conversation messages."""
    import json
    import re

    user = User(display_name="Persistence QA User")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Persistence WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    conv = Conversation(workspace_id=workspace.id, title="Arch Linux & Note Session")
    db_session.add(conv)
    db_session.commit()

    arch_note = Note(
        workspace_id=workspace.id,
        title="Arch Linux. Easy Words: Foundations, Dynamics, and Significance",
        content=(
            "### Overview\nArch Linux is an independently developed x86-64 general-purpose GNU/Linux distribution.\n\n"
            "### Key Principles\nPacman package management and rolling-release updates keep software current."
        ),
        created_by=user.id,
    )
    db_session.add(arch_note)
    db_session.commit()

    # 1. Execute /summarize with conversation_id and prompt
    sum_prompt = '/summarize "Arch Linux. Easy Words: Foundations, Dynamics, and Significance"'
    res_sum = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/summarize",
        json={
            "target": "Arch Linux. Easy Words: Foundations, Dynamics, and Significance",
            "conversation_id": str(conv.id),
            "prompt": sum_prompt,
        },
    )
    assert res_sum.status_code == 200, res_sum.text

    # 2. Execute /create-note draft + commit in the same conversation
    note_prompt = "/create-note quantum decoherence"
    res_draft = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/create-note/draft",
        json={
            "topic": "quantum decoherence",
            "conversation_id": str(conv.id),
            "prompt": note_prompt,
        },
    )
    assert res_draft.status_code == 200, res_draft.text
    draft_data = res_draft.json()

    res_commit = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/create-note/commit",
        json={
            "proposal_id": draft_data["proposal_id"],
            "confirmation_token": draft_data["confirmation_token"],
            "conversation_id": str(conv.id),
        },
    )
    assert res_commit.status_code == 200, res_commit.text
    commit_data = res_commit.json()

    # 3. Reload messages from GET /api/v1/conversations/{id}/messages
    res_msgs = client.get(f"/api/v1/conversations/{conv.id}/messages")
    assert res_msgs.status_code == 200, res_msgs.text
    raw_msgs = res_msgs.json()
    msgs = raw_msgs if isinstance(raw_msgs, list) else raw_msgs.get("items", [])
    assert len(msgs) == 4

    # Verify /summarize user & assistant message
    assert msgs[0]["role"] == "user"
    assert msgs[0]["content"] == sum_prompt
    assert msgs[1]["role"] == "assistant"
    sum_match = re.search(r"<!--hyades-action-result:(.*?)-->", msgs[1]["content"], re.DOTALL)
    assert sum_match is not None
    sum_payload = json.loads(sum_match.group(1))
    assert sum_payload["card_type"] == "summary"
    assert sum_payload["summaryCard"]["targetTitle"] == arch_note.title
    assert len(sum_payload["summaryCard"]["keyPoints"]) >= 1

    # Verify /create-note user & committed assistant message (updated in-place on commit)
    assert msgs[2]["role"] == "user"
    assert msgs[2]["content"] == note_prompt
    assert msgs[3]["role"] == "assistant"
    note_match = re.search(r"<!--hyades-action-result:(.*?)-->", msgs[3]["content"], re.DOTALL)
    assert note_match is not None
    note_payload = json.loads(note_match.group(1))
    assert note_payload["card_type"] == "note_draft"
    assert note_payload["status"] == "committed"
    assert note_payload["noteDraft"]["status"] == "committed"
    assert note_payload["noteDraft"]["savedNoteId"] == commit_data["note_id"]


def test_placeholder_commands_and_internal_agent_actions(client: TestClient, db_session: Session):
    """Verify that the 6 placeholder commands return coming_soon without mutating data, and internal actions remain callable internally."""
    user = User(display_name="Placeholder QA User")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Placeholder WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    conv = Conversation(workspace_id=workspace.id, title="Placeholder Session")
    db_session.add(conv)
    db_session.commit()

    note = Note(workspace_id=workspace.id, title="Test Note", content="Test content.", created_by=user.id)
    coll = Collection(workspace_id=workspace.id, name="Test Collection", created_by=user.id)
    db_session.add_all([note, coll])
    db_session.commit()

    placeholder_commands = [
        ("/link-notes", "Link Notes is under development and coming soon."),
        ("/review-inbox", "Review Inbox is under development and coming soon."),
        ("/analyze", "Analyze is under development and coming soon."),
        ("/find-sources", "Find Sources is under development and coming soon."),
        ("/ask-about", "Ask About is under development and coming soon."),
        ("/explore-graph", "Explore Graph is under development and coming soon."),
    ]

    initial_proposal_count = db_session.query(ActionProposal).count()

    for cmd, expected_msg in placeholder_commands:
        res = client.post(
            f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
            json={
                "command": cmd,
                "args": ["Test Note"],
                "conversation_id": str(conv.id),
                "prompt": f'{cmd} "Test Note"',
            },
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["status"] == "coming_soon"
        assert data["message"] == expected_msg
        assert data["requires_confirmation"] is False
        assert data["proposal_id"] is None

        # Placeholder commands must not return resource suggestions
        res_sug = client.get(
            f"/api/v1/workspaces/{workspace.id}/stella/suggestions?command={cmd}&q=Test"
        )
        assert res_sug.status_code == 200
        assert res_sug.json()["items"] == []

    # Verify zero proposals were staged by placeholder commands
    assert db_session.query(ActionProposal).count() == initial_proposal_count

    # Verify internal agent actions (/search, /add-to-collection) are NOT in user-facing list_commands
    res_list = client.get(f"/api/v1/workspaces/{workspace.id}/stella/commands")
    listed_cmds = {c["command"] for c in res_list.json()["commands"]}
    assert "/search" not in listed_cmds
    assert "/add-to-collection" not in listed_cmds

    # Verify internal agent actions remain registered in ALL_OPERATIONS and executable internally
    from app.services.stella_command_service import ALL_OPERATIONS
    all_op_names = {c.command for c in ALL_OPERATIONS}
    assert "/search" in all_op_names
    assert "/add-to-collection" in all_op_names

    res_internal_search = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={"command": "/search", "args": ["Test"]},
    )
    assert res_internal_search.status_code == 200, res_internal_search.text
    assert res_internal_search.json()["status"] == "completed"

    res_internal_add = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={"command": "/add-to-collection", "args": ["Test Note", "Test Collection"]},
    )
    assert res_internal_add.status_code == 200, res_internal_add.text
    assert res_internal_add.json()["status"] == "proposed"


def test_workstream_a_create_source_research_brief_and_provenance(client: TestClient, db_session: Session):
    """Workstream A: /create-source builds an evidence-oriented Research Brief with honest referencing."""
    from app.models.source import Source
    from app.services import source_service

    user = User(display_name="Research User")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Research Brief WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    # Pre-populate workspace with a background source
    bg_source = source_service.upload_source(
        db=db_session,
        workspace_id=workspace.id,
        file_content=b"Historical records of the House of Windsor and British nobility peerage structures.",
        filename="windsor_records.txt",
        content_type="text/plain",
    )
    meta = dict(bg_source.raw_metadata or {})
    meta["title"] = "Windsor Records"
    bg_source.raw_metadata = meta
    bg_source.source_identifier = "Windsor Records"
    db_session.commit()

    # Execute /create-source free text query
    res = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/create-source",
            "parameters": {"query": "Constitutional roles of royal vs noble families in Britain"},
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "proposed"
    content = data["data"]["content"]

    # Verify Research Brief structure
    assert "# Research Brief:" in content
    assert "## Research Question & Scope" in content
    assert "## Key Findings & Available Evidence" in content
    assert "## Comparison & Analysis" in content
    assert "## Uncertainties, Disagreements & Gaps" in content
    assert "## Traceable References & Accessed Materials" in content
    # Verify no fake academic posturing
    assert "civic morphologies" not in content
    assert "systemic rupture" not in content

    # Commit source proposal
    res_commit = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/create-source",
            "proposal_id": data["proposal_id"],
            "confirmation_token": data["confirmation_token"],
        },
    )
    assert res_commit.status_code == 200, res_commit.text
    source_id = uuid.UUID(res_commit.json()["data"]["source_id"])
    created_src = db_session.get(Source, source_id)
    assert created_src is not None
    # Source chunks contain the processed content
    from app.models.content_chunk import ContentChunk
    chunks = db_session.scalars(
        select(ContentChunk).where(ContentChunk.source_id == source_id)
    ).all()
    combined_chunk_text = " ".join(c.content for c in chunks)
    assert "Research Brief" in combined_chunk_text


def test_workstream_b_create_note_pedagogical_and_source_linking(client: TestClient, db_session: Session):
    """Workstream B: /create-note generates pedagogical explanations and links supporting workspace sources."""
    from app.models.source_note_link import SourceNoteLink
    from app.services import source_service

    user = User(display_name="Teacher User")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Pedagogy WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    # Pre-populate a source that should be linked
    ev_source = source_service.upload_source(
        db=db_session,
        workspace_id=workspace.id,
        file_content=b"Foundational thermodynamic cycles: Carnot engines, entropy increase, and conservation of energy.",
        filename="thermodynamics_intro.txt",
        content_type="text/plain",
    )
    meta = dict(ev_source.raw_metadata or {})
    meta["title"] = "Thermodynamics Intro"
    ev_source.raw_metadata = meta
    ev_source.source_identifier = "Thermodynamics Intro"
    db_session.commit()

    # Draft a note on Thermodynamics
    res_draft = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/create-note/draft",
        json={"topic": "Thermodynamics"},
    )
    assert res_draft.status_code == 200, res_draft.text
    draft_data = res_draft.json()

    content = draft_data["content"]
    assert "### Definition & Core Concept" in content
    assert "### How It Works & Key Mechanisms" in content
    assert "### Concrete Examples & Practical Application" in content
    assert "### Common Misconceptions & Pitfalls" in content
    assert "### Supporting Workspace Sources" in content
    assert "civic morphologies" not in content
    assert "Foundations, Dynamics, and Significance" not in draft_data["title"]

    # Commit note draft
    res_commit = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/create-note/commit",
        json={
            "proposal_id": draft_data["proposal_id"],
            "confirmation_token": draft_data["confirmation_token"],
        },
    )
    assert res_commit.status_code == 200, res_commit.text
    note_id = uuid.UUID(res_commit.json()["note_id"])

    # Verify SourceNoteLink was created in the database
    link = db_session.scalars(
        select(SourceNoteLink).where(
            SourceNoteLink.note_id == note_id,
            SourceNoteLink.source_id == ev_source.id,
        )
    ).first()
    assert link is not None
    assert link.source_id == ev_source.id
    assert link.note_id == note_id

def test_create_source_proposal_persistence_no_conversation_splitting(client: TestClient, db_session: Session):
    """Verify long research brief proposals (>4000 chars) are not truncated and commit in-place without splitting history."""
    from app.models.message import Message
    from app.models.source import Source
    import json
    import re

    user = User(display_name="Persistence Tester")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Persistence WS", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    conv = Conversation(workspace_id=workspace.id, title="Create Source Thread")
    db_session.add(conv)
    db_session.commit()

    # 1. Execute /create-source which synthesizes a rich research brief
    res_prop = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/create-source",
            "conversation_id": str(conv.id),
            "parameters": {
                "query": "evaluating llm and rag. also web search access methods and available apis for this purpose"
            },
        },
    )
    assert res_prop.status_code == 200, res_prop.text
    prop_data = res_prop.json()
    assert prop_data["status"] == "proposed"
    proposal_id = prop_data["proposal_id"]
    token = prop_data["confirmation_token"]

    # 2. Check assistant message in database - must NOT be truncated and must contain valid JSON comment
    stmt = select(Message).where(Message.conversation_id == conv.id).order_by(Message.created_at.asc())
    msgs_stage1 = db_session.scalars(stmt).all()
    assert len(msgs_stage1) == 2
    assert msgs_stage1[0].role == "user"
    assert msgs_stage1[1].role == "assistant"

    ast_content = msgs_stage1[1].content
    assert "<!--hyades-action-result:" in ast_content
    assert ast_content.endswith("-->")
    assert proposal_id in ast_content

    # 3. Confirm the proposal
    res_commit = client.post(
        f"/api/v1/workspaces/{workspace.id}/stella/commands/execute",
        json={
            "command": "/create-source",
            "conversation_id": str(conv.id),
            "proposal_id": proposal_id,
            "confirmation_token": token,
        },
    )
    assert res_commit.status_code == 200, res_commit.text
    commit_data = res_commit.json()
    assert commit_data["status"] == "completed"

    # 4. Check conversation messages after commit - must STILL be exactly 2 messages (updated in place, no split!)
    db_session.expire_all()
    msgs_stage2 = db_session.scalars(stmt).all()
    assert len(msgs_stage2) == 2, f"Expected exactly 2 messages (no split), but found {len(msgs_stage2)}"
    assert msgs_stage2[0].role == "user"
    assert msgs_stage2[1].role == "assistant"

    # Verify assistant message has status='committed' in its action result comment
    match = re.search(r"<!--hyades-action-result:([\s\S]*?)-->", msgs_stage2[1].content)
    assert match is not None
    parsed = json.loads(match.group(1))
    assert parsed["status"] == "committed"
    assert parsed["requires_confirmation"] is False
    assert parsed["data"]["source_id"] is not None

    # Verify source was persisted in database
    source_id = uuid.UUID(parsed["data"]["source_id"])
    source_row = db_session.get(Source, source_id)
    assert source_row is not None
    assert "Evaluating" in (source_row.source_identifier or str(source_row.raw_metadata))

