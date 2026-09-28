"""RAG pipeline service.

Canonical service per CONTRACT v0.3.1 §5.3, §10.1-§10.5.
Provides run_rag, assemble_context, build_prompt.
"""

import logging
import time
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import RAGContextEmptyError
from app.models.entity_chunk import EntityChunk
from app.models.graph_entity import GraphEntity
from app.schemas.graph_rag import (
    GraphRAGContext,
    GraphTraversedEntity,
    GraphUsedRelationship,
)
from app.schemas.rag import CitedSource, RAGRequest, RAGResponse
from app.schemas.search import SearchResultItem
from app.services import (
    graph_rag_service,
    llm_service,
    reranking_service,
    retrieval_service,
)

logger = logging.getLogger("app.services.rag_service")


def assemble_context(
    results: list[SearchResultItem],
    token_limit: int = 4096,
) -> tuple[str, list[CitedSource]]:
    """Assemble context text and cited sources bounded by token limit.

    Complies with CONTRACT §10.1, §10.3 and CONTRACT v0.4.1 §8.
    """
    context_parts: list[str] = []
    citations: list[CitedSource] = []
    accumulated_chars = 0
    char_limit = token_limit * 4

    for item in results:
        chunk_text = item.excerpt.strip()
        if not chunk_text:
            continue
        # Estimate char budget
        item_chars = len(chunk_text) + len(item.title) + 50
        if accumulated_chars + item_chars > char_limit and context_parts:
            break

        c_id = item.chunk_id or item.note_id or item.source_id or uuid.uuid4()
        citation = CitedSource(
            chunk_id=c_id,
            note_id=item.note_id,
            source_id=item.source_id,
            title=item.title,
            excerpt=chunk_text,
            score=item.score,
        )
        citations.append(citation)

        source_type_label = "NOTE" if item.note_id else "SOURCE"
        item_id_str = str(item.note_id or item.source_id)
        part = f"=== {source_type_label}: {item.title} (ID: {item_id_str}) ===\n{chunk_text}\n"
        context_parts.append(part)
        accumulated_chars += item_chars

    full_context = "\n\n".join(context_parts)
    return full_context, citations


def ground_citations(
    answer: str,
    candidate_citations: list[CitedSource],
    min_score: float | None = None,
) -> list[CitedSource]:
    """Map citations strictly to the evidence actually cited or used in the answer.

    Excludes retrieved candidate items that were not referenced or used as evidence,
    and orders citations by their appearance in the generated answer.
    """
    if not candidate_citations:
        return []

    eligible_citations = candidate_citations
    if min_score is not None:
        eligible_citations = [c for c in candidate_citations if c.score >= min_score]
    if not eligible_citations:
        return []

    cited: list[tuple[int, CitedSource]] = []
    seen_keys: set[str] = set()
    lower_answer = answer.lower()

    for item in eligible_citations:
        item_key = f"note:{item.note_id}" if item.note_id else f"source:{item.source_id}"
        if item_key in seen_keys:
            continue
        title_lower = item.title.strip().lower()
        if not title_lower:
            continue

        pos = lower_answer.find(title_lower)
        if pos != -1:
            cited.append((pos, item))
            seen_keys.add(item_key)

    if cited:
        # Sort by first appearance in the answer
        cited.sort(key=lambda x: x[0])
        return [c for _, c in cited]

    # If the LLM did not explicitly name note/source titles,
    # keep deduplicated candidates that passed threshold
    deduped: list[CitedSource] = []
    seen: set[str] = set()
    for c in eligible_citations:
        k = f"note:{c.note_id}" if c.note_id else f"source:{c.source_id}"
        if k not in seen:
            deduped.append(c)
            seen.add(k)
    return deduped


def build_prompt(
    query: str,
    context_text: str,
    history: list[dict[str, str]] | None = None,
) -> list[dict[str, str]]:
    """Construct prompt messages instructing model to ground answers in provided context."""
    system_prompt = (
        "You are an AI assistant for Knowledge Atlas, a collaborative second brain app.\n"
        "Your task is to answer user queries using ONLY the retrieved notes provided below.\n\n"
        "CRITICAL GROUNDING & CITATION RULES:\n"
        "1. STRICT GROUNDING: Ground your answer primarily in the provided note excerpts. "
        "Do not invent facts, attributes, or concepts that are absent from the notes.\n"
        "2. EXPLICIT NOTE CITATIONS: When discussing a concept from a note, explicitly cite the "
        "exact note title in brackets, e.g. [Machine Learning Fundamentals]. Only cite a note "
        "if its content directly supports your claim.\n"
        "3. EXCLUDE IRRELEVANT RETRIEVALS: If a retrieved note does not support the answer, "
        "DO NOT cite it or discuss it, even if it was included in the context.\n"
        "4. EVIDENCE VS INFERENCE: Clearly distinguish direct evidence stated in the notes from "
        "any inferences. If drawing an inference, explicitly state that it is an inference.\n"
        "5. RICH MARKDOWN FORMATTING: Structure your response cleanly using Markdown headings "
        "(##, ###), bullet lists (- or *), bold key phrases (**term**), inline code (`code`), "
        "and clear paragraph breaks."
    )
    messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]

    if history:
        for turn in history:
            role = turn.get("role")
            content = turn.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})

    user_content = (
        f"Context from retrieved knowledge base notes:\n"
        f"----------------------------------------\n"
        f"{context_text}\n"
        f"----------------------------------------\n\n"
        f"User Question: {query}\n\n"
        f"Please provide a grounded, well-structured answer following the rules above."
    )
    messages.append({"role": "user", "content": user_content})
    return messages


def retrieve_graph_context(
    db: Session,
    workspace_id: uuid.UUID,
    query: str,
    candidate_chunk_ids: list[uuid.UUID],
    max_hops: int = 2,
) -> tuple[str, Any]:
    """Perform multi-hop graph expansion for seed entities from retrieved chunks or query."""
    seed_entity_ids: list[uuid.UUID] = []

    # 1. Look up entities connected to the retrieved vector candidate chunks
    if candidate_chunk_ids:
        prov_rows = db.scalars(
            select(EntityChunk.entity_id).where(
                EntityChunk.workspace_id == workspace_id,
                EntityChunk.chunk_id.in_(candidate_chunk_ids),
            )
        ).all()
        seed_entity_ids.extend(list(set(prov_rows)))

    # 2. Look up entities matching query terms directly
    direct_entities = db.scalars(
        select(GraphEntity).where(
            GraphEntity.workspace_id == workspace_id,
            GraphEntity.name.ilike(f"%{query.strip()}%"),
        )
    ).all()
    for de in direct_entities:
        if de.id not in seed_entity_ids:
            seed_entity_ids.append(de.id)

    if not seed_entity_ids:
        return "", None

    try:
        traversed_entities, traversed_rels, hops = graph_rag_service.traverse_graph(
            db=db,
            workspace_id=workspace_id,
            entity_ids=seed_entity_ids,
            max_hops=max_hops,
        )
    except Exception as e:
        logger.warning("Graph traversal failed during RAG context assembly: %s", e)
        return "", None

    if not traversed_entities and not traversed_rels:
        return "", None

    entity_map = {e.id: e.name for e in traversed_entities}
    graph_lines: list[str] = ["=== KNOWLEDGE GRAPH EXPANSION CONTEXT ==="]
    if traversed_entities:
        graph_lines.append("Relevant Concepts & Entities:")
        for e in traversed_entities[:15]:
            desc = f": {e.description}" if e.description else ""
            graph_lines.append(f"- {e.name} ({e.entity_type}){desc}")

    if traversed_rels:
        graph_lines.append("Concept Relationships:")
        for r in traversed_rels[:20]:
            src = entity_map.get(r.source_entity_id, "Unknown")
            tgt = entity_map.get(r.target_entity_id, "Unknown")
            graph_lines.append(f"- {src} --[{r.relationship_type}]--> {tgt}")

    graph_context_text = "\n".join(graph_lines) + "\n\n"

    graph_ctx = GraphRAGContext(
        entities_traversed=[
            GraphTraversedEntity(id=e.id, name=e.name, entity_type=e.entity_type)
            for e in traversed_entities
        ],
        relationships_used=[
            GraphUsedRelationship(
                id=r.id,
                relationship_type=r.relationship_type,
                source=entity_map.get(r.source_entity_id, "Unknown"),
                target=entity_map.get(r.target_entity_id, "Unknown"),
            )
            for r in traversed_rels
        ],
        hops=hops,
    )

    return graph_context_text, graph_ctx


def stream_rag(
    db: Session,
    workspace_id: uuid.UUID,
    request: RAGRequest,
):
    """Stream RAG response chunks using real LLM token streaming and grounded citations."""
    start_time = time.perf_counter()

    # 1. Retrieval
    if request.search_mode == "semantic":
        candidates = retrieval_service.search_semantic(
            db, workspace_id, request.query, limit=request.context_limit
        )
    elif request.search_mode == "lexical":
        candidates = retrieval_service.search_lexical(
            db, workspace_id, request.query, limit=request.context_limit
        )
    else:
        candidates = retrieval_service.search_hybrid(
            db, workspace_id, request.query, limit=request.context_limit
        )

    # 2. Check empty context
    if not candidates:
        yield {
            "type": "error",
            "code": "RAG_CONTEXT_EMPTY",
            "message": "No relevant context found in workspace.",
        }
        return

    # 2b. Filter out candidates failing minimum relevance score
    if settings.RAG_MIN_RELEVANCE_SCORE is not None:
        passed_candidates = [
            c
            for c in candidates
            if not (
                c.score_meaning == "cosine_similarity"
                and c.score < settings.RAG_MIN_RELEVANCE_SCORE
            )
        ]
        if not passed_candidates and candidates:
            no_info_msg = (
                "The knowledge base does not contain sufficiently relevant information "
                f"to answer your question regarding '{request.query}'. "
                "Please add notes covering this topic or try a different question."
            )
            yield {"type": "chunk", "content": no_info_msg}
            yield {
                "type": "done",
                "citations": [],
                "graph_context": None,
                "provider": "assistant",
                "model": "grounded_retrieval",
                "latency_ms": int((time.perf_counter() - start_time) * 1000),
            }
            return
        candidates = passed_candidates

    # 3. Optional reranking
    if request.rerank:
        try:
            candidates = reranking_service.rerank(request.query, candidates)
        except Exception as e:
            logger.warning("Reranking failed or unavailable: %s", e)

    # 4. Context assembly
    context_text, candidate_citations = assemble_context(
        candidates, token_limit=settings.CONTEXT_TOKEN_LIMIT
    )
    if not candidate_citations:
        yield {
            "type": "error",
            "code": "RAG_CONTEXT_EMPTY",
            "message": "No text content could be extracted for context.",
        }
        return

    # 4b. Perform graph expansion when useful
    candidate_chunk_ids = [c.chunk_id for c in candidates if c.chunk_id]
    graph_text, graph_ctx = retrieve_graph_context(
        db, workspace_id, request.query, candidate_chunk_ids, max_hops=request.max_hops
    )
    if graph_text:
        context_text = graph_text + context_text

    note_count = len(candidate_citations)
    sfx = "s" if note_count != 1 else ""
    unavailable_msg = f"{note_count} relevant note{sfx} found · AI generation unavailable"

    # 5. Check LLM provider availability
    try:
        from app.core.exceptions import LLMProviderUnavailableError, LLMTimeoutError

        provider = llm_service.get_llm_provider(model=request.model)
    except Exception as e:
        logger.warning("LLM provider unavailable for stream: %s", e)
        yield {
            "type": "ai_unavailable",
            "note_count": note_count,
            "citations": [c.model_dump(mode="json") for c in candidate_citations],
            "graph_context": graph_ctx.model_dump(mode="json") if graph_ctx else None,
            "message": unavailable_msg,
        }
        return

    # 6. Stream tokens
    messages = build_prompt(request.query, context_text, request.history)
    accumulated_chunks: list[str] = []

    try:
        for chunk in provider.generate_stream(messages):
            if chunk:
                accumulated_chunks.append(chunk)
                yield {"type": "chunk", "content": chunk}
    except (LLMProviderUnavailableError, LLMTimeoutError) as e:
        logger.warning("LLM streaming failed: %s", e)
        if not accumulated_chunks:
            yield {
                "type": "ai_unavailable",
                "note_count": note_count,
                "citations": [c.model_dump(mode="json") for c in candidate_citations],
                "graph_context": graph_ctx.model_dump(mode="json") if graph_ctx else None,
                "message": unavailable_msg,
            }
            return
        yield {
            "type": "error",
            "code": "LLM_STREAM_INTERRUPTED",
            "message": f"Stream interrupted: {e}",
        }
        return
    except Exception as e:
        logger.exception("Unexpected error during LLM streaming: %s", e)
        if not accumulated_chunks:
            yield {
                "type": "ai_unavailable",
                "note_count": note_count,
                "citations": [c.model_dump(mode="json") for c in candidate_citations],
                "graph_context": graph_ctx.model_dump(mode="json") if graph_ctx else None,
                "message": unavailable_msg,
            }
            return
        yield {
            "type": "error",
            "code": "LLM_STREAM_ERROR",
            "message": str(e),
        }
        return

    full_answer = "".join(accumulated_chunks)
    grounded = ground_citations(full_answer, candidate_citations)
    latency = int((time.perf_counter() - start_time) * 1000)

    yield {
        "type": "done",
        "citations": [c.model_dump(mode="json") for c in grounded],
        "graph_context": graph_ctx.model_dump(mode="json") if graph_ctx else None,
        "provider": provider.provider_name(),
        "model": provider.model_name(),
        "latency_ms": latency,
    }


def run_rag(
    db: Session,
    workspace_id: uuid.UUID,
    request: RAGRequest,
) -> RAGResponse:
    """Run full RAG pipeline per CONTRACT §10.1."""
    start_time = time.perf_counter()

    # 1. Retrieval
    if request.search_mode == "semantic":
        candidates = retrieval_service.search_semantic(
            db, workspace_id, request.query, limit=request.context_limit
        )
    elif request.search_mode == "lexical":
        candidates = retrieval_service.search_lexical(
            db, workspace_id, request.query, limit=request.context_limit
        )
    else:
        candidates = retrieval_service.search_hybrid(
            db, workspace_id, request.query, limit=request.context_limit
        )

    # 2. Check empty context
    if not candidates:
        raise RAGContextEmptyError("No relevant context found in workspace.")

    # 2b. Filter out candidates failing minimum relevance score
    if settings.RAG_MIN_RELEVANCE_SCORE is not None:
        passed_candidates = [
            c
            for c in candidates
            if not (
                c.score_meaning == "cosine_similarity"
                and c.score < settings.RAG_MIN_RELEVANCE_SCORE
            )
        ]
        if not passed_candidates and candidates:
            no_info_msg = (
                "The knowledge base does not contain sufficiently relevant information "
                f"to answer your question regarding '{request.query}'. "
                "Please add notes covering this topic or try a different question."
            )
            return RAGResponse(
                answer=no_info_msg,
                citations=[],
                graph_context=None,
                context_chunk_count=0,
                provider="assistant",
                model="grounded_retrieval",
                latency_ms=int((time.perf_counter() - start_time) * 1000),
                reranking_applied=False,
                pending_ai_edit=None,
                ai_unavailable=False,
            )
        candidates = passed_candidates

    # 3. Optional reranking
    reranked = False
    if request.rerank:
        try:
            candidates = reranking_service.rerank(request.query, candidates)
            reranked = True
        except Exception as e:
            logger.warning("Reranking failed or unavailable: %s", e)
            reranked = False

    # 4. Context assembly
    context_text, candidate_citations = assemble_context(
        candidates, token_limit=settings.CONTEXT_TOKEN_LIMIT
    )
    if not candidate_citations:
        raise RAGContextEmptyError("No text content could be extracted for context.")

    # 4b. Perform graph expansion when useful
    candidate_chunk_ids = [c.chunk_id for c in candidates if c.chunk_id]
    graph_text, graph_ctx = retrieve_graph_context(
        db, workspace_id, request.query, candidate_chunk_ids, max_hops=request.max_hops
    )
    if graph_text:
        context_text = graph_text + context_text

    # 5. Build prompt & LLM generation
    messages = build_prompt(request.query, context_text, request.history)

    try:
        from app.core.exceptions import LLMProviderUnavailableError, LLMTimeoutError

        provider = llm_service.get_llm_provider(model=request.model)
        answer = provider.generate(messages)
        grounded = ground_citations(answer, candidate_citations)
        provider_name = provider.provider_name()
        model_name = provider.model_name()
        ai_unavailable = False
    except (LLMProviderUnavailableError, LLMTimeoutError) as e:
        logger.warning("AI generation unavailable: %s", e)
        n_notes = len(candidate_citations)
        suffix = "s" if n_notes != 1 else ""
        answer = f"{n_notes} relevant note{suffix} found · AI generation unavailable"
        grounded = candidate_citations
        provider_name = "none"
        model_name = "none"
        ai_unavailable = True

    latency = int((time.perf_counter() - start_time) * 1000)

    return RAGResponse(
        answer=answer,
        citations=grounded,
        graph_context=graph_ctx,
        context_chunk_count=len(grounded),
        provider=provider_name,
        model=model_name,
        latency_ms=latency,
        reranking_applied=reranked,
        pending_ai_edit=None,
        ai_unavailable=ai_unavailable,
    )
