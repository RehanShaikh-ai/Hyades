import { apiClient } from './client';
import { Workspace, WorkspaceCreate, WorkspaceListResponse } from '@/types/workspaces';

/**
 * Canonical workspace API module (§16.2).
 * Relative to VITE_API_BASE_URL ({VITE_API_BASE_URL}/workspaces) without repeating /api/v1.
 */

export async function createWorkspace(data: WorkspaceCreate): Promise<Workspace> {
  return apiClient.post<Workspace>('/workspaces', data);
}

export async function getWorkspace(workspaceId: string): Promise<Workspace> {
  return apiClient.get<Workspace>(`/workspaces/${encodeURIComponent(workspaceId)}`);
}

export async function getWorkspaces(): Promise<WorkspaceListResponse> {
  return apiClient.get<WorkspaceListResponse>('/workspaces');
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  return apiClient.delete<void>(`/workspaces/${encodeURIComponent(workspaceId)}`);
}
