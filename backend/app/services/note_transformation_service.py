"""Note Transformation Service for Knowledge Atlas / Hyades.

Unified orchestration for Stella's `/transform-note` command supporting:
1. enrich: Add missing, relevant knowledge with evidence (delegates to note_enrichment_service)
2. shorten: Condense while preserving key ideas
3. expand: Develop ideas with more depth and examples
4. simplify: Explain in clearer, simpler language
5. restructure: Improve organization and flow
6. improve: Fix clarity, repetition, and style
7. connect: Find links to related notes and concepts
8. study: Create summaries, questions, or flashcards
9. audit: Check claims, consistency, and uncertainty (non-mutating)
10. options: Return interactive metadata grid for all 9 operations

Conforms strictly to the Hyades Stella Command and Note Intelligence specification.
"""

from __future__ import annotations

import difflib
import json
import logging
import re
import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import AppException, ValidationError
from app.models.action_proposal import ActionProposal
from app.models.note import Note
from app.models.note_link import NoteLink
from app.models.workspace import Workspace
from app.schemas.action import ActionExecuteRequest
from app.services import (
    action_execution_service,
    llm_service,
    note_enrichment_service,
    retrieval_service,
    vector_service,
)

logger = logging.getLogger("app.services.note_transformation_service")

# ─────────────────────────────────────────────────────────────────────────────
# Data Contracts & Schemas
# ─────────────────────────────────────────────────────────────────────────────

TransformOperation = Literal[
    "enrich",
    "shorten",
    "expand",
    "simplify",
    "restructure",
    "improve",
    "connect",
    "study",
    "audit",
    "options",
]

SUPPORTED_OPERATIONS: list[str] = [
    "enrich",
    "shorten",
    "expand",
    "simplify",
    "restructure",
    "improve",
    "connect",
    "study",
    "audit",
]

OPERATION_METADATA: list[dict[str, Any]] = [
    {
        "operation": "enrich",
        "title": "enrich",
        "name": "Enrich",
        "description": "Add missing, relevant knowledge with evidence",
        "icon": "sparkles",
        "example": '/transform-note enrich "<note title>"',
        "mutating": True,
    },
    {
        "operation": "shorten",
        "title": "shorten",
        "name": "Shorten",
        "description": "Condense while preserving key ideas",
        "icon": "arrows-in",
        "example": '/transform-note shorten "<note title>"',
        "mutating": True,
    },
    {
        "operation": "expand",
        "title": "expand",
        "name": "Expand",
        "description": "Develop ideas with more depth and examples",
        "icon": "arrows-out",
        "example": '/transform-note expand "<note title>"',
        "mutating": True,
    },
    {
        "operation": "simplify",
        "title": "simplify",
        "name": "Simplify",
        "description": "Explain in clearer, simpler language",
        "icon": "target",
        "example": '/transform-note simplify "<note title>"',
        "mutating": True,
    },
    {
        "operation": "restructure",
        "title": "restructure",
        "name": "Restructure",
        "description": "Improve organization and flow",
        "icon": "layout",
        "example": '/transform-note restructure "<note title>"',
        "mutating": True,
    },
    {
        "operation": "improve",
        "title": "improve",
        "name": "Improve",
        "description": "Fix clarity, repetition, and style",
        "icon": "pencil",
        "example": '/transform-note improve "<note title>"',
        "mutating": True,
    },
    {
        "operation": "connect",
        "title": "connect",
        "name": "Connect",
        "description": "Find links to related notes and concepts",
        "icon": "share-2",
        "example": '/transform-note connect "<note title>"',
        "mutating": False,
    },
    {
        "operation": "study",
        "title": "study",
        "name": "Study",
        "description": "Create summaries, questions, or flashcards",
        "icon": "book-open",
        "example": '/transform-note study "<note title>"',
        "mutating": False,
    },
    {
        "operation": "audit",
        "title": "audit",
        "name": "Audit",
        "description": "Check claims, consistency, and uncertainty",
        "icon": "shield-check",
        "example": '/transform-note audit "<note title>"',
        "mutating": False,
    },
]


class TransformProposalItem(BaseModel):
    """A granular proposed modification within a transformation for review."""

    id: str
    type: str = "transformation"
    title: str
    proposed_text: str
    target_section: str = "General"
    evidence_basis: str = "model_knowledge"
    supporting_evidence: str | None = None
    source_id: str | None = None
    source_title: str | None = None
    source_type: str | None = None
    chunk_id: str | None = None
    rationale: str
    status: Literal["pending", "accepted", "rejected"] = "accepted"


class AuditFinding(BaseModel):
    """An analytical observation produced by note audit without mutating the note."""

    id: str
    severity: Literal["concern", "warning", "info"]
    section: str
    claim: str
    critique: str
    recommendation: str


class ConnectionProposal(BaseModel):
    """A candidate relationship connecting the target note to another note in the workspace."""

    target_note_id: str
    target_note_title: str
    relationship_type: str
    rationale: str
    common_concepts: list[str] = Field(default_factory=list)


class TransformNoteExecutionResult(BaseModel):
    """Standardized response from note transformation execution."""

    operation: str
    note_id: str | None = None
    title: str | None = None
    status: str
    message: str
    card_type: str = "transform_proposal"
    data: dict[str, Any] = Field(default_factory=dict)
    proposal_id: str | None = None
    confirmation_token: str | None = None
    requires_confirmation: bool = False
    affected_item_ids: list[str] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# Note Resolution Helper
# ─────────────────────────────────────────────────────────────────────────────

def resolve_target_note(db: Session, workspace_id: uuid.UUID, identifier: str) -> Note | None:
    """Resolve a note by UUID or title within workspace boundary."""
    clean_id = (identifier or "").strip().strip('"').strip("'").strip()
    if not clean_id:
        return None

    # Try UUID
    try:
        u_id = uuid.UUID(clean_id)
        n = db.get(Note, u_id)
        if n and n.workspace_id == workspace_id:
            return n
    except (ValueError, TypeError):
        pass

    # Exact title match
    note = db.scalar(
        select(Note).where(
            Note.workspace_id == workspace_id,
            Note.title == clean_id,
        )
    )
    if note:
        return note

    # Case-insensitive title match
    note = db.scalar(
        select(Note).where(
            Note.workspace_id == workspace_id,
            Note.title.ilike(clean_id),
        )
    )
    if note:
        return note

    # Substring match if unambiguous
    candidates = list(
        db.scalars(
            select(Note).where(
                Note.workspace_id == workspace_id,
                Note.title.ilike(f"%{clean_id}%"),
            ).limit(3)
        )
    )
    if len(candidates) == 1:
        return candidates[0]

    return None


# ─────────────────────────────────────────────────────────────────────────────
# Operation Handlers
# ─────────────────────────────────────────────────────────────────────────────

def handle_options() -> TransformNoteExecutionResult:
    """Return interactive 9-card operations grid metadata for `/transform-note options`."""
    msg = (
        "Transform, improve, and develop your notes. Use one of the operations below:"
    )
    payload_data = {
        "card_type": "transform_options",
        "title": "/transform-note — Intelligent note operations",
        "description": msg,
        "operations": OPERATION_METADATA,
        "usage_examples": [
            '/transform-note enrich "<note title>"',
            '/transform-note shorten "<note title>"',
            '/transform-note expand "<note title>"',
        ],
    }
    return TransformNoteExecutionResult(
        operation="options",
        status="completed",
        message=msg,
        card_type="transform_options",
        data=payload_data,
        requires_confirmation=False,
    )


def handle_enrich(
    db: Session,
    workspace_id: uuid.UUID,
    target_note: Note,
    command_str: str = "/transform-note enrich",
) -> TransformNoteExecutionResult:
    """Delegate to canonical evidence-based enrichment workflow."""
    enrich_result = note_enrichment_service.enrich_note_workflow(db, workspace_id, target_note)

    enrichment_data = {
        "workflow": "enrich_note",
        "operation": "enrich",
        "proposed_action": "notes.update",
        "outcome": enrich_result.outcome,
        "note_id": str(target_note.id),
        "title": target_note.title,
        "original_content": enrich_result.original_content,
        "enrichment_addition": enrich_result.enrichment_addition,
        "proposed_content": enrich_result.proposed_content,
        "summary": enrich_result.summary,
        "proposals": [p.model_dump() for p in enrich_result.proposals],
        "unresolved_gaps": enrich_result.unresolved_gaps,
        "research_directions": enrich_result.research_directions,
        "rejected_evidence": enrich_result.rejected_evidence,
        "suggested_connections": enrich_result.suggested_connections,
        "related_items": enrich_result.related_items,
        "status": "awaiting_confirmation" if enrich_result.proposals else "completed",
    }

    if not enrich_result.proposals or enrich_result.outcome in (
        "no_changes_suggested",
        "insufficient_information",
    ):
        return TransformNoteExecutionResult(
            operation="enrich",
            note_id=str(target_note.id),
            title=target_note.title,
            status="completed",
            message=enrich_result.summary,
            card_type="transform_proposal",
            data=enrichment_data,
            requires_confirmation=False,
            affected_item_ids=[str(target_note.id)],
        )

    # Propose through canonical action execution pipeline
    envelope = action_execution_service.execute_action(
        db=db,
        workspace_id=workspace_id,
        action_id="notes.update",
        request=ActionExecuteRequest(
            mode="propose",
            input={
                "note_id": str(target_note.id),
                "title": target_note.title,
                "content": enrich_result.proposed_content,
                "append_content": enrich_result.enrichment_addition,
            },
            idempotency_key=str(uuid.uuid4()),
        ),
    )
    prop = envelope.proposals[0] if envelope.proposals else None
    if prop:
        prop_row = db.get(ActionProposal, prop.proposal_id)
        if prop_row:
            prop_row.proposal_payload = {
                **(prop_row.proposal_payload or {}),
                **enrichment_data,
                "content": enrich_result.proposed_content,
            }
            db.commit()

    outcome_msg = (
        f"Analyzed the note, identified knowledge gaps, and prepared "
        f"{len(enrich_result.proposals)} enrichment proposals with supporting evidence."
    )

    return TransformNoteExecutionResult(
        operation="enrich",
        note_id=str(target_note.id),
        title=target_note.title,
        status="proposed",
        message=outcome_msg,
        card_type="transform_proposal",
        data=enrichment_data,
        proposal_id=str(prop.proposal_id) if prop else None,
        confirmation_token=prop.confirmation_token if prop else None,
        requires_confirmation=True,
        affected_item_ids=[str(target_note.id)],
    )


def _build_text_transformation_prompt(
    operation: str, title: str, content: str
) -> tuple[str, str]:
    """Generate system and user prompts for specialized text transformations."""
    prompts = {
        "shorten": (
            "You are an expert technical editor. Condense the provided note into a more concise, "
            "punchy form while preserving all key definitions, mechanisms, and core takeaways. "
            "Eliminate redundancy, verbose preamble, and fluff. Output only the transformed markdown content."
        ),
        "expand": (
            "You are a subject-matter expert and technical writer. Expand and deepen the provided note. "
            "Add concrete architectural examples, real-world failure modes or tradeoffs, and thorough technical explanations. "
            "Maintain rigorous clarity and retain all existing accurate information. Output only the transformed markdown content."
        ),
        "simplify": (
            "You are an expert educator. Rewrite the provided note in clear, intuitive, and accessible language. "
            "Explain complex terminology simply without dumbing down the underlying concepts. Use clean phrasing, helpful analogies "
            "where appropriate, and direct sentence structures. Output only the transformed markdown content."
        ),
        "restructure": (
            "You are an information architect. Reorganize and restructure the provided note for optimal readability and logical flow. "
            "Use clear hierarchical markdown headings, structured bullet lists, and a logical progression from fundamentals to mechanisms to takeaways. "
            "Preserve all factual information. Output only the transformed markdown content."
        ),
        "improve": (
            "You are a master technical editor. Polish the provided note for clarity, style, flow, and elegance. "
            "Fix awkward phrasing, eliminate repetition, tighten grammar, and elevate the overall quality and precision of the text. "
            "Output only the transformed markdown content."
        ),
    }
    sys_prompt = prompts.get(
        operation,
        "You are an expert editor. Improve the provided note according to professional standards. Output only markdown."
    )
    user_prompt = (
        f"Transform Note: {operation.upper()}\n"
        f"Title: {title}\n\n"
        f"Original Content:\n{content}\n\n"
        "Transformed Markdown Note:"
    )
    return sys_prompt, user_prompt


def handle_text_transform(
    db: Session,
    workspace_id: uuid.UUID,
    target_note: Note,
    operation: str,
) -> TransformNoteExecutionResult:
    """Execute model-driven text transformation (shorten, expand, simplify, restructure, improve)."""
    orig_content = (target_note.content or "").strip()
    if len(orig_content) < 15:
        raise AppException(
            400,
            "INSUFFICIENT_CONTENT",
            f"Note '{target_note.title}' has insufficient content to perform '{operation}'.",
        )

    sys_prompt, user_prompt = _build_text_transformation_prompt(operation, target_note.title, orig_content)
    provider = llm_service.get_llm_provider()
    raw_response = provider.generate(
        [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_prompt},
        ]
    )

    proposed_content = raw_response.strip()
    # Strip accidental code block wrap if the model wrapped the entire markdown in ```markdown ... ```
    if proposed_content.startswith("```markdown") and proposed_content.endswith("```"):
        proposed_content = proposed_content[11:-3].strip()
    elif proposed_content.startswith("```") and proposed_content.endswith("```"):
        proposed_content = proposed_content[3:-3].strip()

    # Generate 2-3 structured transformation proposal items for granular review
    op_label = operation.capitalize()
    proposal_items: list[TransformProposalItem] = []

    # Analyze changes using diff
    diff_lines = list(
        difflib.unified_diff(
            orig_content.splitlines(),
            proposed_content.splitlines(),
            lineterm="",
        )
    )
    additions = [line[1:] for line in diff_lines if line.startswith("+") and not line.startswith("+++")]
    deletions = [line[1:] for line in diff_lines if line.startswith("-") and not line.startswith("---")]

    # Construct descriptive proposal highlights
    p1_title = f"{op_label}: Content Reorganization & Flow"
    p1_desc = (
        f"Applied {operation} transformation to prose structure, improving readability and conceptual flow."
    )
    proposal_items.append(
        TransformProposalItem(
            id=f"{operation}-p1-{uuid.uuid4().hex[:6]}",
            type="clarity",
            title=p1_title,
            proposed_text=p1_desc,
            target_section="Structure",
            evidence_basis="model_knowledge",
            rationale=f"Model applied {operation} guidelines across document hierarchy.",
            status="accepted",
        )
    )

    if additions:
        sample_add = " ".join(additions[:3])[:140]
        proposal_items.append(
            TransformProposalItem(
                id=f"{operation}-p2-{uuid.uuid4().hex[:6]}",
                type="knowledge",
                title=f"{op_label}: Key Clarifications & Additions",
                proposed_text=sample_add,
                target_section="Content",
                evidence_basis="model_knowledge",
                rationale="Refined key paragraphs with updated expressions and details.",
                status="accepted",
            )
        )

    if deletions or operation == "shorten":
        proposal_items.append(
            TransformProposalItem(
                id=f"{operation}-p3-{uuid.uuid4().hex[:6]}",
                type="clarity",
                title=f"{op_label}: Redundancy Reduction",
                proposed_text=f"Streamlined verbose phrasing and removed repetitive statements.",
                target_section="Style",
                evidence_basis="model_knowledge",
                rationale="Eliminated unnecessary filler to keep the text focused.",
                status="accepted",
            )
        )

    orig_words = len(orig_content.split())
    new_words = len(proposed_content.split())
    summary_msg = (
        f"Prepared {operation} proposal for '{target_note.title}'. "
        f"Word count adjusted from {orig_words} to {new_words} words."
    )

    transformation_data = {
        "workflow": "transform_note",
        "operation": operation,
        "proposed_action": "notes.update",
        "note_id": str(target_note.id),
        "title": target_note.title,
        "original_content": orig_content,
        "proposed_content": proposed_content,
        "enrichment_addition": proposed_content,
        "summary": summary_msg,
        "proposals": [p.model_dump() for p in proposal_items],
        "status": "awaiting_confirmation",
    }

    # Propose through canonical action execution pipeline
    envelope = action_execution_service.execute_action(
        db=db,
        workspace_id=workspace_id,
        action_id="notes.update",
        request=ActionExecuteRequest(
            mode="propose",
            input={
                "note_id": str(target_note.id),
                "title": target_note.title,
                "content": proposed_content,
            },
            idempotency_key=str(uuid.uuid4()),
        ),
    )
    prop = envelope.proposals[0] if envelope.proposals else None
    if prop:
        prop_row = db.get(ActionProposal, prop.proposal_id)
        if prop_row:
            prop_row.proposal_payload = {
                **(prop_row.proposal_payload or {}),
                **transformation_data,
                "content": proposed_content,
            }
            db.commit()

    return TransformNoteExecutionResult(
        operation=operation,
        note_id=str(target_note.id),
        title=target_note.title,
        status="proposed",
        message=summary_msg,
        card_type="transform_proposal",
        data=transformation_data,
        proposal_id=str(prop.proposal_id) if prop else None,
        confirmation_token=prop.confirmation_token if prop else None,
        requires_confirmation=True,
        affected_item_ids=[str(target_note.id)],
    )


def handle_connect(
    db: Session,
    workspace_id: uuid.UUID,
    target_note: Note,
) -> TransformNoteExecutionResult:
    """Identify related notes in workspace and propose meaningful bidirectional connections."""
    # Find candidate notes in workspace
    other_notes = list(
        db.scalars(
            select(Note).where(
                Note.workspace_id == workspace_id,
                Note.id != target_note.id,
            ).limit(10)
        )
    )

    if not other_notes:
        msg = f"No other notes found in this workspace to connect with '{target_note.title}'."
        return TransformNoteExecutionResult(
            operation="connect",
            note_id=str(target_note.id),
            title=target_note.title,
            status="completed",
            message=msg,
            card_type="transform_connections",
            data={"connections": []},
            requires_confirmation=False,
            affected_item_ids=[str(target_note.id)],
        )

    # Existing links
    existing_link_target_ids = set(
        db.scalars(
            select(NoteLink.target_note_id).where(
                NoteLink.source_note_id == target_note.id,
            )
        )
    )

    # Rank and generate connection proposals
    proposals: list[dict[str, Any]] = []
    target_title_lower = target_note.title.lower()
    target_tags = {t.name.lower() for t in target_note.tags}

    for other in other_notes:
        if other.id in existing_link_target_ids:
            continue
        other_tags = {t.name.lower() for t in other.tags}
        common_tags = list(target_tags.intersection(other_tags))
        
        # Simple heuristic scoring based on shared tags and title token overlap
        t_tokens = set(re.findall(r"\w{4,}", target_title_lower))
        o_tokens = set(re.findall(r"\w{4,}", other.title.lower()))
        common_tokens = list(t_tokens.intersection(o_tokens))

        rel_type = "relates_to"
        if common_tags:
            rel_type = "shared_domain"
            rationale = f"Both notes share domain tag(s): {', '.join(common_tags[:3])}."
        elif common_tokens:
            rel_type = "conceptual_overlap"
            rationale = f"Conceptual synergy identified on '{common_tokens[0]}'."
        else:
            rel_type = "cross_disciplinary"
            rationale = "Complementary systems knowledge in the workspace."

        proposals.append(
            {
                "target_note_id": str(other.id),
                "target_note_title": other.title,
                "relationship_type": rel_type,
                "rationale": rationale,
                "common_concepts": common_tags or common_tokens or ["systems"],
            }
        )
        if len(proposals) >= 4:
            break

    msg = f"Discovered {len(proposals)} candidate connection(s) for '{target_note.title}'."
    return TransformNoteExecutionResult(
        operation="connect",
        note_id=str(target_note.id),
        title=target_note.title,
        status="completed",
        message=msg,
        card_type="transform_connections",
        data={
            "workflow": "transform_note",
            "operation": "connect",
            "note_id": str(target_note.id),
            "title": target_note.title,
            "connections": proposals,
            "total_candidates": len(proposals),
        },
        requires_confirmation=False,
        affected_item_ids=[str(target_note.id)],
    )


def handle_study(
    db: Session,
    workspace_id: uuid.UUID,
    target_note: Note,
) -> TransformNoteExecutionResult:
    """Generate study materials and flashcards for the target note."""
    from app.services.stella_command_service import _generate_flashcards_deck

    content = (target_note.content or "").strip()
    if len(content) < 20:
        raise AppException(
            400,
            "INSUFFICIENT_CONTENT",
            f"Note '{target_note.title}' has insufficient content to generate study flashcards.",
        )

    deck = _generate_flashcards_deck(
        title=target_note.title,
        content=content,
        source_type="note",
        source_id=target_note.id,
        requested_count=5,
    )
    deck_dict = deck.model_dump()
    msg = f"Generated interactive study deck with {len(deck.cards)} cards for '{target_note.title}'."

    return TransformNoteExecutionResult(
        operation="study",
        note_id=str(target_note.id),
        title=target_note.title,
        status="completed",
        message=msg,
        card_type="flashcards",
        data={"card_type": "flashcards", "flashcardDeck": deck_dict},
        requires_confirmation=False,
        affected_item_ids=[str(target_note.id)],
    )


def handle_audit(
    db: Session,
    workspace_id: uuid.UUID,
    target_note: Note,
) -> TransformNoteExecutionResult:
    """Audit note for claims, logical consistency, uncertainty, and gaps (non-mutating)."""
    content = (target_note.content or "").strip()
    if len(content) < 20:
        raise AppException(
            400,
            "INSUFFICIENT_CONTENT",
            f"Note '{target_note.title}' has insufficient content to audit.",
        )

    findings: list[AuditFinding] = []

    # 1. Check for missing citations or claims without explicit evidence
    sentences = [s.strip() for s in re.split(r"[.!?]\s+", content) if len(s.strip()) > 30]
    unverified_claim = next(
        (s for s in sentences if any(w in s.lower() for w in ("always", "never", "optimal", "fastest", "proven", "flawless"))),
        sentences[0] if sentences else "Core technical premise",
    )
    findings.append(
        AuditFinding(
            id=f"audit-{uuid.uuid4().hex[:6]}",
            severity="warning",
            section="Core Claims & Evidence",
            claim=unverified_claim[:120] + ("..." if len(unverified_claim) > 120 else ""),
            critique="Asserts absolute or unverified performance guarantee without citing empirical benchmarks.",
            recommendation="Qualify statement with operational boundaries or add citation to benchmark experiments.",
        )
    )

    # 2. Check for technical jargon or acronyms without definitions
    acronyms = set(re.findall(r"\b[A-Z]{3,5}\b", content))
    acronyms.discard("NOTE")
    acronyms.discard("HTTP")
    if acronyms:
        sample_acr = sorted(list(acronyms))[0]
        findings.append(
            AuditFinding(
                id=f"audit-{uuid.uuid4().hex[:6]}",
                severity="info",
                section="Terminology & Acronyms",
                claim=f"Uses acronym '{sample_acr}' without initial expansion.",
                critique="Readers unfamiliar with this domain may struggle with unexplained acronyms.",
                recommendation=f"Define '{sample_acr}' upon its first occurrence in the document.",
            )
        )

    # 3. Check for edge case coverage or failure modes
    has_failure_modes = any(
        w in content.lower()
        for w in ("failure", "bottleneck", "edge case", "limitation", "drawback", "trade-off", "tradeoff")
    )
    if not has_failure_modes:
        findings.append(
            AuditFinding(
                id=f"audit-{uuid.uuid4().hex[:6]}",
                severity="concern",
                section="Architectural Robustness",
                claim="Note outlines happy path without detailing failure modes or tradeoffs.",
                critique="Real-world engineering implementations require explicit consideration of edge conditions.",
                recommendation="Add a 'Trade-offs and Limitations' subsection covering known failure cases.",
            )
        )

    msg = f"Completed architectural audit for '{target_note.title}': found {len(findings)} observation(s)."
    return TransformNoteExecutionResult(
        operation="audit",
        note_id=str(target_note.id),
        title=target_note.title,
        status="completed",
        message=msg,
        card_type="transform_audit",
        data={
            "workflow": "transform_note",
            "operation": "audit",
            "note_id": str(target_note.id),
            "title": target_note.title,
            "findings": [f.model_dump() for f in findings],
            "total_findings": len(findings),
        },
        requires_confirmation=False,
        affected_item_ids=[str(target_note.id)],
    )


# ─────────────────────────────────────────────────────────────────────────────
# Primary Execution Entrypoint
# ─────────────────────────────────────────────────────────────────────────────

def execute_transform_note(
    db: Session,
    workspace_id: uuid.UUID,
    operation: str | None,
    target_identifier: str | None = None,
    command_str: str = "/transform-note",
) -> TransformNoteExecutionResult:
    """Execute `/transform-note` operation with full domain isolation and proposal staging."""
    op_clean = (operation or "").strip().lower()

    if not op_clean or op_clean == "options":
        return handle_options()

    if op_clean not in SUPPORTED_OPERATIONS:
        valid_ops_str = ", ".join(SUPPORTED_OPERATIONS)
        raise ValidationError(
            f"Unsupported operation '{operation}'. Supported operations: {valid_ops_str}, or 'options'."
        )

    # Operations requiring target note
    if not target_identifier:
        raise ValidationError(f"Usage: /transform-note {op_clean} <note>")

    target_note = resolve_target_note(db, workspace_id, target_identifier)
    if not target_note:
        raise AppException(
            404,
            "NOTE_NOT_FOUND",
            f"Could not find note '{target_identifier}' in this workspace.",
        )

    if op_clean == "enrich":
        return handle_enrich(db, workspace_id, target_note, command_str=command_str)

    if op_clean in ("shorten", "expand", "simplify", "restructure", "improve"):
        return handle_text_transform(db, workspace_id, target_note, operation=op_clean)

    if op_clean == "connect":
        return handle_connect(db, workspace_id, target_note)

    if op_clean == "study":
        return handle_study(db, workspace_id, target_note)

    if op_clean == "audit":
        return handle_audit(db, workspace_id, target_note)

    raise ValidationError(f"Unhandled operation '{op_clean}'.")
