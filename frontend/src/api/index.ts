import { apiClient } from './client';
import { IndexJobRequest, IndexJobResponse } from '../types/jobs';

/**
 * Triggers an indexing job for a workspace or specific notes.
 * 
 * If note_ids is absent or empty, a full workspace reindex is queued.
 * The endpoint returns immediately with the job ID and status.
 */
export async function indexWorkspace(
  workspaceId: string,
  request?: IndexJobRequest
): Promise<IndexJobResponse> {
  return apiClient.post<IndexJobResponse>(
    `/workspaces/${workspaceId}/index`,
    request || {}
  );
}

export * from './collections';
export * from './threads';
export * from './saved_views';
export * from './inbox';
export * from './actions';
