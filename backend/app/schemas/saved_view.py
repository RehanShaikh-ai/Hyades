"""SavedView Pydantic schemas per CONTRACT v0.4.2 §5.2, §13."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class Point2D(BaseModel):
    x: float = 0.0
    y: float = 0.0


class SavedViewState(BaseModel):
    version: int = 1
    zoom: float = 1.0
    center: Point2D = Field(default_factory=Point2D)
    filters: dict = Field(default_factory=dict)
    focus_entity_ids: list[UUID] = Field(default_factory=list)


class SavedViewCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    state: SavedViewState


class SavedViewUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    state: SavedViewState | None = None


class SavedViewResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    name: str
    state: SavedViewState
    created_by: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SavedViewListResponse(BaseModel):
    items: list[SavedViewResponse]
    total: int
