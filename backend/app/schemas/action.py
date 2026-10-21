"""Pydantic schemas for action registry, execution requests, and result envelopes.

Canonical schemas per CONTRACT v0.5.1 §3.1, §5.1, §5.2, §8.2, §9.
"""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

SideEffectClassification = Literal["read", "propose", "write", "destructive"]
TimeoutClass = Literal["read", "search", "llm"]
ExecutionMode = Literal["read", "propose", "commit"]
ExecutionStatus = Literal[
    "pending",
    "running",
    "proposed",
    "awaiting_confirmation",
    "succeeded",
    "failed",
    "cancelling",
    "cancelled",
]


class ActionCatalogueItem(BaseModel):
    """Action catalogue item per Contract v0.5.1 §5.2."""

    id: str = Field(..., description="Unique dot-notation action ID (<domain>.<verb>)")
    name: str = Field(..., description="Human-readable action name")
    description: str = Field(..., description="Action purpose and behavior description")
    input_schema: dict[str, Any] = Field(..., description="JSON Schema for input parameters")
    output_schema: dict[str, Any] = Field(..., description="JSON Schema for output result")
    side_effect: SideEffectClassification = Field(..., description="Side-effect classification")
    timeout_class: TimeoutClass = Field(..., description="Timeout category for execution")
    disabled: bool = Field(default=False, description="Whether action is temporarily disabled")
    disabled_reason: str | None = Field(default=None, description="Reason if action is disabled")

    model_config = ConfigDict(extra="ignore")


class ActionCatalogueResponse(BaseModel):
    """Catalogue response wrapping all registered actions."""

    actions: list[ActionCatalogueItem] = Field(..., description="List of all canonical actions")
    total: int = Field(..., description="Total number of registered actions (must be 37)")


class ActionExecuteRequest(BaseModel):
    """Execute request payload per Contract v0.5.1 §5.1."""

    mode: ExecutionMode = Field(..., description="Execution mode: read, propose, or commit")
    input: dict[str, Any] = Field(default_factory=dict, description="Action-specific input data")
    idempotency_key: str = Field(
        ..., min_length=1, max_length=255, description="Client idempotency key"
    )
    confirmation_token: str | None = Field(
        default=None,
        description="Required confirmation token when mode is commit",
    )

    model_config = ConfigDict(extra="forbid")


class EvidenceItem(BaseModel):
    """Grounding evidence item per Contract v0.5.1 §8.2."""

    chunk_id: uuid.UUID | None = Field(
        default=None, description="UUID of chunk if source is chunked"
    )
    source_id: uuid.UUID | None = Field(default=None, description="UUID of source if applicable")
    similarity_score: float | None = Field(default=None, description="Similarity score (0.0 - 1.0)")
    item_type: str | None = Field(
        default=None, description="Type: note, source, entity, collection, thread"
    )
    item_id: uuid.UUID | str | None = Field(
        default=None, description="ID of item supporting evidence"
    )
    excerpt: str | None = Field(default=None, description="Direct text excerpt or locator")

    model_config = ConfigDict(extra="ignore")


class ProposalItem(BaseModel):
    """Action proposal returned during propose phase per Contract v0.5.1 §6.2."""

    proposal_id: uuid.UUID
    action_id: str
    changes: dict[str, Any] = Field(default_factory=dict)
    affected_item_ids: list[str] = Field(default_factory=list)
    confirmation_token: str | None = Field(
        default=None,
        description="Raw confirmation token returned ONLY in propose phase response",
    )
    expires_at: datetime
    status: str = "pending"

    model_config = ConfigDict(extra="ignore")


class CommittedChangeItem(BaseModel):
    """Committed change-set summary per Contract v0.5.1 §6.4."""

    change_set_id: uuid.UUID
    action_id: str
    affected_item_ids: list[str] = Field(default_factory=list)
    changes: dict[str, Any] = Field(default_factory=dict)
    committed_at: datetime
    undo_status: str = "not_undone"

    model_config = ConfigDict(extra="ignore")


class ActionResultEnvelope(BaseModel):
    """Canonical result envelope per Contract v0.5.1 §9."""

    execution_id: uuid.UUID
    action_id: str
    status: ExecutionStatus
    initiated_by: Literal["user", "agent"] = "user"
    result: dict[str, Any] = Field(default_factory=dict)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    interpretation: str | None = None
    proposals: list[ProposalItem] = Field(default_factory=list)
    committed_changes: list[CommittedChangeItem] = Field(default_factory=list)
    duration_ms: int = 0

    model_config = ConfigDict(extra="ignore")


class ExecutionSummaryItem(BaseModel):
    """Summary of an execution for list views."""

    execution_id: uuid.UUID
    action_id: str
    status: ExecutionStatus
    initiated_by: str
    current_stage: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error_code: str | None = None

    model_config = ConfigDict(extra="ignore")


class ExecutionListResponse(BaseModel):
    """Paginated execution list response per Contract v0.5.1 §5."""

    items: list[ExecutionSummaryItem]
    total: int
    offset: int
    limit: int


class UndoResponse(BaseModel):
    """Result of an undo operation per Contract v0.5.1 §6.5."""

    change_set_id: uuid.UUID
    undo_status: str
    undone_at: datetime
    mutation_details: dict[str, Any] = Field(default_factory=dict)
