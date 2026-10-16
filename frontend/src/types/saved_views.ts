export interface CenterPoint {
  x: number;
  y: number;
}

export interface SavedViewState {
  version: number;
  zoom: number;
  center: CenterPoint;
  filters: Record<string, unknown>;
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

export interface SavedViewListResponse {
  items: SavedView[];
  total: number;
  page: number;
  page_size: number;
}

export interface SavedViewRestoreResult {
  id: string;
  name: string;
  state: SavedViewState;
  active_focus_entity_ids: string[];
  missing_focus_entity_ids: string[];
}
