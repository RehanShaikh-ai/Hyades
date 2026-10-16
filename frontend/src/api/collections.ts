import { apiClient } from './client';
import {
  Collection,
  CollectionListResponse,
  CollectionStats,
  CollectionRelatedResponse,
  KnowledgeItem,
  KnowledgeItemType,
} from '@/types/collections';

export async function listCollections(
  workspaceId: string,
  page = 1,
  pageSize = 20
): Promise<CollectionListResponse> {
  return apiClient.request<CollectionListResponse>(
    `/collections?workspace_id=${workspaceId}&page=${page}&page_size=${pageSize}`
  );
}

export async function getCollection(id: string): Promise<Collection> {
  return apiClient.request<Collection>(`/collections/${id}`);
}

export async function createCollection(data: {
  workspace_id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  created_by?: string | null;
}): Promise<Collection> {
  return apiClient.request<Collection>('/collections', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCollection(
  id: string,
  data: {
    name?: string;
    description?: string | null;
    icon?: string | null;
  }
): Promise<Collection> {
  return apiClient.request<Collection>(`/collections/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteCollection(id: string): Promise<void> {
  return apiClient.request<void>(`/collections/${id}`, {
    method: 'DELETE',
  });
}

export async function getCollectionStats(id: string): Promise<CollectionStats> {
  return apiClient.request<CollectionStats>(`/collections/${id}/stats`);
}

export async function getCollectionRelated(id: string): Promise<CollectionRelatedResponse> {
  return apiClient.request<CollectionRelatedResponse>(`/collections/${id}/related`);
}

export async function addKnowledgeItem(
  collectionId: string,
  data: { item_type: KnowledgeItemType; item_id: string }
): Promise<KnowledgeItem> {
  return apiClient.request<KnowledgeItem>(`/collections/${collectionId}/items`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listKnowledgeItems(
  collectionId: string,
  page = 1,
  pageSize = 50
): Promise<{ items: KnowledgeItem[]; total: number; page: number; page_size: number }> {
  return apiClient.request<{ items: KnowledgeItem[]; total: number; page: number; page_size: number }>(
    `/collections/${collectionId}/items?page=${page}&page_size=${pageSize}`
  );
}

export async function removeKnowledgeItem(
  collectionId: string,
  itemType: KnowledgeItemType,
  itemId: string
): Promise<void> {
  return apiClient.request<void>(`/collections/${collectionId}/items/${itemType}/${itemId}`, {
    method: 'DELETE',
  });
}
