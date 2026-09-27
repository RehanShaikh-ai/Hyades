export type MessageRole = 'user' | 'assistant';

export interface MessageCitation {
  id?: string;
  message_id?: string;
  chunk_id: string;
  note_id?: string | null;
  source_id?: string | null;
  source_title?: string | null;
  note_title?: string | null;
  title?: string;
  excerpt: string;
  similarity_score: number; // 0.0 to 1.0 — labelled 'Similarity' in the UI (never 'Confidence')
  page_number?: number | null;
  rank?: number;
  workspace_id?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  workspace_id?: string;
  role: MessageRole;
  content: string;
  provider?: string | null;
  model?: string | null;
  latency_ms?: number | null;
  citations?: MessageCitation[];
  created_at: string;
}

export interface MessageListResponse {
  items: Message[];
  total: number;
  page?: number;
  page_size?: number;
}

export interface SendMessageResponse {
  user_message: Message;
  assistant_message: Message;
}
