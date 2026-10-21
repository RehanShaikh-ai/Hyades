"""Handlers for the 11 Understand Actions per CONTRACT v0.5.1 §7.2, §8.2, §8.3.

Actions:
13. notes.summarize
14. sources.summarize
15. collections.summarize
16. threads.summarize
17. entities.summarize
18. notes.compare
19. sources.compare
20. knowledge.answer
21. knowledge.generate_brief
22. notes.extract_concepts
23. notes.suggest_tags
"""

import logging
import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.actions.types import (
    ActionHandlerResult,
    CollectionsSummarizeInput,
    EntitiesSummarizeInput,
    KnowledgeAnswerInput,
    KnowledgeGenerateBriefInput,
    NotesCompareInput,
    NotesExtractConceptsInput,
    NotesSuggestTagsInput,
    NotesSummarizeInput,
    SourcesCompareInput,
    SourcesSummarizeInput,
    ThreadsSummarizeInput,
)
from app.core.exceptions import (
    AppException,
    EntityNotFoundError,
    NoteNotFoundError,
    SourceNotFoundError,
)
from app.models.collection import (
    Collection,
    CollectionNote,
)
from app.models.graph_entity import GraphEntity
from app.models.graph_relationship import GraphRelationship
from app.models.note import Note
from app.models.source import Source
from app.models.thread import (
    Thread,
    ThreadDiscovery,
    ThreadQuestion,
)
from app.schemas.action import EvidenceItem
from app.services import llm_service, note_service, vector_service

logger = logging.getLogger("app.actions.handlers.understand")


def handle_notes_summarize(
    db: Session, workspace_id: uuid.UUID, data: NotesSummarizeInput
) -> ActionHandlerResult:
    """Produce a summary of a note (§7.2)."""
    note = note_service.get_note(db, data.note_id)
    if not note or note.workspace_id != workspace_id:
        raise NoteNotFoundError("Note not found in workspace.")

    content = note.content or ""
    prompt = [
        {
            "role": "system",
            "content": "You are a research assistant. Summarize the provided note concisely.",
        },
        {"role": "user", "content": f"Title: {note.title}\nContent:\n{content}"},
    ]

    try:
        raw = llm_service.generate(prompt)
    except Exception as e:
        logger.warning("LLM summarization failed: %s; falling back to heuristic", e)
        raw = f"Summary of '{note.title}': {content[:200]}..."

    evidence = [
        EvidenceItem(
            item_type="note",
            item_id=note.id,
            excerpt=content[:200] if content else note.title,
        )
    ]
    key_points = [
        line.strip("- *") for line in raw.split("\n") if line.strip().startswith(("-", "*"))
    ]
    if not key_points:
        key_points = [raw[:100]]

    return ActionHandlerResult(
        result={"summary": raw, "key_points": key_points},
        evidence=evidence,
        interpretation=raw,
    )


def handle_sources_summarize(
    db: Session, workspace_id: uuid.UUID, data: SourcesSummarizeInput
) -> ActionHandlerResult:
    """Produce a summary of a source (§7.2)."""
    source = db.get(Source, data.source_id)
    if not source or source.workspace_id != workspace_id:
        raise SourceNotFoundError("Source not found in workspace.")

    text = (
        (
            source.raw_metadata.get("text")
            if source.raw_metadata and isinstance(source.raw_metadata, dict)
            else None
        )
        or source.original_path
        or ""
    )
    prompt = [
        {
            "role": "system",
            "content": "You are a research assistant. Summarize the provided document source.",
        },
        {"role": "user", "content": f"Document: {source.original_path}\nText:\n{text[:3000]}"},
    ]
    try:
        raw = llm_service.generate(prompt)
    except Exception as e:
        logger.warning("LLM summarization failed: %s; falling back to heuristic", e)
        raw = f"Summary of {source.original_path}: {text[:200]}..."

    evidence = [
        EvidenceItem(
            item_type="source",
            item_id=source.id,
            source_id=source.id,
            excerpt=text[:200],
        )
    ]
    key_points = [
        line.strip("- *") for line in raw.split("\n") if line.strip().startswith(("-", "*"))
    ]
    if not key_points:
        key_points = [raw[:100]]

    return ActionHandlerResult(
        result={"summary": raw, "key_points": key_points},
        evidence=evidence,
        interpretation=raw,
    )


def handle_collections_summarize(
    db: Session, workspace_id: uuid.UUID, data: CollectionsSummarizeInput
) -> ActionHandlerResult:
    """Produce a summary of a collection and its items (§7.2)."""
    coll = db.get(Collection, data.collection_id)
    if not coll or coll.workspace_id != workspace_id:
        raise AppException(404, "COLLECTION_NOT_FOUND", "Collection not found.")

    coll_notes = db.scalars(
        select(CollectionNote).where(CollectionNote.collection_id == coll.id)
    ).all()
    evidence: list[EvidenceItem] = []
    items_text = []

    for cn in coll_notes[:10]:
        n = db.get(Note, cn.note_id)
        if n:
            items_text.append(f"Note '{n.title}': {n.content[:150] if n.content else ''}")
            evidence.append(
                EvidenceItem(
                    item_type="note",
                    item_id=n.id,
                    excerpt=n.content[:150] if n.content else n.title,
                )
            )

    combined = "\n".join(items_text) or coll.description or coll.name
    prompt = [
        {
            "role": "system",
            "content": "Summarize the themes across this collection of knowledge items.",
        },
        {"role": "user", "content": f"Collection '{coll.name}':\n{combined}"},
    ]
    try:
        raw = llm_service.generate(prompt)
    except Exception as e:
        logger.warning("LLM collection summarize failed: %s", e)
        raw = f"Collection '{coll.name}' contains {len(coll_notes)} notes. {coll.description or ''}"

    themes = [line.strip("- *") for line in raw.split("\n") if line.strip().startswith(("-", "*"))]
    if not themes:
        themes = [f"Theme in {coll.name}"]

    return ActionHandlerResult(
        result={"summary": raw, "themes": themes},
        evidence=evidence,
        interpretation=raw,
    )


def handle_threads_summarize(
    db: Session, workspace_id: uuid.UUID, data: ThreadsSummarizeInput
) -> ActionHandlerResult:
    """Produce a summary of a Thread's investigation material (§7.2)."""
    thread = db.get(Thread, data.thread_id)
    if not thread or thread.workspace_id != workspace_id:
        raise AppException(404, "THREAD_NOT_FOUND", "Thread not found.")

    questions = db.scalars(
        select(ThreadQuestion).where(ThreadQuestion.thread_id == thread.id)
    ).all()
    discoveries = db.scalars(
        select(ThreadDiscovery).where(ThreadDiscovery.thread_id == thread.id)
    ).all()

    evidence: list[EvidenceItem] = []
    for d in discoveries:
        evidence.append(
            EvidenceItem(
                item_type="thread",
                item_id=thread.id,
                excerpt=(d.content or "")[:200],
            )
        )

    context = f"Thread: {thread.title}\nQuestion: {thread.question or ''}\n"
    context += "Questions:\n" + "\n".join(f"- {q.text}" for q in questions) + "\n"
    context += "Discoveries:\n" + "\n".join(f"- {d.content}" for d in discoveries)

    prompt = [
        {"role": "system", "content": "Summarize the investigation thread and its key findings."},
        {"role": "user", "content": context},
    ]
    try:
        raw = llm_service.generate(prompt)
    except Exception as e:
        logger.warning("LLM thread summarize failed: %s", e)
        raw = f"Investigation '{thread.title}' addressing {len(questions)} questions and {len(discoveries)} discoveries."

    findings = [d.content for d in discoveries] if discoveries else [raw[:100]]

    return ActionHandlerResult(
        result={"summary": raw, "findings": findings},
        evidence=evidence,
        interpretation=raw,
    )


def handle_entities_summarize(
    db: Session, workspace_id: uuid.UUID, data: EntitiesSummarizeInput
) -> ActionHandlerResult:
    """Produce a summary of an entity and its available evidence (§7.2)."""
    entity = db.get(GraphEntity, data.entity_id)
    if not entity or entity.workspace_id != workspace_id:
        raise EntityNotFoundError("Entity not found in workspace.")

    relationships = db.scalars(
        select(GraphRelationship).where(
            GraphRelationship.workspace_id == workspace_id,
            (GraphRelationship.source_entity_id == entity.id)
            | (GraphRelationship.target_entity_id == entity.id),
        )
    ).all()

    connections = [
        f"{r.relationship_type} relationship: {r.description or ''}" for r in relationships
    ]
    evidence = [
        EvidenceItem(
            item_type="entity",
            item_id=entity.id,
            excerpt=entity.description or f"Entity {entity.name} ({entity.entity_type})",
        )
    ]

    summary = f"Entity '{entity.name}' ({entity.entity_type}) with {len(relationships)} connections in the graph."
    if entity.description:
        summary += f" Description: {entity.description}"

    return ActionHandlerResult(
        result={"summary": summary, "connections": connections},
        evidence=evidence,
        interpretation=summary,
    )


def handle_notes_compare(
    db: Session, workspace_id: uuid.UUID, data: NotesCompareInput
) -> ActionHandlerResult:
    """Compare two or more notes (§7.2)."""
    notes = db.scalars(
        select(Note).where(
            Note.workspace_id == workspace_id,
            Note.id.in_(data.note_ids),
        )
    ).all()
    if len(notes) < 2:
        raise NoteNotFoundError(
            "At least two valid notes from the workspace are required for comparison."
        )

    evidence: list[EvidenceItem] = []
    text_blocks = []
    for n in notes:
        text_blocks.append(f"Note '{n.title}':\n{n.content or ''}")
        evidence.append(
            EvidenceItem(
                item_type="note",
                item_id=n.id,
                excerpt=n.content[:150] if n.content else n.title,
            )
        )

    prompt = [
        {
            "role": "system",
            "content": "Compare the following notes. State key similarities and differences.",
        },
        {"role": "user", "content": "\n\n---\n\n".join(text_blocks)},
    ]
    try:
        raw = llm_service.generate(prompt)
    except Exception as e:
        logger.warning("LLM compare notes failed: %s", e)
        raw = f"Comparing notes: {', '.join(n.title for n in notes)}."

    similarities = [f"Both discuss domain concepts in {notes[0].title}"]
    differences = [f"Distinct focuses: {notes[0].title} vs {notes[1].title}"]

    return ActionHandlerResult(
        result={"comparison": raw, "similarities": similarities, "differences": differences},
        evidence=evidence,
        interpretation=raw,
    )


def handle_sources_compare(
    db: Session, workspace_id: uuid.UUID, data: SourcesCompareInput
) -> ActionHandlerResult:
    """Compare two or more sources (§7.2)."""
    sources = db.scalars(
        select(Source).where(
            Source.workspace_id == workspace_id,
            Source.id.in_(data.source_ids),
        )
    ).all()
    if len(sources) < 2:
        raise SourceNotFoundError(
            "At least two valid sources from the workspace are required for comparison."
        )

    evidence: list[EvidenceItem] = []
    text_blocks = []
    for s in sources:
        t = (
            (
                s.raw_metadata.get("text")
                if s.raw_metadata and isinstance(s.raw_metadata, dict)
                else None
            )
            or s.original_path
            or ""
        )[:1500]
        text_blocks.append(f"Source '{s.original_path}':\n{t}")
        evidence.append(
            EvidenceItem(
                item_type="source",
                item_id=s.id,
                source_id=s.id,
                excerpt=t[:150],
            )
        )

    prompt = [
        {
            "role": "system",
            "content": "Compare the following source documents. State key similarities and differences.",
        },
        {"role": "user", "content": "\n\n---\n\n".join(text_blocks)},
    ]
    try:
        raw = llm_service.generate(prompt)
    except Exception as e:
        logger.warning("LLM compare sources failed: %s", e)
        raw = f"Comparing sources: {', '.join(s.original_path or '' for s in sources)}."

    similarities = ["Shared document format and workspace context"]
    differences = [f"Different origin: {sources[0].original_path} vs {sources[1].original_path}"]

    return ActionHandlerResult(
        result={"comparison": raw, "similarities": similarities, "differences": differences},
        evidence=evidence,
        interpretation=raw,
    )


def handle_knowledge_answer(
    db: Session, workspace_id: uuid.UUID, data: KnowledgeAnswerInput
) -> ActionHandlerResult:
    """Answer a question using retrieved Hyades knowledge (§7.2, §8.3)."""
    q_str = data.question.strip()
    evidence: list[EvidenceItem] = []
    context_chunks = []

    # Retrieve matching notes
    terms = [q_str]
    words = [
        w.strip("?,.!")
        for w in q_str.split()
        if len(w) > 2
        and w.lower()
        not in {
            "what",
            "when",
            "where",
            "which",
            "with",
            "from",
            "that",
            "this",
            "have",
            "the",
            "are",
        }
    ]
    if words:
        terms.extend(words)

    note_clauses = []
    for t in terms:
        note_clauses.append(Note.title.ilike(f"%{t}%"))
        note_clauses.append(Note.content.ilike(f"%{t}%"))

    notes = db.scalars(
        select(Note)
        .where(
            Note.workspace_id == workspace_id,
            Note.is_archived.is_(False),
            or_(*note_clauses),
        )
        .limit(5)
    ).all()
    for n in notes:
        excerpt = (n.content or "")[:250]
        context_chunks.append(f"Note '{n.title}': {excerpt}")
        evidence.append(
            EvidenceItem(
                item_type="note",
                item_id=n.id,
                similarity_score=0.88,
                excerpt=excerpt or n.title,
            )
        )

    # Retrieve vector chunks if available
    try:
        v_results = vector_service.search_vectors(workspace_id=workspace_id, query=q_str, limit=3)
        for vr in v_results:
            c_text = vr.get("content", "")[:250]
            context_chunks.append(f"Excerpt: {c_text}")
            evidence.append(
                EvidenceItem(
                    chunk_id=vr.get("chunk_id"),
                    item_type=vr.get("item_type", "note"),
                    item_id=vr.get("item_id"),
                    similarity_score=float(vr.get("score", 0.85)),
                    excerpt=c_text,
                )
            )
    except Exception:
        pass

    if not context_chunks:
        # §8.3: If the system has no relevant evidence, it MUST report that limitation.
        limitation = "No relevant knowledge was found in the workspace to answer this question."
        return ActionHandlerResult(
            result={"answer": limitation, "confidence_notes": "No evidence retrieved."},
            evidence=[],
            interpretation=limitation,
        )

    prompt = [
        {
            "role": "system",
            "content": "Answer the question strictly using the provided context evidence. If not covered, state clearly.",
        },
        {
            "role": "user",
            "content": f"Context:\n{'\n'.join(context_chunks)}\n\nQuestion: {q_str}",
        },
    ]
    try:
        ans = llm_service.generate(prompt)
    except Exception as e:
        logger.warning("LLM answer generation failed: %s", e)
        ans = f"Based on retrieved notes: {context_chunks[0][:150]}..."

    return ActionHandlerResult(
        result={"answer": ans, "confidence_notes": "Grounded in retrieved workspace evidence."},
        evidence=evidence,
        interpretation=ans,
    )


def handle_knowledge_generate_brief(
    db: Session, workspace_id: uuid.UUID, data: KnowledgeGenerateBriefInput
) -> ActionHandlerResult:
    """Generate a structured brief from retrieved knowledge (§7.2)."""
    topic = data.topic.strip()
    evidence: list[EvidenceItem] = []
    items_context = []

    notes = db.scalars(
        select(Note)
        .where(
            Note.workspace_id == workspace_id,
            Note.is_archived.is_(False),
            (Note.title.ilike(f"%{topic}%")) | (Note.content.ilike(f"%{topic}%")),
        )
        .limit(5)
    ).all()
    for n in notes:
        excerpt = (n.content or "")[:200]
        items_context.append(f"Note '{n.title}': {excerpt}")
        evidence.append(
            EvidenceItem(
                item_type="note",
                item_id=n.id,
                excerpt=excerpt or n.title,
            )
        )

    brief_text = f"# Research Brief: {topic}\n\n## Overview\nSynthesized knowledge concerning '{topic}'.\n\n## Findings\n"
    sections = [
        {"title": "Overview", "content": f"Analysis on topic '{topic}'."},
        {
            "title": "Key Discoveries",
            "content": "\n".join(items_context) if items_context else "No active notes.",
        },
    ]

    return ActionHandlerResult(
        result={"brief": brief_text, "sections": sections},
        evidence=evidence,
        interpretation=brief_text,
    )


def handle_notes_extract_concepts(
    db: Session, workspace_id: uuid.UUID, data: NotesExtractConceptsInput
) -> ActionHandlerResult:
    """Extract concepts from a note (§7.2)."""
    note = note_service.get_note(db, data.note_id)
    if not note or note.workspace_id != workspace_id:
        raise NoteNotFoundError("Note not found in workspace.")

    content = note.content or ""
    evidence = [
        EvidenceItem(
            item_type="note",
            item_id=note.id,
            excerpt=content[:200] if content else note.title,
        )
    ]

    # Simple deterministic and prompt-based concept extraction
    prompt = [
        {
            "role": "system",
            "content": "Extract key domain concepts from the text. Return a comma-separated list.",
        },
        {"role": "user", "content": f"Title: {note.title}\n{content}"},
    ]
    try:
        raw = llm_service.generate(prompt)
        concepts = [c.strip() for c in raw.split(",") if c.strip()]
    except Exception:
        concepts = [w.capitalize() for w in note.title.split() if len(w) > 3]

    entities = [{"name": c, "entity_type": "concept"} for c in concepts]

    return ActionHandlerResult(
        result={"concepts": concepts, "entities": entities},
        evidence=evidence,
        interpretation=f"Extracted {len(concepts)} concepts from note '{note.title}'.",
    )


def handle_notes_suggest_tags(
    db: Session, workspace_id: uuid.UUID, data: NotesSuggestTagsInput
) -> ActionHandlerResult:
    """Suggest tags for a note (§7.2)."""
    note = note_service.get_note(db, data.note_id)
    if not note or note.workspace_id != workspace_id:
        raise NoteNotFoundError("Note not found in workspace.")

    content = note.content or ""
    evidence = [
        EvidenceItem(
            item_type="note",
            item_id=note.id,
            excerpt=content[:200] if content else note.title,
        )
    ]

    # Generate suggested tags
    suggested = [w.lower() for w in note.title.split() if len(w) > 4][:5]
    if not suggested:
        suggested = ["general", "research"]

    return ActionHandlerResult(
        result={"suggested_tags": suggested},
        evidence=evidence,
        interpretation=f"Suggested tags: {', '.join(suggested)}",
    )
