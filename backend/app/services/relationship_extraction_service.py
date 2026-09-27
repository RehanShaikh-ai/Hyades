"""Relationship extraction service.

Canonical service per CONTRACT v0.3.2 §5.3, §8.1-§8.2.
Extracts semantic relationships between co-occurring entities in note chunks.
"""

import json
import logging
import re
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import ExtractionFailedError
from app.models.content_chunk import ContentChunk
from app.models.entity_chunk import EntityChunk
from app.models.graph_entity import GraphEntity
from app.models.graph_relationship import GraphRelationship
from app.models.note import Note
from app.services import llm_service

logger = logging.getLogger("app.services.relationship_extraction_service")

RELATIONSHIP_SYSTEM_PROMPT = """You are a knowledge graph relationship extraction assistant.
Given a text and a list of identified entities in that text, identify relationships
between pairs of entities.
Return ONLY a valid JSON object in the following format:
{
  "relationships": [
    {
      "source": "Entity A Name",
      "target": "Entity B Name",
      "type": "relationship_type (e.g. related_to, part_of, prerequisite_of, used_in, contradicts)",
      "description": "Short explanation of the relationship",
      "confidence": 0.85
    }
  ]
}
Rules:
1. 'source' and 'target' MUST exactly match names from the provided entities list.
2. Do not invent entities not in the list.
3. Self-relationships (source == target) are forbidden.
4. Do not include markdown formatting outside the JSON block.
"""


MAX_TRANSIENT_RETRIES = 3
MAX_SCHEMA_RETRIES = 2
INITIAL_BACKOFF_SECONDS = 0.5


def _clean_json_text(text: str) -> str:
    """Strip markdown code fence if present."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
        text = re.sub(r"\s*```$", "", text, flags=re.MULTILINE)
    return text.strip()


def extract_relationships(
    text: str,
    entities: list[str],
    model: str | None = None,
) -> list[dict[str, Any]]:
    """Call LLM to extract relationships between identified entities per CONTRACT §8.2.

    Implements:
    - Structured output / JSON object generation based on provider capability
    - Bounded retries with exponential backoff for transient LLM/provider failures
    - Pydantic schema validation with bounded schema retry
    """
    import time

    from pydantic import ValidationError as PydanticValidationError

    from app.schemas.graph_relationship import ExtractedRelationshipsPayload

    if not text or not entities or len(entities) < 2:
        return []

    provider = llm_service.get_llm_provider(model=model)
    entities_str = ", ".join(f"'{e}'" for e in entities)
    user_prompt = (
        f"Entities identified: [{entities_str}]\n\n"
        f"Text:\n{text}\n\n"
        f"Extract relationships between these entities."
    )

    # Determine generation options based on provider capabilities
    gen_kwargs: dict[str, Any] = {}
    if getattr(provider, "supports_json_schema", False):
        schema_dict = ExtractedRelationshipsPayload.model_json_schema()
        gen_kwargs["response_format"] = {
            "type": "json_schema",
            "json_schema": {
                "name": "relationships_extraction",
                "schema": schema_dict,
                "strict": True,
            },
        }
    elif getattr(provider, "supports_json_object", False):
        gen_kwargs["response_format"] = {"type": "json_object"}

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": RELATIONSHIP_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    schema_attempts = 0
    while schema_attempts <= MAX_SCHEMA_RETRIES:
        response_text: str | None = None
        transient_attempts = 0
        last_transient_exc: Exception | None = None

        while transient_attempts < MAX_TRANSIENT_RETRIES:
            try:
                response_text = provider.generate(messages, **gen_kwargs)
                break
            except Exception as exc:
                if llm_service.is_transient_error(exc):
                    transient_attempts += 1
                    last_transient_exc = exc
                    sleep_time = INITIAL_BACKOFF_SECONDS * (2 ** (transient_attempts - 1))
                    logger.warning(
                        "Transient error in relationship extraction (attempt %d/%d): %s. "
                        "Backoff %.1fs",
                        transient_attempts,
                        MAX_TRANSIENT_RETRIES,
                        exc,
                        sleep_time,
                    )
                    time.sleep(sleep_time)
                else:
                    logger.error("Non-transient LLM error in relationship extraction: %s", exc)
                    raise ExtractionFailedError(f"Relationship extraction failed: {exc}") from exc

        if response_text is None:
            err_msg = (
                f"Relationship extraction exhausted {MAX_TRANSIENT_RETRIES} transient "
                f"retries: {last_transient_exc}"
            )
            raise ExtractionFailedError(err_msg) from last_transient_exc

        cleaned = _clean_json_text(response_text)
        try:
            raw_data = json.loads(cleaned)
            # Pydantic schema validation
            validated_payload = ExtractedRelationshipsPayload.model_validate(raw_data)

            entity_map = {e.lower(): e for e in entities}
            sanitized_relationships = []

            for item in validated_payload.relationships:
                source_raw = item.source.strip()
                target_raw = item.target.strip()
                source_canon = entity_map.get(source_raw.lower())
                target_canon = entity_map.get(target_raw.lower())

                if not source_canon or not target_canon:
                    continue
                if source_canon.lower() == target_canon.lower():
                    continue

                rel_type = item.type.strip().lower().replace(" ", "_")
                if not rel_type or len(rel_type) > 100:
                    rel_type = "related_to"

                desc_str = item.description.strip() if item.description else None
                conf = max(0.0, min(1.0, float(item.confidence)))

                sanitized_relationships.append(
                    {
                        "source": source_canon,
                        "target": target_canon,
                        "type": rel_type,
                        "description": desc_str,
                        "confidence": conf,
                    }
                )

            return sanitized_relationships

        except (json.JSONDecodeError, PydanticValidationError) as val_err:
            schema_attempts += 1
            logger.warning(
                "Schema validation failed during relationship extraction (attempt %d/%d): %s",
                schema_attempts,
                MAX_SCHEMA_RETRIES,
                val_err,
            )
            if schema_attempts <= MAX_SCHEMA_RETRIES:
                messages.append({"role": "assistant", "content": response_text})
                prompt_retry = (
                    f"Your previous response produced a validation error: {val_err}. "
                    "Please fix it and return ONLY a valid JSON object matching the schema: "
                    '{"relationships": [{"source": "Entity A", "target": "Entity B", '
                    '"type": "related_to", "description": "text", "confidence": 0.85}]}'
                )
                messages.append({"role": "user", "content": prompt_retry})
            else:
                err_msg = (
                    f"Relationship extraction failed Pydantic validation after "
                    f"{MAX_SCHEMA_RETRIES} attempts: {val_err}"
                )
                raise ExtractionFailedError(err_msg) from val_err

    return []


def extract_relationships_for_note(
    db: Session,
    note_id: uuid.UUID,
    model: str | None = None,
) -> list[GraphRelationship]:
    """Extract relationships between entities linked to a note and persist them."""
    note = db.get(Note, note_id)
    if not note:
        return []

    # Find entities linked to this note via EntityChunk
    entity_chunks = db.scalars(select(EntityChunk).where(EntityChunk.note_id == note_id)).all()

    if not entity_chunks:
        return []

    entity_ids = list({ec.entity_id for ec in entity_chunks})
    if len(entity_ids) < 2:
        return []

    entities = db.scalars(select(GraphEntity).where(GraphEntity.id.in_(entity_ids))).all()

    entity_name_to_id = {e.name.lower(): e.id for e in entities}
    entity_names = [e.name for e in entities]

    # Process by chunk or full text
    chunks = db.scalars(
        select(ContentChunk)
        .where(ContentChunk.note_id == note_id)
        .order_by(ContentChunk.chunk_index.asc())
    ).all()

    extraction_model = model or getattr(settings, "LLM_MODEL", "local-llm")
    extracted_rels: list[dict[str, Any]] = []

    if chunks:
        for chunk in chunks:
            # Entities present in this chunk
            chunk_eids = {ec.entity_id for ec in entity_chunks if ec.chunk_id == chunk.id}
            chunk_entities = [e.name for e in entities if e.id in chunk_eids]
            if len(chunk_entities) >= 2:
                rels = extract_relationships(chunk.content, chunk_entities, model=extraction_model)
                for r in rels:
                    r["_chunk_id"] = chunk.id
                extracted_rels.extend(rels)

        # Fallback to note-level relationship extraction if chunk-level yielded no relationships
        if not extracted_rels and len(entity_names) >= 2:
            rels = extract_relationships(
                note.content or note.title, entity_names, model=extraction_model
            )
            extracted_rels.extend(rels)
    else:
        rels = extract_relationships(
            note.content or note.title, entity_names, model=extraction_model
        )
        extracted_rels.extend(rels)

    saved_relationships: list[GraphRelationship] = []

    for rel_data in extracted_rels:
        src_name = rel_data["source"]
        tgt_name = rel_data["target"]
        src_id = entity_name_to_id.get(src_name.lower())
        tgt_id = entity_name_to_id.get(tgt_name.lower())

        if not src_id or not tgt_id or src_id == tgt_id:
            continue

        rel_type = rel_data["type"]
        desc = rel_data["description"]
        conf = rel_data["confidence"]

        # Check existing relationship
        existing = db.scalars(
            select(GraphRelationship).where(
                GraphRelationship.workspace_id == note.workspace_id,
                GraphRelationship.source_entity_id == src_id,
                GraphRelationship.target_entity_id == tgt_id,
                GraphRelationship.relationship_type == rel_type,
            )
        ).first()

        if existing:
            rel = existing
            if not existing.is_manual:
                existing.confidence = max(existing.confidence, conf)
                if desc and not existing.description:
                    existing.description = desc
        else:
            rel = GraphRelationship(
                workspace_id=note.workspace_id,
                source_entity_id=src_id,
                target_entity_id=tgt_id,
                relationship_type=rel_type,
                description=desc,
                confidence=conf,
                is_manual=False,
            )
            db.add(rel)
            db.flush()

        saved_relationships.append(rel)

        # Attach provenance if chunk is known
        chunk_id = rel_data.get("_chunk_id")
        if chunk_id:
            # Check if there is an EntityChunk provenance to link
            ec = db.scalars(
                select(EntityChunk).where(
                    EntityChunk.entity_id == src_id,
                    EntityChunk.chunk_id == chunk_id,
                )
            ).first()
            if ec and not ec.relationship_id:
                ec.relationship_id = rel.id

    db.commit()
    seen_ids = set()
    unique_rels = []
    for r in saved_relationships:
        if r.id not in seen_ids:
            seen_ids.add(r.id)
            unique_rels.append(r)
    return unique_rels


def extract_relationships_for_pair(
    db: Session,
    workspace_id: uuid.UUID,
    entity_a_id: uuid.UUID,
    entity_b_id: uuid.UUID,
) -> list[GraphRelationship]:
    """Extract or return existing relationships between two entities in a workspace."""
    return db.scalars(
        select(GraphRelationship).where(
            GraphRelationship.workspace_id == workspace_id,
            (
                (GraphRelationship.source_entity_id == entity_a_id)
                & (GraphRelationship.target_entity_id == entity_b_id)
            )
            | (
                (GraphRelationship.source_entity_id == entity_b_id)
                & (GraphRelationship.target_entity_id == entity_a_id)
            ),
        )
    ).all()
