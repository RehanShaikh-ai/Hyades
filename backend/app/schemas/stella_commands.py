"""Schemas for Stella slash commands and in-chat actions.
"""

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StellaCommandInfo(BaseModel):
    """Metadata for an in-chat slash command."""

    command: str = Field(..., description="Slash command identifier, e.g. /create-note")
    name: str = Field(..., description="Human-readable title")
    description: str = Field(..., description="Short explanation of what the command does")
    syntax: str = Field(..., description="Command syntax with arguments")
    example: str = Field(..., description="Example usage string")
    model_config = ConfigDict(extra="ignore")


class StellaCommandListResponse(BaseModel):
    """List of available slash commands for autocomplete."""

    commands: list[StellaCommandInfo]
    total: int


class StellaCreateNoteDraftRequest(BaseModel):
    """Request to generate a ~300 word note draft on a topic and propose creation."""

    topic: str = Field(..., min_length=1, max_length=500, description="Topic or prompt for note")
    conversation_id: uuid.UUID | None = Field(
        default=None, description="Optional conversation context"
    )
    model_config = ConfigDict(extra="forbid")


class StellaCreateNoteDraftResponse(BaseModel):
    """Generated note draft with staged two-phase action proposal."""

    proposal_id: uuid.UUID = Field(..., description="Action proposal UUID")
    confirmation_token: str = Field(..., description="Raw confirmation token for commit")
    action_id: str = Field(default="notes.create", description="Canonical action ID")
    title: str = Field(..., description="Generated note title")
    content: str = Field(..., description="Generated ~300 word markdown body with sections")
    word_count: int = Field(..., description="Word count of generated draft")
    status: Literal["proposed", "pending"] = "proposed"
    topic: str = Field(..., description="Original user topic/prompt")
    model_config = ConfigDict(extra="ignore")


class StellaCreateNoteCommitRequest(BaseModel):
    """Request to commit a staged note creation proposal (supports user revisions)."""

    proposal_id: uuid.UUID = Field(..., description="Action proposal UUID to commit")
    confirmation_token: str = Field(..., description="Confirmation token from draft")
    title: str | None = Field(default=None, description="Revised note title")
    content: str | None = Field(default=None, description="Revised note content")
    model_config = ConfigDict(extra="forbid")


class StellaCreateNoteCommitResponse(BaseModel):
    """Result of committing a note creation proposal."""

    note_id: uuid.UUID = Field(..., description="Created Note UUID")
    title: str = Field(..., description="Final note title")
    word_count: int = Field(..., description="Word count of created note")
    status: Literal["committed"] = "committed"
    execution_id: uuid.UUID = Field(..., description="Commit execution record UUID")
    model_config = ConfigDict(extra="ignore")


class StellaCreateNoteCancelRequest(BaseModel):
    """Request to cancel/reject a staged note proposal."""

    proposal_id: uuid.UUID = Field(..., description="Proposal UUID to cancel")
    model_config = ConfigDict(extra="forbid")


class StellaCreateNoteCancelResponse(BaseModel):
    """Result of cancelling a note proposal."""

    status: Literal["cancelled"] = "cancelled"
    proposal_id: uuid.UUID
