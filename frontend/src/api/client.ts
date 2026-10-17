import { ApiError } from '@/types/api';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || '/api/v1';

/**
 * Thin HTTP client. Base URL comes from VITE_API_BASE_URL (§5.2, §14), defaulting to relative /api/v1.
 *
 * Malformed-response handling (§13): any non-JSON or non-ApiError body is
 * wrapped into a generic ApiError with code "UNKNOWN_ERROR" so that callers
 * never see an unhandled exception.
 */
export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${this.baseUrl}${cleanPath}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...init?.headers },
        ...init,
      });
    } catch (networkError) {
      const err: ApiError = {
        error: {
          code: 'NETWORK_ERROR',
          message:
            networkError instanceof Error
              ? networkError.message
              : 'Network request failed: unreachable backend or connection reset',
        },
      };
      throw err;
    }

    if (!response.ok) {
      let parsed: ApiError;
      try {
        const body = await response.json();
        if (
          body &&
          typeof body === 'object' &&
          'error' in body &&
          typeof body.error === 'object' &&
          'code' in body.error &&
          'message' in body.error
        ) {
          parsed = body as ApiError;
        } else if (body && typeof body.detail === 'string') {
          parsed = {
            error: {
              code: 'HTTP_ERROR',
              message: body.detail,
            },
          };
        } else if (body && Array.isArray(body.detail)) {
          parsed = {
            error: {
              code: 'VALIDATION_ERROR',
              message: body.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', '),
            },
          };
        } else {
          parsed = {
            error: {
              code: 'UNKNOWN_ERROR',
              message: `HTTP ${response.status}: ${response.statusText || 'Unexpected error'}`,
            },
          };
        }
      } catch {
        parsed = {
          error: {
            code: 'UNKNOWN_ERROR',
            message: `HTTP ${response.status}: Non-JSON response body`,
          },
        };
      }
      throw parsed;
    }

    if (response.status === 204) {
      return undefined as T;
    }

    try {
      return (await response.json()) as T;
    } catch {
      const parseError: ApiError = {
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'Malformed response: failed to parse JSON',
        },
      };
      throw parseError;
    }
  }

  async upload<T>(path: string, formData: FormData, init?: RequestInit): Promise<T> {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${this.baseUrl}${cleanPath}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        body: formData,
        ...init,
        // Notice: do NOT supply Content-Type header so the browser correctly generates multipart boundary
      });
    } catch (networkError) {
      const err: ApiError = {
        error: {
          code: 'NETWORK_ERROR',
          message:
            networkError instanceof Error
              ? networkError.message
              : 'Network request failed: upload unreachable or connection dropped',
        },
      };
      throw err;
    }

    if (!response.ok) {
      let parsed: ApiError;
      try {
        const body = await response.json();
        if (
          body &&
          typeof body === 'object' &&
          'error' in body &&
          typeof body.error === 'object' &&
          'code' in body.error &&
          'message' in body.error
        ) {
          parsed = body as ApiError;
        } else if (body && typeof body.detail === 'string') {
          parsed = {
            error: {
              code: 'HTTP_ERROR',
              message: body.detail,
            },
          };
        } else if (body && Array.isArray(body.detail)) {
          parsed = {
            error: {
              code: 'VALIDATION_ERROR',
              message: body.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', '),
            },
          };
        } else {
          parsed = {
            error: {
              code: 'UNKNOWN_ERROR',
              message: `HTTP ${response.status}: ${response.statusText || 'Upload failed'}`,
            },
          };
        }
      } catch {
        parsed = {
          error: {
            code: 'UNKNOWN_ERROR',
            message: `HTTP ${response.status}: Non-JSON upload response`,
          },
        };
      }
      throw parsed;
    }

    if (response.status === 204) {
      return undefined as T;
    }

    try {
      return (await response.json()) as T;
    } catch {
      const parseError: ApiError = {
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'Malformed response: failed to parse JSON',
        },
      };
      throw parseError;
    }
  }

  get<T>(path: string, init?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...init, method: 'GET' });
  }

  post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...init,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...init,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  delete<T = void>(path: string, init?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...init, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
export { API_BASE_URL };