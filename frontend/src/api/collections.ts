import { Collection, CollectionCreate, CollectionStats, KnowledgeItem } from '../types/v0_4_2';

const API_BASE = '/api/v1';

export async function listCollections(workspaceId: string): Promise<Collection[]> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/collections`);
  if (!res.ok) throw new Error('Failed to list collections');
  const data = await res.json();
  return data.items;
}

export async function createCollection(workspaceId: string, data: CollectionCreate): Promise<Collection> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create collection');
  return res.json();
}

export async function getCollectionStats(workspaceId: string, collectionId: string): Promise<CollectionStats> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/collections/${collectionId}/stats`);
  if (!res.ok) throw new Error('Failed to fetch collection stats');
  return res.json();
}

export async function getCollectionItems(workspaceId: string, collectionId: string): Promise<KnowledgeItem[]> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/collections/${collectionId}/items`);
  if (!res.ok) throw new Error('Failed to fetch collection items');
  const data = await res.json();
  return data.items;
}

export async function deleteCollection(workspaceId: string, collectionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/collections/${collectionId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete collection');
}
