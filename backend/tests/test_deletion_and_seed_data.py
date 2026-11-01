"""Tests for reliable Note & Workspace Deletion and Developer Seed Data (/dev-seed-demo)."""

import uuid
import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppException, WorkspaceNotFoundError
from app.models.collection import Collection, CollectionNote, CollectionSource
from app.models.content_chunk import ContentChunk
from app.models.conversation import Conversation
from app.models.entity_chunk import EntityChunk
from app.models.message import Message
from app.models.note import Note
from app.models.note_link import NoteLink
from app.models.source import Source
from app.models.tag import Tag
from app.models.user import User
from app.models.workspace import Workspace
from app.services import (
    dev_seed_service,
    note_service,
    stella_command_service,
    vector_service,
    workspace_service,
)


@pytest.fixture
def test_user(db_session: Session) -> User:
    user = User(
        display_name="Test Researcher",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def foreign_user(db_session: Session) -> User:
    user = User(
        display_name="Foreign Researcher",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def test_workspace(db_session: Session, test_user: User) -> Workspace:
    ws = Workspace(
        name="Archival Lab A",
        description="Workspace for deletion and seed tests",
        owner_id=test_user.id,
    )
    db_session.add(ws)
    db_session.commit()
    db_session.refresh(ws)
    return ws


# =========================================================================
# 1. Note Deletion Tests
# =========================================================================

def test_note_deletion_cleans_vectors_provenance_and_tags(
    db_session: Session,
    test_workspace: Workspace,
    test_user: User,
):
    # Create note
    note = Note(
        workspace_id=test_workspace.id,
        title="Ephemeral Quantum Note",
        content="Testing complete note deletion lifecycle.",
        created_by=test_user.id,
    )
    # Add unique tag
    tag = Tag(workspace_id=test_workspace.id, name="ephemeral-tag")
    db_session.add(tag)
    note.tags.append(tag)
    db_session.add(note)
    db_session.commit()
    db_session.refresh(note)

    from app.models.graph_entity import GraphEntity
    entity = GraphEntity(
        workspace_id=test_workspace.id,
        name="Quantum Computing",
        entity_type="concept",
    )
    db_session.add(entity)
    db_session.commit()
    db_session.refresh(entity)

    chunk = ContentChunk(
        workspace_id=test_workspace.id,
        note_id=note.id,
        chunk_index=0,
        content="Quantum note chunk content",
        token_count=10,
        content_hash="q_chunk_hash_1",
        embedding_model="text-embedding-3-small",
        embedding_dimension=1536,
    )
    db_session.add(chunk)
    db_session.commit()
    db_session.refresh(chunk)

    # Add entity chunk provenance
    ec = EntityChunk(
        workspace_id=test_workspace.id,
        note_id=note.id,
        entity_id=entity.id,
        chunk_id=chunk.id,
        extraction_model="gpt-4o-mini",
        confidence=1.0,
    )
    db_session.add(ec)
    db_session.commit()

    # Verify provenance exists
    prov_count_before = db_session.scalar(
        select(func.count(EntityChunk.id)).where(EntityChunk.note_id == note.id)
    )
    assert prov_count_before == 1

    # Delete note
    note_id = note.id
    note_service.delete_note(db_session, note_id)

    # Verify note is deleted
    assert db_session.get(Note, note_id) is None

    # Verify provenance is deleted
    prov_count_after = db_session.scalar(
        select(func.count(EntityChunk.id)).where(EntityChunk.note_id == note_id)
    )
    assert prov_count_after == 0

    # Verify orphaned tag is deleted
    assert db_session.get(Tag, tag.id) is None


def test_note_deletion_leaves_unrelated_notes_intact(
    db_session: Session,
    test_workspace: Workspace,
    test_user: User,
):
    note1 = Note(
        workspace_id=test_workspace.id,
        title="Note 1 To Delete",
        content="Content 1",
        created_by=test_user.id,
    )
    note2 = Note(
        workspace_id=test_workspace.id,
        title="Note 2 To Keep",
        content="Content 2",
        created_by=test_user.id,
    )
    db_session.add_all([note1, note2])
    db_session.commit()

    # Link note1 and note2
    link = NoteLink(source_note_id=note1.id, target_note_id=note2.id)
    db_session.add(link)
    db_session.commit()

    # Delete note1
    note_service.delete_note(db_session, note1.id)

    # note1 gone, note2 preserved
    assert db_session.get(Note, note1.id) is None
    assert db_session.get(Note, note2.id) is not None
    # Link cascade-deleted
    assert db_session.scalar(select(func.count()).select_from(NoteLink).where(NoteLink.source_note_id == note1.id)) == 0


# =========================================================================
# 2. Workspace Deletion Tests
# =========================================================================

def test_workspace_deletion_cascades_and_authorizes_owner(
    db_session: Session,
    test_workspace: Workspace,
    test_user: User,
    foreign_user: User,
):
    ws_id = test_workspace.id

    # Populate items in workspace
    note = Note(
        workspace_id=ws_id,
        title="Workspace Child Note",
        content="Child content",
        created_by=test_user.id,
    )
    source = Source(
        workspace_id=ws_id,
        source_type="text",
        original_path="child_source.txt",
        source_identifier="Workspace Child Source",
        content_hash="hash_ws_123",
        import_batch_id=uuid.uuid4(),
        import_status="completed",
    )
    conv = Conversation(
        workspace_id=ws_id,
        title="Workspace Child Thread",
    )
    coll = Collection(
        workspace_id=ws_id,
        name="Workspace Child Collection",
        created_by=test_user.id,
    )
    db_session.add_all([note, source, conv, coll])
    db_session.commit()

    # 1. Non-owner cannot delete (403 Forbidden)
    with pytest.raises(AppException) as exc_info:
        workspace_service.delete_workspace(
            db=db_session,
            workspace_id=ws_id,
            requesting_user_id=foreign_user.id,
        )
    assert exc_info.value.status_code == 403

    # Workspace still exists
    assert db_session.get(Workspace, ws_id) is not None

    child_note_id = note.id
    child_source_id = source.id
    child_conv_id = conv.id
    child_coll_id = coll.id

    # 2. Owner can delete
    workspace_service.delete_workspace(
        db=db_session,
        workspace_id=ws_id,
        requesting_user_id=test_user.id,
    )

    # Workspace is gone
    assert db_session.get(Workspace, ws_id) is None
    # Child items cascade deleted
    assert db_session.get(Note, child_note_id) is None
    assert db_session.get(Source, child_source_id) is None
    assert db_session.get(Conversation, child_conv_id) is None
    assert db_session.get(Collection, child_coll_id) is None


# =========================================================================
# 3. Developer Seed Data Tests (/dev-seed-demo)
# =========================================================================

def test_seed_notes_word_count_and_richness():
    """Verify all 12 seeded notes have between 500 and 650 words of rich content."""
    assert len(dev_seed_service.NOTE_SPECS) == 12
    for idx, spec in enumerate(dev_seed_service.NOTE_SPECS, 1):
        content = spec["content"]
        word_count = len(content.split())
        assert 500 <= word_count <= 650, (
            f"Note {idx} ('{spec['title']}') has {word_count} words; expected 500-650."
        )


def test_dev_seed_demo_full_workflow_idempotency_and_cleanup(
    db_session: Session,
    test_workspace: Workspace,
    test_user: User,
):
    ws_id = test_workspace.id

    # Add a user-created note that must NEVER be touched by cleanup
    user_note = Note(
        workspace_id=ws_id,
        title="My Private Personal Research",
        content="This is authentic human writing that must survive seed cleanup.",
        created_by=test_user.id,
    )
    db_session.add(user_note)
    db_session.commit()
    user_note_id = user_note.id

    # 1. First run of /dev-seed-demo
    res1 = stella_command_service.execute_stella_action_command(
        db=db_session,
        workspace_id=ws_id,
        command="/dev-seed-demo",
    )
    assert res1.status == "completed"
    data1 = res1.data
    assert data1["notes_created"] == 12
    assert data1["sources_created"] >= 4
    assert data1["collections_created"] >= 3
    assert data1["threads_created"] >= 4
    assert data1["flashcard_decks_created"] >= 2
    assert data1["links_created"] >= 4

    # Verify user note is intact
    assert db_session.get(Note, user_note_id) is not None

    # 2. Second run of /dev-seed-demo (Idempotency check)
    res2 = stella_command_service.execute_stella_action_command(
        db=db_session,
        workspace_id=ws_id,
        command="/dev-seed-demo",
    )
    assert res2.status == "completed"
    data2 = res2.data
    assert data2["notes_created"] == 0
    assert data2["notes_reused"] == 12
    assert data2["sources_created"] == 0

    # 3. Verify seeded items have correct metadata and tags
    seeded_notes = db_session.scalars(
        select(Note).where(Note.workspace_id == ws_id, Note.id != user_note_id)
    ).all()
    assert len(seeded_notes) == 12
    for n in seeded_notes:
        assert (n.metadata_ or {}).get("is_demo_seed") is True
        assert any(t.name == "seed-demo" for t in n.tags)

    # 4. Safe Cleanup (/dev-seed-demo --cleanup)
    cleanup_res = stella_command_service.execute_stella_action_command(
        db=db_session,
        workspace_id=ws_id,
        command="/dev-seed-demo",
        args=["--cleanup"],
    )
    assert cleanup_res.status == "completed"
    c_data = cleanup_res.data
    assert c_data["notes_deleted"] == 12
    assert c_data["sources_deleted"] >= 4
    assert c_data["collections_deleted"] >= 3
    assert c_data["threads_deleted"] >= 4

    # 5. Crucial: User note SURVIVES!
    surviving_user_note = db_session.get(Note, user_note_id)
    assert surviving_user_note is not None
    assert surviving_user_note.title == "My Private Personal Research"
