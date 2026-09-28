"""Models package.

Canonical module per contract §8.1 (v0.2.1), CONTRACT v0.3.1 §5.1,
CONTRACT v0.3.2 §5.1, and CONTRACT v0.4.1 §4.1, §6.1-§6.6.
Exports all domain models so they are registered on Base.metadata
and Alembic can auto-generate accurate migration diffs.

v0.2.x models: Note, NoteLink, NoteTag, Source, Tag, User, Workspace
v0.3.1 models: IndexJob, NoteVersion, SavedSearch
v0.3.2 models: GraphEntity, GraphRelationship, EntityChunk,
               NoteCluster, NoteClusterMember, LinkSuggestion
v0.4.1 models: ContentChunk (unifying note & source chunks),
               Conversation, Message, MessageCitation, SourceNoteLink
"""

from app.models.content_chunk import ContentChunk
from app.models.conversation import Conversation
from app.models.entity_chunk import EntityChunk
from app.models.graph_entity import GraphEntity
from app.models.graph_relationship import GraphRelationship
from app.models.index_job import IndexJob
from app.models.link_suggestion import LinkSuggestion
from app.models.message import Message
from app.models.message_citation import MessageCitation
from app.models.note import Note
from app.models.note_cluster import NoteCluster
from app.models.note_cluster_member import NoteClusterMember
from app.models.note_link import NoteLink
from app.models.note_tag import NoteTag
from app.models.note_version import NoteVersion
from app.models.saved_search import SavedSearch
from app.models.source import Source
from app.models.source_note_link import SourceNoteLink
from app.models.tag import Tag
from app.models.user import User
from app.models.workspace import Workspace

__all__ = [
    # v0.2.x
    "Note",
    "NoteLink",
    "NoteTag",
    "Source",
    "Tag",
    "User",
    "Workspace",
    # v0.3.1
    "IndexJob",
    "NoteVersion",
    "SavedSearch",
    # v0.3.2
    "EntityChunk",
    "GraphEntity",
    "GraphRelationship",
    "LinkSuggestion",
    "NoteCluster",
    "NoteClusterMember",
    # v0.4.1
    "ContentChunk",
    "Conversation",
    "Message",
    "MessageCitation",
    "SourceNoteLink",
]
