"""Thread Pydantic schemas per CONTRACT v0.4.2 §5.2."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ThreadCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    question: str | None = None


class ThreadUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    question: str | None = None
    status: Literal["active", "archived"] | None = None


class ThreadResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    title: str
    question: str | None = None
    status: str
    created_by: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ThreadListResponse(BaseModel):
    items: list[ThreadResponse]
    total: int
    page: int
    page_size: int


class ThreadQuestionCreate(BaseModel):
    text: str = Field(..., min_length=1)


class ThreadQuestionUpdate(BaseModel):
    text: str | None = Field(default=None, min_length=1)
    is_resolved: bool | None = None


class ThreadQuestionResponse(BaseModel):
    id: UUID
    thread_id: UUID
    text: str
    is_resolved: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ThreadDiscoveryCreate(BaseModel):
    content: str = Field(..., min_length=1)


class ThreadDiscoveryResponse(BaseModel):
    id: UUID
    thread_id: UUID
    content: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ThreadActivityItem(BaseModel):
    id: UUID
    activity_type: str
    description: str
    timestamp: datetime
    metadata: dict | None = None


class ThreadActivityResponse(BaseModel):
    items: list[ThreadActivityItem]
    total: int
