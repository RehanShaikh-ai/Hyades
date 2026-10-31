"""Handlers and commit/undo mutations for the 6 Controlled Writes per CONTRACT v0.5.1 §6.2, §6.4, §6.5, §6.6, §7.4.

Actions:
32. notes.create
33. notes.update
34. notes.link
35. collections.add_item
36. graph.add_relationship
37. notes.delete
"""

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.actions.types import (
    ActionHandlerResult,
    CollectionsAddItemInput,
    CollectionsCreateInput,
    CollectionsDeleteInput,
    CollectionsMoveItemInput,
    CollectionsRemoveItemInput,
    CollectionsRenameInput,
    ConversationsCreateInput,
    ConversationsDeleteInput,
    ConversationsRenameInput,
    EntitiesCreateInput,
    EntitiesDeleteInput,
    EntitiesUpdateInput,
    GraphAddRelationshipInput,
    GraphDeleteRelationshipInput,
    InboxAcceptItemInput,
    InboxDismissInput,
    NotesArchiveInput,
    NotesCreateInput,
    NotesDeleteInput,
    NotesDuplicateInput,
    NotesLinkInput,
    NotesPinInput,
    NotesRenameInput,
    NotesRestoreInput,
    NotesUnpinInput,
    NotesUpdateInput,
    SourcesArchiveInput,
    SourcesCreateInput,
    SourcesDeleteInput,
    SourcesRenameInput,
    TagsAddToNoteInput,
    TagsRemoveFromNoteInput,
)
from app.core.exceptions import (
    AppException,
    ConflictError,
    EntityNotFoundError,
    NoteNotFoundError,
    SourceNotFoundError,
    ValidationError,
)
from app.models.action_change_set import ActionChangeSet
from app.models.collection import Collection
from app.models.conversation import Conversation
from app.models.graph_entity import GraphEntity
from app.models.graph_relationship import GraphRelationship
from app.models.inbox_item import InboxItem
from app.models.note import Note
from app.models.note_link import NoteLink
from app.models.note_tag import NoteTag
from app.models.source import Source
from app.models.tag import Tag
from app.models.workspace import Workspace
from app.schemas.collection import CollectionCreate, CollectionUpdate
from app.schemas.graph_entity import GraphEntityCreate, GraphEntityUpdate
from app.schemas.note import NoteCreate
from app.services import (
    collection_service,
    conversation_service,
    graph_service,
    inbox_service,
    membership_service,
    note_service,
    source_service,
    tag_service,
)

logger = logging.getLogger("app.actions.handlers.writes")


def _index_note_content(db: Session, note: Note) -> None:
    """Synchronously create ContentChunk records and upsert vectors for immediate retrieval."""
    try:
        from app.core.config import settings
        from app.models.content_chunk import ContentChunk
        from app.services import chunking_service, embedding_service, vector_service

        # Remove existing chunks for this note
        old_chunks = db.scalars(
            select(ContentChunk).where(ContentChunk.note_id == note.id)
        ).all()
        for oc in old_chunks:
            db.delete(oc)
        db.flush()

        raw_chunks = chunking_service.chunk_note(note.content or "", title=note.title)
        if not raw_chunks:
            return

        created_chunks: list[ContentChunk] = []
        points: list[dict[str, Any]] = []
        for rc in raw_chunks:
            c_id = uuid.uuid4()
            chunk = ContentChunk(
                id=c_id,
                note_id=note.id,
                workspace_id=note.workspace_id,
                chunk_index=rc["chunk_index"],
                content=rc["content"],
                content_hash=rc["content_hash"],
                token_count=rc["token_count"],
                embedding_model=settings.EMBEDDING_MODEL,
                embedding_dimension=settings.EMBEDDING_DIMENSION,
                created_at=datetime.now(UTC),
            )
            db.add(chunk)
            created_chunks.append(chunk)
        db.commit()

        # Safely try vector upsert
        try:
            for c in created_chunks:
                vec = embedding_service.get_embedding(c.content)
                points.append(
                    {
                        "id": str(c.id),
                        "vector": vec,
                        "payload": {
                            "chunk_id": str(c.id),
                            "note_id": str(note.id),
                            "workspace_id": str(note.workspace_id),
                        },
                    }
                )
            if points:
                vector_service.upsert_vectors(workspace_id=note.workspace_id, points=points)
        except Exception as ve:
            logger.warning("Vector upsert skipped for note %s: %s", note.id, ve)
    except Exception as e:
        logger.warning("ContentChunk creation skipped for note %s: %s", note.id, e)

# ─────────────────────────────────────────────────────────────────────────────
# Propose Phase Handlers (Validate inputs & build proposal payload)
# ─────────────────────────────────────────────────────────────────────────────


def handle_notes_create(
    db: Session, workspace_id: uuid.UUID, data: NotesCreateInput
) -> ActionHandlerResult:
    """Propose creating a note (§7.4)."""
    title = data.title.strip()
    if not title:
        raise ValidationError("Note title cannot be empty.")

    proposal_payload = {
        "title": title,
        "content": data.content,
        "tags": data.tags,
    }
    return ActionHandlerResult(
        result={"proposed_action": "notes.create", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[],
        before_state=None,
    )


def handle_notes_update(
    db: Session, workspace_id: uuid.UUID, data: NotesUpdateInput
) -> ActionHandlerResult:
    """Propose updating an existing note (§7.4)."""
    note = note_service.get_note(db, data.note_id)
    if not note or note.workspace_id != workspace_id:
        raise NoteNotFoundError("Note not found in workspace.")

    before_state = {
        "id": str(note.id),
        "title": note.title,
        "content": note.content,
    }
    proposal_payload = {
        "note_id": str(note.id),
        "title": data.title if data.title is not None else note.title,
        "content": (
            (note.content or "") + "\n" + data.append_content
            if data.append_content
            else (data.content if data.content is not None else note.content)
        ),
    }
    return ActionHandlerResult(
        result={"proposed_action": "notes.update", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(note.id)],
        before_state=before_state,
    )


def handle_notes_link(
    db: Session, workspace_id: uuid.UUID, data: NotesLinkInput
) -> ActionHandlerResult:
    """Propose a link between two notes (§7.4)."""
    if data.source_note_id == data.target_note_id:
        raise ValidationError("Cannot link a note to itself.")

    src = note_service.get_note(db, data.source_note_id)
    tgt = note_service.get_note(db, data.target_note_id)
    if not src or src.workspace_id != workspace_id:
        raise NoteNotFoundError("Source note not found in workspace.")
    if not tgt or tgt.workspace_id != workspace_id:
        raise NoteNotFoundError("Target note not found in workspace.")

    proposal_payload = {
        "source_note_id": str(src.id),
        "target_note_id": str(tgt.id),
    }
    return ActionHandlerResult(
        result={"proposed_action": "notes.link", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(src.id), str(tgt.id)],
        before_state=None,
    )


def handle_collections_add_item(
    db: Session, workspace_id: uuid.UUID, data: CollectionsAddItemInput
) -> ActionHandlerResult:
    """Propose adding a supported item to a collection (§7.4)."""
    coll = db.get(Collection, data.collection_id)
    if not coll or coll.workspace_id != workspace_id:
        raise AppException(404, "COLLECTION_NOT_FOUND", "Collection not found in workspace.")

    proposal_payload = {
        "collection_id": str(coll.id),
        "item_type": data.item_type,
        "item_id": str(data.item_id),
    }
    return ActionHandlerResult(
        result={"proposed_action": "collections.add_item", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(coll.id), str(data.item_id)],
        before_state=None,
    )


def handle_graph_add_relationship(
    db: Session, workspace_id: uuid.UUID, data: GraphAddRelationshipInput
) -> ActionHandlerResult:
    """Propose a relationship between supported graph nodes (§7.4)."""
    if data.source_entity_id == data.target_entity_id:
        raise ValidationError("Cannot create self-relationship.")

    src = db.get(GraphEntity, data.source_entity_id)
    tgt = db.get(GraphEntity, data.target_entity_id)
    if not src or src.workspace_id != workspace_id:
        raise EntityNotFoundError("Source entity not found in workspace.")
    if not tgt or tgt.workspace_id != workspace_id:
        raise EntityNotFoundError("Target entity not found in workspace.")

    proposal_payload = {
        "source_entity_id": str(src.id),
        "target_entity_id": str(tgt.id),
        "relationship_type": data.relationship_type.strip(),
        "description": data.description,
    }
    return ActionHandlerResult(
        result={"proposed_action": "graph.add_relationship", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(src.id), str(tgt.id)],
        before_state=None,
    )


def handle_notes_delete(
    db: Session, workspace_id: uuid.UUID, data: NotesDeleteInput
) -> ActionHandlerResult:
    """Propose deletion of one note (§6.6, §7.4)."""
    note = note_service.get_note(db, data.note_id)
    if not note or note.workspace_id != workspace_id:
        raise NoteNotFoundError("Note not found in workspace.")

    # §6.6: Must verify the note's title
    if note.title.strip() != data.note_title.strip():
        raise ValidationError(
            f"Provided note title '{data.note_title}' does not match target note title '{note.title}'."
        )

    before_state = {
        "id": str(note.id),
        "title": note.title,
        "content": note.content,
        "created_by": str(note.created_by),
        "tags": [t.name for t in note.tags] if note.tags else [],
    }
    proposal_payload = {
        "note_id": str(note.id),
        "note_title": note.title,
    }
    return ActionHandlerResult(
        result={"proposed_action": "notes.delete", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(note.id)],
        before_state=before_state,
    )


def handle_notes_rename(
    db: Session, workspace_id: uuid.UUID, data: NotesRenameInput
) -> ActionHandlerResult:
    note = note_service.get_note(db, data.note_id)
    if not note or note.workspace_id != workspace_id:
        raise NoteNotFoundError("Note not found in workspace.")
    new_title = data.new_title.strip()
    if not new_title:
        raise ValidationError("New note title cannot be empty.")
    before_state = {"id": str(note.id), "title": note.title}
    proposal_payload = {"note_id": str(note.id), "old_title": note.title, "new_title": new_title}
    return ActionHandlerResult(
        result={"proposed_action": "notes.rename", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(note.id)],
        before_state=before_state,
    )


def handle_notes_duplicate(
    db: Session, workspace_id: uuid.UUID, data: NotesDuplicateInput
) -> ActionHandlerResult:
    note = note_service.get_note(db, data.note_id)
    if not note or note.workspace_id != workspace_id:
        raise NoteNotFoundError("Note not found in workspace.")
    copy_title = f"{note.title} (Copy)"
    proposal_payload = {
        "note_id": str(note.id),
        "source_title": note.title,
        "copy_title": copy_title,
    }
    return ActionHandlerResult(
        result={"proposed_action": "notes.duplicate", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(note.id)],
        before_state=None,
    )


def handle_notes_archive(
    db: Session, workspace_id: uuid.UUID, data: NotesArchiveInput
) -> ActionHandlerResult:
    note = note_service.get_note(db, data.note_id)
    if not note or note.workspace_id != workspace_id:
        raise NoteNotFoundError("Note not found in workspace.")
    proposal_payload = {"note_id": str(note.id), "title": note.title, "is_archived": True}
    return ActionHandlerResult(
        result={"proposed_action": "notes.archive", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(note.id)],
        before_state={"id": str(note.id), "is_archived": note.is_archived},
    )


def handle_notes_restore(
    db: Session, workspace_id: uuid.UUID, data: NotesRestoreInput
) -> ActionHandlerResult:
    note = note_service.get_note(db, data.note_id)
    if not note or note.workspace_id != workspace_id:
        raise NoteNotFoundError("Note not found in workspace.")
    proposal_payload = {"note_id": str(note.id), "title": note.title, "is_archived": False}
    return ActionHandlerResult(
        result={"proposed_action": "notes.restore", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(note.id)],
        before_state={"id": str(note.id), "is_archived": note.is_archived},
    )


def handle_notes_pin(
    db: Session, workspace_id: uuid.UUID, data: NotesPinInput
) -> ActionHandlerResult:
    note = note_service.get_note(db, data.note_id)
    if not note or note.workspace_id != workspace_id:
        raise NoteNotFoundError("Note not found in workspace.")
    proposal_payload = {"note_id": str(note.id), "title": note.title, "is_pinned": True}
    return ActionHandlerResult(
        result={"proposed_action": "notes.pin", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(note.id)],
        before_state={"id": str(note.id), "is_pinned": note.is_pinned},
    )


def handle_notes_unpin(
    db: Session, workspace_id: uuid.UUID, data: NotesUnpinInput
) -> ActionHandlerResult:
    note = note_service.get_note(db, data.note_id)
    if not note or note.workspace_id != workspace_id:
        raise NoteNotFoundError("Note not found in workspace.")
    proposal_payload = {"note_id": str(note.id), "title": note.title, "is_pinned": False}
    return ActionHandlerResult(
        result={"proposed_action": "notes.unpin", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(note.id)],
        before_state={"id": str(note.id), "is_pinned": note.is_pinned},
    )


def handle_collections_create(
    db: Session, workspace_id: uuid.UUID, data: CollectionsCreateInput
) -> ActionHandlerResult:
    name = data.name.strip()
    if not name:
        raise ValidationError("Collection name cannot be empty.")
    proposal_payload = {"name": name, "description": data.description}
    return ActionHandlerResult(
        result={"proposed_action": "collections.create", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[],
        before_state=None,
    )


def handle_collections_rename(
    db: Session, workspace_id: uuid.UUID, data: CollectionsRenameInput
) -> ActionHandlerResult:
    coll = db.get(Collection, data.collection_id)
    if not coll or coll.workspace_id != workspace_id:
        raise AppException(404, "COLLECTION_NOT_FOUND", "Collection not found in workspace.")
    new_name = data.new_name.strip()
    if not new_name:
        raise ValidationError("Collection name cannot be empty.")
    before_state = {"id": str(coll.id), "name": coll.name, "description": coll.description}
    proposal_payload = {
        "collection_id": str(coll.id),
        "old_name": coll.name,
        "new_name": new_name,
        "description": data.description,
    }
    return ActionHandlerResult(
        result={"proposed_action": "collections.rename", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(coll.id)],
        before_state=before_state,
    )


def handle_collections_delete(
    db: Session, workspace_id: uuid.UUID, data: CollectionsDeleteInput
) -> ActionHandlerResult:
    coll = db.get(Collection, data.collection_id)
    if not coll or coll.workspace_id != workspace_id:
        raise AppException(404, "COLLECTION_NOT_FOUND", "Collection not found in workspace.")
    if data.collection_name and coll.name.strip() != data.collection_name.strip():
        raise ValidationError(
            f"Provided collection name '{data.collection_name}' does not match target collection '{coll.name}'."
        )
    before_state = {"id": str(coll.id), "name": coll.name, "description": coll.description}
    proposal_payload = {"collection_id": str(coll.id), "collection_name": coll.name}
    return ActionHandlerResult(
        result={"proposed_action": "collections.delete", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(coll.id)],
        before_state=before_state,
    )


def handle_collections_remove_item(
    db: Session, workspace_id: uuid.UUID, data: CollectionsRemoveItemInput
) -> ActionHandlerResult:
    coll = db.get(Collection, data.collection_id)
    if not coll or coll.workspace_id != workspace_id:
        raise AppException(404, "COLLECTION_NOT_FOUND", "Collection not found in workspace.")
    proposal_payload = {
        "collection_id": str(coll.id),
        "item_type": data.item_type,
        "item_id": str(data.item_id),
    }
    return ActionHandlerResult(
        result={"proposed_action": "collections.remove_item", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(coll.id), str(data.item_id)],
        before_state=None,
    )


def handle_collections_move_item(
    db: Session, workspace_id: uuid.UUID, data: CollectionsMoveItemInput
) -> ActionHandlerResult:
    src_coll = db.get(Collection, data.source_collection_id)
    tgt_coll = db.get(Collection, data.target_collection_id)
    if not src_coll or src_coll.workspace_id != workspace_id:
        raise AppException(404, "SOURCE_COLLECTION_NOT_FOUND", "Source collection not found in workspace.")
    if not tgt_coll or tgt_coll.workspace_id != workspace_id:
        raise AppException(404, "TARGET_COLLECTION_NOT_FOUND", "Destination collection not found in workspace.")
    proposal_payload = {
        "source_collection_id": str(src_coll.id),
        "target_collection_id": str(tgt_coll.id),
        "item_type": data.item_type,
        "item_id": str(data.item_id),
    }
    return ActionHandlerResult(
        result={"proposed_action": "collections.move_item", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(src_coll.id), str(tgt_coll.id), str(data.item_id)],
        before_state=None,
    )


def _has_explicit_file_extension(title: str) -> tuple[bool, str]:
    """Check whether a title string looks like a filename with an explicit file extension."""
    import os
    import re

    clean = title.strip()
    if not clean or "\n" in clean or len(clean) > 255:
        return False, ""
    base, ext = os.path.splitext(clean)
    if not base or base.endswith(" ") or not ext:
        return False, ""
    # Must be a dot followed by 1-8 alphanumeric chars with no whitespace
    if not re.match(r"^\.[a-zA-Z0-9]{1,8}$", ext):
        return False, ""
    from app.services.file_validation_service import EXTENSION_TO_SOURCE_TYPE

    if ext.lower() in EXTENSION_TO_SOURCE_TYPE:
        return True, ext.lower()
    # Treat as a filename attempt if single token or short filename-like string
    if len(clean.split()) <= 3:
        return True, ext.lower()
    return False, ""


def handle_sources_create(
    db: Session, workspace_id: uuid.UUID, data: SourcesCreateInput
) -> ActionHandlerResult:
    title = data.title.strip()
    if not title:
        raise ValidationError("Source title cannot be empty.")
    has_ext, ext = _has_explicit_file_extension(title)
    if has_ext:
        from app.core.exceptions import UnsupportedSourceTypeError
        from app.services.file_validation_service import (
            EXTENSION_TO_SOURCE_TYPE,
            SUPPORTED_SOURCE_TYPES,
        )

        if ext not in EXTENSION_TO_SOURCE_TYPE:
            allowed_list = ", ".join(sorted(SUPPORTED_SOURCE_TYPES))
            raise UnsupportedSourceTypeError(
                f"Unsupported file format for '{title}'. Allowed formats: {allowed_list}"
            )
    proposal_payload = {
        "title": title,
        "content": data.content,
        "source_type": data.source_type,
    }
    return ActionHandlerResult(
        result={
            "proposed_action": "sources.create",
            "details": proposal_payload,
            **proposal_payload,
        },
        proposals=[proposal_payload],
        affected_item_ids=[],
        before_state=None,
    )


def handle_sources_rename(
    db: Session, workspace_id: uuid.UUID, data: SourcesRenameInput
) -> ActionHandlerResult:
    source = db.get(Source, data.source_id)
    if not source or source.workspace_id != workspace_id:
        raise SourceNotFoundError("Source not found in workspace.")
    new_title = data.new_title.strip()
    if not new_title:
        raise ValidationError("Source title cannot be empty.")
    before_state = {"id": str(source.id), "title": source.original_path}
    proposal_payload = {
        "source_id": str(source.id),
        "old_title": source.original_path,
        "new_title": new_title,
    }
    return ActionHandlerResult(
        result={"proposed_action": "sources.rename", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(source.id)],
        before_state=before_state,
    )


def handle_sources_delete(
    db: Session, workspace_id: uuid.UUID, data: SourcesDeleteInput
) -> ActionHandlerResult:
    source = db.get(Source, data.source_id)
    if not source or source.workspace_id != workspace_id:
        raise SourceNotFoundError("Source not found in workspace.")
    source_title = source.original_path or source.source_identifier
    if data.source_title and data.source_title.strip() != source_title.strip():
        raise ValidationError(
            f"Provided source title '{data.source_title}' does not match target source '{source_title}'."
        )
    before_state = {"id": str(source.id), "title": source_title}
    proposal_payload = {"source_id": str(source.id), "source_title": source_title}
    return ActionHandlerResult(
        result={"proposed_action": "sources.delete", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(source.id)],
        before_state=before_state,
    )


def handle_sources_archive(
    db: Session, workspace_id: uuid.UUID, data: SourcesArchiveInput
) -> ActionHandlerResult:
    source = db.get(Source, data.source_id)
    if not source or source.workspace_id != workspace_id:
        raise SourceNotFoundError("Source not found in workspace.")
    proposal_payload = {"source_id": str(source.id), "is_archived": True}
    return ActionHandlerResult(
        result={"proposed_action": "sources.archive", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(source.id)],
        before_state={"id": str(source.id)},
    )


def handle_entities_create(
    db: Session, workspace_id: uuid.UUID, data: EntitiesCreateInput
) -> ActionHandlerResult:
    name = data.name.strip()
    if not name:
        raise ValidationError("Entity name cannot be empty.")
    proposal_payload = {
        "name": name,
        "entity_type": data.entity_type,
        "description": data.description,
    }
    return ActionHandlerResult(
        result={"proposed_action": "entities.create", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[],
        before_state=None,
    )


def handle_entities_update(
    db: Session, workspace_id: uuid.UUID, data: EntitiesUpdateInput
) -> ActionHandlerResult:
    entity = db.get(GraphEntity, data.entity_id)
    if not entity or entity.workspace_id != workspace_id:
        raise EntityNotFoundError("Entity not found in workspace.")
    before_state = {
        "id": str(entity.id),
        "name": entity.name,
        "entity_type": entity.entity_type,
        "description": entity.description,
    }
    proposal_payload = {
        "entity_id": str(entity.id),
        "name": data.name.strip() if data.name else entity.name,
        "entity_type": data.entity_type or entity.entity_type,
        "description": data.description if data.description is not None else entity.description,
    }
    return ActionHandlerResult(
        result={"proposed_action": "entities.update", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(entity.id)],
        before_state=before_state,
    )


def handle_entities_delete(
    db: Session, workspace_id: uuid.UUID, data: EntitiesDeleteInput
) -> ActionHandlerResult:
    entity = db.get(GraphEntity, data.entity_id)
    if not entity or entity.workspace_id != workspace_id:
        raise EntityNotFoundError("Entity not found in workspace.")
    if data.entity_name and data.entity_name.strip() != entity.name.strip():
        raise ValidationError(
            f"Provided entity name '{data.entity_name}' does not match target entity '{entity.name}'."
        )
    before_state = {"id": str(entity.id), "name": entity.name}
    proposal_payload = {"entity_id": str(entity.id), "entity_name": entity.name}
    return ActionHandlerResult(
        result={"proposed_action": "entities.delete", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(entity.id)],
        before_state=before_state,
    )


def handle_graph_delete_relationship(
    db: Session, workspace_id: uuid.UUID, data: GraphDeleteRelationshipInput
) -> ActionHandlerResult:
    rel = db.get(GraphRelationship, data.relationship_id)
    if not rel or rel.workspace_id != workspace_id:
        raise AppException(404, "RELATIONSHIP_NOT_FOUND", "Relationship not found in workspace.")
    before_state = {
        "id": str(rel.id),
        "source_entity_id": str(rel.source_entity_id),
        "target_entity_id": str(rel.target_entity_id),
        "relationship_type": rel.relationship_type,
    }
    proposal_payload = {"relationship_id": str(rel.id)}
    return ActionHandlerResult(
        result={"proposed_action": "graph.delete_relationship", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(rel.id)],
        before_state=before_state,
    )


def handle_inbox_dismiss(
    db: Session, workspace_id: uuid.UUID, data: InboxDismissInput
) -> ActionHandlerResult:
    item = db.get(InboxItem, data.inbox_item_id)
    if not item or item.workspace_id != workspace_id:
        raise AppException(404, "INBOX_ITEM_NOT_FOUND", "Inbox item not found in workspace.")
    proposal_payload = {"inbox_item_id": str(item.id)}
    return ActionHandlerResult(
        result={"proposed_action": "inbox.dismiss", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(item.id)],
        before_state={"id": str(item.id), "status": item.status},
    )


def handle_inbox_accept_item(
    db: Session, workspace_id: uuid.UUID, data: InboxAcceptItemInput
) -> ActionHandlerResult:
    item = db.get(InboxItem, data.inbox_item_id)
    if not item or item.workspace_id != workspace_id:
        raise AppException(404, "INBOX_ITEM_NOT_FOUND", "Inbox item not found in workspace.")
    proposal_payload = {"inbox_item_id": str(item.id)}
    return ActionHandlerResult(
        result={"proposed_action": "inbox.accept_item", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(item.id)],
        before_state={"id": str(item.id), "status": item.status},
    )


def handle_tags_add_to_note(
    db: Session, workspace_id: uuid.UUID, data: TagsAddToNoteInput
) -> ActionHandlerResult:
    note = note_service.get_note(db, data.note_id)
    if not note or note.workspace_id != workspace_id:
        raise NoteNotFoundError("Note not found in workspace.")
    tag_name = data.tag_name.strip().lower()
    if not tag_name:
        raise ValidationError("Tag name cannot be empty.")
    proposal_payload = {"note_id": str(note.id), "tag_name": tag_name}
    return ActionHandlerResult(
        result={"proposed_action": "tags.add_to_note", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(note.id)],
        before_state=None,
    )


def handle_tags_remove_from_note(
    db: Session, workspace_id: uuid.UUID, data: TagsRemoveFromNoteInput
) -> ActionHandlerResult:
    note = note_service.get_note(db, data.note_id)
    if not note or note.workspace_id != workspace_id:
        raise NoteNotFoundError("Note not found in workspace.")
    tag_name = data.tag_name.strip().lower()
    proposal_payload = {"note_id": str(note.id), "tag_name": tag_name}
    return ActionHandlerResult(
        result={"proposed_action": "tags.remove_from_note", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(note.id)],
        before_state=None,
    )


def handle_conversations_create(
    db: Session, workspace_id: uuid.UUID, data: ConversationsCreateInput
) -> ActionHandlerResult:
    title = data.title.strip() if data.title else "New Research Thread"
    proposal_payload = {"title": title}
    return ActionHandlerResult(
        result={"proposed_action": "conversations.create", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[],
        before_state=None,
    )


def handle_conversations_rename(
    db: Session, workspace_id: uuid.UUID, data: ConversationsRenameInput
) -> ActionHandlerResult:
    conv = conversation_service.get_conversation(db, data.conversation_id)
    if not conv or conv.workspace_id != workspace_id:
        raise AppException(404, "CONVERSATION_NOT_FOUND", "Conversation not found in workspace.")
    new_title = data.new_title.strip()
    if not new_title:
        raise ValidationError("Conversation title cannot be empty.")
    before_state = {"id": str(conv.id), "title": conv.title}
    proposal_payload = {
        "conversation_id": str(conv.id),
        "old_title": conv.title,
        "new_title": new_title,
    }
    return ActionHandlerResult(
        result={"proposed_action": "conversations.rename", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(conv.id)],
        before_state=before_state,
    )


def handle_conversations_delete(
    db: Session, workspace_id: uuid.UUID, data: ConversationsDeleteInput
) -> ActionHandlerResult:
    conv = conversation_service.get_conversation(db, data.conversation_id)
    if not conv or conv.workspace_id != workspace_id:
        raise AppException(404, "CONVERSATION_NOT_FOUND", "Conversation not found in workspace.")
    before_state = {"id": str(conv.id), "title": conv.title}
    proposal_payload = {"conversation_id": str(conv.id), "title": conv.title}
    return ActionHandlerResult(
        result={"proposed_action": "conversations.delete", "details": proposal_payload},
        proposals=[proposal_payload],
        affected_item_ids=[str(conv.id)],
        before_state=before_state,
    )



# ─────────────────────────────────────────────────────────────────────────────
# Commit Phase Executor (Applied atomically upon confirmation token verification)
# ─────────────────────────────────────────────────────────────────────────────


def execute_commit(
    db: Session,
    workspace_id: uuid.UUID,
    action_id: str,
    proposal_payload: dict[str, Any],
) -> tuple[dict[str, Any], list[str], dict[str, Any] | None, dict[str, Any] | None]:
    """Execute the confirmed proposal and return (result, affected_item_ids, before_state, after_state)."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise AppException(404, "WORKSPACE_NOT_FOUND", "Workspace not found.")

    if action_id == "notes.create":
        tags = proposal_payload.get("tags", [])
        workflow = proposal_payload.get("workflow")

        if workflow == "split_note" and proposal_payload.get("proposed_parts"):
            proposed_parts = proposal_payload["proposed_parts"]
            original_note_id_str = proposal_payload.get("original_note_id")
            orig_uuid: uuid.UUID | None = None
            if original_note_id_str:
                try:
                    orig_uuid = uuid.UUID(str(original_note_id_str))
                except ValueError:
                    orig_uuid = None

            created_notes: list[Note] = []
            for part in proposed_parts:
                part_title = str(part.get("title", "Split Note")).strip()[:200]
                part_content = str(part.get("content", "")).strip()
                part_note = Note(
                    workspace_id=workspace_id,
                    title=part_title,
                    content=part_content,
                    created_by=ws.owner_id,
                )
                db.add(part_note)
                db.flush()

                for t_name in tags:
                    tag_name_clean = t_name.strip().lower()
                    tag = db.scalars(
                        select(Tag).where(
                            Tag.workspace_id == workspace_id, Tag.name == tag_name_clean
                        )
                    ).first()
                    if not tag:
                        tag = Tag(workspace_id=workspace_id, name=tag_name_clean)
                        db.add(tag)
                        db.flush()
                    db.add(NoteTag(note_id=part_note.id, tag_id=tag.id))

                if orig_uuid:
                    orig_note = db.get(Note, orig_uuid)
                    if orig_note and orig_note.workspace_id == workspace_id:
                        existing_link = db.scalars(
                            select(NoteLink).where(
                                NoteLink.source_note_id == orig_uuid,
                                NoteLink.target_note_id == part_note.id,
                            )
                        ).first()
                        if not existing_link:
                            db.add(
                                NoteLink(
                                    source_note_id=orig_uuid,
                                    target_note_id=part_note.id,
                                )
                            )
                created_notes.append(part_note)

            db.commit()
            for part_note in created_notes:
                db.refresh(part_note)
                _index_note_content(db, part_note)

            created_notes_meta = [
                {
                    "note_id": str(n.id),
                    "title": n.title,
                    "word_count": len((n.content or "").split()),
                }
                for n in created_notes
            ]
            created_ids = [str(n.id) for n in created_notes]
            after_state = {
                "id": created_ids[0],
                "title": created_notes[0].title,
                "created_note_ids": created_ids,
                "created_notes": created_notes_meta,
                "tags": tags,
            }
            return (
                {
                    "note_id": created_ids[0],
                    "title": created_notes[0].title,
                    "original_note_id": original_note_id_str,
                    "original_title": proposal_payload.get("original_title"),
                    "created_notes": created_notes_meta,
                    "created_count": len(created_notes_meta),
                    "status": "split_committed",
                },
                created_ids,
                None,
                after_state,
            )

        title = proposal_payload["title"]
        content = proposal_payload.get("content", "")

        note = Note(
            workspace_id=workspace_id,
            title=title,
            content=content,
            created_by=ws.owner_id,
        )
        db.add(note)
        db.flush()

        # Add tags if present
        for t_name in tags:
            tag_name_clean = t_name.strip().lower()
            tag = db.scalars(
                select(Tag).where(Tag.workspace_id == workspace_id, Tag.name == tag_name_clean)
            ).first()
            if not tag:
                tag = Tag(workspace_id=workspace_id, name=tag_name_clean)
                db.add(tag)
                db.flush()
            db.add(NoteTag(note_id=note.id, tag_id=tag.id))

        # Link to source notes if this is a merge_notes workflow
        source_notes = proposal_payload.get("source_notes", [])
        if workflow == "merge_notes" and source_notes:
            for src_meta in source_notes:
                src_id_str = src_meta.get("note_id") if isinstance(src_meta, dict) else str(src_meta)
                try:
                    src_uuid = uuid.UUID(str(src_id_str))
                    src_note = db.get(Note, src_uuid)
                    if src_note and src_note.workspace_id == workspace_id and src_note.id != note.id:
                        existing_link = db.scalars(
                            select(NoteLink).where(
                                NoteLink.source_note_id == note.id,
                                NoteLink.target_note_id == src_note.id,
                            )
                        ).first()
                        if not existing_link:
                            db.add(NoteLink(source_note_id=note.id, target_note_id=src_note.id))
                except ValueError:
                    pass

        db.commit()
        db.refresh(note)
        _index_note_content(db, note)

        after_state = {
            "id": str(note.id),
            "title": note.title,
            "content": note.content,
            "tags": tags,
        }
        result_dict: dict[str, Any] = {
            "note_id": str(note.id),
            "title": note.title,
            "status": "created",
        }
        if source_notes:
            result_dict["source_notes"] = source_notes
        return (
            result_dict,
            [str(note.id)],
            None,
            after_state,
        )

    elif action_id == "notes.update":
        note_id = uuid.UUID(proposal_payload["note_id"])
        note = db.get(Note, note_id)
        if not note or note.workspace_id != workspace_id:
            raise NoteNotFoundError("Target note no longer exists in workspace.")

        before_state = {
            "id": str(note.id),
            "title": note.title,
            "content": note.content,
        }

        note.title = proposal_payload.get("title", note.title)
        note.content = proposal_payload.get("content", note.content)
        note.updated_at = datetime.now(UTC)
        db.commit()
        db.refresh(note)
        _index_note_content(db, note)

        after_state = {
            "id": str(note.id),
            "title": note.title,
            "content": note.content,
        }
        return (
            {"note_id": str(note.id), "updated_fields": ["title", "content"], "status": "updated"},
            [str(note.id)],
            before_state,
            after_state,
        )

    elif action_id == "notes.link":
        src_id = uuid.UUID(proposal_payload["source_note_id"])
        tgt_id = uuid.UUID(proposal_payload["target_note_id"])

        src = db.get(Note, src_id)
        tgt = db.get(Note, tgt_id)
        if (
            not src
            or src.workspace_id != workspace_id
            or not tgt
            or tgt.workspace_id != workspace_id
        ):
            raise NoteNotFoundError("Linked note targets no longer exist in workspace.")

        existing = db.scalars(
            select(NoteLink).where(
                NoteLink.source_note_id == src_id,
                NoteLink.target_note_id == tgt_id,
            )
        ).first()
        if not existing:
            link = NoteLink(
                source_note_id=src_id,
                target_note_id=tgt_id,
            )
            db.add(link)
            db.commit()

        after_state = {
            "source_note_id": str(src_id),
            "target_note_id": str(tgt_id),
        }
        return (
            {"source_note_id": str(src_id), "target_note_id": str(tgt_id), "status": "linked"},
            [str(src_id), str(tgt_id)],
            None,
            after_state,
        )

    elif action_id == "collections.add_item":
        coll_id = uuid.UUID(proposal_payload["collection_id"])
        item_id = uuid.UUID(proposal_payload["item_id"])
        item_type = proposal_payload["item_type"]

        coll = db.get(Collection, coll_id)
        if not coll or coll.workspace_id != workspace_id:
            raise AppException(404, "COLLECTION_NOT_FOUND", "Collection not found in workspace.")

        if proposal_payload.get("workflow") in (
            "populate_collection",
            "organize_populate_collection",
        ) and (
            "selected_items" in proposal_payload or proposal_payload.get("candidate_items")
        ):
            from fastapi import HTTPException

            raw_items = (
                proposal_payload["selected_items"]
                if "selected_items" in proposal_payload
                else proposal_payload.get("candidate_items", [])
            )
            filtered_candidates = [
                cand
                for cand in raw_items
                if isinstance(cand, dict) and cand.get("selected", True) is not False
            ]
            if not filtered_candidates:
                raise ValidationError(
                    "Please select at least one candidate item to add to the collection."
                )

            # Verify all selected items belong to the active workspace before mutating
            for cand in filtered_candidates:
                c_id_str = str(cand.get("item_id") or cand.get("note_id") or cand.get("source_id") or "")
                c_type = str(cand.get("item_type", "note"))
                try:
                    c_uuid = uuid.UUID(c_id_str)
                except ValueError as err:
                    raise ValidationError(f"Invalid item ID '{c_id_str}'.") from err
                if c_type == "note":
                    obj = db.get(Note, c_uuid)
                    if not obj or obj.workspace_id != workspace_id:
                        raise AppException(
                            404, "NOTE_NOT_FOUND", f"Note '{c_id_str}' not found in workspace."
                        )
                elif c_type == "source":
                    obj = db.get(Source, c_uuid)
                    if not obj or obj.workspace_id != workspace_id:
                        raise AppException(
                            404, "SOURCE_NOT_FOUND", f"Source '{c_id_str}' not found in workspace."
                        )
                elif c_type == "entity":
                    obj = db.get(GraphEntity, c_uuid)
                    if not obj or obj.workspace_id != workspace_id:
                        raise AppException(
                            404, "ENTITY_NOT_FOUND", f"Entity '{c_id_str}' not found in workspace."
                        )
                elif c_type == "conversation":
                    obj = db.get(Conversation, c_uuid)
                    if not obj or obj.workspace_id != workspace_id:
                        raise AppException(
                            404,
                            "CONVERSATION_NOT_FOUND",
                            f"Conversation '{c_id_str}' not found in workspace.",
                        )

            added_items: list[dict[str, str]] = []
            skipped_existing_count = 0
            affected: list[str] = [str(coll_id)]
            for cand in filtered_candidates:
                c_id_str = str(cand.get("item_id") or cand.get("note_id") or cand.get("source_id") or "")
                c_type = str(cand.get("item_type", "note"))
                c_title = str(cand.get("title", ""))
                try:
                    c_uuid = uuid.UUID(c_id_str)
                    membership_service.add_collection_item(db, coll, c_type, c_uuid)
                    added_items.append(
                        {"item_id": c_id_str, "item_type": c_type, "title": c_title}
                    )
                    affected.append(c_id_str)
                except HTTPException as exc:
                    if exc.status_code == 409:
                        skipped_existing_count += 1
                    else:
                        raise
            after_state = {
                "collection_id": str(coll_id),
                "item_type": item_type,
                "item_id": str(item_id),
                "added_items": added_items,
            }
            return (
                {
                    "collection_id": str(coll_id),
                    "collection_name": coll.name,
                    "item_type": item_type,
                    "item_id": str(item_id),
                    "added_items": added_items,
                    "added_count": len(added_items),
                    "skipped_existing_count": skipped_existing_count,
                    "status": "populated",
                },
                affected,
                None,
                after_state,
            )

        membership_service.add_collection_item(db, coll, item_type, item_id)
        after_state = {
            "collection_id": str(coll_id),
            "item_type": item_type,
            "item_id": str(item_id),
        }
        return (
            {
                "collection_id": str(coll_id),
                "item_type": item_type,
                "item_id": str(item_id),
                "status": "added",
            },
            [str(coll_id), str(item_id)],
            None,
            after_state,
        )

    elif action_id == "graph.add_relationship":
        src_id = uuid.UUID(proposal_payload["source_entity_id"])
        tgt_id = uuid.UUID(proposal_payload["target_entity_id"])
        rel_type = proposal_payload["relationship_type"]
        desc = proposal_payload.get("description")

        src = db.get(GraphEntity, src_id)
        tgt = db.get(GraphEntity, tgt_id)
        if (
            not src
            or src.workspace_id != workspace_id
            or not tgt
            or tgt.workspace_id != workspace_id
        ):
            raise EntityNotFoundError("Entity targets no longer exist in workspace.")

        rel = GraphRelationship(
            workspace_id=workspace_id,
            source_entity_id=src_id,
            target_entity_id=tgt_id,
            relationship_type=rel_type,
            description=desc,
        )
        db.add(rel)
        db.commit()
        db.refresh(rel)

        after_state = {
            "relationship_id": str(rel.id),
            "source_entity_id": str(src_id),
            "target_entity_id": str(tgt_id),
            "relationship_type": rel_type,
        }
        return (
            {"relationship_id": str(rel.id), "status": "created"},
            [str(src_id), str(tgt_id)],
            None,
            after_state,
        )

    elif action_id == "notes.delete":
        note_id = uuid.UUID(proposal_payload["note_id"])
        note = db.get(Note, note_id)
        if not note or note.workspace_id != workspace_id:
            raise NoteNotFoundError("Note to delete not found in workspace.")

        # §6.6: Revalidate target note still matches proposal
        if note.title.strip() != proposal_payload.get("note_title", "").strip():
            raise ConflictError("Note has been modified since proposal and no longer matches.")

        before_state = {
            "id": str(note.id),
            "title": note.title,
            "content": note.content,
            "created_by": str(note.created_by),
            "tags": [t.name for t in note.tags] if note.tags else [],
        }

        # Retain recovery snapshot and delete note
        db.delete(note)
        db.commit()

        return (
            {"note_id": str(note_id), "deleted": True, "status": "deleted"},
            [str(note_id)],
            before_state,
            None,
        )

    elif action_id == "notes.rename":
        note_id = uuid.UUID(proposal_payload["note_id"])
        new_title = proposal_payload["new_title"]
        note = db.get(Note, note_id)
        if not note or note.workspace_id != workspace_id:
            raise NoteNotFoundError("Target note no longer exists in workspace.")
        before_state = {"id": str(note.id), "title": note.title}
        note.title = new_title
        note.updated_at = datetime.now(UTC)
        db.commit()
        db.refresh(note)
        _index_note_content(db, note)
        after_state = {"id": str(note.id), "title": note.title}
        return (
            {"note_id": str(note.id), "old_title": before_state["title"], "new_title": note.title, "status": "renamed"},
            [str(note.id)],
            before_state,
            after_state,
        )

    elif action_id == "notes.duplicate":
        source_id = uuid.UUID(proposal_payload["note_id"])
        source_note = db.get(Note, source_id)
        if not source_note or source_note.workspace_id != workspace_id:
            raise NoteNotFoundError("Source note no longer exists in workspace.")
        copy_note = Note(
            workspace_id=workspace_id,
            title=proposal_payload.get("copy_title", f"{source_note.title} (Copy)"),
            content=source_note.content,
            created_by=source_note.created_by,
        )
        db.add(copy_note)
        db.commit()
        db.refresh(copy_note)
        _index_note_content(db, copy_note)
        after_state = {"id": str(copy_note.id), "title": copy_note.title}
        return (
            {
                "original_note_id": str(source_note.id),
                "new_note_id": str(copy_note.id),
                "title": copy_note.title,
                "status": "duplicated",
            },
            [str(source_note.id), str(copy_note.id)],
            None,
            after_state,
        )

    elif action_id == "notes.archive":
        note_id = uuid.UUID(proposal_payload["note_id"])
        note = db.get(Note, note_id)
        if not note or note.workspace_id != workspace_id:
            raise NoteNotFoundError("Target note no longer exists in workspace.")
        before_state = {"id": str(note.id), "is_archived": note.is_archived}
        note.is_archived = True
        note.updated_at = datetime.now(UTC)
        db.commit()
        after_state = {"id": str(note.id), "is_archived": True}
        return (
            {"note_id": str(note.id), "is_archived": True, "status": "archived"},
            [str(note.id)],
            before_state,
            after_state,
        )

    elif action_id == "notes.restore":
        note_id = uuid.UUID(proposal_payload["note_id"])
        note = db.get(Note, note_id)
        if not note or note.workspace_id != workspace_id:
            raise NoteNotFoundError("Target note no longer exists in workspace.")
        before_state = {"id": str(note.id), "is_archived": note.is_archived}
        note.is_archived = False
        note.updated_at = datetime.now(UTC)
        db.commit()
        after_state = {"id": str(note.id), "is_archived": False}
        return (
            {"note_id": str(note.id), "is_archived": False, "status": "restored"},
            [str(note.id)],
            before_state,
            after_state,
        )

    elif action_id == "notes.pin":
        note_id = uuid.UUID(proposal_payload["note_id"])
        note = db.get(Note, note_id)
        if not note or note.workspace_id != workspace_id:
            raise NoteNotFoundError("Target note no longer exists in workspace.")
        before_state = {"id": str(note.id), "is_pinned": note.is_pinned}
        note.is_pinned = True
        note.updated_at = datetime.now(UTC)
        db.commit()
        after_state = {"id": str(note.id), "is_pinned": True}
        return (
            {"note_id": str(note.id), "is_pinned": True, "status": "pinned"},
            [str(note.id)],
            before_state,
            after_state,
        )

    elif action_id == "notes.unpin":
        note_id = uuid.UUID(proposal_payload["note_id"])
        note = db.get(Note, note_id)
        if not note or note.workspace_id != workspace_id:
            raise NoteNotFoundError("Target note no longer exists in workspace.")
        before_state = {"id": str(note.id), "is_pinned": note.is_pinned}
        note.is_pinned = False
        note.updated_at = datetime.now(UTC)
        db.commit()
        after_state = {"id": str(note.id), "is_pinned": False}
        return (
            {"note_id": str(note.id), "is_pinned": False, "status": "unpinned"},
            [str(note.id)],
            before_state,
            after_state,
        )

    elif action_id == "collections.create":
        from fastapi import HTTPException
        from sqlalchemy import func as sa_func

        name = str(proposal_payload.get("name") or "").strip()
        if not name:
            raise ValidationError("Collection name cannot be empty.")
        description = proposal_payload.get("description")
        is_organize = proposal_payload.get("workflow") == "organize_knowledge"
        existing_col = db.scalars(
            select(Collection).where(
                Collection.workspace_id == workspace_id,
                sa_func.lower(Collection.name) == name.lower(),
            )
        ).first()
        if existing_col:
            if is_organize and not proposal_payload.get("allow_existing", False):
                raise ConflictError(
                    f"A collection named '{name}' already exists in this workspace. Choose a different name or populate the existing collection."
                )
            res = existing_col
        else:
            res = collection_service.create_collection(
                db, workspace_id, CollectionCreate(name=name, description=description)
            )

        added_items: list[dict[str, str]] = []
        added_note_ids: list[str] = []
        added_source_ids: list[str] = []
        skipped_existing_count = 0

        if "selected_items" in proposal_payload:
            raw_selected = [
                cand
                for cand in (proposal_payload.get("selected_items") or [])
                if isinstance(cand, dict) and cand.get("selected", True) is not False
            ]
            if is_organize and not raw_selected:
                raise ValidationError(
                    "Please select at least one item to include in the collection."
                )
            for cand in raw_selected:
                c_id_str = str(
                    cand.get("item_id") or cand.get("note_id") or cand.get("source_id") or ""
                )
                c_type = str(cand.get("item_type", "note"))
                c_title = str(cand.get("title", ""))
                try:
                    c_uuid = uuid.UUID(c_id_str)
                except ValueError as err:
                    raise ValidationError(f"Invalid item ID '{c_id_str}'.") from err

                if c_type == "note":
                    obj = db.get(Note, c_uuid)
                    if not obj or obj.workspace_id != workspace_id:
                        raise AppException(
                            404, "NOTE_NOT_FOUND", f"Note '{c_id_str}' not found in workspace."
                        )
                    c_title = c_title or obj.title
                elif c_type == "source":
                    obj = db.get(Source, c_uuid)
                    if not obj or obj.workspace_id != workspace_id:
                        raise AppException(
                            404, "SOURCE_NOT_FOUND", f"Source '{c_id_str}' not found in workspace."
                        )
                    c_title = c_title or obj.source_identifier or obj.original_path or "Source"
                elif c_type == "entity":
                    obj = db.get(GraphEntity, c_uuid)
                    if not obj or obj.workspace_id != workspace_id:
                        raise AppException(
                            404, "ENTITY_NOT_FOUND", f"Entity '{c_id_str}' not found in workspace."
                        )
                    c_title = c_title or obj.name
                elif c_type == "conversation":
                    obj = db.get(Conversation, c_uuid)
                    if not obj or obj.workspace_id != workspace_id:
                        raise AppException(
                            404,
                            "CONVERSATION_NOT_FOUND",
                            f"Conversation '{c_id_str}' not found in workspace.",
                        )
                    c_title = c_title or obj.title

                try:
                    membership_service.add_collection_item(db, res, c_type, c_uuid)
                    added_items.append(
                        {"item_id": str(c_uuid), "item_type": c_type, "title": c_title}
                    )
                    if c_type == "note":
                        added_note_ids.append(str(c_uuid))
                    elif c_type == "source":
                        added_source_ids.append(str(c_uuid))
                except HTTPException as exc:
                    if exc.status_code == 409:
                        skipped_existing_count += 1
                    else:
                        raise
        else:
            if proposal_payload.get("note_ids"):
                for nid_str in proposal_payload["note_ids"]:
                    try:
                        n_uuid = uuid.UUID(str(nid_str))
                        n_obj = db.get(Note, n_uuid)
                        if not n_obj or n_obj.workspace_id != workspace_id:
                            raise AppException(
                                404, "NOTE_NOT_FOUND", f"Note '{nid_str}' not found in workspace."
                            )
                        membership_service.add_collection_item(db, res, "note", n_uuid)
                        added_note_ids.append(str(n_uuid))
                        added_items.append(
                            {"item_id": str(n_uuid), "item_type": "note", "title": n_obj.title}
                        )
                    except HTTPException as exc:
                        if exc.status_code == 409:
                            skipped_existing_count += 1
            if proposal_payload.get("source_ids"):
                for sid_str in proposal_payload["source_ids"]:
                    try:
                        s_uuid = uuid.UUID(str(sid_str))
                        s_obj = db.get(Source, s_uuid)
                        if not s_obj or s_obj.workspace_id != workspace_id:
                            raise AppException(
                                404,
                                "SOURCE_NOT_FOUND",
                                f"Source '{sid_str}' not found in workspace.",
                            )
                        membership_service.add_collection_item(db, res, "source", s_uuid)
                        added_source_ids.append(str(s_uuid))
                        added_items.append(
                            {
                                "item_id": str(s_uuid),
                                "item_type": "source",
                                "title": s_obj.source_identifier or s_obj.original_path or "Source",
                            }
                        )
                    except HTTPException as exc:
                        if exc.status_code == 409:
                            skipped_existing_count += 1

        affected_all = [str(res.id), *[it["item_id"] for it in added_items]]
        after_state = {
            "id": str(res.id),
            "name": res.name,
            "added_note_ids": added_note_ids,
            "added_source_ids": added_source_ids,
            "added_items": added_items,
        }
        result_data: dict[str, Any] = {
            "collection_id": str(res.id),
            "name": res.name,
            "description": res.description,
            "status": "created",
        }
        if added_items or is_organize:
            result_data["added_items"] = added_items
            result_data["added_note_ids"] = added_note_ids
            result_data["added_source_ids"] = added_source_ids
            result_data["added_count"] = len(added_items)
            result_data["skipped_existing_count"] = skipped_existing_count
        return (
            result_data,
            affected_all,
            None,
            after_state,
        )

    elif action_id == "collections.rename":
        coll_id = uuid.UUID(proposal_payload["collection_id"])
        new_name = proposal_payload["new_name"]
        description = proposal_payload.get("description")
        coll = db.get(Collection, coll_id)
        if not coll or coll.workspace_id != workspace_id:
            raise AppException(404, "COLLECTION_NOT_FOUND", "Collection not found in workspace.")
        before_state = {"id": str(coll.id), "name": coll.name, "description": coll.description}
        res = collection_service.update_collection(
            db, coll_id, CollectionUpdate(name=new_name, description=description)
        )
        after_state = {"id": str(res.id), "name": res.name}
        return (
            {"collection_id": str(res.id), "name": res.name, "status": "renamed"},
            [str(res.id)],
            before_state,
            after_state,
        )

    elif action_id == "collections.delete":
        coll_id = uuid.UUID(proposal_payload["collection_id"])
        coll = db.get(Collection, coll_id)
        if not coll or coll.workspace_id != workspace_id:
            raise AppException(404, "COLLECTION_NOT_FOUND", "Collection not found in workspace.")
        before_state = {"id": str(coll.id), "name": coll.name}
        collection_service.delete_collection(db, coll_id)
        return (
            {"collection_id": str(coll_id), "deleted": True, "status": "deleted"},
            [str(coll_id)],
            before_state,
            None,
        )

    elif action_id == "collections.remove_item":
        coll_id = uuid.UUID(proposal_payload["collection_id"])
        item_id = uuid.UUID(proposal_payload["item_id"])
        item_type = proposal_payload["item_type"]
        coll = db.get(Collection, coll_id)
        if not coll or coll.workspace_id != workspace_id:
            raise AppException(404, "COLLECTION_NOT_FOUND", "Collection not found in workspace.")
        membership_service.remove_collection_item(db, coll, item_type, item_id)
        return (
            {
                "collection_id": str(coll_id),
                "item_id": str(item_id),
                "item_type": item_type,
                "status": "removed",
            },
            [str(coll_id), str(item_id)],
            None,
            None,
        )

    elif action_id == "collections.move_item":
        src_id = uuid.UUID(proposal_payload["source_collection_id"])
        tgt_id = uuid.UUID(proposal_payload["target_collection_id"])
        item_id = uuid.UUID(proposal_payload["item_id"])
        item_type = proposal_payload["item_type"]
        src_coll = db.get(Collection, src_id)
        tgt_coll = db.get(Collection, tgt_id)
        if (
            not src_coll
            or src_coll.workspace_id != workspace_id
            or not tgt_coll
            or tgt_coll.workspace_id != workspace_id
        ):
            raise AppException(404, "COLLECTION_NOT_FOUND", "Collection not found in workspace.")
        membership_service.remove_collection_item(db, src_coll, item_type, item_id)
        membership_service.add_collection_item(db, tgt_coll, item_type, item_id)
        return (
            {
                "source_collection_id": str(src_id),
                "target_collection_id": str(tgt_id),
                "item_id": str(item_id),
                "status": "moved",
            },
            [str(src_id), str(tgt_id), str(item_id)],
            None,
            {"source_collection_id": str(src_id), "target_collection_id": str(tgt_id)},
        )

    elif action_id == "sources.create":
        title = proposal_payload["title"]
        content = proposal_payload["content"]
        has_ext, ext = _has_explicit_file_extension(title)
        from app.services.file_validation_service import EXTENSION_TO_SOURCE_TYPE

        if has_ext:
            # Either valid extension (e.g. .md, .txt) or invalid extension (e.g. .exe) which upload_source will reject
            upload_filename = title
        else:
            # Human-readable free-text source title without file extension
            upload_filename = f"{title}.txt"

        source = source_service.upload_source(
            db=db,
            workspace_id=workspace_id,
            file_content=content.encode("utf-8"),
            filename=upload_filename,
            content_type="text/plain",
        )
        if not has_ext or ext in EXTENSION_TO_SOURCE_TYPE:
            meta = dict(source.raw_metadata or {})
            meta["title"] = title
            source.raw_metadata = meta
            source.source_identifier = title
            db.commit()
            db.refresh(source)
        after_state = {"id": str(source.id), "title": title}
        return (
            {
                "source_id": str(source.id),
                "title": title,
                "source_type": source.source_type,
                "status": "created",
            },
            [str(source.id)],
            None,
            after_state,
        )

    elif action_id == "sources.rename":
        source_id = uuid.UUID(proposal_payload["source_id"])
        new_title = proposal_payload["new_title"]
        source = db.get(Source, source_id)
        if not source or source.workspace_id != workspace_id:
            raise SourceNotFoundError("Source not found in workspace.")
        before_state = {"id": str(source.id), "title": source.original_path}
        source.original_path = new_title
        meta = dict(source.raw_metadata or {})
        meta["title"] = new_title
        source.raw_metadata = meta
        db.commit()
        db.refresh(source)
        after_state = {"id": str(source.id), "title": new_title}
        return (
            {"source_id": str(source.id), "title": new_title, "status": "renamed"},
            [str(source.id)],
            before_state,
            after_state,
        )

    elif action_id == "sources.delete":
        source_id = uuid.UUID(proposal_payload["source_id"])
        source = db.get(Source, source_id)
        if not source or source.workspace_id != workspace_id:
            raise SourceNotFoundError("Source not found in workspace.")
        before_state = {"id": str(source.id), "title": source.original_path}
        source_service.delete_source(db, source_id)
        return (
            {"source_id": str(source_id), "deleted": True, "status": "deleted"},
            [str(source_id)],
            before_state,
            None,
        )

    elif action_id == "sources.archive":
        source_id = uuid.UUID(proposal_payload["source_id"])
        source = db.get(Source, source_id)
        if not source or source.workspace_id != workspace_id:
            raise SourceNotFoundError("Source not found in workspace.")
        meta = dict(source.raw_metadata or {})
        meta["is_archived"] = True
        source.raw_metadata = meta
        db.commit()
        return (
            {"source_id": str(source.id), "is_archived": True, "status": "archived"},
            [str(source.id)],
            None,
            {"id": str(source.id), "is_archived": True},
        )

    elif action_id == "entities.create":
        if proposal_payload.get("workflow") in (
            "extract_entities",
            "organize_entities",
        ) and (
            proposal_payload.get("entities")
            or proposal_payload.get("selected_entities")
            or proposal_payload.get("relationships")
            or proposal_payload.get("selected_relationships")
        ):
            from sqlalchemy import func as sa_func

            raw_ents = (
                proposal_payload["selected_entities"]
                if "selected_entities" in proposal_payload
                else proposal_payload.get("entities", [])
            )
            filtered_ents = [
                ent
                for ent in raw_ents
                if (isinstance(ent, dict) and ent.get("selected", True) is not False)
                or isinstance(ent, str)
            ]
            raw_rels = (
                proposal_payload["selected_relationships"]
                if "selected_relationships" in proposal_payload
                else proposal_payload.get("relationships", [])
            )
            filtered_rels = [
                rel
                for rel in raw_rels
                if isinstance(rel, dict) and rel.get("selected", True) is not False
            ]
            if (
                proposal_payload.get("workflow") == "organize_entities"
                and not filtered_ents
                and not filtered_rels
            ):
                raise ValidationError(
                    "Please select at least one entity or relationship to create."
                )

            persisted_entities: list[dict[str, Any]] = []
            affected_ids: list[str] = []
            created_count = 0
            existing_count = 0
            entity_by_lower: dict[str, GraphEntity] = {}

            def _ensure_entity(
                ent_name_raw: str, ent_type_raw: str = "concept", ent_desc_raw: str | None = None
            ) -> GraphEntity | None:
                nonlocal created_count, existing_count
                ent_name = ent_name_raw.strip()[:150]
                if not ent_name:
                    return None
                if ent_name.lower() in entity_by_lower:
                    return entity_by_lower[ent_name.lower()]
                ent_type_map = {
                    "location": "place",
                    "organization": "concept",
                    "document": "concept",
                }
                ent_type = ent_type_map.get(ent_type_raw, ent_type_raw)
                if ent_type not in (
                    "concept",
                    "person",
                    "technology",
                    "project",
                    "place",
                    "event",
                    "unknown",
                ):
                    ent_type = "concept"
                existing_ent = db.scalars(
                    select(GraphEntity).where(
                        GraphEntity.workspace_id == workspace_id,
                        sa_func.lower(GraphEntity.name) == ent_name.lower(),
                    )
                ).first()
                if existing_ent:
                    existing_count += 1
                    entity_by_lower[ent_name.lower()] = existing_ent
                    persisted_entities.append(
                        {
                            "entity_id": str(existing_ent.id),
                            "name": existing_ent.name,
                            "entity_type": existing_ent.entity_type,
                            "description": existing_ent.description or ent_desc_raw,
                            "status": "existing",
                        }
                    )
                    affected_ids.append(str(existing_ent.id))
                    return existing_ent
                created_ent = graph_service.create_entity(
                    db,
                    workspace_id,
                    GraphEntityCreate(
                        name=ent_name, entity_type=ent_type, description=ent_desc_raw
                    ),
                )
                created_count += 1
                entity_by_lower[ent_name.lower()] = created_ent
                persisted_entities.append(
                    {
                        "entity_id": str(created_ent.id),
                        "name": created_ent.name,
                        "entity_type": created_ent.entity_type,
                        "description": created_ent.description,
                        "status": "created",
                    }
                )
                affected_ids.append(str(created_ent.id))
                return created_ent

            for ent in filtered_ents:
                e_name = str(ent.get("name", "") if isinstance(ent, dict) else ent).strip()
                e_type = (
                    str(ent.get("entity_type", "concept"))
                    if isinstance(ent, dict)
                    else "concept"
                )
                e_desc = (
                    str(ent.get("description", ""))[:1000]
                    if isinstance(ent, dict) and ent.get("description")
                    else None
                )
                _ensure_entity(e_name, e_type, e_desc)

            persisted_relationships: list[dict[str, Any]] = []
            relationships_created_count = 0
            for rel in filtered_rels:
                src_name = str(rel.get("source_entity") or rel.get("source_name") or "").strip()
                tgt_name = str(rel.get("target_entity") or rel.get("target_name") or "").strip()
                rel_type = str(rel.get("relationship_type") or "related_to").strip()[:100]
                rel_desc = (
                    str(rel.get("description") or "")[:500] if rel.get("description") else None
                )
                if not src_name or not tgt_name or src_name.lower() == tgt_name.lower():
                    continue
                src_ent = _ensure_entity(src_name)
                tgt_ent = _ensure_entity(tgt_name)
                if not src_ent or not tgt_ent:
                    continue
                existing_rel = db.scalars(
                    select(GraphRelationship).where(
                        GraphRelationship.workspace_id == workspace_id,
                        GraphRelationship.source_entity_id == src_ent.id,
                        GraphRelationship.target_entity_id == tgt_ent.id,
                        GraphRelationship.relationship_type == rel_type,
                    )
                ).first()
                if not existing_rel:
                    new_rel = GraphRelationship(
                        workspace_id=workspace_id,
                        source_entity_id=src_ent.id,
                        target_entity_id=tgt_ent.id,
                        relationship_type=rel_type,
                        description=rel_desc,
                    )
                    db.add(new_rel)
                    db.commit()
                    db.refresh(new_rel)
                    relationships_created_count += 1
                    persisted_relationships.append(
                        {
                            "relationship_id": str(new_rel.id),
                            "source_entity": src_ent.name,
                            "target_entity": tgt_ent.name,
                            "relationship_type": rel_type,
                            "status": "created",
                        }
                    )
                else:
                    persisted_relationships.append(
                        {
                            "relationship_id": str(existing_rel.id),
                            "source_entity": src_ent.name,
                            "target_entity": tgt_ent.name,
                            "relationship_type": rel_type,
                            "status": "existing",
                        }
                    )

            first_ent = persisted_entities[0] if persisted_entities else {}
            after_state = {
                "id": first_ent.get("entity_id", ""),
                "name": first_ent.get("name", proposal_payload.get("name", "")),
                "entity_type": first_ent.get("entity_type", "concept"),
                "entities": persisted_entities,
                "relationships": persisted_relationships,
            }
            return (
                {
                    "entity_id": first_ent.get("entity_id", ""),
                    "name": first_ent.get("name", proposal_payload.get("name", "")),
                    "entity_type": first_ent.get("entity_type", "concept"),
                    "target": proposal_payload.get("target", ""),
                    "target_id": proposal_payload.get("target_id", ""),
                    "entities": persisted_entities,
                    "relationships": persisted_relationships,
                    "total_extracted": len(persisted_entities),
                    "created_count": created_count,
                    "existing_count": existing_count,
                    "relationships_created_count": relationships_created_count,
                    "status": "extracted_committed",
                },
                affected_ids,
                None,
                after_state,
            )

        name = proposal_payload["name"]
        etype = proposal_payload.get("entity_type", "concept")
        desc = proposal_payload.get("description")
        entity = graph_service.create_entity(
            db, workspace_id, GraphEntityCreate(name=name, entity_type=etype, description=desc)
        )
        after_state = {"id": str(entity.id), "name": entity.name, "entity_type": entity.entity_type}
        return (
            {
                "entity_id": str(entity.id),
                "name": entity.name,
                "entity_type": entity.entity_type,
                "status": "created",
            },
            [str(entity.id)],
            None,
            after_state,
        )

    elif action_id == "entities.update":
        entity_id = uuid.UUID(proposal_payload["entity_id"])
        entity = db.get(GraphEntity, entity_id)
        if not entity or entity.workspace_id != workspace_id:
            raise EntityNotFoundError("Entity not found in workspace.")
        before_state = {
            "id": str(entity.id),
            "name": entity.name,
            "entity_type": entity.entity_type,
        }
        res = graph_service.update_entity(
            db,
            entity_id,
            GraphEntityUpdate(
                name=proposal_payload.get("name"),
                entity_type=proposal_payload.get("entity_type"),
                description=proposal_payload.get("description"),
            ),
        )
        after_state = {"id": str(res.id), "name": res.name}
        return (
            {"entity_id": str(res.id), "name": res.name, "status": "updated"},
            [str(res.id)],
            before_state,
            after_state,
        )

    elif action_id == "entities.delete":
        entity_id = uuid.UUID(proposal_payload["entity_id"])
        entity = db.get(GraphEntity, entity_id)
        if not entity or entity.workspace_id != workspace_id:
            raise EntityNotFoundError("Entity not found in workspace.")
        before_state = {"id": str(entity.id), "name": entity.name}
        graph_service.delete_entity(db, entity_id)
        return (
            {"entity_id": str(entity_id), "deleted": True, "status": "deleted"},
            [str(entity_id)],
            before_state,
            None,
        )

    elif action_id == "graph.delete_relationship":
        rel_id = uuid.UUID(proposal_payload["relationship_id"])
        rel = db.get(GraphRelationship, rel_id)
        if not rel or rel.workspace_id != workspace_id:
            raise AppException(404, "RELATIONSHIP_NOT_FOUND", "Relationship not found in workspace.")
        before_state = {"id": str(rel.id)}
        graph_service.delete_relationship(db, rel_id)
        return (
            {"relationship_id": str(rel_id), "deleted": True, "status": "deleted"},
            [str(rel_id)],
            before_state,
            None,
        )

    elif action_id == "inbox.dismiss":
        item_id = uuid.UUID(proposal_payload["inbox_item_id"])
        inbox_service.reject_inbox_item(db, item_id)
        return (
            {"inbox_item_id": str(item_id), "status": "rejected"},
            [str(item_id)],
            None,
            {"status": "rejected"},
        )

    elif action_id == "inbox.accept_item":
        item_id = uuid.UUID(proposal_payload["inbox_item_id"])
        accepted, _ = inbox_service.accept_inbox_item(db, item_id)
        return (
            {"inbox_item_id": str(item_id), "status": accepted.status},
            [str(item_id)],
            None,
            {"status": accepted.status},
        )

    elif action_id == "tags.add_to_note":
        note_id = uuid.UUID(proposal_payload["note_id"])
        tag_name = proposal_payload["tag_name"]
        tag = tag_service.add_tag_to_note(db, note_id, tag_name)
        return (
            {"note_id": str(note_id), "tag_id": str(tag.id), "tag_name": tag.name, "status": "tagged"},
            [str(note_id)],
            None,
            {"tag_id": str(tag.id), "tag_name": tag.name},
        )

    elif action_id == "tags.remove_from_note":
        note_id = uuid.UUID(proposal_payload["note_id"])
        tag_name = proposal_payload["tag_name"]
        note = db.get(Note, note_id)
        if not note or note.workspace_id != workspace_id:
            raise NoteNotFoundError("Note not found in workspace.")
        tag = next((t for t in note.tags if t.name.lower() == tag_name.lower()), None)
        if tag:
            tag_service.remove_tag_from_note(db, note_id, tag.id)
        return (
            {"note_id": str(note_id), "tag_name": tag_name, "status": "untagged"},
            [str(note_id)],
            None,
            None,
        )

    elif action_id == "conversations.create":
        if proposal_payload.get("workflow") == "organize_create_thread":
            from fastapi import HTTPException

            from app.models.thread import Thread
            from app.schemas.thread import ThreadCreate
            from app.services import thread_service

            title = str(
                proposal_payload.get("title") or proposal_payload.get("name") or ""
            ).strip()
            if not title:
                raise ValidationError("Thread title cannot be empty.")
            question = (
                str(
                    proposal_payload.get("question")
                    or proposal_payload.get("description")
                    or ""
                ).strip()
                or None
            )
            raw_selected = [
                cand
                for cand in (proposal_payload.get("selected_items") or [])
                if isinstance(cand, dict) and cand.get("selected", True) is not False
            ]
            # Validate all selected items belong to the workspace before creating
            for cand in raw_selected:
                c_id_str = str(
                    cand.get("item_id") or cand.get("note_id") or cand.get("source_id") or ""
                )
                c_type = str(cand.get("item_type", "note"))
                try:
                    c_uuid = uuid.UUID(c_id_str)
                except ValueError as err:
                    raise ValidationError(f"Invalid item ID '{c_id_str}'.") from err
                if c_type == "note":
                    obj = db.get(Note, c_uuid)
                    if not obj or obj.workspace_id != workspace_id:
                        raise AppException(
                            404, "NOTE_NOT_FOUND", f"Note '{c_id_str}' not found in workspace."
                        )
                elif c_type == "source":
                    obj = db.get(Source, c_uuid)
                    if not obj or obj.workspace_id != workspace_id:
                        raise AppException(
                            404, "SOURCE_NOT_FOUND", f"Source '{c_id_str}' not found in workspace."
                        )
                elif c_type == "entity":
                    obj = db.get(GraphEntity, c_uuid)
                    if not obj or obj.workspace_id != workspace_id:
                        raise AppException(
                            404, "ENTITY_NOT_FOUND", f"Entity '{c_id_str}' not found in workspace."
                        )
                elif c_type == "conversation":
                    obj = db.get(Conversation, c_uuid)
                    if not obj or obj.workspace_id != workspace_id:
                        raise AppException(
                            404,
                            "CONVERSATION_NOT_FOUND",
                            f"Conversation '{c_id_str}' not found in workspace.",
                        )

            created_thread_resp = thread_service.create_thread(
                db,
                workspace_id,
                ThreadCreate(title=title, question=question, status="active"),
            )
            thread_obj = db.get(Thread, created_thread_resp.id)
            added_items: list[dict[str, str]] = []
            affected_ids = [str(created_thread_resp.id)]
            if thread_obj:
                for cand in raw_selected:
                    c_id_str = str(
                        cand.get("item_id") or cand.get("note_id") or cand.get("source_id") or ""
                    )
                    c_type = str(cand.get("item_type", "note"))
                    c_title = str(cand.get("title", ""))
                    try:
                        c_uuid = uuid.UUID(c_id_str)
                        membership_service.add_thread_item(db, thread_obj, c_type, c_uuid)
                        added_items.append(
                            {"item_id": str(c_uuid), "item_type": c_type, "title": c_title}
                        )
                        affected_ids.append(str(c_uuid))
                    except HTTPException as exc:
                        if exc.status_code != 409:
                            raise
            after_state = {
                "id": str(created_thread_resp.id),
                "thread_id": str(created_thread_resp.id),
                "title": created_thread_resp.title,
                "question": created_thread_resp.question,
                "added_items": added_items,
            }
            return (
                {
                    "thread_id": str(created_thread_resp.id),
                    "title": created_thread_resp.title,
                    "question": created_thread_resp.question,
                    "added_items": added_items,
                    "added_count": len(added_items),
                    "status": "thread_created",
                },
                affected_ids,
                None,
                after_state,
            )

        title = proposal_payload.get("title")
        conv = conversation_service.create_conversation(db, workspace_id, title=title)
        after_state = {"id": str(conv.id), "title": conv.title}
        return (
            {"conversation_id": str(conv.id), "title": conv.title, "status": "created"},
            [str(conv.id)],
            None,
            after_state,
        )

    elif action_id == "conversations.rename":
        conv_id = uuid.UUID(proposal_payload["conversation_id"])
        new_title = proposal_payload["new_title"]
        conv = conversation_service.get_conversation(db, conv_id)
        if not conv or conv.workspace_id != workspace_id:
            raise AppException(404, "CONVERSATION_NOT_FOUND", "Conversation not found in workspace.")
        before_state = {"id": str(conv.id), "title": conv.title}
        res = conversation_service.rename_conversation(db, conv_id, new_title)
        after_state = {"id": str(res.id), "title": res.title}
        return (
            {"conversation_id": str(res.id), "title": res.title, "status": "renamed"},
            [str(res.id)],
            before_state,
            after_state,
        )

    elif action_id == "conversations.delete":
        conv_id = uuid.UUID(proposal_payload["conversation_id"])
        conv = conversation_service.get_conversation(db, conv_id)
        if not conv or conv.workspace_id != workspace_id:
            raise AppException(404, "CONVERSATION_NOT_FOUND", "Conversation not found in workspace.")
        before_state = {"id": str(conv.id), "title": conv.title}
        conversation_service.delete_conversation(db, conv_id)
        return (
            {"conversation_id": str(conv_id), "deleted": True, "status": "deleted"},
            [str(conv_id)],
            before_state,
            None,
        )

    raise ValidationError(f"Unknown action_id for commit: {action_id}")


# ─────────────────────────────────────────────────────────────────────────────
# Undo Engine (Restores prior state and records new mutation per §6.5)
# ─────────────────────────────────────────────────────────────────────────────


def execute_undo(
    db: Session,
    workspace_id: uuid.UUID,
    change_set: ActionChangeSet,
) -> dict[str, Any]:
    """Execute undo operation for a supported mutation per Contract v0.5.1 §6.5."""
    if change_set.workspace_id != workspace_id:
        raise AppException(403, "WORKSPACE_SCOPE_VIOLATION", "Cross-workspace undo prohibited.")

    if change_set.undo_status == "undone":
        raise ConflictError("Change set has already been undone.")

    action_id = change_set.action_id
    before_state = change_set.before_state
    after_state = change_set.after_state

    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise AppException(404, "WORKSPACE_NOT_FOUND", "Workspace not found.")

    mutation_details: dict[str, Any] = {}

    if action_id == "notes.create":
        if after_state and after_state.get("created_note_ids"):
            deleted_ids: list[str] = []
            for nid_str in after_state["created_note_ids"]:
                try:
                    n = db.get(Note, uuid.UUID(str(nid_str)))
                    if n and n.workspace_id == workspace_id:
                        db.delete(n)
                        deleted_ids.append(str(nid_str))
                except ValueError:
                    pass
            db.commit()
            mutation_details = {
                "undone_action": "notes.create",
                "deleted_note_ids": deleted_ids,
            }
        else:
            # Undo creation by deleting the created note
            note_id_str = after_state.get("id") if after_state else change_set.affected_item_ids[0]
            note = db.get(Note, uuid.UUID(note_id_str))
            if note:
                db.delete(note)
                db.commit()
                mutation_details = {"undone_action": "notes.create", "deleted_note_id": note_id_str}
            else:
                mutation_details = {"undone_action": "notes.create", "note_already_deleted": True}

    elif action_id == "notes.update":
        # Undo update by restoring before_state
        if not before_state:
            raise ValidationError("Cannot undo update without recorded before-state.")
        note_id = uuid.UUID(before_state["id"])
        note = db.get(Note, note_id)
        if not note or note.workspace_id != workspace_id:
            raise ConflictError("Note no longer exists for undo.")

        note.title = before_state["title"]
        note.content = before_state.get("content")
        note.updated_at = datetime.now(UTC)
        db.commit()
        mutation_details = {
            "undone_action": "notes.update",
            "restored_title": note.title,
            "note_id": str(note.id),
        }

    elif action_id == "notes.link":
        # Undo link by deleting NoteLink
        if after_state and "source_note_id" in after_state and "target_note_id" in after_state:
            src_id = uuid.UUID(after_state["source_note_id"])
            tgt_id = uuid.UUID(after_state["target_note_id"])
            link = db.scalars(
                select(NoteLink).where(
                    NoteLink.source_note_id == src_id,
                    NoteLink.target_note_id == tgt_id,
                )
            ).first()
            if link:
                db.delete(link)
                db.commit()
        mutation_details = {"undone_action": "notes.link", "link_removed": True}

    elif action_id == "collections.add_item":
        # Undo collections.add_item by removing from collection
        if after_state:
            coll_id = uuid.UUID(after_state["collection_id"])
            item_id = uuid.UUID(after_state["item_id"])
            item_type = after_state["item_type"]
            coll = db.get(Collection, coll_id)
            if coll:
                membership_service.remove_collection_item(db, coll, item_type, item_id)
        mutation_details = {"undone_action": "collections.add_item", "item_removed": True}

    elif action_id == "graph.add_relationship":
        # Undo relationship creation by deleting GraphRelationship
        if after_state and "relationship_id" in after_state:
            rel = db.get(GraphRelationship, uuid.UUID(after_state["relationship_id"]))
            if rel:
                db.delete(rel)
                db.commit()
        mutation_details = {"undone_action": "graph.add_relationship", "relationship_removed": True}

    elif action_id == "notes.delete":
        # Undo deletion by restoring note from before_state (§6.6)
        if not before_state:
            raise ValidationError("Cannot undo deletion without before-state recovery data.")
        note_id = uuid.UUID(before_state["id"])
        existing = db.get(Note, note_id)
        if existing:
            raise ConflictError("Note with this ID already exists.")

        restored_note = Note(
            id=note_id,
            workspace_id=workspace_id,
            title=before_state["title"],
            content=before_state.get("content"),
            created_by=uuid.UUID(before_state.get("created_by", str(ws.owner_id))),
        )
        db.add(restored_note)
        db.commit()
        mutation_details = {
            "undone_action": "notes.delete",
            "restored_note_id": str(restored_note.id),
            "title": restored_note.title,
        }

    else:
        raise ValidationError(f"Action '{action_id}' does not support undo.")

    # Mark change set as undone (§6.5)
    change_set.undo_status = "undone"
    change_set.undone_at = datetime.now(UTC)
    db.commit()

    return mutation_details
