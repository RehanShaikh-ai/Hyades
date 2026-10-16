"""Saved Observatory Views service per CONTRACT v0.4.2 §7.1, §8.3, §13."""

import json
import logging
from typing import Any
import uuid

from fastapi import status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import AppException, ConflictError, WorkspaceNotFoundError
from app.models.graph_entity import GraphEntity
from app.models.saved_view import SavedView
from app.models.workspace import Workspace
from app.schemas.saved_view import MAX_SAVED_VIEW_STATE_BYTES, SavedViewCreate, SavedViewUpdate

logger = logging.getLogger("app.services.saved_view_service")


class SavedViewNotFoundError(AppException):
    """Raised when a saved view is not found."""

    def __init__(self, message: str = "Saved view not found.") -> None:
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            code="SAVED_VIEW_NOT_FOUND",
            message=message,
        )


def create_saved_view(db: Session, data: SavedViewCreate, user_id: uuid.UUID | None = None) -> SavedView:
    """Create a new saved observatory view."""
    ws = db.get(Workspace, data.workspace_id)
    if not ws:
        raise WorkspaceNotFoundError("Workspace not found")

    # Name uniqueness within workspace
    existing = db.scalars(
        select(SavedView).where(
            SavedView.workspace_id == data.workspace_id,
            func.lower(SavedView.name) == data.name.strip().lower(),
        )
    ).first()
    if existing:
        raise ConflictError(f"A saved view with name '{data.name}' already exists in this workspace")

    creator_id = user_id or data.created_by or ws.owner_id
    state_dict = data.state.model_dump()
    view = SavedView(
        workspace_id=data.workspace_id,
        name=data.name.strip(),
        state=state_dict,
        created_by=creator_id,
    )
    db.add(view)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError(f"Saved view '{data.name}' could not be created: {exc}") from exc

    db.refresh(view)
    logger.info("Created saved view %s (%s) in workspace %s", view.id, view.name, view.workspace_id)
    return view


def list_saved_views(
    db: Session,
    workspace_id: uuid.UUID,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[SavedView], int]:
    """List saved observatory views in a workspace with pagination."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError("Workspace not found")

    offset = (page - 1) * page_size
    query = select(SavedView).where(SavedView.workspace_id == workspace_id).order_by(SavedView.created_at.desc())
    count_query = select(func.count(SavedView.id)).where(SavedView.workspace_id == workspace_id)

    total = db.scalar(count_query) or 0
    items = list(db.scalars(query.offset(offset).limit(page_size)).all())
    return items, total


def get_saved_view(db: Session, saved_view_id: uuid.UUID) -> SavedView:
    """Get a saved observatory view by ID."""
    view = db.get(SavedView, saved_view_id)
    if not view:
        raise SavedViewNotFoundError("Saved view not found")
    return view


def update_saved_view(db: Session, saved_view_id: uuid.UUID, data: SavedViewUpdate) -> SavedView:
    """Update a saved observatory view's name or state."""
    view = get_saved_view(db, saved_view_id)

    if data.name is not None and data.name.strip():
        new_name = data.name.strip()
        if new_name.lower() != view.name.lower():
            conflict = db.scalars(
                select(SavedView).where(
                    SavedView.workspace_id == view.workspace_id,
                    SavedView.id != view.id,
                    func.lower(SavedView.name) == new_name.lower(),
                )
            ).first()
            if conflict:
                raise ConflictError(f"A saved view with name '{new_name}' already exists in this workspace")
            view.name = new_name

    if data.state is not None:
        view.state = data.state.model_dump()

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError(f"Could not update saved view: {exc}") from exc

    db.refresh(view)
    logger.info("Updated saved view %s (%s)", view.id, view.name)
    return view


def delete_saved_view(db: Session, saved_view_id: uuid.UUID) -> None:
    """Delete a saved observatory view."""
    view = get_saved_view(db, saved_view_id)
    db.delete(view)
    db.commit()
    logger.info("Deleted saved view %s", saved_view_id)


def restore_saved_view(db: Session, saved_view_id: uuid.UUID) -> dict[str, Any]:
    """Restore a saved view state onto the current graph.

    Per CONTRACT §13.3: Restoring a Saved View loads the state onto the current graph,
    ignores deleted focus entities, and never modifies graph data.
    """
    view = get_saved_view(db, saved_view_id)
    focus_ids = view.state.get("focus_entity_ids", []) if isinstance(view.state, dict) else []

    active_focus_entity_ids: list[uuid.UUID] = []
    missing_focus_entity_ids: list[str] = []

    for raw_id in focus_ids:
        try:
            ent_uuid = uuid.UUID(str(raw_id))
            ent = db.get(GraphEntity, ent_uuid)
            if ent and ent.workspace_id == view.workspace_id:
                active_focus_entity_ids.append(ent.id)
            else:
                missing_focus_entity_ids.append(str(raw_id))
        except (ValueError, TypeError):
            missing_focus_entity_ids.append(str(raw_id))

    return {
        "id": view.id,
        "name": view.name,
        "state": view.state,
        "active_focus_entity_ids": active_focus_entity_ids,
        "missing_focus_entity_ids": missing_focus_entity_ids,
    }
