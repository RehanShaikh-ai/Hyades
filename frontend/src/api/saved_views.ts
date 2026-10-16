import { apiClient } from './client';
import {
  SavedView,
  SavedViewListResponse,
  SavedViewState,
  SavedViewRestoreResult,
} from '@/types/saved_views';

export async function listSavedViews(
  workspaceId: string,
  page = 1,
  pageSize = 20
): Promise<SavedViewListResponse> {
  return apiClient.request<SavedViewListResponse>(
    `/saved-views?workspace_id=${workspaceId}&page=${page}&page_size=${pageSize}`
  );
}

export async function getSavedView(id: string): Promise<SavedView> {
  return apiClient.request<SavedView>(`/saved-views/${id}`);
}

export async function createSavedView(data: {
  workspace_id: string;
  name: string;
  state: SavedViewState;
  created_by?: string | null;
}): Promise<SavedView> {
  return apiClient.request<SavedView>('/saved-views', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSavedView(
  id: string,
  data: {
    name?: string;
    state?: SavedViewState;
  }
): Promise<SavedView> {
  return apiClient.request<SavedView>(`/saved-views/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteSavedView(id: string): Promise<void> {
  return apiClient.request<void>(`/saved-views/${id}`, {
    method: 'DELETE',
  });
}

export async function restoreSavedView(id: string): Promise<SavedViewRestoreResult> {
  return apiClient.request<SavedViewRestoreResult>(`/saved-views/${id}/restore`, {
    method: 'POST',
  });
}
