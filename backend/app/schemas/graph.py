"""Knowledge Graph Pydantic schemas.

Canonical schemas per CONTRACT v0.3.2 §5.2, §9.1, §9.2.
"""

import uuid

from pydantic import BaseModel, ConfigDict, Field

# ── v0.3.2 Entity-Level Graph Schemas ─────────────────────────────────────────


class GraphNodeResponse(BaseModel):
    """A node in the workspace knowledge graph representing an entity."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    entity_type: str
    description: str | None = None
    cluster_id: uuid.UUID | None = None
    is_manual: bool = False
    degree: int = 0
    note_count: int = 0


class GraphEdgeResponse(BaseModel):
    """An edge representing a relationship between two entities."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_entity_id: uuid.UUID
    target_entity_id: uuid.UUID
    relationship_type: str
    confidence: float = 1.0
    is_manual: bool = False


class GraphClusterSummary(BaseModel):
    """Cluster summary in workspace graph response."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    label: str
    member_count: int = 0


class GraphStats(BaseModel):
    """Factual statistics about the graph structure."""

    node_count: int = 0
    edge_count: int = 0
    cluster_count: int = 0
    isolated_count: int = 0
    truncated: bool = False


class GraphResponse(BaseModel):
    """Response schema for workspace graph endpoint."""

    nodes: list[GraphNodeResponse] = Field(default_factory=list)
    edges: list[GraphEdgeResponse] = Field(default_factory=list)
    clusters: list[GraphClusterSummary] = Field(default_factory=list)
    stats: GraphStats


class EntityNeighborhoodResponse(BaseModel):
    """1-hop entity neighborhood graph response."""

    nodes: list[GraphNodeResponse] = Field(default_factory=list)
    edges: list[GraphEdgeResponse] = Field(default_factory=list)
    clusters: list[GraphClusterSummary] = Field(default_factory=list)
    stats: GraphStats


# ── Search & Provenance Schemas ───────────────────────────────────────────────


class GraphSearchEntityMatch(BaseModel):
    """Entity search match."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    entity_type: str
    match_field: str = "name"


class GraphSearchNoteMatch(BaseModel):
    """Note search match connected to graph."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    match_reason: str


class GraphSearchResponse(BaseModel):
    """Response schema for graph search."""

    entities: list[GraphSearchEntityMatch] = Field(default_factory=list)
    notes: list[GraphSearchNoteMatch] = Field(default_factory=list)
    total: int = 0


class EntitySourceResponse(BaseModel):
    """Source chunk provenance for an entity."""

    model_config = ConfigDict(from_attributes=True)

    chunk_id: uuid.UUID
    note_id: uuid.UUID
    note_title: str
    excerpt: str
    extraction_model: str
    confidence: float


class EntityProvenanceResponse(BaseModel):
    """Provenance response for an entity."""

    entity_id: uuid.UUID
    sources: list[EntitySourceResponse] = Field(default_factory=list)


# ── v0.2.2 Note-Level Graph Compatibility Schemas ─────────────────────────────


class GraphNode(BaseModel):
    """A note node in the note-level neighborhood graph."""

    id: uuid.UUID
    title: str
    is_pinned: bool = False
    tag_names: list[str] = Field(default_factory=list)
    degree: int = 0


class GraphEdge(BaseModel):
    """An edge between two notes in the note-level neighborhood graph."""

    source_note_id: uuid.UUID
    target_note_id: uuid.UUID


class NoteGraphResponse(BaseModel):
    """Note-level neighborhood graph response."""

    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)
    stats: GraphStats
