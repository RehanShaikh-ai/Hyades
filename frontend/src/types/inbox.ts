export interface DetectedConcept {
  name: string;
  type: string;
  description?: string | null;
}

export interface InboxItem {
  id: string;
  workspace_id: string;
  source_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  detection_status: 'queued' | 'processing' | 'completed' | 'failed' | 'not_applicable';
  detected_count: number;
  detection_truncated: boolean;
  created_at: string;
  decided_at?: string | null;
  source_title: string;
  source_type: string;
  file_size_bytes?: number | null;
  extract_knowledge: boolean;
  detected_entities?: DetectedConcept[];
  raw_metadata?: Record<string, unknown> | null;
}

export interface InboxListResponse {
  items: InboxItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface InboxAcceptResponse {
  status: 'accepted';
  inbox_item_id: string;
  source_id: string;
  extraction_started: boolean;
}

export interface InboxRejectResponse {
  status: 'rejected';
  deleted_source_id: string;
}
