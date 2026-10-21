"""Pydantic input and output schemas for each of the 37 canonical actions.

Per CONTRACT v0.5.1 §3.1, §7.1, §7.2, §7.3, §7.4.
"""

import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.action import EvidenceItem


@dataclass
class ActionHandlerResult:
    """Standardized handler output returned to the execution service."""

    result: dict[str, Any] = field(default_factory=dict)
    evidence: list[EvidenceItem] = field(default_factory=list)
    interpretation: str | None = None
    proposals: list[dict[str, Any]] = field(default_factory=list)
    affected_item_ids: list[str] = field(default_factory=list)
    before_state: dict[str, Any] | None = None
    after_state: dict[str, Any] | None = None


# ─────────────────────────────────────────────────────────────────────────────
# 7.1 Read Actions (12)
# ─────────────────────────────────────────────────────────────────────────────


class KnowledgeSearchAllInput(BaseModel):
    query: str = Field(..., min_length=1, description="Search query string")
    limit: int = Field(default=10, ge=1, le=100, description="Max results per item type")
    types: list[Literal["notes", "sources", "entities", "collections", "threads"]] = Field(
        default=["notes", "sources", "entities", "collections", "threads"],
        description="Item types to include in cross-knowledge search",
    )
    model_config = ConfigDict(extra="forbid")


class KnowledgeSearchAllOutput(BaseModel):
    items: list[dict[str, Any]] = Field(default_factory=list)
    total: int = 0


class NotesGetInput(BaseModel):
    note_id: uuid.UUID = Field(..., description="UUID of the note to retrieve")
    model_config = ConfigDict(extra="forbid")


class NotesGetOutput(BaseModel):
    note: dict[str, Any]


class NotesSearchInput(BaseModel):
    query: str = Field(..., min_length=1, description="Text search query")
    limit: int = Field(default=10, ge=1, le=100)
    model_config = ConfigDict(extra="forbid")


class NotesSearchOutput(BaseModel):
    items: list[dict[str, Any]] = Field(default_factory=list)
    total: int = 0


class SourcesGetInput(BaseModel):
    source_id: uuid.UUID = Field(..., description="UUID of the source to retrieve")
    model_config = ConfigDict(extra="forbid")


class SourcesGetOutput(BaseModel):
    source: dict[str, Any]


class SourcesSearchInput(BaseModel):
    query: str = Field(..., min_length=1, description="Text search query")
    limit: int = Field(default=10, ge=1, le=100)
    model_config = ConfigDict(extra="forbid")


class SourcesSearchOutput(BaseModel):
    items: list[dict[str, Any]] = Field(default_factory=list)
    total: int = 0


class SourcesGetProcessingStatusInput(BaseModel):
    source_id: uuid.UUID = Field(..., description="UUID of the source")
    model_config = ConfigDict(extra="forbid")


class SourcesGetProcessingStatusOutput(BaseModel):
    source_id: str
    processing_status: str
    detected_count: int | None = None
    error_message: str | None = None


class EntitiesGetInput(BaseModel):
    entity_id: uuid.UUID = Field(..., description="UUID of the entity")
    model_config = ConfigDict(extra="forbid")


class EntitiesGetOutput(BaseModel):
    entity: dict[str, Any]


class EntitiesSearchInput(BaseModel):
    query: str = Field(..., min_length=1, description="Entity name or query string")
    entity_type: str | None = Field(default=None, description="Optional entity type filter")
    limit: int = Field(default=10, ge=1, le=100)
    model_config = ConfigDict(extra="forbid")


class EntitiesSearchOutput(BaseModel):
    items: list[dict[str, Any]] = Field(default_factory=list)
    total: int = 0


class GraphGetNeighborsInput(BaseModel):
    entity_id: uuid.UUID = Field(..., description="Center entity UUID")
    depth: int = Field(default=1, ge=1, le=3, description="Neighborhood traversal depth")
    model_config = ConfigDict(extra="forbid")


class GraphGetNeighborsOutput(BaseModel):
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)


class GraphFindPathInput(BaseModel):
    source_entity_id: uuid.UUID = Field(..., description="Starting entity UUID")
    target_entity_id: uuid.UUID = Field(..., description="Ending entity UUID")
    max_depth: int = Field(default=4, ge=1, le=6)
    model_config = ConfigDict(extra="forbid")


class GraphFindPathOutput(BaseModel):
    found: bool
    path: list[dict[str, Any]] = Field(default_factory=list)


class CollectionsGetInput(BaseModel):
    collection_id: uuid.UUID = Field(..., description="Collection UUID")
    model_config = ConfigDict(extra="forbid")


class CollectionsGetOutput(BaseModel):
    collection: dict[str, Any]
    items: list[dict[str, Any]] = Field(default_factory=list)


class ThreadsGetInput(BaseModel):
    thread_id: uuid.UUID = Field(..., description="Thread UUID")
    model_config = ConfigDict(extra="forbid")


class ThreadsGetOutput(BaseModel):
    thread: dict[str, Any]
    questions: list[dict[str, Any]] = Field(default_factory=list)
    discoveries: list[dict[str, Any]] = Field(default_factory=list)
    items: list[dict[str, Any]] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# 7.2 Understand Actions (11)
# ─────────────────────────────────────────────────────────────────────────────


class NotesSummarizeInput(BaseModel):
    note_id: uuid.UUID = Field(..., description="Note UUID to summarize")
    model_config = ConfigDict(extra="forbid")


class NotesSummarizeOutput(BaseModel):
    summary: str
    key_points: list[str] = Field(default_factory=list)


class SourcesSummarizeInput(BaseModel):
    source_id: uuid.UUID = Field(..., description="Source UUID to summarize")
    model_config = ConfigDict(extra="forbid")


class SourcesSummarizeOutput(BaseModel):
    summary: str
    key_points: list[str] = Field(default_factory=list)


class CollectionsSummarizeInput(BaseModel):
    collection_id: uuid.UUID = Field(..., description="Collection UUID to summarize")
    model_config = ConfigDict(extra="forbid")


class CollectionsSummarizeOutput(BaseModel):
    summary: str
    themes: list[str] = Field(default_factory=list)


class ThreadsSummarizeInput(BaseModel):
    thread_id: uuid.UUID = Field(..., description="Thread UUID to summarize")
    model_config = ConfigDict(extra="forbid")


class ThreadsSummarizeOutput(BaseModel):
    summary: str
    findings: list[str] = Field(default_factory=list)


class EntitiesSummarizeInput(BaseModel):
    entity_id: uuid.UUID = Field(..., description="Entity UUID to summarize")
    model_config = ConfigDict(extra="forbid")


class EntitiesSummarizeOutput(BaseModel):
    summary: str
    connections: list[str] = Field(default_factory=list)


class NotesCompareInput(BaseModel):
    note_ids: list[uuid.UUID] = Field(
        ..., min_length=2, max_length=10, description="List of note UUIDs"
    )
    model_config = ConfigDict(extra="forbid")


class NotesCompareOutput(BaseModel):
    comparison: str
    similarities: list[str] = Field(default_factory=list)
    differences: list[str] = Field(default_factory=list)


class SourcesCompareInput(BaseModel):
    source_ids: list[uuid.UUID] = Field(
        ..., min_length=2, max_length=10, description="List of source UUIDs"
    )
    model_config = ConfigDict(extra="forbid")


class SourcesCompareOutput(BaseModel):
    comparison: str
    similarities: list[str] = Field(default_factory=list)
    differences: list[str] = Field(default_factory=list)


class KnowledgeAnswerInput(BaseModel):
    question: str = Field(
        ..., min_length=1, description="Question to answer from retrieved knowledge"
    )
    model_config = ConfigDict(extra="forbid")


class KnowledgeAnswerOutput(BaseModel):
    answer: str
    confidence_notes: str | None = None


class KnowledgeGenerateBriefInput(BaseModel):
    topic: str = Field(..., min_length=1, description="Topic or research domain for the brief")
    item_ids: list[uuid.UUID] | None = Field(default=None, description="Optional focus item IDs")
    model_config = ConfigDict(extra="forbid")


class KnowledgeGenerateBriefOutput(BaseModel):
    brief: str
    sections: list[dict[str, Any]] = Field(default_factory=list)


class NotesExtractConceptsInput(BaseModel):
    note_id: uuid.UUID = Field(..., description="Note UUID")
    model_config = ConfigDict(extra="forbid")


class NotesExtractConceptsOutput(BaseModel):
    concepts: list[str] = Field(default_factory=list)
    entities: list[dict[str, Any]] = Field(default_factory=list)


class NotesSuggestTagsInput(BaseModel):
    note_id: uuid.UUID = Field(..., description="Note UUID")
    model_config = ConfigDict(extra="forbid")


class NotesSuggestTagsOutput(BaseModel):
    suggested_tags: list[str] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# 7.3 Review Actions (8)
# ─────────────────────────────────────────────────────────────────────────────


class InboxListInput(BaseModel):
    status: str | None = Field(
        default=None, description="Filter by status: pending, accepted, rejected"
    )
    limit: int = Field(default=50, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
    model_config = ConfigDict(extra="forbid")


class InboxListOutput(BaseModel):
    items: list[dict[str, Any]] = Field(default_factory=list)
    total: int = 0


class InboxAcceptInput(BaseModel):
    inbox_item_id: uuid.UUID = Field(..., description="Inbox item UUID to accept")
    model_config = ConfigDict(extra="forbid")


class InboxAcceptOutput(BaseModel):
    inbox_item_id: str
    status: str
    source_id: str


class InboxRejectInput(BaseModel):
    inbox_item_id: uuid.UUID = Field(..., description="Inbox item UUID to reject")
    model_config = ConfigDict(extra="forbid")


class InboxRejectOutput(BaseModel):
    inbox_item_id: str
    status: str


class SourcesRetryProcessingInput(BaseModel):
    source_id: uuid.UUID = Field(..., description="Source UUID to retry processing for")
    model_config = ConfigDict(extra="forbid")


class SourcesRetryProcessingOutput(BaseModel):
    source_id: str
    job_id: str | None = None
    status: str


class KnowledgeAuditProcessingInput(BaseModel):
    include_details: bool = Field(
        default=False, description="Whether to include full item failure details"
    )
    model_config = ConfigDict(extra="forbid")


class KnowledgeAuditProcessingOutput(BaseModel):
    total_sources: int
    failed_sources: int
    ready_sources: int
    details: list[dict[str, Any]] = Field(default_factory=list)


class GraphFindIsolatedNodesInput(BaseModel):
    limit: int = Field(default=50, ge=1, le=200)
    model_config = ConfigDict(extra="forbid")


class GraphFindIsolatedNodesOutput(BaseModel):
    isolated_entities: list[dict[str, Any]] = Field(default_factory=list)
    count: int = 0


class GraphSuggestRelationshipsInput(BaseModel):
    entity_id: uuid.UUID | None = Field(
        default=None, description="Optional entity UUID to focus suggestions"
    )
    limit: int = Field(default=10, ge=1, le=50)
    model_config = ConfigDict(extra="forbid")


class GraphSuggestRelationshipsOutput(BaseModel):
    suggestions: list[dict[str, Any]] = Field(default_factory=list)


class NotesFindRelatedInput(BaseModel):
    note_id: uuid.UUID = Field(..., description="Note UUID to find related notes for")
    limit: int = Field(default=5, ge=1, le=20)
    model_config = ConfigDict(extra="forbid")


class NotesFindRelatedOutput(BaseModel):
    related_notes: list[dict[str, Any]] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# 7.4 Controlled Writes (6)
# ─────────────────────────────────────────────────────────────────────────────


class NotesCreateInput(BaseModel):
    title: str = Field(..., min_length=1, max_length=200, description="Note title")
    content: str = Field(default="", description="Markdown body content")
    tags: list[str] = Field(default_factory=list, description="Initial tags")
    model_config = ConfigDict(extra="forbid")


class NotesCreateOutput(BaseModel):
    note_id: str
    title: str
    status: str


class NotesUpdateInput(BaseModel):
    note_id: uuid.UUID = Field(..., description="Target note UUID")
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = Field(default=None, description="Full replacement content")
    append_content: str | None = Field(
        default=None, description="Content to append to existing note"
    )
    model_config = ConfigDict(extra="forbid")


class NotesUpdateOutput(BaseModel):
    note_id: str
    updated_fields: list[str] = Field(default_factory=list)
    status: str


class NotesLinkInput(BaseModel):
    source_note_id: uuid.UUID = Field(..., description="Source note UUID")
    target_note_id: uuid.UUID = Field(..., description="Target note UUID")
    model_config = ConfigDict(extra="forbid")


class NotesLinkOutput(BaseModel):
    link_id: str
    source_note_id: str
    target_note_id: str


class CollectionsAddItemInput(BaseModel):
    collection_id: uuid.UUID = Field(..., description="Collection UUID")
    item_type: Literal["note", "source", "entity", "conversation"] = Field(
        ...,
        description="Polymorphic item type supported by v0.4.2 collections",
    )
    item_id: uuid.UUID = Field(..., description="Item UUID to add to collection")
    model_config = ConfigDict(extra="forbid")


class CollectionsAddItemOutput(BaseModel):
    collection_id: str
    item_type: str
    item_id: str
    status: str


class GraphAddRelationshipInput(BaseModel):
    source_entity_id: uuid.UUID = Field(..., description="Source entity UUID")
    target_entity_id: uuid.UUID = Field(..., description="Target entity UUID")
    relationship_type: str = Field(
        ..., min_length=1, max_length=100, description="Relationship predicate"
    )
    description: str | None = Field(default=None, max_length=500)
    model_config = ConfigDict(extra="forbid")


class GraphAddRelationshipOutput(BaseModel):
    relationship_id: str
    status: str


class NotesDeleteInput(BaseModel):
    note_id: uuid.UUID = Field(..., description="Note UUID to delete")
    note_title: str = Field(
        ..., min_length=1, description="Explicit note title for destructive confirmation"
    )
    model_config = ConfigDict(extra="forbid")


class NotesDeleteOutput(BaseModel):
    note_id: str
    deleted: bool
    status: str
