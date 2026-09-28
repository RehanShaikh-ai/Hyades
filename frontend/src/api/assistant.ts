import { AssistantStreamEvent } from '@/types/assistant';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';

export async function streamAssistantResponse(
  conversationId: string,
  content: string,
  onEvent: (event: AssistantStreamEvent) => void,
  onError?: (error: Error) => void,
  signal?: AbortSignal
): Promise<void> {
  const url = `${API_BASE_URL.replace(/\/+$/, '')}/conversations/${conversationId}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        content,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      let errorMessage = `Assistant stream request failed with status ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData?.error?.message) {
          errorMessage = errorData.error.message;
        }
      } catch {
        // ignore json parse failure
      }
      const err = new Error(errorMessage);
      onError?.(err);
      onEvent({
        type: 'error',
        code: `HTTP_${response.status}`,
        message: errorMessage,
      });
      return;
    }

    if (!response.body) {
      const err = new Error('No response body returned from stream');
      onError?.(err);
      onEvent({
        type: 'error',
        code: 'STREAM_ERROR',
        message: 'No response body returned from stream',
      });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) {
          continue; // SSE comment or empty keepalive
        }

        if (trimmed.startsWith('data:')) {
          const jsonStr = trimmed.replace(/^data:\s*/, '');
          if (!jsonStr) continue;

          try {
            const eventData = JSON.parse(jsonStr) as AssistantStreamEvent;
            onEvent(eventData);
          } catch {
            // Ignore malformed individual chunks
          }
        }
      }
    }

    // Process remainder if any
    if (buffer.trim().startsWith('data:')) {
      const jsonStr = buffer.trim().replace(/^data:\s*/, '');
      if (jsonStr) {
        try {
          const eventData = JSON.parse(jsonStr) as AssistantStreamEvent;
          onEvent(eventData);
        } catch {
          // ignore
        }
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      return;
    }
    const err = error instanceof Error ? error : new Error(String(error));
    onError?.(err);
    onEvent({
      type: 'error',
      code: 'NETWORK_ERROR',
      message: err.message,
    });
  }
}
