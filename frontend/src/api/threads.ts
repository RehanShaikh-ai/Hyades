import { apiClient } from './client';
import {
  Thread,
  ThreadListResponse,
  ThreadQuestion,
  ThreadDiscovery,
  ThreadActivityItem,
} from '@/types/threads';

export async function listThreads(
  workspaceId: string,
  status?: string,
  page = 1,
  pageSize = 20
): Promise<ThreadListResponse> {
  const query = new URLSearchParams({
    workspace_id: workspaceId,
    page: String(page),
    page_size: String(pageSize),
  });
  if (status) query.append('status', status);
  return apiClient.request<ThreadListResponse>(`/threads?${query.toString()}`);
}

export async function getThread(id: string): Promise<Thread> {
  return apiClient.request<Thread>(`/threads/${id}`);
}

export async function createThread(data: {
  workspace_id: string;
  title: string;
  guiding_question?: string | null;
  status?: string;
  created_by?: string | null;
}): Promise<Thread> {
  return apiClient.request<Thread>('/threads', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateThread(
  id: string,
  data: {
    title?: string;
    guiding_question?: string | null;
    status?: 'active' | 'archived';
  }
): Promise<Thread> {
  return apiClient.request<Thread>(`/threads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteThread(id: string): Promise<void> {
  return apiClient.request<void>(`/threads/${id}`, {
    method: 'DELETE',
  });
}

export async function addThreadQuestion(
  threadId: string,
  data: { question: string }
): Promise<ThreadQuestion> {
  return apiClient.request<ThreadQuestion>(`/threads/${threadId}/questions`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateThreadQuestion(
  threadId: string,
  questionId: string,
  data: { question?: string; status?: 'open' | 'answered' }
): Promise<ThreadQuestion> {
  return apiClient.request<ThreadQuestion>(`/threads/${threadId}/questions/${questionId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function addThreadDiscovery(
  threadId: string,
  data: { content: string }
): Promise<ThreadDiscovery> {
  return apiClient.request<ThreadDiscovery>(`/threads/${threadId}/discoveries`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function addThreadItem(
  threadId: string,
  data: { item_type: string; item_id: string }
): Promise<unknown> {
  return apiClient.request<unknown>(`/threads/${threadId}/items`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function removeThreadItem(
  threadId: string,
  itemType: string,
  itemId: string
): Promise<void> {
  return apiClient.request<void>(`/threads/${threadId}/items/${itemType}/${itemId}`, {
    method: 'DELETE',
  });
}

export async function getThreadActivity(threadId: string): Promise<ThreadActivityItem[]> {
  return apiClient.request<ThreadActivityItem[]>(`/threads/${threadId}/activity`);
}
