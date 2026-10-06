import { SavedView, SavedViewCreate } from '../types/v0_4_2';

const API_BASE = '/api/v1';

export async function listSavedViews(workspaceId: string): Promise<SavedView[]> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/saved-views`);
  if (!res.ok) throw new Error('Failed to list saved views');
  const data = await res.json();
  return data.items;
}

export async function createSavedView(workspaceId: string, data: SavedViewCreate): Promise<SavedView> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/saved-views`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to save view');
  return res.json();
}

export async function deleteSavedView(workspaceId: string, savedViewId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/saved-views/${savedViewId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete saved view');
}
