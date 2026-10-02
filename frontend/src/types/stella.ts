export interface CitedSourceItem {
  chunk_id: string;
  note_id?: string | null;
  source_id?: string | null;
  title: string;
  excerpt: string;
  score: number;
}

export interface LocalDisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citations?: CitedSourceItem[];
  latencyMs?: number;
  model?: string;
  error?: string;
}
