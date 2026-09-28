"""Schemas package.

Exports canonical schemas per contract §5.2 (v0.2.1/v0.3.1/v0.3.2) and CONTRACT v0.4.1 §4.2.
"""

from app.schemas.activity import ActivityItem, ActivityResponse
from app.schemas.assistant import (
    AssistantQueryRequest,
    AssistantResponse,
    AssistantStreamEvent,
)
from app.schemas.cluster import (
    ClusterListResponse,
    ClusterMemberResponse,
    ClusterResponse,
)
from app.schemas.content_chunk import ContentChunkResponse
from app.schemas.conversation import (
    ConversationCreate,
    ConversationListResponse,
    ConversationRenameRequest,
    ConversationResponse,
)
from app.schemas.dashboard import DashboardResponse
from app.schemas.errors import ErrorDetail, ErrorResponse
from app.schemas.graph import (
    EntityNeighborhoodResponse,
    EntityProvenanceResponse,
    EntitySourceResponse,
    GraphClusterSummary,
    GraphEdge,
    GraphEdgeResponse,
    GraphNode,
    GraphNodeResponse,
    GraphResponse,
    GraphSearchEntityMatch,
    GraphSearchNoteMatch,
    GraphSearchResponse,
    GraphStats,
    NoteGraphResponse,
)
from app.schemas.graph_entity import (
    GraphEntityCreate,
    GraphEntityResponse,
    GraphEntityUpdate,
)
from app.schemas.graph_rag import (
    GraphRAGContext,
    GraphRAGRequest,
    GraphRAGResponse,
    GraphTraversedEntity,
    GraphUsedRelationship,
)
from app.schemas.graph_relationship import (
    GraphRelationshipCreate,
    GraphRelationshipResponse,
    GraphRelationshipUpdate,
)
from app.schemas.health import HealthResponse
from app.schemas.job import (
    ExtractionJobResponse,
    IndexJobRequest,
    IndexJobResponse,
    JobStatusResponse,
)
from app.schemas.link_suggestion import (
    LinkSuggestionDecisionRequest,
    LinkSuggestionListResponse,
    LinkSuggestionResponse,
)
from app.schemas.message import (
    MessageCitationResponse,
    MessageCreate,
    MessageResponse,
)
from app.schemas.note import (
    NoteCreate,
    NoteListResponse,
    NoteResponse,
    NoteSearchResponse,
    NoteSourceAttribution,
    NoteUpdate,
)
from app.schemas.note_link import NoteLinkCreate, NoteLinkResponse, NoteLinksResponse
from app.schemas.rag import CitedSource, RAGRequest, RAGResponse
from app.schemas.saved_search import SavedSearchCreate, SavedSearchListResponse, SavedSearchResponse
from app.schemas.search import SearchRequest, SearchResponse, SearchResultItem
from app.schemas.source import (
    DetectedNote,
    SourceImportResponse,
    SourceImportResult,
    SourceLinkRequest,
    SourceListResponse,
    SourceNoteLink,
    SourcePreviewResponse,
    SourceProcessingStatusResponse,
    SourceResponse,
)
from app.schemas.tag import TagCreate, TagListResponse, TagResponse
from app.schemas.user import UserCreate, UserListResponse, UserResponse
from app.schemas.version import (
    AIEditApproveRequest,
    AIEditResponse,
    DiffResponse,
    NoteVersionListResponse,
    NoteVersionResponse,
    RestoreRequest,
)
from app.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceListResponse,
    WorkspaceResponse,
)

__all__ = [
    # v0.2.x
    "DashboardResponse",
    "DetectedNote",
    "ErrorDetail",
    "ErrorResponse",
    "GraphEdge",
    "GraphNode",
    "GraphResponse",
    "GraphStats",
    "HealthResponse",
    "NoteCreate",
    "NoteLinkCreate",
    "NoteLinkResponse",
    "NoteLinksResponse",
    "NoteListResponse",
    "NoteResponse",
    "NoteSearchResponse",
    "NoteSourceAttribution",
    "NoteUpdate",
    "SourceImportResponse",
    "SourceImportResult",
    "SourceListResponse",
    "SourcePreviewResponse",
    "SourceResponse",
    "TagCreate",
    "TagListResponse",
    "TagResponse",
    "UserCreate",
    "UserListResponse",
    "UserResponse",
    "WorkspaceCreate",
    "WorkspaceListResponse",
    "WorkspaceResponse",
    # v0.3.1 (CONTRACT §5.2)
    "ActivityItem",
    "ActivityResponse",
    "AIEditApproveRequest",
    "AIEditResponse",
    "CitedSource",
    "DiffResponse",
    "IndexJobRequest",
    "IndexJobResponse",
    "JobStatusResponse",
    "NoteVersionListResponse",
    "NoteVersionResponse",
    "RAGRequest",
    "RAGResponse",
    "RestoreRequest",
    "SavedSearchCreate",
    "SavedSearchListResponse",
    "SavedSearchResponse",
    "SearchRequest",
    "SearchResponse",
    "SearchResultItem",
    # v0.3.2 (CONTRACT §5.2)
    "ClusterListResponse",
    "ClusterMemberResponse",
    "ClusterResponse",
    "EntityNeighborhoodResponse",
    "EntityProvenanceResponse",
    "EntitySourceResponse",
    "ExtractionJobResponse",
    "GraphClusterSummary",
    "GraphEdgeResponse",
    "GraphEntityCreate",
    "GraphEntityResponse",
    "GraphEntityUpdate",
    "GraphNodeResponse",
    "GraphRAGContext",
    "GraphRAGRequest",
    "GraphRAGResponse",
    "GraphRelationshipCreate",
    "GraphRelationshipResponse",
    "GraphRelationshipUpdate",
    "GraphSearchEntityMatch",
    "GraphSearchNoteMatch",
    "GraphSearchResponse",
    "GraphTraversedEntity",
    "GraphUsedRelationship",
    "LinkSuggestionDecisionRequest",
    "LinkSuggestionListResponse",
    "LinkSuggestionResponse",
    "NoteGraphResponse",
    # v0.4.1 (CONTRACT §4.2)
    "AssistantQueryRequest",
    "AssistantResponse",
    "AssistantStreamEvent",
    "ContentChunkResponse",
    "ConversationCreate",
    "ConversationListResponse",
    "ConversationRenameRequest",
    "ConversationResponse",
    "MessageCitationResponse",
    "MessageCreate",
    "MessageResponse",
    "SourceLinkRequest",
    "SourceNoteLink",
    "SourceProcessingStatusResponse",
]
