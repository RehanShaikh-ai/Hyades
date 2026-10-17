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


export interface ExtractionStatusItem {
  id: string;
  type: 'note' | 'source';
  title: string;
  extract_knowledge: boolean;
  status: 'extracted' | 'pending' | 'failed' | 'ineligible';
  error_message?: string | null;
}

export interface ExtractionCategorySummary {
  total: number;
  eligible: number;
  extracted: number;
  pending: number;
  failed: number;
  ineligible: number;
}

export interface ExtractionStatusResponse {
  total_items: number;
  eligible_count: number;
  extracted_count: number;
  pending_count: number;
  failed_count: number;
  ineligible_count: number;
  summary: string;
  notes: ExtractionCategorySummary;
  sources: ExtractionCategorySummary;
  items: ExtractionStatusItem[];
}

export async function getExtractionStatus(workspaceId: string): Promise<ExtractionStatusResponse> {
  return apiClient.get<ExtractionStatusResponse>(`/workspaces/${workspaceId}/graph/extraction-status`);
}
