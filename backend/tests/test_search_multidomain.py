"""Unit and integration tests for multi-domain global search.

Verifies:
- Searches across Notes, Sources, Entities, Collections, and Threads
- Lexical, semantic, and hybrid modes return domain-specific identifiers
- Workspace isolation is strictly enforced
- Empty results and query validation are handled safely
"""

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.collection import Collection
from app.models.graph_entity import GraphEntity
from app.models.note import Note
from app.models.source import Source
from app.models.thread import Thread
from app.models.user import User
from app.models.workspace import Workspace


def test_global_search_returns_all_five_domains(client: TestClient, db_session: Session):
    """Verify that global search returns Notes, Sources, Entities, Collections, and Threads."""
    user = User(display_name="Search Explorer")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Search Workspace", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    # 1. Note matching 'astronomy'
    note = Note(
        workspace_id=workspace.id,
        title="Ptolemaic Astronomy Folio",
        content="Observations on celestial orbits and astronomy catalogs.",
        created_by=user.id,
    )
    db_session.add(note)

    # 2. Source matching 'astronomy'
    source = Source(
        workspace_id=workspace.id,
        source_type="pdf",
        original_path="/archives/astronomy_compendium.pdf",
        source_identifier="astronomy_compendium",
        content_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        import_batch_id=uuid.uuid4(),
        import_status="completed",
        processing_stage="complete",
        processing_status="READY",
        file_size_bytes=1024,
        raw_metadata={"text": "Historical astronomy tables and celestial astrolabes."},
    )

    db_session.add(source)

    # 3. Graph Entity matching 'astronomy'
    entity = GraphEntity(
        workspace_id=workspace.id,
        name="Ancient Astronomy Institute",
        entity_type="concept",
        description="Scholarly center dedicated to astronomy investigations.",
    )
    db_session.add(entity)

    # 4. Collection matching 'astronomy'
    collection = Collection(
        workspace_id=workspace.id,
        name="Renaissance Astronomy Collection",
        description="Curated primary sources on astronomy.",
        created_by=user.id,
    )
    db_session.add(collection)

    # 5. Thread matching 'astronomy'
    thread = Thread(
        workspace_id=workspace.id,
        title="Astronomy Research Inquiry",
        question="What were the foundational instruments in early astronomy?",
        created_by=user.id,
    )
    db_session.add(thread)
    db_session.commit()


    # Execute Lexical Search
    res_lex = client.post(
        f"/api/v1/workspaces/{workspace.id}/search",
        json={"query": "astronomy", "mode": "lexical", "limit": 20},
    )
    assert res_lex.status_code == 200, res_lex.text
    data_lex = res_lex.json()
    assert data_lex["total"] >= 5
    item_types_lex = {item["item_type"] for item in data_lex["items"]}
    assert "note" in item_types_lex
    assert "source" in item_types_lex
    assert "entity" in item_types_lex
    assert "collection" in item_types_lex
    assert "thread" in item_types_lex

    # Execute Hybrid Search
    res_hyb = client.post(
        f"/api/v1/workspaces/{workspace.id}/search",
        json={"query": "astronomy", "mode": "hybrid", "limit": 20},
    )
    assert res_hyb.status_code == 200, res_hyb.text
    data_hyb = res_hyb.json()
    assert data_hyb["total"] >= 5
    item_types_hyb = {item["item_type"] for item in data_hyb["items"]}
    assert "note" in item_types_hyb
    assert "source" in item_types_hyb
    assert "entity" in item_types_hyb
    assert "collection" in item_types_hyb
    assert "thread" in item_types_hyb

    # Test semantic mode directly by mocking vector points
    from unittest.mock import patch

    mock_points = [
        {"score": 0.95, "payload": {"note_id": str(note.id)}},
        {"score": 0.90, "payload": {"source_id": str(source.id)}},
        {"score": 0.85, "payload": {"entity_id": str(entity.id)}},
        {"score": 0.80, "payload": {"collection_id": str(collection.id)}},
        {"score": 0.75, "payload": {"thread_id": str(thread.id)}},
    ]
    with patch("app.services.vector_service.search_vectors", return_value=mock_points):
        res_sem = client.post(
            f"/api/v1/workspaces/{workspace.id}/search",
            json={"query": "astronomy", "mode": "semantic", "limit": 20},
        )
        assert res_sem.status_code == 200, res_sem.text
        data_sem = res_sem.json()
        assert data_sem["total"] == 5
        types_sem = {item["item_type"] for item in data_sem["items"]}
        assert types_sem == {"note", "source", "entity", "collection", "thread"}


def test_global_search_workspace_isolation(client: TestClient, db_session: Session):
    """Verify that records in workspace B are never returned in search for workspace A."""
    user = User(display_name="Multi-Workspace User")
    db_session.add(user)
    db_session.commit()

    ws_a = Workspace(name="Workspace A", owner_id=user.id)
    ws_b = Workspace(name="Workspace B", owner_id=user.id)
    db_session.add_all([ws_a, ws_b])
    db_session.commit()

    # Note in Workspace B
    note_b = Note(
        workspace_id=ws_b.id,
        title="Classified Alchemy in Workspace B",
        content="Secret alchemy research only in Workspace B.",
        created_by=user.id,
    )
    db_session.add(note_b)
    db_session.commit()

    # Search in Workspace A
    res = client.post(
        f"/api/v1/workspaces/{ws_a.id}/search",
        json={"query": "alchemy", "mode": "lexical", "limit": 10},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 0
    assert len(data["items"]) == 0


def test_global_search_validation_and_empty_results(client: TestClient, db_session: Session):
    """Verify empty query rejection and unmatched query empty result list."""
    user = User(display_name="Empty Test User")
    db_session.add(user)
    db_session.commit()

    ws = Workspace(name="Empty Test WS", owner_id=user.id)
    db_session.add(ws)
    db_session.commit()

    # Empty query whitespace
    res_err = client.post(
        f"/api/v1/workspaces/{ws.id}/search",
        json={"query": "   ", "mode": "lexical"},
    )
    assert res_err.status_code == 422

    # Unmatched query
    res_empty = client.post(
        f"/api/v1/workspaces/{ws.id}/search",
        json={"query": "nonexistent_term_xyz_12345", "mode": "lexical"},
    )
    assert res_empty.status_code == 200
    assert res_empty.json()["total"] == 0
    assert res_empty.json()["items"] == []
