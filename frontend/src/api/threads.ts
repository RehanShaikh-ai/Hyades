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
  if (status) {
    query.append('status', status);
    query.append('status_filter', status);
  }
  return apiClient.request<ThreadListResponse>(`/threads?${query.toString()}`);
}

export async function getThread(id: string): Promise<Thread> {
  return apiClient.request<Thread>(`/threads/${id}`);
}

export async function createThread(data: {
  workspace_id: string;
  title: string;
  question?: string | null;
  guiding_question?: string | null;
  status?: string;
  created_by?: string | null;
}): Promise<Thread> {
  const payload = {
    workspace_id: data.workspace_id,
    title: data.title,
    question: data.question || data.guiding_question || null,
    status: data.status || 'active',
    created_by: data.created_by,
  };
  return apiClient.request<Thread>('/threads', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateThread(
  id: string,
  data: {
    title?: string;
    question?: string | null;
    guiding_question?: string | null;
    status?: 'active' | 'archived';
  }
): Promise<Thread> {
  const payload: Record<string, unknown> = {};
  if (data.title !== undefined) payload.title = data.title;
  if (data.question !== undefined || data.guiding_question !== undefined) {
    payload.question = data.question ?? data.guiding_question ?? null;
  }
  if (data.status !== undefined) payload.status = data.status;

  return apiClient.request<Thread>(`/threads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteThread(id: string): Promise<void> {
  return apiClient.request<void>(`/threads/${id}`, {
    method: 'DELETE',
  });
}

export async function listThreadQuestions(threadId: string): Promise<ThreadQuestion[]> {
  return apiClient.request<ThreadQuestion[]>(`/threads/${threadId}/questions`);
}

export async function addThreadQuestion(
  threadId: string,
  data: { text?: string; question?: string }
): Promise<ThreadQuestion> {
  return apiClient.request<ThreadQuestion>(`/threads/${threadId}/questions`, {
    method: 'POST',
    body: JSON.stringify({ text: data.text || data.question || '' }),
  });
}

export async function updateThreadQuestion(
  threadId: string,
  questionId: string,
  data: { text?: string; question?: string; is_resolved?: boolean; status?: 'open' | 'answered' }
): Promise<ThreadQuestion> {
  const is_resolved =
    data.is_resolved !== undefined
      ? data.is_resolved
      : data.status !== undefined
      ? data.status === 'answered'
      : undefined;

  const payload: Record<string, unknown> = {};
  if (is_resolved !== undefined) payload.is_resolved = is_resolved;
  if (data.text || data.question) payload.text = data.text || data.question;

  return apiClient.request<ThreadQuestion>(`/threads/${threadId}/questions/${questionId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteThreadQuestion(threadId: string, questionId: string): Promise<void> {
  return apiClient.request<void>(`/threads/${threadId}/questions/${questionId}`, {
    method: 'DELETE',
  });
}

export async function listThreadDiscoveries(threadId: string): Promise<ThreadDiscovery[]> {
  return apiClient.request<ThreadDiscovery[]>(`/threads/${threadId}/discoveries`);
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

export async function deleteThreadDiscovery(threadId: string, discoveryId: string): Promise<void> {
  return apiClient.request<void>(`/threads/${threadId}/discoveries/${discoveryId}`, {
    method: 'DELETE',
  });
}

export async function listThreadItems(
  threadId: string,
  page = 1,
  pageSize = 50
): Promise<{ items: any[]; total: number; page: number; page_size: number }> {
  return apiClient.request<{ items: any[]; total: number; page: number; page_size: number }>(
    `/threads/${threadId}/items?page=${page}&page_size=${pageSize}`
  );
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
  const res = await apiClient.request<{ thread_id: string; items: ThreadActivityItem[]; total: number } | ThreadActivityItem[]>(
    `/threads/${threadId}/activity`
  );
  if (Array.isArray(res)) return res;
  return res.items || [];
}
