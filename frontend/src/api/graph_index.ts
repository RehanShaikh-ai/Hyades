import { apiClient } from './client';
import { ExtractionJobResponse } from '@/types/jobs';

export async function triggerExtraction(workspaceId: string, noteIds?: string[]): Promise<ExtractionJobResponse> {
  if (noteIds && noteIds.length > 0) {
    return apiClient.post<ExtractionJobResponse>(`/workspaces/${workspaceId}/graph/extract`, { note_ids: noteIds });
  }
  return apiClient.post<ExtractionJobResponse>(`/workspaces/${workspaceId}/graph/extract`);
}

export async function triggerReindex(workspaceId: string): Promise<ExtractionJobResponse> {
  return apiClient.post<ExtractionJobResponse>(`/workspaces/${workspaceId}/graph/reindex`);
}

