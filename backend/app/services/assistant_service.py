"""AI Assistant orchestration service for persistent workspace conversations.

Canonical service per CONTRACT v0.4.1 §4.3, §6.3-§6.5, §8, §9.1-§9.4, §12.
Provides build_assistant_context, run_assistant, stream_assistant_response.
"""

import json
import logging
import time
import uuid
from collections.abc import Generator
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import (
    LLMProviderUnavailableError,
    LLMTimeoutError,
    ValidationError,
)
from app.models.content_chunk import ContentChunk
from app.models.message import Message
from app.models.message_citation import MessageCitation
from app.models.note import Note
from app.models.source import Source
from app.schemas.assistant import AssistantResponse
from app.schemas.message import MessageCitationResponse, MessageResponse
from app.services import (
    conversation_service,
    llm_service,
    message_service,
    rag_service,
    retrieval_service,
)

logger = logging.getLogger("app.services.assistant_service")


def build_assistant_context(
    db: Session,
    workspace_id: uuid.UUID,
    query: str,
    token_limit: int = 4096,
) -> tuple[str, list[dict[str, Any]], Any | None]:
    """Assemble context combining vector and graph retrieval per CONTRACT §9.3."""
    # 1. Vector retrieval (searches notes & sources in workspace)
    candidates = retrieval_service.search_semantic(
        db,
        workspace_id=workspace_id,
        query=query,
        limit=8,
        include_archived=False,
    )

    context_parts: list[str] = []
    accumulated_chars = 0
    char_limit = token_limit * 4

    candidate_citations_data: list[dict[str, Any]] = []

    for rank, item in enumerate(candidates, start=1):
        chunk_text = item.excerpt.strip()
        if not chunk_text:
            continue

        item_chars = len(chunk_text) + len(item.title) + 50
        if accumulated_chars + item_chars > char_limit and context_parts:
            break

        c_id = item.chunk_id or item.note_id or item.source_id or uuid.uuid4()
        score = max(0.0, min(1.0, float(item.score)))

        source_title = None
        note_title = None
        page_number = None

        if item.source_id:
            source = db.get(Source, item.source_id)
            if source:
                source_title = source.original_path.replace("\\", "/").split("/")[-1]
                page_number = source.page_count
        elif item.note_id:
            note = db.get(Note, item.note_id)
            if note:
                note_title = note.title

        candidate_citations_data.append(
            {
                "chunk_id": c_id,
                "note_id": item.note_id,
                "source_id": item.source_id,
                "workspace_id": workspace_id,
                "similarity_score": score,
                "rank": rank,
                "source_title": source_title or item.title,
                "note_title": note_title or item.title,
                "excerpt": chunk_text[:300],
                "page_number": page_number,
            }
        )

        source_type_label = "NOTE" if item.note_id else "SOURCE"
        item_id_str = str(item.note_id or item.source_id)
        part = f"=== {source_type_label}: {item.title} (ID: {item_id_str}) ===\n{chunk_text}\n"
        context_parts.append(part)
        accumulated_chars += item_chars

    context_text = "\n\n".join(context_parts)

    # 2. Graph retrieval
    candidate_chunk_ids = [c["chunk_id"] for c in candidate_citations_data if c.get("chunk_id")]
    graph_text, graph_ctx = rag_service.retrieve_graph_context(
        db, workspace_id, query, candidate_chunk_ids, max_hops=2
    )
    if graph_text:
        context_text = graph_text + context_text

    return context_text, candidate_citations_data, graph_ctx


def _build_history_messages(
    db: Session,
    conversation_id: uuid.UUID,
    limit: int = 10,
) -> list[dict[str, str]]:
    """Retrieve recent conversation messages bounded by CONVERSATION_HISTORY_LIMIT."""
    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    recent_messages = list(db.scalars(stmt).all())
    recent_messages.reverse()  # chronological order

    history_payloads: list[dict[str, str]] = []
    for m in recent_messages:
        if m.role in ("user", "assistant") and m.content:
            history_payloads.append({"role": m.role, "content": m.content})
    return history_payloads


def run_assistant(
    db: Session,
    conversation_id: uuid.UUID,
    content: str,
    stream: bool = False,
) -> AssistantResponse:
    """Run non-streaming assistant query and persist turns per CONTRACT §9.1, §9.2."""
    conv = conversation_service.get_conversation(db, conversation_id)

    clean_query = content.strip()
    if not clean_query:
        raise ValidationError("Message content cannot be empty.")

    # 1. Persist user message
    user_msg = message_service.create_message(
        db=db,
        conversation_id=conv.id,
        role="user",
        content=clean_query,
    )

    # 2. Build conversation history
    history_limit = getattr(settings, "CONVERSATION_HISTORY_LIMIT", 10)
    history = _build_history_messages(db, conv.id, limit=history_limit)
    # Exclude the just-added user message from history array to avoid duplication in prompt
    if history and history[-1]["content"] == clean_query:
        history = history[:-1]

    # 3. Context assembly (vector + graph)
    start_time = time.perf_counter()
    context_text, citations_data, _ = build_assistant_context(
        db,
        workspace_id=conv.workspace_id,
        query=clean_query,
        token_limit=settings.CONTEXT_TOKEN_LIMIT,
    )

    # 4. LLM Generation
    messages = rag_service.build_prompt(clean_query, context_text, history)
    try:
        provider = llm_service.get_llm_provider()
        answer = provider.generate(messages)
        provider_name = provider.provider_name()
        model_name = provider.model_name()
    except (LLMProviderUnavailableError, LLMTimeoutError) as e:
        logger.warning("LLM provider failed during assistant execution: %s", e)
        raise
    except Exception as e:
        logger.exception("Unexpected error during assistant generation: %s", e)
        raise LLMProviderUnavailableError(f"Assistant generation failed: {e}") from e

    latency_ms = int((time.perf_counter() - start_time) * 1000)

    # 5. Persist assistant message
    assistant_msg = message_service.create_message(
        db=db,
        conversation_id=conv.id,
        role="assistant",
        content=answer,
        provider=provider_name,
        model=model_name,
        latency_ms=latency_ms,
    )

    # 6. Persist citations
    created_citations: list[MessageCitationResponse] = []
    for cit_data in citations_data:
        # Check if chunk exists in ContentChunk table
        chunk_uuid = cit_data["chunk_id"]
        db_chunk = db.get(ContentChunk, chunk_uuid)
        if not db_chunk:
            continue

        citation = MessageCitation(
            id=uuid.uuid4(),
            message_id=assistant_msg.id,
            chunk_id=chunk_uuid,
            note_id=cit_data.get("note_id"),
            source_id=cit_data.get("source_id"),
            workspace_id=conv.workspace_id,
            similarity_score=cit_data["similarity_score"],
            rank=cit_data["rank"],
        )
        db.add(citation)
        created_citations.append(
            MessageCitationResponse(
                id=citation.id,
                message_id=assistant_msg.id,
                chunk_id=chunk_uuid,
                note_id=cit_data.get("note_id"),
                source_id=cit_data.get("source_id"),
                workspace_id=conv.workspace_id,
                similarity_score=cit_data["similarity_score"],
                rank=cit_data["rank"],
                source_title=cit_data.get("source_title"),
                note_title=cit_data.get("note_title"),
                excerpt=cit_data.get("excerpt"),
                page_number=cit_data.get("page_number"),
            )
        )

    db.commit()

    return AssistantResponse(
        user_message=MessageResponse(
            id=user_msg.id,
            conversation_id=user_msg.conversation_id,
            workspace_id=user_msg.workspace_id,
            role=user_msg.role,
            content=user_msg.content,
            created_at=user_msg.created_at,
            citations=[],
        ),
        assistant_message=MessageResponse(
            id=assistant_msg.id,
            conversation_id=assistant_msg.conversation_id,
            workspace_id=assistant_msg.workspace_id,
            role=assistant_msg.role,
            content=assistant_msg.content,
            provider=assistant_msg.provider,
            model=assistant_msg.model,
            latency_ms=assistant_msg.latency_ms,
            created_at=assistant_msg.created_at,
            citations=created_citations,
        ),
    )


def stream_assistant_response(
    db: Session,
    conversation_id: uuid.UUID,
    content: str,
) -> Generator[str, None, None]:
    """Stream assistant response via SSE with persistence per CONTRACT §9.2."""
    conv = conversation_service.get_conversation(db, conversation_id)

    clean_query = content.strip()
    if not clean_query:
        err_event = {
            "type": "error",
            "code": "VALIDATION_ERROR",
            "message": "Message content cannot be empty.",
        }
        yield f"data: {json.dumps(err_event)}\n\n"
        return

    # 1. Persist user message
    user_msg = message_service.create_message(
        db=db,
        conversation_id=conv.id,
        role="user",
        content=clean_query,
    )
    user_created_evt = {"type": "user_message_created", "message_id": str(user_msg.id)}
    yield f"data: {json.dumps(user_created_evt)}\n\n"

    # 2. Build history & context
    history_limit = getattr(settings, "CONVERSATION_HISTORY_LIMIT", 10)
    history = _build_history_messages(db, conv.id, limit=history_limit)
    if history and history[-1]["content"] == clean_query:
        history = history[:-1]

    start_time = time.perf_counter()
    context_text, citations_data, _ = build_assistant_context(
        db,
        workspace_id=conv.workspace_id,
        query=clean_query,
        token_limit=settings.CONTEXT_TOKEN_LIMIT,
    )

    # 3. Initialize LLM Provider
    try:
        provider = llm_service.get_llm_provider()
    except Exception as e:
        logger.warning("LLM provider unavailable: %s", e)
        err_event = {
            "type": "error",
            "code": "LLM_PROVIDER_UNAVAILABLE",
            "message": f"LLM provider unavailable: {e}",
        }
        yield f"data: {json.dumps(err_event)}\n\n"
        return

    # 4. Stream tokens & accumulate
    messages = rag_service.build_prompt(clean_query, context_text, history)
    accumulated_chunks: list[str] = []
    stream_failed = False
    failure_error: Exception | None = None

    try:
        for chunk in provider.generate_stream(messages):
            if chunk:
                accumulated_chunks.append(chunk)
                chunk_event = {"type": "chunk", "content": chunk}
                yield f"data: {json.dumps(chunk_event)}\n\n"
    except (LLMProviderUnavailableError, LLMTimeoutError) as e:
        stream_failed = True
        failure_error = e
        logger.warning("Streaming interrupted: %s", e)
    except Exception as e:
        stream_failed = True
        failure_error = e
        logger.exception("Unexpected error during assistant streaming: %s", e)

    full_content = "".join(accumulated_chunks)
    latency_ms = int((time.perf_counter() - start_time) * 1000)

    # 5. Persist assistant message (retaining partial content on stream failure §9.2)
    model_name = provider.model_name()
    if stream_failed:
        model_name = "stream_interrupted"

    assistant_msg = message_service.create_message(
        db=db,
        conversation_id=conv.id,
        role="assistant",
        content=full_content or "Generation interrupted.",
        provider=provider.provider_name(),
        model=model_name,
        latency_ms=latency_ms,
    )

    # 6. Persist citations
    created_citations: list[dict[str, Any]] = []
    for cit_data in citations_data:
        chunk_uuid = cit_data["chunk_id"]
        db_chunk = db.get(ContentChunk, chunk_uuid)
        if not db_chunk:
            continue

        citation = MessageCitation(
            id=uuid.uuid4(),
            message_id=assistant_msg.id,
            chunk_id=chunk_uuid,
            note_id=cit_data.get("note_id"),
            source_id=cit_data.get("source_id"),
            workspace_id=conv.workspace_id,
            similarity_score=cit_data["similarity_score"],
            rank=cit_data["rank"],
        )
        db.add(citation)
        created_citations.append(
            {
                "id": str(citation.id),
                "message_id": str(assistant_msg.id),
                "chunk_id": str(chunk_uuid),
                "note_id": str(cit_data.get("note_id")) if cit_data.get("note_id") else None,
                "source_id": str(cit_data.get("source_id")) if cit_data.get("source_id") else None,
                "workspace_id": str(conv.workspace_id),
                "similarity_score": cit_data["similarity_score"],
                "rank": cit_data["rank"],
                "source_title": cit_data.get("source_title"),
                "note_title": cit_data.get("note_title"),
                "excerpt": cit_data.get("excerpt"),
                "page_number": cit_data.get("page_number"),
            }
        )

    db.commit()

    if stream_failed:
        err_code = (
            "LLM_TIMEOUT"
            if isinstance(failure_error, LLMTimeoutError)
            else "LLM_PROVIDER_UNAVAILABLE"
        )
        err_event = {
            "type": "error",
            "code": err_code,
            "message": str(failure_error) if failure_error else "Stream interrupted.",
        }
        yield f"data: {json.dumps(err_event)}\n\n"
        return

    done_event = {
        "type": "done",
        "message_id": str(assistant_msg.id),
        "citations": created_citations,
        "provider": provider.provider_name(),
        "model": provider.model_name(),
    }
    yield f"data: {json.dumps(done_event)}\n\n"
