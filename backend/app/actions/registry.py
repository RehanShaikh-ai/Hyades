"""Canonical Action Registry for Hyades v0.5.1.

Canonical module per CONTRACT v0.5.1 §3.1, §7.1-§7.5.
Defines exactly the 37 frozen actions, schemas, side effects, and handlers.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

from app.actions.handlers import read as read_handlers
from app.actions.handlers import review as review_handlers
from app.actions.handlers import understand as understand_handlers
from app.actions.handlers import writes as write_handlers
from app.actions.types import (
    CollectionsAddItemInput,
    CollectionsAddItemOutput,
    CollectionsGetInput,
    CollectionsGetOutput,
    CollectionsSummarizeInput,
    CollectionsSummarizeOutput,
    EntitiesGetInput,
    EntitiesGetOutput,
    EntitiesSearchInput,
    EntitiesSearchOutput,
    EntitiesSummarizeInput,
    EntitiesSummarizeOutput,
    GraphAddRelationshipInput,
    GraphAddRelationshipOutput,
    GraphFindIsolatedNodesInput,
    GraphFindIsolatedNodesOutput,
    GraphFindPathInput,
    GraphFindPathOutput,
    GraphGetNeighborsInput,
    GraphGetNeighborsOutput,
    GraphSuggestRelationshipsInput,
    GraphSuggestRelationshipsOutput,
    InboxAcceptInput,
    InboxAcceptOutput,
    InboxListInput,
    InboxListOutput,
    InboxRejectInput,
    InboxRejectOutput,
    KnowledgeAnswerInput,
    KnowledgeAnswerOutput,
    KnowledgeAuditProcessingInput,
    KnowledgeAuditProcessingOutput,
    KnowledgeGenerateBriefInput,
    KnowledgeGenerateBriefOutput,
    KnowledgeSearchAllInput,
    KnowledgeSearchAllOutput,
    NotesCompareInput,
    NotesCompareOutput,
    NotesCreateInput,
    NotesCreateOutput,
    NotesDeleteInput,
    NotesDeleteOutput,
    NotesExtractConceptsInput,
    NotesExtractConceptsOutput,
    NotesFindRelatedInput,
    NotesFindRelatedOutput,
    NotesGetInput,
    NotesGetOutput,
    NotesLinkInput,
    NotesLinkOutput,
    NotesSearchInput,
    NotesSearchOutput,
    NotesSuggestTagsInput,
    NotesSuggestTagsOutput,
    NotesSummarizeInput,
    NotesSummarizeOutput,
    NotesUpdateInput,
    NotesUpdateOutput,
    SourcesCompareInput,
    SourcesCompareOutput,
    SourcesGetInput,
    SourcesGetOutput,
    SourcesGetProcessingStatusInput,
    SourcesGetProcessingStatusOutput,
    SourcesRetryProcessingInput,
    SourcesRetryProcessingOutput,
    SourcesSearchInput,
    SourcesSearchOutput,
    SourcesSummarizeInput,
    SourcesSummarizeOutput,
    ThreadsGetInput,
    ThreadsGetOutput,
    ThreadsSummarizeInput,
    ThreadsSummarizeOutput,
)
from app.core.exceptions import AppException
from app.schemas.action import ActionCatalogueItem, SideEffectClassification, TimeoutClass


@dataclass(frozen=True)
class ActionDefinition:
    """Canonical action definition per Contract v0.5.1 §3.1."""

    id: str
    name: str
    description: str
    input_schema_cls: type[BaseModel]
    output_schema_cls: type[BaseModel]
    side_effect: SideEffectClassification
    timeout_class: TimeoutClass
    handler: Callable[..., Any]
    category: str  # read, understand, review, controlled_write
    disabled: bool = False
    disabled_reason: str | None = None

    @property
    def test_name(self) -> str:
        """Deterministic mapping to test name per §7.5."""
        return f"test_action_{self.id.replace('.', '_')}"


_ACTIONS_LIST: list[ActionDefinition] = [
    # ─────────────────────────────────────────────────────────────────────────
    # 7.1 Read Actions (12)
    # ─────────────────────────────────────────────────────────────────────────
    ActionDefinition(
        id="knowledge.search_all",
        name="Search Knowledge Across Domains",
        description="Search notes, sources, entities, collections, and threads using appropriate vector or lexical methods.",
        input_schema_cls=KnowledgeSearchAllInput,
        output_schema_cls=KnowledgeSearchAllOutput,
        side_effect="read",
        timeout_class="search",
        handler=read_handlers.handle_knowledge_search_all,
        category="read",
    ),
    ActionDefinition(
        id="notes.get",
        name="Get Note Details",
        description="Return one note and its supported metadata.",
        input_schema_cls=NotesGetInput,
        output_schema_cls=NotesGetOutput,
        side_effect="read",
        timeout_class="read",
        handler=read_handlers.handle_notes_get,
        category="read",
    ),
    ActionDefinition(
        id="notes.search",
        name="Search Notes",
        description="Search notes by text and supported search criteria.",
        input_schema_cls=NotesSearchInput,
        output_schema_cls=NotesSearchOutput,
        side_effect="read",
        timeout_class="search",
        handler=read_handlers.handle_notes_search,
        category="read",
    ),
    ActionDefinition(
        id="sources.get",
        name="Get Source Details",
        description="Return one source and its supported metadata.",
        input_schema_cls=SourcesGetInput,
        output_schema_cls=SourcesGetOutput,
        side_effect="read",
        timeout_class="read",
        handler=read_handlers.handle_sources_get,
        category="read",
    ),
    ActionDefinition(
        id="sources.search",
        name="Search Sources",
        description="Search sources by text and supported search criteria.",
        input_schema_cls=SourcesSearchInput,
        output_schema_cls=SourcesSearchOutput,
        side_effect="read",
        timeout_class="search",
        handler=read_handlers.handle_sources_search,
        category="read",
    ),
    ActionDefinition(
        id="sources.get_processing_status",
        name="Get Source Processing Status",
        description="Return processing state for one source.",
        input_schema_cls=SourcesGetProcessingStatusInput,
        output_schema_cls=SourcesGetProcessingStatusOutput,
        side_effect="read",
        timeout_class="read",
        handler=read_handlers.handle_sources_get_processing_status,
        category="read",
    ),
    ActionDefinition(
        id="entities.get",
        name="Get Entity Details",
        description="Return one entity and its supported metadata.",
        input_schema_cls=EntitiesGetInput,
        output_schema_cls=EntitiesGetOutput,
        side_effect="read",
        timeout_class="read",
        handler=read_handlers.handle_entities_get,
        category="read",
    ),
    ActionDefinition(
        id="entities.search",
        name="Search Entities",
        description="Search entities by name and supported lexical criteria.",
        input_schema_cls=EntitiesSearchInput,
        output_schema_cls=EntitiesSearchOutput,
        side_effect="read",
        timeout_class="search",
        handler=read_handlers.handle_entities_search,
        category="read",
    ),
    ActionDefinition(
        id="graph.get_neighbors",
        name="Get Graph Neighbors",
        description="Return the neighbors of a graph node.",
        input_schema_cls=GraphGetNeighborsInput,
        output_schema_cls=GraphGetNeighborsOutput,
        side_effect="read",
        timeout_class="read",
        handler=read_handlers.handle_graph_get_neighbors,
        category="read",
    ),
    ActionDefinition(
        id="graph.find_path",
        name="Find Graph Path",
        description="Find a path between supported graph nodes.",
        input_schema_cls=GraphFindPathInput,
        output_schema_cls=GraphFindPathOutput,
        side_effect="read",
        timeout_class="search",
        handler=read_handlers.handle_graph_find_path,
        category="read",
    ),
    ActionDefinition(
        id="collections.get",
        name="Get Collection",
        description="Return one collection and its items.",
        input_schema_cls=CollectionsGetInput,
        output_schema_cls=CollectionsGetOutput,
        side_effect="read",
        timeout_class="read",
        handler=read_handlers.handle_collections_get,
        category="read",
    ),
    ActionDefinition(
        id="threads.get",
        name="Get Thread",
        description="Return one investigation Thread and its attached information.",
        input_schema_cls=ThreadsGetInput,
        output_schema_cls=ThreadsGetOutput,
        side_effect="read",
        timeout_class="read",
        handler=read_handlers.handle_threads_get,
        category="read",
    ),
    # ─────────────────────────────────────────────────────────────────────────
    # 7.2 Understand Actions (11)
    # ─────────────────────────────────────────────────────────────────────────
    ActionDefinition(
        id="notes.summarize",
        name="Summarize Note",
        description="Produce a summary of a note.",
        input_schema_cls=NotesSummarizeInput,
        output_schema_cls=NotesSummarizeOutput,
        side_effect="read",
        timeout_class="llm",
        handler=understand_handlers.handle_notes_summarize,
        category="understand",
    ),
    ActionDefinition(
        id="sources.summarize",
        name="Summarize Source",
        description="Produce a summary of a source.",
        input_schema_cls=SourcesSummarizeInput,
        output_schema_cls=SourcesSummarizeOutput,
        side_effect="read",
        timeout_class="llm",
        handler=understand_handlers.handle_sources_summarize,
        category="understand",
    ),
    ActionDefinition(
        id="collections.summarize",
        name="Summarize Collection",
        description="Produce a summary of a collection and its supported items.",
        input_schema_cls=CollectionsSummarizeInput,
        output_schema_cls=CollectionsSummarizeOutput,
        side_effect="read",
        timeout_class="llm",
        handler=understand_handlers.handle_collections_summarize,
        category="understand",
    ),
    ActionDefinition(
        id="threads.summarize",
        name="Summarize Thread",
        description="Produce a summary of a Thread’s investigation material.",
        input_schema_cls=ThreadsSummarizeInput,
        output_schema_cls=ThreadsSummarizeOutput,
        side_effect="read",
        timeout_class="llm",
        handler=understand_handlers.handle_threads_summarize,
        category="understand",
    ),
    ActionDefinition(
        id="entities.summarize",
        name="Summarize Entity",
        description="Produce a summary of an entity and its available evidence.",
        input_schema_cls=EntitiesSummarizeInput,
        output_schema_cls=EntitiesSummarizeOutput,
        side_effect="read",
        timeout_class="llm",
        handler=understand_handlers.handle_entities_summarize,
        category="understand",
    ),
    ActionDefinition(
        id="notes.compare",
        name="Compare Notes",
        description="Compare two or more notes.",
        input_schema_cls=NotesCompareInput,
        output_schema_cls=NotesCompareOutput,
        side_effect="read",
        timeout_class="llm",
        handler=understand_handlers.handle_notes_compare,
        category="understand",
    ),
    ActionDefinition(
        id="sources.compare",
        name="Compare Sources",
        description="Compare two or more sources.",
        input_schema_cls=SourcesCompareInput,
        output_schema_cls=SourcesCompareOutput,
        side_effect="read",
        timeout_class="llm",
        handler=understand_handlers.handle_sources_compare,
        category="understand",
    ),
    ActionDefinition(
        id="knowledge.answer",
        name="Answer from Knowledge",
        description="Answer a question using retrieved Hyades knowledge.",
        input_schema_cls=KnowledgeAnswerInput,
        output_schema_cls=KnowledgeAnswerOutput,
        side_effect="read",
        timeout_class="llm",
        handler=understand_handlers.handle_knowledge_answer,
        category="understand",
    ),
    ActionDefinition(
        id="knowledge.generate_brief",
        name="Generate Research Brief",
        description="Generate a structured brief from retrieved knowledge.",
        input_schema_cls=KnowledgeGenerateBriefInput,
        output_schema_cls=KnowledgeGenerateBriefOutput,
        side_effect="read",
        timeout_class="llm",
        handler=understand_handlers.handle_knowledge_generate_brief,
        category="understand",
    ),
    ActionDefinition(
        id="notes.extract_concepts",
        name="Extract Concepts from Note",
        description="Extract concepts from a note.",
        input_schema_cls=NotesExtractConceptsInput,
        output_schema_cls=NotesExtractConceptsOutput,
        side_effect="read",
        timeout_class="llm",
        handler=understand_handlers.handle_notes_extract_concepts,
        category="understand",
    ),
    ActionDefinition(
        id="notes.suggest_tags",
        name="Suggest Tags for Note",
        description="Suggest tags for a note.",
        input_schema_cls=NotesSuggestTagsInput,
        output_schema_cls=NotesSuggestTagsOutput,
        side_effect="read",
        timeout_class="llm",
        handler=understand_handlers.handle_notes_suggest_tags,
        category="understand",
    ),
    # ─────────────────────────────────────────────────────────────────────────
    # 7.3 Review Actions (8)
    # ─────────────────────────────────────────────────────────────────────────
    ActionDefinition(
        id="inbox.list",
        name="List Inbox Items",
        description="List Inbox items with supported filters.",
        input_schema_cls=InboxListInput,
        output_schema_cls=InboxListOutput,
        side_effect="read",
        timeout_class="read",
        handler=review_handlers.handle_inbox_list,
        category="review",
    ),
    ActionDefinition(
        id="inbox.accept",
        name="Accept Inbox Item",
        description="Accept one Inbox item through the existing approval mechanism.",
        input_schema_cls=InboxAcceptInput,
        output_schema_cls=InboxAcceptOutput,
        side_effect="write",
        timeout_class="read",
        handler=review_handlers.handle_inbox_accept,
        category="review",
    ),
    ActionDefinition(
        id="inbox.reject",
        name="Reject Inbox Item",
        description="Reject one Inbox item through the existing rejection mechanism.",
        input_schema_cls=InboxRejectInput,
        output_schema_cls=InboxRejectOutput,
        side_effect="write",
        timeout_class="read",
        handler=review_handlers.handle_inbox_reject,
        category="review",
    ),
    ActionDefinition(
        id="sources.retry_processing",
        name="Retry Source Processing",
        description="Retry processing for a failed source.",
        input_schema_cls=SourcesRetryProcessingInput,
        output_schema_cls=SourcesRetryProcessingOutput,
        side_effect="write",
        timeout_class="read",
        handler=review_handlers.handle_sources_retry_processing,
        category="review",
    ),
    ActionDefinition(
        id="knowledge.audit_processing",
        name="Audit Processing State",
        description="Report processing state and known processing failures across supported knowledge items.",
        input_schema_cls=KnowledgeAuditProcessingInput,
        output_schema_cls=KnowledgeAuditProcessingOutput,
        side_effect="read",
        timeout_class="read",
        handler=review_handlers.handle_knowledge_audit_processing,
        category="review",
    ),
    ActionDefinition(
        id="graph.find_isolated_nodes",
        name="Find Isolated Nodes",
        description="Find graph nodes with no supported relationships.",
        input_schema_cls=GraphFindIsolatedNodesInput,
        output_schema_cls=GraphFindIsolatedNodesOutput,
        side_effect="read",
        timeout_class="read",
        handler=review_handlers.handle_graph_find_isolated_nodes,
        category="review",
    ),
    ActionDefinition(
        id="graph.suggest_relationships",
        name="Suggest Graph Relationships",
        description="Suggest possible graph relationships without committing them.",
        input_schema_cls=GraphSuggestRelationshipsInput,
        output_schema_cls=GraphSuggestRelationshipsOutput,
        side_effect="read",
        timeout_class="search",
        handler=review_handlers.handle_graph_suggest_relationships,
        category="review",
    ),
    ActionDefinition(
        id="notes.find_related",
        name="Find Related Notes",
        description="Find notes related to a given note.",
        input_schema_cls=NotesFindRelatedInput,
        output_schema_cls=NotesFindRelatedOutput,
        side_effect="read",
        timeout_class="search",
        handler=review_handlers.handle_notes_find_related,
        category="review",
    ),
    # ─────────────────────────────────────────────────────────────────────────
    # 7.4 Controlled Writes (6)
    # ─────────────────────────────────────────────────────────────────────────
    ActionDefinition(
        id="notes.create",
        name="Create Note",
        description="Create a note from validated content and metadata.",
        input_schema_cls=NotesCreateInput,
        output_schema_cls=NotesCreateOutput,
        side_effect="propose",
        timeout_class="read",
        handler=write_handlers.handle_notes_create,
        category="controlled_write",
    ),
    ActionDefinition(
        id="notes.update",
        name="Update Note",
        description="Propose updates to an existing note.",
        input_schema_cls=NotesUpdateInput,
        output_schema_cls=NotesUpdateOutput,
        side_effect="propose",
        timeout_class="read",
        handler=write_handlers.handle_notes_update,
        category="controlled_write",
    ),
    ActionDefinition(
        id="notes.link",
        name="Link Notes",
        description="Propose a link between supported note records.",
        input_schema_cls=NotesLinkInput,
        output_schema_cls=NotesLinkOutput,
        side_effect="propose",
        timeout_class="read",
        handler=write_handlers.handle_notes_link,
        category="controlled_write",
    ),
    ActionDefinition(
        id="collections.add_item",
        name="Add Item to Collection",
        description="Propose adding a supported item to a collection.",
        input_schema_cls=CollectionsAddItemInput,
        output_schema_cls=CollectionsAddItemOutput,
        side_effect="propose",
        timeout_class="read",
        handler=write_handlers.handle_collections_add_item,
        category="controlled_write",
    ),
    ActionDefinition(
        id="graph.add_relationship",
        name="Add Graph Relationship",
        description="Propose a relationship between supported graph nodes.",
        input_schema_cls=GraphAddRelationshipInput,
        output_schema_cls=GraphAddRelationshipOutput,
        side_effect="propose",
        timeout_class="read",
        handler=write_handlers.handle_graph_add_relationship,
        category="controlled_write",
    ),
    ActionDefinition(
        id="notes.delete",
        name="Delete Note",
        description="Propose deletion of one note.",
        input_schema_cls=NotesDeleteInput,
        output_schema_cls=NotesDeleteOutput,
        side_effect="destructive",
        timeout_class="read",
        handler=write_handlers.handle_notes_delete,
        category="controlled_write",
    ),
]

_ACTIONS_BY_ID: dict[str, ActionDefinition] = {action.id: action for action in _ACTIONS_LIST}


def get_action(action_id: str) -> ActionDefinition:
    """Retrieve action definition by ID or raise ACTION_NOT_FOUND (§3.1)."""
    if action_id not in _ACTIONS_BY_ID:
        raise AppException(
            404,
            "ACTION_NOT_FOUND",
            f"Action '{action_id}' is not recognized in the canonical action registry.",
        )
    return _ACTIONS_BY_ID[action_id]


def list_actions() -> list[ActionDefinition]:
    """Return all registered action definitions."""
    return list(_ACTIONS_LIST)


def get_catalogue() -> list[ActionCatalogueItem]:
    """Generate the canonical frontend catalogue entries per §5.2."""
    items = []
    for action in _ACTIONS_LIST:
        items.append(
            ActionCatalogueItem(
                id=action.id,
                name=action.name,
                description=action.description,
                input_schema=action.input_schema_cls.model_json_schema(),
                output_schema=action.output_schema_cls.model_json_schema(),
                side_effect=action.side_effect,
                timeout_class=action.timeout_class,
                disabled=action.disabled,
                disabled_reason=action.disabled_reason,
            )
        )
    return items
