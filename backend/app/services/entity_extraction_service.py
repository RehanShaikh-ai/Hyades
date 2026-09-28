"""Entity extraction service.

Canonical service per CONTRACT v0.3.2 §5.3, §8.1-§8.3.
Extracts entities and concepts from notes using LLM structured output.
"""

import json
import logging
import re
import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import ExtractionFailedError
from app.models.content_chunk import ContentChunk
from app.models.entity_chunk import EntityChunk
from app.models.graph_entity import VALID_ENTITY_TYPES, GraphEntity
from app.models.note import Note
from app.services import llm_service

logger = logging.getLogger("app.services.entity_extraction_service")

EXTRACTION_SYSTEM_PROMPT = """You are a knowledge graph entity extraction assistant.
Extract important concepts, entities, people, technologies, projects, places,
and events from the given text.
Return ONLY a valid JSON object in the following format:
{
  "entities": [
    {
      "name": "Entity Name",
      "type": "concept|person|technology|project|place|event|unknown",
      "description": "Short explanation of what this entity is in context"
    }
  ]
}
Do not include any additional commentary or markdown formatting outside the JSON block.
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


def extract_entities(text: str, model: str | None = None) -> list[dict[str, Any]]:
    """Call LLM to extract entities as structured JSON dictionaries per CONTRACT §8.2.

    Implements:
    - Structured output / JSON object generation based on provider capability
    - Bounded retries with exponential backoff for transient LLM/provider failures
    - Pydantic schema validation with bounded schema retry
    """
    import time

    from pydantic import ValidationError as PydanticValidationError

    from app.schemas.graph_entity import ExtractedEntitiesPayload

    if not text or not text.strip():
        return []

    provider = llm_service.get_llm_provider(model=model)

    # Determine generation options based on provider capabilities
    gen_kwargs: dict[str, Any] = {}
    if getattr(provider, "supports_json_schema", False):
        schema_dict = ExtractedEntitiesPayload.model_json_schema()
        gen_kwargs["response_format"] = {
            "type": "json_schema",
            "json_schema": {
                "name": "entities_extraction",
                "schema": schema_dict,
                "strict": True,
            },
        }
    elif getattr(provider, "supports_json_object", False):
        gen_kwargs["response_format"] = {"type": "json_object"}

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
        {"role": "user", "content": f"Extract entities from this text:\n\n{text}"},
    ]

    schema_attempts = 0
    while schema_attempts <= MAX_SCHEMA_RETRIES:
        # Transient retry loop for network/timeout/5xx errors
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
                        "Transient error in entity extraction (attempt %d/%d): %s. Backoff %.1fs",
                        transient_attempts,
                        MAX_TRANSIENT_RETRIES,
                        exc,
                        sleep_time,
                    )
                    time.sleep(sleep_time)
                else:
                    logger.error("Non-transient LLM error in entity extraction: %s", exc)
                    raise ExtractionFailedError(f"Entity extraction failed: {exc}") from exc

        if response_text is None:
            err_msg = (
                f"Entity extraction exhausted {MAX_TRANSIENT_RETRIES} transient "
                f"retries: {last_transient_exc}"
            )
            raise ExtractionFailedError(err_msg) from last_transient_exc

        cleaned = _clean_json_text(response_text)
        try:
            raw_data = json.loads(cleaned)
            # Pydantic schema validation
            validated_payload = ExtractedEntitiesPayload.model_validate(raw_data)

            # Convert validated items into sanitized dictionary list
            sanitized_entities = []
            for item in validated_payload.entities:
                name = item.name.strip()
                if not name or len(name) > 200:
                    continue
                etype = item.type.strip().lower()
                if etype not in VALID_ENTITY_TYPES:
                    etype = "unknown"
                desc_str = item.description.strip() if item.description else None
                sanitized_entities.append(
                    {
                        "name": name,
                        "type": etype,
                        "description": desc_str,
                    }
                )
            return sanitized_entities

        except (json.JSONDecodeError, PydanticValidationError) as val_err:
            schema_attempts += 1
            logger.warning(
                "Schema validation failed during entity extraction (attempt %d/%d): %s",
                schema_attempts,
                MAX_SCHEMA_RETRIES,
                val_err,
            )
            if schema_attempts <= MAX_SCHEMA_RETRIES:
                # Add validation error context to prompt for retry
                messages.append({"role": "assistant", "content": response_text})
                prompt_retry = (
                    f"Your previous response produced a validation error: {val_err}. "
                    "Please fix it and return ONLY a valid JSON object matching the schema: "
                    '{"entities": [{"name": "string", "type": "concept", "description": "string"}]}'
                )
                messages.append({"role": "user", "content": prompt_retry})
            else:
                err_msg = (
                    f"Entity extraction failed Pydantic validation after "
                    f"{MAX_SCHEMA_RETRIES} attempts: {val_err}"
                )
                raise ExtractionFailedError(err_msg) from val_err

    return []


def extract_entities_for_note(
    db: Session,
    note_id: uuid.UUID,
    model: str | None = None,
) -> list[GraphEntity]:
    """Extract entities for a note and upsert GraphEntity and EntityChunk records.

    Follows CONTRACT §8.1-§8.3.
    """
    note = db.get(Note, note_id)
    if not note:
        return []

    # Get note chunks
    chunks = db.scalars(
        select(ContentChunk)
        .where(ContentChunk.note_id == note_id)
        .order_by(ContentChunk.chunk_index.asc())
    ).all()

    extraction_model = model or getattr(settings, "LLM_MODEL", "local-llm")
    extracted_entities_by_chunk: list[tuple[ContentChunk | None, list[dict[str, Any]]]] = []

    if chunks:
        for chunk in chunks:
            raw_entities = extract_entities(chunk.content, model=extraction_model)
            if raw_entities:
                extracted_entities_by_chunk.append((chunk, raw_entities))
    else:
        raw_entities = extract_entities(note.content or note.title, model=extraction_model)
        if raw_entities:
            extracted_entities_by_chunk.append((None, raw_entities))

    saved_entities: list[GraphEntity] = []

    for chunk, entities in extracted_entities_by_chunk:
        for ent_data in entities:
            name = ent_data["name"]
            etype = ent_data["type"]
            desc = ent_data["description"]

            # Case-insensitive lookup per CONTRACT §8.3
            existing = db.scalars(
                select(GraphEntity).where(
                    GraphEntity.workspace_id == note.workspace_id,
                    func.lower(GraphEntity.name) == name.lower(),
                )
            ).first()

            if existing:
                entity = existing
                # If existing is manual, do not overwrite name/type/description (§8.3)
                if not existing.is_manual:
                    if desc and not existing.description:
                        existing.description = desc
            else:
                entity = GraphEntity(
                    workspace_id=note.workspace_id,
                    name=name,
                    entity_type=etype,
                    description=desc,
                    is_manual=False,
                )
                db.add(entity)
                db.flush()

            saved_entities.append(entity)

            # Record provenance in EntityChunk if chunk exists
            if chunk:
                prov_existing = db.scalars(
                    select(EntityChunk).where(
                        EntityChunk.entity_id == entity.id,
                        EntityChunk.chunk_id == chunk.id,
                    )
                ).first()

                if not prov_existing:
                    prov = EntityChunk(
                        entity_id=entity.id,
                        chunk_id=chunk.id,
                        note_id=note.id,
                        workspace_id=note.workspace_id,
                        extraction_model=extraction_model,
                        confidence=0.9,
                    )
                    db.add(prov)

    db.commit()
    # Return unique entities extracted for this note
    seen_ids = set()
    unique_entities = []
    for e in saved_entities:
        if e.id not in seen_ids:
            seen_ids.add(e.id)
            unique_entities.append(e)
    return unique_entities
