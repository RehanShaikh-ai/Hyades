"""Schemas for Saved Observatory Views per CONTRACT v0.4.2 §7.1, §8.3, §13."""

import json
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CenterPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")
    x: float = 0.0
    y: float = 0.0


class SavedViewState(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = 1
    zoom: float = 1.0
    center: CenterPoint = Field(default_factory=CenterPoint)
    filters: dict[str, Any] = Field(default_factory=dict)
    focus_entity_ids: list[str] = Field(default_factory=list)

    @field_validator("version")
    @classmethod
    def validate_version(cls, v: int) -> int:
        if v < 1:
            raise ValueError("version must be >= 1")
        return v


MAX_SAVED_VIEW_STATE_BYTES = 51200  # 50 KB per CONTRACT §13.2


class SavedViewCreate(BaseModel):
    workspace_id: uuid.UUID
    name: str = Field(..., min_length=1, max_length=100)
    state: SavedViewState
    created_by: uuid.UUID | None = None

    @field_validator("state")
    @classmethod
    def validate_state_size(cls, v: SavedViewState) -> SavedViewState:
        serialized = json.dumps(v.model_dump())
        if len(serialized.encode("utf-8")) > MAX_SAVED_VIEW_STATE_BYTES:
            raise ValueError(
                f"Saved view state size exceeds 50KB limit ({len(serialized.encode('utf-8'))} bytes)"
            )
        return v


class SavedViewUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    state: SavedViewState | None = None

    @field_validator("state")
    @classmethod
    def validate_state_size(cls, v: SavedViewState | None) -> SavedViewState | None:
        if v is not None:
            serialized = json.dumps(v.model_dump())
            if len(serialized.encode("utf-8")) > MAX_SAVED_VIEW_STATE_BYTES:
                raise ValueError(
                    f"Saved view state size exceeds 50KB limit ({len(serialized.encode('utf-8'))} bytes)"
                )
        return v


class SavedViewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    state: dict[str, Any]
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime


class SavedViewListResponse(BaseModel):
    items: list[SavedViewResponse]
    total: int
    page: int
    page_size: int


class SavedViewRestoreResponse(BaseModel):
    id: uuid.UUID
    name: str
    state: dict[str, Any]
    active_focus_entity_ids: list[uuid.UUID]
    missing_focus_entity_ids: list[str]
