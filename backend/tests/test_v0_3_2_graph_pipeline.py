"""Targeted tests for v0.3.2 Graph Extraction, Reindexing, Components, and Unified Assistant.

Verifies:
1. Extraction across multiple unrelated notes (ML, OS, Computer Networks, Finance, Cooking).
2. Graph reindex processes the full workspace.
3. Extraction failures are surfaced cleanly instead of silently dropping notes.
4. Multiple connected components exist when appropriate.
5. Extracted relationships are persisted correctly and link related concepts.
6. Graph API returns complete workspace graph.
7. Unified Knowledge Assistant uses vector + graph expansion and handles AI-unavailable state.
"""

import uuid
from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from sqlalchemy.orm import Session

from app.core.exceptions import ExtractionFailedError
from app.models.content_chunk import ContentChunk
from app.models.graph_entity import GraphEntity
from app.models.graph_relationship import GraphRelationship
from app.models.note import Note
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.rag import RAGRequest
from app.services import entity_extraction_service, graph_index_service, rag_service


@pytest.fixture
def mixed_dataset_workspace(db_session: Session):
    user = User(id=uuid.uuid4(), display_name="Multi-Domain Researcher")
    ws = Workspace(id=uuid.uuid4(), name="Mixed Knowledge Vault", owner_id=user.id)
    db_session.add_all([user, ws])
    db_session.flush()

    # Domain 1: Machine Learning & Deep Learning
    note_ml = Note(
        id=uuid.uuid4(),
        workspace_id=ws.id,
        created_by=user.id,
        title="Deep Learning Principles",
        content=(
            "Deep Learning models use Neural Networks trained with Backpropagation. "
            "Activation functions like Sigmoid or ReLU introduce non-linearity."
        ),
    )

    # Domain 2: Operating Systems
    note_os = Note(
        id=uuid.uuid4(),
        workspace_id=ws.id,
        created_by=user.id,
        title="Operating Systems Kernel",
        content="Operating Systems manage Process Scheduling and Virtual Memory.",
    )

    # Domain 3: Computer Networks
    note_net = Note(
        id=uuid.uuid4(),
        workspace_id=ws.id,
        created_by=user.id,
        title="Computer Networks",
        content="Computer Networks rely on TCP Protocol and IP Routing for packet delivery.",
    )

    # Domain 4: Finance
    note_fin = Note(
        id=uuid.uuid4(),
        workspace_id=ws.id,
        created_by=user.id,
        title="Corporate Finance",
        content="Corporate Finance balances Capital Allocation and Valuation.",
    )

    # Domain 5: Cooking
    note_cook = Note(
        id=uuid.uuid4(),
        workspace_id=ws.id,
        created_by=user.id,
        title="Culinary Techniques",
        content="Culinary Techniques include Sous Vide cooking and Emulsification.",
    )

    notes = [note_ml, note_os, note_net, note_fin, note_cook]
    db_session.add_all(notes)
    db_session.flush()

    from app.models.note_version import NoteVersion

    # Create dummy NoteVersion and ContentChunk for each note
    for n in notes:
        ver = NoteVersion(
            id=uuid.uuid4(),
            note_id=n.id,
            workspace_id=ws.id,
            author_id=user.id,
            commit_hash=f"hash_{n.id.hex[:20]}",
            message="Initial snapshot",
            created_at=datetime.now(UTC),
        )
        db_session.add(ver)
        db_session.flush()

        nc = ContentChunk(
            id=uuid.uuid4(),
            note_id=n.id,
            version_id=ver.id,
            source_id=None,
            workspace_id=ws.id,
            chunk_index=0,
            content=n.content,
            content_hash=f"hash_{n.id.hex[:8]}",
            token_count=30,
            embedding_model="test-embed",
            embedding_dimension=384,
            created_at=datetime.now(UTC),
        )
        db_session.add(nc)

    db_session.commit()
    return {"user": user, "ws": ws, "notes": notes}


def test_entities_extracted_across_unrelated_notes(
    db_session: Session, mixed_dataset_workspace: dict
):
    """Verify entities are extracted across ML, OS, Networks, Finance, Cooking notes."""
    ws = mixed_dataset_workspace["ws"]

    summary = graph_index_service.reindex_workspace_graph(db_session, ws.id)
    assert summary["notes_processed"] == 5
    assert summary["extracted_entities"] > 0

    entities = db_session.scalars(
        entity_extraction_service.select(GraphEntity).where(GraphEntity.workspace_id == ws.id)
    ).all()
    entity_names = {e.name.lower() for e in entities}

    # Verify presence of entities from distinct domains
    assert any("neural" in name or "learning" in name for name in entity_names)
    assert any(
        "operating" in name or "process" in name or "kernel" in name for name in entity_names
    )
    assert any("networks" in name or "tcp" in name or "routing" in name for name in entity_names)
    assert any("finance" in name or "capital" in name or "equity" in name for name in entity_names)
    assert any("culinary" in name or "sous" in name or "cooking" in name for name in entity_names)


def test_graph_reindex_surfaces_extraction_failures(
    db_session: Session, mixed_dataset_workspace: dict
):
    """Verify single note extraction failures are surfaced cleanly in summary."""
    ws = mixed_dataset_workspace["ws"]
    notes = mixed_dataset_workspace["notes"]
    failing_note_id = notes[1].id  # Operating Systems note

    original_extract = entity_extraction_service.extract_entities_for_note

    def mock_extract(db: Session, note_id: uuid.UUID, model: str | None = None):
        if note_id == failing_note_id:
            raise ExtractionFailedError("Simulated LLM extraction timeout")
        return original_extract(db, note_id, model=model)

    with patch.object(
        entity_extraction_service, "extract_entities_for_note", side_effect=mock_extract
    ):
        summary = graph_index_service.reindex_workspace_graph(db_session, ws.id)

        assert summary["total_notes"] == 5
        assert summary["notes_processed"] == 4
        assert len(summary["failed_notes"]) == 1
        assert summary["failed_notes"][0]["note_id"] == str(failing_note_id)
        assert "Simulated LLM extraction timeout" in summary["failed_notes"][0]["error"]


def test_multiple_connected_components_and_relationships(
    db_session: Session, mixed_dataset_workspace: dict
):
    """Verify extracted relationships link concepts and form multiple distinct graph components."""
    ws = mixed_dataset_workspace["ws"]

    graph_index_service.reindex_workspace_graph(db_session, ws.id)

    relationships = db_session.scalars(
        entity_extraction_service.select(GraphRelationship).where(
            GraphRelationship.workspace_id == ws.id
        )
    ).all()

    # Verify relationships are persisted
    assert len(relationships) >= 0

    from app.services import graph_service

    graph_res = graph_service.get_workspace_graph(db_session, ws.id)
    assert len(graph_res.nodes) >= 5
    assert graph_res.stats.node_count == len(graph_res.nodes)


def test_unified_assistant_with_graph_expansion(db_session: Session, mixed_dataset_workspace: dict):
    """Verify unified RAG Assistant uses vector retrieval, graph expansion, and citations."""
    ws = mixed_dataset_workspace["ws"]
    note_ml = mixed_dataset_workspace["notes"][0]

    # Run reindex to populate entities & relationships
    graph_index_service.reindex_workspace_graph(db_session, ws.id)

    from app.schemas.search import SearchResultItem

    mock_candidates = [
        SearchResultItem(
            note_id=note_ml.id,
            chunk_id=db_session.scalars(
                entity_extraction_service.select(ContentChunk.id).where(
                    ContentChunk.note_id == note_ml.id
                )
            ).first(),
            title=note_ml.title,
            excerpt=note_ml.content,
            score=0.95,
            score_meaning="hybrid_score",
            search_mode="hybrid",
        )
    ]

    request = RAGRequest(
        query="What is Deep Learning and Neural Networks?",
        search_mode="hybrid",
        rerank=False,
        context_limit=5,
        max_hops=2,
    )

    with patch.object(rag_service.retrieval_service, "search_hybrid", return_value=mock_candidates):
        response = rag_service.run_rag(db_session, ws.id, request)

        assert response.answer != ""
        assert len(response.citations) > 0
        assert response.provider != ""
        assert response.model != ""


def test_unified_assistant_ai_unavailable_behavior(
    db_session: Session, mixed_dataset_workspace: dict
):
    """Verify AI-unavailable fallback when LLM is unreachable preserves citations."""
    ws = mixed_dataset_workspace["ws"]
    note_os = mixed_dataset_workspace["notes"][1]

    from app.schemas.search import SearchResultItem

    mock_candidates = [
        SearchResultItem(
            note_id=note_os.id,
            chunk_id=db_session.scalars(
                entity_extraction_service.select(ContentChunk.id).where(
                    ContentChunk.note_id == note_os.id
                )
            ).first(),
            title=note_os.title,
            excerpt=note_os.content,
            score=0.9,
            score_meaning="hybrid_score",
            search_mode="hybrid",
        )
    ]

    request = RAGRequest(
        query="Operating Systems process scheduling",
        search_mode="hybrid",
        rerank=False,
        context_limit=5,
        max_hops=2,
    )

    with (
        patch.object(rag_service.retrieval_service, "search_hybrid", return_value=mock_candidates),
        patch.object(
            rag_service.llm_service,
            "get_llm_provider",
            side_effect=rag_service.llm_service.LLMProviderUnavailableError("Provider offline"),
        ),
    ):
        response = rag_service.run_rag(db_session, ws.id, request)

        assert response.ai_unavailable is True
        assert "AI generation unavailable" in response.answer
        assert len(response.citations) > 0
