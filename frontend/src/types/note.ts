import { Tag } from './tag';

export interface Note {
  id: string;
  workspace_id: string;
  created_by: string;
  title: string;
  content: string;
  is_pinned: boolean;
  is_archived: boolean;
  extract_knowledge?: boolean;
  tags: Tag[];
  created_at: string;
  updated_at: string;
  source?: {
    source_type: string;
    original_path: string;
  } | null;
  metadata?: {
    origin?: string;
    is_merged?: boolean;
    merged_at?: string;
    merged_source_ids?: string[];
    merged_source_titles?: string[];
    source_count?: number;
    [key: string]: any;
  } | null;
}

export interface NoteCreate {
  title: string;
  content: string;
  created_by: string;
}

export interface NoteUpdate {
  title?: string;
  content?: string;
  is_pinned?: boolean;
  is_archived?: boolean;
  extract_knowledge?: boolean;
}

export interface NoteListResponse {
  items: Note[];
  total: number;
  page: number;
  page_size: number;
}

export interface NoteSearchResponse {
  items: Note[];
  total: number;
  page: number;
  page_size: number;
  query: string;
}
