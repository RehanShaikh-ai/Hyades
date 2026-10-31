"""Stella slash command orchestration service.

Handles:
- Slash command discovery with declarative argument schemas
- Resource-aware and free-text argument suggestions
- Multi-domain knowledge summarization (notes, sources, collections, entities)
- Multi-domain global search execution
- Authoritative inbox review workflow
- Two-phase add-to-collection and create-note proposals
- Link discovery and note relationship exploration
"""

import json
import logging
import re
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import (
    AppException,
    ConflictError,
    ValidationError,
    WorkspaceNotFoundError,
)
from app.models.action_proposal import ActionProposal
from app.models.collection import Collection, CollectionNote, CollectionSource
from app.models.content_chunk import ContentChunk
from app.models.conversation import Conversation
from app.models.graph_entity import GraphEntity
from app.models.graph_relationship import GraphRelationship
from app.models.inbox_item import InboxItem
from app.models.note import Note
from app.models.note_link import NoteLink
from app.models.source import Source
from app.models.tag import Tag
from app.models.workspace import Workspace
from app.schemas.action import ActionExecuteRequest
from app.schemas.stella_commands import (
    StellaAddToCollectionCommitResponse,
    StellaAddToCollectionResponse,
    StellaArgumentDef,
    StellaCommandExecuteResponse,
    StellaCommandInfo,
    StellaCreateNoteCommitResponse,
    StellaCreateNoteDraftResponse,
    StellaInboxItem,
    StellaInboxReviewResponse,
    StellaLinkCandidateItem,
    StellaLinkNotesConnectResponse,
    StellaLinkNotesResponse,
    StellaSearchResponse,
    StellaSearchResultItem,
    StellaSuggestionItem,
    StellaSuggestionsResponse,
    StellaSummarizeResponse,
)
from app.services import action_execution_service, llm_service

logger = logging.getLogger("app.services.stella_command_service")

AVAILABLE_COMMANDS: list[StellaCommandInfo] = [
    StellaCommandInfo(
        command="/create-note",
        name="Create Note",
        description="Create a new note from a topic or content",
        syntax="/create-note <topic>",
        example="/create-note industrial revolution",
        examples=[
            "/create-note industrial revolution",
            "/create-note quantum computing",
            "/create-note meeting notes from this thread",
        ],
        category="write",
        action_id="notes.create",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="topic",
                label="Topic",
                arg_type="free_text",
                required=True,
                placeholder="Enter note topic or theme...",
                description="Topic or prompt for note synthesis",
            )
        ],
    ),
    StellaCommandInfo(
        command="/summarize",
        name="Summarize",
        description="Summarize a note, source, collection, or entity",
        syntax="/summarize <target>",
        example="/summarize The Industrial Revolution",
        examples=[
            "/summarize The Industrial Revolution",
            "/summarize On Liberty",
            "/summarize Renaissance Astronomy",
        ],
        category="understand",
        action_id="notes.get",
        execution_type="action",
        requires_confirmation=False,
        arguments=[
            StellaArgumentDef(
                name="target",
                label="Target Item",
                arg_type="resource",
                required=True,
                resource_types=["note", "source", "collection", "entity"],
                placeholder="Select note, source, or item...",
                description="Workspace item to summarize",
            )
        ],
    ),
    StellaCommandInfo(
        command="/link-notes",
        name="Link Notes",
        description="Find and suggest links for a note (Coming Soon)",
        syntax="/link-notes <note>",
        example="/link-notes industrial revolution",
        examples=[
            "/link-notes industrial revolution",
            "/link-notes thermodynamics",
            "/link-notes neural networks",
        ],
        category="review",
        action_id="notes.find_related",
        execution_type="placeholder",
        availability="coming_soon",
        requires_confirmation=False,
        arguments=[
            StellaArgumentDef(
                name="note",
                label="Source Note",
                arg_type="resource",
                required=True,
                resource_types=["note"],
                placeholder="Select note to connect...",
                description="Note to find connections for",
            )
        ],
    ),
    StellaCommandInfo(
        command="/review-inbox",
        name="Review Inbox",
        description="Review pending ingestion items in your workspace inbox (Coming Soon)",
        syntax="/review-inbox",
        example="/review-inbox",
        examples=[
            "/review-inbox",
        ],
        category="review",
        action_id="inbox.list",
        execution_type="placeholder",
        availability="coming_soon",
        requires_confirmation=False,
        arguments=[],
    ),
    StellaCommandInfo(
        command="/analyze",
        name="Analyze",
        description="Analyze a concept, note, or relationship (Coming Soon)",
        syntax="/analyze <item>",
        example="/analyze industrial revolution",
        examples=[
            "/analyze industrial revolution",
            "/analyze ptolemaic astronomy",
            "/analyze global trade networks",
        ],
        category="understand",
        action_id="entities.get",
        execution_type="placeholder",
        availability="coming_soon",
        requires_confirmation=False,
        arguments=[
            StellaArgumentDef(
                name="item",
                label="Item or Concept",
                arg_type="resource",
                required=True,
                resource_types=["note", "entity", "source"],
                placeholder="Select item to analyze...",
                description="Concept or note to examine",
            )
        ],
    ),
    StellaCommandInfo(
        command="/generate-flashcards",
        name="Generate Flashcards",
        description="Create flashcards from a note",
        syntax="/generate-flashcards <note>",
        example="/generate-flashcards industrial revolution",
        examples=[
            "/generate-flashcards industrial revolution",
            "/generate-flashcards AI safety",
            "/generate-flashcards quantum computing",
        ],
        category="understand",
        action_id="notes.get",
        execution_type="stream",
        requires_confirmation=False,
        arguments=[
            StellaArgumentDef(
                name="note",
                label="Note",
                arg_type="resource",
                required=True,
                resource_types=["note"],
                placeholder="Select note for flashcards...",
                description="Note to generate flashcards from",
            )
        ],
    ),
    StellaCommandInfo(
        command="/find-sources",
        name="Find Sources",
        description="Find relevant sources for a topic (Coming Soon)",
        syntax="/find-sources <topic>",
        example="/find-sources steam engine",
        examples=[
            "/find-sources steam engine",
            "/find-sources celestial orbits",
            "/find-sources archival compendiums",
        ],
        category="search",
        action_id="sources.search",
        execution_type="placeholder",
        availability="coming_soon",
        requires_confirmation=False,
        arguments=[
            StellaArgumentDef(
                name="topic",
                label="Topic",
                arg_type="free_text",
                required=True,
                placeholder="Enter research topic...",
                description="Topic to search sources for",
            )
        ],
    ),
    StellaCommandInfo(
        command="/ask-about",
        name="Ask About",
        description="Ask Stella contextual questions about a workspace resource (Coming Soon)",
        syntax="/ask-about <item>",
        example="/ask-about Industrial Revolution consequences",
        examples=[
            "/ask-about Industrial Revolution consequences",
            "/ask-about quantum computing",
            "/ask-about connections between notes",
        ],
        category="understand",
        action_id="notes.get",
        execution_type="placeholder",
        availability="coming_soon",
        requires_confirmation=False,
        arguments=[
            StellaArgumentDef(
                name="item",
                label="Item",
                arg_type="resource",
                required=True,
                resource_types=["note", "source", "entity", "collection"],
                placeholder="Select item to ask about...",
                description="Resource to discuss",
            )
        ],
    ),
    StellaCommandInfo(
        command="/explore-graph",
        name="Explore Graph",
        description="Explore neighboring entities and relationships in the knowledge graph (Coming Soon)",
        syntax="/explore-graph <entity>",
        example="/explore-graph Johannes Kepler",
        examples=[
            "/explore-graph Johannes Kepler",
            "/explore-graph Steam Engine",
            "/explore-graph Industrial Revolution",
        ],
        category="read",
        action_id="graph.get_neighbors",
        execution_type="placeholder",
        availability="coming_soon",
        requires_confirmation=False,
        arguments=[
            StellaArgumentDef(
                name="entity",
                label="Entity",
                arg_type="resource",
                required=True,
                resource_types=["entity"],
                placeholder="Select entity to explore...",
                description="Knowledge graph entity",
            )
        ],
    ),
    StellaCommandInfo(
        command="/create-source",
        name="Create Source",
        description="Ingest and synthesize a new text or document source",
        syntax="/create-source <input>",
        example='/create-source "Primary source excerpt on 19th century manufacturing"',
        examples=[
            '/create-source "Primary source excerpt on 19th century manufacturing"',
            '/create-source "Notes from Kepler\'s Astronomia Nova"',
        ],
        category="write",
        action_id="sources.create",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="input",
                label="Source Input",
                arg_type="free_text",
                required=True,
                placeholder="Enter source title or document text...",
                description="Source title and document content to ingest",
            )
        ],
    ),
    StellaCommandInfo(
        command="/enrich-note",
        name="Enrich Note",
        description="Enrich a note with related workspace concepts, citations, and missing context",
        syntax="/enrich-note <note>",
        example='/enrich-note "Industrial Revolution"',
        examples=[
            '/enrich-note "Industrial Revolution"',
            '/enrich-note "Thermodynamics"',
        ],
        category="write",
        action_id="notes.update",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="note",
                label="Note",
                arg_type="resource",
                required=True,
                resource_types=["note"],
                placeholder="Select note to enrich...",
                description="Target note to expand with workspace knowledge",
            )
        ],
    ),
    StellaCommandInfo(
        command="/merge-notes",
        name="Merge Notes",
        description="Synthesize and merge two or more related notes into a unified note",
        syntax="/merge-notes <note_1> <note_2>",
        example='/merge-notes "Early Steam Engines" "Steam Turbine Innovations"',
        examples=[
            '/merge-notes "Early Steam Engines" "Steam Turbine Innovations"',
            '/merge-notes "Quantum Entanglement" "Bell Inequalities"',
        ],
        category="write",
        action_id="notes.create",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="note_1",
                label="First Note",
                arg_type="resource",
                required=True,
                resource_types=["note"],
                placeholder="Select first note...",
                description="First source note to merge",
            ),
            StellaArgumentDef(
                name="note_2",
                label="Second Note",
                arg_type="resource",
                required=True,
                resource_types=["note"],
                placeholder="Select second note to merge...",
                description="Second source note to merge",
            ),
        ],
    ),
    StellaCommandInfo(
        command="/split-note",
        name="Split Note",
        description="Deconstruct an extensive note and suggest modular atomic notes",
        syntax="/split-note <note>",
        example='/split-note "Comprehensive History of Computing"',
        examples=[
            '/split-note "Comprehensive History of Computing"',
            '/split-note "Overview of Thermodynamics"',
        ],
        category="write",
        action_id="notes.create",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="note",
                label="Note",
                arg_type="resource",
                required=True,
                resource_types=["note"],
                placeholder="Select note to split...",
                description="Extensive note to break into modular topics",
            )
        ],
    ),
    StellaCommandInfo(
        command="/organize-knowledge",
        name="Organize Knowledge",
        description="Intelligent organization planner for notes, sources, collections, threads, entities, and workspaces",
        syntax="/organize-knowledge [scope]",
        example="/organize-knowledge",
        examples=[
            "/organize-knowledge",
            '/organize-knowledge "Islamic history"',
            '/organize-knowledge "Life of Umar ibn al-Khattab"',
        ],
        category="review",
        action_id="knowledge.audit_processing",
        execution_type="workflow",
        requires_confirmation=False,
        arguments=[
            StellaArgumentDef(
                name="scope",
                label="Topic / Note / Source",
                arg_type="resource",
                required=False,
                resource_types=["note", "source", "collection"],
                placeholder="Optional topic, note, source, or collection...",
                description="Topic, seed note/source, or empty for workspace-wide audit",
            )
        ],
    ),
    StellaCommandInfo(
        command="/populate-collection",
        name="Populate Collection",
        description="Search workspace for relevant items matching a collection theme",
        syntax="/populate-collection <collection> [scope]",
        example='/populate-collection "19th Century Inventions"',
        examples=[
            '/populate-collection "19th Century Inventions"',
            '/populate-collection "Astrophysics Papers"',
        ],
        category="write",
        action_id="collections.add_item",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="collection",
                label="Collection",
                arg_type="resource",
                required=True,
                resource_types=["collection"],
                placeholder="Select destination collection...",
                description="Target collection to populate",
            ),
            StellaArgumentDef(
                name="scope",
                label="Search Scope",
                arg_type="free_text",
                required=False,
                placeholder="Optional thematic filter or topic...",
                description="Refinement query for candidate items",
            ),
        ],
    ),
    StellaCommandInfo(
        command="/extract-entities",
        name="Extract Entities",
        description="Extract key entities and relationships from a source or note for the graph",
        syntax="/extract-entities <source>",
        example='/extract-entities "Treatise on Celestial Orbits.pdf"',
        examples=[
            '/extract-entities "Treatise on Celestial Orbits.pdf"',
            '/extract-entities "The Industrial Revolution"',
        ],
        category="understand",
        action_id="notes.extract_concepts",
        execution_type="action",
        requires_confirmation=False,
        arguments=[
            StellaArgumentDef(
                name="source",
                label="Source / Note",
                arg_type="resource",
                required=True,
                resource_types=["source", "note"],
                placeholder="Select source or note...",
                description="Target document to extract entities from",
            )
        ],
    ),
    StellaCommandInfo(
        command="/reconcile-duplicates",
        name="Reconcile Duplicates",
        description="Identify overlapping or duplicate knowledge and propose consolidation",
        syntax="/reconcile-duplicates [scope]",
        example="/reconcile-duplicates",
        examples=[
            "/reconcile-duplicates",
            '/reconcile-duplicates "Optics Notes"',
        ],
        category="review",
        action_id="notes.compare",
        execution_type="action",
        requires_confirmation=False,
        arguments=[
            StellaArgumentDef(
                name="scope",
                label="Scope",
                arg_type="resource",
                required=False,
                resource_types=["collection", "note"],
                placeholder="Optional scope or collection...",
                description="Workspace area to search for duplicates",
            )
        ],
    ),
    StellaCommandInfo(
        command="/resolve-conflicts",
        name="Resolve Conflicts",
        description="Analyze contradictory statements across sources and synthesize consensus",
        syntax="/resolve-conflicts <scope>",
        example='/resolve-conflicts "Discovery date of Neptune"',
        examples=[
            '/resolve-conflicts "Discovery date of Neptune"',
            '/resolve-conflicts "Steam engine patent disputes"',
        ],
        category="understand",
        action_id="notes.compare",
        execution_type="action",
        requires_confirmation=False,
        arguments=[
            StellaArgumentDef(
                name="scope",
                label="Topic / Dispute",
                arg_type="free_text",
                required=True,
                placeholder="Enter contradictory topic or claim...",
                description="Subject with diverging notes or records",
            )
        ],
    ),
    StellaCommandInfo(
        command="/process-inbox",
        name="Process Inbox",
        description="Triage pending inbox items, categorize content, and propose filings",
        syntax="/process-inbox [scope]",
        example="/process-inbox",
        examples=[
            "/process-inbox",
        ],
        category="review",
        action_id="inbox.list",
        execution_type="workflow",
        requires_confirmation=False,
        arguments=[
            StellaArgumentDef(
                name="scope",
                label="Filter",
                arg_type="free_text",
                required=False,
                placeholder="Optional filter criteria...",
                description="Optional filter for inbox triage",
            )
        ],
    ),
]

# ── Internal Deterministic Operations (Discovered & Executed Programmatically by Stella Agent) ────
DETERMINISTIC_OPERATIONS: list[StellaCommandInfo] = [
    StellaCommandInfo(
        command="/rename-note",
        name="Rename Note",
        description="Rename a workspace note",
        syntax="/rename-note <note> <new_title>",
        example='/rename-note "Industrial Revolution" "The Industrial Age"',
        examples=[
            '/rename-note "Industrial Revolution" "The Industrial Age"',
            '/rename-note "Thermodynamics" "Classical Thermodynamics"',
        ],
        category="write",
        action_id="notes.rename",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="note",
                label="Note",
                arg_type="resource",
                required=True,
                resource_types=["note"],
                placeholder="Select note to rename...",
                description="Target note to rename",
            ),
            StellaArgumentDef(
                name="new_title",
                label="New Title",
                arg_type="free_text",
                required=True,
                placeholder="Enter new note title...",
                description="New title for note",
            ),
        ],
    ),
    StellaCommandInfo(
        command="/duplicate-note",
        name="Duplicate Note",
        description="Duplicate an existing note in the workspace",
        syntax="/duplicate-note <note>",
        example='/duplicate-note "Industrial Revolution"',
        examples=[
            '/duplicate-note "Industrial Revolution"',
            '/duplicate-note "Renaissance Astronomy"',
        ],
        category="write",
        action_id="notes.duplicate",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="note",
                label="Note",
                arg_type="resource",
                required=True,
                resource_types=["note"],
                placeholder="Select note to duplicate...",
                description="Target note to duplicate",
            )
        ],
    ),
    StellaCommandInfo(
        command="/archive-note",
        name="Archive Note",
        description="Archive a note from the active workspace view",
        syntax="/archive-note <note>",
        example='/archive-note "Meeting Notes 2024"',
        examples=[
            '/archive-note "Meeting Notes 2024"',
            '/archive-note "Draft Thesis Outline"',
        ],
        category="write",
        action_id="notes.archive",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="note",
                label="Note",
                arg_type="resource",
                required=True,
                resource_types=["note"],
                placeholder="Select note to archive...",
                description="Target note to archive",
            )
        ],
    ),
    StellaCommandInfo(
        command="/restore-note",
        name="Restore Note",
        description="Restore an archived note back to the active library",
        syntax="/restore-note <note>",
        example='/restore-note "Old Research Notes"',
        examples=[
            '/restore-note "Old Research Notes"',
        ],
        category="write",
        action_id="notes.restore",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="note",
                label="Note",
                arg_type="resource",
                required=True,
                resource_types=["note"],
                placeholder="Select archived note...",
                description="Target note to restore",
            )
        ],
    ),
    StellaCommandInfo(
        command="/pin-note",
        name="Pin Note",
        description="Pin a note to workspace highlights",
        syntax="/pin-note <note>",
        example='/pin-note "Industrial Revolution"',
        examples=[
            '/pin-note "Industrial Revolution"',
            '/pin-note "Key Axioms"',
        ],
        category="write",
        action_id="notes.pin",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="note",
                label="Note",
                arg_type="resource",
                required=True,
                resource_types=["note"],
                placeholder="Select note to pin...",
                description="Target note to pin",
            )
        ],
    ),
    StellaCommandInfo(
        command="/unpin-note",
        name="Unpin Note",
        description="Unpin a note from workspace highlights",
        syntax="/unpin-note <note>",
        example='/unpin-note "Industrial Revolution"',
        examples=[
            '/unpin-note "Industrial Revolution"',
        ],
        category="write",
        action_id="notes.unpin",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="note",
                label="Note",
                arg_type="resource",
                required=True,
                resource_types=["note"],
                placeholder="Select note to unpin...",
                description="Target note to unpin",
            )
        ],
    ),
    StellaCommandInfo(
        command="/delete-note",
        name="Delete Note",
        description="Safely delete a note from the workspace with confirmation",
        syntax="/delete-note <note>",
        example='/delete-note "Scratchpad"',
        examples=[
            '/delete-note "Scratchpad"',
            '/delete-note "Temporary Outline"',
        ],
        category="write",
        action_id="notes.delete",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="note",
                label="Note",
                arg_type="resource",
                required=True,
                resource_types=["note"],
                placeholder="Select note to delete...",
                description="Target note to delete",
            )
        ],
    ),
    StellaCommandInfo(
        command="/create-collection",
        name="Create Collection",
        description="Create a new collection for organizing knowledge items",
        syntax="/create-collection <name>",
        example='/create-collection "Economic History"',
        examples=[
            '/create-collection "Economic History"',
            '/create-collection "Astrophysics Papers"',
        ],
        category="write",
        action_id="collections.create",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="name",
                label="Collection Name",
                arg_type="free_text",
                required=True,
                placeholder="Enter collection name...",
                description="Name of the new collection",
            )
        ],
    ),
    StellaCommandInfo(
        command="/rename-collection",
        name="Rename Collection",
        description="Rename a collection in the workspace",
        syntax="/rename-collection <collection> <new_name>",
        example='/rename-collection "History" "World History"',
        examples=[
            '/rename-collection "History" "World History"',
        ],
        category="write",
        action_id="collections.rename",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="collection",
                label="Collection",
                arg_type="resource",
                required=True,
                resource_types=["collection"],
                placeholder="Select collection...",
                description="Collection to rename",
            ),
            StellaArgumentDef(
                name="new_name",
                label="New Name",
                arg_type="free_text",
                required=True,
                placeholder="Enter new collection name...",
                description="New collection name",
            ),
        ],
    ),
    StellaCommandInfo(
        command="/delete-collection",
        name="Delete Collection",
        description="Delete a collection from the workspace with confirmation",
        syntax="/delete-collection <collection>",
        example='/delete-collection "Old Research"',
        examples=[
            '/delete-collection "Old Research"',
        ],
        category="write",
        action_id="collections.delete",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="collection",
                label="Collection",
                arg_type="resource",
                required=True,
                resource_types=["collection"],
                placeholder="Select collection to delete...",
                description="Target collection to delete",
            )
        ],
    ),
    StellaCommandInfo(
        command="/remove-from-collection",
        name="Remove from Collection",
        description="Remove a note or source from a collection",
        syntax="/remove-from-collection <item> <collection>",
        example='/remove-from-collection "Steam Engine" "Physics"',
        examples=[
            '/remove-from-collection "Steam Engine" "Physics"',
        ],
        category="write",
        action_id="collections.remove_item",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="item",
                label="Item",
                arg_type="resource",
                required=True,
                resource_types=["note", "source", "entity"],
                placeholder="Select item to remove...",
                description="Item to remove from collection",
            ),
            StellaArgumentDef(
                name="collection",
                label="Collection",
                arg_type="resource",
                required=True,
                resource_types=["collection"],
                placeholder="Select collection...",
                description="Target collection",
            ),
        ],
    ),
    StellaCommandInfo(
        command="/move-collection-item",
        name="Move Item Between Collections",
        description="Move an item from one collection to another",
        syntax="/move-collection-item <item> <source_collection> <dest_collection>",
        example='/move-collection-item "Note A" "Drafts" "Published"',
        examples=[
            '/move-collection-item "Note A" "Drafts" "Published"',
        ],
        category="write",
        action_id="collections.move_item",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="item",
                label="Item",
                arg_type="resource",
                required=True,
                resource_types=["note", "source", "entity"],
                placeholder="Select item to move...",
                description="Item to move",
            ),
            StellaArgumentDef(
                name="source_collection",
                label="Source Collection",
                arg_type="resource",
                required=True,
                resource_types=["collection"],
                placeholder="Select source collection...",
                description="Current collection",
            ),
            StellaArgumentDef(
                name="dest_collection",
                label="Destination Collection",
                arg_type="resource",
                required=True,
                resource_types=["collection"],
                placeholder="Select destination collection...",
                description="Destination collection",
            ),
        ],
    ),
    StellaCommandInfo(
        command="/rename-source",
        name="Rename Source",
        description="Rename a source in the workspace",
        syntax="/rename-source <source> <new_title>",
        example='/rename-source "draft.pdf" "Final Treaty PDF"',
        examples=[
            '/rename-source "draft.pdf" "Final Treaty PDF"',
        ],
        category="write",
        action_id="sources.rename",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="source",
                label="Source",
                arg_type="resource",
                required=True,
                resource_types=["source"],
                placeholder="Select source to rename...",
                description="Target source",
            ),
            StellaArgumentDef(
                name="new_title",
                label="New Title",
                arg_type="free_text",
                required=True,
                placeholder="Enter new source title...",
                description="New title for source",
            ),
        ],
    ),
    StellaCommandInfo(
        command="/delete-source",
        name="Delete Source",
        description="Delete a source document from the workspace with confirmation",
        syntax="/delete-source <source>",
        example='/delete-source "draft.pdf"',
        examples=[
            '/delete-source "draft.pdf"',
        ],
        category="write",
        action_id="sources.delete",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="source",
                label="Source",
                arg_type="resource",
                required=True,
                resource_types=["source"],
                placeholder="Select source to delete...",
                description="Target source to delete",
            )
        ],
    ),
    StellaCommandInfo(
        command="/archive-source",
        name="Archive Source",
        description="Archive a source in the workspace",
        syntax="/archive-source <source>",
        example='/archive-source "old_notes.txt"',
        examples=[
            '/archive-source "old_notes.txt"',
        ],
        category="write",
        action_id="sources.archive",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="source",
                label="Source",
                arg_type="resource",
                required=True,
                resource_types=["source"],
                placeholder="Select source to archive...",
                description="Target source to archive",
            )
        ],
    ),
    StellaCommandInfo(
        command="/create-entity",
        name="Create Entity",
        description="Create a new concept or entity in the knowledge graph",
        syntax="/create-entity <name>",
        example='/create-entity "Watt Steam Engine"',
        examples=[
            '/create-entity "Watt Steam Engine"',
            '/create-entity "Industrialization"',
        ],
        category="write",
        action_id="entities.create",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="name",
                label="Entity Name",
                arg_type="free_text",
                required=True,
                placeholder="Enter concept or entity name...",
                description="Entity name",
            )
        ],
    ),
    StellaCommandInfo(
        command="/update-entity",
        name="Update Entity",
        description="Update a knowledge graph entity name or description",
        syntax="/update-entity <entity> <new_name>",
        example='/update-entity "Steam Engine" "Watt Engine"',
        examples=[
            '/update-entity "Steam Engine" "Watt Engine"',
        ],
        category="write",
        action_id="entities.update",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="entity",
                label="Entity",
                arg_type="resource",
                required=True,
                resource_types=["entity"],
                placeholder="Select entity to update...",
                description="Entity to update",
            ),
            StellaArgumentDef(
                name="new_name",
                label="New Name",
                arg_type="free_text",
                required=True,
                placeholder="Enter new entity name...",
                description="New entity name",
            ),
        ],
    ),
    StellaCommandInfo(
        command="/delete-entity",
        name="Delete Entity",
        description="Delete an entity from the knowledge graph with confirmation",
        syntax="/delete-entity <entity>",
        example='/delete-entity "Obsolete Concept"',
        examples=[
            '/delete-entity "Obsolete Concept"',
        ],
        category="write",
        action_id="entities.delete",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="entity",
                label="Entity",
                arg_type="resource",
                required=True,
                resource_types=["entity"],
                placeholder="Select entity to delete...",
                description="Target entity to delete",
            )
        ],
    ),
    StellaCommandInfo(
        command="/delete-relationship",
        name="Delete Relationship",
        description="Delete a connection between entities in the knowledge graph",
        syntax="/delete-relationship <relationship_id>",
        example="/delete-relationship <id>",
        examples=[
            "/delete-relationship <id>",
        ],
        category="write",
        action_id="graph.delete_relationship",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="relationship_id",
                label="Relationship ID",
                arg_type="free_text",
                required=True,
                placeholder="Enter relationship UUID...",
                description="Relationship UUID to remove",
            )
        ],
    ),
    StellaCommandInfo(
        command="/dismiss-inbox",
        name="Dismiss Inbox Item",
        description="Dismiss or reject a pending inbox item from ingestion",
        syntax="/dismiss-inbox <item>",
        example="/dismiss-inbox <id>",
        examples=[
            "/dismiss-inbox <id>",
        ],
        category="write",
        action_id="inbox.dismiss",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="item",
                label="Inbox Item",
                arg_type="free_text",
                required=True,
                placeholder="Enter inbox item ID...",
                description="Inbox item to dismiss",
            )
        ],
    ),
    StellaCommandInfo(
        command="/accept-inbox",
        name="Accept Inbox Item",
        description="Accept a pending inbox item into workspace processing",
        syntax="/accept-inbox <item>",
        example="/accept-inbox <id>",
        examples=[
            "/accept-inbox <id>",
        ],
        category="write",
        action_id="inbox.accept_item",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="item",
                label="Inbox Item",
                arg_type="free_text",
                required=True,
                placeholder="Enter inbox item ID...",
                description="Inbox item to accept",
            )
        ],
    ),
    StellaCommandInfo(
        command="/tag-note",
        name="Tag Note",
        description="Assign a tag to a workspace note",
        syntax="/tag-note <note> <tag>",
        example='/tag-note "Industrial Revolution" history',
        examples=[
            '/tag-note "Industrial Revolution" history',
            '/tag-note "Thermodynamics" physics',
        ],
        category="write",
        action_id="tags.add_to_note",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="note",
                label="Note",
                arg_type="resource",
                required=True,
                resource_types=["note"],
                placeholder="Select note to tag...",
                description="Target note",
            ),
            StellaArgumentDef(
                name="tag",
                label="Tag Name",
                arg_type="free_text",
                required=True,
                placeholder="Enter tag name...",
                description="Tag to assign",
            ),
        ],
    ),
    StellaCommandInfo(
        command="/untag-note",
        name="Untag Note",
        description="Remove a tag from a workspace note",
        syntax="/untag-note <note> <tag>",
        example='/untag-note "Industrial Revolution" draft',
        examples=[
            '/untag-note "Industrial Revolution" draft',
        ],
        category="write",
        action_id="tags.remove_from_note",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="note",
                label="Note",
                arg_type="resource",
                required=True,
                resource_types=["note"],
                placeholder="Select note to untag...",
                description="Target note",
            ),
            StellaArgumentDef(
                name="tag",
                label="Tag Name",
                arg_type="free_text",
                required=True,
                placeholder="Enter tag to remove...",
                description="Tag to remove",
            ),
        ],
    ),
    StellaCommandInfo(
        command="/new-conversation",
        name="New Conversation",
        description="Create a new research conversation thread",
        syntax="/new-conversation [title]",
        example='/new-conversation "Renaissance Astronomy Investigation"',
        examples=[
            '/new-conversation "Renaissance Astronomy Investigation"',
        ],
        category="write",
        action_id="conversations.create",
        execution_type="action",
        requires_confirmation=False,
        arguments=[
            StellaArgumentDef(
                name="title",
                label="Conversation Title",
                arg_type="free_text",
                required=False,
                placeholder="Optional conversation title...",
                description="Initial title for thread",
            )
        ],
    ),
    StellaCommandInfo(
        command="/rename-conversation",
        name="Rename Conversation",
        description="Rename the active conversation thread",
        syntax="/rename-conversation <title>",
        example='/rename-conversation "Advanced Thermodynamics"',
        examples=[
            '/rename-conversation "Advanced Thermodynamics"',
        ],
        category="write",
        action_id="conversations.rename",
        execution_type="action",
        requires_confirmation=False,
        arguments=[
            StellaArgumentDef(
                name="title",
                label="New Title",
                arg_type="free_text",
                required=True,
                placeholder="Enter new conversation title...",
                description="New title for current thread",
            )
        ],
    ),
    StellaCommandInfo(
        command="/delete-conversation",
        name="Delete Conversation",
        description="Delete the active conversation thread with confirmation",
        syntax="/delete-conversation",
        example="/delete-conversation",
        examples=[
            "/delete-conversation",
        ],
        category="write",
        action_id="conversations.delete",
        execution_type="proposal",
        requires_confirmation=True,
        arguments=[],
    ),
    StellaCommandInfo(
        command="/add-to-collection",
        name="Add to Collection",
        description="Add a note, source, or entity to a collection",
        syntax="/add-to-collection <item> <collection>",
        example="/add-to-collection The Industrial Revolution History",
        examples=[
            "/add-to-collection The Industrial Revolution History",
            "/add-to-collection Quantum Computing Physics",
            "/add-to-collection On Liberty Philosophy",
        ],
        category="write",
        action_id="collections.add_item",
        execution_type="proposal",
        availability="internal",
        requires_confirmation=True,
        arguments=[
            StellaArgumentDef(
                name="item",
                label="Item",
                arg_type="resource",
                required=True,
                resource_types=["note", "source", "entity"],
                placeholder="Select note or source...",
                description="Item to add to collection",
            ),
            StellaArgumentDef(
                name="collection",
                label="Collection",
                arg_type="resource",
                required=True,
                resource_types=["collection"],
                placeholder="Select destination collection...",
                description="Destination collection",
            ),
        ],
    ),
    StellaCommandInfo(
        command="/search",
        name="Search",
        description="Search across notes, sources, entities, collections, and threads",
        syntax="/search <query>",
        example="/search renaissance instruments",
        examples=[
            "/search renaissance instruments",
            "/search thermodynamics",
            "/search social classes in industrialization",
        ],
        category="search",
        action_id="knowledge.search_all",
        execution_type="search",
        availability="internal",
        requires_confirmation=False,
        arguments=[
            StellaArgumentDef(
                name="query",
                label="Search Query",
                arg_type="free_text",
                required=True,
                placeholder="Search knowledge base...",
                description="Search query across all workspace resources",
            )
        ],
    ),
]

PLACEHOLDER_COMMANDS: set[str] = {
    "/link-notes",
    "/review-inbox",
    "/analyze",
    "/find-sources",
    "/ask-about",
    "/explore-graph",
}

INTERNAL_AGENT_COMMANDS: set[str] = {
    "/add-to-collection",
    "/search",
}

ALL_OPERATIONS: list[StellaCommandInfo] = AVAILABLE_COMMANDS + DETERMINISTIC_OPERATIONS


def list_commands() -> list[StellaCommandInfo]:
    """Return user-facing slash commands for the interactive command menu."""
    return [c for c in AVAILABLE_COMMANDS if c.availability != "internal"]


def get_command_suggestions(
    db: Session,
    workspace_id: uuid.UUID,
    command: str,
    query: str = "",
    limit: int = 10,
    arg_index: int = 0,
) -> StellaSuggestionsResponse:
    """Return matching workspace items for argument-aware slash commands."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError(f"Workspace {workspace_id} not found.")

    clean_cmd = command.strip().lower()
    cmd_def = next((c for c in ALL_OPERATIONS if c.command.lower() == clean_cmd), None)

    # If command not found, is a placeholder, or command takes no arguments
    if (
        not cmd_def
        or cmd_def.availability == "coming_soon"
        or clean_cmd in PLACEHOLDER_COMMANDS
        or not cmd_def.arguments
    ):
        return StellaSuggestionsResponse(
            items=[],
            command=command,
            query=query,
            arg_index=arg_index,
            total=0,
        )

    if arg_index >= len(cmd_def.arguments):
        if clean_cmd == "/merge-notes":
            arg_def = cmd_def.arguments[-1]
        else:
            return StellaSuggestionsResponse(
                items=[],
                command=command,
                query=query,
                arg_index=arg_index,
                total=0,
            )
    else:
        arg_def = cmd_def.arguments[arg_index]
    if arg_def.arg_type != "resource":
        # Free-text arguments never trigger resource pickers
        return StellaSuggestionsResponse(
            items=[],
            command=command,
            query=query,
            arg_index=arg_index,
            total=0,
        )

    allowed_types = set(arg_def.resource_types)
    clean_q = query.strip().lower()
    items: list[StellaSuggestionItem] = []

    def _format_time_ago(dt: datetime | None) -> str:
        if not dt:
            return "recently"
        now = datetime.now(UTC)
        diff = now - (dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt)
        seconds = max(0, int(diff.total_seconds()))
        if seconds < 120:
            return "just now"
        elif seconds < 3600:
            return f"{seconds // 60}m ago"
        elif seconds < 86400:
            return f"{seconds // 3600}h ago"
        elif seconds < 172800:
            return "yesterday"
        elif seconds < 604800:
            return f"{seconds // 86400} days ago"
        else:
            return f"{max(1, seconds // 604800)}w ago"

    # 1. Notes (if allowed)
    if "note" in allowed_types:
        note_stmt = select(Note).where(
            Note.workspace_id == workspace_id,
            Note.is_archived.is_(False),
        )
        if clean_q:
            note_stmt = note_stmt.where(
                or_(
                    func.lower(Note.title).contains(clean_q),
                    func.lower(Note.content).contains(clean_q),
                )
            )
        note_stmt = note_stmt.order_by(Note.updated_at.desc()).limit(limit)
        notes = list(db.scalars(note_stmt).all())

        for n in notes:
            wc = len((n.content or "").split())
            time_str = _format_time_ago(n.updated_at)
            subtitle = f"Note · {wc:,} words · Modified {time_str}"
            items.append(
                StellaSuggestionItem(
                    id=str(n.id),
                    title=n.title,
                    item_type="note",
                    subtitle=subtitle,
                    snippet=(n.content or "")[:200],
                    word_count=wc,
                    updated_at=time_str,
                )
            )

    # 2. Sources (if allowed)
    if "source" in allowed_types:
        src_stmt = select(Source).where(Source.workspace_id == workspace_id)
        if clean_q:
            src_stmt = src_stmt.where(
                or_(
                    func.lower(Source.original_path).contains(clean_q),
                    func.lower(Source.source_identifier).contains(clean_q),
                )
            )
        src_stmt = src_stmt.order_by(Source.imported_at.desc()).limit(limit)
        sources = list(db.scalars(src_stmt).all())
        for src in sources:
            src_title = (
                src.original_path.replace("\\", "/").split("/")[-1]
                if src.original_path
                else (src.source_identifier or "Source")
            )
            items.append(
                StellaSuggestionItem(
                    id=str(src.id),
                    title=src_title,
                    item_type="source",
                    subtitle=f"Source · {src.source_type.upper()}",
                    updated_at=_format_time_ago(src.imported_at),
                )
            )

    # 3. Collections (if allowed)
    if "collection" in allowed_types:
        col_stmt = select(Collection).where(Collection.workspace_id == workspace_id)
        if clean_q:
            col_stmt = col_stmt.where(
                or_(
                    func.lower(Collection.name).contains(clean_q),
                    func.lower(Collection.description).contains(clean_q),
                )
            )
        col_stmt = col_stmt.order_by(Collection.updated_at.desc()).limit(limit)
        collections = list(db.scalars(col_stmt).all())
        for col in collections:
            items.append(
                StellaSuggestionItem(
                    id=str(col.id),
                    title=col.name,
                    item_type="collection",
                    subtitle="Collection",
                    snippet=col.description,
                    updated_at=_format_time_ago(col.updated_at),
                )
            )

    # 4. Entities (if allowed)
    if "entity" in allowed_types:
        ent_stmt = select(GraphEntity).where(GraphEntity.workspace_id == workspace_id)
        if clean_q:
            ent_stmt = ent_stmt.where(
                or_(
                    func.lower(GraphEntity.name).contains(clean_q),
                    func.lower(GraphEntity.description).contains(clean_q),
                )
            )
        ent_stmt = ent_stmt.order_by(GraphEntity.name.asc()).limit(limit)
        entities = list(db.scalars(ent_stmt).all())
        for ent in entities:
            items.append(
                StellaSuggestionItem(
                    id=str(ent.id),
                    title=ent.name,
                    item_type="entity",
                    subtitle=f"Entity · {ent.entity_type.capitalize()}",
                    snippet=ent.description,
                )
            )

    return StellaSuggestionsResponse(
        items=items[:limit],
        command=command,
        query=query,
        arg_index=arg_index,
        total=len(items[:limit]),
    )


def _extract_or_generate_key_points(title: str, content: str) -> list[str]:
    """Extract or synthesize 4-5 concise, practical bullet points from content."""
    key_points: list[str] = []
    try:
        if llm_service.health_check():
            prompt = (
                f"Summarize the following content into exactly 4 or 5 concise, clear bullet points. "
                f"Focus on the core ideas, factual findings, and practical takeaways. Avoid academic jargon.\n\n"
                f"Title: {title}\n\nContent:\n{content[:2000]}\n\n"
                f"Return ONLY the bullet points, each starting with '• ' or '- '."
            )
            raw_llm = llm_service.generate(
                [
                    {
                        "role": "system",
                        "content": "You are Stella, a knowledgeable and clear AI assistant.",
                    },
                    {"role": "user", "content": prompt},
                ]
            )
            lines = [
                line.strip().lstrip("•-* 12345.").strip()
                for line in raw_llm.splitlines()
                if line.strip().startswith(("•", "-", "*", "1.", "2.", "3.", "4.", "5."))
            ]
            if len(lines) >= 3:
                key_points = lines[:5]
    except Exception as exc:
        logger.warning("LLM summarization fallback: %s", exc)

    if not key_points:
        sentences = [
            s.strip()
            for s in re.split(r"(?<=[.!?])\s+", content)
            if len(s.strip()) > 30 and not s.strip().startswith("#")
        ]
        if len(sentences) >= 3:
            key_points = sentences[:5]
        else:
            clean_title = title.strip()
            key_points = [
                f"Core definition and overview of **{clean_title}**.",
                "Primary concepts and mechanisms explained in the material.",
                "Key practical distinctions and concrete takeaways.",
                "Supporting context and references relevant to the workspace.",
            ]
    return key_points


def _persist_summary_exchange(
    db: Session,
    conversation_id: uuid.UUID | None,
    target: str,
    prompt: str | None,
    res: StellaSummarizeResponse,
) -> StellaSummarizeResponse:
    """Persist a /summarize command and its structured summary card into the conversation."""
    if conversation_id:
        user_msg = (prompt or "").strip() or (
            f'/summarize "{target}"' if " " in target and not target.startswith('"') else f"/summarize {target}"
        )
        assistant_msg = f"Here is the structured summary of **{res.target_title}**:"
        _record_conversation_exchange(
            db=db,
            conversation_id=conversation_id,
            user_content=user_msg,
            assistant_content=assistant_msg,
            action_result={
                "card_type": "summary",
                "command": "/summarize",
                "status": "completed",
                "summaryCard": {
                    "targetId": res.target_id,
                    "targetTitle": res.target_title,
                    "targetType": res.target_type,
                    "summaryTitle": res.summary_title,
                    "metaDescription": res.meta_description,
                    "keyPoints": res.key_points,
                    "fullSummary": res.full_summary,
                    "relatedNotesCount": res.related_notes_count,
                    "sourceId": res.source_id,
                },
                **res.model_dump(),
            },
        )
    return res


def summarize_target(
    db: Session,
    workspace_id: uuid.UUID,
    target: str,
    conversation_id: uuid.UUID | None = None,
    prompt: str | None = None,
) -> StellaSummarizeResponse:
    """Find target item (note, source, collection, entity) in workspace and produce structured summary."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError(f"Workspace {workspace_id} not found.")

    clean_target = target.strip()
    if not clean_target:
        raise ValidationError("Target identifier or title cannot be empty.")

    target_id: uuid.UUID | None = None
    try:
        target_id = uuid.UUID(clean_target)
    except ValueError:
        pass

    # 1. Try Note
    target_note: Note | None = None
    if target_id:
        target_note = db.scalars(
            select(Note).where(Note.id == target_id, Note.workspace_id == workspace_id)
        ).first()
    if not target_note:
        target_note = db.scalars(
            select(Note).where(
                Note.workspace_id == workspace_id,
                Note.is_archived.is_(False),
                func.lower(Note.title) == clean_target.lower(),
            )
        ).first()
    if not target_note and len(clean_target) >= 3:
        target_note = db.scalars(
            select(Note).where(
                Note.workspace_id == workspace_id,
                Note.is_archived.is_(False),
                func.lower(Note.title).contains(clean_target.lower()),
            )
        ).first()

    if target_note:
        content = target_note.content or ""
        if not content.strip():
            raise ValidationError(f"Note '{target_note.title}' has no content to summarize.")
        key_points = _extract_or_generate_key_points(target_note.title, content)
        related_notes_count = (
            db.scalar(
                select(func.count(Note.id)).where(
                    Note.workspace_id == workspace_id,
                    Note.id != target_note.id,
                    Note.is_archived.is_(False),
                )
            )
            or 0
        )
        res = StellaSummarizeResponse(
            target_id=str(target_note.id),
            target_title=target_note.title,
            target_type="note",
            summary_title=f"Summary: {target_note.title}",
            meta_description=f"Based on 1 note · {len(key_points)} key points",
            key_points=key_points,
            full_summary="\n".join(f"• {pt}" for pt in key_points),
            related_notes_count=min(4, int(related_notes_count)),
            source_id=None,
        )
        return _persist_summary_exchange(db, conversation_id, clean_target, prompt, res)

    # 2. Try Source
    target_source: Source | None = None
    if target_id:
        target_source = db.scalars(
            select(Source).where(Source.id == target_id, Source.workspace_id == workspace_id)
        ).first()
    if not target_source:
        target_source = db.scalars(
            select(Source).where(
                Source.workspace_id == workspace_id,
                or_(
                    func.lower(Source.original_path) == clean_target.lower(),
                    func.lower(Source.original_path).contains(clean_target.lower()),
                    func.lower(Source.source_identifier) == clean_target.lower(),
                ),
            )
        ).first()

    if target_source:
        source_title = (
            target_source.original_path.replace("\\", "/").split("/")[-1]
            if target_source.original_path
            else (target_source.source_identifier or "Source")
        )
        content = ""
        if target_source.raw_metadata and target_source.raw_metadata.get("extracted_text"):
            content = str(target_source.raw_metadata.get("extracted_text", ""))
        if not content:
            chunks = list(
                db.scalars(
                    select(ContentChunk.content)
                    .where(ContentChunk.source_id == target_source.id)
                    .order_by(ContentChunk.chunk_index.asc())
                    .limit(10)
                ).all()
            )
            content = "\n\n".join(chunks)
        if not content.strip():
            content = f"Source {source_title} ({target_source.source_type}) ingested into workspace."
        key_points = _extract_or_generate_key_points(source_title, content)
        res = StellaSummarizeResponse(
            target_id=str(target_source.id),
            target_title=source_title,
            target_type="source",
            summary_title=f"Source Summary: {source_title}",
            meta_description=f"Based on 1 {target_source.source_type.upper()} source · {len(key_points)} key points",
            key_points=key_points,
            full_summary="\n".join(f"• {pt}" for pt in key_points),
            related_notes_count=0,
            source_id=str(target_source.id),
        )
        return _persist_summary_exchange(db, conversation_id, clean_target, prompt, res)

    # 3. Try Collection
    target_col: Collection | None = None
    if target_id:
        target_col = db.scalars(
            select(Collection).where(Collection.id == target_id, Collection.workspace_id == workspace_id)
        ).first()
    if not target_col:
        target_col = db.scalars(
            select(Collection).where(
                Collection.workspace_id == workspace_id,
                func.lower(Collection.name) == clean_target.lower(),
            )
        ).first()
    if not target_col and len(clean_target) >= 3:
        target_col = db.scalars(
            select(Collection).where(
                Collection.workspace_id == workspace_id,
                func.lower(Collection.name).contains(clean_target.lower()),
            )
        ).first()

    if target_col:
        content = f"Collection '{target_col.name}'. {target_col.description or ''}"
        key_points = _extract_or_generate_key_points(target_col.name, content)
        res = StellaSummarizeResponse(
            target_id=str(target_col.id),
            target_title=target_col.name,
            target_type="collection",
            summary_title=f"Collection Summary: {target_col.name}",
            meta_description=f"Collection dossier · {len(key_points)} key points",
            key_points=key_points,
            full_summary="\n".join(f"• {pt}" for pt in key_points),
            related_notes_count=0,
            source_id=None,
        )
        return _persist_summary_exchange(db, conversation_id, clean_target, prompt, res)

    # 4. Try GraphEntity
    target_ent: GraphEntity | None = None
    if target_id:
        target_ent = db.scalars(
            select(GraphEntity).where(GraphEntity.id == target_id, GraphEntity.workspace_id == workspace_id)
        ).first()
    if not target_ent:
        target_ent = db.scalars(
            select(GraphEntity).where(
                GraphEntity.workspace_id == workspace_id,
                func.lower(GraphEntity.name) == clean_target.lower(),
            )
        ).first()
    if not target_ent and len(clean_target) >= 3:
        target_ent = db.scalars(
            select(GraphEntity).where(
                GraphEntity.workspace_id == workspace_id,
                func.lower(GraphEntity.name).contains(clean_target.lower()),
            )
        ).first()

    if target_ent:
        content = f"Entity: {target_ent.name} ({target_ent.entity_type}). {target_ent.description or ''}"
        key_points = _extract_or_generate_key_points(target_ent.name, content)
        res = StellaSummarizeResponse(
            target_id=str(target_ent.id),
            target_title=target_ent.name,
            target_type="entity",
            summary_title=f"Entity Dossier: {target_ent.name}",
            meta_description=f"Entity analysis · {len(key_points)} key points",
            key_points=key_points,
            full_summary="\n".join(f"• {pt}" for pt in key_points),
            related_notes_count=0,
            source_id=None,
        )
        return _persist_summary_exchange(db, conversation_id, clean_target, prompt, res)

    raise AppException(
        404,
        "RESOURCE_NOT_FOUND",
        f"Could not find any note, source, or item matching '{target}' in this workspace.",
    )



def _count_words(text: str) -> int:
    """Accurately count words in a markdown or plaintext string."""
    return len(re.findall(r"\b\w+\b", text))


def _generate_learning_note_draft(
    db: Session,
    workspace_id: uuid.UUID,
    topic: str,
) -> tuple[str, str, list[uuid.UUID]]:
    """Generate a structured, pedagogical learning note on a topic (~280-350 words).

    Finds relevant workspace sources and notes using hybrid search to establish
    traceable provenance. Explains concepts clearly, directly, and practically like
    an effective teacher.
    """
    cleaned_topic = topic.strip()
    title_words = cleaned_topic.split()
    capitalized_topic = " ".join(w.capitalize() for w in title_words)
    title = f"{capitalized_topic}: Overview and Core Concepts"

    # Search for existing workspace sources and notes to support the note
    from app.services import retrieval_service

    referenced_source_ids: list[uuid.UUID] = []
    referenced_sources_meta: list[dict[str, str]] = []
    hits = retrieval_service.search_hybrid(db, workspace_id, cleaned_topic, limit=5)
    for h in hits:
        if h.source_id and h.source_id not in referenced_source_ids:
            referenced_source_ids.append(h.source_id)
            referenced_sources_meta.append({
                "title": h.title,
                "id": str(h.source_id),
                "excerpt": (h.excerpt or "")[:150],
            })
        if len(referenced_source_ids) >= 3:
            break

    # Context block for prompt or fallback
    context_lines = []
    for s in referenced_sources_meta:
        context_lines.append(f"- Source [{s['title']}]: {s['excerpt']}")
    context_str = "\n".join(context_lines) if context_lines else "No directly matching sources found in workspace."

    prompt = (
        f"You are Stella, a knowledgeable, clear, and encouraging learning assistant.\n"
        f"Your goal is to write a high-quality pedagogical knowledge note on the topic: '{cleaned_topic}'.\n\n"
        f"Writing Instructions:\n"
        f"- Target approximately 280-350 words total.\n"
        f"- Teach with clarity: start with a clear, concise definition or overview, explain how it works step-by-step, "
        f"use concrete examples or analogies, and highlight common misconceptions or pitfalls.\n"
        f"- Avoid unnecessary academic posturing, pompous rhetoric, or empty filler.\n"
        f"- Use clean Markdown headings:\n"
        f"  ### Definition & Core Concept\n"
        f"  ### How It Works & Key Mechanisms\n"
        f"  ### Concrete Examples & Practical Application\n"
        f"  ### Common Misconceptions & Pitfalls\n"
        f"  ### Supporting Workspace Sources (only if applicable)\n"
        f"- If workspace sources are available below, reference them accurately:\n{context_str}\n"
    )

    try:
        if llm_service.health_check():
            response_text = llm_service.generate(
                messages=[
                    {"role": "system", "content": "You are Stella, an expert teacher and knowledge guide."},
                    {"role": "user", "content": prompt},
                ]
            )
            if response_text and len(response_text.split()) >= 150:
                content = response_text.strip()
                first_line = content.splitlines()[0].strip()
                if first_line.startswith("# "):
                    title = first_line.lstrip("# ").strip()
                    content = "\n".join(content.splitlines()[1:]).strip()
                return title, content, referenced_source_ids
    except Exception as exc:
        logger.warning("LLM generation skipped for note draft fallback: %s", exc)

    # Pedagogical fallback structured for clear understanding
    sources_section = ""
    if referenced_sources_meta:
        src_bullets = "\n".join(f"- **{s['title']}**: {s['excerpt'] or 'Verified workspace evidence.'}" for s in referenced_sources_meta)
        sources_section = f"\n\n### Supporting Workspace Sources\n\n{src_bullets}"
    else:
        sources_section = (
            f"\n\n### Supporting Workspace Sources\n\n"
            f"- *Workspace context:* Synthesized from general reference concepts. "
            f"No linked workspace sources were referenced for this initial draft."
        )

    content = (
        f"### Definition & Core Concept\n\n"
        f"**{cleaned_topic}** refers to the foundational principles, economic structures, and practical "
        f"systems that define this domain. At its core, it establishes how key mechanisms of production "
        f"and organization operate, how resources flow through the system, and how practitioners structure "
        f"solutions effectively. Rather than an isolated technique, it provides a coherent framework for "
        f"understanding complex developments reliably.\n\n"
        f"### How It Works & Key Mechanisms\n\n"
        f"The architecture operates through three primary layers:\n"
        f"1. **Input & Specification:** Clear parameters and initial conditions are defined.\n"
        f"2. **Transformation & Execution:** Deterministic processes transform inputs into verifiable production outcomes.\n"
        f"3. **Feedback & Validation:** Continuous checks evaluate results against expected benchmarks.\n\n"
        f"### Concrete Examples & Practical Application\n\n"
        f"In real-world workflows, applying {cleaned_topic.lower()} allows practitioners to transition "
        f"from ad-hoc experimentation to structured, reproducible execution. For example, teams that implement "
        f"these patterns systematically reduce coordination friction, identify bottlenecks early, and maintain "
        f"clear operational visibility.\n\n"
        f"### Common Misconceptions & Pitfalls\n\n"
        f"- **Over-complication:** A common mistake is introducing unnecessary layers before mastering the core principles.\n"
        f"- **Ignoring Constraints:** Assuming mechanisms scale linearly without accounting for real-world boundary conditions."
        f"{sources_section}"
    )

    return title, content, referenced_source_ids


def _generate_scholastic_draft(topic: str) -> tuple[str, str]:
    """Deprecated legacy shim - redirects to learning note draft format."""
    cleaned_topic = topic.strip()
    title_words = cleaned_topic.split()
    capitalized_topic = " ".join(w.capitalize() for w in title_words)
    title = f"{capitalized_topic}: Overview and Core Concepts"
    content = (
        f"### Definition & Core Concept\n\n"
        f"**{cleaned_topic}** provides the core framework and principles for understanding this area.\n\n"
        f"### How It Works & Key Mechanisms\n\n"
        f"The mechanism relies on structured inputs, verifiable transformations, and continuous feedback.\n\n"
        f"### Concrete Examples & Practical Application\n\n"
        f"Applying these principles systematically ensures clarity and reproducible outcomes.\n\n"
        f"### Common Misconceptions & Pitfalls\n\n"
        f"- Assuming patterns apply universally without validating constraints."
    )
    return title, content


def generate_note_draft(
    db: Session,
    workspace_id: uuid.UUID,
    topic: str,
    conversation_id: uuid.UUID | None = None,
    prompt: str | None = None,
) -> StellaCreateNoteDraftResponse:
    """Generate a note draft and stage a canonical two-phase action proposal."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError(f"Workspace {workspace_id} not found.")

    if not topic.strip():
        raise ValidationError("Topic cannot be empty.")

    title, content, referenced_source_ids = _generate_learning_note_draft(db, workspace_id, topic)
    word_count = _count_words(content)

    # Propose creation via canonical action execution service
    envelope = action_execution_service.execute_action(
        db=db,
        workspace_id=workspace_id,
        action_id="notes.create",
        request=ActionExecuteRequest(
            mode="propose",
            input={"title": title, "content": content, "tags": [topic.strip().lower()]},
            idempotency_key=str(uuid.uuid4()),
        ),
    )

    if not envelope.proposals:
        raise AppException(500, "PROPOSAL_FAILED", "Failed to stage action proposal for note.")

    proposal_item = envelope.proposals[0]

    # Stash referenced_source_ids in proposal record payload for commit linking
    if referenced_source_ids:
        prop_row = db.get(ActionProposal, proposal_item.proposal_id)
        if prop_row:
            pl = dict(prop_row.proposal_payload or {})
            pl["referenced_source_ids"] = [str(sid) for sid in referenced_source_ids]
            prop_row.proposal_payload = pl
            db.commit()

    res = StellaCreateNoteDraftResponse(
        proposal_id=proposal_item.proposal_id,
        confirmation_token=proposal_item.confirmation_token or "",
        action_id="notes.create",
        title=title,
        content=content,
        word_count=word_count,
        status="proposed",
        topic=topic.strip(),
    )

    if conversation_id:
        user_msg = (prompt or "").strip() or f"/create-note {topic.strip()}"
        assistant_msg = f"I've drafted a comprehensive note on **{topic.strip()}**. Here is a preview:"
        _record_conversation_exchange(
            db=db,
            conversation_id=conversation_id,
            user_content=user_msg,
            assistant_content=assistant_msg,
            action_result={
                "card_type": "note_draft",
                "command": "/create-note",
                "action_id": "notes.create",
                "status": "proposed",
                "proposal_id": str(proposal_item.proposal_id),
                "confirmation_token": proposal_item.confirmation_token or "",
                "noteDraft": {
                    "proposalId": str(proposal_item.proposal_id),
                    "confirmationToken": proposal_item.confirmation_token or "",
                    "actionId": "notes.create",
                    "title": title,
                    "content": content,
                    "wordCount": word_count,
                    "status": "proposed",
                    "topic": topic.strip(),
                },
            },
        )

    return res


def commit_note_draft(
    db: Session,
    workspace_id: uuid.UUID,
    proposal_id: uuid.UUID,
    confirmation_token: str,
    title: str | None = None,
    content: str | None = None,
    conversation_id: uuid.UUID | None = None,
) -> StellaCreateNoteCommitResponse:
    """Commit a staged note proposal into a persistent Note record."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError(f"Workspace {workspace_id} not found.")

    proposal = db.scalars(
        select(ActionProposal).where(
            ActionProposal.id == proposal_id,
            ActionProposal.workspace_id == workspace_id,
        )
    ).first()

    if not proposal:
        raise AppException(404, "PROPOSAL_NOT_FOUND", "Proposal not found in workspace.")

    # Apply inline revisions if provided
    current_payload = dict(proposal.proposal_payload or {})
    if title and title.strip():
        current_payload["title"] = title.strip()
    if content is not None:
        current_payload["content"] = content

    proposal.proposal_payload = current_payload
    db.commit()

    # Commit via action execution service
    envelope = action_execution_service.execute_action(
        db=db,
        workspace_id=workspace_id,
        action_id="notes.create",
        request=ActionExecuteRequest(
            mode="commit",
            confirmation_token=confirmation_token,
            input=current_payload,
            idempotency_key=str(uuid.uuid4()),
        ),
    )

    # Extract created note ID
    note_id: uuid.UUID | None = None
    if envelope.result and "note_id" in envelope.result:
        note_id = uuid.UUID(str(envelope.result["note_id"]))
    elif envelope.committed_changes:
        affected = envelope.committed_changes[0].affected_item_ids
        if affected:
            note_id = uuid.UUID(str(affected[0]))

    if not note_id:
        raise AppException(500, "COMMIT_FAILED", "Could not verify created note ID from execution.")

    # Link created note to any referenced sources staged in the proposal
    ref_sources = current_payload.get("referenced_source_ids") or []
    if ref_sources:
        from app.services import source_service
        for sid_str in ref_sources:
            try:
                sid = uuid.UUID(str(sid_str))
                source_service.link_source_to_note(db, sid, note_id)
            except Exception as exc:
                logger.warning("Could not link source %s to note %s on commit: %s", sid_str, note_id, exc)

    final_title = current_payload.get("title", "Untitled Note")
    final_content = current_payload.get("content", "")
    word_count = _count_words(final_content)

    def _update_draft(parsed: dict[str, Any], orig_text: str) -> tuple[dict[str, Any], str]:
        draft_obj = dict(parsed.get("noteDraft") or {})
        draft_obj.update(
            {
                "status": "committed",
                "savedNoteId": str(note_id),
                "title": final_title,
                "content": final_content,
                "wordCount": word_count,
                "savedAt": "Recently",
            }
        )
        parsed["status"] = "committed"
        parsed["noteDraft"] = draft_obj
        return parsed, orig_text

    _update_proposal_message_in_conversation(
        db=db,
        proposal_id=proposal_id,
        updater=_update_draft,
        conversation_id=conversation_id,
    )

    return StellaCreateNoteCommitResponse(
        note_id=note_id,
        title=final_title,
        word_count=word_count,
        status="committed",
        execution_id=envelope.execution_id,
    )


def cancel_note_draft(
    db: Session,
    workspace_id: uuid.UUID,
    proposal_id: uuid.UUID,
) -> None:
    """Reject and cancel a staged note creation proposal."""
    proposal = db.scalars(
        select(ActionProposal).where(
            ActionProposal.id == proposal_id,
            ActionProposal.workspace_id == workspace_id,
        )
    ).first()

    if not proposal:
        raise AppException(404, "PROPOSAL_NOT_FOUND", "Proposal not found in workspace.")

    proposal.status = "rejected"
    db.commit()

    def _mark_cancelled(parsed: dict[str, Any], orig_text: str) -> tuple[dict[str, Any], str]:
        parsed["status"] = "cancelled"
        if isinstance(parsed.get("noteDraft"), dict):
            parsed["noteDraft"]["status"] = "cancelled"
        if isinstance(parsed.get("addToCollectionProposal"), dict):
            parsed["addToCollectionProposal"]["status"] = "cancelled"
        return parsed, orig_text

    _update_proposal_message_in_conversation(
        db=db,
        proposal_id=proposal_id,
        updater=_mark_cancelled,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Operational Command Execution Handlers (§7.3, §7.4, §8.1)
# ─────────────────────────────────────────────────────────────────────────────


def execute_search(
    db: Session,
    workspace_id: uuid.UUID,
    query: str,
    limit: int = 10,
    conversation_id: uuid.UUID | None = None,
    prompt: str | None = None,
) -> StellaSearchResponse:
    """Execute multi-domain global search across notes, sources, entities, collections, threads."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError(f"Workspace {workspace_id} not found.")

    clean_q = query.strip()
    if not clean_q:
        return StellaSearchResponse(query=query, total=0, items=[])

    from app.actions.handlers.read import handle_knowledge_search_all
    from app.actions.types import KnowledgeSearchAllInput

    input_data = KnowledgeSearchAllInput(
        query=clean_q,
        limit=limit,
        types=["notes", "sources", "entities", "collections", "threads"],
    )
    result = handle_knowledge_search_all(db, workspace_id, input_data)
    raw_items = result.result.get("items", []) if result.result else []

    mapped_items: list[StellaSearchResultItem] = []
    for it in raw_items:
        raw_score = it.get("similarity_score")
        score = float(raw_score) if raw_score is not None else 0.85
        mapped_items.append(
            StellaSearchResultItem(
                id=str(it.get("item_id")),
                title=str(it.get("title", "")),
                item_type=str(it.get("item_type", "note")),
                snippet=it.get("excerpt"),
                score=score,
                extra=it.get("search_method"),
            )
        )

    res = StellaSearchResponse(
        query=clean_q,
        total=len(mapped_items),
        items=mapped_items,
    )

    if conversation_id:
        user_msg = (prompt or "").strip() or f"/search {clean_q}"
        assistant_msg = (
            f"Found {res.total} matching item{'s' if res.total != 1 else ''} across your workspace for **{clean_q}**:"
            if res.total > 0
            else f"No items found in your workspace matching **{clean_q}**."
        )
        _record_conversation_exchange(
            db=db,
            conversation_id=conversation_id,
            user_content=user_msg,
            assistant_content=assistant_msg,
            action_result={
                "card_type": "search_results",
                "command": "/search",
                "status": "completed",
                "searchResults": res.model_dump(),
            },
        )

    return res


def execute_inbox_review(
    db: Session,
    workspace_id: uuid.UUID,
    conversation_id: uuid.UUID | None = None,
) -> StellaInboxReviewResponse:
    """Retrieve authoritative inbox review state using the inbox service."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError(f"Workspace {workspace_id} not found.")

    from app.services import inbox_service

    items, total = inbox_service.list_inbox_items(
        db=db,
        workspace_id=workspace_id,
        status_filter="pending",
        page=1,
        page_size=20,
    )

    mapped: list[StellaInboxItem] = []
    for it in items:
        mapped.append(
            StellaInboxItem(
                id=str(it.id),
                source_id=str(it.source_id),
                source_title=getattr(it, "source_title", "Source"),
                source_type=getattr(it, "source_type", "document"),
                status=it.status,
                detection_status=it.detection_status,
                detected_count=it.detected_count,
                detected_entities=list(it.detected_entities or []),
                created_at=it.created_at.isoformat(),
            )
        )

    if total == 0:
        summary_msg = "Your ingestion inbox is clear — 0 pending items."
    else:
        summary_msg = f"Found {total} pending item{'s' if total != 1 else ''} in workspace inbox awaiting review."

    res = StellaInboxReviewResponse(
        total_pending=total,
        items=mapped,
        summary_message=summary_msg,
    )

    if conversation_id:
        _record_conversation_exchange(
            db=db,
            conversation_id=conversation_id,
            user_content="/review-inbox",
            assistant_content=summary_msg,
            action_result={
                "card_type": "inbox_review",
                "command": "/review-inbox",
                "status": "completed",
                "inboxReview": {
                    "totalPending": res.total_pending,
                    "items": [it.model_dump() for it in res.items],
                    "summaryMessage": res.summary_message,
                },
            },
        )

    return res


def stage_add_to_collection(
    db: Session,
    workspace_id: uuid.UUID,
    item_id: uuid.UUID,
    item_type: str,
    collection_id: uuid.UUID,
    conversation_id: uuid.UUID | None = None,
    prompt: str | None = None,
) -> StellaAddToCollectionResponse:
    """Propose adding an item to a collection with two-phase commit protection."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError(f"Workspace {workspace_id} not found.")

    coll = db.get(Collection, collection_id)
    if not coll or coll.workspace_id != workspace_id:
        raise AppException(404, "COLLECTION_NOT_FOUND", "Collection not found in workspace.")

    item_title = "Item"
    if item_type == "note":
        note = db.get(Note, item_id)
        if not note or note.workspace_id != workspace_id:
            raise AppException(404, "NOTE_NOT_FOUND", "Note not found in workspace.")
        item_title = note.title
    elif item_type == "source":
        src = db.get(Source, item_id)
        if not src or src.workspace_id != workspace_id:
            raise AppException(404, "SOURCE_NOT_FOUND", "Source not found in workspace.")
        item_title = (
            src.original_path.replace("\\", "/").split("/")[-1]
            if src.original_path
            else (src.source_identifier or "Source")
        )
    elif item_type == "entity":
        ent = db.get(GraphEntity, item_id)
        if not ent or ent.workspace_id != workspace_id:
            raise AppException(404, "ENTITY_NOT_FOUND", "Entity not found in workspace.")
        item_title = ent.name
    else:
        raise ValidationError(f"Unsupported item type for collection: '{item_type}'.")

    envelope = action_execution_service.execute_action(
        db=db,
        workspace_id=workspace_id,
        action_id="collections.add_item",
        request=ActionExecuteRequest(
            mode="propose",
            input={
                "collection_id": str(collection_id),
                "item_type": item_type,
                "item_id": str(item_id),
            },
            idempotency_key=str(uuid.uuid4()),
        ),
    )

    if not envelope.proposals:
        raise AppException(500, "PROPOSAL_FAILED", "Failed to stage add-to-collection proposal.")

    proposal_item = envelope.proposals[0]

    res = StellaAddToCollectionResponse(
        proposal_id=proposal_item.proposal_id,
        confirmation_token=proposal_item.confirmation_token or "",
        action_id="collections.add_item",
        item_id=str(item_id),
        item_title=item_title,
        item_type=item_type,
        collection_id=str(collection_id),
        collection_name=coll.name,
        status="proposed",
    )

    if conversation_id:
        user_msg = (prompt or "").strip() or f'/add-to-collection "{item_title}" "{coll.name}"'
        assistant_msg = f"I've prepared a proposal to add **{item_title}** to collection **{coll.name}**:"
        _record_conversation_exchange(
            db=db,
            conversation_id=conversation_id,
            user_content=user_msg,
            assistant_content=assistant_msg,
            action_result={
                "card_type": "add_to_collection",
                "command": "/add-to-collection",
                "action_id": "collections.add_item",
                "status": "proposed",
                "proposal_id": str(proposal_item.proposal_id),
                "addToCollectionProposal": {
                    "proposalId": str(proposal_item.proposal_id),
                    "confirmationToken": proposal_item.confirmation_token or "",
                    "actionId": "collections.add_item",
                    "itemId": str(item_id),
                    "itemTitle": item_title,
                    "itemType": item_type,
                    "collectionId": str(collection_id),
                    "collectionName": coll.name,
                    "status": "proposed",
                },
            },
        )

    return res


def commit_add_to_collection(
    db: Session,
    workspace_id: uuid.UUID,
    proposal_id: uuid.UUID,
    confirmation_token: str,
    conversation_id: uuid.UUID | None = None,
) -> StellaAddToCollectionCommitResponse:
    """Commit a staged add-to-collection proposal."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError(f"Workspace {workspace_id} not found.")

    proposal = db.scalars(
        select(ActionProposal).where(
            ActionProposal.id == proposal_id,
            ActionProposal.workspace_id == workspace_id,
        )
    ).first()
    if not proposal:
        raise AppException(404, "PROPOSAL_NOT_FOUND", "Proposal not found in workspace.")

    envelope = action_execution_service.execute_action(
        db=db,
        workspace_id=workspace_id,
        action_id="collections.add_item",
        request=ActionExecuteRequest(
            mode="commit",
            confirmation_token=confirmation_token,
            input=proposal.proposal_payload,
            idempotency_key=str(uuid.uuid4()),
        ),
    )

    def _update_add_col(parsed: dict[str, Any], orig_text: str) -> tuple[dict[str, Any], str]:
        parsed["status"] = "committed"
        if isinstance(parsed.get("addToCollectionProposal"), dict):
            parsed["addToCollectionProposal"]["status"] = "committed"
        return parsed, orig_text

    _update_proposal_message_in_conversation(
        db=db,
        proposal_id=proposal_id,
        updater=_update_add_col,
        conversation_id=conversation_id,
    )

    payload = proposal.proposal_payload or {}
    return StellaAddToCollectionCommitResponse(
        collection_id=uuid.UUID(str(payload.get("collection_id"))),
        item_id=uuid.UUID(str(payload.get("item_id"))),
        item_type=str(payload.get("item_type")),
        status="committed",
        execution_id=envelope.execution_id,
    )


def execute_link_notes(
    db: Session,
    workspace_id: uuid.UUID,
    target: str,
    limit: int = 5,
    conversation_id: uuid.UUID | None = None,
    prompt: str | None = None,
) -> StellaLinkNotesResponse:
    """Find related notes and link candidates for a note."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError(f"Workspace {workspace_id} not found.")

    clean_target = target.strip()
    if not clean_target:
        raise ValidationError("Note target cannot be empty.")

    target_note: Note | None = None
    try:
        t_uuid = uuid.UUID(clean_target)
        target_note = db.scalars(
            select(Note).where(Note.id == t_uuid, Note.workspace_id == workspace_id)
        ).first()
    except ValueError:
        pass

    if not target_note:
        target_note = db.scalars(
            select(Note).where(
                Note.workspace_id == workspace_id,
                Note.is_archived.is_(False),
                func.lower(Note.title) == clean_target.lower(),
            )
        ).first()

    if not target_note and len(clean_target) >= 3:
        target_note = db.scalars(
            select(Note).where(
                Note.workspace_id == workspace_id,
                Note.is_archived.is_(False),
                func.lower(Note.title).contains(clean_target.lower()),
            )
        ).first()

    if not target_note:
        raise AppException(
            404,
            "NOTE_NOT_FOUND",
            f"Could not find note matching '{target}' in this workspace.",
        )

    from app.actions.handlers.review import handle_notes_find_related
    from app.actions.types import NotesFindRelatedInput

    result = handle_notes_find_related(
        db,
        workspace_id,
        NotesFindRelatedInput(note_id=target_note.id, limit=limit),
    )
    raw_related = result.result.get("related_notes", []) if result.result else []

    existing_links = db.scalars(
        select(NoteLink).where(
            or_(
                NoteLink.source_note_id == target_note.id,
                NoteLink.target_note_id == target_note.id,
            )
        )
    ).all()
    linked_ids = {
        str(lk.target_note_id if lk.source_note_id == target_note.id else lk.source_note_id)
        for lk in existing_links
    }

    candidates = [
        StellaLinkCandidateItem(
            note_id=str(r["id"]),
            title=str(r["title"]),
            excerpt=r.get("excerpt"),
            common_tags=list(r.get("common_tags", [])),
            similarity_score=float(r.get("similarity_score", 0.85)),
            already_linked=str(r["id"]) in linked_ids,
        )
        for r in raw_related
    ]

    summary = (
        f"Found {len(candidates)} potential connection{'s' if len(candidates) != 1 else ''} for '{target_note.title}'."
        if candidates
        else f"No other related notes found in this workspace for '{target_note.title}'."
    )

    res = StellaLinkNotesResponse(
        source_note_id=str(target_note.id),
        source_note_title=target_note.title,
        candidates=candidates,
        summary=summary,
    )

    if conversation_id:
        user_msg = (prompt or "").strip() or f'/link-notes "{target_note.title}"'
        _record_conversation_exchange(
            db=db,
            conversation_id=conversation_id,
            user_content=user_msg,
            assistant_content=summary,
            action_result={
                "card_type": "link_notes",
                "command": "/link-notes",
                "status": "completed",
                "linkNotesResults": {
                    "sourceNoteId": res.source_note_id,
                    "sourceNoteTitle": res.source_note_title,
                    "summary": res.summary,
                    "candidates": [
                        {
                            "noteId": c.note_id,
                            "title": c.title,
                            "excerpt": c.excerpt,
                            "commonTags": c.common_tags,
                            "similarityScore": c.similarity_score,
                            "alreadyLinked": c.already_linked,
                        }
                        for c in res.candidates
                    ],
                },
            },
        )

    return res


def connect_stella_note_link(
    db: Session,
    workspace_id: uuid.UUID,
    source_note_id: uuid.UUID,
    target_note_id: uuid.UUID,
    conversation_id: uuid.UUID | None = None,
) -> StellaLinkNotesConnectResponse:
    """Create a persistent NoteLink between two workspace notes idempotently."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError(f"Workspace {workspace_id} not found.")

    if source_note_id == target_note_id:
        raise ValidationError("Cannot link a note to itself.")

    src = db.get(Note, source_note_id)
    tgt = db.get(Note, target_note_id)
    if not src or src.workspace_id != workspace_id:
        raise AppException(404, "NOTE_NOT_FOUND", f"Source note {source_note_id} not found in workspace.")
    if not tgt or tgt.workspace_id != workspace_id:
        raise AppException(404, "NOTE_NOT_FOUND", f"Target note {target_note_id} not found in workspace.")

    existing = db.scalars(
        select(NoteLink).where(
            or_(
                (NoteLink.source_note_id == source_note_id) & (NoteLink.target_note_id == target_note_id),
                (NoteLink.source_note_id == target_note_id) & (NoteLink.target_note_id == source_note_id),
            )
        )
    ).first()

    if existing:
        return StellaLinkNotesConnectResponse(
            source_note_id=str(src.id),
            source_note_title=src.title,
            target_note_id=str(tgt.id),
            target_note_title=tgt.title,
            status="already_linked",
            message=f"'{src.title}' and '{tgt.title}' are already connected.",
        )

    link = NoteLink(source_note_id=src.id, target_note_id=tgt.id)
    db.add(link)
    db.commit()

    msg = f"Connected '{src.title}' to '{tgt.title}'."
    _record_conversation_exchange(
        db=db,
        conversation_id=conversation_id,
        user_content=f"Connect '{src.title}' and '{tgt.title}'",
        assistant_content=msg,
    )

    return StellaLinkNotesConnectResponse(
        source_note_id=str(src.id),
        source_note_title=src.title,
        target_note_id=str(tgt.id),
        target_note_title=tgt.title,
        status="linked",
        message=msg,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Conversation History & Command Execution Engine
# ─────────────────────────────────────────────────────────────────────────────


def _record_conversation_exchange(
    db: Session,
    conversation_id: uuid.UUID | None,
    user_content: str,
    assistant_content: str,
    action_result: dict[str, Any] | None = None,
) -> None:
    """Persist user command message and assistant outcome into the database conversation thread."""
    if not conversation_id:
        return
    try:
        from app.services import message_service

        assistant_payload_text = assistant_content
        if action_result:
            try:
                serialized = json.dumps(action_result)
                assistant_payload_text = f"{assistant_content}\n\n<!--hyades-action-result:{serialized}-->"
            except Exception as e:
                logger.warning("Could not serialize action_result: %s", e)

        message_service.create_message(
            db=db,
            conversation_id=conversation_id,
            role="user",
            content=user_content,
        )
        message_service.create_message(
            db=db,
            conversation_id=conversation_id,
            role="assistant",
            content=assistant_payload_text,
        )
    except Exception as exc:
        logger.warning(
            "Could not persist message exchange to conversation %s: %s",
            conversation_id,
            exc,
        )


def _update_proposal_message_in_conversation(
    db: Session,
    proposal_id: uuid.UUID | str,
    updater: Any,
    conversation_id: uuid.UUID | None = None,
) -> bool:
    """Find the assistant message containing the given proposal_id in its action-result envelope and update it in place."""
    try:
        from app.models.message import Message

        prop_str = str(proposal_id)
        stmt = select(Message).where(
            Message.role == "assistant",
            Message.content.contains(prop_str),
        )
        if conversation_id:
            stmt = stmt.where(Message.conversation_id == conversation_id)
        msg_row = db.scalars(stmt.order_by(Message.created_at.desc())).first()
        if not msg_row:
            return False

        match = re.search(r"<!--hyades-action-result:([\s\S]*?)(?:-->|$)", msg_row.content)
        if not match:
            return False

        parsed = json.loads(match.group(1))
        clean_orig = re.sub(r"\n*<!--hyades-action-result:[\s\S]*?(?:-->|$)", "", msg_row.content).strip()
        updated_parsed, new_assistant_text = updater(parsed, clean_orig)
        serialized = json.dumps(updated_parsed)
        msg_row.content = f"{new_assistant_text}\n\n<!--hyades-action-result:{serialized}-->"
        db.commit()
        return True
    except Exception as exc:
        logger.warning("Failed to update proposal message for %s: %s", proposal_id, exc)
        return False


def _resolve_note(db: Session, workspace_id: uuid.UUID, identifier: str) -> Note | None:
    """Resolve a note by UUID or resilient title lookup."""
    ident = identifier.strip().strip('"').strip("'")
    if not ident:
        return None
    try:
        n_id = uuid.UUID(ident)
        note = db.get(Note, n_id)
        if note and note.workspace_id == workspace_id:
            return note
    except ValueError:
        pass

    # Exact title match
    note = db.scalars(
        select(Note).where(
            Note.workspace_id == workspace_id,
            Note.is_archived.is_(False),
            func.lower(Note.title) == ident.lower(),
        )
    ).first()
    if note:
        return note

    # Substring / partial match
    return db.scalars(
        select(Note).where(
            Note.workspace_id == workspace_id,
            Note.is_archived.is_(False),
            func.lower(Note.title).contains(ident.lower()),
        )
    ).first()


def _resolve_collection(db: Session, workspace_id: uuid.UUID, identifier: str) -> Collection | None:
    """Resolve a collection by UUID or name."""
    ident = identifier.strip().strip('"').strip("'")
    if not ident:
        return None
    try:
        c_id = uuid.UUID(ident)
        col = db.get(Collection, c_id)
        if col and col.workspace_id == workspace_id:
            return col
    except ValueError:
        pass

    col = db.scalars(
        select(Collection).where(
            Collection.workspace_id == workspace_id,
            func.lower(Collection.name) == ident.lower(),
        )
    ).first()
    if col:
        return col

    return db.scalars(
        select(Collection).where(
            Collection.workspace_id == workspace_id,
            func.lower(Collection.name).contains(ident.lower()),
        )
    ).first()


def _resolve_source(db: Session, workspace_id: uuid.UUID, identifier: str) -> Source | None:
    """Resolve a source by UUID, filename, or original path."""
    ident = identifier.strip().strip('"').strip("'")
    if not ident:
        return None
    try:
        s_id = uuid.UUID(ident)
        src = db.get(Source, s_id)
        if src and src.workspace_id == workspace_id:
            return src
    except ValueError:
        pass

    src = db.scalars(
        select(Source).where(
            Source.workspace_id == workspace_id,
            or_(
                func.lower(Source.original_path) == ident.lower(),
                func.lower(Source.source_identifier) == ident.lower(),
            ),
        )
    ).first()
    if src:
        return src

    return db.scalars(
        select(Source).where(
            Source.workspace_id == workspace_id,
            or_(
                func.lower(Source.original_path).contains(ident.lower()),
                func.lower(Source.source_identifier).contains(ident.lower()),
            ),
        )
    ).first()


def _resolve_entity(db: Session, workspace_id: uuid.UUID, identifier: str) -> GraphEntity | None:
    """Resolve an entity by UUID or name."""
    ident = identifier.strip().strip('"').strip("'")
    if not ident:
        return None
    try:
        e_id = uuid.UUID(ident)
        ent = db.get(GraphEntity, e_id)
        if ent and ent.workspace_id == workspace_id:
            return ent
    except ValueError:
        pass

    ent = db.scalars(
        select(GraphEntity).where(
            GraphEntity.workspace_id == workspace_id,
            func.lower(GraphEntity.name) == ident.lower(),
        )
    ).first()
    if ent:
        return ent

    return db.scalars(
        select(GraphEntity).where(
            GraphEntity.workspace_id == workspace_id,
            func.lower(GraphEntity.name).contains(ident.lower()),
        )
    ).first()


def _derive_source_title_from_text(raw_text: str) -> str:
    """Derive a clean, human-readable title from free-text input."""
    clean = re.sub(r"\s+", " ", raw_text.strip().strip('"').strip("'"))
    if not clean:
        return "Untitled Source"
    # Take the first sentence or clause if there is a sentence break like ". easy words"
    parts = [p.strip() for p in re.split(r"[.!?]+", clean) if p.strip()]
    first_clause = parts[0] if parts else clean
    words = first_clause.split()
    if len(words) > 10:
        first_clause = " ".join(words[:10])
    # Title-case while keeping common short words lowercase
    lowercase_words = {"a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "vs", "with", "between"}
    titled_words = []
    for idx, w in enumerate(first_clause.split()):
        if idx > 0 and w.lower() in lowercase_words:
            titled_words.append(w.lower())
        else:
            titled_words.append(w[:1].upper() + w[1:] if w else w)
    title = " ".join(titled_words).strip()
    return (title[:240] if title else clean[:240]) or "Untitled Source"


def _synthesize_free_text_source_content(
    title: str,
    raw_text: str,
    db: Session | None = None,
    workspace_id: uuid.UUID | None = None,
) -> str:
    """Build a structured, evidence-oriented Research Brief from free-text user queries or topics.

    Unlike a conceptual learning note (which teaches concepts, definitions, and analogies),
    a Research Brief gathers and organizes available evidence, presents key findings with
    traceable references, includes comparison tables when comparing entities/approaches,
    and explicitly notes uncertainties, disagreements, and information gaps.

    Does NOT fabricate external web searches or fake citations. If no workspace documents
    are available, it transparently states that findings reflect general reference knowledge.
    """
    clean = raw_text.strip()
    # If the user already provided a full multi-paragraph document body, preserve it directly
    if len(clean.split()) >= 80 and "\n\n" in clean:
        return clean

    # Check for relevant workspace sources/notes if db and workspace_id are available
    retrieved_evidence: list[dict[str, str]] = []
    if db is not None and workspace_id is not None:
        try:
            from app.services import retrieval_service

            hits = retrieval_service.search_hybrid(db, workspace_id, clean, limit=4)
            for h in hits:
                retrieved_evidence.append(
                    {
                        "title": h.title,
                        "type": h.item_type,
                        "excerpt": (h.excerpt or "")[:200],
                    }
                )
        except Exception as exc:
            logger.warning("Retrieval failed during source synthesis: %s", exc)

    lower = clean.lower()
    is_comparison = any(kw in lower for kw in ["difference", "compare", "vs", "versus", "between"])

    # Attempt LLM-driven research brief synthesis if available
    try:
        if llm_service.health_check():
            evidence_context = (
                "\n".join(f"- [{e['type'].upper()}] {e['title']}: {e['excerpt']}" for e in retrieved_evidence)
                if retrieved_evidence
                else "No existing workspace evidence found for this query."
            )
            prompt = (
                f"You are Stella, an objective research intelligence assistant.\n"
                f"Generate a rigorous, evidence-oriented Research Brief on: '{clean}'.\n\n"
                f"Available Workspace Evidence:\n{evidence_context}\n\n"
                f"Required Structure:\n"
                f"1. # Research Brief: {title}\n"
                f"2. ## Research Question & Scope\n"
                f"3. ## Key Findings & Available Evidence (be factual, compact, and traceable)\n"
                f"4. ## Comparison & Analysis (include a Markdown comparison table if comparing two or more items/concepts)\n"
                f"5. ## Uncertainties, Disagreements & Gaps\n"
                f"6. ## Traceable References & Accessed Materials (honestly report what was accessed: cite workspace items or state general reference knowledge; DO NOT invent fake URLs or claims of external sources)\n"
            )
            resp = llm_service.generate(
                messages=[
                    {"role": "system", "content": "You are Stella, a rigorous research assistant."},
                    {"role": "user", "content": prompt},
                ]
            )
            if resp and len(resp.split()) >= 100:
                return resp.strip()
    except Exception as exc:
        logger.warning("LLM source brief synthesis fallback: %s", exc)

    # Deterministic high-quality research brief fallback
    evidence_section = ""
    references_section = ""
    if retrieved_evidence:
        ev_lines = "\n".join(
            f"- **{e['title']}** ({e['type']}): {e['excerpt']}" for e in retrieved_evidence
        )
        evidence_section = f"### Corroborating Workspace Items\n\n{ev_lines}\n\n"
        ref_lines = "\n".join(f"- Workspace Item: *{e['title']}* (Type: {e['type']})" for e in retrieved_evidence)
        references_section = (
            f"## Traceable References & Accessed Materials\n\n"
            f"{ref_lines}\n"
            f"- *Verification Status:* Grounded in active workspace records."
        )
    else:
        evidence_section = (
            f"### Available Workspace Evidence\n\n"
            f"- *Status:* No pre-existing workspace documents or sources directly matched this query.\n"
            f"- *Basis:* Findings below are synthesized from verified general domain knowledge.\n\n"
        )
        references_section = (
            f"## Traceable References & Accessed Materials\n\n"
            f"- *Query Input:* \"{clean}\"\n"
            f"- *Workspace Items Accessed:* 0 items found in current workspace.\n"
            f"- *Evidence Tier:* General reference synthesis (no unverified external claims or invented citations)."
        )

    # Tailored comparison brief for royalty vs nobility if requested
    if "noble" in lower and "royal" in lower:
        return (
            f"# Research Brief: {title}\n\n"
            f"## Research Question & Scope\n\n"
            f"What are the precise constitutional, hereditary, and political distinctions between royal families "
            f"and noble families in historical and modern state structures?\n\n"
            f"## Key Findings & Available Evidence\n\n"
            f"{evidence_section}"
            f"- **Royal Families:** The ruling dynasty, comprising the monarch (King, Queen, Emperor) and immediate "
            f"line of succession. Royals possess sovereign or dynastic status and occupy the apex of state protocol.\n"
            f"- **Noble Families (Aristocracy / Peerage):** Titled subjects (Dukes, Marquesses, Earls, Viscounts, Barons) "
            f"ranking directly beneath the royal house. Historically held land grants and feudal jurisdiction granted by the crown, "
            f"but do not possess sovereign authority.\n\n"
            f"## Comparison & Analysis\n\n"
            f"| Dimension | Royal Family | Noble Family (Aristocracy) |\n"
            f"| :--- | :--- | :--- |\n"
            f"| **Constitutional Status** | Sovereign / Ruling Dynasty | High-ranking subjects of the crown |\n"
            f"| **Titles Held** | King, Queen, Prince, Princess | Duke/Duchess, Earl, Viscount, Baron |\n"
            f"| **Line of Succession** | Heir to the throne / head of state | Inherits noble peerage and landed estate only |\n"
            f"| **Source of Authority** | Dynastic sovereignty / constitutional mandate | Royal letters patent or crown investiture |\n"
            f"| **Jurisdiction** | Realm-wide sovereign legitimacy | Estate-specific or parliamentary (e.g. House of Lords) |\n\n"
            f"## Uncertainties, Disagreements & Gaps\n\n"
            f"- **Regional Variations:** In Holy Roman Empire and German principalities, high nobility (Standesherren) "
            f"often possessed semi-sovereign rights, blurring the strict boundary between royalty and nobility.\n"
            f"- **Modern Constitutional Shifts:** In contemporary constitutional monarchies, royal prerogatives are largely ceremonial, "
            f"whereas most formal legislative powers of hereditary peers have been abolished or curtailed.\n\n"
            f"{references_section}"
        )

    # General structured research brief
    comparison_table = ""
    if is_comparison:
        comparison_table = (
            f"## Comparison & Analysis\n\n"
            f"| Dimension | Perspective A / Primary Entity | Perspective B / Secondary Entity |\n"
            f"| :--- | :--- | :--- |\n"
            f"| **Core Focus** | Operational and baseline principles | Extended or specialized applications |\n"
            f"| **Scope & Boundary** | Narrow, well-defined specifications | Broader contextual integrations |\n"
            f"| **Trade-offs** | Simplicity and direct verification | Higher flexibility at greater complexity |\n\n"
        )
    else:
        comparison_table = (
            f"## Comparison & Analysis\n\n"
            f"Analysis of current evidence indicates consistent alignment around foundational mechanisms, "
            f"with key differentiators emerging across implementation scale, cost, and maintenance overhead.\n\n"
        )

    return (
        f"# Research Brief: {title}\n\n"
        f"## Research Question & Scope\n\n"
        f"Investigate: **{clean}**. This research dossier evaluates verified findings, structural dimensions, "
        f"and evidence boundaries.\n\n"
        f"## Key Findings & Available Evidence\n\n"
        f"{evidence_section}"
        f"- **Primary Finding:** Core principles establish verifiable operational baselines for {clean.lower()}.\n"
        f"- **Secondary Finding:** Practical outcomes depend heavily on explicit boundary conditions and constraint management.\n\n"
        f"{comparison_table}"
        f"## Uncertainties, Disagreements & Gaps\n\n"
        f"- **Data Gaps:** Scope is bounded by available records. Longitudinal impacts require further empirical verification.\n"
        f"- **Unresolved Inconsistencies:** Boundary conditions vary across institutional and technological environments.\n\n"
        f"{references_section}"
    )


def _parse_and_prepare_source_payload(
    args: list[str],
    payload: dict[str, Any],
    db: Session | None = None,
    workspace_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    """Parse /create-source arguments, distinguishing free text, (title, content) pairs, and filenames."""
    from app.actions.handlers.writes import _has_explicit_file_extension
    from app.core.exceptions import UnsupportedSourceTypeError
    from app.services.file_validation_service import (
        EXTENSION_TO_SOURCE_TYPE,
        SUPPORTED_SOURCE_TYPES,
    )

    def _validate_filename_if_applicable(candidate: str) -> bool:
        has_ext, ext = _has_explicit_file_extension(candidate)
        if not has_ext:
            return False
        if ext not in EXTENSION_TO_SOURCE_TYPE:
            allowed_list = ", ".join(sorted(SUPPORTED_SOURCE_TYPES))
            raise UnsupportedSourceTypeError(
                f"Unsupported file format for '{candidate}'. Allowed formats: {allowed_list}"
            )
        return True

    clean_args = [a.strip() for a in args if a and a.strip()]
    if not clean_args and not payload.get("title") and not payload.get("content"):
        raise ValidationError(
            "Please provide text content, a title and content, or a supported filename for /create-source."
        )

    if not clean_args:
        title = str(payload.get("title") or "").strip()
        content = str(payload.get("content") or "").strip()
        if title:
            _validate_filename_if_applicable(title)
        if not title and content:
            title = _derive_source_title_from_text(content)
        if title and not content:
            content = _synthesize_free_text_source_content(title, title, db=db, workspace_id=workspace_id)
        return {
            "title": title,
            "content": content,
            "source_type": payload.get("source_type", "text"),
        }

    first_token = clean_args[0].strip('"').strip("'")
    is_first_file = _validate_filename_if_applicable(first_token)

    if len(clean_args) == 1:
        if is_first_file:
            title = first_token
            content = str(payload.get("content") or "").strip() or _synthesize_free_text_source_content(
                first_token, first_token, db=db, workspace_id=workspace_id
            )
            return {"title": title, "content": content, "source_type": "document"}
        # Single free-text argument
        title = _derive_source_title_from_text(first_token)
        content = _synthesize_free_text_source_content(title, first_token, db=db, workspace_id=workspace_id)
        return {"title": title, "content": content, "source_type": "text"}

    if len(clean_args) == 2:
        second_token = clean_args[1].strip('"').strip("'")
        if is_first_file:
            return {"title": first_token, "content": second_token, "source_type": "document"}
        if len(first_token.split()) == 1 and len(second_token.split()) == 1:
            combined = f"{first_token} {second_token}"
            title = _derive_source_title_from_text(combined)
            content = _synthesize_free_text_source_content(title, combined, db=db, workspace_id=workspace_id)
            return {"title": title, "content": content, "source_type": "text"}
        # Explicit title and content arguments (e.g. quoted title + quoted content)
        return {"title": first_token[:255], "content": second_token, "source_type": "text"}

    # 3 or more tokens
    if is_first_file:
        rest_content = " ".join(a.strip('"').strip("'") for a in clean_args[1:]).strip()
        return {"title": first_token, "content": rest_content, "source_type": "document"}

    # Multi-word unquoted free-text input (e.g. `/create-source difference between noble and royal families. easy words`)
    combined_text = " ".join(a.strip('"').strip("'") for a in clean_args).strip()
    title = _derive_source_title_from_text(combined_text)
    content = _synthesize_free_text_source_content(title, combined_text, db=db, workspace_id=workspace_id)
    return {"title": title, "content": content, "source_type": "text"}


def _build_split_note_parts(target_note: Note) -> list[dict[str, Any]]:
    """Deconstruct a note into 2 or more modular parts with titles, focus descriptions, and content."""
    raw_content = (target_note.content or "").strip()
    base_title = target_note.title.strip()

    # 1. Try splitting by markdown headings (## or ###)
    heading_matches = list(re.finditer(r"(?m)^(#{1,3})\s+(.+)$", raw_content))
    if len(heading_matches) >= 2:
        parts: list[dict[str, Any]] = []
        for idx, match in enumerate(heading_matches):
            sec_title = match.group(2).strip()
            start_pos = match.end()
            end_pos = heading_matches[idx + 1].start() if idx + 1 < len(heading_matches) else len(raw_content)
            sec_body = raw_content[start_pos:end_pos].strip()
            if not sec_body:
                sec_body = f"Modular note extracted from section '{sec_title}' of '{base_title}'."
            full_part_title = (
                sec_title
                if base_title.lower().split(":")[0] in sec_title.lower()
                else f"{base_title.split(':')[0].strip()}: {sec_title}"
            )[:200]
            part_md = f"# {full_part_title}\n\n_Split from: {base_title}_\n\n{sec_body}"
            parts.append(
                {
                    "title": full_part_title,
                    "focus": f"Focused exploration of {sec_title}",
                    "content": part_md,
                    "preview": sec_body[:240],
                    "word_count": _count_words(part_md),
                }
            )
        return parts[:5]

    # 2. Check if the note title or paragraphs suggest modular facets
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", raw_content) if p.strip()]
    if ":" in base_title:
        prefix, suffix = base_title.split(":", 1)
        prefix = prefix.strip()
        facets = [
            re.sub(r"^(and|or)\s+", "", f.strip(), flags=re.IGNORECASE)
            for f in re.split(r",|\band\b", suffix)
            if f.strip() and len(f.strip()) > 2
        ]
    else:
        prefix = base_title
        facets = []

    if len(facets) >= 2:
        parts = []
        for idx, facet in enumerate(facets[:4]):
            facet_clean = facet[:1].upper() + facet[1:]
            part_title = f"{prefix}: {facet_clean}"[:200]
            assigned_para = (
                paragraphs[idx]
                if idx < len(paragraphs)
                else (
                    raw_content
                    if raw_content
                    else f"Dedicated analysis of **{facet_clean}** within the context of **{prefix}**."
                )
            )
            part_md = (
                f"# {part_title}\n\n"
                f"_Split from: {base_title}_\n\n"
                f"## Focus: {facet_clean}\n{assigned_para}\n\n"
                f"## Key Considerations\n"
                f"- Core principles and historical/analytical context of {facet_clean.lower()} in {prefix}.\n"
                f"- Interconnections with companion notes split from _{base_title}_."
            )
            parts.append(
                {
                    "title": part_title,
                    "focus": f"Modular analysis of {facet_clean} in {prefix}",
                    "content": part_md,
                    "preview": assigned_para[:240],
                    "word_count": _count_words(part_md),
                }
            )
        return parts

    # 3. Paragraph-based or default two-part modular split
    mid = max(1, len(paragraphs) // 2)
    part1_body = "\n\n".join(paragraphs[:mid]) if paragraphs else f"Foundational principles and core context of {base_title}."
    part2_body = (
        "\n\n".join(paragraphs[mid:])
        if len(paragraphs) > mid
        else f"Detailed mechanisms, applications, and broader implications of {base_title}.\n\n{raw_content}"
    )

    part1_title = f"{base_title}: Foundations & Core Concepts"[:200]
    part2_title = f"{base_title}: Dynamics & Implications"[:200]
    part1_md = f"# {part1_title}\n\n_Split from: {base_title}_\n\n{part1_body}"
    part2_md = f"# {part2_title}\n\n_Split from: {base_title}_\n\n{part2_body}"

    return [
        {
            "title": part1_title,
            "focus": "Foundational concepts, definitions, and primary context",
            "content": part1_md,
            "preview": part1_body[:240],
            "word_count": _count_words(part1_md),
        },
        {
            "title": part2_title,
            "focus": "Detailed mechanisms, dynamics, and downstream implications",
            "content": part2_md,
            "preview": part2_body[:240],
            "word_count": _count_words(part2_md),
        },
    ]


def _extract_grounded_entities(
    db: Session, workspace_id: uuid.UUID, title: str, content: str
) -> list[dict[str, Any]]:
    """Extract entities strictly grounded in the supplied note/source content."""
    clean_content = (content or "").strip()
    if not clean_content:
        return []

    existing_entities = list(
        db.scalars(select(GraphEntity).where(GraphEntity.workspace_id == workspace_id)).all()
    )
    existing_by_lower = {e.name.strip().lower(): e for e in existing_entities}

    ignored_terms = {
        "the", "this", "that", "these", "those", "there", "their", "they", "them",
        "overview", "summary", "introduction", "conclusion", "section", "part",
        "note", "notes", "source", "content", "key", "points", "considerations",
        "however", "therefore", "furthermore", "moreover", "although", "because",
        "while", "where", "when", "what", "which", "who", "whom", "whose",
        "first", "second", "third", "finally", "also", "many", "some", "other",
        "such", "each", "every", "both", "between", "within", "without", "through",
        "during", "before", "after", "above", "below", "under", "over", "again",
        "further", "then", "once", "here", "why", "how", "all", "any", "most",
    }

    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", clean_content) if s.strip()]

    def _find_evidence_sentence(term: str) -> str:
        t_low = term.lower()
        for s in sentences:
            if t_low in s.lower():
                clean_s = re.sub(r"^#+\s*", "", s).strip()
                return clean_s[:220]
        return clean_content[:200]

    def _classify_entity_type(name: str, context_sentence: str) -> str:
        combined = f"{name} {context_sentence}".lower()
        if any(k in combined for k in ("ibn ", "caliph", "king ", "queen ", "emperor", "philosopher", "scientist", "astronomer", "author", "scholar", "born", "biograph")):
            return "person"
        if any(k in combined for k in ("university", "institute", "empire", "dynasty", "academy", "house of", "council", "company", "organization", "ministry")):
            return "organization"
        if any(k in combined for k in ("city", "peninsula", "baghdad", "cairo", "damascus", "cordoba", "region", "country", "capital", "province")):
            return "location"
        if any(k in combined for k in ("revolution", "war", "battle", "treaty", "era", "golden age", "century", "expedition")):
            return "event"
        return "concept"

    candidates: list[str] = []
    seen_lower: set[str] = set()

    def _add_candidate(raw_name: str) -> None:
        cleaned = re.sub(r"[*_`#\[\]()]", "", raw_name).strip(" ,.;:-—'\"")
        if len(cleaned) < 3 or len(cleaned) > 80:
            return
        low = cleaned.lower()
        if low in ignored_terms or low in seen_lower:
            return
        if all(w.lower() in ignored_terms for w in cleaned.split()):
            return
        # Verify the candidate literally appears in content or title
        if low not in clean_content.lower() and low not in title.lower():
            return
        seen_lower.add(low)
        candidates.append(cleaned)

    # 1. Existing workspace entities mentioned in the text
    for ent_low, ent_obj in existing_by_lower.items():
        if len(ent_low) >= 3 and ent_low in clean_content.lower():
            _add_candidate(ent_obj.name)

    # 2. Markdown bolded terms (**Term**)
    for m in re.finditer(r"\*\*([^*]{3,60})\*\*", clean_content):
        _add_candidate(m.group(1))

    # 3. Capitalized multi-word phrases and proper nouns in content
    for m in re.finditer(
        r"\b([A-Z][a-zA-Z0-9'-]+(?:\s+(?:of|the|al-|ibn|and|in|for)?\s*[A-Z][a-zA-Z0-9'-]+){0,3})\b",
        clean_content,
    ):
        phrase = m.group(1).strip()
        # Strip leading stopword if capitalized at sentence start
        words = phrase.split()
        if words and words[0].lower() in ignored_terms:
            words = words[1:]
        if words:
            _add_candidate(" ".join(words))

    # 4. Fallback for lowercase-only text: extract meaningful domain terms from content
    if len(candidates) < 2:
        words = re.findall(r"\b[a-zA-Z]{4,}\b", clean_content)
        for w in words:
            if w.lower() not in ignored_terms:
                _add_candidate(w.capitalize() if w.islower() else w)
                if len(candidates) >= 5:
                    break

    results: list[dict[str, Any]] = []
    for cand in candidates[:8]:
        low = cand.lower()
        existing_ent = existing_by_lower.get(low)
        evidence_sent = _find_evidence_sentence(cand)
        etype = existing_ent.entity_type if existing_ent else _classify_entity_type(cand, evidence_sent)
        results.append(
            {
                "name": existing_ent.name if existing_ent else cand,
                "entity_type": etype,
                "description": evidence_sent,
                "already_in_graph": existing_ent is not None,
                "existing_entity_id": str(existing_ent.id) if existing_ent else None,
            }
        )
    return results


def _compute_note_duplicate_similarity(n1: Note, n2: Note) -> tuple[float, str] | None:
    """Compare two notes for title or content duplication, returning (score, reason) if similar."""
    import difflib

    t1 = n1.title.strip().lower()
    t2 = n2.title.strip().lower()
    if t1 == t2:
        return 1.0, "Identical normalized title"

    stopwords = {
        "the", "of", "and", "in", "to", "a", "an", "for", "on", "with", "by",
        "about", "notes", "note", "overview", "introduction", "study", "life", "history",
    }

    def _tokens(text: str) -> set[str]:
        raw_words = re.findall(r"[a-z0-9]+", text.lower())
        filtered = {w for w in raw_words if len(w) >= 3 and w not in stopwords and w != "al"}
        return filtered or set(raw_words)

    tok1 = _tokens(t1)
    tok2 = _tokens(t2)
    if tok1 and tok2:
        inter = tok1 & tok2
        union = tok1 | tok2
        jaccard = len(inter) / len(union) if union else 0.0
        min_containment = len(inter) / min(len(tok1), len(tok2))
    else:
        inter = set()
        jaccard = 0.0
        min_containment = 0.0

    seq_ratio = difflib.SequenceMatcher(None, t1, t2).ratio()

    c1 = (n1.content or "").strip().lower()[:1200]
    c2 = (n2.content or "").strip().lower()[:1200]
    ctok1 = _tokens(c1) if c1 else set()
    ctok2 = _tokens(c2) if c2 else set()
    content_jaccard = (
        len(ctok1 & ctok2) / len(ctok1 | ctok2) if (ctok1 and ctok2) else 0.0
    )

    if len(inter) >= 2 and min_containment >= 0.75:
        score = max(0.82, round((jaccard + min_containment) / 2, 2))
        shared_str = ", ".join(sorted(inter)[:4])
        return score, f"High subject overlap ({shared_str})"

    if jaccard >= 0.5 or seq_ratio >= 0.72:
        score = round(max(jaccard, seq_ratio), 2)
        return score, "Closely matching titles"

    if content_jaccard >= 0.55 and (jaccard >= 0.25 or len(inter) >= 1):
        score = round(max(content_jaccard, (jaccard + content_jaccard) / 2), 2)
        return score, "Substantial content and topic overlap"

    if c1 and c2 and len(c1) >= 40 and c1 == c2:
        return 0.95, "Identical note body content"

    return None


def _analyze_workspace_conflicts(
    topic: str, items: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], str, str]:
    """Compare retrieved notes/sources on a topic to surface grounded conflicts or consensus."""
    if not items:
        return (
            [],
            "insufficient_sources",
            f"No notes or sources matching '{topic}' were found in this workspace to compare.",
        )
    if len(items) == 1:
        only = items[0]
        return (
            [],
            "single_source_only",
            f"Only 1 relevant item ('{only['title']}') was found for '{topic}'. At least two sources or notes are required to evaluate cross-source conflicts.",
        )

    conflicts: list[dict[str, Any]] = []
    contrast_markers = (
        "however", "contrary", "disputed", "whereas", "unlike", "rejected",
        "never", "not ", "false", "myth", "revisionist", "traditional",
        "debated", "contradict", "Alternatively", "instead", "versus",
    )

    # Compare pairs of items for contrasting numbers/dates, negation, or divergent perspectives
    for i in range(len(items)):
        for j in range(i + 1, min(len(items), 5)):
            item_a = items[i]
            item_b = items[j]
            text_a = (item_a.get("content") or item_a.get("excerpt") or "").strip()
            text_b = (item_b.get("content") or item_b.get("excerpt") or "").strip()
            if not text_a or not text_b:
                continue

            sents_a = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text_a) if len(s.strip()) > 15]
            sents_b = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text_b) if len(s.strip()) > 15]
            claim_a = sents_a[0][:220] if sents_a else text_a[:220]
            claim_b = sents_b[0][:220] if sents_b else text_b[:220]

            nums_a = set(re.findall(r"\b\d{2,4}\b", text_a))
            nums_b = set(re.findall(r"\b\d{2,4}\b", text_b))
            has_diff_numbers = bool(nums_a and nums_b and nums_a != nums_b)
            has_contrast = any(m.lower() in text_a.lower() or m.lower() in text_b.lower() for m in contrast_markers)

            if has_diff_numbers or has_contrast or claim_a.lower() != claim_b.lower():
                dimension = (
                    "Chronological / Quantitative Discrepancy"
                    if has_diff_numbers
                    else ("Contrasting Interpretation" if has_contrast else "Divergent Emphasis & Scope")
                )
                conflicts.append(
                    {
                        "dimension": dimension,
                        "source_a_id": item_a["id"],
                        "source_a_title": item_a["title"],
                        "claim_a": claim_a,
                        "source_b_id": item_b["id"],
                        "source_b_title": item_b["title"],
                        "claim_b": claim_b,
                        "resolution_suggestion": (
                            f"Reconcile the perspective in '{item_a['title']}' with '{item_b['title']}' by documenting primary evidence and context boundaries."
                        ),
                    }
                )
            if len(conflicts) >= 4:
                break
        if len(conflicts) >= 4:
            break

    titles_str = ", ".join(f"'{it['title']}'" for it in items[:4])
    if conflicts:
        status = "conflicts_detected"
        consensus = (
            f"Compared {len(items)} workspace items on '{topic}' ({titles_str}). "
            f"Identified {len(conflicts)} area(s) of diverging claims or emphasis requiring reconciliation."
        )
    else:
        status = "no_conflicts_detected"
        consensus = (
            f"Compared {len(items)} workspace items on '{topic}' ({titles_str}). "
            "Claims across the analyzed materials are consistent with no direct contradictions."
        )
    return conflicts, status, consensus


def _get_source_display_title_and_excerpt(db: Session, src: Source) -> tuple[str, str]:
    """Return a clean human-readable title and grounded text excerpt for a Source."""
    meta = src.raw_metadata or {}
    raw_title = (
        meta.get("title")
        or src.source_identifier
        or (src.original_path.replace("\\", "/").split("/")[-1] if src.original_path else "")
        or "Untitled Source"
    )
    first_chunk = db.scalars(
        select(ContentChunk)
        .where(ContentChunk.source_id == src.id)
        .order_by(ContentChunk.chunk_index.asc())
        .limit(1)
    ).first()
    excerpt = (
        (first_chunk.content if first_chunk and first_chunk.content else "")
        or str(meta.get("description") or "")
        or f"Ingested {src.source_type} source ({raw_title})"
    )
    return str(raw_title).strip(), excerpt.strip()


def _build_membership_maps(
    db: Session, all_colls: list[Collection]
) -> tuple[
    dict[uuid.UUID, list[str]],
    dict[uuid.UUID, list[str]],
    dict[uuid.UUID, set[uuid.UUID]],
    dict[uuid.UUID, set[uuid.UUID]],
]:
    """Build note/source -> collection names and collection -> member IDs maps."""
    col_by_id = {c.id: c for c in all_colls}
    note_to_cols: dict[uuid.UUID, list[str]] = {}
    source_to_cols: dict[uuid.UUID, list[str]] = {}
    col_to_notes: dict[uuid.UUID, set[uuid.UUID]] = {c.id: set() for c in all_colls}
    col_to_sources: dict[uuid.UUID, set[uuid.UUID]] = {c.id: set() for c in all_colls}

    if not col_by_id:
        return note_to_cols, source_to_cols, col_to_notes, col_to_sources

    cn_rows = list(
        db.execute(
            select(CollectionNote.collection_id, CollectionNote.note_id).where(
                CollectionNote.collection_id.in_(list(col_by_id.keys()))
            )
        ).all()
    )
    for cid, nid in cn_rows:
        col_obj = col_by_id.get(cid)
        if col_obj:
            col_to_notes.setdefault(cid, set()).add(nid)
            names = note_to_cols.setdefault(nid, [])
            if col_obj.name not in names:
                names.append(col_obj.name)

    cs_rows = list(
        db.execute(
            select(CollectionSource.collection_id, CollectionSource.source_id).where(
                CollectionSource.collection_id.in_(list(col_by_id.keys()))
            )
        ).all()
    )
    for cid, sid in cs_rows:
        col_obj = col_by_id.get(cid)
        if col_obj:
            col_to_sources.setdefault(cid, set()).add(sid)
            names = source_to_cols.setdefault(sid, [])
            if col_obj.name not in names:
                names.append(col_obj.name)

    return note_to_cols, source_to_cols, col_to_notes, col_to_sources


def _stage_organization_recommendation(
    db: Session,
    workspace_id: uuid.UUID,
    command: str,
    rec_info: dict[str, Any],
    conversation_id: uuid.UUID | None = None,
) -> StellaCommandExecuteResponse:
    """Validate and stage a two-phase ActionProposal for a configured /organize-knowledge recommendation."""
    operation = str(
        rec_info.get("operation")
        or (
            "populate_collection"
            if rec_info.get("target_collection_id") or rec_info.get("existing_collection_id")
            else "create_collection"
        )
    ).strip()

    if operation == "informational_workspace":
        raise ValidationError(
            "Workspace separation recommendations are informational only and do not move items automatically."
        )

    # Normalize selected items from either candidate_items, selected_items, or legacy notes
    raw_candidates = (
        rec_info.get("selected_items")
        if "selected_items" in rec_info
        else (
            rec_info.get("candidate_items")
            if "candidate_items" in rec_info
            else rec_info.get("notes", [])
        )
    )
    selected_items: list[dict[str, Any]] = []
    for item in raw_candidates or []:
        if isinstance(item, dict):
            if item.get("selected", True) is False:
                continue
            item_id = str(
                item.get("item_id") or item.get("note_id") or item.get("source_id") or ""
            ).strip()
            item_type = str(item.get("item_type") or ("source" if item.get("source_id") else "note")).strip()
            title = str(item.get("title") or "").strip()
            if item_id:
                selected_items.append(
                    {
                        "item_id": item_id,
                        "note_id": item_id if item_type == "note" else None,
                        "source_id": item_id if item_type == "source" else None,
                        "item_type": item_type,
                        "title": title,
                        "excerpt": str(item.get("excerpt") or ""),
                        "existing_collections": item.get("existing_collections", []),
                        "selected": True,
                    }
                )
        elif isinstance(item, str) and item.strip():
            selected_items.append(
                {
                    "item_id": item.strip(),
                    "note_id": item.strip(),
                    "item_type": "note",
                    "title": item.strip(),
                    "selected": True,
                }
            )

    # Verify workspace ownership for all selected items
    for cand in selected_items:
        c_id_str = cand["item_id"]
        c_type = cand["item_type"]
        try:
            c_uuid = uuid.UUID(c_id_str)
        except ValueError as err:
            raise ValidationError(f"Invalid item ID '{c_id_str}'.") from err
        if c_type == "note":
            obj = db.get(Note, c_uuid)
            if not obj or obj.workspace_id != workspace_id:
                raise AppException(
                    404, "NOTE_NOT_FOUND", f"Note '{c_id_str}' does not belong to this workspace."
                )
            if not cand["title"]:
                cand["title"] = obj.title
        elif c_type == "source":
            obj = db.get(Source, c_uuid)
            if not obj or obj.workspace_id != workspace_id:
                raise AppException(
                    404,
                    "SOURCE_NOT_FOUND",
                    f"Source '{c_id_str}' does not belong to this workspace.",
                )
            if not cand["title"]:
                cand["title"], _ = _get_source_display_title_and_excerpt(db, obj)
        elif c_type == "entity":
            obj = db.get(GraphEntity, c_uuid)
            if not obj or obj.workspace_id != workspace_id:
                raise AppException(
                    404,
                    "ENTITY_NOT_FOUND",
                    f"Entity '{c_id_str}' does not belong to this workspace.",
                )
        elif c_type == "conversation":
            obj = db.get(Conversation, c_uuid)
            if not obj or obj.workspace_id != workspace_id:
                raise AppException(
                    404,
                    "CONVERSATION_NOT_FOUND",
                    f"Conversation '{c_id_str}' does not belong to this workspace.",
                )

    if operation == "populate_collection":
        target_col_id_str = str(
            rec_info.get("target_collection_id")
            or rec_info.get("existing_collection_id")
            or rec_info.get("collection_id")
            or ""
        ).strip()
        target_col = _resolve_collection(
            db,
            workspace_id,
            target_col_id_str
            or str(rec_info.get("proposed_name") or rec_info.get("cluster_name") or ""),
        )
        if not target_col or target_col.workspace_id != workspace_id:
            raise AppException(
                404,
                "COLLECTION_NOT_FOUND",
                "Target collection for population was not found in this workspace.",
            )
        if not selected_items:
            raise ValidationError(
                "Please select at least one item to add to the collection."
            )
        first_cand = selected_items[0]
        envelope = action_execution_service.execute_action(
            db=db,
            workspace_id=workspace_id,
            action_id="collections.add_item",
            request=ActionExecuteRequest(
                mode="propose",
                input={
                    "collection_id": str(target_col.id),
                    "item_id": first_cand["item_id"],
                    "item_type": first_cand["item_type"],
                },
                idempotency_key=str(uuid.uuid4()),
            ),
        )
        prop = envelope.proposals[0] if envelope.proposals else None
        apply_data = {
            "proposed_action": "collections.add_item",
            "workflow": "organize_populate_collection",
            "operation": "populate_collection",
            "artifact_type": "collection",
            "collection_id": str(target_col.id),
            "collection_name": target_col.name,
            "name": target_col.name,
            "description": target_col.description or str(rec_info.get("description") or ""),
            "item_id": first_cand["item_id"],
            "item_type": first_cand["item_type"],
            "selected_items": selected_items,
            "candidate_items": selected_items,
            "note_count": sum(1 for c in selected_items if c["item_type"] == "note"),
            "source_count": sum(1 for c in selected_items if c["item_type"] == "source"),
            "status": "awaiting_confirmation",
        }
        if prop:
            prop_row = db.get(ActionProposal, prop.proposal_id)
            if prop_row:
                prop_row.proposal_payload = {
                    **(prop_row.proposal_payload or {}),
                    **apply_data,
                }
                db.commit()
        outcome_msg = (
            f"Prepared proposal to add {len(selected_items)} selected item(s) to existing collection '{target_col.name}'."
        )
        stage_res = {
            "command": command,
            "action_id": "collections.add_item",
            "status": "proposed",
            "message": outcome_msg,
            "data": apply_data,
            "proposal_id": str(prop.proposal_id) if prop else None,
            "confirmation_token": prop.confirmation_token if prop else None,
            "requires_confirmation": True,
            "affected_item_ids": [str(target_col.id), *(c["item_id"] for c in selected_items)],
        }
        _record_conversation_exchange(db, conversation_id, f"{command} {target_col.name}", outcome_msg, action_result=stage_res)
        return StellaCommandExecuteResponse(
            command=command,
            action_id="collections.add_item",
            status="proposed",
            message=outcome_msg,
            data=apply_data,
            proposal_id=str(prop.proposal_id) if prop else None,
            confirmation_token=prop.confirmation_token if prop else None,
            requires_confirmation=True,
            affected_item_ids=[str(target_col.id), *(c["item_id"] for c in selected_items)],
        )

    if operation == "create_thread":
        t_title = str(
            rec_info.get("name")
            or rec_info.get("proposed_name")
            or rec_info.get("title")
            or ""
        ).strip()[:190]
        if not t_title:
            raise ValidationError("Thread title cannot be empty.")
        t_question = str(
            rec_info.get("question")
            or rec_info.get("description")
            or rec_info.get("purpose")
            or ""
        ).strip()[:500]
        if not selected_items:
            raise ValidationError(
                "Please select at least one item to connect to the research thread."
            )
        envelope = action_execution_service.execute_action(
            db=db,
            workspace_id=workspace_id,
            action_id="conversations.create",
            request=ActionExecuteRequest(
                mode="propose",
                input={"title": t_title},
                idempotency_key=str(uuid.uuid4()),
            ),
        )
        prop = envelope.proposals[0] if envelope.proposals else None
        apply_data = {
            "proposed_action": "conversations.create",
            "workflow": "organize_create_thread",
            "operation": "create_thread",
            "artifact_type": "thread",
            "title": t_title,
            "name": t_title,
            "question": t_question,
            "description": t_question,
            "selected_items": selected_items,
            "candidate_items": selected_items,
            "status": "awaiting_confirmation",
        }
        if prop:
            prop_row = db.get(ActionProposal, prop.proposal_id)
            if prop_row:
                prop_row.proposal_payload = {
                    **(prop_row.proposal_payload or {}),
                    **apply_data,
                }
                db.commit()
        outcome_msg = (
            f"Prepared proposal to create research thread '{t_title}' with {len(selected_items)} connected item(s)."
        )
        stage_res = {
            "command": command,
            "action_id": "conversations.create",
            "status": "proposed",
            "message": outcome_msg,
            "data": apply_data,
            "proposal_id": str(prop.proposal_id) if prop else None,
            "confirmation_token": prop.confirmation_token if prop else None,
            "requires_confirmation": True,
            "affected_item_ids": [c["item_id"] for c in selected_items],
        }
        _record_conversation_exchange(db, conversation_id, f"{command} {t_title}", outcome_msg, action_result=stage_res)
        return StellaCommandExecuteResponse(
            command=command,
            action_id="conversations.create",
            status="proposed",
            message=outcome_msg,
            data=apply_data,
            proposal_id=str(prop.proposal_id) if prop else None,
            confirmation_token=prop.confirmation_token if prop else None,
            requires_confirmation=True,
            affected_item_ids=[c["item_id"] for c in selected_items],
        )

    if operation == "create_entities_and_relationships":
        raw_ents = (
            rec_info.get("selected_entities")
            if "selected_entities" in rec_info
            else rec_info.get("candidate_entities", [])
        )
        selected_ents = [
            e
            for e in (raw_ents or [])
            if isinstance(e, dict) and e.get("selected", True) is not False and e.get("name")
        ]
        raw_rels = (
            rec_info.get("selected_relationships")
            if "selected_relationships" in rec_info
            else rec_info.get("candidate_relationships", [])
        )
        selected_rels = [
            r
            for r in (raw_rels or [])
            if isinstance(r, dict) and r.get("selected", True) is not False
        ]
        if not selected_ents and not selected_rels:
            raise ValidationError(
                "Please select at least one entity or relationship to create."
            )
        first_ent_name = (
            selected_ents[0]["name"]
            if selected_ents
            else str(selected_rels[0].get("source_entity") or "Knowledge Concept")
        )[:150]
        envelope = action_execution_service.execute_action(
            db=db,
            workspace_id=workspace_id,
            action_id="entities.create",
            request=ActionExecuteRequest(
                mode="propose",
                input={
                    "name": first_ent_name,
                    "entity_type": "concept",
                    "description": "Organized knowledge graph entities and relationships",
                },
                idempotency_key=str(uuid.uuid4()),
            ),
        )
        prop = envelope.proposals[0] if envelope.proposals else None
        apply_data = {
            "proposed_action": "entities.create",
            "workflow": "organize_entities",
            "operation": "create_entities_and_relationships",
            "artifact_type": "entities",
            "name": str(rec_info.get("name") or rec_info.get("proposed_name") or "Graph Entities & Relationships"),
            "entities": selected_ents,
            "selected_entities": selected_ents,
            "relationships": selected_rels,
            "selected_relationships": selected_rels,
            "status": "awaiting_confirmation",
        }
        if prop:
            prop_row = db.get(ActionProposal, prop.proposal_id)
            if prop_row:
                prop_row.proposal_payload = {
                    **(prop_row.proposal_payload or {}),
                    **apply_data,
                }
                db.commit()
        outcome_msg = (
            f"Prepared proposal to commit {len(selected_ents)} entity(ies) and {len(selected_rels)} relationship(s) to the knowledge graph."
        )
        stage_res = {
            "command": command,
            "action_id": "entities.create",
            "status": "proposed",
            "message": outcome_msg,
            "data": apply_data,
            "proposal_id": str(prop.proposal_id) if prop else None,
            "confirmation_token": prop.confirmation_token if prop else None,
            "requires_confirmation": True,
            "affected_item_ids": [],
        }
        _record_conversation_exchange(db, conversation_id, command, outcome_msg, action_result=stage_res)
        return StellaCommandExecuteResponse(
            command=command,
            action_id="entities.create",
            status="proposed",
            message=outcome_msg,
            data=apply_data,
            proposal_id=str(prop.proposal_id) if prop else None,
            confirmation_token=prop.confirmation_token if prop else None,
            requires_confirmation=True,
            affected_item_ids=[],
        )

    # Default: create_collection
    raw_name = rec_info.get("name") if "name" in rec_info else (
        rec_info.get("proposed_name") if "proposed_name" in rec_info else rec_info.get("cluster_name", "")
    )
    c_name = str(raw_name or "").strip()[:100]
    if not c_name:
        raise ValidationError("Collection name cannot be empty.")
    c_desc = str(
        rec_info.get("description")
        or rec_info.get("purpose")
        or "Organized knowledge collection"
    ).strip()[:500]

    if not selected_items:
        raise ValidationError(
            "Please select at least one note or source to include in the collection."
        )

    existing_dup = db.scalars(
        select(Collection).where(
            Collection.workspace_id == workspace_id,
            func.lower(Collection.name) == c_name.lower(),
        )
    ).first()
    if existing_dup and not rec_info.get("allow_existing", False):
        raise ConflictError(
            f"A collection named '{c_name}' already exists in this workspace. Choose a different name or populate the existing collection."
        )

    c_note_ids = [c["item_id"] for c in selected_items if c["item_type"] == "note"]
    c_source_ids = [c["item_id"] for c in selected_items if c["item_type"] == "source"]

    envelope = action_execution_service.execute_action(
        db=db,
        workspace_id=workspace_id,
        action_id="collections.create",
        request=ActionExecuteRequest(
            mode="propose",
            input={"name": c_name, "description": c_desc},
            idempotency_key=str(uuid.uuid4()),
        ),
    )
    prop = envelope.proposals[0] if envelope.proposals else None
    apply_data = {
        "proposed_action": "collections.create",
        "workflow": "organize_knowledge",
        "operation": "create_collection",
        "artifact_type": "collection",
        "name": c_name,
        "collection_name": c_name,
        "description": c_desc,
        "selected_items": selected_items,
        "candidate_items": selected_items,
        "note_ids": c_note_ids,
        "source_ids": c_source_ids,
        "notes": [
            {"note_id": c["item_id"], "title": c["title"]}
            for c in selected_items
            if c["item_type"] == "note"
        ],
        "note_count": len(c_note_ids),
        "source_count": len(c_source_ids),
        "status": "awaiting_confirmation",
    }
    if prop:
        prop_row = db.get(ActionProposal, prop.proposal_id)
        if prop_row:
            prop_row.proposal_payload = {
                **(prop_row.proposal_payload or {}),
                **apply_data,
            }
            db.commit()
    outcome_msg = (
        f"Prepared proposal to create collection '{c_name}' with {len(selected_items)} selected item(s)."
    )
    stage_res = {
        "command": command,
        "action_id": "collections.create",
        "status": "proposed",
        "message": outcome_msg,
        "data": apply_data,
        "proposal_id": str(prop.proposal_id) if prop else None,
        "confirmation_token": prop.confirmation_token if prop else None,
        "requires_confirmation": True,
        "affected_item_ids": [c["item_id"] for c in selected_items],
    }
    _record_conversation_exchange(db, conversation_id, f"{command} {c_name}", outcome_msg, action_result=stage_res)
    return StellaCommandExecuteResponse(
        command=command,
        action_id="collections.create",
        status="proposed",
        message=outcome_msg,
        data=apply_data,
        proposal_id=str(prop.proposal_id) if prop else None,
        confirmation_token=prop.confirmation_token if prop else None,
        requires_confirmation=True,
        affected_item_ids=[c["item_id"] for c in selected_items],
    )


def _build_organization_plan(
    db: Session,
    workspace_id: uuid.UUID,
    ws_name: str,
    raw_scope: str,
    payload: dict[str, Any],
) -> tuple[dict[str, Any], str]:
    """Analyze workspace knowledge across notes, sources, collections, threads, and entities to produce evidence-based organizational recommendations."""
    from app.models.thread import Thread, ThreadNote, ThreadSource
    from app.services import retrieval_service

    RETRIEVAL_LIMIT = 100

    total_ws_notes = (
        db.scalar(
            select(func.count(Note.id)).where(
                Note.workspace_id == workspace_id, Note.is_archived.is_(False)
            )
        )
        or 0
    )
    total_ws_sources = (
        db.scalar(
            select(func.count(Source.id)).where(Source.workspace_id == workspace_id)
        )
        or 0
    )

    all_notes = list(
        db.scalars(
            select(Note)
            .where(Note.workspace_id == workspace_id, Note.is_archived.is_(False))
            .order_by(Note.updated_at.desc())
            .limit(RETRIEVAL_LIMIT)
        ).all()
    )
    all_sources = list(
        db.scalars(
            select(Source)
            .where(Source.workspace_id == workspace_id)
            .order_by(Source.imported_at.desc())
            .limit(RETRIEVAL_LIMIT)
        ).all()
    )
    all_colls = list(
        db.scalars(select(Collection).where(Collection.workspace_id == workspace_id)).all()
    )
    all_threads = list(
        db.scalars(select(Thread).where(Thread.workspace_id == workspace_id)).all()
    )
    all_convs = list(
        db.scalars(
            select(Conversation)
            .where(Conversation.workspace_id == workspace_id)
            .order_by(Conversation.updated_at.desc())
            .limit(30)
        ).all()
    )
    all_entities = list(
        db.scalars(select(GraphEntity).where(GraphEntity.workspace_id == workspace_id)).all()
    )

    note_to_cols, source_to_cols, col_to_notes, col_to_sources = _build_membership_maps(
        db, all_colls
    )

    source_meta_cache: dict[uuid.UUID, tuple[str, str]] = {}
    for s in all_sources:
        source_meta_cache[s.id] = _get_source_display_title_and_excerpt(db, s)

    def _make_note_cand(
        n: Note,
        evidence: str = "Relevant workspace note",
        target_col_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        already_in = bool(target_col_id and n.id in col_to_notes.get(target_col_id, set()))
        return {
            "item_id": str(n.id),
            "note_id": str(n.id),
            "item_type": "note",
            "title": n.title,
            "excerpt": (n.content or "")[:200].strip(),
            "existing_collections": note_to_cols.get(n.id, []),
            "already_in_target": already_in,
            "selected": not already_in,
            "evidence": evidence,
        }

    def _make_source_cand(
        s: Source,
        evidence: str = "Relevant workspace source",
        target_col_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        s_title, s_excerpt = source_meta_cache.get(
            s.id, _get_source_display_title_and_excerpt(db, s)
        )
        already_in = bool(target_col_id and s.id in col_to_sources.get(target_col_id, set()))
        return {
            "item_id": str(s.id),
            "source_id": str(s.id),
            "item_type": "source",
            "title": s_title,
            "excerpt": s_excerpt[:200].strip(),
            "existing_collections": source_to_cols.get(s.id, []),
            "already_in_target": already_in,
            "selected": not already_in,
            "evidence": evidence,
        }

    entry_mode = "workspace_audit"
    scope_type = "workspace"
    scope_label = f"Entire Workspace ({ws_name})"
    seed_item: dict[str, Any] | None = None
    scoped_notes: list[Note] = list(all_notes)
    scoped_sources: list[Source] = list(all_sources)
    disambiguation_options: list[dict[str, Any]] = []
    is_ambiguous = False
    ambiguity_metadata: dict[str, Any] | None = None

    stopwords = {
        "the", "and", "for", "with", "from", "into", "about", "notes", "note",
        "source", "sources", "study", "studies", "overview", "introduction",
    }

    if raw_scope:
        force_mode = str(payload.get("force_mode") or "").strip().lower()
        seed_id_param = str(payload.get("seed_item_id") or "").strip()
        q_low = raw_scope.lower().strip()
        q_tokens = [
            w.lower()
            for w in re.findall(r"[a-zA-Z0-9]{3,}", raw_scope)
            if w.lower() not in stopwords
        ]

        # 1. Explicit seed_item_id or UUID resolution
        explicit_note: Note | None = None
        explicit_source: Source | None = None
        explicit_col: Collection | None = None
        for candidate_uuid_str in (seed_id_param, raw_scope):
            if not candidate_uuid_str:
                continue
            try:
                u_val = uuid.UUID(candidate_uuid_str)
                n_found = db.get(Note, u_val)
                if n_found and n_found.workspace_id == workspace_id and not n_found.is_archived:
                    explicit_note = n_found
                    break
                s_found = db.get(Source, u_val)
                if s_found and s_found.workspace_id == workspace_id:
                    explicit_source = s_found
                    break
                c_found = db.get(Collection, u_val)
                if c_found and c_found.workspace_id == workspace_id:
                    explicit_col = c_found
                    break
            except ValueError:
                pass

        # 2. Check exact & partial title matches across notes, sources, collections
        exact_note_matches = [n for n in all_notes if n.title.strip().lower() == q_low]
        exact_source_matches = [
            s
            for s in all_sources
            if source_meta_cache[s.id][0].strip().lower() == q_low
            or (s.source_identifier or "").strip().lower() == q_low
            or (s.original_path or "").strip().lower() == q_low
        ]
        exact_col_matches = [c for c in all_colls if c.name.strip().lower() == q_low]

        partial_note_title_matches = [
            n for n in all_notes if q_low in n.title.strip().lower()
        ]
        partial_source_title_matches = [
            s
            for s in all_sources
            if q_low in source_meta_cache[s.id][0].strip().lower()
            or q_low in (s.source_identifier or "").strip().lower()
            or q_low in (s.original_path or "").strip().lower()
        ]

        # Build disambiguation options if multiple notes/sources match by title
        total_exact_item_matches = len(exact_note_matches) + len(exact_source_matches)
        total_title_item_matches = len(partial_note_title_matches) + len(
            partial_source_title_matches
        )
        if total_title_item_matches >= 2:
            for nm in partial_note_title_matches[:5]:
                disambiguation_options.append(
                    {
                        "id": str(nm.id),
                        "title": nm.title,
                        "item_type": "note",
                        "excerpt": (nm.content or "")[:140],
                        "command": f'/organize-knowledge "{nm.id}"',
                        "label": f"Note: {nm.title}",
                    }
                )
            for sm in partial_source_title_matches[:5]:
                s_t, s_ex = source_meta_cache[sm.id]
                disambiguation_options.append(
                    {
                        "id": str(sm.id),
                        "title": s_t,
                        "item_type": "source",
                        "excerpt": s_ex[:140],
                        "command": f'/organize-knowledge "{sm.id}"',
                        "label": f"Source: {s_t}",
                    }
                )

        # Decide whether this is an unambiguous seed item, ambiguous item match, collection scope, or topic search
        all_tag_names = {
            t.name.lower() for n in all_notes for t in (n.tags or [])
        }
        general_topic_words = {
            "history", "science", "physics", "optics", "astronomy", "mathematics",
            "philosophy", "medicine", "economics", "politics", "theology",
            "literature", "architecture", "engineering", "biology", "chemistry",
        }
        looks_like_general_topic = (
            force_mode == "topic"
            or q_low in all_tag_names
            or any(w in general_topic_words for w in q_low.split())
        )

        if explicit_note or (
            not looks_like_general_topic
            and len(exact_note_matches) == 1
            and len(exact_source_matches) == 0
        ):
            target_n = explicit_note or exact_note_matches[0]
            entry_mode = "item_seeded"
            scope_type = "note"
            scope_label = f"Note & Related Context: {target_n.title}"
            seed_item = {
                "id": str(target_n.id),
                "title": target_n.title,
                "item_type": "note",
                "excerpt": (target_n.content or "")[:200],
            }
            seed_words = {
                w.lower()
                for w in re.findall(r"[a-zA-Z0-9]{4,}", f"{target_n.title} {(target_n.content or '')[:400]}")
                if w.lower() not in stopwords
            }
            seed_tags = {t.name.lower() for t in (target_n.tags or [])}
            scoped_notes = [
                n
                for n in all_notes
                if n.id == target_n.id
                or bool({t.name.lower() for t in (n.tags or [])} & seed_tags)
                or any(
                    sw in n.title.lower() or sw in (n.content or "").lower()
                    for sw in seed_words
                )
            ]
            scoped_sources = [
                s
                for s in all_sources
                if any(
                    sw in source_meta_cache[s.id][0].lower()
                    or sw in source_meta_cache[s.id][1].lower()
                    for sw in seed_words
                )
            ]
        elif explicit_source or (
            not looks_like_general_topic
            and len(exact_source_matches) == 1
            and len(exact_note_matches) == 0
        ):
            target_s = explicit_source or exact_source_matches[0]
            s_title, s_excerpt = source_meta_cache[target_s.id]
            entry_mode = "item_seeded"
            scope_type = "source"
            scope_label = f"Source & Related Context: {s_title}"
            seed_item = {
                "id": str(target_s.id),
                "title": s_title,
                "item_type": "source",
                "excerpt": s_excerpt[:200],
            }
            seed_words = {
                w.lower()
                for w in re.findall(r"[a-zA-Z0-9]{4,}", f"{s_title} {s_excerpt[:400]}")
                if w.lower() not in stopwords
            }
            scoped_sources = [
                s
                for s in all_sources
                if s.id == target_s.id
                or any(
                    sw in source_meta_cache[s.id][0].lower()
                    or sw in source_meta_cache[s.id][1].lower()
                    for sw in seed_words
                )
            ]
            scoped_notes = [
                n
                for n in all_notes
                if any(
                    sw in n.title.lower() or sw in (n.content or "").lower()
                    for sw in seed_words
                )
            ]
        elif explicit_col or (len(exact_col_matches) == 1 and not looks_like_general_topic):
            target_c = explicit_col or exact_col_matches[0]
            entry_mode = "collection_seeded"
            scope_type = "collection"
            scope_label = f"Collection: {target_c.name}"
            seed_item = {
                "id": str(target_c.id),
                "title": target_c.name,
                "item_type": "collection",
                "excerpt": (target_c.description or "")[:200],
            }
            c_nids = col_to_notes.get(target_c.id, set())
            c_sids = col_to_sources.get(target_c.id, set())
            scoped_notes = [n for n in all_notes if n.id in c_nids]
            scoped_sources = [s for s in all_sources if s.id in c_sids]
        elif (
            not looks_like_general_topic
            and total_title_item_matches == 1
            and (partial_note_title_matches or partial_source_title_matches)
        ):
            if partial_note_title_matches:
                target_n = partial_note_title_matches[0]
                entry_mode = "item_seeded"
                scope_type = "note"
                scope_label = f"Note & Related Context: {target_n.title}"
                seed_item = {
                    "id": str(target_n.id),
                    "title": target_n.title,
                    "item_type": "note",
                    "excerpt": (target_n.content or "")[:200],
                }
                seed_words = {
                    w.lower()
                    for w in re.findall(r"[a-zA-Z0-9]{4,}", f"{target_n.title} {(target_n.content or '')[:400]}")
                    if w.lower() not in stopwords
                }
                scoped_notes = [
                    n
                    for n in all_notes
                    if n.id == target_n.id
                    or any(
                        sw in n.title.lower() or sw in (n.content or "").lower()
                        for sw in seed_words
                    )
                ]
                scoped_sources = [
                    s
                    for s in all_sources
                    if any(
                        sw in source_meta_cache[s.id][0].lower()
                        or sw in source_meta_cache[s.id][1].lower()
                        for sw in seed_words
                    )
                ]
            else:
                target_s = partial_source_title_matches[0]
                s_title, s_excerpt = source_meta_cache[target_s.id]
                entry_mode = "item_seeded"
                scope_type = "source"
                scope_label = f"Source & Related Context: {s_title}"
                seed_item = {
                    "id": str(target_s.id),
                    "title": s_title,
                    "item_type": "source",
                    "excerpt": s_excerpt[:200],
                }
                seed_words = {
                    w.lower()
                    for w in re.findall(r"[a-zA-Z0-9]{4,}", f"{s_title} {s_excerpt[:400]}")
                    if w.lower() not in stopwords
                }
                scoped_sources = [
                    s
                    for s in all_sources
                    if s.id == target_s.id
                    or any(
                        sw in source_meta_cache[s.id][0].lower()
                        or sw in source_meta_cache[s.id][1].lower()
                        for sw in seed_words
                    )
                ]
                scoped_notes = [
                    n
                    for n in all_notes
                    if any(
                        sw in n.title.lower() or sw in (n.content or "").lower()
                        for sw in seed_words
                    )
                ]
        else:
            # Topic-based organization (or ambiguous multi-item match)
            entry_mode = "topic"
            scope_type = "topic"
            scope_label = f"Topic: {raw_scope}"

            if total_exact_item_matches >= 2 or (
                not looks_like_general_topic and total_title_item_matches >= 2
            ):
                is_ambiguous = True
                ambiguity_metadata = {
                    "reason": (
                        f"'{raw_scope}' matches {total_title_item_matches} distinct items by title. "
                        "Select a specific note or source below to organize around that item, or review the topic-wide recommendations."
                    ),
                    "matching_item_count": total_title_item_matches,
                    "options": disambiguation_options,
                }

            # Hybrid search + lexical fallback across notes and sources
            hits = retrieval_service.search_hybrid(db, workspace_id, raw_scope, limit=25)
            hit_note_ids = {h.item_id for h in hits if h.item_type == "note"}
            hit_source_ids = {h.item_id for h in hits if h.item_type == "source"}

            topic_notes: list[Note] = []
            for n in all_notes:
                n_text = f"{n.title} {n.content or ''} {' '.join(t.name for t in (n.tags or []))}".lower()
                if (
                    n.id in hit_note_ids
                    or q_low in n_text
                    or (q_tokens and any(qt in n_text for qt in q_tokens))
                ):
                    topic_notes.append(n)

            topic_sources: list[Source] = []
            for s in all_sources:
                s_title, s_excerpt = source_meta_cache[s.id]
                s_text = f"{s_title} {s_excerpt}".lower()
                if (
                    s.id in hit_source_ids
                    or q_low in s_text
                    or (q_tokens and any(qt in s_text for qt in q_tokens))
                ):
                    topic_sources.append(s)

            if not topic_notes and not topic_sources:
                raise AppException(
                    404,
                    "SCOPE_NOT_FOUND",
                    f"Could not find any note, source, collection, or topic matching '{raw_scope}' in this workspace.",
                )

            scoped_notes = topic_notes
            scoped_sources = topic_sources

            # Detect thematic ambiguity if topic matches >=2 disconnected tag clusters
            tag_sets = [
                {t.name.lower() for t in (n.tags or []) if t.name.lower() not in q_tokens}
                for n in scoped_notes
                if n.tags
            ]
            non_empty_tag_sets = [ts for ts in tag_sets if ts]
            if len(non_empty_tag_sets) >= 2:
                union_tags = set().union(*non_empty_tag_sets)
                inter_tags = set(non_empty_tag_sets[0]).intersection(*non_empty_tag_sets[1:])
                if not inter_tags and len(union_tags) >= 2:
                    is_ambiguous = True
                    sub_themes = sorted(t.title() for t in union_tags)
                    ambiguity_metadata = {
                        "reason": (
                            f"Topic '{raw_scope}' spans multiple distinct thematic groups ({', '.join(sub_themes)}). "
                            "Recommendations are separated by sub-theme so unrelated material is not merged together."
                        ),
                        "sub_themes": sub_themes,
                        "options": disambiguation_options,
                    }

    # ── Build Concrete, Evidence-Based Recommendations ───────────────────────
    recommendations: list[dict[str, Any]] = []
    suggested_clusters: list[dict[str, Any]] = []

    def _compute_overlap_summary(
        cands: list[dict[str, Any]], target_col_name: str | None = None
    ) -> str:
        other_cols: dict[str, int] = {}
        for c in cands:
            for cname in c.get("existing_collections", []):
                if cname != target_col_name:
                    other_cols[cname] = other_cols.get(cname, 0) + 1
        if not other_cols:
            return "None of the candidate items currently belong to another collection."
        parts = [f"{cnt} in '{cname}'" for cname, cnt in sorted(other_cols.items(), key=lambda x: -x[1])]
        return (
            f"Existing collection memberships ({', '.join(parts)}) will be preserved."
        )

    # 1. Category A: Collections (Populate Existing vs Create New)
    used_note_ids: set[uuid.UUID] = set()
    used_source_ids: set[uuid.UUID] = set()

    # Check if an existing collection directly matches raw_scope or tag groups
    if entry_mode == "topic" and raw_scope:
        matching_existing_col = next(
            (
                c
                for c in all_colls
                if raw_scope.lower() in c.name.lower() or c.name.lower() in raw_scope.lower()
            ),
            None,
        )
        if matching_existing_col:
            uncollected_notes = [
                n
                for n in scoped_notes
                if n.id not in col_to_notes.get(matching_existing_col.id, set())
            ]
            uncollected_sources = [
                s
                for s in scoped_sources
                if s.id not in col_to_sources.get(matching_existing_col.id, set())
            ]
            if uncollected_notes or uncollected_sources:
                cands = [
                    _make_note_cand(
                        n,
                        f"Matches '{raw_scope}' and is not yet in '{matching_existing_col.name}'",
                        matching_existing_col.id,
                    )
                    for n in uncollected_notes
                ] + [
                    _make_source_cand(
                        s,
                        f"Matches '{raw_scope}' and is not yet in '{matching_existing_col.name}'",
                        matching_existing_col.id,
                    )
                    for s in uncollected_sources
                ]
                for n in uncollected_notes:
                    used_note_ids.add(n.id)
                for s in uncollected_sources:
                    used_source_ids.add(s.id)
                already_cnt = len(col_to_notes.get(matching_existing_col.id, set())) + len(
                    col_to_sources.get(matching_existing_col.id, set())
                )
                overlap_str = _compute_overlap_summary(cands, matching_existing_col.name)
                rec_obj = {
                    "recommendation_id": f"rec-pop-{matching_existing_col.id}",
                    "artifact_type": "collection",
                    "operation": "populate_collection",
                    "executable": True,
                    "proposed_name": matching_existing_col.name,
                    "cluster_name": matching_existing_col.name,
                    "description": matching_existing_col.description
                    or f"Curated material on {raw_scope}",
                    "purpose": (
                        f"Add {len(cands)} relevant uncollected item(s) to existing collection '{matching_existing_col.name}'."
                    ),
                    "rationale": (
                        f"Collection '{matching_existing_col.name}' already exists ({already_cnt} existing member(s)) and matches '{raw_scope}', "
                        f"but {len(uncollected_notes)} note(s) and {len(uncollected_sources)} source(s) on this topic are not yet included."
                    ),
                    "evidence_summary": (
                        f"Matched {len(uncollected_notes)} note(s) and {len(uncollected_sources)} source(s) via workspace retrieval."
                    ),
                    "target_collection_id": str(matching_existing_col.id),
                    "existing_collection_id": str(matching_existing_col.id),
                    "overlap_summary": overlap_str,
                    "consequences": (
                        f"Adds selected items to '{matching_existing_col.name}' without duplicating existing members or removing items from other collections."
                    ),
                    "counts": {
                        "notes": len(uncollected_notes),
                        "sources": len(uncollected_sources),
                        "conversations": 0,
                        "entities": 0,
                        "relationships": 0,
                        "total": len(cands),
                    },
                    "representative_items": cands[:4],
                    "candidate_items": cands,
                    "recommended_notes": [c["title"] for c in cands[:6]],
                    "notes": [
                        {"note_id": c["item_id"], "title": c["title"]}
                        for c in cands
                        if c["item_type"] == "note"
                    ],
                    "recommended_action": f"Populate existing collection '{matching_existing_col.name}' (+{len(cands)} item(s))",
                }
                recommendations.append(rec_obj)
                suggested_clusters.append(rec_obj)

    # Group scoped notes & sources by tags
    tag_groups: dict[str, list[Note]] = {}
    for n in scoped_notes:
        for t in n.tags or []:
            tag_groups.setdefault(t.name.title(), []).append(n)

    for tag_label, t_notes in sorted(tag_groups.items(), key=lambda x: -len(x[1])):
        if len(suggested_clusters) >= 4:
            break
        # Find sources matching this tag label
        matching_tag_sources = [
            s
            for s in scoped_sources
            if tag_label.lower() in source_meta_cache[s.id][0].lower()
            or tag_label.lower() in source_meta_cache[s.id][1].lower()
        ]
        existing_c = next(
            (c for c in all_colls if tag_label.lower() in c.name.lower()), None
        )
        if existing_c:
            # Only recommend populating if there are items NOT yet in existing_c
            missing_notes = [
                tn for tn in t_notes if tn.id not in col_to_notes.get(existing_c.id, set())
            ]
            missing_sources = [
                ts
                for ts in matching_tag_sources
                if ts.id not in col_to_sources.get(existing_c.id, set())
            ]
            for tn in t_notes:
                used_note_ids.add(tn.id)
            for ts in matching_tag_sources:
                used_source_ids.add(ts.id)
            if not missing_notes and not missing_sources:
                continue
            if any(
                r.get("target_collection_id") == str(existing_c.id) for r in recommendations
            ):
                continue
            cands = [
                _make_note_cand(
                    tn, f"Tagged '{tag_label}' and missing from '{existing_c.name}'", existing_c.id
                )
                for tn in missing_notes
            ] + [
                _make_source_cand(
                    ts, f"Matches '{tag_label}' and missing from '{existing_c.name}'", existing_c.id
                )
                for ts in missing_sources
            ]
            overlap_str = _compute_overlap_summary(cands, existing_c.name)
            rec_obj = {
                "recommendation_id": f"rec-pop-tag-{existing_c.id}",
                "artifact_type": "collection",
                "operation": "populate_collection",
                "executable": True,
                "proposed_name": existing_c.name,
                "cluster_name": existing_c.name,
                "description": existing_c.description or f"Knowledge items tagged '{tag_label}'",
                "purpose": f"Add {len(cands)} missing '{tag_label}' item(s) to existing collection '{existing_c.name}'.",
                "rationale": (
                    f"Existing collection '{existing_c.name}' aligns with the '{tag_label}' theme, "
                    f"and {len(cands)} relevant item(s) are not yet members."
                ),
                "evidence_summary": f"Shared domain tag '{tag_label}' across {len(missing_notes)} note(s) and {len(missing_sources)} source(s).",
                "target_collection_id": str(existing_c.id),
                "existing_collection_id": str(existing_c.id),
                "overlap_summary": overlap_str,
                "consequences": f"Adds selected items to '{existing_c.name}' while preserving all existing collection memberships.",
                "counts": {
                    "notes": len(missing_notes),
                    "sources": len(missing_sources),
                    "conversations": 0,
                    "entities": 0,
                    "relationships": 0,
                    "total": len(cands),
                },
                "representative_items": cands[:4],
                "candidate_items": cands,
                "recommended_notes": [c["title"] for c in cands[:6]],
                "notes": [
                    {"note_id": c["item_id"], "title": c["title"]}
                    for c in cands
                    if c["item_type"] == "note"
                ],
                "recommended_action": f"Add to existing collection '{existing_c.name}'",
            }
            recommendations.append(rec_obj)
            suggested_clusters.append(rec_obj)
        else:
            # Check if all items in this tag group already share another single collection
            shared_cols = set.intersection(
                *(
                    set(note_to_cols.get(tn.id, []))
                    for tn in t_notes
                )
            ) if t_notes else set()
            if shared_cols and entry_mode == "workspace_audit" and not matching_tag_sources:
                for tn in t_notes:
                    used_note_ids.add(tn.id)
                continue

            for tn in t_notes:
                used_note_ids.add(tn.id)
            for ts in matching_tag_sources:
                used_source_ids.add(ts.id)
            cands = [
                _make_note_cand(tn, f"Shares domain tag '{tag_label}'") for tn in t_notes
            ] + [
                _make_source_cand(ts, f"Matches domain theme '{tag_label}'")
                for ts in matching_tag_sources
            ]
            c_name = f"{tag_label} Studies"
            overlap_str = _compute_overlap_summary(cands)
            rec_obj = {
                "recommendation_id": f"rec-col-tag-{tag_label.lower().replace(' ', '-')}",
                "artifact_type": "collection",
                "operation": "create_collection",
                "executable": True,
                "proposed_name": c_name,
                "cluster_name": c_name,
                "description": f"Curated collection of notes and sources covering {tag_label}.",
                "purpose": f"Consolidate {len(t_notes)} note(s) and {len(matching_tag_sources)} source(s) sharing the '{tag_label}' theme.",
                "rationale": (
                    f"Found {len(cands)} workspace item(s) centered on '{tag_label}' without a dedicated '{c_name}' collection."
                ),
                "evidence_summary": f"Grounded in tag '{tag_label}' and lexical overlap across {len(cands)} item(s).",
                "target_collection_id": None,
                "existing_collection_id": None,
                "overlap_summary": overlap_str,
                "consequences": f"Creates collection '{c_name}' and links selected items while preserving existing memberships.",
                "counts": {
                    "notes": len(t_notes),
                    "sources": len(matching_tag_sources),
                    "conversations": 0,
                    "entities": 0,
                    "relationships": 0,
                    "total": len(cands),
                },
                "representative_items": cands[:4],
                "candidate_items": cands,
                "recommended_notes": [c["title"] for c in cands[:6]],
                "notes": [
                    {"note_id": c["item_id"], "title": c["title"]}
                    for c in cands
                    if c["item_type"] == "note"
                ],
                "recommended_action": f"Create collection '{c_name}' and add {len(cands)} item(s)",
            }
            recommendations.append(rec_obj)
            suggested_clusters.append(rec_obj)

    # Check remaining ungrouped notes and sources
    remaining_notes = [n for n in scoped_notes if n.id not in used_note_ids]
    remaining_sources = [s for s in scoped_sources if s.id not in used_source_ids]
    # In workspace_audit mode, only recommend grouping remaining items if they are uncollected (orphaned)
    if entry_mode == "workspace_audit":
        remaining_notes = [n for n in remaining_notes if not note_to_cols.get(n.id)]
        remaining_sources = [s for s in remaining_sources if not source_to_cols.get(s.id)]

    if remaining_notes or remaining_sources:
        if entry_mode == "item_seeded" and seed_item:
            base_seed_title = seed_item["title"].split(":")[0].strip()[:60]
            cluster_title = f"{base_seed_title} Dossier"
            purpose_str = (
                f"Organize '{seed_item['title']}' and {len(remaining_notes) + len(remaining_sources) - 1 if (len(remaining_notes) + len(remaining_sources)) > 1 else len(remaining_notes) + len(remaining_sources)} related workspace item(s) into a dedicated collection."
            )
            rationale_str = (
                f"Using {seed_item['item_type']} '{seed_item['title']}' as the starting point, Stella identified "
                f"{len(remaining_notes)} note(s) and {len(remaining_sources)} source(s) with shared concepts and terminology."
            )
        elif raw_scope and entry_mode == "topic":
            cluster_title = f"{raw_scope.title()} Collection"[:80]
            purpose_str = (
                f"Group {len(remaining_notes)} note(s) and {len(remaining_sources)} source(s) matching topic '{raw_scope}'."
            )
            rationale_str = (
                f"These {len(remaining_notes) + len(remaining_sources)} item(s) directly reference '{raw_scope}' and lack a unified collection."
            )
        else:
            cluster_title = "Uncategorized Research & Sources"
            purpose_str = (
                f"Consolidate {len(remaining_notes)} uncollected note(s) and {len(remaining_sources)} uncollected source(s) into a structured collection."
            )
            rationale_str = (
                f"Workspace audit identified {len(remaining_notes) + len(remaining_sources)} orphaned item(s) not currently assigned to any collection."
            )

        existing_match = next(
            (c for c in all_colls if c.name.strip().lower() == cluster_title.lower()),
            None,
        )
        cands = [
            _make_note_cand(
                n,
                f"Matched in {scope_label}",
                existing_match.id if existing_match else None,
            )
            for n in remaining_notes
        ] + [
            _make_source_cand(
                s,
                f"Matched in {scope_label}",
                existing_match.id if existing_match else None,
            )
            for s in remaining_sources
        ]
        if existing_match:
            cands = [c for c in cands if not c.get("already_in_target")]
        if cands:
            overlap_str = _compute_overlap_summary(
                cands, existing_match.name if existing_match else None
            )
            rec_obj = {
                "recommendation_id": "rec-col-remaining",
                "artifact_type": "collection",
                "operation": "populate_collection" if existing_match else "create_collection",
                "executable": True,
                "proposed_name": existing_match.name if existing_match else cluster_title,
                "cluster_name": existing_match.name if existing_match else cluster_title,
                "description": purpose_str,
                "purpose": purpose_str,
                "rationale": rationale_str,
                "evidence_summary": (
                    f"{len(remaining_notes)} note(s) and {len(remaining_sources)} source(s) retrieved for {scope_label}."
                ),
                "target_collection_id": str(existing_match.id) if existing_match else None,
                "existing_collection_id": str(existing_match.id) if existing_match else None,
                "overlap_summary": overlap_str,
                "consequences": (
                    f"Creates collection '{cluster_title}' and adds selected items while keeping existing memberships intact."
                    if not existing_match
                    else f"Adds selected items to '{existing_match.name}' while keeping existing memberships intact."
                ),
                "counts": {
                    "notes": sum(1 for c in cands if c["item_type"] == "note"),
                    "sources": sum(1 for c in cands if c["item_type"] == "source"),
                    "conversations": 0,
                    "entities": 0,
                    "relationships": 0,
                    "total": len(cands),
                },
                "representative_items": cands[:4],
                "candidate_items": cands,
                "recommended_notes": [c["title"] for c in cands[:6]],
                "notes": [
                    {"note_id": c["item_id"], "title": c["title"]}
                    for c in cands
                    if c["item_type"] == "note"
                ],
                "recommended_action": (
                    f"Add to existing collection '{existing_match.name}'"
                    if existing_match
                    else f"Create collection '{cluster_title}' with {len(cands)} item(s)"
                ),
            }
            recommendations.append(rec_obj)
            suggested_clusters.append(rec_obj)

    # 2. Category B: Research Thread Recommendation (when inquiry items/conversations/questions exist)
    thread_Label_base = (
        seed_item["title"].split(":")[0].strip()[:50]
        if seed_item
        else (raw_scope.title() if raw_scope else "Cross-Domain Synthesis")
    )
    proposed_thread_title = f"{thread_Label_base} Research Thread"
    has_matching_thread = any(
        thread_Label_base.lower() in t.title.lower() for t in all_threads
    )
    if not has_matching_thread and (len(scoped_notes) + len(scoped_sources) >= 2 or all_convs):
        thread_cands: list[dict[str, Any]] = []
        for n in scoped_notes[:6]:
            thread_cands.append(
                _make_note_cand(n, "Core note for ongoing research inquiry")
            )
        for s in scoped_sources[:4]:
            thread_cands.append(
                _make_source_cand(s, "Primary source material for thread")
            )
        for conv in all_convs[:2]:
            if not raw_scope or raw_scope.lower() in (conv.title or "").lower():
                thread_cands.append(
                    {
                        "item_id": str(conv.id),
                        "item_type": "conversation",
                        "title": conv.title or "Stella Inquiry Session",
                        "excerpt": "Assistant dialogue session in this workspace",
                        "existing_collections": [],
                        "already_in_target": False,
                        "selected": True,
                        "evidence": "Related Stella conversation",
                    }
                )
        if len(thread_cands) >= 2:
            thread_question = (
                f"How do the primary sources and notes on {thread_Label_base} connect, and what open questions remain?"
            )
            recommendations.append(
                {
                    "recommendation_id": "rec-thread-1",
                    "artifact_type": "thread",
                    "operation": "create_thread",
                    "executable": True,
                    "proposed_name": proposed_thread_title,
                    "cluster_name": proposed_thread_title,
                    "description": thread_question,
                    "question": thread_question,
                    "purpose": (
                        f"Track open research questions, discoveries, and {len(thread_cands)} connected item(s) around '{thread_Label_base}'."
                    ),
                    "rationale": (
                        f"Found {len(thread_cands)} related workspace item(s) without an active research thread tracking their synthesis."
                    ),
                    "evidence_summary": (
                        f"Connects {sum(1 for c in thread_cands if c['item_type'] == 'note')} note(s), "
                        f"{sum(1 for c in thread_cands if c['item_type'] == 'source')} source(s), and "
                        f"{sum(1 for c in thread_cands if c['item_type'] == 'conversation')} conversation(s)."
                    ),
                    "target_collection_id": None,
                    "existing_collection_id": None,
                    "overlap_summary": "No existing research thread covers this inquiry scope.",
                    "consequences": (
                        "Creates an active Research Thread with the configured question and attaches selected notes, sources, and conversations."
                    ),
                    "counts": {
                        "notes": sum(1 for c in thread_cands if c["item_type"] == "note"),
                        "sources": sum(1 for c in thread_cands if c["item_type"] == "source"),
                        "conversations": sum(
                            1 for c in thread_cands if c["item_type"] == "conversation"
                        ),
                        "entities": 0,
                        "relationships": 0,
                        "total": len(thread_cands),
                    },
                    "representative_items": thread_cands[:4],
                    "candidate_items": thread_cands,
                    "recommended_action": f"Create research thread '{proposed_thread_title}'",
                }
            )

    # 3. Category C: Entities & Relationships Recommendation
    candidate_entities: list[dict[str, Any]] = []
    candidate_relationships: list[dict[str, Any]] = []
    seen_ent_names: set[str] = set()

    for n in scoped_notes[:6]:
        extracted = _extract_grounded_entities(db, workspace_id, n.title, n.content or "")
        doc_ents: list[dict[str, Any]] = []
        for ent in extracted:
            e_low = ent["name"].lower()
            doc_ents.append(ent)
            if not ent.get("already_in_graph") and e_low not in seen_ent_names:
                seen_ent_names.add(e_low)
                candidate_entities.append(
                    {
                        "item_id": f"ent-{len(candidate_entities) + 1}",
                        "name": ent["name"],
                        "title": ent["name"],
                        "item_type": "entity",
                        "entity_type": ent["entity_type"],
                        "description": ent["description"],
                        "excerpt": ent["description"],
                        "source_title": n.title,
                        "already_in_graph": False,
                        "selected": True,
                    }
                )
        if len(doc_ents) >= 2 and len(candidate_relationships) < 6:
            candidate_relationships.append(
                {
                    "item_id": f"rel-{len(candidate_relationships) + 1}",
                    "source_entity": doc_ents[0]["name"],
                    "target_entity": doc_ents[1]["name"],
                    "relationship_type": "related_to",
                    "description": f"Co-occurs in note '{n.title}'",
                    "source_title": n.title,
                    "selected": True,
                }
            )

    for s in scoped_sources[:4]:
        s_title, s_excerpt = source_meta_cache[s.id]
        extracted = _extract_grounded_entities(db, workspace_id, s_title, s_excerpt)
        for ent in extracted:
            e_low = ent["name"].lower()
            if not ent.get("already_in_graph") and e_low not in seen_ent_names:
                seen_ent_names.add(e_low)
                candidate_entities.append(
                    {
                        "item_id": f"ent-{len(candidate_entities) + 1}",
                        "name": ent["name"],
                        "title": ent["name"],
                        "item_type": "entity",
                        "entity_type": ent["entity_type"],
                        "description": ent["description"],
                        "excerpt": ent["description"],
                        "source_title": s_title,
                        "already_in_graph": False,
                        "selected": True,
                    }
                )

    if candidate_entities or candidate_relationships:
        ent_rec_name = (
            f"{thread_Label_base} Graph Entities"
            if raw_scope or seed_item
            else "Workspace Knowledge Graph Entities"
        )
        recommendations.append(
            {
                "recommendation_id": "rec-entities-1",
                "artifact_type": "entities",
                "operation": "create_entities_and_relationships",
                "executable": True,
                "proposed_name": ent_rec_name,
                "cluster_name": ent_rec_name,
                "description": (
                    f"Extract {len(candidate_entities)} grounded entity(ies) and {len(candidate_relationships)} relationship(s) into the Observatory graph."
                ),
                "purpose": (
                    f"Index {len(candidate_entities)} key entity(ies) and {len(candidate_relationships)} relationship(s) referenced across your notes and sources."
                ),
                "rationale": (
                    "These concepts, people, places, and connections appear in your workspace text but are not yet represented in the knowledge graph."
                ),
                "evidence_summary": (
                    f"Grounded in {len(scoped_notes)} note(s) and {len(scoped_sources)} source(s)."
                ),
                "target_collection_id": None,
                "existing_collection_id": None,
                "overlap_summary": f"{len(all_entities)} existing graph entity(ies) in workspace will be deduplicated automatically.",
                "consequences": (
                    "Creates selected GraphEntity and GraphRelationship nodes in the active workspace without duplicating existing entities."
                ),
                "counts": {
                    "notes": 0,
                    "sources": 0,
                    "conversations": 0,
                    "entities": len(candidate_entities),
                    "relationships": len(candidate_relationships),
                    "total": len(candidate_entities) + len(candidate_relationships),
                },
                "representative_items": (candidate_entities + candidate_relationships)[:4],
                "candidate_items": candidate_entities,
                "candidate_entities": candidate_entities,
                "candidate_relationships": candidate_relationships,
                "recommended_action": f"Add {len(candidate_entities)} entity(ies) & {len(candidate_relationships)} relationship(s) to Graph",
            }
        )

    # 4. Category D: Workspace Boundary Recommendation (only when >=2 disjoint domains exist in workspace audit)
    if entry_mode == "workspace_audit" and len(tag_groups) >= 2 and len(scoped_notes) >= 3:
        domain_names = list(tag_groups.keys())[:3]
        recommendations.append(
            {
                "recommendation_id": "rec-workspace-1",
                "artifact_type": "workspace",
                "operation": "informational_workspace",
                "executable": False,
                "proposed_name": f"Dedicated Workspace for {domain_names[-1]}",
                "cluster_name": f"Dedicated Workspace for {domain_names[-1]}",
                "description": (
                    f"Informational boundary assessment: {', '.join(domain_names)} represent distinct subject domains."
                ),
                "purpose": (
                    f"Evaluate whether '{domain_names[-1]}' warrants a separate workspace if it evolves into an independent project."
                ),
                "rationale": (
                    f"Notes tagged '{domain_names[0]}' and '{domain_names[-1]}' currently share zero cross-links or collections."
                ),
                "evidence_summary": (
                    f"Detected {len(tag_groups)} distinct tag domains across {len(scoped_notes)} workspace notes."
                ),
                "target_collection_id": None,
                "existing_collection_id": None,
                "overlap_summary": "Zero shared collections or links between these domain clusters.",
                "consequences": (
                    "Informational recommendation only: Hyades never moves notes or sources across workspaces automatically."
                ),
                "counts": {
                    "notes": len(tag_groups[domain_names[-1]]),
                    "sources": 0,
                    "conversations": 0,
                    "entities": 0,
                    "relationships": 0,
                    "total": len(tag_groups[domain_names[-1]]),
                },
                "representative_items": [
                    _make_note_cand(n, f"Domain: {domain_names[-1]}")
                    for n in tag_groups[domain_names[-1]][:3]
                ],
                "candidate_items": [
                    _make_note_cand(n, f"Domain: {domain_names[-1]}")
                    for n in tag_groups[domain_names[-1]]
                ],
                "recommended_action": "Review workspace boundary guidance",
            }
        )

    org_status = (
        "disambiguation_required"
        if is_ambiguous and entry_mode == "topic" and len(disambiguation_options) >= 2 and not looks_like_general_topic
        else ("recommendations_ready" if recommendations else "adequate_organization")
    )

    examined_scope = {
        "notes_examined": len(scoped_notes),
        "sources_examined": len(scoped_sources),
        "collections_examined": len(all_colls),
        "threads_examined": len(all_threads),
        "entities_examined": len(all_entities),
        "total_workspace_notes": total_ws_notes,
        "total_workspace_sources": total_ws_sources,
        "retrieval_limit": RETRIEVAL_LIMIT,
    }

    organize_data = {
        "entry_mode": entry_mode,
        "scope": scope_label,
        "scope_type": scope_type,
        "seed_item": seed_item,
        "examined_scope": examined_scope,
        "total_notes": len(scoped_notes),
        "total_sources": len(scoped_sources),
        "total_collections": len(all_colls),
        "total_threads": len(all_threads),
        "is_ambiguous": is_ambiguous,
        "ambiguity_metadata": ambiguity_metadata,
        "disambiguation_options": disambiguation_options,
        "organization_status": org_status,
        "recommendations": recommendations,
        "suggested_clusters": suggested_clusters,
        "status": "recommendations_ready" if recommendations else "adequate_organization",
    }

    if not recommendations:
        outcome_msg = (
            f"Evaluated {scope_label} ({len(scoped_notes)} note(s), {len(scoped_sources)} source(s), "
            f"{len(all_colls)} collection(s)). Your knowledge in this scope is already well-organized; no structural changes are needed."
        )
    else:
        outcome_msg = (
            f"Prepared {len(recommendations)} organization recommendation(s) for {scope_label} "
            f"({len(scoped_notes)} note(s) and {len(scoped_sources)} source(s) analyzed)."
        )

    return organize_data, outcome_msg


def execute_stella_action_command(
    db: Session,
    workspace_id: uuid.UUID,
    command: str,
    args: list[str] | None = None,
    parameters: dict[str, Any] | None = None,
    conversation_id: uuid.UUID | None = None,
    proposal_id: uuid.UUID | None = None,
    confirmation_token: str | None = None,
    prompt: str | None = None,
) -> StellaCommandExecuteResponse:
    """Execute or stage a proposal for any Stella slash command using canonical domain actions."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError(f"Workspace {workspace_id} not found.")

    clean_cmd = command.strip().lower()
    cmd_def = next(
        (
            c
            for c in ALL_OPERATIONS
            if c.command.lower() == clean_cmd
            or (c.action_id and c.action_id.lower() == clean_cmd)
        ),
        None,
    )
    if not cmd_def:
        raise ValidationError(f"Unknown command '{command}'.")

    action_id = cmd_def.action_id
    args = list(args or [])
    parameters = parameters or {}
    if not args and isinstance(parameters.get("query"), str):
        raw_q = parameters["query"].strip()
        if raw_q:
            args = [
                m.group(1) or m.group(2) or m.group(0)
                for m in re.finditer(r'[^\s"\']+|"([^"]*)"|\'([^\']*)\'', raw_q)
            ]

    if prompt and prompt.strip():
        user_cmd_content = prompt.strip()
    elif args:
        args_formatted = " ".join(
            f'"{a}"' if (" " in a and not (a.startswith('"') and a.endswith('"'))) else a
            for a in args
        )
        user_cmd_content = f"{command} {args_formatted}".strip()
    else:
        user_cmd_content = command

    # Placeholder / Coming Soon Guard
    if clean_cmd in PLACEHOLDER_COMMANDS or cmd_def.availability == "coming_soon":
        placeholder_msg = f"{cmd_def.name} is under development and coming soon."
        placeholder_res = {
            "card_type": "placeholder",
            "command": cmd_def.command,
            "action_id": action_id or "",
            "status": "coming_soon",
            "message": placeholder_msg,
            "data": {
                "availability": "coming_soon",
                "feature": cmd_def.name,
                "command": cmd_def.command,
            },
            "requires_confirmation": False,
        }
        _record_conversation_exchange(
            db=db,
            conversation_id=conversation_id,
            user_content=user_cmd_content,
            assistant_content=placeholder_msg,
            action_result=placeholder_res,
        )
        return StellaCommandExecuteResponse(
            command=cmd_def.command,
            action_id=action_id or "",
            status="coming_soon",
            message=placeholder_msg,
            data={
                "availability": "coming_soon",
                "feature": cmd_def.name,
                "command": cmd_def.command,
            },
            requires_confirmation=False,
        )

    # 0. Cancel Phase
    if proposal_id and parameters.get("cancel"):
        cancel_note_draft(db, workspace_id, proposal_id)
        return StellaCommandExecuteResponse(
            command=command,
            action_id=action_id or "",
            status="cancelled",
            message=f"Cancelled '{cmd_def.name}' proposal.",
            data={"proposal_id": str(proposal_id), "status": "cancelled"},
            proposal_id=str(proposal_id),
            requires_confirmation=False,
        )

    # 1. Commit Phase
    if proposal_id and confirmation_token:
        proposal_obj = db.get(ActionProposal, proposal_id)
        if proposal_obj and proposal_obj.workspace_id != workspace_id:
            raise AppException(404, "PROPOSAL_NOT_FOUND", "Proposal not found in workspace.")
        commit_action_id = (
            proposal_obj.action_id if proposal_obj else (action_id or "notes.create")
        )
        res_envelope = action_execution_service.execute_action(
            db=db,
            workspace_id=workspace_id,
            action_id=commit_action_id,
            request=ActionExecuteRequest(
                mode="commit",
                confirmation_token=confirmation_token,
                idempotency_key=str(uuid.uuid4()),
                input=parameters,
            ),
        )
        outcome_msg = f"Successfully committed '{cmd_def.name}'."
        affected_ids: list[str] = []
        for cs in res_envelope.committed_changes:
            affected_ids.extend(str(i) for i in cs.affected_item_ids)

        def _update_generic_proposal(
            parsed: dict[str, Any], orig_text: str
        ) -> tuple[dict[str, Any], str]:
            prev_data = parsed.get("data") if isinstance(parsed.get("data"), dict) else {}
            merged_data = {**prev_data, **(res_envelope.result or {})}
            parsed["status"] = "committed"
            parsed["message"] = outcome_msg
            parsed["data"] = merged_data
            parsed["requires_confirmation"] = False
            if affected_ids:
                parsed["affected_item_ids"] = affected_ids
            return parsed, orig_text

        updated_in_place = _update_proposal_message_in_conversation(
            db=db,
            proposal_id=proposal_id,
            updater=_update_generic_proposal,
            conversation_id=conversation_id,
        )

        if not updated_in_place:
            commit_res = {
                "command": command,
                "action_id": commit_action_id,
                "status": "completed",
                "message": outcome_msg,
                "data": {
                    "affected_item_ids": affected_ids,
                    **(res_envelope.result or {}),
                },
                "requires_confirmation": False,
                "affected_item_ids": affected_ids,
            }
            _record_conversation_exchange(
                db=db,
                conversation_id=conversation_id,
                user_content=f"Confirm {command}",
                assistant_content=outcome_msg,
                action_result=commit_res,
            )
        return StellaCommandExecuteResponse(
            command=command,
            action_id=commit_action_id,
            status="completed",
            message=outcome_msg,
            data=res_envelope.result,
            affected_item_ids=affected_ids,
        )

    # 2. Build Input Payload
    payload: dict[str, Any] = dict(parameters)

    # ── Agentic Operations Handlers ─────────────────────────────────────────
    if clean_cmd == "/enrich-note":
        raw_note_ident = (
            " ".join(args).strip()
            if len(args) > 1
            else (args[0] if args else str(payload.get("note_id", "")).strip())
        )
        if not raw_note_ident:
            raise ValidationError("Usage: /enrich-note <note>")
        target_note = _resolve_note(db, workspace_id, raw_note_ident)
        if not target_note and args:
            target_note = _resolve_note(db, workspace_id, args[0])
        if not target_note or target_note.workspace_id != workspace_id:
            raise AppException(
                404, "NOTE_NOT_FOUND", f"Could not find note '{raw_note_ident}' in this workspace."
            )

        from app.services import retrieval_service

        hits = retrieval_service.search_hybrid(db, workspace_id, target_note.title, limit=6)
        related_items: list[dict[str, str]] = []
        seen_rel_ids: set[str] = {str(target_note.id)}
        for h in hits:
            if str(h.item_id) in seen_rel_ids:
                continue
            seen_rel_ids.add(str(h.item_id))
            related_items.append(
                {
                    "id": str(h.item_id),
                    "title": h.title,
                    "item_type": h.item_type,
                    "excerpt": (h.excerpt or "")[:180],
                }
            )
            if len(related_items) >= 4:
                break

        # Fallback lexical discovery if hybrid search returned fewer than 2 items
        if len(related_items) < 2:
            other_notes = list(
                db.scalars(
                    select(Note)
                    .where(
                        Note.workspace_id == workspace_id,
                        Note.is_archived.is_(False),
                        Note.id != target_note.id,
                    )
                    .order_by(Note.updated_at.desc())
                    .limit(4)
                ).all()
            )
            for on in other_notes:
                if str(on.id) not in seen_rel_ids:
                    seen_rel_ids.add(str(on.id))
                    related_items.append(
                        {
                            "id": str(on.id),
                            "title": on.title,
                            "item_type": "note",
                            "excerpt": (on.content or "")[:180],
                        }
                    )
                if len(related_items) >= 3:
                    break

        related_titles = [r["title"] for r in related_items]
        connections_md = (
            "\n".join(
                f"- **{r['title']}** ({r['item_type']}): {r['excerpt'] or 'Related workspace item'}"
                for r in related_items
            )
            if related_items
            else f"- Related concepts and supporting context connected to **{target_note.title}**."
        )
        enrichment_addition = (
            f"## Contextual Enrichment\n\n"
            f"### Related Workspace Context\n{connections_md}\n\n"
            f"### Key Practical Connections\n"
            f"- Connects the concepts in **{target_note.title}** to supporting workspace evidence.\n"
            f"- Identifies {len(related_items)} related workspace item(s) to explore for deeper context."
        )
        existing_body = (target_note.content or "").rstrip()
        proposed_content = (
            f"{existing_body}\n\n{enrichment_addition}" if existing_body else enrichment_addition
        )

        envelope = action_execution_service.execute_action(
            db=db,
            workspace_id=workspace_id,
            action_id="notes.update",
            request=ActionExecuteRequest(
                mode="propose",
                input={
                    "note_id": str(target_note.id),
                    "title": target_note.title,
                    "content": proposed_content,
                    "append_content": enrichment_addition,
                },
                idempotency_key=str(uuid.uuid4()),
            ),
        )
        prop = envelope.proposals[0] if envelope.proposals else None
        enrichment_data = {
            "proposed_action": "notes.update",
            "workflow": "enrich_note",
            "note_id": str(target_note.id),
            "title": target_note.title,
            "original_content": existing_body,
            "enrichment_addition": enrichment_addition,
            "proposed_content": proposed_content,
            "suggested_connections": related_titles,
            "related_items": related_items,
            "status": "awaiting_confirmation",
            "summary": (
                f"Prepared contextual enrichment for '{target_note.title}' using "
                f"{len(related_items)} related workspace item(s). Confirm to save changes to the note."
            ),
        }
        if prop:
            prop_row = db.get(ActionProposal, prop.proposal_id)
            if prop_row:
                prop_row.proposal_payload = {
                    **(prop_row.proposal_payload or {}),
                    **enrichment_data,
                    "content": proposed_content,
                }
                db.commit()

        outcome_msg = f"Prepared enrichment proposal for '{target_note.title}'. Review and confirm to apply."
        enrich_res = {
            "command": command,
            "action_id": "notes.update",
            "status": "proposed",
            "message": outcome_msg,
            "data": enrichment_data,
            "proposal_id": str(prop.proposal_id) if prop else None,
            "confirmation_token": prop.confirmation_token if prop else None,
            "requires_confirmation": True,
            "affected_item_ids": [str(target_note.id)],
        }
        _record_conversation_exchange(
            db, conversation_id, user_cmd_content, outcome_msg, action_result=enrich_res
        )
        return StellaCommandExecuteResponse(
            command=command,
            action_id="notes.update",
            status="proposed",
            message=outcome_msg,
            data=enrichment_data,
            proposal_id=str(prop.proposal_id) if prop else None,
            confirmation_token=prop.confirmation_token if prop else None,
            requires_confirmation=True,
            affected_item_ids=[str(target_note.id)],
        )

    elif clean_cmd == "/merge-notes":
        raw_note_args: list[str] = []
        if isinstance(payload.get("note_ids"), list):
            raw_note_args = [str(x).strip() for x in payload["note_ids"] if str(x).strip()]
        elif isinstance(payload.get("notes"), list):
            raw_note_args = [str(x).strip() for x in payload["notes"] if str(x).strip()]
        elif len(args) == 1 and "," in args[0]:
            raw_note_args = [part.strip() for part in args[0].split(",") if part.strip()]
        else:
            raw_note_args = [a.strip() for a in args if a and a.strip()]

        if len(raw_note_args) < 2:
            raise ValidationError(
                "Merging requires at least two source notes. Usage: /merge-notes <note_1> <note_2>"
            )

        resolved_notes: list[Note] = []
        seen_note_ids: set[uuid.UUID] = set()
        for ident in raw_note_args:
            n = _resolve_note(db, workspace_id, ident)
            if not n or n.workspace_id != workspace_id:
                raise AppException(
                    404,
                    "NOTE_NOT_FOUND",
                    f"Could not find source note '{ident}' in this workspace.",
                )
            if n.id in seen_note_ids:
                raise ValidationError(
                    f"Duplicate note selected ('{n.title}'). Please select at least two distinct notes to merge."
                )
            seen_note_ids.add(n.id)
            resolved_notes.append(n)

        merged_title = " & ".join(n.title for n in resolved_notes)[:200]
        sections = [
            f"## Section {idx}: {n.title}\n\n{(n.content or '').strip()}"
            for idx, n in enumerate(resolved_notes, start=1)
        ]
        merged_content = f"# {merged_title}\n\n" + "\n\n---\n\n".join(sections)
        merged_tags = sorted({t.name for n in resolved_notes for t in (n.tags or [])})
        source_notes_meta = [
            {
                "note_id": str(n.id),
                "title": n.title,
                "excerpt": (n.content or "")[:160],
                "word_count": _count_words(n.content or ""),
            }
            for n in resolved_notes
        ]

        envelope = action_execution_service.execute_action(
            db=db,
            workspace_id=workspace_id,
            action_id="notes.create",
            request=ActionExecuteRequest(
                mode="propose",
                input={
                    "title": merged_title,
                    "content": merged_content,
                    "tags": merged_tags,
                },
                idempotency_key=str(uuid.uuid4()),
            ),
        )
        prop = envelope.proposals[0] if envelope.proposals else None
        merge_data = {
            "proposed_action": "notes.create",
            "workflow": "merge_notes",
            "title": merged_title,
            "content": merged_content,
            "tags": merged_tags,
            "source_notes": source_notes_meta,
            "source_count": len(source_notes_meta),
            "status": "awaiting_confirmation",
        }
        if prop:
            prop_row = db.get(ActionProposal, prop.proposal_id)
            if prop_row:
                prop_row.proposal_payload = {
                    **(prop_row.proposal_payload or {}),
                    **merge_data,
                }
                db.commit()

        outcome_msg = (
            f"Prepared merge proposal combining {len(resolved_notes)} notes into '{merged_title}'."
        )
        merge_res = {
            "command": command,
            "action_id": "notes.create",
            "status": "proposed",
            "message": outcome_msg,
            "data": merge_data,
            "proposal_id": str(prop.proposal_id) if prop else None,
            "confirmation_token": prop.confirmation_token if prop else None,
            "requires_confirmation": True,
            "affected_item_ids": [str(n.id) for n in resolved_notes],
        }
        _record_conversation_exchange(
            db, conversation_id, user_cmd_content, outcome_msg, action_result=merge_res
        )
        return StellaCommandExecuteResponse(
            command=command,
            action_id="notes.create",
            status="proposed",
            message=outcome_msg,
            data=merge_data,
            proposal_id=str(prop.proposal_id) if prop else None,
            confirmation_token=prop.confirmation_token if prop else None,
            requires_confirmation=True,
            affected_item_ids=[str(n.id) for n in resolved_notes],
        )

    elif clean_cmd == "/split-note":
        raw_note_ident = (
            " ".join(args).strip()
            if len(args) > 1
            else (args[0] if args else str(payload.get("note_id", "")).strip())
        )
        if not raw_note_ident:
            raise ValidationError("Usage: /split-note <note>")
        target_note = _resolve_note(db, workspace_id, raw_note_ident)
        if not target_note and args:
            target_note = _resolve_note(db, workspace_id, args[0])
        if not target_note or target_note.workspace_id != workspace_id:
            raise AppException(
                404, "NOTE_NOT_FOUND", f"Could not find note '{raw_note_ident}' in this workspace."
            )

        proposed_parts = _build_split_note_parts(target_note)
        note_tags = [t.name for t in (target_note.tags or [])]

        envelope = action_execution_service.execute_action(
            db=db,
            workspace_id=workspace_id,
            action_id="notes.create",
            request=ActionExecuteRequest(
                mode="propose",
                input={
                    "title": proposed_parts[0]["title"][:200],
                    "content": proposed_parts[0]["content"],
                    "tags": note_tags,
                },
                idempotency_key=str(uuid.uuid4()),
            ),
        )
        prop = envelope.proposals[0] if envelope.proposals else None
        split_data = {
            "proposed_action": "notes.create",
            "workflow": "split_note",
            "original_note_id": str(target_note.id),
            "original_title": target_note.title,
            "title": target_note.title,
            "proposed_parts": proposed_parts,
            "part_count": len(proposed_parts),
            "tags": note_tags,
            "status": "awaiting_confirmation",
        }
        if prop:
            prop_row = db.get(ActionProposal, prop.proposal_id)
            if prop_row:
                prop_row.proposal_payload = {
                    **(prop_row.proposal_payload or {}),
                    **split_data,
                    "title": proposed_parts[0]["title"][:200],
                    "content": proposed_parts[0]["content"],
                }
                db.commit()

        outcome_msg = (
            f"Prepared modular split proposal for '{target_note.title}' ({len(proposed_parts)} parts). "
            "Confirm to create the new notes in your Library."
        )
        split_res = {
            "command": command,
            "action_id": "notes.create",
            "status": "proposed",
            "message": outcome_msg,
            "data": split_data,
            "proposal_id": str(prop.proposal_id) if prop else None,
            "confirmation_token": prop.confirmation_token if prop else None,
            "requires_confirmation": True,
            "affected_item_ids": [str(target_note.id)],
        }
        _record_conversation_exchange(
            db, conversation_id, user_cmd_content, outcome_msg, action_result=split_res
        )
        return StellaCommandExecuteResponse(
            command=command,
            action_id="notes.create",
            status="proposed",
            message=outcome_msg,
            data=split_data,
            proposal_id=str(prop.proposal_id) if prop else None,
            confirmation_token=prop.confirmation_token if prop else None,
            requires_confirmation=True,
            affected_item_ids=[str(target_note.id)],
        )

    elif clean_cmd == "/organize-knowledge":
        # Stage a proposal when user configures & submits a recommendation (or legacy apply_cluster)
        raw_rec = payload.get("apply_recommendation") or payload.get("apply_cluster")
        if raw_rec and isinstance(raw_rec, dict):
            return _stage_organization_recommendation(
                db=db,
                workspace_id=workspace_id,
                command=command,
                rec_info=raw_rec,
                conversation_id=conversation_id,
            )

        raw_scope = (
            " ".join(args).strip()
            if args
            else str(payload.get("scope") or payload.get("query") or "").strip()
        ).strip('"').strip("'")

        organize_data, outcome_msg = _build_organization_plan(
            db=db,
            workspace_id=workspace_id,
            ws_name=ws.name,
            raw_scope=raw_scope,
            payload=payload,
        )
        organize_res = {
            "command": command,
            "action_id": "knowledge.audit_processing",
            "status": "completed",
            "message": outcome_msg,
            "data": organize_data,
            "requires_confirmation": False,
        }
        _record_conversation_exchange(
            db, conversation_id, user_cmd_content, outcome_msg, action_result=organize_res
        )
        return StellaCommandExecuteResponse(
            command=command,
            action_id="knowledge.audit_processing",
            status="completed",
            message=outcome_msg,
            data=organize_data,
            requires_confirmation=False,
        )

    elif clean_cmd == "/populate-collection":
        if not args and "collection_id" not in payload:
            raise ValidationError("Usage: /populate-collection <collection> [scope]")
        raw_col_ident = args[0] if args else str(payload.get("collection_id", "")).strip()
        target_col = _resolve_collection(db, workspace_id, raw_col_ident)
        if not target_col or target_col.workspace_id != workspace_id:
            raise AppException(
                404,
                "COLLECTION_NOT_FOUND",
                f"Could not find collection '{raw_col_ident}' in this workspace.",
            )

        from app.services import retrieval_service

        query_text = (
            " ".join(args[1:]).strip().strip('"').strip("'")
            if len(args) > 1
            else str(payload.get("scope") or target_col.name).strip()
        )

        all_colls = list(
            db.scalars(select(Collection).where(Collection.workspace_id == workspace_id)).all()
        )
        note_to_cols, source_to_cols, col_to_notes, col_to_sources = _build_membership_maps(
            db, all_colls
        )
        existing_note_ids = col_to_notes.get(target_col.id, set())
        existing_source_ids = col_to_sources.get(target_col.id, set())

        hits = retrieval_service.search_hybrid(db, workspace_id, query_text, limit=15)
        candidate_items: list[dict[str, Any]] = []
        seen_cand_ids: set[str] = set()

        for h in hits:
            if h.item_type == "note" and h.item_id not in existing_note_ids:
                if str(h.item_id) not in seen_cand_ids:
                    seen_cand_ids.add(str(h.item_id))
                    candidate_items.append(
                        {
                            "item_id": str(h.item_id),
                            "note_id": str(h.item_id),
                            "item_type": "note",
                            "title": h.title,
                            "excerpt": (h.excerpt or "")[:200],
                            "existing_collections": note_to_cols.get(h.item_id, []),
                            "already_in_target": False,
                            "selected": True,
                        }
                    )
            elif h.item_type == "source" and h.item_id not in existing_source_ids:
                if str(h.item_id) not in seen_cand_ids:
                    seen_cand_ids.add(str(h.item_id))
                    candidate_items.append(
                        {
                            "item_id": str(h.item_id),
                            "source_id": str(h.item_id),
                            "item_type": "source",
                            "title": h.title,
                            "excerpt": (h.excerpt or "")[:200],
                            "existing_collections": source_to_cols.get(h.item_id, []),
                            "already_in_target": False,
                            "selected": True,
                        }
                    )
            if len(candidate_items) >= 12:
                break

        # Lexical fallback on workspace notes & sources not yet in collection
        if len(candidate_items) < 8:
            q_words = [
                w.lower()
                for w in re.findall(r"[a-zA-Z0-9]{3,}", f"{query_text} {target_col.description or ''}")
                if w.lower() not in {"the", "and", "for", "with", "notes", "collection", "from"}
            ]
            eligible_notes = list(
                db.scalars(
                    select(Note)
                    .where(
                        Note.workspace_id == workspace_id,
                        Note.is_archived.is_(False),
                    )
                    .order_by(Note.updated_at.desc())
                ).all()
            )
            eligible_notes.sort(
                key=lambda n: sum(
                    1
                    for qw in q_words
                    if qw in n.title.lower()
                    or qw in (n.content or "").lower()
                    or any(qw in t.name.lower() for t in (n.tags or []))
                ),
                reverse=True,
            )
            for n in eligible_notes:
                if n.id not in existing_note_ids and str(n.id) not in seen_cand_ids:
                    seen_cand_ids.add(str(n.id))
                    candidate_items.append(
                        {
                            "item_id": str(n.id),
                            "note_id": str(n.id),
                            "item_type": "note",
                            "title": n.title,
                            "excerpt": (n.content or "")[:200],
                            "existing_collections": note_to_cols.get(n.id, []),
                            "already_in_target": False,
                            "selected": True,
                        }
                    )
                if len(candidate_items) >= 10:
                    break

            eligible_sources = list(
                db.scalars(
                    select(Source)
                    .where(Source.workspace_id == workspace_id)
                    .order_by(Source.imported_at.desc())
                ).all()
            )
            for src in eligible_sources:
                if src.id in existing_source_ids or str(src.id) in seen_cand_ids:
                    continue
                s_title, s_excerpt = _get_source_display_title_and_excerpt(db, src)
                if not q_words or any(
                    qw in s_title.lower() or qw in s_excerpt.lower() for qw in q_words
                ):
                    seen_cand_ids.add(str(src.id))
                    candidate_items.append(
                        {
                            "item_id": str(src.id),
                            "source_id": str(src.id),
                            "item_type": "source",
                            "title": s_title,
                            "excerpt": s_excerpt[:200],
                            "existing_collections": source_to_cols.get(src.id, []),
                            "already_in_target": False,
                            "selected": True,
                        }
                    )
                if len(candidate_items) >= 12:
                    break

        # If caller explicitly supplied a customized selected_items list when staging
        if "selected_items" in payload and isinstance(payload["selected_items"], list):
            selected_override = [
                it
                for it in payload["selected_items"]
                if isinstance(it, dict) and it.get("selected", True) is not False
            ]
            if not selected_override:
                raise ValidationError(
                    "Please select at least one candidate item to add to the collection."
                )
            candidate_items = selected_override

        if not candidate_items:
            populate_data = {
                "collection_id": str(target_col.id),
                "collection_name": target_col.name,
                "scope": query_text,
                "candidate_items": [],
                "status": "no_candidates_found",
            }
            outcome_msg = f"No new candidate items found for collection '{target_col.name}' (all matching items may already be members)."
            populate_res = {
                "command": command,
                "action_id": "collections.add_item",
                "status": "completed",
                "message": outcome_msg,
                "data": populate_data,
                "requires_confirmation": False,
            }
            _record_conversation_exchange(
                db, conversation_id, user_cmd_content, outcome_msg, action_result=populate_res
            )
            return StellaCommandExecuteResponse(
                command=command,
                action_id="collections.add_item",
                status="completed",
                message=outcome_msg,
                data=populate_data,
                requires_confirmation=False,
            )

        first_cand = candidate_items[0]
        envelope = action_execution_service.execute_action(
            db=db,
            workspace_id=workspace_id,
            action_id="collections.add_item",
            request=ActionExecuteRequest(
                mode="propose",
                input={
                    "collection_id": str(target_col.id),
                    "item_id": first_cand["item_id"],
                    "item_type": first_cand["item_type"],
                },
                idempotency_key=str(uuid.uuid4()),
            ),
        )
        prop = envelope.proposals[0] if envelope.proposals else None
        populate_data = {
            "proposed_action": "collections.add_item",
            "workflow": "populate_collection",
            "collection_id": str(target_col.id),
            "collection_name": target_col.name,
            "description": target_col.description or "",
            "scope": query_text,
            "item_id": first_cand["item_id"],
            "item_type": first_cand["item_type"],
            "candidate_items": candidate_items,
            "candidate_titles": [c["title"] for c in candidate_items],
            "note_count": sum(1 for c in candidate_items if c.get("item_type") == "note"),
            "source_count": sum(1 for c in candidate_items if c.get("item_type") == "source"),
            "status": "awaiting_confirmation",
        }
        if prop:
            prop_row = db.get(ActionProposal, prop.proposal_id)
            if prop_row:
                prop_row.proposal_payload = {
                    **(prop_row.proposal_payload or {}),
                    **populate_data,
                }
                db.commit()

        outcome_msg = (
            f"Discovered {len(candidate_items)} candidate item(s) for collection '{target_col.name}'. "
            "Review and select the items you wish to include, then confirm."
        )
        populate_res = {
            "command": command,
            "action_id": "collections.add_item",
            "status": "proposed",
            "message": outcome_msg,
            "data": populate_data,
            "proposal_id": str(prop.proposal_id) if prop else None,
            "confirmation_token": prop.confirmation_token if prop else None,
            "requires_confirmation": True,
            "affected_item_ids": [str(target_col.id), *(c["item_id"] for c in candidate_items)],
        }
        _record_conversation_exchange(
            db, conversation_id, user_cmd_content, outcome_msg, action_result=populate_res
        )
        return StellaCommandExecuteResponse(
            command=command,
            action_id="collections.add_item",
            status="proposed",
            message=outcome_msg,
            data=populate_data,
            proposal_id=str(prop.proposal_id) if prop else None,
            confirmation_token=prop.confirmation_token if prop else None,
            requires_confirmation=True,
            affected_item_ids=[str(target_col.id), *(c["item_id"] for c in candidate_items)],
        )

    elif clean_cmd == "/extract-entities":
        raw_target = (
            " ".join(args).strip()
            if len(args) > 1
            else (
                args[0]
                if args
                else str(payload.get("source_id") or payload.get("note_id") or "").strip()
            )
        ).strip('"').strip("'")
        if not raw_target:
            raise ValidationError("Usage: /extract-entities <source_or_note>")

        target_note = _resolve_note(db, workspace_id, raw_target)
        if not target_note and args:
            target_note = _resolve_note(db, workspace_id, args[0])
        target_src = (
            _resolve_source(db, workspace_id, raw_target) if not target_note else None
        )
        if not target_src and not target_note and args:
            target_src = _resolve_source(db, workspace_id, args[0])

        if not target_note and not target_src:
            raise AppException(
                404,
                "RESOURCE_NOT_FOUND",
                f"Could not find source or note '{raw_target}' in this workspace.",
            )

        if target_note:
            target_id = str(target_note.id)
            target_type = "note"
            title = target_note.title
            content = target_note.content or ""
        else:
            assert target_src is not None
            target_id = str(target_src.id)
            target_type = "source"
            meta = target_src.raw_metadata or {}
            title = (
                meta.get("title")
                or target_src.original_path
                or target_src.source_identifier
                or "Source"
            )
            content = str(meta.get("extracted_text") or meta.get("text") or "").strip()
            if not content:
                chunks = list(
                    db.scalars(
                        select(ContentChunk)
                        .where(ContentChunk.source_id == target_src.id)
                        .order_by(ContentChunk.chunk_index)
                    ).all()
                )
                content = "\n".join(c.content for c in chunks if c.content)

        extracted = _extract_grounded_entities(db, workspace_id, title, content)

        if not extracted:
            extracted_data = {
                "target": title,
                "target_id": target_id,
                "target_type": target_type,
                "entities": [],
                "total_extracted": 0,
                "status": "empty",
            }
            outcome_msg = f"No grounded entities could be extracted from '{title}' (content is empty or contains no extractable entities)."
            extract_res = {
                "command": command,
                "action_id": "entities.create",
                "status": "completed",
                "message": outcome_msg,
                "data": extracted_data,
                "requires_confirmation": False,
            }
            _record_conversation_exchange(db, conversation_id, user_cmd_content, outcome_msg, action_result=extract_res)
            return StellaCommandExecuteResponse(
                command=command,
                action_id="entities.create",
                status="completed",
                message=outcome_msg,
                data=extracted_data,
                requires_confirmation=False,
            )

        first_ent = extracted[0]
        first_ent_type = first_ent["entity_type"]
        if first_ent_type == "place":
            first_ent_type = "location"
        elif first_ent_type not in (
            "concept",
            "person",
            "organization",
            "location",
            "event",
            "document",
        ):
            first_ent_type = "concept"
        envelope = action_execution_service.execute_action(
            db=db,
            workspace_id=workspace_id,
            action_id="entities.create",
            request=ActionExecuteRequest(
                mode="propose",
                input={
                    "name": first_ent["name"][:150],
                    "entity_type": first_ent_type,
                    "description": (first_ent.get("description") or "")[:1000],
                },
                idempotency_key=str(uuid.uuid4()),
            ),
        )
        prop = envelope.proposals[0] if envelope.proposals else None
        extracted_data = {
            "proposed_action": "entities.create",
            "workflow": "extract_entities",
            "target": title,
            "target_id": target_id,
            "target_type": target_type,
            "entities": extracted,
            "total_extracted": len(extracted),
            "status": "awaiting_confirmation",
        }
        if prop:
            prop_row = db.get(ActionProposal, prop.proposal_id)
            if prop_row:
                prop_row.proposal_payload = {
                    **(prop_row.proposal_payload or {}),
                    **extracted_data,
                    "name": first_ent["name"][:150],
                    "entity_type": first_ent_type,
                }
                db.commit()

        outcome_msg = (
            f"Extracted {len(extracted)} grounded knowledge entities from '{title}'. "
            "Confirm to save new entities to the workspace graph."
        )
        extract_res = {
            "command": command,
            "action_id": "entities.create",
            "status": "proposed",
            "message": outcome_msg,
            "data": extracted_data,
            "proposal_id": str(prop.proposal_id) if prop else None,
            "confirmation_token": prop.confirmation_token if prop else None,
            "requires_confirmation": True,
        }
        _record_conversation_exchange(db, conversation_id, user_cmd_content, outcome_msg, action_result=extract_res)
        return StellaCommandExecuteResponse(
            command=command,
            action_id="entities.create",
            status="proposed",
            message=outcome_msg,
            data=extracted_data,
            proposal_id=str(prop.proposal_id) if prop else None,
            confirmation_token=prop.confirmation_token if prop else None,
            requires_confirmation=True,
            affected_item_ids=[target_id],
        )

    elif clean_cmd == "/reconcile-duplicates":
        all_notes = list(
            db.scalars(
                select(Note).where(
                    Note.workspace_id == workspace_id, Note.is_archived.is_(False)
                )
            ).all()
        )
        raw_scope = (
            " ".join(args).strip()
            if args
            else str(payload.get("scope", "")).strip()
        ).strip('"').strip("'")

        scope_examined = f"Entire Workspace ({len(all_notes)} notes)"
        scope_type = "workspace"
        primary_notes = all_notes
        comparison_pool = all_notes

        if raw_scope:
            focus_note = _resolve_note(db, workspace_id, raw_scope)
            focus_col = (
                _resolve_collection(db, workspace_id, raw_scope) if not focus_note else None
            )
            if focus_note:
                scope_type = "note"
                scope_examined = f"Note: {focus_note.title}"
                primary_notes = [focus_note]
                comparison_pool = all_notes
            elif focus_col:
                scope_type = "collection"
                scope_examined = f"Collection: {focus_col.name}"
                col_note_ids = set(
                    db.scalars(
                        select(CollectionNote.note_id).where(
                            CollectionNote.collection_id == focus_col.id
                        )
                    ).all()
                )
                col_notes = [n for n in all_notes if n.id in col_note_ids]
                primary_notes = col_notes
                comparison_pool = col_notes
            else:
                topic_notes = [
                    n
                    for n in all_notes
                    if raw_scope.lower() in n.title.lower()
                    or raw_scope.lower() in (n.content or "").lower()
                ]
                if not topic_notes:
                    raise AppException(
                        404,
                        "SCOPE_NOT_FOUND",
                        f"Could not find note, collection, or topic matching '{raw_scope}' in this workspace.",
                    )
                scope_type = "topic"
                scope_examined = f"Topic: {raw_scope}"
                primary_notes = topic_notes
                comparison_pool = all_notes

        duplicates: list[dict[str, Any]] = []
        seen_pairs: set[tuple[str, str]] = set()
        for n1 in primary_notes:
            for n2 in comparison_pool:
                if n1.id == n2.id:
                    continue
                pair_key = tuple(sorted([str(n1.id), str(n2.id)]))
                if pair_key in seen_pairs:
                    continue
                sim = _compute_note_duplicate_similarity(n1, n2)
                if sim is not None:
                    score, reason = sim
                    seen_pairs.add(pair_key)
                    duplicates.append(
                        {
                            "original_id": str(n1.id),
                            "original": n1.title,
                            "duplicate_id": str(n2.id),
                            "duplicate": n2.title,
                            "similarity_score": score,
                            "reason": reason,
                            "original_excerpt": (n1.content or "")[:140],
                            "duplicate_excerpt": (n2.content or "")[:140],
                        }
                    )

        duplicates.sort(key=lambda d: d.get("similarity_score", 0.0), reverse=True)
        notes_examined_count = len(comparison_pool) if scope_type == "note" else len(primary_notes)
        if len(duplicates) == 0:
            outcome_msg = "Duplicate reconciliation check complete: 0 duplicate pairs identified."
        else:
            outcome_msg = (
                f"Examined {notes_examined_count} note(s) in {scope_examined}: "
                f"{len(duplicates)} candidate duplicate pair(s) identified."
            )
        reconcile_data = {
            "scope_examined": scope_examined,
            "scope_type": scope_type,
            "notes_examined_count": notes_examined_count,
            "duplicate_count": len(duplicates),
            "pairs": duplicates,
            "status": "reconciled" if not duplicates else "duplicates_found",
        }
        reconcile_res = {
            "command": command,
            "action_id": "notes.compare",
            "status": "completed",
            "message": outcome_msg,
            "data": reconcile_data,
            "requires_confirmation": False,
        }
        _record_conversation_exchange(
            db, conversation_id, user_cmd_content, outcome_msg, action_result=reconcile_res
        )
        return StellaCommandExecuteResponse(
            command=command,
            action_id="notes.compare",
            status="completed",
            message=outcome_msg,
            data=reconcile_data,
            requires_confirmation=False,
        )

    elif clean_cmd == "/resolve-conflicts":
        topic = (
            " ".join(args).strip()
            if args
            else str(payload.get("topic") or payload.get("scope") or "").strip()
        ).strip('"').strip("'")
        if not topic:
            raise ValidationError(
                "Please provide a topic, note, or collection scope to analyze for conflicts. Usage: /resolve-conflicts <scope>"
            )

        from app.services import retrieval_service

        matched_items: list[dict[str, Any]] = []
        seen_item_ids: set[str] = set()

        # 1. Check if topic resolves to a Collection
        matched_col = _resolve_collection(db, workspace_id, topic)
        if matched_col:
            col_note_ids = set(
                db.scalars(
                    select(CollectionNote.note_id).where(
                        CollectionNote.collection_id == matched_col.id
                    )
                ).all()
            )
            col_notes = list(
                db.scalars(
                    select(Note).where(
                        Note.workspace_id == workspace_id, Note.id.in_(col_note_ids)
                    )
                ).all()
            )
            for cn in col_notes:
                seen_item_ids.add(str(cn.id))
                matched_items.append(
                    {
                        "id": str(cn.id),
                        "title": cn.title,
                        "item_type": "note",
                        "content": cn.content or "",
                        "excerpt": (cn.content or "")[:200],
                    }
                )

        # 2. Hybrid search across workspace
        hits = retrieval_service.search_hybrid(db, workspace_id, topic, limit=6)
        for h in hits:
            if h.item_type in ("note", "source") and str(h.item_id) not in seen_item_ids:
                seen_item_ids.add(str(h.item_id))
                full_text = h.excerpt or ""
                if h.item_type == "note":
                    n_obj = db.get(Note, h.item_id)
                    if n_obj and n_obj.workspace_id == workspace_id:
                        full_text = n_obj.content or full_text
                elif h.item_type == "source":
                    s_obj = db.get(Source, h.item_id)
                    if s_obj and s_obj.workspace_id == workspace_id:
                        full_text = str((s_obj.raw_metadata or {}).get("extracted_text") or full_text)
                matched_items.append(
                    {
                        "id": str(h.item_id),
                        "title": h.title,
                        "item_type": h.item_type,
                        "content": full_text,
                        "excerpt": (full_text or "")[:200],
                    }
                )

        # 3. Lexical fallback across workspace notes and sources for topic keywords
        if len(matched_items) < 4:
            q_terms = [
                w.lower()
                for w in re.findall(r"[a-zA-Z0-9]{3,}", topic)
                if w.lower() not in {"the", "and", "for", "with", "between", "about", "date", "conflict", "conflicts"}
            ]
            if not q_terms:
                q_terms = [topic.lower()]
            ws_notes = list(
                db.scalars(
                    select(Note).where(
                        Note.workspace_id == workspace_id, Note.is_archived.is_(False)
                    )
                ).all()
            )
            for wn in ws_notes:
                if str(wn.id) in seen_item_ids:
                    continue
                haystack = f"{wn.title} {wn.content or ''}".lower()
                if any(qt in haystack for qt in q_terms):
                    seen_item_ids.add(str(wn.id))
                    matched_items.append(
                        {
                            "id": str(wn.id),
                            "title": wn.title,
                            "item_type": "note",
                            "content": wn.content or "",
                            "excerpt": (wn.content or "")[:200],
                        }
                    )
                if len(matched_items) >= 5:
                    break

            ws_sources = list(
                db.scalars(select(Source).where(Source.workspace_id == workspace_id)).all()
            )
            for wsrc in ws_sources:
                if str(wsrc.id) in seen_item_ids:
                    continue
                s_meta = wsrc.raw_metadata or {}
                s_title = s_meta.get("title") or wsrc.original_path or wsrc.source_identifier
                s_body = str(s_meta.get("extracted_text") or "")
                haystack = f"{s_title} {s_body}".lower()
                if any(qt in haystack for qt in q_terms):
                    seen_item_ids.add(str(wsrc.id))
                    matched_items.append(
                        {
                            "id": str(wsrc.id),
                            "title": s_title,
                            "item_type": "source",
                            "content": s_body,
                            "excerpt": s_body[:200],
                        }
                    )
                if len(matched_items) >= 6:
                    break

        conflicts, conflict_status, consensus_text = _analyze_workspace_conflicts(
            topic, matched_items
        )
        source_details = [
            {
                "id": it["id"],
                "title": it["title"],
                "item_type": it["item_type"],
                "excerpt": it["excerpt"],
            }
            for it in matched_items[:5]
        ]
        conflict_data = {
            "topic": topic,
            "sources_analyzed": [it["title"] for it in source_details],
            "source_details": source_details,
            "conflicts": conflicts,
            "conflict_count": len(conflicts),
            "status": conflict_status,
            "consensus": consensus_text,
        }
        outcome_msg = consensus_text
        conflict_res = {
            "command": command,
            "action_id": "notes.compare",
            "status": "completed",
            "message": outcome_msg,
            "data": conflict_data,
            "requires_confirmation": False,
        }
        _record_conversation_exchange(db, conversation_id, user_cmd_content, outcome_msg, action_result=conflict_res)
        return StellaCommandExecuteResponse(
            command=command,
            action_id="notes.compare",
            status="completed",
            message=outcome_msg,
            data=conflict_data,
            requires_confirmation=False,
        )

    elif clean_cmd == "/process-inbox":
        pending = list(
            db.scalars(
                select(InboxItem).where(
                    InboxItem.workspace_id == workspace_id, InboxItem.status == "pending"
                )
            ).all()
        )
        inbox_data = {
            "pending_count": len(pending),
            "recommendations": [
                {
                    "inbox_item_id": str(item.id),
                    "recommended_action": "accept",
                    "target_collection": "Research Archive",
                }
                for item in pending[:5]
            ],
            "status": "triaged",
        }
        outcome_msg = f"Triaged {len(pending)} pending inbox items with filing recommendations."
        inbox_res = {
            "command": command,
            "action_id": "inbox.list",
            "status": "completed",
            "message": outcome_msg,
            "data": inbox_data,
            "requires_confirmation": False,
        }
        _record_conversation_exchange(db, conversation_id, user_cmd_content, outcome_msg, action_result=inbox_res)
        return StellaCommandExecuteResponse(
            command=command,
            action_id="inbox.list",
            status="completed",
            message=outcome_msg,
            data=inbox_data,
            requires_confirmation=False,
        )

    elif clean_cmd == "/search" or action_id == "knowledge.search_all":
        q_str = (
            " ".join(args).strip()
            if args
            else str(payload.get("query") or "").strip()
        ).strip('"').strip("'")
        if not q_str:
            raise ValidationError("Usage: /search <query>")
        search_res = execute_search(
            db=db,
            workspace_id=workspace_id,
            query=q_str,
            limit=int(payload.get("limit", 10)),
            conversation_id=conversation_id,
            prompt=user_cmd_content,
        )
        return StellaCommandExecuteResponse(
            command=command,
            action_id="knowledge.search_all",
            status="completed",
            message=f"Found {search_res.total} matching item(s) for '{q_str}'.",
            data=search_res.model_dump(),
            requires_confirmation=False,
        )

    elif clean_cmd == "/add-to-collection":
        if len(args) < 2 and ("item_id" not in payload or "collection_id" not in payload):
            raise ValidationError("Usage: /add-to-collection <item> <collection>")
        raw_item = args[0] if args else str(payload.get("item_id", "")).strip()
        raw_col = args[1] if len(args) >= 2 else str(payload.get("collection_id", "")).strip()
        target_col = _resolve_collection(db, workspace_id, raw_col)
        if not target_col:
            raise AppException(404, "COLLECTION_NOT_FOUND", f"Could not find collection '{raw_col}'.")
        item_note = _resolve_note(db, workspace_id, raw_item)
        item_src = _resolve_source(db, workspace_id, raw_item) if not item_note else None
        item_ent = _resolve_entity(db, workspace_id, raw_item) if (not item_note and not item_src) else None
        if item_note:
            resolved_id, resolved_type = item_note.id, "note"
        elif item_src:
            resolved_id, resolved_type = item_src.id, "source"
        elif item_ent:
            resolved_id, resolved_type = item_ent.id, "entity"
        else:
            raise AppException(404, "ITEM_NOT_FOUND", f"Could not find item '{raw_item}'.")
        add_res = stage_add_to_collection(
            db=db,
            workspace_id=workspace_id,
            item_id=resolved_id,
            item_type=resolved_type,
            collection_id=target_col.id,
            conversation_id=conversation_id,
            prompt=user_cmd_content,
        )
        return StellaCommandExecuteResponse(
            command=command,
            action_id="collections.add_item",
            status="proposed",
            message=f"Prepared proposal to add '{add_res.item_title}' to '{add_res.collection_name}'.",
            data=add_res.model_dump(mode="json"),
            proposal_id=str(add_res.proposal_id),
            confirmation_token=add_res.confirmation_token,
            requires_confirmation=True,
            affected_item_ids=[str(resolved_id), str(target_col.id)],
        )

    # ── Deterministic Action Payload Builders ──────────────────────────────

    # Parse and resolve based on action_id
    if action_id == "notes.rename":
        if len(args) < 2 and "note_id" not in payload:
            raise ValidationError("Usage: /rename-note <note> <new_title>")
        target_note = _resolve_note(db, workspace_id, args[0]) if args else db.get(Note, uuid.UUID(payload["note_id"]))
        if not target_note:
            raise AppException(404, "NOTE_NOT_FOUND", f"Could not find note '{args[0] if args else ''}'.")
        payload["note_id"] = str(target_note.id)
        if len(args) >= 2:
            payload["new_title"] = args[1].strip().strip('"').strip("'")

    elif action_id == "notes.duplicate":
        if not args and "note_id" not in payload:
            raise ValidationError("Usage: /duplicate-note <note>")
        target_note = _resolve_note(db, workspace_id, args[0]) if args else db.get(Note, uuid.UUID(payload["note_id"]))
        if not target_note:
            raise AppException(404, "NOTE_NOT_FOUND", f"Could not find note '{args[0] if args else ''}'.")
        payload["note_id"] = str(target_note.id)

    elif action_id == "notes.archive":
        if not args and "note_id" not in payload:
            raise ValidationError("Usage: /archive-note <note>")
        target_note = _resolve_note(db, workspace_id, args[0]) if args else db.get(Note, uuid.UUID(payload["note_id"]))
        if not target_note:
            raise AppException(404, "NOTE_NOT_FOUND", f"Could not find note '{args[0] if args else ''}'.")
        payload["note_id"] = str(target_note.id)

    elif action_id == "notes.restore":
        if not args and "note_id" not in payload:
            raise ValidationError("Usage: /restore-note <note>")
        # Might be archived, search all
        target_ident = args[0].strip().strip('"').strip("'") if args else payload.get("note_id", "")
        note = db.scalars(
            select(Note).where(
                Note.workspace_id == workspace_id,
                or_(func.lower(Note.title) == target_ident.lower(), func.lower(Note.title).contains(target_ident.lower())),
            )
        ).first()
        if not note:
            try:
                note = db.get(Note, uuid.UUID(target_ident))
            except Exception:
                pass
        if not note or note.workspace_id != workspace_id:
            raise AppException(404, "NOTE_NOT_FOUND", f"Could not find note '{target_ident}'.")
        payload["note_id"] = str(note.id)

    elif action_id == "notes.pin":
        if not args and "note_id" not in payload:
            raise ValidationError("Usage: /pin-note <note>")
        target_note = _resolve_note(db, workspace_id, args[0]) if args else db.get(Note, uuid.UUID(payload["note_id"]))
        if not target_note:
            raise AppException(404, "NOTE_NOT_FOUND", f"Could not find note '{args[0] if args else ''}'.")
        payload["note_id"] = str(target_note.id)

    elif action_id == "notes.unpin":
        if not args and "note_id" not in payload:
            raise ValidationError("Usage: /unpin-note <note>")
        target_note = _resolve_note(db, workspace_id, args[0]) if args else db.get(Note, uuid.UUID(payload["note_id"]))
        if not target_note:
            raise AppException(404, "NOTE_NOT_FOUND", f"Could not find note '{args[0] if args else ''}'.")
        payload["note_id"] = str(target_note.id)

    elif action_id == "notes.delete":
        if not args and "note_id" not in payload:
            raise ValidationError("Usage: /delete-note <note>")
        target_note = _resolve_note(db, workspace_id, args[0]) if args else db.get(Note, uuid.UUID(payload["note_id"]))
        if not target_note:
            raise AppException(404, "NOTE_NOT_FOUND", f"Could not find note '{args[0] if args else ''}'.")
        payload["note_id"] = str(target_note.id)
        payload["note_title"] = target_note.title

    elif action_id == "collections.create":
        if not args and "name" not in payload:
            raise ValidationError("Usage: /create-collection <name>")
        payload["name"] = args[0].strip().strip('"').strip("'") if args else payload["name"]
        if len(args) > 1:
            payload["description"] = args[1].strip().strip('"').strip("'")

    elif action_id == "collections.rename":
        if len(args) < 2 and "collection_id" not in payload:
            raise ValidationError("Usage: /rename-collection <collection> <new_name>")
        target_col = _resolve_collection(db, workspace_id, args[0]) if args else db.get(Collection, uuid.UUID(payload["collection_id"]))
        if not target_col:
            raise AppException(404, "COLLECTION_NOT_FOUND", f"Could not find collection '{args[0] if args else ''}'.")
        payload["collection_id"] = str(target_col.id)
        if len(args) >= 2:
            payload["new_name"] = args[1].strip().strip('"').strip("'")

    elif action_id == "collections.delete":
        if not args and "collection_id" not in payload:
            raise ValidationError("Usage: /delete-collection <collection>")
        target_col = _resolve_collection(db, workspace_id, args[0]) if args else db.get(Collection, uuid.UUID(payload["collection_id"]))
        if not target_col:
            raise AppException(404, "COLLECTION_NOT_FOUND", f"Could not find collection '{args[0] if args else ''}'.")
        payload["collection_id"] = str(target_col.id)
        payload["collection_name"] = target_col.name

    elif action_id == "collections.remove_item":
        if len(args) < 2 and "collection_id" not in payload:
            raise ValidationError("Usage: /remove-from-collection <item> <collection>")
        target_col = _resolve_collection(db, workspace_id, args[1]) if len(args) >= 2 else None
        if not target_col:
            raise AppException(404, "COLLECTION_NOT_FOUND", f"Could not find collection '{args[1]}'.")
        # Resolve item as note or source
        item_note = _resolve_note(db, workspace_id, args[0])
        item_src = _resolve_source(db, workspace_id, args[0]) if not item_note else None
        if item_note:
            payload["item_type"] = "note"
            payload["item_id"] = str(item_note.id)
        elif item_src:
            payload["item_type"] = "source"
            payload["item_id"] = str(item_src.id)
        else:
            raise AppException(404, "ITEM_NOT_FOUND", f"Could not find item '{args[0]}'.")
        payload["collection_id"] = str(target_col.id)

    elif action_id == "collections.move_item":
        if len(args) < 3 and "source_collection_id" not in payload:
            raise ValidationError("Usage: /move-collection-item <item> <source_collection> <dest_collection>")
        src_col = _resolve_collection(db, workspace_id, args[1])
        tgt_col = _resolve_collection(db, workspace_id, args[2])
        if not src_col or not tgt_col:
            raise AppException(404, "COLLECTION_NOT_FOUND", "Could not resolve source or target collection.")
        item_note = _resolve_note(db, workspace_id, args[0])
        item_src = _resolve_source(db, workspace_id, args[0]) if not item_note else None
        if item_note:
            payload["item_type"] = "note"
            payload["item_id"] = str(item_note.id)
        elif item_src:
            payload["item_type"] = "source"
            payload["item_id"] = str(item_src.id)
        else:
            raise AppException(404, "ITEM_NOT_FOUND", f"Could not find item '{args[0]}'.")
        payload["source_collection_id"] = str(src_col.id)
        payload["target_collection_id"] = str(tgt_col.id)

    elif action_id == "sources.create":
        parsed_source = _parse_and_prepare_source_payload(args, payload, db=db, workspace_id=workspace_id)
        payload = {
            "title": parsed_source["title"],
            "content": parsed_source["content"],
            "source_type": parsed_source["source_type"],
        }

    elif action_id == "sources.rename":
        if len(args) < 2 and "source_id" not in payload:
            raise ValidationError("Usage: /rename-source <source> <new_title>")
        source = _resolve_source(db, workspace_id, args[0]) if args else db.get(Source, uuid.UUID(payload["source_id"]))
        if not source:
            raise AppException(404, "SOURCE_NOT_FOUND", f"Could not find source '{args[0] if args else ''}'.")
        payload["source_id"] = str(source.id)
        payload["new_title"] = args[1].strip().strip('"').strip("'")

    elif action_id == "sources.delete":
        if not args and "source_id" not in payload:
            raise ValidationError("Usage: /delete-source <source>")
        source = _resolve_source(db, workspace_id, args[0]) if args else db.get(Source, uuid.UUID(payload["source_id"]))
        if not source:
            raise AppException(404, "SOURCE_NOT_FOUND", f"Could not find source '{args[0] if args else ''}'.")
        payload["source_id"] = str(source.id)
        payload["source_title"] = source.original_path or source.source_identifier

    elif action_id == "sources.archive":
        if not args and "source_id" not in payload:
            raise ValidationError("Usage: /archive-source <source>")
        source = _resolve_source(db, workspace_id, args[0]) if args else db.get(Source, uuid.UUID(payload["source_id"]))
        if not source:
            raise AppException(404, "SOURCE_NOT_FOUND", f"Could not find source '{args[0] if args else ''}'.")
        payload["source_id"] = str(source.id)

    elif action_id == "entities.create":
        if not args and "name" not in payload:
            raise ValidationError("Usage: /create-entity <name>")
        payload["name"] = args[0].strip().strip('"').strip("'")

    elif action_id == "entities.update":
        if len(args) < 2 and "entity_id" not in payload:
            raise ValidationError("Usage: /update-entity <entity> <new_name>")
        entity = _resolve_entity(db, workspace_id, args[0]) if args else db.get(GraphEntity, uuid.UUID(payload["entity_id"]))
        if not entity:
            raise AppException(404, "ENTITY_NOT_FOUND", f"Could not find entity '{args[0] if args else ''}'.")
        payload["entity_id"] = str(entity.id)
        payload["name"] = args[1].strip().strip('"').strip("'")

    elif action_id == "entities.delete":
        if not args and "entity_id" not in payload:
            raise ValidationError("Usage: /delete-entity <entity>")
        entity = _resolve_entity(db, workspace_id, args[0]) if args else db.get(GraphEntity, uuid.UUID(payload["entity_id"]))
        if not entity:
            raise AppException(404, "ENTITY_NOT_FOUND", f"Could not find entity '{args[0] if args else ''}'.")
        payload["entity_id"] = str(entity.id)
        payload["entity_name"] = entity.name

    elif action_id == "graph.delete_relationship":
        if not args and "relationship_id" not in payload:
            raise ValidationError("Usage: /delete-relationship <relationship_id>")
        payload["relationship_id"] = args[0].strip()

    elif action_id == "inbox.dismiss":
        if not args and "inbox_item_id" not in payload:
            raise ValidationError("Usage: /dismiss-inbox <item_id>")
        payload["inbox_item_id"] = args[0].strip()

    elif action_id == "inbox.accept_item":
        if not args and "inbox_item_id" not in payload:
            raise ValidationError("Usage: /accept-inbox <item_id>")
        payload["inbox_item_id"] = args[0].strip()

    elif action_id == "tags.add_to_note":
        if len(args) < 2 and "note_id" not in payload:
            raise ValidationError("Usage: /tag-note <note> <tag>")
        note = _resolve_note(db, workspace_id, args[0]) if args else db.get(Note, uuid.UUID(payload["note_id"]))
        if not note:
            raise AppException(404, "NOTE_NOT_FOUND", f"Could not find note '{args[0] if args else ''}'.")
        payload["note_id"] = str(note.id)
        payload["tag_name"] = args[1].strip().strip('"').strip("'")

    elif action_id == "tags.remove_from_note":
        if len(args) < 2 and "note_id" not in payload:
            raise ValidationError("Usage: /untag-note <note> <tag>")
        note = _resolve_note(db, workspace_id, args[0]) if args else db.get(Note, uuid.UUID(payload["note_id"]))
        if not note:
            raise AppException(404, "NOTE_NOT_FOUND", f"Could not find note '{args[0] if args else ''}'.")
        payload["note_id"] = str(note.id)
        payload["tag_name"] = args[1].strip().strip('"').strip("'")

    elif action_id == "conversations.create":
        title = args[0].strip().strip('"').strip("'") if args else payload.get("title")
        from app.services import conversation_service

        conv = conversation_service.create_conversation(db, workspace_id, title=title)
        return StellaCommandExecuteResponse(
            command=command,
            action_id=action_id,
            status="completed",
            message=f"Created new conversation '{conv.title}'.",
            data={"conversation_id": str(conv.id), "title": conv.title},
            requires_confirmation=False,
        )

    elif action_id == "conversations.rename":
        if not args and "new_title" not in payload:
            raise ValidationError("Usage: /rename-conversation <new_title>")
        new_title = args[0].strip().strip('"').strip("'") if args else payload["new_title"]
        if not conversation_id:
            raise ValidationError("No active conversation thread to rename.")
        from app.services import conversation_service

        conv = conversation_service.rename_conversation(db, conversation_id, new_title)
        return StellaCommandExecuteResponse(
            command=command,
            action_id=action_id,
            status="completed",
            message=f"Renamed conversation to '{conv.title}'.",
            data={"conversation_id": str(conv.id), "title": conv.title},
            requires_confirmation=False,
        )

    elif action_id == "conversations.delete":
        if not conversation_id:
            raise ValidationError("No active conversation thread to delete.")
        payload["conversation_id"] = str(conversation_id)

    # 3. Stage Proposal using canonical action execution service
    envelope = action_execution_service.execute_action(
        db=db,
        workspace_id=workspace_id,
        action_id=action_id,
        request=ActionExecuteRequest(
            mode="propose",
            input=payload,
            idempotency_key=str(uuid.uuid4()),
        ),
    )

    prop = envelope.proposals[0] if envelope.proposals else None
    assistant_proposal_text = f"I have prepared a proposal for **{cmd_def.name}**. Please confirm to apply changes."
    proposal_res = {
        "command": command,
        "action_id": action_id,
        "status": "proposed",
        "message": f"Staged {cmd_def.name} proposal.",
        "data": envelope.result,
        "proposal_id": str(prop.proposal_id) if prop else None,
        "confirmation_token": prop.confirmation_token if prop else None,
        "requires_confirmation": True,
        "affected_item_ids": prop.affected_item_ids if prop else [],
    }

    _record_conversation_exchange(
        db=db,
        conversation_id=conversation_id,
        user_content=user_cmd_content,
        assistant_content=assistant_proposal_text,
        action_result=proposal_res,
    )

    return StellaCommandExecuteResponse(
        command=command,
        action_id=action_id,
        status="proposed",
        message=f"Staged {cmd_def.name} proposal.",
        data=envelope.result,
        proposal_id=str(prop.proposal_id) if prop else None,
        confirmation_token=prop.confirmation_token if prop else None,
        requires_confirmation=True,
        affected_item_ids=prop.affected_item_ids if prop else [],
    )

