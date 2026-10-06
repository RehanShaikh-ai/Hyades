export type KnowledgeItemType = 'note' | 'source' | 'entity' | 'conversation';

export interface KnowledgeItem {
  item_type: KnowledgeItemType;
  item_id: string;
  title: string;
  added_at: string;
  metadata?: Record<string, any>;
}

export interface KnowledgeItemAddRequest {
  item_type: KnowledgeItemType;
  item_id: string;
}

export interface Collection {
  id: string;
  workspace_id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CollectionCreate {
  name: string;
  description?: string;
  icon?: string;
}

export interface CollectionStats {
  collection_id: string;
  note_count: number;
  source_count: number;
  entity_count: number;
  conversation_count: number;
}

export interface CollectionRelatedEntity {
  id: string;
  name: string;
  entity_type: string;
  connection_count: number;
}

export interface Thread {
  id: string;
  workspace_id: string;
  title: string;
  question?: string | null;
  status: 'active' | 'archived';
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ThreadCreate {
  title: string;
  question?: string;
}

export interface ThreadQuestion {
  id: string;
  thread_id: string;
  text: string;
  is_resolved: boolean;
  created_at: string;
  updated_at: string;
}

export interface ThreadDiscovery {
  id: string;
  thread_id: string;
  content: string;
  created_at: string;
}

export interface ThreadActivityItem {
  id: string;
  activity_type: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface SavedViewState {
  version: number;
  zoom: number;
  center: { x: number; y: number };
  filters: Record<string, any>;
  focus_entity_ids: string[];
}

export interface SavedView {
  id: string;
  workspace_id: string;
  name: string;
  state: SavedViewState;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SavedViewCreate {
  name: string;
  state: SavedViewState;
}

export interface InboxItem {
  id: string;
  workspace_id: string;
  source_id: string;
  status: string;
  detection_status: string;
  detected_count: number;
  detected_entities?: Array<{ name: string; entity_type: string; confidence: number }> | null;
  detection_truncated: boolean;
  extraction_job_id?: string | null;
  created_at: string;
  decided_at?: string | null;
  source_title?: string | null;
  source_type?: string | null;
  file_size_bytes?: number | null;
  extract_knowledge: boolean;
}
