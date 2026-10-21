"""Integration tests for all 6 Controlled Write Actions & Undo per CONTRACT v0.5.1 §6, §7.4.

Actions tested across full propose -> commit -> undo lifecycle:
1. notes.create
2. notes.update
3. notes.link
4. collections.add_item
5. graph.add_relationship
6. notes.delete
"""

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import (
    Collection,
    CollectionNote,
    GraphEntity,
    GraphRelationship,
    Note,
    NoteLink,
    User,
    Workspace,
)


def _setup_ws(db: Session) -> tuple[Workspace, User]:
    user = User(display_name="Mutation Tester")
    db.add(user)
    db.commit()
    ws = Workspace(name="Mutation WS", owner_id=user.id)
    db.add(ws)
    db.commit()
    return ws, user


def test_notes_create_commit_and_undo(client: TestClient, db_session: Session):
    """Propose, commit, and undo notes.create."""
    ws, _ = _setup_ws(db_session)

    # 1. Propose
    r_prop = client.post(
        "/api/v1/actions/notes.create/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "propose",
            "input": {"title": "Brand New Note", "content": "Special note content"},
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert r_prop.status_code == 200
    token = r_prop.json()["proposals"][0]["confirmation_token"]

    # 2. Commit
    r_commit = client.post(
        "/api/v1/actions/notes.create/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "commit",
            "input": {"title": "Brand New Note", "content": "Special note content"},
            "idempotency_key": str(uuid.uuid4()),
            "confirmation_token": token,
        },
    )
    assert r_commit.status_code == 200
    note_id = uuid.UUID(r_commit.json()["result"]["note_id"])
    change_set_id = r_commit.json()["committed_changes"][0]["change_set_id"]

    note = db_session.get(Note, note_id)
    assert note is not None
    assert note.title == "Brand New Note"
    assert note.is_archived is False

    # 3. Undo
    r_undo = client.post(
        f"/api/v1/actions/change-sets/{change_set_id}/undo",
        headers={"X-Workspace-Id": str(ws.id)},
    )
    assert r_undo.status_code == 200
    db_session.expire_all()
    note_after = db_session.get(Note, note_id)
    assert note_after is None or note_after.is_archived is True


def test_notes_update_commit_and_undo(client: TestClient, db_session: Session):
    """Propose, commit, and undo notes.update."""
    ws, user = _setup_ws(db_session)
    note = Note(
        workspace_id=ws.id, created_by=user.id, title="Original Title", content="Original Content"
    )
    db_session.add(note)
    db_session.commit()

    # 1. Propose
    r_prop = client.post(
        "/api/v1/actions/notes.update/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "propose",
            "input": {
                "note_id": str(note.id),
                "title": "Updated Title",
                "content": "Updated Content",
            },
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert r_prop.status_code == 200
    token = r_prop.json()["proposals"][0]["confirmation_token"]

    # 2. Commit
    r_commit = client.post(
        "/api/v1/actions/notes.update/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "commit",
            "input": {
                "note_id": str(note.id),
                "title": "Updated Title",
                "content": "Updated Content",
            },
            "idempotency_key": str(uuid.uuid4()),
            "confirmation_token": token,
        },
    )
    assert r_commit.status_code == 200
    change_set_id = r_commit.json()["committed_changes"][0]["change_set_id"]

    db_session.expire_all()
    note_updated = db_session.get(Note, note.id)
    assert note_updated.title == "Updated Title"
    assert note_updated.content == "Updated Content"

    # 3. Undo
    r_undo = client.post(
        f"/api/v1/actions/change-sets/{change_set_id}/undo",
        headers={"X-Workspace-Id": str(ws.id)},
    )
    assert r_undo.status_code == 200
    db_session.expire_all()
    note_restored = db_session.get(Note, note.id)
    assert note_restored.title == "Original Title"
    assert note_restored.content == "Original Content"


def test_notes_link_commit_and_undo(client: TestClient, db_session: Session):
    """Propose, commit, and undo notes.link."""
    ws, user = _setup_ws(db_session)
    n1 = Note(workspace_id=ws.id, created_by=user.id, title="Note One")
    n2 = Note(workspace_id=ws.id, created_by=user.id, title="Note Two")
    db_session.add_all([n1, n2])
    db_session.commit()

    # 1. Propose
    r_prop = client.post(
        "/api/v1/actions/notes.link/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "propose",
            "input": {"source_note_id": str(n1.id), "target_note_id": str(n2.id)},
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert r_prop.status_code == 200
    token = r_prop.json()["proposals"][0]["confirmation_token"]

    # 2. Commit
    r_commit = client.post(
        "/api/v1/actions/notes.link/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "commit",
            "input": {"source_note_id": str(n1.id), "target_note_id": str(n2.id)},
            "idempotency_key": str(uuid.uuid4()),
            "confirmation_token": token,
        },
    )
    assert r_commit.status_code == 200
    change_set_id = r_commit.json()["committed_changes"][0]["change_set_id"]

    # Link exists
    link = db_session.query(NoteLink).filter_by(source_note_id=n1.id, target_note_id=n2.id).first()
    assert link is not None

    # 3. Undo
    r_undo = client.post(
        f"/api/v1/actions/change-sets/{change_set_id}/undo",
        headers={"X-Workspace-Id": str(ws.id)},
    )
    assert r_undo.status_code == 200
    db_session.expire_all()
    link_after = (
        db_session.query(NoteLink).filter_by(source_note_id=n1.id, target_note_id=n2.id).first()
    )
    assert link_after is None


def test_collections_add_item_commit_and_undo(client: TestClient, db_session: Session):
    """Propose, commit, and undo collections.add_item."""
    ws, user = _setup_ws(db_session)
    coll = Collection(workspace_id=ws.id, name="Test Folder", created_by=user.id)
    note = Note(workspace_id=ws.id, created_by=user.id, title="Member Note")
    db_session.add_all([coll, note])
    db_session.commit()

    # 1. Propose
    r_prop = client.post(
        "/api/v1/actions/collections.add_item/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "propose",
            "input": {"collection_id": str(coll.id), "item_type": "note", "item_id": str(note.id)},
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert r_prop.status_code == 200
    token = r_prop.json()["proposals"][0]["confirmation_token"]

    # 2. Commit
    r_commit = client.post(
        "/api/v1/actions/collections.add_item/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "commit",
            "input": {"collection_id": str(coll.id), "item_type": "note", "item_id": str(note.id)},
            "idempotency_key": str(uuid.uuid4()),
            "confirmation_token": token,
        },
    )
    assert r_commit.status_code == 200
    change_set_id = r_commit.json()["committed_changes"][0]["change_set_id"]

    member = (
        db_session.query(CollectionNote).filter_by(collection_id=coll.id, note_id=note.id).first()
    )
    assert member is not None

    # 3. Undo
    r_undo = client.post(
        f"/api/v1/actions/change-sets/{change_set_id}/undo",
        headers={"X-Workspace-Id": str(ws.id)},
    )
    assert r_undo.status_code == 200
    db_session.expire_all()
    member_after = (
        db_session.query(CollectionNote).filter_by(collection_id=coll.id, note_id=note.id).first()
    )
    assert member_after is None


def test_graph_add_relationship_commit_and_undo(client: TestClient, db_session: Session):
    """Propose, commit, and undo graph.add_relationship."""
    ws, _ = _setup_ws(db_session)
    e1 = GraphEntity(workspace_id=ws.id, name="Entropy", entity_type="concept")
    e2 = GraphEntity(workspace_id=ws.id, name="Thermodynamics", entity_type="concept")
    db_session.add_all([e1, e2])
    db_session.commit()

    # 1. Propose
    r_prop = client.post(
        "/api/v1/actions/graph.add_relationship/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "propose",
            "input": {
                "source_entity_id": str(e1.id),
                "target_entity_id": str(e2.id),
                "relationship_type": "subfield_of",
            },
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert r_prop.status_code == 200
    token = r_prop.json()["proposals"][0]["confirmation_token"]

    # 2. Commit
    r_commit = client.post(
        "/api/v1/actions/graph.add_relationship/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "commit",
            "input": {
                "source_entity_id": str(e1.id),
                "target_entity_id": str(e2.id),
                "relationship_type": "subfield_of",
            },
            "idempotency_key": str(uuid.uuid4()),
            "confirmation_token": token,
        },
    )
    assert r_commit.status_code == 200
    change_set_id = r_commit.json()["committed_changes"][0]["change_set_id"]

    rel = (
        db_session.query(GraphRelationship)
        .filter_by(
            workspace_id=ws.id,
            source_entity_id=e1.id,
            target_entity_id=e2.id,
            relationship_type="subfield_of",
        )
        .first()
    )
    assert rel is not None

    # 3. Undo
    r_undo = client.post(
        f"/api/v1/actions/change-sets/{change_set_id}/undo",
        headers={"X-Workspace-Id": str(ws.id)},
    )
    assert r_undo.status_code == 200
    db_session.expire_all()
    rel_after = (
        db_session.query(GraphRelationship)
        .filter_by(
            workspace_id=ws.id,
            source_entity_id=e1.id,
            target_entity_id=e2.id,
            relationship_type="subfield_of",
        )
        .first()
    )
    assert rel_after is None


def test_notes_delete_commit_and_undo(client: TestClient, db_session: Session):
    """Propose, commit (soft-delete), and undo (restore) notes.delete."""
    ws, user = _setup_ws(db_session)
    note = Note(
        workspace_id=ws.id, created_by=user.id, title="Critical Note", content="Don't lose this"
    )
    db_session.add(note)
    db_session.commit()

    # 1. Propose
    r_prop = client.post(
        "/api/v1/actions/notes.delete/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "propose",
            "input": {"note_id": str(note.id), "note_title": "Critical Note"},
            "idempotency_key": str(uuid.uuid4()),
        },
    )
    assert r_prop.status_code == 200
    token = r_prop.json()["proposals"][0]["confirmation_token"]

    # 2. Commit (archives the note)
    r_commit = client.post(
        "/api/v1/actions/notes.delete/execute",
        headers={"X-Workspace-Id": str(ws.id)},
        json={
            "mode": "commit",
            "input": {"note_id": str(note.id), "note_title": "Critical Note"},
            "idempotency_key": str(uuid.uuid4()),
            "confirmation_token": token,
        },
    )
    assert r_commit.status_code == 200
    change_set_id = r_commit.json()["committed_changes"][0]["change_set_id"]

    db_session.expire_all()
    note_deleted = db_session.get(Note, note.id)
    assert note_deleted is None

    # 3. Undo (restores the note from before_state snapshot)
    r_undo = client.post(
        f"/api/v1/actions/change-sets/{change_set_id}/undo",
        headers={"X-Workspace-Id": str(ws.id)},
    )
    assert r_undo.status_code == 200
    db_session.expire_all()
    note_restored = db_session.get(Note, note.id)
    assert note_restored is not None
    assert note_restored.title == "Critical Note"
