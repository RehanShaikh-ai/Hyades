"""Individual automated unit tests for each of the 37 canonical actions per CONTRACT v0.5.1 §7.5.

Enforces deterministic naming: test_action_<action_id_with_underscore>.
"""

import uuid
from datetime import UTC, datetime
from sqlalchemy.orm import Session

from app.actions.registry import get_action
from app.actions.types import (
    CollectionsAddItemInput,
    CollectionsGetInput,
    CollectionsSummarizeInput,
    EntitiesGetInput,
    EntitiesSearchInput,
    EntitiesSummarizeInput,
    GraphAddRelationshipInput,
    GraphFindIsolatedNodesInput,
    GraphFindPathInput,
    GraphGetNeighborsInput,
    GraphSuggestRelationshipsInput,
    InboxAcceptInput,
    InboxListInput,
    InboxRejectInput,
    KnowledgeAnswerInput,
    KnowledgeAuditProcessingInput,
    KnowledgeGenerateBriefInput,
    KnowledgeSearchAllInput,
    NotesCompareInput,
    NotesCreateInput,
    NotesDeleteInput,
    NotesExtractConceptsInput,
    NotesFindRelatedInput,
    NotesGetInput,
    NotesLinkInput,
    NotesSearchInput,
    NotesSuggestTagsInput,
    NotesSummarizeInput,
    NotesUpdateInput,
    SourcesCompareInput,
    SourcesGetInput,
    SourcesGetProcessingStatusInput,
    SourcesRetryProcessingInput,
    SourcesSearchInput,
    SourcesSummarizeInput,
    ThreadsGetInput,
    ThreadsSummarizeInput,
)
from app.models import (
    Collection,
    GraphEntity,
    GraphRelationship,
    InboxItem,
    Note,
    Source,
    Thread,
    ThreadDiscovery,
    ThreadQuestion,
    User,
    Workspace,
)


def _setup_ws(db: Session) -> tuple[Workspace, User]:
    user = User(display_name="Tester")
    db.add(user)
    db.commit()
    ws = Workspace(name="Test Workspace", owner_id=user.id)
    db.add(ws)
    db.commit()
    return ws, user


def _create_note(db: Session, ws: Workspace, user: User, title: str = "Test Note", content: str = "Content") -> Note:
    n = Note(workspace_id=ws.id, created_by=user.id, title=title, content=content)
    db.add(n)
    db.commit()
    return n


def _create_source(
    db: Session,
    ws: Workspace,
    user: User,
    path: str = "doc.txt",
    text: str = "Sample extracted text",
    status: str = "READY",
) -> Source:
    s = Source(
        workspace_id=ws.id,
        original_path=path,
        source_identifier=f"{path}_{uuid.uuid4()}",
        source_type="markdown",
        content_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        processing_stage="extract",
        processing_status=status,
        import_batch_id=uuid.uuid4(),
        import_status="completed",
        raw_metadata={"filename": path, "text": text},
        imported_at=datetime.now(UTC),
    )
    db.add(s)
    db.commit()
    return s


# ─────────────────────────────────────────────────────────────────────────────
# 7.1 Read Actions (12)
# ─────────────────────────────────────────────────────────────────────────────

def test_action_knowledge_search_all(db_session: Session):
    ws, user = _setup_ws(db_session)
    _create_note(db_session, ws, user, title="Quantum Computing", content="Superposition and qubits")

    action = get_action("knowledge.search_all")
    inp = KnowledgeSearchAllInput(query="qubits")
    res = action.handler(db_session, ws.id, inp)
    assert len(res.result["items"]) >= 1
    assert res.result["items"][0]["title"] == "Quantum Computing"


def test_action_notes_get(db_session: Session):
    ws, user = _setup_ws(db_session)
    n = _create_note(db_session, ws, user, title="Note A", content="Content A")

    action = get_action("notes.get")
    res = action.handler(db_session, ws.id, NotesGetInput(note_id=n.id))
    assert res.result["note"]["id"] == str(n.id)
    assert res.result["note"]["title"] == "Note A"


def test_action_notes_search(db_session: Session):
    ws, user = _setup_ws(db_session)
    _create_note(db_session, ws, user, title="Artificial Intelligence", content="Neural networks")

    action = get_action("notes.search")
    res = action.handler(db_session, ws.id, NotesSearchInput(query="Neural"))
    assert res.result["total"] >= 1
    assert res.result["items"][0]["title"] == "Artificial Intelligence"


def test_action_sources_get(db_session: Session):
    ws, user = _setup_ws(db_session)
    src = _create_source(db_session, ws, user, path="doc.pdf")

    action = get_action("sources.get")
    res = action.handler(db_session, ws.id, SourcesGetInput(source_id=src.id))
    assert res.result["source"]["id"] == str(src.id)


def test_action_sources_search(db_session: Session):
    ws, user = _setup_ws(db_session)
    _create_source(db_session, ws, user, path="research.pdf", text="Astrophysics paper")

    action = get_action("sources.search")
    res = action.handler(db_session, ws.id, SourcesSearchInput(query="Astrophysics"))
    assert res.result["total"] >= 1


def test_action_sources_get_processing_status(db_session: Session):
    ws, user = _setup_ws(db_session)
    src = _create_source(db_session, ws, user, path="data.csv", status="ready")

    action = get_action("sources.get_processing_status")
    res = action.handler(db_session, ws.id, SourcesGetProcessingStatusInput(source_id=src.id))
    assert res.result["processing_status"] == "ready"


def test_action_entities_get(db_session: Session):
    ws, _ = _setup_ws(db_session)
    ent = GraphEntity(workspace_id=ws.id, name="Einstein", entity_type="person", description="Physicist")
    db_session.add(ent)
    db_session.commit()

    action = get_action("entities.get")
    res = action.handler(db_session, ws.id, EntitiesGetInput(entity_id=ent.id))
    assert res.result["entity"]["name"] == "Einstein"


def test_action_entities_search(db_session: Session):
    ws, _ = _setup_ws(db_session)
    ent = GraphEntity(workspace_id=ws.id, name="Relativity", entity_type="concept")
    db_session.add(ent)
    db_session.commit()

    action = get_action("entities.search")
    res = action.handler(db_session, ws.id, EntitiesSearchInput(query="Relat"))
    assert res.result["total"] >= 1
    assert res.result["items"][0]["name"] == "Relativity"


def test_action_graph_get_neighbors(db_session: Session):
    ws, _ = _setup_ws(db_session)
    e1 = GraphEntity(workspace_id=ws.id, name="Earth", entity_type="concept")
    e2 = GraphEntity(workspace_id=ws.id, name="Moon", entity_type="concept")
    db_session.add_all([e1, e2])
    db_session.commit()

    rel = GraphRelationship(workspace_id=ws.id, source_entity_id=e1.id, target_entity_id=e2.id, relationship_type="orbits")
    db_session.add(rel)
    db_session.commit()

    action = get_action("graph.get_neighbors")
    res = action.handler(db_session, ws.id, GraphGetNeighborsInput(entity_id=e1.id))
    assert len(res.result["nodes"]) == 2
    assert len(res.result["edges"]) == 1


def test_action_graph_find_path(db_session: Session):
    ws, _ = _setup_ws(db_session)
    e1 = GraphEntity(workspace_id=ws.id, name="A", entity_type="concept")
    e2 = GraphEntity(workspace_id=ws.id, name="B", entity_type="concept")
    db_session.add_all([e1, e2])
    db_session.commit()

    rel = GraphRelationship(workspace_id=ws.id, source_entity_id=e1.id, target_entity_id=e2.id, relationship_type="connects")
    db_session.add(rel)
    db_session.commit()

    action = get_action("graph.find_path")
    res = action.handler(db_session, ws.id, GraphFindPathInput(source_entity_id=e1.id, target_entity_id=e2.id))
    assert res.result["found"] is True
    assert len(res.result["path"]) == 2


def test_action_collections_get(db_session: Session):
    ws, user = _setup_ws(db_session)
    coll = Collection(workspace_id=ws.id, name="Space Mission", created_by=user.id)
    db_session.add(coll)
    db_session.commit()

    action = get_action("collections.get")
    res = action.handler(db_session, ws.id, CollectionsGetInput(collection_id=coll.id))
    assert res.result["collection"]["name"] == "Space Mission"


def test_action_threads_get(db_session: Session):
    ws, user = _setup_ws(db_session)
    thr = Thread(workspace_id=ws.id, title="Dark Matter", created_by=user.id)
    db_session.add(thr)
    db_session.commit()

    action = get_action("threads.get")
    res = action.handler(db_session, ws.id, ThreadsGetInput(thread_id=thr.id))
    assert res.result["thread"]["title"] == "Dark Matter"


# ─────────────────────────────────────────────────────────────────────────────
# 7.2 Understand Actions (11)
# ─────────────────────────────────────────────────────────────────────────────

def test_action_notes_summarize(db_session: Session):
    ws, user = _setup_ws(db_session)
    n = _create_note(db_session, ws, user, title="Quantum Entanglement", content="Entangled particles stay connected.")

    action = get_action("notes.summarize")
    res = action.handler(db_session, ws.id, NotesSummarizeInput(note_id=n.id))
    assert "summary" in res.result
    assert len(res.evidence) >= 1


def test_action_sources_summarize(db_session: Session):
    ws, user = _setup_ws(db_session)
    src = _create_source(db_session, ws, user, path="paper.txt", text="Detailed text about biology.")

    action = get_action("sources.summarize")
    res = action.handler(db_session, ws.id, SourcesSummarizeInput(source_id=src.id))
    assert "summary" in res.result


def test_action_collections_summarize(db_session: Session):
    ws, user = _setup_ws(db_session)
    coll = Collection(workspace_id=ws.id, name="Physics Research", created_by=user.id)
    db_session.add(coll)
    db_session.commit()

    action = get_action("collections.summarize")
    res = action.handler(db_session, ws.id, CollectionsSummarizeInput(collection_id=coll.id))
    assert "summary" in res.result
    assert "themes" in res.result


def test_action_threads_summarize(db_session: Session):
    ws, user = _setup_ws(db_session)
    thr = Thread(workspace_id=ws.id, title="Gravitational Waves", created_by=user.id)
    db_session.add(thr)
    db_session.commit()

    q = ThreadQuestion(thread_id=thr.id, text="What caused the signal?")
    d = ThreadDiscovery(thread_id=thr.id, content="Binary black hole merger.")
    db_session.add_all([q, d])
    db_session.commit()

    action = get_action("threads.summarize")
    res = action.handler(db_session, ws.id, ThreadsSummarizeInput(thread_id=thr.id))
    assert "findings" in res.result


def test_action_entities_summarize(db_session: Session):
    ws, _ = _setup_ws(db_session)
    ent = GraphEntity(workspace_id=ws.id, name="Mars", entity_type="concept")
    db_session.add(ent)
    db_session.commit()

    action = get_action("entities.summarize")
    res = action.handler(db_session, ws.id, EntitiesSummarizeInput(entity_id=ent.id))
    assert "connections" in res.result


def test_action_notes_compare(db_session: Session):
    ws, user = _setup_ws(db_session)
    n1 = _create_note(db_session, ws, user, title="Draft A", content="Early draft on optics")
    n2 = _create_note(db_session, ws, user, title="Draft B", content="Revised draft on optics")

    action = get_action("notes.compare")
    res = action.handler(db_session, ws.id, NotesCompareInput(note_ids=[n1.id, n2.id]))
    assert "comparison" in res.result
    assert "similarities" in res.result


def test_action_sources_compare(db_session: Session):
    ws, user = _setup_ws(db_session)
    s1 = _create_source(db_session, ws, user, path="file1.txt", text="Alpha document")
    s2 = _create_source(db_session, ws, user, path="file2.txt", text="Beta document")

    action = get_action("sources.compare")
    res = action.handler(db_session, ws.id, SourcesCompareInput(source_ids=[s1.id, s2.id]))
    assert "comparison" in res.result


def test_action_knowledge_answer(db_session: Session):
    ws, user = _setup_ws(db_session)
    _create_note(db_session, ws, user, title="Helium Properties", content="Helium is a noble gas with atomic number 2.")

    action = get_action("knowledge.answer")
    res = action.handler(db_session, ws.id, KnowledgeAnswerInput(question="What is Helium?"))
    assert "answer" in res.result
    assert len(res.evidence) >= 1


def test_action_knowledge_generate_brief(db_session: Session):
    ws, user = _setup_ws(db_session)
    _create_note(db_session, ws, user, title="Solar Energy", content="Photovoltaic cells convert sunlight.")

    action = get_action("knowledge.generate_brief")
    res = action.handler(db_session, ws.id, KnowledgeGenerateBriefInput(topic="Solar Energy"))
    assert "brief" in res.result
    assert len(res.result["sections"]) >= 1


def test_action_notes_extract_concepts(db_session: Session):
    ws, user = _setup_ws(db_session)
    n = _create_note(db_session, ws, user, title="Deep Learning", content="Gradient descent optimizes loss.")

    action = get_action("notes.extract_concepts")
    res = action.handler(db_session, ws.id, NotesExtractConceptsInput(note_id=n.id))
    assert "concepts" in res.result


def test_action_notes_suggest_tags(db_session: Session):
    ws, user = _setup_ws(db_session)
    n = _create_note(db_session, ws, user, title="Machine Learning Classification", content="SVM and Decision Trees")

    action = get_action("notes.suggest_tags")
    res = action.handler(db_session, ws.id, NotesSuggestTagsInput(note_id=n.id))
    assert len(res.result["suggested_tags"]) >= 1


# ─────────────────────────────────────────────────────────────────────────────
# 7.3 Review Actions (8)
# ─────────────────────────────────────────────────────────────────────────────

def test_action_inbox_list(db_session: Session):
    ws, user = _setup_ws(db_session)
    src = _create_source(db_session, ws, user, path="inbox_doc.md")

    item = InboxItem(workspace_id=ws.id, source_id=src.id, status="pending")
    db_session.add(item)
    db_session.commit()

    action = get_action("inbox.list")
    res = action.handler(db_session, ws.id, InboxListInput())
    assert res.result["total"] >= 1


def test_action_inbox_accept(db_session: Session):
    ws, user = _setup_ws(db_session)
    src = _create_source(db_session, ws, user, path="acc.md")

    item = InboxItem(workspace_id=ws.id, source_id=src.id, status="pending")
    db_session.add(item)
    db_session.commit()

    action = get_action("inbox.accept")
    res = action.handler(db_session, ws.id, InboxAcceptInput(inbox_item_id=item.id))
    assert res.result["status"] == "accepted"


def test_action_inbox_reject(db_session: Session):
    ws, user = _setup_ws(db_session)
    src = _create_source(db_session, ws, user, path="rej.md")

    item = InboxItem(workspace_id=ws.id, source_id=src.id, status="pending")
    db_session.add(item)
    db_session.commit()

    action = get_action("inbox.reject")
    res = action.handler(db_session, ws.id, InboxRejectInput(inbox_item_id=item.id))
    assert res.result["status"] == "rejected"


def test_action_sources_retry_processing(db_session: Session):
    ws, user = _setup_ws(db_session)
    src = _create_source(db_session, ws, user, path="retry_doc.md", status="FAILED")

    action = get_action("sources.retry_processing")
    res = action.handler(db_session, ws.id, SourcesRetryProcessingInput(source_id=src.id))
    assert res.result["status"] in ("READY", "ready", "completed", "FAILED", "failed", "PENDING", "PROCESSING")


def test_action_knowledge_audit_processing(db_session: Session):
    ws, user = _setup_ws(db_session)
    _create_source(db_session, ws, user, path="ok.txt", status="READY")
    _create_source(db_session, ws, user, path="bad.txt", status="FAILED")

    action = get_action("knowledge.audit_processing")
    res = action.handler(db_session, ws.id, KnowledgeAuditProcessingInput(include_details=True))
    assert res.result["total_sources"] >= 2
    assert res.result["failed_sources"] >= 1


def test_action_graph_find_isolated_nodes(db_session: Session):
    ws, _ = _setup_ws(db_session)
    ent = GraphEntity(workspace_id=ws.id, name="Isolated Node", entity_type="concept")
    db_session.add(ent)
    db_session.commit()

    action = get_action("graph.find_isolated_nodes")
    res = action.handler(db_session, ws.id, GraphFindIsolatedNodesInput())
    assert res.result["count"] >= 1
    assert any(n["name"] == "Isolated Node" for n in res.result["isolated_entities"])


def test_action_graph_suggest_relationships(db_session: Session):
    ws, _ = _setup_ws(db_session)
    e1 = GraphEntity(workspace_id=ws.id, name="Node 1", entity_type="concept")
    e2 = GraphEntity(workspace_id=ws.id, name="Node 2", entity_type="concept")
    db_session.add_all([e1, e2])
    db_session.commit()

    action = get_action("graph.suggest_relationships")
    res = action.handler(db_session, ws.id, GraphSuggestRelationshipsInput())
    assert len(res.result["suggestions"]) >= 1


def test_action_notes_find_related(db_session: Session):
    ws, user = _setup_ws(db_session)
    n1 = _create_note(db_session, ws, user, title="Main Note", content="Content")
    _create_note(db_session, ws, user, title="Sister Note", content="Related content")

    action = get_action("notes.find_related")
    res = action.handler(db_session, ws.id, NotesFindRelatedInput(note_id=n1.id))
    assert len(res.result["related_notes"]) >= 1


# ─────────────────────────────────────────────────────────────────────────────
# 7.4 Controlled Writes (6)
# ─────────────────────────────────────────────────────────────────────────────

def test_action_notes_create(db_session: Session):
    ws, _ = _setup_ws(db_session)
    action = get_action("notes.create")
    inp = NotesCreateInput(title="New Action Note", content="Content here")
    res = action.handler(db_session, ws.id, inp)
    assert len(res.proposals) == 1
    assert res.proposals[0]["title"] == "New Action Note"


def test_action_notes_update(db_session: Session):
    ws, user = _setup_ws(db_session)
    n = _create_note(db_session, ws, user, title="Old Note", content="Old body")

    action = get_action("notes.update")
    inp = NotesUpdateInput(note_id=n.id, title="Updated Note")
    res = action.handler(db_session, ws.id, inp)
    assert len(res.proposals) == 1
    assert res.before_state["title"] == "Old Note"


def test_action_notes_link(db_session: Session):
    ws, user = _setup_ws(db_session)
    n1 = _create_note(db_session, ws, user, title="Note 1")
    n2 = _create_note(db_session, ws, user, title="Note 2")

    action = get_action("notes.link")
    inp = NotesLinkInput(source_note_id=n1.id, target_note_id=n2.id)
    res = action.handler(db_session, ws.id, inp)
    assert len(res.proposals) == 1
    assert res.affected_item_ids == [str(n1.id), str(n2.id)]


def test_action_collections_add_item(db_session: Session):
    ws, user = _setup_ws(db_session)
    coll = Collection(workspace_id=ws.id, name="My Collection", created_by=user.id)
    n = _create_note(db_session, ws, user, title="Item Note")
    db_session.add(coll)
    db_session.commit()

    action = get_action("collections.add_item")
    inp = CollectionsAddItemInput(collection_id=coll.id, item_type="note", item_id=n.id)
    res = action.handler(db_session, ws.id, inp)
    assert len(res.proposals) == 1
    assert res.proposals[0]["item_type"] == "note"


def test_action_graph_add_relationship(db_session: Session):
    ws, _ = _setup_ws(db_session)
    e1 = GraphEntity(workspace_id=ws.id, name="Planet", entity_type="concept")
    e2 = GraphEntity(workspace_id=ws.id, name="Star", entity_type="concept")
    db_session.add_all([e1, e2])
    db_session.commit()

    action = get_action("graph.add_relationship")
    inp = GraphAddRelationshipInput(source_entity_id=e1.id, target_entity_id=e2.id, relationship_type="orbits")
    res = action.handler(db_session, ws.id, inp)
    assert len(res.proposals) == 1
    assert res.proposals[0]["relationship_type"] == "orbits"


def test_action_notes_delete(db_session: Session):
    ws, user = _setup_ws(db_session)
    n = _create_note(db_session, ws, user, title="To Delete Note", content="Will be deleted")

    action = get_action("notes.delete")
    inp = NotesDeleteInput(note_id=n.id, note_title="To Delete Note")
    res = action.handler(db_session, ws.id, inp)
    assert len(res.proposals) == 1
    assert res.before_state["id"] == str(n.id)
    assert res.before_state["title"] == "To Delete Note"
