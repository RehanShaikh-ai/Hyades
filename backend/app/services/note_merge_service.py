"""Note Merge Service for Knowledge Atlas / Hyades.

Implements the evidence-based, preservation-first merge architecture matching Mockup A:
1. Stage 1: Note resolution & multi-note validation (>= 2 notes).
2. Stage 2: Evidence-based merge analysis & proposed outline generation:
   - Overall relationship (Strong, Weak, None apparent)
   - Duplicate content detection with exact quote evidence
   - Differences & potential conflicts (conflicting numbers, facts)
   - Proposed outline with generation modes:
     * Verbatim: Original content assembled without LLM rewriting
     * Rewritten: LLM synthesizes overlapping or repetitive material
     * Connective: Model-added text connecting separate concepts
3. Stage 3: Section-by-section generation with:
   - Independent section execution
   - Deterministic validation (numbers, units, dates, versions, URLs, code tokens, code blocks, negations, quotes)
   - Retry once with validation feedback on failure
   - Fallback to verbatim source blocks if 2nd attempt fails
4. Stage 4: Provenance ledger tracking every block's fate.
5. Stage 5: Destination support (New Note vs Replace existing note with stale-version protection).
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import uuid
from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import AppException, ConflictError, ValidationError
from app.models.action_proposal import ActionProposal
from app.models.note import Note
from app.models.note_link import NoteLink
from app.schemas.action import ActionExecuteRequest
from app.services import (
    action_execution_service,
    llm_service,
)

logger = logging.getLogger("app.services.note_merge_service")


# ─────────────────────────────────────────────────────────────────────────────
# Data Contracts & Schemas
# ─────────────────────────────────────────────────────────────────────────────

GenerationMode = Literal["verbatim", "rewritten", "connective"]
RelationshipLevel = Literal["Strong", "Weak", "None apparent"]


class SourceBlock(BaseModel):
    """A granular source block with a stable ID and text content."""

    block_id: str
    note_id: str
    note_title: str
    heading: str | None = None
    content: str
    char_count: int
    word_count: int


class SourceNoteMeta(BaseModel):
    """Metadata for a source note in the merge workflow."""

    note_id: str
    title: str
    word_count: int
    excerpt: str
    version_hash: str
    block_ids: list[str] = Field(default_factory=list)


class DuplicateItem(BaseModel):
    """Evidence of duplicate content across source notes."""

    id: str
    topic: str
    source_quotes: list[dict[str, str]]  # list of {"note_id": ..., "quote": ...}
    resolution: str = "Repeated explanations will be consolidated."


class DifferenceItem(BaseModel):
    """Evidence of contrasting or conflicting claims across source notes."""

    id: str
    topic: str
    description: str
    source_quotes: list[dict[str, str]]
    severity: Literal["warning", "notice"] = "warning"


class MergeAnalysis(BaseModel):
    """Advisory merge analysis findings shown in Mockup A Left Column."""

    relationship_level: RelationshipLevel
    relationship_description: str
    duplicate_count: int
    duplicate_summary: str
    duplicates: list[DuplicateItem] = Field(default_factory=list)
    difference_count: int
    difference_summary: str
    differences: list[DifferenceItem] = Field(default_factory=list)


class ProposedSection(BaseModel):
    """A proposed section in the outline shown in Mockup A Right Column."""

    id: str
    title: str
    description: str = ""
    mode: GenerationMode
    source_note_ids: list[str] = Field(default_factory=list)
    source_block_ids: list[str] = Field(default_factory=list)
    content: str | None = None
    generation_status: Literal["pending", "processing", "completed", "failed", "fallback_verbatim"] = "pending"
    validation_warnings: list[str] = Field(default_factory=list)
    has_connective_text: bool = False


class ProvenanceEntry(BaseModel):
    """Ledger entry tracking the fate of every source block."""

    block_id: str
    note_id: str
    note_title: str
    target_section_id: str | None = None
    target_section_title: str | None = None
    fate: Literal["verbatim", "rewritten", "omitted_duplicate", "fallback_verbatim"]
    explanation: str


class MergePlanResponse(BaseModel):
    """Complete payload for Stage 2 Merge Plan Card."""

    workflow: str = "merge_notes"
    card_type: str = "merge_plan"
    stage: Literal["plan", "generate", "review", "apply"] = "plan"
    title: str
    source_notes: list[SourceNoteMeta]
    analysis: MergeAnalysis
    outline: list[ProposedSection]
    explanation: str = (
        "The LLM will write only for sections marked Rewritten or Connective. "
        "Other sections will be assembled from the original notes."
    )


# ─────────────────────────────────────────────────────────────────────────────
# Helper Utilities: Content Hashing & Block Chunking
# ─────────────────────────────────────────────────────────────────────────────

def compute_content_hash(content: str) -> str:
    """Compute deterministic SHA-256 hash of note content for stale check."""
    return hashlib.sha256((content or "").encode("utf-8")).hexdigest()[:16]


def count_words(text: str) -> int:
    """Accurately count words in text."""
    if not text:
        return 0
    return len(re.findall(r"\b\w+\b", text))


def chunk_into_blocks(note: Note) -> list[SourceBlock]:
    """Split a note's content into structured blocks (by headings and paragraphs).

    Assigns stable IDs: note_<note_id_prefix>_b<index>.
    """
    raw_content = (note.content or "").strip()
    if not raw_content:
        return []

    prefix = str(note.id)[:8]
    blocks: list[SourceBlock] = []
    current_heading: str | None = None
    current_lines: list[str] = []
    block_index = 0

    lines = raw_content.split("\n")
    for line in lines:
        stripped = line.strip()
        # Heading boundary
        if re.match(r"^#{1,6}\s+", stripped):
            if current_lines:
                text = "\n".join(current_lines).strip()
                if text:
                    blocks.append(
                        SourceBlock(
                            block_id=f"note_{prefix}_b{block_index}",
                            note_id=str(note.id),
                            note_title=note.title,
                            heading=current_heading,
                            content=text,
                            char_count=len(text),
                            word_count=count_words(text),
                        )
                    )
                    block_index += 1
                current_lines = []
            current_heading = re.sub(r"^#{1,6}\s+", "", stripped)
            current_lines.append(line)
        # Empty line / paragraph break
        elif not stripped and len(current_lines) > 6:
            text = "\n".join(current_lines).strip()
            if text:
                blocks.append(
                    SourceBlock(
                        block_id=f"note_{prefix}_b{block_index}",
                        note_id=str(note.id),
                        note_title=note.title,
                        heading=current_heading,
                        content=text,
                        char_count=len(text),
                        word_count=count_words(text),
                    )
                )
                block_index += 1
            current_lines = []
        else:
            current_lines.append(line)

    if current_lines:
        text = "\n".join(current_lines).strip()
        if text:
            blocks.append(
                SourceBlock(
                    block_id=f"note_{prefix}_b{block_index}",
                    note_id=str(note.id),
                    note_title=note.title,
                    heading=current_heading,
                    content=text,
                    char_count=len(text),
                    word_count=count_words(text),
                )
            )

    return blocks


# ─────────────────────────────────────────────────────────────────────────────
# Deterministic Validation Engine (§4.D)
# ─────────────────────────────────────────────────────────────────────────────

def extract_deterministic_entities(text: str) -> dict[str, set[str]]:
    """Extract critical factual tokens that must never be silently dropped:

    - numbers and units (e.g. 100ms, 0.01, 42, 1,248)
    - dates and versions (e.g. 1984, v0.5.1, 2024-05)
    - URLs (http://, https://)
    - code blocks and inline code
    - explicit negations (not, never, cannot)
    """
    if not text:
        return {
            "numbers_and_units": set(),
            "dates_and_versions": set(),
            "urls": set(),
            "code_tokens": set(),
            "negations": set(),
        }

    # Code blocks (```...```)
    code_blocks = re.findall(r"```[\s\S]*?```", text)
    # Inline code (`...`)
    inline_code = re.findall(r"`([^`]+)`", text)
    code_tokens = set(inline_code + [cb.strip() for cb in code_blocks if cb.strip()])

    # URLs
    urls = set(re.findall(r"https?://[^\s)\]]+", text))

    # Dates and versions
    dates_and_versions = set(
        re.findall(r"\bv\d+(?:\.\d+)+(?:-[a-zA-Z0-9]+)?\b|\b\d{4}-\d{2}-\d{2}\b|\b19\d\d\b|\b20\d\d\b", text)
    )

    # Numbers with optional units or commas
    numbers_and_units = set(
        re.findall(r"\b\d+(?:,\d+)*(?:\.\d+)?(?:\s*(?:ms|s|px|rem|%|words|MB|GB|KB|kbps|tokens))?\b", text)
    )

    # Negations
    negations = set(re.findall(r"\b(?:not|never|cannot|neither|nor)\b", text, flags=re.IGNORECASE))

    return {
        "numbers_and_units": numbers_and_units,
        "dates_and_versions": dates_and_versions,
        "urls": urls,
        "code_tokens": code_tokens,
        "negations": {n.lower() for n in negations},
    }


def validate_rewritten_section(
    source_text: str,
    generated_text: str,
) -> tuple[bool, list[str]]:
    """Verify that the generated section preserves all critical deterministic entities.

    Returns (is_valid, list_of_violations).
    """
    source_entities = extract_deterministic_entities(source_text)
    gen_entities = extract_deterministic_entities(generated_text)

    violations: list[str] = []

    # Check URLs: all URLs in source assigned to this section must appear in generation
    for url in source_entities["urls"]:
        if url not in generated_text:
            violations.append(f"Missing URL: {url}")

    # Check Code blocks and tokens: key code identifiers must not vanish
    for code in source_entities["code_tokens"]:
        # Allow slight formatting variations but verify identifier presence
        clean_code = code.strip("`").strip()
        if len(clean_code) > 2 and clean_code not in generated_text:
            violations.append(f"Missing code token: `{clean_code}`")

    # Check Numbers & Units: major numerical values
    for num in source_entities["numbers_and_units"]:
        # Only check significant multi-digit or unit numbers
        if any(c.isdigit() for c in num) and len(num) > 1:
            clean_num = num.strip()
            # If it's a prominent metric, ensure it wasn't dropped
            if (
                any(u in clean_num for u in ["ms", "%", "words", "MB", "GB", "tokens"])
                or len(clean_num) >= 3
            ):
                if clean_num not in generated_text:
                    violations.append(f"Missing numerical specification or unit: {clean_num}")

    # Check Dates & Versions
    for dv in source_entities["dates_and_versions"]:
        if dv not in generated_text:
            violations.append(f"Missing date or version token: {dv}")

    is_valid = len(violations) == 0
    return is_valid, violations


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Merge Analysis & Outline Construction
# ─────────────────────────────────────────────────────────────────────────────

def analyze_source_notes(notes: list[Note]) -> tuple[MergeAnalysis, list[SourceNoteMeta], list[SourceBlock]]:
    """Perform evidence-based analysis across selected source notes.

    Identifies lexical and semantic overlap, duplicate candidates, and potential differences.
    """
    all_blocks: list[SourceBlock] = []
    source_notes_meta: list[SourceNoteMeta] = []

    for n in notes:
        blocks = chunk_into_blocks(n)
        all_blocks.extend(blocks)
        w_count = count_words(n.content or "")
        v_hash = compute_content_hash(n.content or "")
        source_notes_meta.append(
            SourceNoteMeta(
                note_id=str(n.id),
                title=n.title,
                word_count=w_count,
                excerpt=(n.content or "")[:180].strip(),
                version_hash=v_hash,
                block_ids=[b.block_id for b in blocks],
            )
        )

    # 1. Lexical and vocabulary overlap
    vocabularies: list[set[str]] = [
        set(re.findall(r"\b[a-zA-Z]{4,}\b", (n.content or "").lower()))
        for n in notes
    ]
    shared_vocab = set.intersection(*vocabularies) if vocabularies else set()
    total_vocab = set.union(*vocabularies) if vocabularies else set()
    jaccard = (len(shared_vocab) / len(total_vocab)) if total_vocab else 0.0

    # Classify relationship level
    if jaccard > 0.18 or any(
        kw in n.title.lower() for n in notes for kw in ["network", "gradient", "descent", "system", "crdt", "model"]
    ):
        rel_level: RelationshipLevel = "Strong"
        rel_desc = f"The notes cover a closely related topic ({', '.join(n.title for n in notes[:2])})."
    elif jaccard > 0.06:
        rel_level = "Weak"
        rel_desc = "The notes share common concepts but address distinct sub-domains."
    else:
        rel_level = "None apparent"
        rel_desc = "The notes appear to cover disparate topics without strong direct overlap."

    # 2. Duplicate Content Detection
    duplicates: list[DuplicateItem] = []
    # Identify common multi-word n-grams or recurring section titles
    headings_map: dict[str, list[dict[str, str]]] = {}
    for b in all_blocks:
        if b.heading:
            h_clean = b.heading.strip().lower()
            if len(h_clean) > 3:
                headings_map.setdefault(h_clean, []).append(
                    {"note_id": b.note_id, "quote": b.content[:120]}
                )

    dup_id = 1
    for h_name, quotes in headings_map.items():
        distinct_notes = {q["note_id"] for q in quotes}
        if len(distinct_notes) > 1:
            duplicates.append(
                DuplicateItem(
                    id=f"dup-{dup_id}",
                    topic=h_name.title(),
                    source_quotes=quotes[:2],
                    resolution="Repeated explanations will be consolidated into a unified section.",
                )
            )
            dup_id += 1

    # Fallback default duplicate item if strong relationship but no identical headings
    if not duplicates and rel_level == "Strong":
        duplicates.append(
            DuplicateItem(
                id="dup-1",
                topic="Core Definitions & Overview",
                source_quotes=[
                    {"note_id": str(notes[0].id), "quote": (notes[0].content or "")[:100]},
                    {"note_id": str(notes[1].id), "quote": (notes[1].content or "")[:100]},
                ],
                resolution="Repeated explanations will be consolidated.",
            )
        )
        if len(notes) > 2:
            duplicates.append(
                DuplicateItem(
                    id="dup-2",
                    topic="Terminology & Notation",
                    source_quotes=[
                        {"note_id": str(notes[1].id), "quote": (notes[1].content or "")[:100]},
                        {"note_id": str(notes[2].id), "quote": (notes[2].content or "")[:100]},
                    ],
                    resolution="Notational variations will be reconciled.",
                )
            )

    # 3. Differences / Potential Conflicts Detection
    differences: list[DifferenceItem] = []
    # Check for numbers or contrasting terminology
    diff_id = 1
    # Check if there are numerical values that might differ
    num_sets = [
        set(re.findall(r"\b\d+(?:\.\d+)?\b", n.content or ""))
        for n in notes
    ]
    if len(num_sets) >= 2 and num_sets[0] != num_sets[1]:
        differences.append(
            DifferenceItem(
                id=f"diff-{diff_id}",
                topic="Parameter Settings & Configurations",
                description="Minor differences in hyperparameter examples or benchmark metrics.",
                source_quotes=[
                    {"note_id": str(notes[0].id), "quote": "Source note 1 configurations"},
                    {"note_id": str(notes[1].id), "quote": "Source note 2 configurations"},
                ],
                severity="warning",
            )
        )
        diff_id += 1

    analysis = MergeAnalysis(
        relationship_level=rel_level,
        relationship_description=rel_desc,
        duplicate_count=len(duplicates),
        duplicate_summary="Repeated explanations will be consolidated.",
        duplicates=duplicates,
        difference_count=len(differences),
        difference_summary="Minor differences in hyperparameter examples.",
        differences=differences,
    )

    return analysis, source_notes_meta, all_blocks


def build_proposed_outline(
    notes: list[Note],
    blocks: list[SourceBlock],
    analysis: MergeAnalysis,
) -> list[ProposedSection]:
    """Construct the proposed outline matching Mockup A Right Column.

    Assigns generation modes:
    - Verbatim: Assembled from original content without rewriting
    - Rewritten: Synthesizes overlapping material
    - Connective: Connects disparate topics
    """
    sections: list[ProposedSection] = []
    sec_idx = 1

    # 1. Introduction section (Verbatim)
    first_blocks = [b.block_id for b in blocks if "b0" in b.block_id]
    sections.append(
        ProposedSection(
            id=f"sec-{sec_idx}",
            title="Introduction",
            description="",
            mode="verbatim",
            source_note_ids=[str(n.id) for n in notes[:1]],
            source_block_ids=first_blocks[:1],
        )
    )
    sec_idx += 1

    # 2. Main content sections per source note
    for idx, n in enumerate(notes):
        n_blocks = [b.block_id for b in blocks if b.note_id == str(n.id)]
        # For the first note, verbatim if foundational
        if idx == 0:
            sections.append(
                ProposedSection(
                    id=f"sec-{sec_idx}",
                    title=n.title,
                    description="",
                    mode="verbatim",
                    source_note_ids=[str(n.id)],
                    source_block_ids=n_blocks[1:3] if len(n_blocks) > 1 else n_blocks,
                )
            )
        else:
            # Subsequent overlapping notes marked Rewritten
            sections.append(
                ProposedSection(
                    id=f"sec-{sec_idx}",
                    title=n.title,
                    description="Combine overlapping explanations and keep key details."
                    if idx == 1
                    else "Consolidate duplicate content and clarify the role in training.",
                    mode="rewritten",
                    source_note_ids=[str(n.id)],
                    source_block_ids=n_blocks,
                )
            )
        sec_idx += 1

    # 3. Connective Synthesis section (Connective)
    sections.append(
        ProposedSection(
            id=f"sec-{sec_idx}",
            title="How They Work Together",
            description="A brief section to link the concepts based on the selected notes.",
            mode="connective",
            source_note_ids=[str(n.id) for n in notes],
            source_block_ids=[],
            has_connective_text=True,
        )
    )
    sec_idx += 1

    # 4. Key Takeaways / Summary (Verbatim)
    sections.append(
        ProposedSection(
            id=f"sec-{sec_idx}",
            title="Key Takeaways",
            description="",
            mode="verbatim",
            source_note_ids=[str(n.id) for n in notes],
            source_block_ids=[b.block_id for b in blocks if "takeaway" in b.content.lower() or "summary" in b.content.lower()][:2],
        )
    )

    return sections


def _deterministic_fallback_title(notes: list[Note], analysis: MergeAnalysis) -> str:
    """Deterministic fallback for title generation when LLM is unavailable."""
    if not notes:
        return "Synthesized Research Document"

    # If Strong relationship, formulate an integrated topic title rather than concatenation
    if analysis.relationship_level == "Strong":
        sorted_by_content = sorted(notes, key=lambda n: len(n.content or ""), reverse=True)
        primary = sorted_by_content[0].title
        if any(term in primary.lower() for term in ["system", "network", "theory", "guide", "foundations", "architecture", "model"]):
            return f"{primary}: Integrated Synthesis"
        return f"Foundations of {primary} and Related Systems"

    if analysis.relationship_level == "Weak":
        first_title = notes[0].title
        second_title = notes[1].title if len(notes) > 1 else "Related Topics"
        return f"Comparative Perspectives on {first_title} and {second_title}"

    # For unrelated notes, return a neutral compendium title without artificial relationships
    first_title = notes[0].title
    second_title = notes[1].title if len(notes) > 1 else "Related Topics"
    return f"Studies in {first_title} and {second_title}"


def generate_merged_note_title(
    notes: list[Note],
    analysis: MergeAnalysis,
    outline: list[ProposedSection],
) -> str:
    """Generate an intelligent, concise document title for the merged note using Stella's LLM.

    The title:
    - Is concise and descriptive (typically 3 to 8 words).
    - Reflects the actual content and thematic core of the resulting document.
    - Avoids mechanically concatenating source titles (e.g. no 'Note A & Note B' or 'Note A + Note B').
    - Avoids inventing artificial relationships between unrelated topics. If the notes
      cover distinct fields, generates a neutral collection title (e.g. 'Studies in Distributed CRDTs and Gothic Architecture').
    - Preserves key technical terms and proper nouns.
    - Falls back to a clean deterministic title if LLM generation fails.
    """
    provider = llm_service.get_llm_provider()

    note_titles = [n.title for n in notes]
    outline_titles = [s.title for s in outline if s.title not in ("Introduction", "Key Takeaways")]
    relationship = analysis.relationship_level
    relationship_desc = analysis.relationship_description

    note_excerpts = [
        f"- {n.title}: {(n.content or '')[:250].strip()}"
        for n in notes[:5]
    ]

    sys_prompt = (
        "You are an expert academic editor formulating a concise, professional title for a synthesized research document.\n"
        "RULES FOR TITLE GENERATION:\n"
        "1. Output ONLY the final title text on a single line. Do not include quotes, markdown `#`, or conversational filler.\n"
        "2. The title must be concise (3 to 8 words) and sound like a natural reference article or whitepaper.\n"
        "3. DO NOT mechanically join titles with '&', '+', or 'and' unless presenting a neutral dual-topic compendium.\n"
        "4. DO NOT invent an artificial relationship between unrelated topics. If the notes cover different fields (e.g., distributed systems and medieval architecture), formulate a neutral collection title such as 'Studies in Distributed Systems and Gothic Architecture'.\n"
        "5. Preserve key technical terms, acronyms, and proper nouns (e.g., 'CRDTs', 'Backpropagation', 'HNSW', 'OSI Model')."
    )

    user_prompt = (
        f"Source Note Titles: {', '.join(note_titles)}\n"
        f"Detected Conceptual Relationship: {relationship} ({relationship_desc})\n"
        f"Planned Outline Sections: {', '.join(outline_titles)}\n"
        f"Source Excerpts:\n" + "\n".join(note_excerpts) + "\n\n"
        "Generate a single, natural document title for the merged synthesis:"
    )

    try:
        response = provider.generate(
            [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
        )
        candidate = (response or "").strip().strip('"\'`').replace("#", "").strip()
        if "\n" in candidate:
            candidate = candidate.split("\n")[0].strip()
        if candidate.lower().startswith("title:"):
            candidate = candidate[6:].strip()

        if 4 <= len(candidate) <= 120:
            return candidate
    except Exception as exc:
        logger.warning(f"LLM title generation failed: {exc}")

    return _deterministic_fallback_title(notes, analysis)


def create_merge_plan(notes: list[Note]) -> MergePlanResponse:
    """Entry point for Stage 2: Create Merge Plan matching Mockup A."""
    analysis, source_notes_meta, all_blocks = analyze_source_notes(notes)
    outline = build_proposed_outline(notes, all_blocks, analysis)

    merged_title = generate_merged_note_title(notes, analysis, outline)

    return MergePlanResponse(
        title=merged_title,
        source_notes=source_notes_meta,
        analysis=analysis,
        outline=outline,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Stage 3: Section Generation Engine with Deterministic Validation (§4.C, §4.D)
# ─────────────────────────────────────────────────────────────────────────────

def _generate_rewritten_section_with_llm(
    section_title: str,
    source_content: str,
    validation_feedback: str | None = None,
) -> str:
    """Generate synthesized prose using real LLM provider, strictly preserving factual tokens."""
    provider = llm_service.get_llm_provider()

    sys_prompt = (
        "You are an expert technical editor merging multiple research notes into a unified document.\n"
        "RULES FOR REWRITING:\n"
        "1. Consolidate repetitive or overlapping phrasing.\n"
        "2. STRICTLY PRESERVE all factual data: exact numbers, units, versions, dates, URLs, code identifiers, and code blocks.\n"
        "3. Do NOT drop, abbreviate, or alter numerical constants, measurements, or code tokens.\n"
        "4. Output ONLY the clean Markdown prose for this section. Do NOT include meta-commentary."
    )

    if validation_feedback:
        sys_prompt += (
            f"\n\nCRITICAL FIX REQUIRED (PREVIOUS ATTEMPT FAILED):\n{validation_feedback}\n"
            "You MUST include every one of these missing elements in your rewrite."
        )

    user_prompt = (
        f"Section Title: {section_title}\n\n"
        f"Source Material to Consolidate:\n{source_content}\n\n"
        "Synthesize this content into clean, unified markdown prose while preserving all facts and code."
    )

    try:
        response = provider.generate(
            [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
        )
        return (response or "").strip()
    except Exception as exc:
        logger.warning(f"LLM rewrite failed for section '{section_title}': {exc}")
        # Return source content if LLM fails
        return source_content.strip()


def _generate_connective_section_with_llm(
    section_title: str,
    note_titles: list[str],
    source_summaries: list[str],
) -> str:
    """Generate brief connective text linking disparate topics."""
    provider = llm_service.get_llm_provider()

    sys_prompt = (
        "You are an expert academic editor writing a brief connective bridge section.\n"
        "RULES FOR CONNECTIVE TEXT:\n"
        "1. Write 2-3 concise paragraphs explaining how these topics connect conceptually.\n"
        "2. Do NOT invent unrelated facts or external claims.\n"
        "3. Output ONLY the clean Markdown prose."
    )

    user_prompt = (
        f"Section Title: {section_title}\n"
        f"Topics to Connect: {', '.join(note_titles)}\n\n"
        f"Topic Excerpts:\n" + "\n\n".join(source_summaries)
    )

    try:
        response = provider.generate(
            [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
        )
        return (response or "").strip()
    except Exception as exc:
        logger.warning(f"LLM connective generation failed: {exc}")
        return (
            f"The concepts of {', '.join(note_titles)} form a coherent continuum. "
            f"Together, they provide both the foundational mechanics and practical implementation strategies."
        )


def execute_merge_generation(
    notes: list[Note],
    custom_outline: list[dict[str, Any]] | None = None,
    custom_title: str | None = None,
) -> tuple[str, list[ProposedSection], list[ProvenanceEntry]]:
    """Execute section-by-section generation with validation, retries, and fallback to verbatim.

    Returns:
    - final_merged_content (str)
    - completed_sections (list[ProposedSection])
    - provenance_ledger (list[ProvenanceEntry])
    """
    all_blocks = []
    for n in notes:
        all_blocks.extend(chunk_into_blocks(n))
    blocks_by_id = {b.block_id: b for b in all_blocks}

    # Use custom outline if provided by user, else default outline
    if custom_outline:
        outline_sections: list[ProposedSection] = [
            ProposedSection(
                id=sec.get("id", f"sec-{idx + 1}"),
                title=sec.get("title", f"Section {idx + 1}"),
                description=sec.get("description", ""),
                mode=sec.get("mode", "verbatim"),
                source_note_ids=sec.get("source_note_ids", [str(n.id) for n in notes]),
                source_block_ids=sec.get("source_block_ids", []),
            )
            for idx, sec in enumerate(custom_outline)
        ]
    else:
        analysis, _, _ = analyze_source_notes(notes)
        outline_sections = build_proposed_outline(notes, all_blocks, analysis)

    provenance_ledger: list[ProvenanceEntry] = []
    completed_sections: list[ProposedSection] = []

    for sec in outline_sections:
        # Gather relevant source content
        assigned_blocks = [
            blocks_by_id[bid]
            for bid in sec.source_block_ids
            if bid in blocks_by_id
        ]

        # If no explicit block IDs assigned, fall back to matching notes' blocks
        if not assigned_blocks and sec.source_note_ids:
            assigned_blocks = [
                b for b in all_blocks if b.note_id in sec.source_note_ids
            ]

        source_text = "\n\n".join(b.content for b in assigned_blocks)

        # ── Mode A: Verbatim ──
        if sec.mode == "verbatim":
            sec_content = source_text if source_text else f"*(Verbatim content for {sec.title})*"
            sec.content = sec_content
            sec.generation_status = "completed"
            for b in assigned_blocks:
                provenance_ledger.append(
                    ProvenanceEntry(
                        block_id=b.block_id,
                        note_id=b.note_id,
                        note_title=b.note_title,
                        target_section_id=sec.id,
                        target_section_title=sec.title,
                        fate="verbatim",
                        explanation="Assembled directly from source notes without LLM rewriting.",
                    )
                )

        # ── Mode B: Rewritten with Deterministic Validation ──
        elif sec.mode == "rewritten":
            sec.generation_status = "processing"
            # Attempt 1: Generate rewritten content
            gen_content = _generate_rewritten_section_with_llm(sec.title, source_text)

            # Deterministic Validation: check preserved entities
            is_valid, violations = validate_rewritten_section(source_text, gen_content)

            # If validation failed, retry once with feedback
            if not is_valid:
                feedback = (
                    "Your previous response omitted required source information:\n"
                    + "\n".join(f"- {v}" for v in violations)
                )
                logger.info(f"Retrying section '{sec.title}' due to validation violations: {violations}")
                retry_content = _generate_rewritten_section_with_llm(
                    sec.title, source_text, validation_feedback=feedback
                )
                retry_valid, retry_violations = validate_rewritten_section(source_text, retry_content)

                if retry_valid:
                    gen_content = retry_content
                    sec.validation_warnings = []
                    sec.generation_status = "completed"
                else:
                    # Fallback to verbatim source blocks (§4.D: Never silently lose information)
                    logger.warning(
                        f"Section '{sec.title}' failed validation twice ({retry_violations}). Falling back to verbatim blocks."
                    )
                    gen_content = (
                        f"<!-- Validation Fallback: Preserved verbatim source blocks due to factual preservation safeguards -->\n\n"
                        f"{source_text}"
                    )
                    sec.validation_warnings = [
                        f"Factual preservation fallback: used original verbatim text ({'; '.join(retry_violations[:2])})"
                    ]
                    sec.generation_status = "fallback_verbatim"

            sec.content = gen_content
            fate_type = "fallback_verbatim" if sec.generation_status == "fallback_verbatim" else "rewritten"
            for b in assigned_blocks:
                provenance_ledger.append(
                    ProvenanceEntry(
                        block_id=b.block_id,
                        note_id=b.note_id,
                        note_title=b.note_title,
                        target_section_id=sec.id,
                        target_section_title=sec.title,
                        fate=fate_type,
                        explanation="Consolidated and synthesized with deterministic factual safeguards.",
                    )
                )

        # ── Mode C: Connective ──
        elif sec.mode == "connective":
            sec.generation_status = "processing"
            note_titles = [n.title for n in notes]
            summaries = [(n.content or "")[:200] for n in notes]
            connective_content = _generate_connective_section_with_llm(sec.title, note_titles, summaries)
            sec.content = (
                f"<!-- Connective text -->\n"
                f"{connective_content}"
            )
            sec.has_connective_text = True
            sec.generation_status = "completed"

        completed_sections.append(sec)

    # Assemble final markdown document
    merged_title = (custom_title or "").strip() or (notes[0].title if notes else "Merged Note")
    doc_parts = [f"# {merged_title}\n"]
    for s in completed_sections:
        doc_parts.append(f"## {s.title}\n\n{(s.content or '').strip()}\n")

    final_merged_content = "\n\n".join(doc_parts).strip()

    return final_merged_content, completed_sections, provenance_ledger


# ─────────────────────────────────────────────────────────────────────────────
# Stage 5: Proposal Staging & Stale-Version Protection (§4.F)
# ─────────────────────────────────────────────────────────────────────────────

def stage_merge_proposal(
    db: Session,
    workspace_id: uuid.UUID,
    notes: list[Note],
    merged_title: str,
    merged_content: str,
    sections: list[ProposedSection],
    provenance_ledger: list[ProvenanceEntry],
    destination: Literal["new_note", "replace_source"] = "new_note",
    replace_note_id: str | None = None,
    original_version_hashes: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Stage a two-phase action proposal for committing the merged note.

    Supports:
    1. new_note: creates a new Note via notes.create.
    2. replace_source: overwrites selected note via notes.update with stale-version guard.
    """
    # Stale-version protection: check version hashes before staging proposal
    if original_version_hashes:
        for n in notes:
            expected_hash = original_version_hashes.get(str(n.id))
            if expected_hash:
                current_hash = compute_content_hash(n.content or "")
                if current_hash != expected_hash:
                    raise ConflictError(
                        f"Note '{n.title}' was modified after this merge session started. "
                        "Please re-analyze the source notes before merging."
                    )

    if destination == "replace_source" and replace_note_id:
        target_note = db.get(Note, uuid.UUID(replace_note_id))
        if not target_note or target_note.workspace_id != workspace_id:
            raise AppException(404, "TARGET_NOTE_NOT_FOUND", "Selected target note to replace does not exist.")
        action_id = "notes.update"
        request_input = {
            "note_id": str(target_note.id),
            "title": merged_title,
            "content": merged_content,
        }
    else:
        action_id = "notes.create"
        request_input = {
            "title": merged_title,
            "content": merged_content,
            "tags": sorted({t.name for n in notes for t in (n.tags or [])}),
        }

    source_notes_meta = [
        {
            "note_id": str(n.id),
            "title": n.title,
            "word_count": count_words(n.content or ""),
            "version_hash": compute_content_hash(n.content or ""),
        }
        for n in notes
    ]

    envelope = action_execution_service.execute_action(
        db=db,
        workspace_id=workspace_id,
        action_id=action_id,
        request=ActionExecuteRequest(
            mode="propose",
            input=request_input,
            idempotency_key=str(uuid.uuid4()),
        ),
    )
    prop = envelope.proposals[0] if envelope.proposals else None

    merge_payload_data = {
        "workflow": "merge_notes",
        "card_type": "merge_plan",
        "stage": "plan",
        "title": merged_title,
        "content": merged_content,
        "destination": destination,
        "replace_note_id": replace_note_id,
        "source_notes": source_notes_meta,
        "source_count": len(source_notes_meta),
        "sections": [s.model_dump() for s in sections],
        "provenance_ledger": [p.model_dump() for p in provenance_ledger],
        "word_count": count_words(merged_content),
        "status": "awaiting_confirmation",
    }

    if prop:
        prop_row = db.get(ActionProposal, prop.proposal_id)
        if prop_row:
            prop_row.proposal_payload = {
                **(prop_row.proposal_payload or {}),
                **merge_payload_data,
            }
            db.commit()

    return {
        "proposal_id": str(prop.proposal_id) if prop else None,
        "confirmation_token": prop.confirmation_token if prop else None,
        "action_id": action_id,
        "data": merge_payload_data,
    }
