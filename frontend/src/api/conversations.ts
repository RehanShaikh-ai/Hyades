import { apiClient } from './client';
import {
  Conversation,
  ConversationListResponse,
  ConversationCreate,
  ConversationRenameRequest,
} from '@/types/conversation';

export interface ListConversationsParams {
  page?: number;
  page_size?: number;
}

export async function createConversation(
  workspaceId: string,
  payload?: ConversationCreate
): Promise<Conversation> {
  return apiClient.post<Conversation>(
    `/workspaces/${workspaceId}/conversations`,
    payload || {}
  );
}

export async function listConversations(
  workspaceId: string,
  params?: ListConversationsParams
): Promise<ConversationListResponse> {
  const query = new URLSearchParams();
  if (params?.page !== undefined) query.append('page', params.page.toString());
  if (params?.page_size !== undefined) {
    query.append('page_size', params.page_size.toString());
  }
  const queryString = query.toString() ? `?${query.toString()}` : '';
  return apiClient.get<ConversationListResponse>(
    `/workspaces/${workspaceId}/conversations${queryString}`
  );
}

export async function getConversation(
  conversationId: string
): Promise<Conversation> {
  return apiClient.get<Conversation>(`/conversations/${conversationId}`);
}

export async function renameConversation(
  conversationId: string,
  title: string
): Promise<Conversation> {
  const payload: ConversationRenameRequest = { title };
  return apiClient.patch<Conversation>(
    `/conversations/${conversationId}`,
    payload
  );
}

export async function deleteConversation(
  conversationId: string
): Promise<void> {
  return apiClient.delete<void>(`/conversations/${conversationId}`);
}
