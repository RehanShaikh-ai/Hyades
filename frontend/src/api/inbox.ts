import { InboxItem } from '../types/v0_4_2';

const API_BASE = '/api/v1';

export async function listInboxItems(workspaceId: string, status?: string): Promise<InboxItem[]> {
  const url = new URL(`${window.location.origin}${API_BASE}/workspaces/${workspaceId}/inbox`);
  if (status) url.searchParams.set('status', status);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to list inbox items');
  const data = await res.json();
  return data.items;
}

export async function acceptInboxItem(workspaceId: string, inboxItemId: string): Promise<InboxItem> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/inbox/${inboxItemId}/accept`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to accept inbox item');
  return res.json();
}

export async function rejectInboxItem(workspaceId: string, inboxItemId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/inbox/${inboxItemId}/reject`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to reject inbox item');
}
