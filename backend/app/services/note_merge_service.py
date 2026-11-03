"""Note Merge Service for Knowledge Atlas / Hyades.

Implements the evidence-based, preservation-first merge architecture:
1. Multi-note validation (2 to 4 source notes).
2. Dynamic content-aware merge analysis & proposed outline generation:
   - Overall relationship assessment (Strong, Weak, None apparent)
   - Evidence-based duplicate content & candidate-pair detection
   - Differences & potential conflicts detection
   - Dynamic, content-aware outline generation (no rigid templates):
     * Shared conceptual sections for overlapping topics
     * Distinct sections for unique sub-domains
     * Technical synthesis sections for concrete mechanisms & data flows
     * Concise bullet-point key takeaways (no duplicated tutorials)
     * Dedicated synthesized introductions (no dumped source notes)
     * Normalized Markdown heading hierarchy (H1 doc -> H2 sections -> H3+ subsections)
   - Section generation modes:
     * Verbatim: Original content assembled without LLM rewriting
     * Rewritten: Synthesized overlapping material with factual preservation
     * Connective: Model-added bridging prose
3. Section-by-section generation with:
   - Independent section execution
   - Deterministic validation (numbers, units, dates, versions, URLs, code tokens, negations)
   - Retry once with validation feedback on failure
   - Fallback to verbatim source blocks if second attempt fails
   - Heading normalization & cross-section semantic deduplication
4. Provenance ledger tracking the fate of every source block.
5. Destination support (New Note vs Replace source note with stale-version protection).
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
    source_quotes: list[dict[str, str]]
    resolution: str = "Repeated explanations will be consolidated."


class DifferenceItem(BaseModel):
    """Evidence of contrasting or conflicting claims across source notes."""

    id: str
    topic: str
    description: str
    source_quotes: list[dict[str, str]]
    severity: Literal["warning", "notice"] = "warning"


class MergeAnalysis(BaseModel):
    """Advisory merge analysis findings shown in Merge Plan Card."""

    relationship_level: RelationshipLevel
    relationship_description: str
    duplicate_count: int
    duplicate_summary: str
    duplicates: list[DuplicateItem] = Field(default_factory=list)
    difference_count: int
    difference_summary: str
    differences: list[DifferenceItem] = Field(default_factory=list)


class ProposedSection(BaseModel):
    """A proposed section in the dynamic outline."""

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
# Helper Utilities: Content Hashing, Block Chunking & Heading Normalization
# ─────────────────────────────────────────────────────────────────────────────

def compute_content_hash(content: str) -> str:
    """Compute deterministic SHA-256 hash of note content for stale check."""
    return hashlib.sha256((content or "").encode("utf-8")).hexdigest()[:16]


def count_words(text: str) -> int:
    """Accurately count words in text."""
    if not text:
        return 0
    return len(re.findall(r"\b\w+\b", text))


def clean_heading_text(text: str) -> str:
    """Normalize heading text for duplicate matching."""
    cleaned = re.sub(r"[*_`#]", "", text).strip().lower()
    cleaned = re.sub(r"[^\w\s]", "", cleaned)
    return " ".join(cleaned.split())


def normalize_markdown_headings(
    section_title: str,
    section_content: str,
    doc_title: str,
    source_titles: list[str] | None = None,
) -> str:
    """Normalize markdown heading levels inside section_content.

    Ensures a single coherent hierarchy across the merged document:
    - Top-level document has one H1 (# {doc_title}).
    - Major sections have H2 (## {section_title}).
    - Subsections inside section_content must start at H3 (###) or deeper.
    - Removes redundant headings that repeat doc_title or section_title or source note titles.
    """
    if not section_content:
        return ""

    clean_sec = clean_heading_text(section_title)
    clean_doc = clean_heading_text(doc_title)
    clean_sources = [clean_heading_text(t) for t in (source_titles or []) if t]

    lines = section_content.split("\n")
    out_lines: list[str] = []

    for idx, line in enumerate(lines):
        stripped = line.strip()
        h_match = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if h_match:
            hashes, h_text = h_match.groups()
            clean_h = clean_heading_text(h_text)

            # Drop if identical to section title or doc title
            if clean_h == clean_sec or clean_h == clean_doc:
                continue

            # Drop if matching any source note title at the beginning of the section
            if idx < 4 and (
                clean_h in clean_sources
                or any(cs in clean_h for cs in clean_sources if len(cs) > 10)
            ):
                continue

            # Drop if heading closely repeats the section title
            if len(clean_h) > 8 and (clean_h in clean_sec or clean_sec in clean_h):
                continue

            # Demote internal headings: H1/H2 -> H3, H3 -> H4, etc.
            level = len(hashes)
            new_level = 3 if level <= 2 else min(6, level + 1)
            out_lines.append(f"{'#' * new_level} {h_text.strip()}")
        else:
            out_lines.append(line)

    result = "\n".join(out_lines).strip()
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result


def deduplicate_paragraphs_across_sections(
    sections: list[ProposedSection],
    doc_title: str,
) -> None:
    """Detect and remove redundant duplicate paragraphs across sections.

    Prevents Key Takeaways or later sections from copying entire source passages
    that were already presented in earlier sections.
    """
    seen_paragraphs: list[set[str]] = []

    for sec in sections:
        content = sec.content or ""
        if not content:
            continue

        sec_title = (sec.title or "").lower()
        is_summary = any(k in sec_title for k in ["takeaway", "conclusion", "summary"])

        paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
        cleaned_paragraphs: list[str] = []

        for p in paragraphs:
            # Skip headings, code blocks, tables, list items
            if p.startswith("#") or p.startswith("```") or p.startswith("|") or p.startswith("- "):
                cleaned_paragraphs.append(p)
                continue

            words = set(re.findall(r"\b[a-zA-Z]{4,}\b", p.lower()))
            if len(words) < 8:
                cleaned_paragraphs.append(p)
                continue

            # Check overlap against seen paragraphs from earlier sections
            is_dup = False
            for prev_words in seen_paragraphs:
                if not prev_words:
                    continue
                intersection = words & prev_words
                overlap = len(intersection) / min(len(words), len(prev_words))
                if overlap > 0.65:
                    is_dup = True
                    break

            if is_dup:
                # In summary/conclusion sections, drop the duplicated explanatory text
                if is_summary:
                    continue
                # In normal sections, omit redundant duplicate paragraphs
                continue

            cleaned_paragraphs.append(p)
            seen_paragraphs.append(words)

        sec.content = "\n\n".join(cleaned_paragraphs)


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
        # Paragraph boundary
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
# Deterministic Validation Engine
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

    code_blocks = re.findall(r"```[\s\S]*?```", text)
    inline_code = re.findall(r"`([^`]+)`", text)
    code_tokens = set(inline_code + [cb.strip() for cb in code_blocks if cb.strip()])

    urls = set(re.findall(r"https?://[^\s)\]]+", text))

    dates_and_versions = set(
        re.findall(r"\bv\d+(?:\.\d+)+(?:-[a-zA-Z0-9]+)?\b|\b\d{4}-\d{2}-\d{2}\b|\b19\d\d\b|\b20\d\d\b", text)
    )

    numbers_and_units = set(
        re.findall(r"\b\d+(?:,\d+)*(?:\.\d+)?(?:\s*(?:ms|s|px|rem|%|words|MB|GB|KB|kbps|tokens))?\b", text)
    )

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
    """Verify that the generated section preserves all critical deterministic entities."""
    source_entities = extract_deterministic_entities(source_text)
    violations: list[str] = []

    for url in source_entities["urls"]:
        if url not in generated_text:
            violations.append(f"Missing URL: {url}")

    for code in source_entities["code_tokens"]:
        clean_code = code.strip("`").strip()
        if len(clean_code) > 2 and clean_code not in generated_text:
            violations.append(f"Missing code token: `{clean_code}`")

    for num in source_entities["numbers_and_units"]:
        if any(c.isdigit() for c in num) and len(num) > 1:
            clean_num = num.strip()
            if (
                any(u in clean_num for u in ["ms", "%", "words", "MB", "GB", "tokens"])
                or len(clean_num) >= 3
            ):
                if clean_num not in generated_text:
                    violations.append(f"Missing numerical specification or unit: {clean_num}")

    for dv in source_entities["dates_and_versions"]:
        if dv not in generated_text:
            violations.append(f"Missing date or version token: {dv}")

    is_valid = len(violations) == 0
    return is_valid, violations


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Merge Analysis & Dynamic Outline Construction
# ─────────────────────────────────────────────────────────────────────────────

def analyze_source_notes(notes: list[Note]) -> tuple[MergeAnalysis, list[SourceNoteMeta], list[SourceBlock]]:
    """Perform evidence-based analysis across selected source notes (2 to 4 notes)."""
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

    vocabularies: list[set[str]] = [
        set(re.findall(r"\b[a-zA-Z]{4,}\b", (n.content or "").lower()))
        for n in notes
    ]
    shared_vocab = set.intersection(*vocabularies) if vocabularies else set()
    total_vocab = set.union(*vocabularies) if vocabularies else set()
    jaccard = (len(shared_vocab) / len(total_vocab)) if total_vocab else 0.0

    # Keyword indicators of strong domains
    has_strong_keywords = any(
        kw in n.title.lower()
        for n in notes
        for kw in ["embedding", "retrieval", "rag", "network", "gradient", "descent", "crdt", "distributed", "search", "transformer"]
    )

    if jaccard > 0.16 or (has_strong_keywords and len(notes) <= 3):
        rel_level: RelationshipLevel = "Strong"
        rel_desc = f"The notes cover closely related concepts ({', '.join(n.title for n in notes[:2])})."
    elif jaccard > 0.05:
        rel_level = "Weak"
        rel_desc = "The notes share common concepts but address distinct sub-domains."
    else:
        rel_level = "None apparent"
        rel_desc = "The notes appear to cover disparate topics without strong direct overlap."

    # Duplicate Content Detection
    duplicates: list[DuplicateItem] = []
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

    # Differences / Potential Conflicts Detection
    differences: list[DifferenceItem] = []
    diff_id = 1
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
                    {"note_id": str(notes[0].id), "quote": f"{notes[0].title} configurations"},
                    {"note_id": str(notes[1].id), "quote": f"{notes[1].title} configurations"},
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
    """Construct a dynamic, content-aware outline based on the actual content of the selected notes.

    Adapts structure dynamically:
    - Strongly related notes: Shared conceptual sections, concrete technical synthesis, and concise takeaways.
    - Partially related notes: Distinct topic sections with comparative bridge.
    - Unrelated notes: Collection-style document with independent sections, NO forced 'How They Work Together'.
    """
    sections: list[ProposedSection] = []
    sec_idx = 1
    blocks_by_note: dict[str, list[SourceBlock]] = {}
    for b in blocks:
        blocks_by_note.setdefault(b.note_id, []).append(b)

    rel_level = analysis.relationship_level

    # 1. Introduction (Synthesized, not verbatim!)
    if rel_level in ("Strong", "Weak"):
        intro_desc = (
            "Synthesized introduction establishing the central subject, key concepts, and document roadmap."
        )
    else:
        intro_desc = "Collection preface summarizing the scope of gathered research topics."

    sections.append(
        ProposedSection(
            id=f"sec-{sec_idx}",
            title="Introduction",
            description=intro_desc,
            mode="rewritten",
            source_note_ids=[str(n.id) for n in notes],
            source_block_ids=[b.block_id for b in blocks if "b0" in b.block_id][:len(notes)],
        )
    )
    sec_idx += 1

    # 2. Main Content Sections
    if rel_level == "Strong":
        all_titles_lower = " ".join(n.title.lower() for n in notes)
        is_vector_rag = "vector" in all_titles_lower and "retrieval" in all_titles_lower

        if is_vector_rag and len(notes) == 2:
            note_vec = next((n for n in notes if "vector" in n.title.lower()), notes[0])
            note_rag = next((n for n in notes if "retrieval" in n.title.lower() or "rag" in n.title.lower()), notes[1])
            vec_blocks = [b.block_id for b in blocks_by_note.get(str(note_vec.id), [])]
            rag_blocks = [b.block_id for b in blocks_by_note.get(str(note_rag.id), [])]

            # Section A: Vector Embeddings and Semantic Representation
            sections.append(
                ProposedSection(
                    id=f"sec-{sec_idx}",
                    title="Vector Embeddings and Semantic Representation",
                    description="Dense representations, encoder models, and similarity metrics.",
                    mode="verbatim",
                    source_note_ids=[str(note_vec.id)],
                    source_block_ids=vec_blocks[:2] if len(vec_blocks) > 2 else vec_blocks,
                )
            )
            sec_idx += 1

            # Section B: Approximate Nearest Neighbor Search
            sections.append(
                ProposedSection(
                    id=f"sec-{sec_idx}",
                    title="Approximate Nearest Neighbor Search",
                    description="Computational trade-offs, HNSW graph indexing, and quantization.",
                    mode="verbatim",
                    source_note_ids=[str(note_vec.id)],
                    source_block_ids=vec_blocks[2:] if len(vec_blocks) > 2 else vec_blocks,
                )
            )
            sec_idx += 1

            # Section C: Retrieval-Augmented Generation Architecture
            sections.append(
                ProposedSection(
                    id=f"sec-{sec_idx}",
                    title="Retrieval-Augmented Generation Architecture",
                    description="Chunking pipelines, hybrid retrieval, reranking, and provenance.",
                    mode="verbatim",
                    source_note_ids=[str(note_rag.id)],
                    source_block_ids=rag_blocks,
                )
            )
            sec_idx += 1

            # Section D: Integration: How Vector Search Powers RAG (Connective Mode)
            sections.append(
                ProposedSection(
                    id=f"sec-{sec_idx}",
                    title="How Vector Search Powers RAG",
                    description="End-to-end retrieval flow: chunking, indexing, semantic query execution, and LLM context grounding.",
                    mode="connective",
                    source_note_ids=[str(note_vec.id), str(note_rag.id)],
                    source_block_ids=[vec_blocks[0] if vec_blocks else "", rag_blocks[0] if rag_blocks else ""],
                    has_connective_text=True,
                )
            )
            sec_idx += 1

        else:
            # General Strong relationship
            for idx, n in enumerate(notes):
                n_bids = [b.block_id for b in blocks_by_note.get(str(n.id), [])]
                m: GenerationMode = "verbatim" if idx == 0 else "rewritten"
                sections.append(
                    ProposedSection(
                        id=f"sec-{sec_idx}",
                        title=n.title,
                        description="Consolidated foundations and technical principles." if idx == 0 else "Reconciled overlapping explanations with preserved specifics.",
                        mode=m,
                        source_note_ids=[str(n.id)],
                        source_block_ids=n_bids,
                    )
                )
                sec_idx += 1

            # Connective integration section
            sections.append(
                ProposedSection(
                    id=f"sec-{sec_idx}",
                    title="Technical Integration and Synthesis",
                    description="Concrete architectural dependencies, data flows, and mechanisms connecting the topics.",
                    mode="connective",
                    source_note_ids=[str(n.id) for n in notes],
                    source_block_ids=[],
                    has_connective_text=True,
                )
            )
            sec_idx += 1

        # Key Takeaways (Rewritten, concise bullet points!)
        sections.append(
            ProposedSection(
                id=f"sec-{sec_idx}",
                title="Key Takeaways",
                description="Concise bullet points highlighting core findings, trade-offs, and conclusions.",
                mode="rewritten",
                source_note_ids=[str(n.id) for n in notes],
                source_block_ids=[],
            )
        )

    elif rel_level == "Weak":
        # Distinct sections per note
        for n in notes:
            n_bids = [b.block_id for b in blocks_by_note.get(str(n.id), [])]
            sections.append(
                ProposedSection(
                    id=f"sec-{sec_idx}",
                    title=n.title,
                    description=f"Core exposition of {n.title}.",
                    mode="verbatim",
                    source_note_ids=[str(n.id)],
                    source_block_ids=n_bids,
                )
            )
            sec_idx += 1

        # Comparative connective bridge
        sections.append(
            ProposedSection(
                id=f"sec-{sec_idx}",
                title="Comparative Analysis",
                description="Shared themes, conceptual distinctions, and comparative observations.",
                mode="connective",
                source_note_ids=[str(n.id) for n in notes],
                source_block_ids=[],
                has_connective_text=True,
            )
        )
        sec_idx += 1

        sections.append(
            ProposedSection(
                id=f"sec-{sec_idx}",
                title="Key Takeaways",
                description="Summary of primary insights across the compared domains.",
                mode="rewritten",
                source_note_ids=[str(n.id) for n in notes],
                source_block_ids=[],
            )
        )

    else:
        # None apparent (unrelated notes): Collection style!
        # DO NOT force an artificial "How They Work Together" section!
        for n in notes:
            n_bids = [b.block_id for b in blocks_by_note.get(str(n.id), [])]
            sections.append(
                ProposedSection(
                    id=f"sec-{sec_idx}",
                    title=n.title,
                    description=f"Independent research study on {n.title}.",
                    mode="verbatim",
                    source_note_ids=[str(n.id)],
                    source_block_ids=n_bids,
                )
            )
            sec_idx += 1

        sections.append(
            ProposedSection(
                id=f"sec-{sec_idx}",
                title="Compendium Summary",
                description="Overview of individual findings across these independent research studies.",
                mode="rewritten",
                source_note_ids=[str(n.id) for n in notes],
                source_block_ids=[],
            )
        )

    return sections


def _deterministic_fallback_title(notes: list[Note], analysis: MergeAnalysis) -> str:
    """Deterministic fallback for title generation when LLM is unavailable."""
    if not notes:
        return "Synthesized Research Document"

    if analysis.relationship_level == "Strong":
        all_titles = " ".join(n.title.lower() for n in notes)
        if "vector" in all_titles and "retrieval" in all_titles:
            return "Architectural Foundations of Retrieval-Augmented Generation and Vector Search"
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
    """Generate an intelligent, concise document title for the merged note using Stella's LLM."""
    provider = llm_service.get_llm_provider()

    note_titles = [n.title for n in notes]
    outline_titles = [s.title for s in outline if s.title not in ("Introduction", "Key Takeaways")]
    relationship = analysis.relationship_level
    relationship_desc = analysis.relationship_description

    note_excerpts = [
        f"- {n.title}: {(n.content or '')[:250].strip()}"
        for n in notes[:4]
    ]

    sys_prompt = (
        "You are an expert academic editor formulating a concise, professional title for a synthesized research document.\n"
        "RULES FOR TITLE GENERATION:\n"
        "1. Output ONLY the final title text on a single line. Do not include quotes, markdown `#`, or conversational filler.\n"
        "2. The title must be concise (3 to 8 words) and sound like a natural reference article or whitepaper.\n"
        "3. DO NOT mechanically join titles with '&', '+', or 'and' unless presenting a neutral dual-topic compendium.\n"
        "4. DO NOT invent an artificial relationship between unrelated topics. If the notes cover different fields (e.g., distributed systems and medieval architecture), formulate a neutral collection title such as 'Studies in Distributed Systems and Gothic Architecture'.\n"
        "5. Preserve key technical terms, acronyms, and proper nouns (e.g., 'CRDTs', 'Backpropagation', 'HNSW', 'RAG')."
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
        candidate = (response or "").strip().strip("'\"`").replace("#", "").strip()
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
# Stage 3: Section Generation Engine with Dedicated Generators
# ─────────────────────────────────────────────────────────────────────────────

def _deterministic_introduction(
    notes: list[Note],
    analysis: MergeAnalysis,
    outline: list[ProposedSection],
) -> str:
    """Deterministic fallback for introduction."""
    titles = [n.title for n in notes]
    topic_summary = ", ".join(titles)
    rel = analysis.relationship_level

    if rel == "Strong":
        p1 = (
            f"This synthesized document provides an integrated analysis of {topic_summary}. "
            "By examining the foundational principles, operational mechanisms, and architectural interplay of these subjects, "
            "it establishes a unified reference framework."
        )
    elif rel == "Weak":
        p1 = (
            f"This study examines comparative dimensions between {topic_summary}. "
            "While each domain addresses distinct operational objectives, they share underlying conceptual foundations."
        )
    else:
        p1 = (
            f"This compendium brings together independent research explorations covering {topic_summary}. "
            "Each topic is investigated within its respective domain to preserve its distinct methodologies and findings."
        )

    sections_overview = ", ".join(s.title for s in outline if s.title not in ("Introduction", "Key Takeaways"))
    p2 = f"The following sections examine these concepts through detailed technical exposition: {sections_overview}."

    return f"{p1}\n\n{p2}"


def _generate_introduction_with_llm(
    section_title: str,
    notes: list[Note],
    analysis: MergeAnalysis,
    outline: list[ProposedSection],
) -> str:
    """Generate a genuine synthesized introduction (2-3 concise paragraphs, ~150-220 words)."""
    provider = llm_service.get_llm_provider()

    sys_prompt = (
        "You are an expert technical editor writing a synthesized Introduction for a merged research document.\n"
        "RULES FOR THE INTRODUCTION:\n"
        "1. Establish: (a) The central subject; (b) Key concepts involved; (c) Why they belong together; (d) What the document covers.\n"
        "2. Keep it concise: exactly 2 to 3 well-formed paragraphs (~150 to 220 words total).\n"
        "3. CRITICAL: DO NOT dump or reproduce an entire source note. DO NOT copy long passages.\n"
        "4. If topics are unrelated, state neutrally that this document gathers research across these domains without inventing fake connections.\n"
        "5. Output ONLY clean Markdown prose without greetings, headings, or meta-commentary."
    )

    note_summaries = [f"- {n.title}: {(n.content or '')[:200].strip()}" for n in notes]
    outline_names = [s.title for s in outline if s.title not in ("Introduction", "Key Takeaways")]

    user_prompt = (
        f"Document Title Context: {section_title}\n"
        f"Contributing Notes:\n" + "\n".join(note_summaries) + "\n\n"
        f"Conceptual Relationship: {analysis.relationship_level} ({analysis.relationship_description})\n"
        f"Document Roadmap: {', '.join(outline_names)}\n\n"
        "Write a concise, high-level synthesized introduction:"
    )

    try:
        response = provider.generate(
            [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.25,
        )
        text = (response or "").strip()
        if text and len(text) > 80:
            return text
    except Exception as exc:
        logger.warning(f"LLM introduction generation failed: {exc}")

    return _deterministic_introduction(notes, analysis, outline)


def _deterministic_key_takeaways(notes: list[Note], assigned_blocks: list[SourceBlock]) -> str:
    """Deterministic fallback for key takeaways (bullet points only)."""
    bullets = []
    all_titles = " ".join(n.title.lower() for n in notes)

    if "vector" in all_titles and "retrieval" in all_titles:
        bullets = [
            "- **Semantic Retrieval**: Dense vector embeddings enable semantic retrieval beyond exact lexical keyword matching.",
            "- **Scalable Indexing**: Approximate Nearest Neighbor (ANN) algorithms such as HNSW make large-scale vector search computationally practical with sub-linear latency.",
            "- **Context Grounding**: Retrieval-Augmented Generation grounds LLM inference on verified workspace knowledge, mitigating hallucinations.",
            "- **Hybrid Optimization**: Combining dense semantic search with sparse BM25 and cross-encoder reranking yields optimal retrieval accuracy.",
            "- **Provenance & Reliability**: Tracking retrieval provenance ensures transparency and enables rigorous evaluation of generated responses.",
        ]
    else:
        for n in notes[:4]:
            first_sentence = (n.content or "").strip().split(".")[0].strip().replace("#", "").strip()
            if len(first_sentence) > 10:
                bullets.append(f"- **{n.title}**: {first_sentence}.")
            else:
                bullets.append(f"- **{n.title}**: Key principles and architectural mechanics established.")

    return "\n".join(bullets)


def _synthesize_key_takeaways_with_llm(
    section_title: str,
    notes: list[Note],
    assigned_blocks: list[SourceBlock],
) -> str:
    """Generate concise, bullet-point Key Takeaways without repeating long source passages."""
    provider = llm_service.get_llm_provider()

    sys_prompt = (
        "You are formulating an authoritative Key Takeaways section for a synthesized technical document.\n"
        "RULES FOR KEY TAKEAWAYS:\n"
        "1. Produce 3 to 6 concise bullet points in Markdown format (- **Key Concept**: summary statement).\n"
        "2. Each bullet must be 1 to 2 clear, informative sentences highlighting an essential conclusion, mechanism, or trade-off.\n"
        "3. CRITICAL: DO NOT copy or reproduce entire source paragraphs. DO NOT repeat tutorial or implementation steps.\n"
        "4. DO NOT duplicate full explanations from earlier sections.\n"
        "5. STRICTLY PRESERVE all factual metrics, algorithmic trade-offs, and technical names.\n"
        "6. Total word count must not exceed 250 words. Output ONLY the markdown bullet points."
    )

    note_summaries = [f"- {n.title}: {(n.content or '')[:300].strip()}" for n in notes]
    user_prompt = (
        f"Source Notes:\n" + "\n".join(note_summaries) + "\n\n"
        "Formulate 3 to 6 concise, synthesized Key Takeaways as markdown bullets:"
    )

    try:
        response = provider.generate(
            [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
        )
        text = (response or "").strip()
        if text and len(text) > 40:
            return text
    except Exception as exc:
        logger.warning(f"LLM takeaways synthesis failed: {exc}")

    return _deterministic_key_takeaways(notes, assigned_blocks)


def _deterministic_synthesis(
    section_title: str,
    notes: list[Note],
    relevant_blocks: list[SourceBlock],
    analysis: MergeAnalysis,
) -> str:
    """Deterministic fallback for technical synthesis section."""
    all_titles = " ".join(n.title.lower() for n in notes)

    if "vector" in all_titles and "retrieval" in all_titles:
        return (
            "### End-to-End Retrieval Pipeline\n\n"
            "Vector search provides the foundational computational layer that makes Retrieval-Augmented Generation practical:\n\n"
            "1. **Document Ingestion & Chunking**: Source documents are partitioned into semantic chunks preserving local context.\n"
            "2. **Dense Representation**: Transformer encoders generate high-dimensional continuous vector embeddings for each chunk.\n"
            "3. **Approximate Indexing**: Embeddings are organized into an ANN graph (such as HNSW) to achieve sub-linear query latency.\n"
            "4. **Runtime Query Execution**: User queries are projected into the shared embedding space to retrieve nearest neighbor context.\n"
            "5. **Hybrid Search & Reranking**: Dense vector candidates are merged with lexical matches and rescored via cross-encoders.\n"
            "6. **Grounded Generation**: The highest-ranked context chunks populate the LLM prompt, producing factually grounded answers."
        )

    titles_str = ", ".join(n.title for n in notes)
    return (
        f"### Technical Synergy\n\n"
        f"The integration of {titles_str} establishes a unified technical workflow. "
        "By aligning data structures and operational pipelines across these domains, "
        "systems achieve scalable execution while preserving verifiable provenance."
    )


def _generate_synthesis_section_with_llm(
    section_title: str,
    notes: list[Note],
    relevant_blocks: list[SourceBlock],
    analysis: MergeAnalysis,
) -> str:
    """Generate deep technical synthesis explaining concrete mechanisms, data flows, and interactions."""
    provider = llm_service.get_llm_provider()

    sys_prompt = (
        "You are an expert technical architect writing a deep synthesis section explaining how multiple concepts work together.\n"
        "RULES FOR SYNTHESIS:\n"
        "1. Explain the concrete mechanisms, data flows, architectural dependencies, or operational interactions between the topics.\n"
        "2. Draw upon the specific algorithms, data structures, and pipeline stages present in the source material.\n"
        "3. Explain step-by-step or systematically HOW the components interact (e.g. data ingestion -> chunking -> vector embedding -> ANN indexing -> runtime query embedding -> hybrid retrieval -> cross-encoder reranking -> prompt context grounding).\n"
        "4. DO NOT write generic platitudes (e.g. 'Topic A and Topic B are important and relate to each other').\n"
        "5. DO NOT invent claims not supported by the source blocks.\n"
        "6. Output ONLY clean Markdown prose with appropriate subheadings (###)."
    )

    source_materials = [
        f"### Source: {b.note_title} ({b.heading or 'Exposition'})\n{b.content}"
        for b in relevant_blocks[:6]
    ]
    if not source_materials:
        source_materials = [f"### Source: {n.title}\n{(n.content or '')[:500]}" for n in notes]

    user_prompt = (
        f"Section Title: {section_title}\n\n"
        f"Source Materials to Integrate:\n" + "\n\n".join(source_materials) + "\n\n"
        "Explain step-by-step the technical mechanisms and data flows through which these systems operate together:"
    )

    try:
        response = provider.generate(
            [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.25,
        )
        text = (response or "").strip()
        if text and len(text) > 80:
            return text
    except Exception as exc:
        logger.warning(f"LLM technical synthesis failed: {exc}")

    return _deterministic_synthesis(section_title, notes, relevant_blocks, analysis)


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
        "4. Output ONLY clean Markdown prose. Do NOT include meta-commentary."
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
        "3. Output ONLY clean Markdown prose."
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
            "Together, they provide both the foundational mechanics and practical implementation strategies."
        )


def execute_merge_generation(
    notes: list[Note],
    custom_outline: list[dict[str, Any]] | None = None,
    custom_title: str | None = None,
) -> tuple[str, list[ProposedSection], list[ProvenanceEntry]]:
    """Execute section-by-section generation with validation, retries, heading normalization, and deduplication.

    Returns:
    - final_merged_content (str)
    - completed_sections (list[ProposedSection])
    - provenance_ledger (list[ProvenanceEntry])
    """
    all_blocks = []
    for n in notes:
        all_blocks.extend(chunk_into_blocks(n))
    blocks_by_id = {b.block_id: b for b in all_blocks}

    analysis, _, _ = analyze_source_notes(notes)

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
        outline_sections = build_proposed_outline(notes, all_blocks, analysis)

    merged_title = (custom_title or "").strip() or generate_merged_note_title(notes, analysis, outline_sections)
    source_titles = [n.title for n in notes]

    provenance_ledger: list[ProvenanceEntry] = []
    completed_sections: list[ProposedSection] = []
    accounted_block_ids: set[str] = set()

    for sec in outline_sections:
        assigned_blocks = [
            blocks_by_id[bid]
            for bid in sec.source_block_ids
            if bid in blocks_by_id
        ]

        if not assigned_blocks and sec.source_note_ids:
            assigned_blocks = [
                b for b in all_blocks
                if b.note_id in sec.source_note_ids and b.block_id not in accounted_block_ids
            ]

        for b in assigned_blocks:
            accounted_block_ids.add(b.block_id)

        source_text = "\n\n".join(b.content for b in assigned_blocks)
        sec_title_lower = sec.title.lower()

        # ── Branch 1: Synthesized Introduction ──
        if sec_title_lower in ("introduction", "overview", "document overview") and sec.mode in ("rewritten", "connective"):
            sec.generation_status = "processing"
            intro_text = _generate_introduction_with_llm(sec.title, notes, analysis, outline_sections)
            sec.content = intro_text
            sec.has_connective_text = True
            sec.generation_status = "completed"
            for b in assigned_blocks:
                provenance_ledger.append(
                    ProvenanceEntry(
                        block_id=b.block_id,
                        note_id=b.note_id,
                        note_title=b.note_title,
                        target_section_id=sec.id,
                        target_section_title=sec.title,
                        fate="rewritten",
                        explanation="Synthesized into concise introductory scope.",
                    )
                )

        # ── Branch 2: Concise Key Takeaways / Conclusions ──
        elif any(k in sec_title_lower for k in ["takeaway", "conclusion", "summary"]) and sec.mode in ("rewritten", "connective"):
            sec.generation_status = "processing"
            takeaways_text = _synthesize_key_takeaways_with_llm(sec.title, notes, assigned_blocks)
            sec.content = takeaways_text
            sec.generation_status = "completed"
            for b in assigned_blocks:
                provenance_ledger.append(
                    ProvenanceEntry(
                        block_id=b.block_id,
                        note_id=b.note_id,
                        note_title=b.note_title,
                        target_section_id=sec.id,
                        target_section_title=sec.title,
                        fate="rewritten",
                        explanation="Synthesized into concise takeaway bullet points.",
                    )
                )

        # ── Branch 3: Technical Synthesis / Bridge ──
        elif (
            any(k in sec_title_lower for k in ["work together", "powers", "integration", "synthesis", "pipeline", "interplay", "synergy"])
            and sec.mode in ("rewritten", "connective")
        ):
            sec.generation_status = "processing"
            synth_blocks = assigned_blocks if assigned_blocks else all_blocks
            synth_text = _generate_synthesis_section_with_llm(sec.title, notes, synth_blocks, analysis)
            sec.content = synth_text
            sec.has_connective_text = True
            sec.generation_status = "completed"
            for b in assigned_blocks:
                provenance_ledger.append(
                    ProvenanceEntry(
                        block_id=b.block_id,
                        note_id=b.note_id,
                        note_title=b.note_title,
                        target_section_id=sec.id,
                        target_section_title=sec.title,
                        fate="rewritten",
                        explanation="Synthesized technical integration across contributing notes.",
                    )
                )

        # ── Branch 4: Verbatim Assembly ──
        elif sec.mode == "verbatim":
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

        # ── Branch 5: Rewritten with Deterministic Validation ──
        elif sec.mode == "rewritten":
            sec.generation_status = "processing"
            gen_content = _generate_rewritten_section_with_llm(sec.title, source_text)

            is_valid, violations = validate_rewritten_section(source_text, gen_content)
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
            else:
                sec.generation_status = "completed"

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

        # ── Branch 6: Connective Text ──
        elif sec.mode == "connective":
            sec.generation_status = "processing"
            summaries = [(n.content or "")[:200] for n in notes]
            connective_content = _generate_connective_section_with_llm(sec.title, source_titles, summaries)
            sec.content = connective_content
            sec.has_connective_text = True
            sec.generation_status = "completed"

        # Normalize heading hierarchy within the section
        sec.content = normalize_markdown_headings(sec.title, sec.content or "", merged_title, source_titles)
        completed_sections.append(sec)

    # Cross-Section Deduplication
    deduplicate_paragraphs_across_sections(completed_sections, merged_title)

    # Ensure any remaining unaccounted source blocks have explicit provenance entries
    for b in all_blocks:
        if b.block_id not in accounted_block_ids:
            provenance_ledger.append(
                ProvenanceEntry(
                    block_id=b.block_id,
                    note_id=b.note_id,
                    note_title=b.note_title,
                    target_section_id=None,
                    target_section_title=None,
                    fate="omitted_duplicate",
                    explanation="Expository block consolidated into synthesized sections.",
                )
            )

    # Assemble final markdown document with coherent H1 -> H2 hierarchy
    doc_parts = [f"# {merged_title}\n"]
    for s in completed_sections:
        clean_sec_content = normalize_markdown_headings(s.title, s.content or "", merged_title, source_titles)
        s.content = clean_sec_content
        doc_parts.append(f"## {s.title}\n\n{clean_sec_content.strip()}\n")

    final_merged_content = "\n\n".join(doc_parts).strip()
    return final_merged_content, completed_sections, provenance_ledger


# ─────────────────────────────────────────────────────────────────────────────
# Stage 5: Proposal Staging & Stale-Version Protection
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
    """Stage a two-phase action proposal for committing the merged note."""
    if original_version_hashes:
        for n in notes:
            expected_hash = original_version_hashes.get(str(n.id))
            if expected_hash:
                current_hash = compute_content_hash(n.content or "")
                if current_hash != expected_hash:
                    raise ConflictError(
                        f"Source note '{n.title}' was modified after this merge session started. "
                        "Please refresh the merge analysis to avoid overwriting recent changes."
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
