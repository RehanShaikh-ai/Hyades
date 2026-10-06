"""SavedView service per CONTRACT v0.4.2 §5.3, §8.3, §13."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError
from app.models.saved_view import SavedView
from app.schemas.saved_view import SavedViewCreate, SavedViewUpdate


def create_saved_view(
    session: Session,
    workspace_id: UUID,
    created_by: UUID,
    data: SavedViewCreate,
) -> SavedView:
    existing = session.scalar(
        select(SavedView).where(
            SavedView.workspace_id == workspace_id,
            SavedView.name == data.name,
        )
    )
    if existing:
        raise ConflictError(f"Saved view with name '{data.name}' already exists in workspace")

    saved_view = SavedView(
        workspace_id=workspace_id,
        created_by=created_by,
        name=data.name,
        state=data.state.model_dump(mode="json"),
    )
    session.add(saved_view)
    session.commit()
    session.refresh(saved_view)
    return saved_view


def get_saved_view(session: Session, saved_view_id: UUID) -> SavedView:
    saved_view = session.get(SavedView, saved_view_id)
    if not saved_view:
        raise NotFoundError(f"Saved view '{saved_view_id}' not found")
    return saved_view


def list_saved_views(session: Session, workspace_id: UUID) -> list[SavedView]:
    stmt = (
        select(SavedView)
        .where(SavedView.workspace_id == workspace_id)
        .order_by(SavedView.updated_at.desc())
    )
    return list(session.scalars(stmt).all())


def update_saved_view(
    session: Session,
    saved_view_id: UUID,
    data: SavedViewUpdate,
) -> SavedView:
    saved_view = get_saved_view(session, saved_view_id)
    if data.name is not None and data.name != saved_view.name:
        existing = session.scalar(
            select(SavedView).where(
                SavedView.workspace_id == saved_view.workspace_id,
                SavedView.name == data.name,
            )
        )
        if existing:
            raise ConflictError(f"Saved view with name '{data.name}' already exists in workspace")
        saved_view.name = data.name

    if data.state is not None:
        saved_view.state = data.state.model_dump(mode="json")

    session.commit()
    session.refresh(saved_view)
    return saved_view


def delete_saved_view(session: Session, saved_view_id: UUID) -> None:
    saved_view = get_saved_view(session, saved_view_id)
    session.delete(saved_view)
    session.commit()
