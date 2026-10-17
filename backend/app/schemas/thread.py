"""Thread, questions, discoveries, and activity schemas per CONTRACT v0.4.2 §5.2, §8.2."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ThreadCreate(BaseModel):
    workspace_id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=200)
    question: str | None = None
    status: str = Field(default="active", pattern="^(active|archived)$")
    created_by: uuid.UUID | None = None


class ThreadUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    question: str | None = None
    status: str | None = Field(default=None, pattern="^(active|archived)$")


class ThreadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    title: str
    question: str | None
    status: str
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    question_count: int | None = 0
    discovery_count: int | None = 0
    item_count: int | None = 0


class ThreadListResponse(BaseModel):
    items: list[ThreadResponse]
    total: int
    page: int
    page_size: int


class ThreadQuestionCreate(BaseModel):
    text: str = Field(min_length=1)


class ThreadQuestionUpdate(BaseModel):
    text: str | None = Field(default=None, min_length=1)
    is_resolved: bool | None = None


class ThreadQuestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    thread_id: uuid.UUID
    text: str
    is_resolved: bool
    created_at: datetime
    updated_at: datetime


class ThreadDiscoveryCreate(BaseModel):
    content: str = Field(min_length=1)


class ThreadDiscoveryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    thread_id: uuid.UUID
    content: str
    created_at: datetime


class ThreadActivityItem(BaseModel):
    activity_type: str
    timestamp: datetime
    summary: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class ThreadActivityResponse(BaseModel):
    thread_id: uuid.UUID
    items: list[ThreadActivityItem]
    total: int
