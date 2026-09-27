"""Comprehensive tests for v0.3.2 Knowledge Graph & GraphRAG hardening.

Covers:
1. Valid structured extraction (json_schema and json_object paths)
2. Malformed JSON retry and recovery
3. Schema validation failure retry with error feedback
4. Timeout transient error bounded retry
5. Provider 5xx transient error bounded retry
6. Retry exhaustion behavior
7. One failed note not stopping remaining notes in reindex
8. Idempotent extraction (no duplicates on repeated extraction)
9. Cluster replacement and deduplication
10. Source relevance threshold filtering (unrelated query produces 0 citations)
"""

import json
import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.orm import Session

from app.core.exceptions import (
    ExtractionFailedError,
    LLMProviderUnavailableError,
    LLMTimeoutError,
)
from app.models.content_chunk import ContentChunk
from app.models.graph_entity import GraphEntity
from app.models.note import Note
from app.models.note_cluster import NoteCluster
from app.models.note_cluster_member import NoteClusterMember
from app.models.note_version import NoteVersion
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.rag import RAGRequest
from app.schemas.search import SearchResultItem
from app.services import (
    cluster_service,
    entity_extraction_service,
    graph_index_service,
    rag_service,
)


@pytest.fixture
def test_env(db_session: Session):
    user = User(id=uuid.uuid4(), display_name="Graph Engineer")
    ws = Workspace(id=uuid.uuid4(), name="Reliability Vault", owner_id=user.id)
    db_session.add_all([user, ws])
    db_session.flush()

    note1 = Note(
        id=uuid.uuid4(),
        workspace_id=ws.id,
        created_by=user.id,
        title="Operating Systems Kernel",
        content="The kernel manages process scheduling, virtual memory, and device drivers.",
    )
    note2 = Note(
        id=uuid.uuid4(),
        workspace_id=ws.id,
        created_by=user.id,
        title="Culinary Fermentation",
        content="Sourdough bread relies on wild yeast and lactic acid bacteria for fermentation.",
    )
    db_session.add_all([note1, note2])
    db_session.flush()

    for n in [note1, note2]:
        ver = NoteVersion(
            id=uuid.uuid4(),
            note_id=n.id,
            workspace_id=ws.id,
            author_id=user.id,
            commit_hash=f"hash_{n.id.hex[:16]}",
            message="Snapshot",
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
            token_count=25,
            embedding_model="test-embed",
            embedding_dimension=384,
            created_at=datetime.now(UTC),
        )
        db_session.add(nc)

    db_session.commit()
    return {"user": user, "ws": ws, "notes": [note1, note2]}


def test_valid_structured_extraction_json_object(test_env: dict):
    """Test entity extraction when provider supports json_object."""
    provider_mock = MagicMock()
    provider_mock.supports_json_schema = False
    provider_mock.supports_json_object = True
    provider_mock.model = "test-model"

    valid_payload = json.dumps(
        {
            "entities": [
                {"name": "Virtual Memory", "type": "concept", "description": "Memory abstraction"},
                {"name": "Process Scheduler", "type": "concept", "description": "CPU scheduler"},
            ]
        }
    )
    provider_mock.generate.return_value = valid_payload

    with patch(
        "app.services.entity_extraction_service.llm_service.get_llm_provider",
        return_value=provider_mock,
    ):
        entities = entity_extraction_service.extract_entities(
            "Kernel manages virtual memory and process scheduler."
        )
        assert len(entities) == 2
        assert entities[0]["name"] == "Virtual Memory"
        assert entities[1]["name"] == "Process Scheduler"
        call_kwargs = provider_mock.generate.call_args.kwargs
        assert call_kwargs.get("response_format") == {"type": "json_object"}


def test_extraction_malformed_json_retry_recovery(test_env: dict):
    """Test retry recovery when the LLM initially returns non-JSON text."""
    provider_mock = MagicMock()
    provider_mock.supports_json_schema = False
    provider_mock.supports_json_object = False
    provider_mock.model = "test-model"

    provider_mock.generate.side_effect = [
        "Sure, here are your entities: Virtual Memory (concept)",
        json.dumps(
            {
                "entities": [
                    {
                        "name": "Virtual Memory",
                        "type": "concept",
                        "description": "Memory abstraction",
                    }
                ]
            }
        ),
    ]

    with patch(
        "app.services.entity_extraction_service.llm_service.get_llm_provider",
        return_value=provider_mock,
    ):
        entities = entity_extraction_service.extract_entities("Sample text")
        assert len(entities) == 1
        assert entities[0]["name"] == "Virtual Memory"
        assert provider_mock.generate.call_count == 2


def test_extraction_schema_validation_failure_retry(test_env: dict):
    """Test retry when LLM returns JSON missing required fields or invalid structure."""
    provider_mock = MagicMock()
    provider_mock.supports_json_schema = False
    provider_mock.supports_json_object = True
    provider_mock.model = "test-model"

    provider_mock.generate.side_effect = [
        json.dumps({"entities": ["invalid_string_instead_of_object"]}),
        json.dumps(
            {
                "entities": [
                    {"name": "File System", "type": "concept", "description": "Storage hierarchy"}
                ]
            }
        ),
    ]

    with patch(
        "app.services.entity_extraction_service.llm_service.get_llm_provider",
        return_value=provider_mock,
    ):
        entities = entity_extraction_service.extract_entities("File system note")
        assert len(entities) == 1
        assert entities[0]["name"] == "File System"
        assert provider_mock.generate.call_count == 2
        second_call_messages = provider_mock.generate.call_args_list[1].args[0]
        assert any("validation error" in m["content"] for m in second_call_messages)


def test_extraction_timeout_bounded_retry(test_env: dict):
    """Test transient LLMTimeoutError triggers bounded backoff retry and succeeds."""
    provider_mock = MagicMock()
    provider_mock.supports_json_schema = False
    provider_mock.supports_json_object = True
    provider_mock.model = "test-model"

    provider_mock.generate.side_effect = [
        LLMTimeoutError("Request timed out"),
        json.dumps(
            {
                "entities": [
                    {"name": "Device Driver", "type": "concept", "description": "Hardware adapter"}
                ]
            }
        ),
    ]

    with (
        patch(
            "app.services.entity_extraction_service.llm_service.get_llm_provider",
            return_value=provider_mock,
        ),
        patch("time.sleep"),
    ):
        entities = entity_extraction_service.extract_entities("Driver text")
        assert len(entities) == 1
        assert entities[0]["name"] == "Device Driver"
        assert provider_mock.generate.call_count == 2


def test_extraction_provider_5xx_retry(test_env: dict):
    """Test provider 502/503/504 errors trigger bounded backoff and succeeds."""
    provider_mock = MagicMock()
    provider_mock.supports_json_schema = False
    provider_mock.supports_json_object = True
    provider_mock.model = "test-model"

    provider_mock.generate.side_effect = [
        LLMProviderUnavailableError("503 Service Unavailable"),
        json.dumps(
            {
                "entities": [
                    {"name": "Cache", "type": "concept", "description": "High-speed storage"}
                ]
            }
        ),
    ]

    with (
        patch(
            "app.services.entity_extraction_service.llm_service.get_llm_provider",
            return_value=provider_mock,
        ),
        patch("time.sleep"),
    ):
        entities = entity_extraction_service.extract_entities("Cache text")
        assert len(entities) == 1
        assert entities[0]["name"] == "Cache"


def test_extraction_retry_exhaustion_raises_cleanly(test_env: dict):
    """Test that exhausted retries raise ExtractionFailedError."""
    provider_mock = MagicMock()
    provider_mock.supports_json_schema = False
    provider_mock.supports_json_object = True
    provider_mock.model = "test-model"

    provider_mock.generate.side_effect = LLMTimeoutError("Continuous timeout")

    with (
        patch(
            "app.services.entity_extraction_service.llm_service.get_llm_provider",
            return_value=provider_mock,
        ),
        patch("time.sleep"),
        pytest.raises(ExtractionFailedError),
    ):
        entity_extraction_service.extract_entities("Sample")


def test_one_failed_note_does_not_stop_reindex(db_session: Session, test_env: dict):
    """A single note failing extraction must not abort the entire reindex."""
    ws = test_env["ws"]
    notes = test_env["notes"]
    failing_id = notes[0].id

    original_extract = entity_extraction_service.extract_entities_for_note

    def side_effect_extract(db: Session, note_id: uuid.UUID, model: str | None = None):
        if note_id == failing_id:
            raise ExtractionFailedError("Provider 500 error on note 0")
        return original_extract(db, note_id, model=model)

    with patch.object(
        entity_extraction_service, "extract_entities_for_note", side_effect=side_effect_extract
    ):
        summary = graph_index_service.reindex_workspace_graph(db_session, ws.id)

        assert summary["total_notes"] == 2
        assert summary["notes_processed"] == 1
        assert len(summary["failed_notes"]) == 1
        assert summary["failed_notes"][0]["note_id"] == str(failing_id)
        # Note 2 was still processed
        entities = db_session.scalars(
            entity_extraction_service.select(GraphEntity).where(GraphEntity.workspace_id == ws.id)
        ).all()
        assert len(entities) > 0


def test_idempotent_extraction_no_duplicates(db_session: Session, test_env: dict):
    """Running extraction repeatedly must not create duplicate entities or relationships."""
    ws = test_env["ws"]
    note = test_env["notes"][0]

    # Run extraction once
    entity_extraction_service.extract_entities_for_note(db_session, note.id)
    count_1 = db_session.scalars(
        entity_extraction_service.select(GraphEntity).where(GraphEntity.workspace_id == ws.id)
    ).all()

    # Run extraction second time on the same note
    entity_extraction_service.extract_entities_for_note(db_session, note.id)
    count_2 = db_session.scalars(
        entity_extraction_service.select(GraphEntity).where(GraphEntity.workspace_id == ws.id)
    ).all()

    assert len(count_1) == len(count_2)


def test_cluster_replacement_and_deduplication(db_session: Session, test_env: dict):
    """Running clustering multiple times should replace previous clusters."""
    ws = test_env["ws"]

    # Reindex first so notes have chunks & entities
    graph_index_service.reindex_workspace_graph(db_session, ws.id)

    # First clustering run
    res1 = cluster_service.cluster_workspace(db_session, ws.id)
    clusters_run1 = db_session.scalars(
        cluster_service.select(NoteCluster).where(NoteCluster.workspace_id == ws.id)
    ).all()
    members_run1 = db_session.scalars(
        cluster_service.select(NoteClusterMember).where(
            NoteClusterMember.cluster_id.in_([c.id for c in clusters_run1])
        )
    ).all()

    assert len(clusters_run1) == len(res1)
    assert len(members_run1) > 0

    # Second clustering run
    res2 = cluster_service.cluster_workspace(db_session, ws.id)
    clusters_run2 = db_session.scalars(
        cluster_service.select(NoteCluster).where(NoteCluster.workspace_id == ws.id)
    ).all()
    members_run2 = db_session.scalars(
        cluster_service.select(NoteClusterMember).where(
            NoteClusterMember.cluster_id.in_([c.id for c in clusters_run2])
        )
    ).all()

    # Verify old clusters were cleaned up and not duplicated
    assert len(clusters_run2) == len(res2)
    assert len(clusters_run2) == len(clusters_run1)
    assert len(members_run2) == len(members_run1)
    # Verify entity cluster_ids point to active clusters
    entities = db_session.scalars(
        cluster_service.select(GraphEntity).where(GraphEntity.workspace_id == ws.id)
    ).all()
    valid_cluster_ids = {c.id for c in clusters_run2}
    for e in entities:
        if e.cluster_id is not None:
            assert e.cluster_id in valid_cluster_ids


def test_rag_source_relevance_threshold_unrelated_query(db_session: Session, test_env: dict):
    """When candidates score below RAG_MIN_RELEVANCE_SCORE, return 0 citations."""
    ws = test_env["ws"]
    note_os = test_env["notes"][0]

    # Candidate with low similarity score (0.22 < 0.35)
    low_score_candidate = SearchResultItem(
        note_id=note_os.id,
        chunk_id=db_session.scalars(
            entity_extraction_service.select(ContentChunk.id).where(
                ContentChunk.note_id == note_os.id
            )
        ).first(),
        title=note_os.title,
        excerpt=note_os.content,
        score=0.22,
        score_meaning="cosine_similarity",
        search_mode="semantic",
    )

    request = RAGRequest(
        query="How do I make sourdough bread?",
        search_mode="semantic",
        rerank=False,
    )

    with patch.object(
        rag_service.retrieval_service, "search_semantic", return_value=[low_score_candidate]
    ):
        response = rag_service.run_rag(db_session, ws.id, request)

        # Citations must be empty because the candidate did not pass relevance threshold
        assert len(response.citations) == 0
        assert (
            "knowledge base does not contain sufficiently relevant information" in response.answer
        )


def test_rag_source_relevance_threshold_relevant_query(db_session: Session, test_env: dict):
    """When candidates pass RAG_MIN_RELEVANCE_SCORE, citations are retained and prompt answers."""
    ws = test_env["ws"]
    note_bread = test_env["notes"][1]

    high_score_candidate = SearchResultItem(
        note_id=note_bread.id,
        chunk_id=db_session.scalars(
            entity_extraction_service.select(ContentChunk.id).where(
                ContentChunk.note_id == note_bread.id
            )
        ).first(),
        title=note_bread.title,
        excerpt=note_bread.content,
        score=0.82,
        score_meaning="cosine_similarity",
        search_mode="semantic",
    )

    request = RAGRequest(
        query="How does sourdough fermentation work?",
        search_mode="semantic",
        rerank=False,
    )

    provider_mock = MagicMock()
    provider_mock.generate.return_value = (
        "Sourdough fermentation uses wild yeast and lactic acid bacteria."
    )
    provider_mock.provider_name.return_value = "mock-provider"
    provider_mock.model_name.return_value = "mock-model"

    with (
        patch.object(
            rag_service.retrieval_service, "search_semantic", return_value=[high_score_candidate]
        ),
        patch.object(rag_service.llm_service, "get_llm_provider", return_value=provider_mock),
    ):
        response = rag_service.run_rag(db_session, ws.id, request)

        assert len(response.citations) > 0
        assert response.citations[0].title == "Culinary Fermentation"
        assert "Sourdough fermentation" in response.answer
