import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { StellaSessionProvider, useStellaSession } from '@/context/StellaSessionContext';
import { HyadesStella } from './HyadesStella';
import * as conversationsApi from '@/api/conversations';
import * as assistantApi from '@/api/assistant';

vi.mock('@/api/conversations', () => ({
  listConversations: vi.fn(),
  createConversation: vi.fn(),
  getConversationMessages: vi.fn(),
  deleteConversation: vi.fn(),
}));

vi.mock('@/api/assistant', () => ({
  streamAssistantResponse: vi.fn(),
  sendAssistantMessage: vi.fn(),
}));

const mockWorkspaceId = 'ws-test-1';

function NavContainer() {
  const [page, setPage] = useState<'stella' | 'library' | 'overview'>('stella');
  return (
    <div>
      <nav>
        <button onClick={() => setPage('stella')}>To Stella</button>
        <button onClick={() => setPage('library')}>To Library</button>
        <button onClick={() => setPage('overview')}>To Overview</button>
      </nav>
      {page === 'stella' && <HyadesStella workspaceId={mockWorkspaceId} />}
      {page === 'library' && <div data-testid="library-page">Library Content</div>}
      {page === 'overview' && <div data-testid="overview-page">Overview Content</div>}
    </div>
  );
}

describe('Stella Session Persistence Across Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(conversationsApi.listConversations).mockResolvedValue({ items: [] } as any);
    vi.mocked(conversationsApi.createConversation).mockResolvedValue({
      id: 'conv-1',
      title: 'Session 1',
      workspace_id: mockWorkspaceId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);
    vi.mocked(conversationsApi.getConversationMessages).mockResolvedValue({ items: [] } as any);
  });

  it('keeps active generation alive when navigating between pages and restores it upon return', async () => {
    let eventCallback: ((event: any) => void) | null = null;

    vi.mocked(assistantApi.streamAssistantResponse).mockImplementation(
      async (_convId, _text, onEvent) => {
        eventCallback = onEvent;
        return new Promise(() => {}); // keep stream active during test
      }
    );

    render(
      <StellaSessionProvider workspaceId={mockWorkspaceId}>
        <NavContainer />
      </StellaSessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask Stella about your notes/i)).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/Ask Stella about your notes/i);
    fireEvent.change(textarea, { target: { value: 'Explain graph concepts' } });

    // Submit question to Stella
    const submitBtn = screen.getByRole('button', { name: /Send Inquiry/i });
    fireEvent.click(submitBtn);

    // Stream initial chunk
    await waitFor(() => {
      expect(eventCallback).not.toBeNull();
    });

    act(() => {
      eventCallback?.({ type: 'chunk', content: 'Concept 1 is chunking.' });
    });

    // Verify stream content shows on Stella page
    await waitFor(() => {
      expect(screen.getByText(/Concept 1 is chunking/i)).toBeInTheDocument();
    });

    // Navigate away to Library!
    fireEvent.click(screen.getByText('To Library'));
    expect(screen.getByTestId('library-page')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Ask Stella about your notes/i)).not.toBeInTheDocument();

    // Background generation continues while on Library page!
    act(() => {
      eventCallback?.({ type: 'chunk', content: ' Concept 2 is vector retrieval.' });
    });

    // Navigate to Overview
    fireEvent.click(screen.getByText('To Overview'));
    expect(screen.getByTestId('overview-page')).toBeInTheDocument();

    // Complete background stream
    act(() => {
      eventCallback?.({ type: 'done' });
    });

    // Return to Stella!
    fireEvent.click(screen.getByText('To Stella'));

    // Verify the full generation was preserved and rendered without duplicates
    await waitFor(() => {
      expect(screen.getByText(/Concept 1 is chunking\. Concept 2 is vector retrieval\./i)).toBeInTheDocument();
    });
  });

  it('supports explicit cancellation via Stop button', async () => {
    let abortCalled = false;

    vi.mocked(assistantApi.streamAssistantResponse).mockImplementation(
      async (_convId, _text, _onEvent, _onError, signal) => {
        return new Promise((resolve) => {
          signal?.addEventListener('abort', () => {
            abortCalled = true;
            resolve();
          });
        });
      }
    );

    render(
      <StellaSessionProvider workspaceId={mockWorkspaceId}>
        <NavContainer />
      </StellaSessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask Stella about your notes/i)).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/Ask Stella about your notes/i);
    fireEvent.change(textarea, { target: { value: 'Tell me a long story' } });

    const submitBtn = screen.getByRole('button', { name: /Send Inquiry/i });
    fireEvent.click(submitBtn);

    // Stop button appears during streaming
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Stop/i })).toBeInTheDocument();
    });

    // Click Stop button
    fireEvent.click(screen.getByRole('button', { name: /Stop/i }));

    await waitFor(() => {
      expect(abortCalled).toBe(true);
    });
  });
});
