import { apiClient } from './client';
import {
  Message,
  MessageListResponse,
  SendMessageResponse,
} from '@/types/message';

export interface SendMessagePayload {
  content: string;
  stream?: boolean;
}

export interface ListMessagesParams {
  page?: number;
  page_size?: number;
}

export async function sendMessage(
  conversationId: string,
  payload: SendMessagePayload
): Promise<SendMessageResponse> {
  return apiClient.post<SendMessageResponse>(
    `/conversations/${conversationId}/messages`,
    payload
  );
}

export async function listMessages(
  conversationId: string,
  params?: ListMessagesParams
): Promise<MessageListResponse> {
  const query = new URLSearchParams();
  if (params?.page !== undefined) query.append('page', params.page.toString());
  if (params?.page_size !== undefined) {
    query.append('page_size', params.page_size.toString());
  }
  const queryString = query.toString() ? `?${query.toString()}` : '';
  return apiClient.get<MessageListResponse>(
    `/conversations/${conversationId}/messages${queryString}`
  );
}

export async function getMessage(messageId: string): Promise<Message> {
  return apiClient.get<Message>(`/messages/${messageId}`);
}
