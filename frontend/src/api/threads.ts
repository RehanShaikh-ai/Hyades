import { Thread, ThreadCreate, ThreadQuestion, ThreadDiscovery, ThreadActivityItem, KnowledgeItem } from '../types/v0_4_2';

const API_BASE = '/api/v1';

export async function listThreads(workspaceId: string, status?: string): Promise<Thread[]> {
  const url = new URL(`${window.location.origin}${API_BASE}/workspaces/${workspaceId}/threads`);
  if (status) url.searchParams.set('status', status);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to list threads');
  const data = await res.json();
  return data.items;
}

export async function createThread(workspaceId: string, data: ThreadCreate): Promise<Thread> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create thread');
  return res.json();
}

export async function getThreadItems(workspaceId: string, threadId: string): Promise<KnowledgeItem[]> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/threads/${threadId}/items`);
  if (!res.ok) throw new Error('Failed to fetch thread items');
  const data = await res.json();
  return data.items;
}

export async function listThreadQuestions(workspaceId: string, threadId: string): Promise<ThreadQuestion[]> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/threads/${threadId}/questions`);
  if (!res.ok) throw new Error('Failed to fetch thread questions');
  return res.json();
}

export async function addThreadQuestion(workspaceId: string, threadId: string, text: string): Promise<ThreadQuestion> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/threads/${threadId}/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('Failed to add question');
  return res.json();
}

export async function listThreadDiscoveries(workspaceId: string, threadId: string): Promise<ThreadDiscovery[]> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/threads/${threadId}/discoveries`);
  if (!res.ok) throw new Error('Failed to fetch thread discoveries');
  return res.json();
}

export async function addThreadDiscovery(workspaceId: string, threadId: string, content: string): Promise<ThreadDiscovery> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/threads/${threadId}/discoveries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('Failed to add discovery');
  return res.json();
}

export async function getThreadActivity(workspaceId: string, threadId: string): Promise<ThreadActivityItem[]> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/threads/${threadId}/activity`);
  if (!res.ok) throw new Error('Failed to fetch thread activity');
  const data = await res.json();
  return data.items;
}
