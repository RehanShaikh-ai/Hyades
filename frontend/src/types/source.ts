export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
export type SourceType = 'markdown' | 'text' | 'pdf' | 'obsidian_vault' | 'obsidian_note';

export type SourceProcessingStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
export type SourceProcessingStage =
  | 'upload'
  | 'extract'
  | 'normalize'
  | 'chunk'
  | 'embed'
  | 'index'
  | 'complete';

export interface LinkedNote {
  note_id: string;
  title?: string;
  created_at?: string;
}

export interface Source {
  id: string;
  workspace_id: string;
  title?: string;
  file_name?: string;
  note_id?: string | null;
  source_type?: SourceType;
  original_path?: string;
  source_identifier?: string;
  content_hash?: string;
  import_batch_id?: string | null;
  import_status?: ImportStatus;
  processing_stage?: SourceProcessingStage | string;
  processing_status: SourceProcessingStatus;
  file_size_bytes?: number | null;
  page_count?: number | null;
  chunk_count?: number | null;
  error_stage?: string | null;
  error_message?: string | null;
  raw_metadata?: Record<string, unknown> | null;
  extracted_text?: string | null;
  linked_notes?: LinkedNote[];
  imported_at?: string;
  created_at?: string;
  updated_at?: string | null;
  last_synced_at?: string | null;
}

export interface DetectedNote {
  original_path: string;
  title: string;
  tag_count: number;
  outgoing_link_count: number;
  is_duplicate: boolean;
  will_update_existing: boolean;
}

export interface SourcePreviewResult {
  detected_notes: DetectedNote[];
  unresolved_link_count: number;
  warnings: string[];
  errors: string[];
}

export interface SourceImportResultItem {
  original_path: string;
  status: ImportStatus;
  note_id: string | null;
  error: string | null;
}

export interface SourceImportResult {
  import_batch_id: string;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  removed_since_last_import: number;
  results: SourceImportResultItem[];
}

export interface SourceListResponse {
  items: Source[];
  total: number;
  page: number;
  page_size: number;
}
