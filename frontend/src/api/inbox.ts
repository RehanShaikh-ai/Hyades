import { apiClient } from './client';
import {
  InboxItem,
  InboxListResponse,
  InboxAcceptResponse,
  InboxRejectResponse,
} from '@/types/inbox';
import { Source } from '@/types/source';

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
): Promise<Source> {
  const formData = new FormData();
  formData.append('file', file);

  return apiClient.upload<Source>(
    `/sources/upload?workspace_id=${encodeURIComponent(workspaceId)}&review_mode=inbox`,
    formData
  );
}