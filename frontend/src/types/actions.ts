/**
 * Action Catalogue and Execution System Types
 * Hyades v0.5.1 Contract (§3.1, §3.3, §5, §6, §7, §8, §9, §10)
 */

export type ActionClassification = 'read' | 'propose' | 'write' | 'destructive';

export type ExecutionMode = 'read' | 'propose' | 'commit';

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'proposed'
  | 'awaiting_confirmation'
  | 'succeeded'
  | 'failed'
  | 'cancelling'
  | 'cancelled';

export interface JsonSchemaProperty {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  title?: string;
  description?: string;
  default?: unknown;
  enum?: (string | number | boolean)[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  minimum?: number;
  maximum?: number;
  format?: string;
}

export interface JsonSchema {
  type?: 'object';
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface ActionDefinition {
  id: string; // e.g. "notes.summarize", format "<domain>.<verb>"
  name: string;
  description: string;
  input_schema: JsonSchema;
  output_schema?: JsonSchema;
  side_effect: ActionClassification;
  timeout_class?: string;
  disabled_reason?: string | null;
}

export interface ActionCatalogueResponse {
  actions: ActionDefinition[];
  total?: number;
}

export interface ActionEvidenceItem {
  chunk_id?: string | null;
  source_id?: string | null;
  similarity_score?: number | null; // MUST NEVER be labeled as confidence (§8.2)
  item_type?: string | null;
  item_id?: string | null;
  excerpt?: string | null;
  reference?: string | null;
  title?: string | null;
}

export interface ActionProposal {
  id: string;
  execution_id: string;
  action_id: string;
  proposal_payload: Record<string, unknown>;
  affected_item_ids: string[];
  confirmation_token?: string;
  expires_at?: string;
  status: 'pending' | 'committed' | 'rejected' | 'expired';
  created_at?: string;
  committed_at?: string | null;
  rejected_at?: string | null;
}

export interface CommittedChange {
  change_set_id?: string;
  execution_id?: string;
  action_id?: string;
  item_id: string;
  item_type?: string;
  before_state?: unknown;
  after_state?: unknown;
  committed_at: string;
  undo_supported?: boolean;
  undo_status?: 'available' | 'undone' | 'expired' | 'ineligible';
}

export interface ActionResultEnvelope<T = unknown> {
  execution_id: string;
  action_id: string;
  status: ExecutionStatus;
  initiated_by: 'user' | 'agent';
  result: T;
  evidence: ActionEvidenceItem[];
  interpretation: string | null;
  proposals: ActionProposal[];
  committed_changes: CommittedChange[];
  duration_ms: number;
  error_code?: string | null;
  error_message?: string | null;
  current_stage?: string | null;
  total_items?: number | null;
  completed_items?: number | null;
  failed_items?: number | null;
  created_at?: string;
  started_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
}

export interface ExecuteActionRequest {
  mode: ExecutionMode;
  input: Record<string, unknown>;
  idempotency_key: string;
  confirmation_token?: string;
}

export interface ExecutionListResponse {
  items: ActionResultEnvelope[];
  total: number;
  page: number;
  page_size: number;
  total_pages?: number;
}
