import { apiClient } from './client';
import {
  ActionCatalogueResponse,
  ActionResultEnvelope,
  ExecuteActionRequest,
  ExecutionListResponse,
} from '@/types/actions';

/**
 * Retrieve canonical action catalogue from the authoritative backend registry.
 * CONTRACT §3.3, §5, §7
 */
export async function getActionCatalogue(): Promise<ActionCatalogueResponse> {
  const response = await apiClient.get<ActionCatalogueResponse | ActionCatalogueResponse['actions']>('/actions');
  // Handle both array envelope { actions: [...] } and bare array [...] for API robustness
  if (Array.isArray(response)) {
    return { actions: response, total: response.length };
  }
  return response;
}

/**
 * Validate and start an action execution.
 * CONTRACT §5.1, §6.2
 */
export async function executeAction(
  actionId: string,
  request: ExecuteActionRequest,
  workspaceId?: string
): Promise<ActionResultEnvelope> {
  const query = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : '';
  return apiClient.post<ActionResultEnvelope>(`/actions/${encodeURIComponent(actionId)}/execute${query}`, request);
}

/**
 * Return execution status, progress, evidence, proposals, and result.
 * CONTRACT §5, §6.1, §9
 */
export async function getExecution(executionId: string): Promise<ActionResultEnvelope> {
  return apiClient.get<ActionResultEnvelope>(`/actions/executions/${encodeURIComponent(executionId)}`);
}

/**
 * Request cancellation of an active execution.
 * CONTRACT §5, §6.8
 */
export async function cancelExecution(executionId: string): Promise<ActionResultEnvelope> {
  return apiClient.post<ActionResultEnvelope>(`/actions/executions/${encodeURIComponent(executionId)}/cancel`);
}

/**
 * List executions within current workspace with pagination support.
 * CONTRACT §5, §10.1
 */
export async function listExecutions(params?: {
  workspace_id?: string;
  action_id?: string;
  status?: string;
  page?: number;
  page_size?: number;
}): Promise<ExecutionListResponse> {
  const query = new URLSearchParams();
  if (params?.workspace_id) query.append('workspace_id', params.workspace_id);
  if (params?.action_id) query.append('action_id', params.action_id);
  if (params?.status) query.append('status', params.status);
  if (params?.page !== undefined) query.append('page', String(params.page));
  if (params?.page_size !== undefined) query.append('page_size', String(params.page_size));

  const qs = query.toString();
  return apiClient.get<ExecutionListResponse>(`/actions/executions${qs ? `?${qs}` : ''}`);
}

/**
 * Request undo for a supported mutation.
 * CONTRACT §6.5
 */
export async function undoExecution(executionId: string): Promise<ActionResultEnvelope> {
  return apiClient.post<ActionResultEnvelope>(`/actions/executions/${encodeURIComponent(executionId)}/undo`);
}
