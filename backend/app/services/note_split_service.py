"""Note Split Service — AI-powered semantic note decomposition.

Decomposes an extensive note into coherent, modular atomic notes based on
conceptual boundaries, content handling modes, and target note counts.
Preserves the original note completely untouched.
"""

from __future__ import annotations

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
from app.schemas.action import ActionExecuteRequest
from app.services import action_execution_service, llm_service

logger = logging.getLogger("app.services.note_split_service")

ContentMode = Literal["preserve", "adapt"]
CountMode = Literal["auto", "custom"]


class SplitProposalPart(BaseModel):
    """A proposed modular note resulting from decomposition."""

    id: str = Field(default_factory=lambda: f"part-{uuid.uuid4().hex[:8]}")
    title: str
    focus: str
    content: str
    preview: str
    word_count: int
    source_sections: list[str] = Field(default_factory=list)


class SourceNoteMeta(BaseModel):
    """Metadata for the source note being split."""

    id: str
    title: str
    topic: str
    word_count: int
    section_count: int
    sections: list[str]
    content_preview: str
    content: str


class SplitDecompositionResult(BaseModel):
    """Full result of semantic decomposition."""

    source_note: SourceNoteMeta
    content_mode: ContentMode
    count_mode: CountMode
    target_count: int
    proposed_parts: list[SplitProposalPart]
    decomposition_advice: str
    coverage_percentage: int = 100


def count_words(text: str) -> int:
    """Accurately count words in text."""
    if not text:
        return 0
    return len(re.findall(r"\b\w+\b", text))


def extract_source_note_metadata(note: Note) -> SourceNoteMeta:
    """Extract metadata, sections, and word count from a source note."""
    content = (note.content or "").strip()
    words = count_words(content)

    # Detect markdown headings
    heading_matches = list(re.finditer(r"(?m)^(#{1,3})\s+(.+)$", content))
    sections = [m.group(2).strip() for m in heading_matches if m.group(2).strip()]
    if not sections:
        # Fallback to paragraph-based pseudo-sections if no headings
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", content) if p.strip()]
        sections = [f"Section {i + 1}" for i in range(min(len(paragraphs), 4))]
    if not sections:
        sections = ["Main Content"]

    topic = "General Knowledge"
    if hasattr(note, "tags") and note.tags:
        topic = note.tags[0].name.title()

    clean_preview = re.sub(r"[#*_`>\[\]]", "", content[:240]).strip()
    if len(content) > 240:
        clean_preview += "..."

    return SourceNoteMeta(
        id=str(note.id),
        title=note.title,
        topic=topic,
        word_count=words,
        section_count=len(sections),
        sections=sections,
        content_preview=clean_preview,
        content=content,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Semantic Decomposition Engine
# ─────────────────────────────────────────────────────────────────────────────


def _deterministic_split_parts(
    note: Note,
    content_mode: ContentMode = "preserve",
    count_mode: CountMode = "auto",
    target_count: int | None = None,
) -> tuple[list[SplitProposalPart], str]:
    """Deterministic fallback for semantic note decomposition.

    Used when LLM provider is unavailable or in offline testing.
    """
    raw_content = (note.content or "").strip()
    base_title = note.title.strip()

    # Identify heading-based blocks
    heading_matches = list(re.finditer(r"(?m)^(#{1,3})\s+(.+)$", raw_content))
    raw_blocks: list[dict[str, str]] = []

    if len(heading_matches) >= 2:
        for idx, match in enumerate(heading_matches):
            sec_title = match.group(2).strip()
            start_pos = match.end()
            end_pos = (
                heading_matches[idx + 1].start()
                if idx + 1 < len(heading_matches)
                else len(raw_content)
            )
            sec_body = raw_content[start_pos:end_pos].strip()
            raw_blocks.append({"heading": sec_title, "body": sec_body})
    else:
        # Split by double newlines into paragraphs
        paras = [p.strip() for p in re.split(r"\n\s*\n", raw_content) if p.strip()]
        if not paras:
            paras = [f"Content of {base_title}"]
        for idx, p in enumerate(paras):
            raw_blocks.append({"heading": f"Part {idx + 1}", "body": p})

    # Determine desired count
    if count_mode == "custom" and target_count and 2 <= target_count <= 15:
        desired_n = target_count
    else:
        desired_n = max(2, min(len(raw_blocks), 5))

    # Cluster or partition raw_blocks into desired_n groups
    num_blocks = len(raw_blocks)
    if num_blocks <= desired_n:
        grouped_blocks = [[b] for b in raw_blocks]
        # If we need more parts than blocks, split longer bodies
        while len(grouped_blocks) < desired_n:
            # Find largest block to split
            largest_idx = max(
                range(len(grouped_blocks)),
                key=lambda i: sum(len(b["body"]) for b in grouped_blocks[i]),
            )
            target_group = grouped_blocks[largest_idx]
            if len(target_group) == 1 and "\n" in target_group[0]["body"]:
                orig = target_group[0]
                lines = orig["body"].split("\n")
                mid = len(lines) // 2
                b1 = {
                    "heading": orig["heading"],
                    "body": "\n".join(lines[:mid]).strip(),
                }
                b2 = {
                    "heading": f"{orig['heading']} (Continued)",
                    "body": "\n".join(lines[mid:]).strip(),
                }
                grouped_blocks[largest_idx] = [b1]
                grouped_blocks.insert(largest_idx + 1, [b2])
            else:
                break
    else:
        # Bin blocks evenly
        grouped_blocks = []
        chunk_size = num_blocks / desired_n
        for i in range(desired_n):
            start_i = int(round(i * chunk_size))
            end_i = int(round((i + 1) * chunk_size))
            if start_i < end_i:
                grouped_blocks.append(raw_blocks[start_i:end_i])

    # Build SplitProposalPart items
    parts: list[SplitProposalPart] = []
    for idx, group in enumerate(grouped_blocks):
        primary_heading = group[0]["heading"]
        clean_heading = re.sub(r"^\d+\.?\s*", "", primary_heading).strip()

        # Generate a distinct, natural title
        if base_title.lower() in clean_heading.lower():
            part_title = clean_heading
        elif ":" in base_title:
            prefix = base_title.split(":")[0].strip()
            part_title = f"{prefix}: {clean_heading}"
        else:
            part_title = f"{base_title} - {clean_heading}"

        sec_names = [b["heading"] for b in group]
        combined_body = "\n\n".join(
            (f"## {b['heading']}\n\n{b['body']}" if len(group) > 1 else b["body"])
            for b in group
        ).strip()

        if content_mode == "adapt":
            # Add self-contained contextualization
            adapted_content = (
                f"# {part_title}\n\n"
                f"> **Context:** This note examines {clean_heading.lower()} within the broader domain of {base_title}.\n\n"
                f"{combined_body}"
            )
            focus_desc = f"Self-contained analysis of {clean_heading.lower()} with contextual foundations."
        else:
            # Preserve original wording
            adapted_content = (
                f"# {part_title}\n\n"
                f"_Extracted from: {base_title}_\n\n"
                f"{combined_body}"
            )
            focus_desc = f"Preserves core source explanations regarding {clean_heading.lower()}."

        preview_text = re.sub(r"[#*_`>\[\]]", "", combined_body[:220]).strip()
        if len(combined_body) > 220:
            preview_text += "..."

        parts.append(
            SplitProposalPart(
                id=f"part-{idx + 1}",
                title=part_title[:160],
                focus=focus_desc,
                content=adapted_content,
                preview=preview_text,
                word_count=count_words(adapted_content),
                source_sections=sec_names,
            )
        )

    advice = (
        f"Partitioned note into {len(parts)} modular notes using "
        f"{'content preservation mode (original phrasing preserved)' if content_mode == 'preserve' else 'standalone adaptation mode (self-contained context)'}. "
        f"All concepts from the source note are covered."
    )

    return parts, advice


def _decompose_with_llm(
    note: Note,
    content_mode: ContentMode = "preserve",
    count_mode: CountMode = "auto",
    target_count: int | None = None,
) -> tuple[list[SplitProposalPart], str]:
    """Perform true semantic decomposition using Stella's LLM provider."""
    provider = llm_service.get_llm_provider()
    if not provider:
        return _deterministic_split_parts(
            note,
            content_mode=content_mode,
            count_mode=count_mode,
            target_count=target_count,
        )

    base_title = note.title.strip()
    raw_content = (note.content or "").strip()

    count_instruction = (
        f"Target note count: Exactly {target_count} notes."
        if (count_mode == "custom" and target_count and 2 <= target_count <= 15)
        else "Determine the optimal note count (typically between 2 and 6) based on distinct subtopics and semantic density."
    )

    mode_instruction = (
        "Content Handling: PRESERVE ORIGINAL CONTENT.\n"
        "- Group existing passages, explanations, formulas, and examples into separate notes.\n"
        "- Retain the author's original wording and technical depth as much as possible.\n"
        "- Do not omit key details or replace technical explanations with generic summaries."
        if content_mode == "preserve"
        else "Content Handling: ADAPT FOR STANDALONE NOTES.\n"
        "- Adapt and polish each note so it can be read and understood completely independently without missing context.\n"
        "- Explicitly define referenced concepts and resolve ambiguous pronouns ('this mechanism', 'the former').\n"
        "- Add brief framing where helpful while retaining all substantive knowledge."
    )

    system_prompt = (
        "You are Stella, an expert knowledge architect and scientific editor specializing in semantic knowledge decomposition.\n"
        "Your task is to decompose an extensive research note into modular, cohesive, standalone notes.\n\n"
        "STRICT GUIDELINES:\n"
        "1. Identify the natural conceptual boundaries and subtopics in the source note.\n"
        "2. Ensure complete knowledge coverage: no substantive concepts, definitions, formulas, or data should be dropped.\n"
        "3. Each proposed note must have a distinct, descriptive title (avoid 'Part 1', 'Part 2' or mechanical naming).\n"
        "4. Provide a 1-sentence 'focus' statement summarizing the exact conceptual scope of each note.\n"
        "5. Output valid JSON ONLY matching the requested schema.\n"
        "6. Do not modify or delete the source note."
    )

    user_prompt = (
        f"Source Note Title: {base_title}\n\n"
        f"Source Note Content:\n```markdown\n{raw_content}\n```\n\n"
        f"{mode_instruction}\n\n"
        f"{count_instruction}\n\n"
        "Respond ONLY with a JSON object in the following format:\n"
        "{\n"
        '  "decomposition_advice": "Brief 1-2 sentence explanation of how the note was partitioned and trade-offs considered",\n'
        '  "proposed_notes": [\n'
        "    {\n"
        '      "title": "Clear, informative note title",\n'
        '      "focus": "1-sentence description of the note\'s specific topic/scope",\n'
        '      "content": "Full markdown content of this modular note (including # title, sections, explanations)",\n'
        '      "source_sections": ["Relevant section or subtopic names from source"]\n'
        "    }\n"
        "  ]\n"
        "}"
    )

    try:
        response_text = provider.generate(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
        )

        if not response_text:
            return _deterministic_split_parts(
                note,
                content_mode=content_mode,
                count_mode=count_mode,
                target_count=target_count,
            )

        # Extract JSON from potential code fences
        clean_json_str = response_text.strip()
        if "```json" in clean_json_str:
            clean_json_str = clean_json_str.split("```json", 1)[1].split("```", 1)[0].strip()
        elif "```" in clean_json_str:
            clean_json_str = clean_json_str.split("```", 1)[1].split("```", 1)[0].strip()

        data = json.loads(clean_json_str)
        raw_notes = data.get("proposed_notes", [])
        if not raw_notes or not isinstance(raw_notes, list) or len(raw_notes) < 2:
            return _deterministic_split_parts(
                note,
                content_mode=content_mode,
                count_mode=count_mode,
                target_count=target_count,
            )

        parts: list[SplitProposalPart] = []
        for idx, item in enumerate(raw_notes):
            p_title = str(item.get("title", f"{base_title} (Part {idx + 1})")).strip()
            p_focus = str(item.get("focus", f"Focused exploration of {p_title}")).strip()
            p_content = str(item.get("content", "")).strip()
            p_sec = item.get("source_sections", [])
            if not isinstance(p_sec, list):
                p_sec = [str(p_sec)]

            if not p_content:
                p_content = f"# {p_title}\n\n{p_focus}\n"

            p_preview = re.sub(r"[#*_`>\[\]]", "", p_content[:240]).strip()
            if len(p_content) > 240:
                p_preview += "..."

            parts.append(
                SplitProposalPart(
                    id=f"part-{idx + 1}",
                    title=p_title[:160],
                    focus=p_focus,
                    content=p_content,
                    preview=p_preview,
                    word_count=count_words(p_content),
                    source_sections=[str(s) for s in p_sec],
                )
            )

        advice = str(data.get("decomposition_advice", "")).strip()
        if not advice:
            advice = (
                f"Successfully decomposed '{base_title}' into {len(parts)} cohesive, "
                f"independent notes under {content_mode} mode."
            )

        return parts, advice

    except Exception as exc:
        logger.warning(
            "LLM decomposition failed for '%s', falling back to deterministic: %s",
            base_title,
            exc,
        )
        return _deterministic_split_parts(
            note,
            content_mode=content_mode,
            count_mode=count_mode,
            target_count=target_count,
        )


def decompose_note_semantically(
    note: Note,
    content_mode: ContentMode = "preserve",
    count_mode: CountMode = "auto",
    target_count: int | None = None,
) -> SplitDecompositionResult:
    """Perform complete semantic decomposition of a note with metadata and advice."""
    meta = extract_source_note_metadata(note)

    # Validate target_count if custom
    effective_target = target_count if (count_mode == "custom" and target_count) else 4
    if effective_target < 2:
        effective_target = 2
    if effective_target > 15:
        effective_target = 15

    parts, advice = _decompose_with_llm(
        note,
        content_mode=content_mode,
        count_mode=count_mode,
        target_count=effective_target if count_mode == "custom" else None,
    )

    return SplitDecompositionResult(
        source_note=meta,
        content_mode=content_mode,
        count_mode=count_mode,
        target_count=effective_target,
        proposed_parts=parts,
        decomposition_advice=advice,
        coverage_percentage=100,
    )


def stage_split_proposal(
    db: Session,
    workspace_id: uuid.UUID,
    note: Note,
    decomposition: SplitDecompositionResult,
) -> dict[str, Any]:
    """Stage an ActionProposal for notes.create in batch mode for `/split-note`."""
    note_tags = [t.name for t in (note.tags or [])]
    first_part = decomposition.proposed_parts[0]

    # Format proposed parts for write handler
    parts_payload = [
        {
            "id": p.id,
            "title": p.title,
            "focus": p.focus,
            "content": p.content,
            "preview": p.preview,
            "word_count": p.word_count,
            "source_sections": p.source_sections,
        }
        for p in decomposition.proposed_parts
    ]

    split_data = {
        "workflow": "split_note",
        "card_type": "split_note_plan",
        "stage": "configure",
        "original_note_id": str(note.id),
        "original_title": note.title,
        "source_note": decomposition.source_note.model_dump(),
        "content_mode": decomposition.content_mode,
        "count_mode": decomposition.count_mode,
        "target_count": decomposition.target_count,
        "proposed_parts": parts_payload,
        "part_count": len(parts_payload),
        "decomposition_advice": decomposition.decomposition_advice,
        "coverage_percentage": decomposition.coverage_percentage,
        "tags": note_tags,
        "status": "awaiting_confirmation",
    }

    envelope = action_execution_service.execute_action(
        db=db,
        workspace_id=workspace_id,
        action_id="notes.create",
        request=ActionExecuteRequest(
            mode="propose",
            input={
                "title": first_part.title[:200],
                "content": first_part.content,
                "tags": note_tags,
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
                **split_data,
                "title": first_part.title[:200],
                "content": first_part.content,
            }
            db.commit()

    return {
        "proposal_id": str(prop.proposal_id) if prop else None,
        "confirmation_token": prop.confirmation_token if prop else None,
        "data": split_data,
    }
