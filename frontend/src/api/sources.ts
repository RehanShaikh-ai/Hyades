import { apiClient } from './client';
import {
  Source,
  SourceListResponse,
  SourcePreviewResult,
  SourceImportResult,
} from '@/types/source';

export interface ListSourcesParams {
  page?: number;
  page_size?: number;
  processing_status?: string;
}

export async function uploadSource(
  workspaceId: string,
  file: File,
  reviewMode?: string
): Promise<Source> {
  const formData = new FormData();
  formData.append('file', file);

  const query = reviewMode ? `?review_mode=${encodeURIComponent(reviewMode)}` : '';
  return apiClient.upload<Source>(
    `/workspaces/${workspaceId}/sources/upload${query}`,
    formData
  );
}

export async function listSources(
  workspaceId: string,
  pageOrParams?: number | ListSourcesParams,
  pageSize = 100
): Promise<SourceListResponse> {
  const params = new URLSearchParams();

  if (typeof pageOrParams === 'object' && pageOrParams !== null) {
    if (pageOrParams.page !== undefined) {
      params.append('page', pageOrParams.page.toString());
    }
    if (pageOrParams.page_size !== undefined) {
      params.append('page_size', pageOrParams.page_size.toString());
    }
    if (pageOrParams.processing_status) {
      params.append('processing_status', pageOrParams.processing_status);
    }
  } else {
    const page = pageOrParams ?? 1;
    params.append('page', page.toString());
    params.append('page_size', pageSize.toString());
  }

  return apiClient.get(`/workspaces/${workspaceId}/sources?${params.toString()}`);
}

export async function getSource(sourceId: string): Promise<Source> {
  return apiClient.get(`/sources/${sourceId}`);
}

export async function deleteSource(sourceId: string): Promise<void> {
  return apiClient.delete(`/sources/${sourceId}`);
}

export async function retrySource(sourceId: string): Promise<Source> {
  return apiClient.post(`/sources/${sourceId}/retry`);
}

export async function linkSourceToNote(
  sourceId: string,
  noteId: string
): Promise<{ source_id: string; note_id: string }> {
  return apiClient.post(`/sources/${sourceId}/link-note`, { note_id: noteId });
}

export async function unlinkSourceFromNote(
  sourceId: string,
  noteId: string
): Promise<void> {
  return apiClient.delete(`/sources/${sourceId}/link-note/${noteId}`);
}

export async function previewImport(
  workspaceId: string,
  formData: FormData
): Promise<SourcePreviewResult> {
  return apiClient.upload<SourcePreviewResult>(
    `/workspaces/${workspaceId}/sources/preview`,
    formData
  );
}

export async function commitImport(
  workspaceId: string,
  formData: FormData
): Promise<SourceImportResult> {
  return apiClient.upload<SourceImportResult>(
    `/workspaces/${workspaceId}/sources/import`,
    formData
  );
}