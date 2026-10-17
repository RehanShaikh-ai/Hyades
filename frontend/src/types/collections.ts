export type KnowledgeItemType = 'note' | 'source' | 'entity' | 'conversation';

export interface KnowledgeItem {
  item_type: KnowledgeItemType;
  item_id: string;
  title: string;
  added_at: string;
  metadata?: Record<string, unknown>;
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

export interface CollectionListResponse {
  items: Collection[];
  total: number;
  page: number;
  page_size: number;
}

export interface CollectionStats {
  collection_id: string;
  total_items: number;
  by_type: Record<string, number>;
}

export interface RelatedKnowledgeItem {
  id: string;
  name: string;
  entity_type: string;
  via_item_id: string;
  via_item_type: string;
  via_item_title: string;
}

export interface CollectionRelatedResponse {
  collection_id: string;
  related_entities: RelatedKnowledgeItem[];
  total_related: number;
}
