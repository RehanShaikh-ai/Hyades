export interface GraphNodeResponse {
  id: string;
  name: string;
  title?: string;
  entity_type: string;
  description?: string | null;
  cluster_id?: string | null;
  is_manual: boolean;
  degree: number;
  note_count: number;
}

export interface GraphEdgeResponse {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  confidence: number;
  is_manual: boolean;
}

export interface GraphClusterSummary {
  id: string;
  label: string;
  member_count: number;
}

export interface GraphStats {
  node_count: number;
  edge_count: number;
  cluster_count: number;
  truncated: boolean;
}

export interface GraphResponse {
  nodes: GraphNodeResponse[];
  edges: GraphEdgeResponse[];
  clusters: GraphClusterSummary[];
  stats: GraphStats;
}

export interface GraphQueryParams {
  entity_type?: string;
  cluster_id?: string;
  note_id?: string;
  relationship_type?: string;
  min_confidence?: number;
  limit?: number;
}

export interface ObservatoryTarget {
  entityId?: string;
  sourceId?: string;
  noteId?: string;
  relationshipId?: string;
  entityName?: string;
}

