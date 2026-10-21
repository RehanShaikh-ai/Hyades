"""Handlers and commit/undo mutations for the 6 Controlled Writes per CONTRACT v0.5.1 §6.2, §6.4, §6.5, §6.6, §7.4.

Actions:
32. notes.create
33. notes.update
34. notes.link
35. collections.add_item
36. graph.add_relationship
37. notes.delete
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.actions.types import (
    ActionHandlerResult,
    CollectionsAddItemInput,
    GraphAddRelationshipInput,
    NotesCreateInput,
    NotesDeleteInput,
    NotesLinkInput,
    NotesUpdateInput,
)
from app.core.exceptions import (
    AppException,
    ConflictError,
    EntityNotFoundError,
    NoteNotFoundError,
    ValidationError,
)
from app.models.action_change_set import ActionChangeSet
from app.models.collection import Collection
from app.models.graph_entity import GraphEntity
from app.models.graph_relationship import GraphRelationship
from app.models.note import Note
from app.models.note_link import NoteLink
from app.models.note_tag import NoteTag
from app.models.tag import Tag
from app.models.workspace import Workspace
from app.schemas.note import NoteCreate, NoteUpdate
from app.services import membership_service, note_service, version_service


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
        title = proposal_payload["title"]
        content = proposal_payload.get("content", "")
        tags = proposal_payload.get("tags", [])

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

        db.commit()
        db.refresh(note)

        after_state = {
            "id": str(note.id),
            "title": note.title,
            "content": note.content,
            "tags": tags,
        }
        return (
            {"note_id": str(note.id), "title": note.title, "status": "created"},
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
        if not src or src.workspace_id != workspace_id or not tgt or tgt.workspace_id != workspace_id:
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

        membership_service.add_collection_item(db, coll, item_type, item_id)
        after_state = {
            "collection_id": str(coll_id),
            "item_type": item_type,
            "item_id": str(item_id),
        }
        return (
            {"collection_id": str(coll_id), "item_type": item_type, "item_id": str(item_id), "status": "added"},
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
        if not src or src.workspace_id != workspace_id or not tgt or tgt.workspace_id != workspace_id:
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
