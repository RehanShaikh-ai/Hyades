import { apiClient } from './client';
import {
  InboxItem,
  InboxListResponse,
  InboxAcceptResponse,
  InboxRejectResponse,
} from '@/types/inbox';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';

export async function listInbox(
  workspaceId: string,
  status?: string,
  page = 1,
  pageSize = 20
): Promise<InboxListResponse> {
  const query = new URLSearchParams({
    workspace_id: workspaceId,
    page: String(page),
    page_size: String(pageSize),
  });
  if (status) query.append('status', status);
  return apiClient.request<InboxListResponse>(`/inbox?${query.toString()}`);
}

export async function getInboxItem(id: string): Promise<InboxItem> {
  return apiClient.request<InboxItem>(`/inbox/${id}`);
}

export async function updateInboxItem(
  id: string,
  data: { source_title?: string; extract_knowledge?: boolean }
): Promise<InboxItem> {
  return apiClient.request<InboxItem>(`/inbox/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function acceptInboxItem(id: string): Promise<InboxAcceptResponse> {
  return apiClient.request<InboxAcceptResponse>(`/inbox/${id}/accept`, {
    method: 'POST',
  });
}

export async function rejectInboxItem(id: string): Promise<InboxRejectResponse> {
  return apiClient.request<InboxRejectResponse>(`/inbox/${id}/reject`, {
    method: 'POST',
  });
}

export async function redetectInboxItem(id: string): Promise<InboxItem> {
  return apiClient.request<InboxItem>(`/inbox/${id}/redetect`, {
    method: 'POST',
  });
}

export async function uploadToInbox(
  workspaceId: string,
  file: File
): Promise<unknown> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(
    `${API_BASE_URL.replace(/\/+$/, '')}/sources/upload?workspace_id=${workspaceId}&review_mode=inbox`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || 'Failed to upload source to Inbox');
  }

  return res.json();
}
