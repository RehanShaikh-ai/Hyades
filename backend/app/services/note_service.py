import logging
import uuid
from collections.abc import Sequence

from sqlalchemy import Select, asc, desc, func, select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import (
    ConflictError,
    NoteNotFoundError,
    UserNotFoundError,
    ValidationError,
    WorkspaceNotFoundError,
)
from app.models.note import Note
from app.models.note_link import NoteLink
from app.models.tag import Tag
from app.schemas.note import NoteCreate, NoteUpdate
from app.schemas.note_link import NoteLinkCreate
from app.services import user_service, workspace_service

logger = logging.getLogger("app.services.note_service")


def _note_statement() -> Select[tuple[Note]]:
    return select(Note).options(selectinload(Note.tags), selectinload(Note.source))


def get_workspace_or_raise(db: Session, workspace_id: uuid.UUID) -> None:
    if not workspace_service.get_workspace(db, workspace_id):
        raise WorkspaceNotFoundError()


def create_note(db: Session, workspace_id: uuid.UUID, note_in: NoteCreate) -> Note:
    """Create a note after validating its workspace and creator."""
    get_workspace_or_raise(db, workspace_id)
    if not user_service.get_user(db, note_in.created_by):
        raise UserNotFoundError("Note creator does not exist.")

    note = Note(workspace_id=workspace_id, **note_in.model_dump())
    db.add(note)
    db.commit()

    # Create initial NoteVersion snapshot and enqueue indexing
    try:
        from app.services import job_service, version_service

        version_service.create_version(
            db=db,
            workspace_id=note.workspace_id,
            note_id=note.id,
            author_id=note.created_by,
            message=f"Initial version of '{note.title}'",
        )
        job_service.enqueue_index_job(db, note.workspace_id, note_ids=[note.id])
    except Exception as e:
        logger.warning("Failed to process version or index job for note %s: %s", note.id, e)

    return get_note_or_raise(db, note.id)


def get_note(db: Session, note_id: uuid.UUID) -> Note | None:
    """Return one note and its tags, if it exists."""
    return db.scalars(_note_statement().where(Note.id == note_id)).first()


def get_note_or_raise(db: Session, note_id: uuid.UUID) -> Note:
    """Return one note or raise the canonical not-found exception."""
    note = get_note(db, note_id)
    if not note:
        raise NoteNotFoundError()
    return note


def list_notes(
    db: Session,
    workspace_id: uuid.UUID,
    *,
    page: int,
    page_size: int,
    tag: str | None,
    is_pinned: bool | None,
    is_archived: bool,
    sort: str,
) -> tuple[Sequence[Note], int]:
    """List workspace notes with contract-defined filters and pagination."""
    get_workspace_or_raise(db, workspace_id)
    filters = [Note.workspace_id == workspace_id, Note.is_archived == is_archived]
    if tag is not None:
        filters.append(Note.tags.any(Tag.name == tag.strip().lower()))
    if is_pinned is not None:
        filters.append(Note.is_pinned == is_pinned)

    ordering = {
        "updated_at_desc": desc(Note.updated_at),
        "updated_at_asc": asc(Note.updated_at),
        "created_at_desc": desc(Note.created_at),
        "created_at_asc": asc(Note.created_at),
    }[sort]
    total = db.scalar(select(func.count(Note.id)).where(*filters)) or 0
    statement = (
        _note_statement()
        .where(*filters)
        .order_by(ordering)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return db.scalars(statement).all(), total


def update_note(db: Session, note_id: uuid.UUID, note_in: NoteUpdate) -> Note:
    """Apply only explicitly supplied editable fields to a note."""
    note = get_note_or_raise(db, note_id)
    updates = note_in.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(note, field, value)
    db.commit()

    # Create NoteVersion snapshot and re-index on edit if title or content changed
    if "title" in updates or "content" in updates:
        try:
            from app.services import job_service, version_service

            version_service.create_version(
                db=db,
                workspace_id=note.workspace_id,
                note_id=note.id,
                author_id=note.created_by,
                message=f"Updated '{note.title}'",
            )
            job_service.enqueue_index_job(db, note.workspace_id, note_ids=[note.id])
        except Exception as e:
            logger.warning("Failed to process version or index job for note %s: %s", note.id, e)

    return get_note_or_raise(db, note_id)


def delete_note(db: Session, note_id: uuid.UUID) -> None:
    """Delete a note, vectors, graph provenance, and clean up orphaned tags; FK cascades remove links."""
    note = get_note_or_raise(db, note_id)
    workspace_id = note.workspace_id
    # Collect associated tag IDs before deletion
    tag_ids = [t.id for t in note.tags] if note.tags else []

    # Clean up graph index provenance and vector store
    try:
        from app.services import graph_index_service
        graph_index_service.delete_note_graph(db, note_id)
    except Exception as e:
        logger.warning("Failed to clean up graph provenance for note %s: %s", note_id, e)

    try:
        from app.services import vector_service
        vector_service.delete_note_vectors(note_id, workspace_id)
    except Exception as e:
        logger.warning("Failed to clean up vectors for note %s: %s", note_id, e)

    db.delete(note)
    db.flush()

    if tag_ids:
        from app.models.note_tag import NoteTag
        from app.models.tag import Tag

        for tag_id in tag_ids:
            remaining = (
                db.scalar(select(func.count(NoteTag.note_id)).where(NoteTag.tag_id == tag_id)) or 0
            )
            if remaining == 0:
                tag = db.get(Tag, tag_id)
                if tag:
                    db.delete(tag)

    db.commit()


def create_note_link(db: Session, note_id: uuid.UUID, link_in: NoteLinkCreate) -> NoteLink:
    """Create a directed link between two notes in the same workspace."""
    source_note = get_note_or_raise(db, note_id)
    target_note = get_note_or_raise(db, link_in.target_note_id)
    if source_note.id == target_note.id:
        raise ValidationError("Self-links are not allowed.")
    if source_note.workspace_id != target_note.workspace_id:
        raise ValidationError("Notes from different workspaces cannot be linked.")
    if db.get(NoteLink, (source_note.id, target_note.id)):
        raise ConflictError()

    note_link = NoteLink(source_note_id=source_note.id, target_note_id=target_note.id)
    db.add(note_link)
    db.commit()
    db.refresh(note_link)
    return note_link


def delete_note_link(db: Session, note_id: uuid.UUID, target_note_id: uuid.UUID) -> None:
    """Delete a note link after confirming the source note exists."""
    get_note_or_raise(db, note_id)
    note_link = db.get(NoteLink, (note_id, target_note_id))
    if note_link:
        db.delete(note_link)
        db.commit()


def list_note_links(
    db: Session, note_id: uuid.UUID
) -> tuple[Sequence[NoteLink], Sequence[NoteLink]]:
    """Return outgoing and incoming links for a note."""
    get_note_or_raise(db, note_id)
    outgoing = db.scalars(select(NoteLink).where(NoteLink.source_note_id == note_id)).all()
    incoming = db.scalars(select(NoteLink).where(NoteLink.target_note_id == note_id)).all()
    return outgoing, incoming
