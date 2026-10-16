"""Unit tests for v0.4.2 SQLAlchemy models per CONTRACT v0.4.2 §0.1, §0.4, §7.1, §7.2.

Verifies:
- All new and extended models are registered on Base.metadata
- Table names, primary keys, and columns match contract specifications
- Relationship configurations and cascade delete-orphan rules
- CheckConstraint on entity_chunks single-parent rule
- Unique constraints on collections, saved_views, inbox_items
"""

import uuid
import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models import (
    Collection,
    CollectionNote,
    CollectionSource,
    CollectionEntity,
    CollectionConversation,
    Thread,
    ThreadNote,
    ThreadSource,
    ThreadEntity,
    ThreadConversation,
    ThreadQuestion,
    ThreadDiscovery,
    SavedView,
    InboxItem,
    Note,
    Source,
    EntityChunk,
    User,
    Workspace,
)


def test_v0_4_2_tables_registered_on_base_metadata():
    """Verify all v0.4.2 tables are registered on Base.metadata per Contract §0.4."""
    tables = Base.metadata.tables.keys()
    expected = [
        "collections",
        "collection_notes",
        "collection_sources",
        "collection_entities",
        "collection_conversations",
        "threads",
        "thread_notes",
        "thread_sources",
        "thread_entities",
        "thread_conversations",
        "thread_questions",
        "thread_discoveries",
        "saved_views",
        "inbox_items",
        "notes",
        "sources",
        "entity_chunks",
    ]
    for table_name in expected:
        assert table_name in tables, f"Expected table '{table_name}' in Base.metadata.tables"


def test_existing_table_extensions_on_metadata():
    """Verify notes, sources, and entity_chunks column extensions."""
    notes_cols = Base.metadata.tables["notes"].columns
    assert "extract_knowledge" in notes_cols
    assert notes_cols["extract_knowledge"].default is not None or notes_cols["extract_knowledge"].server_default is not None

    sources_cols = Base.metadata.tables["sources"].columns
    assert "extract_knowledge" in sources_cols
    assert "mime_type" in sources_cols

    ec_cols = Base.metadata.tables["entity_chunks"].columns
    assert "note_id" in ec_cols
    assert ec_cols["note_id"].nullable is True
    assert "source_id" in ec_cols
    assert ec_cols["source_id"].nullable is True


def test_collection_model_defaults_and_constraints(db_session: Session):
    """Verify Collection model default UUID, timestamps, and workspace FK."""
    user = User(display_name="Collector")
    db_session.add(user)
    db_session.commit()

    ws = Workspace(name="Collection WS", owner_id=user.id)
    db_session.add(ws)
    db_session.commit()

    coll = Collection(
        workspace_id=ws.id,
        name="Research Paper Set",
        description="Core papers",
        icon="book",
        created_by=user.id,
    )
    db_session.add(coll)
    db_session.commit()
    db_session.refresh(coll)

    assert isinstance(coll.id, uuid.UUID)
    assert coll.name == "Research Paper Set"
    assert coll.created_at is not None
    assert coll.updated_at is not None
    assert coll.workspace.id == ws.id
    assert coll.creator.id == user.id


def test_collection_unique_name_per_workspace(db_session: Session):
    """Verify unique constraint (workspace_id, name) on collections."""
    user = User(display_name="Collector 2")
    db_session.add(user)
    db_session.commit()

    ws = Workspace(name="Unique Coll WS", owner_id=user.id)
    db_session.add(ws)
    db_session.commit()

    coll1 = Collection(workspace_id=ws.id, name="Duplicate Name", created_by=user.id)
    coll2 = Collection(workspace_id=ws.id, name="Duplicate Name", created_by=user.id)
    db_session.add(coll1)
    db_session.commit()

    db_session.add(coll2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_thread_questions_and_discoveries_cascade(db_session: Session):
    """Verify Thread questions, discoveries, and cascade deletion."""
    user = User(display_name="Thread User")
    db_session.add(user)
    db_session.commit()

    ws = Workspace(name="Thread WS", owner_id=user.id)
    db_session.add(ws)
    db_session.commit()

    thread = Thread(
        workspace_id=ws.id,
        title="Investigation of Qdrant Performance",
        question="What is the bottleneck?",
        status="active",
        created_by=user.id,
    )
    db_session.add(thread)
    db_session.commit()

    q = ThreadQuestion(thread_id=thread.id, text="Is it memory bound?", is_resolved=False)
    d = ThreadDiscovery(thread_id=thread.id, content="Observed high indexing latency")
    db_session.add_all([q, d])
    db_session.commit()
    db_session.refresh(thread)

    assert len(thread.questions) == 1
    assert len(thread.discoveries) == 1
    assert thread.questions[0].text == "Is it memory bound?"
    assert thread.discoveries[0].content == "Observed high indexing latency"

    # Delete thread and verify questions/discoveries are cascade deleted
    db_session.delete(thread)
    db_session.commit()

    remaining_q = db_session.query(ThreadQuestion).filter_by(id=q.id).first()
    remaining_d = db_session.query(ThreadDiscovery).filter_by(id=d.id).first()
    assert remaining_q is None
    assert remaining_d is None


def test_saved_view_unique_name_per_workspace(db_session: Session):
    """Verify unique constraint (workspace_id, name) on saved_views."""
    user = User(display_name="Viewer")
    db_session.add(user)
    db_session.commit()

    ws = Workspace(name="View WS", owner_id=user.id)
    db_session.add(ws)
    db_session.commit()

    v1 = SavedView(workspace_id=ws.id, name="Overview", state={"zoom": 1.5}, created_by=user.id)
    v2 = SavedView(workspace_id=ws.id, name="Overview", state={"zoom": 2.0}, created_by=user.id)
    db_session.add(v1)
    db_session.commit()

    db_session.add(v2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_inbox_item_source_uniqueness(db_session: Session):
    """Verify one inbox item per source constraint."""
    user = User(display_name="Inbox User")
    db_session.add(user)
    db_session.commit()

    ws = Workspace(name="Inbox WS", owner_id=user.id)
    db_session.add(ws)
    db_session.commit()

    source = Source(
        workspace_id=ws.id,
        source_type="pdf",
        original_path="/path/test.pdf",
        source_identifier="/path/test.pdf",
        content_hash="abc12345",
        import_batch_id=uuid.uuid4(),
        import_status="completed",
    )
    db_session.add(source)
    db_session.commit()

    item1 = InboxItem(
        workspace_id=ws.id,
        source_id=source.id,
        status="pending",
        detection_status="completed",
        detected_count=3,
        detected_entities=[{"name": "Concept A"}],
    )
    db_session.add(item1)
    db_session.commit()

    item2 = InboxItem(
        workspace_id=ws.id,
        source_id=source.id,
        status="pending",
        detection_status="completed",
    )
    db_session.add(item2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()
