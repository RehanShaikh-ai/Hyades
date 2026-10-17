export type ThreadStatus = 'active' | 'archived';

export interface ThreadQuestion {
  id: string;
  thread_id?: string;
  text?: string;
  question?: string;
  is_resolved?: boolean;
  status?: 'open' | 'answered';
  created_at: string;
  updated_at?: string;
}

export interface ThreadDiscovery {
  id: string;
  thread_id?: string;
  content: string;
  created_at: string;
}

export interface ThreadActivityItem {
  activity_type?: string;
  type?: string;
  id?: string;
  summary: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface Thread {
  id: string;
  workspace_id: string;
  title: string;
  question?: string | null;
  guiding_question?: string | null;
  status: ThreadStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  question_count?: number;
  discovery_count?: number;
  item_count?: number;
  questions?: ThreadQuestion[];
  discoveries?: ThreadDiscovery[];
}

export interface ThreadListResponse {
  items: Thread[];
  total: number;
  page: number;
  page_size: number;
}
