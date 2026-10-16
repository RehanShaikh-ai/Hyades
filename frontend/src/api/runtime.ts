import { apiClient } from './client';

export interface FreeLLMAPIStatusResponse {
  status: 'Running' | 'Stopped' | 'Not Installed' | 'Starting' | 'Configuration Required' | 'Error';
  is_running: boolean;
  is_usable: boolean;
  installed?: boolean;
  version?: string;
  install_path?: string;
  endpoint?: string;
  latency_ms?: number;
  models_count?: number;
  requires_credentials?: boolean;
  has_api_key?: boolean;
  error?: string;
}

export interface StartProcessResponse {
  success: boolean;
  message: string;
  status: string;
  pid?: number;
  endpoint?: string;
}

export async function getFreeLLMAPIStatus(): Promise<FreeLLMAPIStatusResponse> {
  return apiClient.get<FreeLLMAPIStatusResponse>('/runtime/freellmapi/status');
}

export async function testFreeLLMAPIConnection(
  endpoint?: string,
  apiKey?: string
): Promise<FreeLLMAPIStatusResponse> {
  return apiClient.post<FreeLLMAPIStatusResponse>('/runtime/freellmapi/test', {
    endpoint,
    api_key: apiKey,
  });
}

export async function startFreeLLMAPIService(): Promise<StartProcessResponse> {
  return apiClient.post<StartProcessResponse>('/runtime/freellmapi/start');
}

export async function stopFreeLLMAPIService(): Promise<{ success: boolean; message: string }> {
  return apiClient.post<{ success: boolean; message: string }>('/runtime/freellmapi/stop');
}