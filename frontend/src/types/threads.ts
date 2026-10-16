export type ThreadStatus = 'active' | 'archived';

export interface ThreadQuestion {
  id: string;
  question: string;
  status: 'open' | 'answered';
  created_at: string;
  updated_at: string;
}

export interface ThreadDiscovery {
  id: string;
  content: string;
  created_at: string;
}

export interface ThreadActivityItem {
  type: 'question' | 'discovery' | 'membership';
  id: string;
  summary: string;
  timestamp: string;
}

export interface Thread {
  id: string;
  workspace_id: string;
  title: string;
  guiding_question?: string | null;
  status: ThreadStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  questions?: ThreadQuestion[];
  discoveries?: ThreadDiscovery[];
}

export interface ThreadListResponse {
  items: Thread[];
  total: number;
  page: number;
  page_size: number;
}
