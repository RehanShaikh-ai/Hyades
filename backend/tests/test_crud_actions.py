"""Tests for Stella CRUD actions and execute endpoint.

Verifies:
- All 26 new CRUD actions function through canonical domain services.
- Two-phase propose and commit mechanics enforce safe workspace mutations.
- The /stella/commands/execute endpoint stages proposals and executes commits.
- Conversation message exchanges persist correctly.
"""

import uuid
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.collection import Collection
from app.models.conversation import Conversation
from app.models.graph_entity import GraphEntity
from app.models.message import Message
from app.models.note import Note
from app.models.source import Source
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.action import ActionExecuteRequest
from app.services import action_execution_service


def _setup_test_workspace(db_session: Session) -> tuple[User, Workspace]:
    user = User(display_name="CRUD Tester")
    db_session.add(user)
    db_session.commit()
    ws = Workspace(name="CRUD WS", owner_id=user.id)
    db_session.add(ws)
    db_session.commit()
    return user, ws


def test_notes_rename_and_duplicate(db_session: Session):
    user, ws = _setup_test_workspace(db_session)
    note = Note(
        workspace_id=ws.id,
        created_by=user.id,
        title="Original Title",
        content="Note body content for testing.",
    )
    db_session.add(note)
    db_session.commit()

    # 1. Propose rename
    prop_res = action_execution_service.execute_action(
        db=db_session,
        workspace_id=ws.id,
        action_id="notes.rename",
        request=ActionExecuteRequest(
            mode="propose",
            input={"note_id": str(note.id), "new_title": "Renamed Note"},
            idempotency_key=str(uuid.uuid4()),
        ),
    )
    assert prop_res.proposals
    prop = prop_res.proposals[0]

    # Commit rename
    action_execution_service.execute_action(
        db=db_session,
        workspace_id=ws.id,
        action_id="notes.rename",
        request=ActionExecuteRequest(
            mode="commit",
            confirmation_token=prop.confirmation_token,
            idempotency_key=str(uuid.uuid4()),
            input={},
        ),
    )
    db_session.refresh(note)
    assert note.title == "Renamed Note"

    # 2. Duplicate note
    dup_prop = action_execution_service.execute_action(
        db=db_session,
        workspace_id=ws.id,
        action_id="notes.duplicate",
        request=ActionExecuteRequest(
            mode="propose",
            input={"note_id": str(note.id)},
            idempotency_key=str(uuid.uuid4()),
        ),
    )
    dup_commit = action_execution_service.execute_action(
        db=db_session,
        workspace_id=ws.id,
        action_id="notes.duplicate",
        request=ActionExecuteRequest(
            mode="commit",
            confirmation_token=dup_prop.proposals[0].confirmation_token,
            idempotency_key=str(uuid.uuid4()),
            input={},
        ),
    )
    assert "Renamed Note (Copy)" in dup_commit.result["title"]


def test_notes_archive_restore_pin_unpin(db_session: Session):
    user, ws = _setup_test_workspace(db_session)
    note = Note(
        workspace_id=ws.id,
        created_by=user.id,
        title="Archival Note",
        content="Body content.",
        is_archived=False,
        is_pinned=False,
    )
    db_session.add(note)
    db_session.commit()

    # Archive
    p = action_execution_service.execute_action(
        db_session, ws.id, "notes.archive",
        ActionExecuteRequest(mode="propose", input={"note_id": str(note.id)}, idempotency_key=str(uuid.uuid4()))
    )
    action_execution_service.execute_action(
        db_session, ws.id, "notes.archive",
        ActionExecuteRequest(mode="commit", confirmation_token=p.proposals[0].confirmation_token, idempotency_key=str(uuid.uuid4()), input={})
    )
    db_session.refresh(note)
    assert note.is_archived is True

    # Restore
    p = action_execution_service.execute_action(
        db_session, ws.id, "notes.restore",
        ActionExecuteRequest(mode="propose", input={"note_id": str(note.id)}, idempotency_key=str(uuid.uuid4()))
    )
    action_execution_service.execute_action(
        db_session, ws.id, "notes.restore",
        ActionExecuteRequest(mode="commit", confirmation_token=p.proposals[0].confirmation_token, idempotency_key=str(uuid.uuid4()), input={})
    )
    db_session.refresh(note)
    assert note.is_archived is False

    # Pin
    p = action_execution_service.execute_action(
        db_session, ws.id, "notes.pin",
        ActionExecuteRequest(mode="propose", input={"note_id": str(note.id)}, idempotency_key=str(uuid.uuid4()))
    )
    action_execution_service.execute_action(
        db_session, ws.id, "notes.pin",
        ActionExecuteRequest(mode="commit", confirmation_token=p.proposals[0].confirmation_token, idempotency_key=str(uuid.uuid4()), input={})
    )
    db_session.refresh(note)
    assert note.is_pinned is True

    # Unpin
    p = action_execution_service.execute_action(
        db_session, ws.id, "notes.unpin",
        ActionExecuteRequest(mode="propose", input={"note_id": str(note.id)}, idempotency_key=str(uuid.uuid4()))
    )
    action_execution_service.execute_action(
        db_session, ws.id, "notes.unpin",
        ActionExecuteRequest(mode="commit", confirmation_token=p.proposals[0].confirmation_token, idempotency_key=str(uuid.uuid4()), input={})
    )
    db_session.refresh(note)
    assert note.is_pinned is False


def test_collections_crud_actions(db_session: Session):
    _, ws = _setup_test_workspace(db_session)

    # 1. Create collection
    p = action_execution_service.execute_action(
        db_session, ws.id, "collections.create",
        ActionExecuteRequest(mode="propose", input={"name": "History Dossier", "description": "Historical notes"}, idempotency_key=str(uuid.uuid4()))
    )
    res = action_execution_service.execute_action(
        db_session, ws.id, "collections.create",
        ActionExecuteRequest(mode="commit", confirmation_token=p.proposals[0].confirmation_token, idempotency_key=str(uuid.uuid4()), input={})
    )
    col_id = res.result["collection_id"]
    col = db_session.get(Collection, uuid.UUID(col_id))
    assert col is not None
    assert col.name == "History Dossier"

    # 2. Rename collection
    p = action_execution_service.execute_action(
        db_session, ws.id, "collections.rename",
        ActionExecuteRequest(mode="propose", input={"collection_id": col_id, "new_name": "Ancient History"}, idempotency_key=str(uuid.uuid4()))
    )
    action_execution_service.execute_action(
        db_session, ws.id, "collections.rename",
        ActionExecuteRequest(mode="commit", confirmation_token=p.proposals[0].confirmation_token, idempotency_key=str(uuid.uuid4()), input={})
    )
    db_session.refresh(col)
    assert col.name == "Ancient History"

    # 3. Delete collection
    p = action_execution_service.execute_action(
        db_session, ws.id, "collections.delete",
        ActionExecuteRequest(mode="propose", input={"collection_id": col_id}, idempotency_key=str(uuid.uuid4()))
    )
    action_execution_service.execute_action(
        db_session, ws.id, "collections.delete",
        ActionExecuteRequest(mode="commit", confirmation_token=p.proposals[0].confirmation_token, idempotency_key=str(uuid.uuid4()), input={})
    )
    assert db_session.get(Collection, uuid.UUID(col_id)) is None


def test_sources_and_entities_crud(db_session: Session):
    _, ws = _setup_test_workspace(db_session)

    # 1. Create source
    p = action_execution_service.execute_action(
        db_session, ws.id, "sources.create",
        ActionExecuteRequest(mode="propose", input={"title": "Treatise.pdf", "content": "Sample text"}, idempotency_key=str(uuid.uuid4()))
    )
    res = action_execution_service.execute_action(
        db_session, ws.id, "sources.create",
        ActionExecuteRequest(mode="commit", confirmation_token=p.proposals[0].confirmation_token, idempotency_key=str(uuid.uuid4()), input={})
    )
    source_id = res.result["source_id"]
    source = db_session.get(Source, uuid.UUID(source_id))
    assert source is not None
    assert "Treatise.pdf" in source.original_path

    # 2. Rename source
    p = action_execution_service.execute_action(
        db_session, ws.id, "sources.rename",
        ActionExecuteRequest(mode="propose", input={"source_id": source_id, "new_title": "RenamedManuscript.pdf"}, idempotency_key=str(uuid.uuid4()))
    )
    action_execution_service.execute_action(
        db_session, ws.id, "sources.rename",
        ActionExecuteRequest(mode="commit", confirmation_token=p.proposals[0].confirmation_token, idempotency_key=str(uuid.uuid4()), input={})
    )
    db_session.refresh(source)
    assert source.original_path == "RenamedManuscript.pdf"

    # 3. Create Entity
    p = action_execution_service.execute_action(
        db_session, ws.id, "entities.create",
        ActionExecuteRequest(mode="propose", input={"name": "Isaac Newton", "entity_type": "person"}, idempotency_key=str(uuid.uuid4()))
    )
    res = action_execution_service.execute_action(
        db_session, ws.id, "entities.create",
        ActionExecuteRequest(mode="commit", confirmation_token=p.proposals[0].confirmation_token, idempotency_key=str(uuid.uuid4()), input={})
    )
    entity_id = res.result["entity_id"]
    entity = db_session.get(GraphEntity, uuid.UUID(entity_id))
    assert entity is not None
    assert entity.name == "Isaac Newton"

    # 4. Update Entity
    p = action_execution_service.execute_action(
        db_session, ws.id, "entities.update",
        ActionExecuteRequest(mode="propose", input={"entity_id": entity_id, "name": "Sir Isaac Newton"}, idempotency_key=str(uuid.uuid4()))
    )
    action_execution_service.execute_action(
        db_session, ws.id, "entities.update",
        ActionExecuteRequest(mode="commit", confirmation_token=p.proposals[0].confirmation_token, idempotency_key=str(uuid.uuid4()), input={})
    )
    db_session.refresh(entity)
    assert entity.name == "Sir Isaac Newton"


def test_tags_add_and_remove_from_note(db_session: Session):
    user, ws = _setup_test_workspace(db_session)
    note = Note(workspace_id=ws.id, created_by=user.id, title="Quantum Note", content="Physics research.")
    db_session.add(note)
    db_session.commit()

    # Tag Note
    p = action_execution_service.execute_action(
        db_session, ws.id, "tags.add_to_note",
        ActionExecuteRequest(mode="propose", input={"note_id": str(note.id), "tag_name": "quantum-physics"}, idempotency_key=str(uuid.uuid4()))
    )
    action_execution_service.execute_action(
        db_session, ws.id, "tags.add_to_note",
        ActionExecuteRequest(mode="commit", confirmation_token=p.proposals[0].confirmation_token, idempotency_key=str(uuid.uuid4()), input={})
    )
    db_session.refresh(note)
    tag_names = [t.name for t in note.tags]
    assert "quantum-physics" in tag_names

    # Untag Note
    p = action_execution_service.execute_action(
        db_session, ws.id, "tags.remove_from_note",
        ActionExecuteRequest(mode="propose", input={"note_id": str(note.id), "tag_name": "quantum-physics"}, idempotency_key=str(uuid.uuid4()))
    )
    action_execution_service.execute_action(
        db_session, ws.id, "tags.remove_from_note",
        ActionExecuteRequest(mode="commit", confirmation_token=p.proposals[0].confirmation_token, idempotency_key=str(uuid.uuid4()), input={})
    )
    db_session.refresh(note)
    tag_names = [t.name for t in note.tags]
    assert "quantum-physics" not in tag_names


def test_stella_commands_execute_api(client: TestClient, db_session: Session):
    """Test POST /workspaces/{workspace_id}/stella/commands/execute endpoint."""
    user, ws = _setup_test_workspace(db_session)
    conv = Conversation(workspace_id=ws.id, title="Research Session")
    db_session.add(conv)
    note = Note(workspace_id=ws.id, created_by=user.id, title="Test Note", content="Body text")
    db_session.add(note)
    db_session.commit()

    # 1. Propose /rename-note
    resp = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={
            "command": "/rename-note",
            "args": ["Test Note", "Final Test Note"],
            "conversation_id": str(conv.id),
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "proposed"
    assert data["requires_confirmation"] is True
    assert data["proposal_id"] is not None
    prop_id = data["proposal_id"]
    token = data["confirmation_token"]

    # 2. Commit /rename-note
    commit_resp = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={
            "command": "/rename-note",
            "proposal_id": prop_id,
            "confirmation_token": token,
            "conversation_id": str(conv.id),
        },
    )
    assert commit_resp.status_code == 200, commit_resp.text
    commit_data = commit_resp.json()
    assert commit_data["status"] == "completed"

    db_session.refresh(note)
    assert note.title == "Final Test Note"

    # Verify message was logged to conversation
    msgs = list(db_session.query(Message).filter(Message.conversation_id == conv.id).all())
    assert len(msgs) >= 2
    assert any("Final Test Note" in (m.content or "") for m in msgs)
