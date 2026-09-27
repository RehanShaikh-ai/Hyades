import { apiClient } from './client';
import {
  Source,
  SourceListResponse,
  SourcePreviewResult,
  SourceImportResult,
} from '@/types/source';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';

export interface ListSourcesParams {
  page?: number;
  page_size?: number;
  processing_status?: string;
}

export async function uploadSource(
  workspaceId: string,
  file: File
): Promise<Source> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(
    `${API_BASE_URL.replace(/\/+$/, '')}/workspaces/${workspaceId}/sources/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message =
      errorData?.error?.message ||
      `Failed to upload source (HTTP ${response.status})`;
    const code = errorData?.error?.code || 'SOURCE_UPLOAD_FAILED';
    throw { error: { code, message } };
  }

  return response.json();
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

// Backward compatibility with v0.2.2 vault import
export async function previewImport(
  workspaceId: string,
  formData: FormData
): Promise<SourcePreviewResult> {
  const response = await fetch(
    `${API_BASE_URL.replace(/\/+$/, '')}/workspaces/${workspaceId}/sources/preview`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData?.error?.message ||
        `Failed to preview import (status: ${response.status})`
    );
  }

  return response.json();
}

export async function commitImport(
  workspaceId: string,
  formData: FormData
): Promise<SourceImportResult> {
  const response = await fetch(
    `${API_BASE_URL.replace(/\/+$/, '')}/workspaces/${workspaceId}/sources/import`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData?.error?.message ||
        `Failed to commit import (status: ${response.status})`
    );
  }

  return response.json();
}
