"""Comprehensive backend and API tests for Usability, Sources & Persistent Assistant (v0.4.1).

Contract references:
    CONTRACT_v0.4.1.md §6, §7, §8, §9, §10, §11, §12, §14.1, §17
"""

import base64
import io
import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import (
    LLMProviderUnavailableError,
    SourceNotRetryableError,
    UnsupportedSourceTypeError,
)
from app.models.content_chunk import ContentChunk
from app.models.message_citation import MessageCitation
from app.models.note import Note
from app.models.note_version import NoteVersion
from app.models.source import Source
from app.models.source_note_link import SourceNoteLink
from app.models.user import User
from app.models.workspace import Workspace
from app.services import (
    assistant_service,
    conversation_service,
    message_service,
    retrieval_service,
    source_processing_service,
    source_service,
    vector_service,
)


@pytest.fixture
def v041_setup(db_session: Session):
    user = User(id=uuid.uuid4(), display_name="Assistant Researcher")
    db_session.add(user)
    db_session.flush()

    ws_a = Workspace(id=uuid.uuid4(), name="Primary Workspace", owner_id=user.id)
    ws_b = Workspace(id=uuid.uuid4(), name="Isolated Workspace", owner_id=user.id)
    db_session.add_all([ws_a, ws_b])
    db_session.flush()

    # Note in Workspace A
    note_a = Note(
        id=uuid.uuid4(),
        workspace_id=ws_a.id,
        created_by=user.id,
        title="Transformers and Attention",
        content="Self-attention mechanisms allow transformers to compute dynamic representations.",
    )
    # Note in Workspace B (Isolation test)
    note_b = Note(
        id=uuid.uuid4(),
        workspace_id=ws_b.id,
        created_by=user.id,
        title="Top Secret Workspace B",
        content="Confidential proprietary formula strictly isolated in Workspace B.",
    )
    db_session.add_all([note_a, note_b])
    db_session.flush()

    ver_a = NoteVersion(
        id=uuid.uuid4(),
        note_id=note_a.id,
        workspace_id=ws_a.id,
        author_id=user.id,
        commit_hash="0123456789abcdef0123456789abcdef0123456a",
        message="Initial",
        created_at=datetime.now(UTC),
    )
    db_session.add(ver_a)
    db_session.flush()

    chunk_a = ContentChunk(
        id=uuid.uuid4(),
        note_id=note_a.id,
        version_id=ver_a.id,
        source_id=None,
        workspace_id=ws_a.id,
        chunk_index=0,
        content=note_a.content,
        content_hash="hash_a",
        token_count=20,
        embedding_model="test-embed",
        embedding_dimension=384,
        created_at=datetime.now(UTC),
    )
    db_session.add(chunk_a)
    db_session.commit()

    # Index chunk_a in vector store
    vector_service.upsert_chunks(
        workspace_id=ws_a.id,
        chunks=[chunk_a],
        embeddings=[[0.1] * 384],
    )

    return {
        "user": user,
        "ws_a": ws_a,
        "ws_b": ws_b,
        "note_a": note_a,
        "note_b": note_b,
        "chunk_a": chunk_a,
    }


# ── 1. Source Upload & Validation Tests ─────────────────────────────────────────


def test_source_upload_markdown_and_processing_pipeline(db_session: Session, v041_setup: dict):
    """Verify single markdown source upload, 6-stage transition, and ContentChunk creation."""
    ws = v041_setup["ws_a"]
    md_content = (
        b"# Quantum Computing\n\nQuantum algorithms leverage superposition and entanglement."
    )

    source = source_service.upload_source(
        db=db_session,
        workspace_id=ws.id,
        file_content=md_content,
        filename="quantum_guide.md",
    )

    assert source.id is not None
    assert source.source_type == "markdown"
    assert source.processing_status == "READY"
    assert source.processing_stage == "complete"
    assert source.chunk_count is not None and source.chunk_count > 0
    assert source.file_size_bytes == len(md_content)
    assert source.error_stage is None

    # Check ContentChunk in DB
    chunks = db_session.scalars(
        select(ContentChunk).where(ContentChunk.source_id == source.id)
    ).all()
    assert len(chunks) == source.chunk_count
    for c in chunks:
        assert c.source_id == source.id
        assert c.note_id is None
        assert c.workspace_id == ws.id
        assert "Quantum" in c.content


def test_source_upload_pdf_text_and_page_count(db_session: Session, v041_setup: dict):
    """Verify PDF upload with %PDF- header and page count extraction."""
    ws = v041_setup["ws_a"]

    pdf_bytes = (
        b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n"
        b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\n"
        b"xref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n"
        b"0000000053 00000 n\n0000000102 00000 n\n"
        b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF"
    )

    with patch.object(
        source_processing_service,
        "extract_text",
        return_value=("Extracted PDF content about Neural Networks.", 1),
    ):
        source = source_service.upload_source(
            db=db_session,
            workspace_id=ws.id,
            file_content=pdf_bytes,
            filename="sample_paper.pdf",
        )

        assert source.source_type == "pdf"
        assert source.processing_status == "READY"
        assert source.page_count == 1
        assert source.chunk_count == 1


def test_source_upload_unsupported_type_rejected(db_session: Session, v041_setup: dict):
    """Verify unsupported file type is rejected with 422 UNSUPPORTED_SOURCE_TYPE."""
    ws = v041_setup["ws_a"]
    binary_data = b"\x00\x01\x02\x03\x04\x05ExecutableBinary"

    with pytest.raises(UnsupportedSourceTypeError):
        source_service.upload_source(
            db=db_session,
            workspace_id=ws.id,
            file_content=binary_data,
            filename="malicious.exe",
        )


def test_source_upload_size_limit_rejection(db_session: Session, v041_setup: dict):
    """Verify file exceeding size limit is rejected with ValidationError."""
    ws = v041_setup["ws_a"]
    huge_bytes = b"A" * (26 * 1024 * 1024)  # 26 MB > 25 MB limit

    from app.core.exceptions import ValidationError

    with pytest.raises(ValidationError) as exc:
        source_service.upload_source(
            db=db_session,
            workspace_id=ws.id,
            file_content=huge_bytes,
            filename="large_file.txt",
        )
    assert "exceeds maximum allowed size" in str(exc.value)


# ── 2. Source Retry & Idempotency Tests ────────────────────────────────────────


def test_source_retry_delete_then_reindex(db_session: Session, v041_setup: dict):
    """Verify retry deletes prior chunks/vectors and reindexes failed source to READY."""
    ws = v041_setup["ws_a"]

    # Create failed source
    source = Source(
        id=uuid.uuid4(),
        workspace_id=ws.id,
        source_type="markdown",
        original_path="broken_doc.md",
        source_identifier="broken_doc.md",
        content_hash="hash_broken",
        import_batch_id=uuid.uuid4(),
        import_status="completed",
        processing_stage="extract",
        processing_status="FAILED",
        error_stage="extract",
        error_message="Extraction failed: corrupted text",
        raw_metadata={
            "filename": "broken_doc.md",
            "content_base64": base64.b64encode(b"Fixed markdown content for retry.").decode(
                "ascii"
            ),
        },
    )
    db_session.add(source)
    db_session.commit()

    # Create old orphan chunk for this source
    old_chunk = ContentChunk(
        id=uuid.uuid4(),
        source_id=source.id,
        workspace_id=ws.id,
        chunk_index=0,
        content="Old broken chunk",
        content_hash="old_hash",
        token_count=10,
        embedding_model="test",
        embedding_dimension=384,
    )
    db_session.add(old_chunk)
    db_session.commit()

    # Retry source
    retried_source = source_service.retry_source(db_session, source.id)

    assert retried_source.processing_status == "READY"
    assert retried_source.error_stage is None
    assert retried_source.error_message is None

    # Verify old chunk was replaced with new chunk
    chunks = db_session.scalars(
        select(ContentChunk).where(ContentChunk.source_id == source.id)
    ).all()
    assert len(chunks) == 1
    assert chunks[0].id != old_chunk.id
    assert "Fixed markdown content" in chunks[0].content


def test_source_retry_rejected_for_ready_source(db_session: Session, v041_setup: dict):
    """Verify retry on non-failed source raises SourceNotRetryableError (422)."""
    ws = v041_setup["ws_a"]
    source = source_service.upload_source(
        db=db_session,
        workspace_id=ws.id,
        file_content=b"Healthy markdown file content.",
        filename="healthy.md",
    )
    assert source.processing_status == "READY"

    with pytest.raises(SourceNotRetryableError):
        source_service.retry_source(db_session, source.id)


# ── 3. Source-Note Links Tests ─────────────────────────────────────────────────


def test_source_note_link_lifecycle(db_session: Session, v041_setup: dict):
    """Verify many-to-many source-note association creation and deletion."""
    ws = v041_setup["ws_a"]
    note = v041_setup["note_a"]

    source = source_service.upload_source(
        db=db_session,
        workspace_id=ws.id,
        file_content=b"Reference research paper.",
        filename="ref_paper.md",
    )

    # Link source to note
    link = source_service.link_source_to_note(db_session, source.id, note.id)
    assert link.source_id == source.id
    assert link.note_id == note.id

    # Unlink
    source_service.unlink_source_from_note(db_session, source.id, note.id)
    deleted_link = db_session.get(SourceNoteLink, (source.id, note.id))
    assert deleted_link is None


# ── 4. Semantic Search Integration for Sources ─────────────────────────────────


def test_source_chunks_in_semantic_search(db_session: Session, v041_setup: dict):
    """Verify source chunks appear in semantic search results with source title."""
    ws = v041_setup["ws_a"]
    source = source_service.upload_source(
        db=db_session,
        workspace_id=ws.id,
        file_content=b"Deep Residual Learning for Image Recognition by Kaiming He.",
        filename="resnet.md",
    )

    results = retrieval_service.search_semantic(
        db=db_session,
        workspace_id=ws.id,
        query="Residual Learning Image Recognition",
        limit=5,
    )

    assert len(results) > 0
    source_results = [r for r in results if r.source_id == source.id]
    assert len(source_results) > 0
    assert source_results[0].title == "resnet.md"
    assert source_results[0].note_id is None
    assert "Residual Learning" in source_results[0].excerpt


# ── 5. Conversation Lifecycle Tests ────────────────────────────────────────────


def test_conversation_crud_lifecycle(db_session: Session, v041_setup: dict):
    """Verify conversation creation (title=None initially), rename, list, and delete."""
    ws = v041_setup["ws_a"]

    # 1. Create conversation (title is None until first message per §6.3)
    conv = conversation_service.create_conversation(db_session, workspace_id=ws.id)
    assert conv.id is not None
    assert conv.workspace_id == ws.id
    assert conv.title is None

    # 2. Rename conversation
    renamed = conversation_service.rename_conversation(
        db_session, conv.id, "Machine Learning Exploration"
    )
    assert renamed.title == "Machine Learning Exploration"

    # 3. List conversations
    items, total = conversation_service.list_conversations(db_session, ws.id)
    assert total >= 1
    assert any(c.id == conv.id for c in items)

    # 4. Delete conversation
    conversation_service.delete_conversation(db_session, conv.id)
    from app.core.exceptions import ConversationNotFoundError

    with pytest.raises(ConversationNotFoundError):
        conversation_service.get_conversation(db_session, conv.id)


def test_conversation_title_auto_generated_on_first_message(
    db_session: Session, v041_setup: dict
):
    """Verify conversation title is auto-generated from first message at word boundary (§6.3)."""
    ws = v041_setup["ws_a"]
    conv = conversation_service.create_conversation(db_session, workspace_id=ws.id)
    assert conv.title is None

    msg_text = "How does backpropagation compute gradient vectors in multi-layer perceptrons?"
    message_service.create_message(
        db=db_session,
        conversation_id=conv.id,
        role="user",
        content=msg_text,
    )

    db_session.refresh(conv)
    assert conv.title is not None
    assert conv.title == msg_text  # Fits within 100 chars


# ── 6. AI Assistant Query, Citations, & Scoping Tests ──────────────────────────


def test_assistant_run_with_citations_and_similarity_score(
    db_session: Session, v041_setup: dict
):
    """Verify assistant generates response, persists citations with similarity_score."""
    ws = v041_setup["ws_a"]
    conv = conversation_service.create_conversation(db_session, workspace_id=ws.id)

    provider_mock = MagicMock()
    provider_mock.generate.return_value = (
        "Transformers use self-attention to process dynamic token interactions "
        "[Transformers and Attention]."
    )
    provider_mock.provider_name.return_value = "deterministic_mock"
    provider_mock.model_name.return_value = "mock-model"

    with patch.object(
        assistant_service.llm_service, "get_llm_provider", return_value=provider_mock
    ):
        response = assistant_service.run_assistant(
            db=db_session,
            conversation_id=conv.id,
            content="Explain transformers and self-attention.",
        )

        assert response.user_message.role == "user"
        assert response.assistant_message.role == "assistant"
        assert "Transformers use self-attention" in response.assistant_message.content
        assert len(response.assistant_message.citations) > 0

        for cit in response.assistant_message.citations:
            assert hasattr(cit, "similarity_score")
            assert not hasattr(cit, "confidence")
            assert 0.0 <= cit.similarity_score <= 1.0
            assert cit.rank >= 1

        # Check DB citations
        db_citations = db_session.scalars(
            select(MessageCitation).where(
                MessageCitation.message_id == response.assistant_message.id
            )
        ).all()
        assert len(db_citations) == len(response.assistant_message.citations)


def test_assistant_workspace_isolation_no_cross_workspace_leak(
    db_session: Session, v041_setup: dict
):
    """Verify assistant in Workspace A NEVER retrieves or cites notes from Workspace B (§9.3)."""
    ws_a = v041_setup["ws_a"]
    note_b = v041_setup["note_b"]

    # Context assembly in Workspace A
    context_text, citations_data, _ = assistant_service.build_assistant_context(
        db=db_session,
        workspace_id=ws_a.id,
        query="Confidential proprietary formula strictly isolated in Workspace B",
    )

    # Must NOT contain any content from Note B or Workspace B
    assert "Workspace B" not in context_text
    assert "proprietary formula" not in context_text
    assert all(c["note_id"] != note_b.id for c in citations_data)
    assert all(c["workspace_id"] == ws_a.id for c in citations_data)


def test_assistant_history_truncation(db_session: Session, v041_setup: dict):
    """Verify conversation history is truncated to CONVERSATION_HISTORY_LIMIT messages (§9.4)."""
    ws = v041_setup["ws_a"]
    conv = conversation_service.create_conversation(db_session, workspace_id=ws.id)

    # Create 15 message turns
    for i in range(15):
        role = "user" if i % 2 == 0 else "assistant"
        message_service.create_message(
            db=db_session,
            conversation_id=conv.id,
            role=role,
            content=f"Message turn number {i}",
        )

    history = assistant_service._build_history_messages(db_session, conv.id, limit=10)
    assert len(history) == 10
    # Must preserve newest messages
    assert history[-1]["content"] == "Message turn number 14"
    assert history[0]["content"] == "Message turn number 5"


# ── 7. Streaming & Error Handling Tests ─────────────────────────────────────────


def test_assistant_streaming_sse_events(db_session: Session, v041_setup: dict):
    """Verify streaming delivers user_message_created, chunk, and done events in order."""
    ws = v041_setup["ws_a"]
    conv = conversation_service.create_conversation(db_session, workspace_id=ws.id)

    provider_mock = MagicMock()
    provider_mock.generate_stream.return_value = ["Attention ", "is all ", "you need."]
    provider_mock.provider_name.return_value = "streaming_mock"
    provider_mock.model_name.return_value = "mock_model"

    with patch.object(
        assistant_service.llm_service, "get_llm_provider", return_value=provider_mock
    ):
        generator = assistant_service.stream_assistant_response(
            db=db_session,
            conversation_id=conv.id,
            content="What is attention?",
        )
        events = list(generator)

        assert len(events) >= 5
        assert "user_message_created" in events[0]
        assert "chunk" in events[1]
        assert "Attention " in events[1]
        assert "done" in events[-1]


def test_assistant_provider_failure_retains_conversation_and_user_message(
    db_session: Session, v041_setup: dict
):
    """Verify provider failure leaves conversation & user message intact (§12)."""
    ws = v041_setup["ws_a"]
    conv = conversation_service.create_conversation(db_session, workspace_id=ws.id)

    provider_mock = MagicMock()
    provider_mock.generate.side_effect = LLMProviderUnavailableError("Ollama service down")

    with patch.object(
        assistant_service.llm_service, "get_llm_provider", return_value=provider_mock
    ):
        with pytest.raises(LLMProviderUnavailableError):
            assistant_service.run_assistant(
                db=db_session,
                conversation_id=conv.id,
                content="Will fail due to LLM error.",
            )

        # Verify conversation and user message remain intact
        messages = message_service.list_messages(db_session, conv.id)
        assert len(messages) == 1
        assert messages[0].role == "user"
        assert messages[0].content == "Will fail due to LLM error."


# ── 8. API Router Endpoints Integration Tests ──────────────────────────────────


def test_sources_and_conversations_api_endpoints(
    client: TestClient, db_session: Session, v041_setup: dict
):
    """Full HTTP API test covering /sources and /conversations endpoints."""
    ws = v041_setup["ws_a"]

    # 1. Source upload via API
    file_payload = (
        "test_note.md",
        io.BytesIO(b"# API Note\n\nContent for API test."),
        "text/markdown",
    )
    res = client.post(
        f"/api/v1/workspaces/{ws.id}/sources/upload",
        files={"file": file_payload},
    )
    assert res.status_code == 201
    source_data = res.json()
    assert source_data["processing_status"] == "READY"
    source_id = source_data["id"]

    # 2. List sources
    res = client.get(f"/api/v1/workspaces/{ws.id}/sources")
    assert res.status_code == 200
    assert res.json()["total"] >= 1

    # 3. Get single source
    res = client.get(f"/api/v1/sources/{source_id}")
    assert res.status_code == 200
    assert res.json()["id"] == source_id

    # 4. Create conversation via API
    res = client.post(
        f"/api/v1/workspaces/{ws.id}/conversations",
        json={"title": "API Assistant Thread"},
    )
    assert res.status_code == 201
    conv_data = res.json()
    conv_id = conv_data["id"]

    # 5. Send message non-streaming
    provider_mock = MagicMock()
    provider_mock.generate.return_value = "API Answer with citation."
    provider_mock.provider_name.return_value = "api_mock"
    provider_mock.model_name.return_value = "mock"

    with patch.object(
        assistant_service.llm_service, "get_llm_provider", return_value=provider_mock
    ):
        res = client.post(
            f"/api/v1/conversations/{conv_id}/messages",
            json={"content": "Ask question via API", "stream": False},
        )
        assert res.status_code == 201
        msg_data = res.json()
        assert msg_data["user_message"]["content"] == "Ask question via API"
        assert msg_data["assistant_message"]["content"] == "API Answer with citation."

    # 6. List messages
    res = client.get(f"/api/v1/conversations/{conv_id}/messages")
    assert res.status_code == 200
    messages = res.json()
    assert len(messages) == 2

    # 7. Rename conversation
    res = client.patch(
        f"/api/v1/conversations/{conv_id}",
        json={"title": "Updated Title"},
    )
    assert res.status_code == 200
    assert res.json()["title"] == "Updated Title"

    # 8. Delete conversation
    res = client.delete(f"/api/v1/conversations/{conv_id}")
    assert res.status_code == 204
