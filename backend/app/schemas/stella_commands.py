"""Schemas for Stella slash commands and in-chat actions.
"""

import uuid
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class StellaArgumentDef(BaseModel):
    """Specification of an expected argument for a slash command."""

    name: str = Field(..., description="Argument name, e.g. item, collection, query")
    label: str = Field(..., description="Human-friendly label/badge")
    arg_type: Literal["free_text", "resource"] = Field(
        default="free_text", description="Free text vs resource identifier selection"
    )
    required: bool = Field(default=True, description="Whether the argument is required")
    resource_types: list[Literal["note", "source", "entity", "collection", "thread"]] = Field(
        default_factory=list, description="Eligible resource types for resource selection"
    )
    placeholder: str = Field(default="", description="Inline placeholder guidance")
    description: str = Field(default="", description="Argument purpose description")
    model_config = ConfigDict(extra="ignore")


class StellaCommandInfo(BaseModel):
    """Metadata for an in-chat slash command."""

    command: str = Field(..., description="Slash command identifier, e.g. /create-note")
    name: str = Field(..., description="Human-readable title")
    description: str = Field(..., description="Short explanation of what the command does")
    syntax: str = Field(..., description="Command syntax with arguments")
    example: str = Field(..., description="Example usage string")
    examples: list[str] = Field(default_factory=list, description="Clickable example prompts")
    category: str = Field(default="general", description="Command category: read, understand, review, write, search")
    action_id: str | None = Field(default=None, description="Mapped canonical action ID, if any")
    arguments: list[StellaArgumentDef] = Field(
        default_factory=list, description="Ordered list of argument definitions"
    )
    execution_type: Literal["action", "proposal", "workflow", "search", "stream", "placeholder"] = Field(
        default="action", description="Execution behavior type"
    )
    availability: Literal["available", "coming_soon", "internal"] = Field(
        default="available",
        description="Command availability: available, coming_soon, or internal",
    )
    requires_confirmation: bool = Field(default=False, description="Whether execution produces a staged proposal")
    model_config = ConfigDict(extra="ignore")


class StellaCommandListResponse(BaseModel):
    """List of available slash commands for autocomplete."""

    commands: list[StellaCommandInfo]
    total: int


class StellaSuggestionItem(BaseModel):
    """Candidate item suggestion for argument-aware slash commands."""

    id: str
    title: str
    item_type: str  # 'note', 'source', 'entity', 'collection', 'thread'
    subtitle: str
    snippet: str | None = None
    word_count: int | None = None
    updated_at: str | None = None
    model_config = ConfigDict(extra="ignore")


class StellaSuggestionsResponse(BaseModel):
    """List of candidate workspace suggestions."""

    items: list[StellaSuggestionItem]
    command: str
    query: str
    arg_index: int = 0
    total: int


class StellaSummarizeRequest(BaseModel):
    """Request to summarize a specific workspace item."""

    target: str = Field(..., min_length=1, max_length=500, description="Target note title or UUID")
    conversation_id: uuid.UUID | None = None
    prompt: str | None = Field(default=None, description="Original raw user prompt text")
    model_config = ConfigDict(extra="ignore")


class StellaSummarizeResponse(BaseModel):
    """Structured summary card data."""

    target_id: str
    target_title: str
    target_type: str
    summary_title: str
    meta_description: str
    key_points: list[str]
    full_summary: str
    related_notes_count: int = 0
    source_id: str | None = None
    model_config = ConfigDict(extra="ignore")


class StellaCreateNoteDraftRequest(BaseModel):
    """Request to generate a ~300 word note draft on a topic and propose creation."""

    topic: str = Field(..., min_length=1, max_length=500, description="Topic or prompt for note")
    conversation_id: uuid.UUID | None = Field(
        default=None, description="Optional conversation context"
    )
    prompt: str | None = Field(default=None, description="Original raw user prompt text")
    model_config = ConfigDict(extra="ignore")


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
    conversation_id: uuid.UUID | None = Field(default=None, description="Optional conversation context")
    model_config = ConfigDict(extra="ignore")


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
    conversation_id: uuid.UUID | None = Field(default=None, description="Optional conversation context")
    model_config = ConfigDict(extra="ignore")


class StellaCreateNoteCancelResponse(BaseModel):
    """Result of cancelling a note proposal."""

    status: Literal["cancelled"] = "cancelled"
    proposal_id: uuid.UUID


# ─────────────────────────────────────────────────────────────────────────────
# Search Action Response (§8.1)
# ─────────────────────────────────────────────────────────────────────────────


class StellaSearchResultItem(BaseModel):
    """Search hit item across notes, sources, entities, collections, threads."""

    id: str
    title: str
    item_type: Literal["note", "source", "entity", "collection", "thread"]
    snippet: str | None = None
    score: float | None = None
    created_at: str | None = None
    extra: str | None = None
    model_config = ConfigDict(extra="ignore")


class StellaSearchRequest(BaseModel):
    """Request to perform multi-domain workspace search."""

    query: str = Field(..., min_length=1, max_length=500, description="Search query")
    limit: int = Field(default=10, ge=1, le=50)
    conversation_id: uuid.UUID | None = None
    prompt: str | None = None
    model_config = ConfigDict(extra="ignore")


class StellaSearchResponse(BaseModel):
    """Multi-domain search results across the workspace."""

    query: str
    total: int
    items: list[StellaSearchResultItem]
    model_config = ConfigDict(extra="ignore")


# ─────────────────────────────────────────────────────────────────────────────
# Review Inbox Action Response (§7.3)
# ─────────────────────────────────────────────────────────────────────────────


class StellaInboxItem(BaseModel):
    """Authoritative pending ingestion item from inbox_items table."""

    id: str
    source_id: str
    source_title: str
    source_type: str = "document"
    status: str
    detection_status: str
    detected_count: int
    detected_entities: list[str] = Field(default_factory=list)
    created_at: str
    model_config = ConfigDict(extra="ignore")


class StellaInboxReviewResponse(BaseModel):
    """Authoritative inbox review state from the inbox service."""

    total_pending: int
    items: list[StellaInboxItem]
    summary_message: str
    model_config = ConfigDict(extra="ignore")


# ─────────────────────────────────────────────────────────────────────────────
# Flashcard Deck Models
# ─────────────────────────────────────────────────────────────────────────────


class StellaFlashcardItem(BaseModel):
    """Single interactive flashcard with front/back content and explanation."""

    id: str
    question: str
    answer: str
    explanation: str | None = None
    concept: str | None = None
    model_config = ConfigDict(extra="ignore")


class StellaFlashcardDeck(BaseModel):
    """Complete flashcard deck generated from note or source material."""

    deck_id: str
    title: str
    source_type: str = "note"
    source_id: str | None = None
    source_title: str
    cards_count: int
    cards: list[StellaFlashcardItem]
    current_index: int = 0
    review_state: dict[str, str] = Field(default_factory=dict)
    model_config = ConfigDict(extra="ignore")


# ─────────────────────────────────────────────────────────────────────────────
# Add to Collection Action Request/Response (§7.4)
# ─────────────────────────────────────────────────────────────────────────────


class StellaAddToCollectionRequest(BaseModel):
    """Request to propose adding an item to a collection."""

    item_id: uuid.UUID = Field(..., description="UUID of note, source, or entity")
    item_type: Literal["note", "source", "entity"] = Field(default="note")
    collection_id: uuid.UUID = Field(..., description="UUID of destination collection")
    conversation_id: uuid.UUID | None = None
    prompt: str | None = None
    model_config = ConfigDict(extra="ignore")


class StellaAddToCollectionResponse(BaseModel):
    """Staged proposal for adding an item to a collection."""

    proposal_id: uuid.UUID
    confirmation_token: str
    action_id: str = "collections.add_item"
    item_id: str
    item_title: str
    item_type: str
    collection_id: str
    collection_name: str
    status: Literal["proposed", "pending"] = "proposed"
    model_config = ConfigDict(extra="ignore")


class StellaAddToCollectionCommitRequest(BaseModel):
    """Request to commit a staged add-to-collection proposal."""

    proposal_id: uuid.UUID = Field(..., description="Action proposal UUID to commit")
    confirmation_token: str = Field(..., description="Confirmation token from proposal")
    conversation_id: uuid.UUID | None = None
    model_config = ConfigDict(extra="ignore")


class StellaAddToCollectionCommitResponse(BaseModel):
    """Result of committing an add-to-collection proposal."""

    collection_id: uuid.UUID
    item_id: uuid.UUID
    item_type: str
    status: Literal["committed"] = "committed"
    execution_id: uuid.UUID
    model_config = ConfigDict(extra="ignore")


# ─────────────────────────────────────────────────────────────────────────────
# Link Notes Action Request/Response (§7.3, §7.4)
# ─────────────────────────────────────────────────────────────────────────────


class StellaLinkCandidateItem(BaseModel):
    """Candidate note to connect to."""

    note_id: str
    title: str
    excerpt: str | None = None
    common_tags: list[str] = Field(default_factory=list)
    similarity_score: float = 0.8
    already_linked: bool = False
    model_config = ConfigDict(extra="ignore")


class StellaLinkNotesRequest(BaseModel):
    """Request to find or suggest links for a note."""

    target: str = Field(..., min_length=1, max_length=500, description="Note title or UUID")
    limit: int = Field(default=5, ge=1, le=20)
    conversation_id: uuid.UUID | None = None
    prompt: str | None = None
    model_config = ConfigDict(extra="ignore")


class StellaLinkNotesResponse(BaseModel):
    """Link suggestion results with connection candidates."""

    source_note_id: str
    source_note_title: str
    candidates: list[StellaLinkCandidateItem]
    summary: str
    model_config = ConfigDict(extra="ignore")


class StellaLinkNotesConnectRequest(BaseModel):
    """Request to establish a directional/bidirectional link between two workspace notes."""

    source_note_id: uuid.UUID = Field(..., description="Primary/source note UUID")
    target_note_id: uuid.UUID = Field(..., description="Candidate/target note UUID")
    conversation_id: uuid.UUID | None = Field(default=None, description="Optional conversation UUID")
    model_config = ConfigDict(extra="ignore")


class StellaLinkNotesConnectResponse(BaseModel):
    """Confirmation of a created or existing note link."""

    source_note_id: str
    source_note_title: str
    target_note_id: str
    target_note_title: str
    status: Literal["linked", "already_linked"] = "linked"
    message: str
    model_config = ConfigDict(extra="ignore")


# ─────────────────────────────────────────────────────────────────────────────
# Generic Action & Command Execution Schemas
# ─────────────────────────────────────────────────────────────────────────────


class StellaCommandExecuteRequest(BaseModel):
    """Request to execute or propose a Stella action/command."""

    command: str = Field(..., description="Slash command identifier, e.g. /rename-note")
    args: list[str] = Field(default_factory=list, description="Command argument tokens")
    action_id: str | None = Field(default=None, description="Underlying action identifier if known")
    parameters: dict[str, Any] = Field(default_factory=dict, description="Structured argument parameters")
    conversation_id: uuid.UUID | None = Field(default=None, description="Optional conversation context")
    proposal_id: uuid.UUID | None = Field(default=None, description="Proposal UUID if committing")
    confirmation_token: str | None = Field(default=None, description="Confirmation token if committing")
    prompt: str | None = Field(default=None, description="Original raw user prompt text")
    model_config = ConfigDict(extra="ignore")


class StellaCommandExecuteResponse(BaseModel):
    """Response from executing or proposing a Stella action/command."""

    command: str
    action_id: str
    status: Literal["completed", "proposed", "cancelled", "coming_soon", "error"]
    message: str
    data: dict[str, Any] = Field(default_factory=dict)
    proposal_id: str | None = None
    confirmation_token: str | None = None
    requires_confirmation: bool = False
    affected_item_ids: list[str] = Field(default_factory=list)
    model_config = ConfigDict(extra="ignore")


class StellaRecordMessageRequest(BaseModel):
    """Persist a message directly into conversation history."""

    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=4000)
    model_config = ConfigDict(extra="forbid")


