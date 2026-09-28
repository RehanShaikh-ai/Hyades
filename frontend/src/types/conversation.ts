export interface Conversation {
  id: string;
  workspace_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationListResponse {
  items: Conversation[];
  total: number;
  page?: number;
  page_size?: number;
}

export interface ConversationCreate {
  title?: string;
}

export interface ConversationRenameRequest {
  title: string;
}
