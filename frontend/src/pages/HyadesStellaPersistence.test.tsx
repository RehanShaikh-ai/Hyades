/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { StellaSessionProvider } from '@/context/StellaSessionContext';
import { HyadesStella } from './HyadesStella';
import * as conversationsApi from '@/api/conversations';
import * as messagesApi from '@/api/messages';
import * as assistantApi from '@/api/assistant';

vi.mock('@/api/conversations', () => ({
  listConversations: vi.fn(),
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));

vi.mock('@/api/messages', () => ({
  listMessages: vi.fn(),
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

describe('Stella Session Persistence Across Navigation & Page Refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(conversationsApi.listConversations).mockResolvedValue({ items: [] } as any);
    vi.mocked(conversationsApi.createConversation).mockResolvedValue({
      id: 'conv-1',
      title: 'Session 1',
      workspace_id: mockWorkspaceId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);
    vi.mocked(messagesApi.listMessages).mockResolvedValue({ items: [] } as any);
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
      <StellaSessionProvider>
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
      <StellaSessionProvider>
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

  it('reconstructs /summarize, /reconcile-duplicates, /create-note (draft & saved), generic proposals, and ordinary messages after page refresh', async () => {
    const summaryEnvelope = JSON.stringify({
      card_type: 'summary',
      command: '/summarize',
      action_id: 'notes.summarize',
      status: 'completed',
      summaryCard: {
        targetId: 'note-arch-1',
        targetTitle: 'Arch Linux. Easy Words: Foundations, Dynamics, and Significance',
        targetType: 'note',
        summaryTitle: 'Summary: Arch Linux. Easy Words: Foundations, Dynamics, and Significance',
        metaDescription: 'note · ~420 words · 2 related notes in graph',
        keyPoints: [
          'Pacman and rolling-release architecture keep packages current.',
          'Minimal base installation empowers user-driven system configuration.',
        ],
        fullSummary:
          'Arch Linux is an independently developed x86-64 general-purpose GNU/Linux distribution.',
        relatedNotesCount: 2,
        sourceId: 'src-arch-wiki',
      },
    });

    const reconcileEnvelope = JSON.stringify({
      command: '/reconcile-duplicates',
      action_id: 'notes.compare',
      status: 'completed',
      message: 'Duplicate reconciliation check complete: 0 duplicate pairs identified.',
      data: {
        duplicate_count: 0,
        pairs: [],
        status: 'reconciled',
        scope_examined: 'Note: Life of Umar ibn al-Khattab',
        notes_examined_count: 1,
      },
    });

    const savedNoteEnvelope = JSON.stringify({
      card_type: 'note_draft',
      command: '/create-note',
      action_id: 'notes.create',
      status: 'committed',
      noteDraft: {
        proposalId: 'prop-note-1',
        confirmationToken: 'tok-note-1',
        actionId: 'notes.create',
        title: 'Quantum Decoherence Fundamentals',
        content: '### Overview\nDecoherence explains the transition from quantum to classical.',
        wordCount: 245,
        status: 'committed',
        savedNoteId: 'note-quantum-99',
        savedAt: 'Recently',
        topic: 'quantum decoherence',
      },
    });

    const legacyIncompleteSummaryEnvelope = JSON.stringify({
      card_type: 'summary',
      summary_title: 'Legacy Summary Card With Missing Optional Fields',
      target_title: 'Historical Treatise',
    });

    vi.mocked(conversationsApi.listConversations).mockResolvedValue({
      items: [
        {
          id: 'conv-persisted-1',
          title: 'Arch Linux & Umar Inquiry',
          workspace_id: mockWorkspaceId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    } as any);

    vi.mocked(messagesApi.listMessages).mockResolvedValue({
      items: [
        {
          id: 'm-user-1',
          conversation_id: 'conv-persisted-1',
          role: 'user',
          content: '/summarize "Arch Linux. Easy Words: Foundations, Dynamics, and Significance"',
          citations: [],
          created_at: new Date().toISOString(),
        },
        {
          id: 'm-ast-1',
          conversation_id: 'conv-persisted-1',
          role: 'assistant',
          content: `Here is the structured summary of **Arch Linux. Easy Words: Foundations, Dynamics, and Significance**:\n\n<!--hyades-action-result:${summaryEnvelope}-->`,
          citations: [],
          created_at: new Date().toISOString(),
        },
        {
          id: 'm-user-2',
          conversation_id: 'conv-persisted-1',
          role: 'user',
          content: '/reconcile-duplicates "Life of Umar ibn al-Khattab"',
          citations: [],
          created_at: new Date().toISOString(),
        },
        {
          id: 'm-ast-2',
          conversation_id: 'conv-persisted-1',
          role: 'assistant',
          content: `Duplicate reconciliation check complete: 0 duplicate pairs identified.\n\n<!--hyades-action-result:${reconcileEnvelope}-->`,
          citations: [],
          created_at: new Date().toISOString(),
        },
        {
          id: 'm-user-3',
          conversation_id: 'conv-persisted-1',
          role: 'user',
          content: '/create-note quantum decoherence',
          citations: [],
          created_at: new Date().toISOString(),
        },
        {
          id: 'm-ast-3',
          conversation_id: 'conv-persisted-1',
          role: 'assistant',
          content: `Saved note **Quantum Decoherence Fundamentals** to your workspace.\n\n<!--hyades-action-result:${savedNoteEnvelope}-->`,
          citations: [],
          created_at: new Date().toISOString(),
        },
        {
          id: 'm-ast-4',
          conversation_id: 'conv-persisted-1',
          role: 'assistant',
          content: `Legacy summary message.\n\n<!--hyades-action-result:${legacyIncompleteSummaryEnvelope}-->`,
          citations: [],
          created_at: new Date().toISOString(),
        },
      ],
    } as any);

    render(
      <StellaSessionProvider>
        <HyadesStella workspaceId={mockWorkspaceId} />
      </StellaSessionProvider>
    );

    // 1. Verify /summarize user prompt and full InChatSummaryCard survive reload
    await waitFor(() => {
      expect(
        screen.getByText('/summarize "Arch Linux. Easy Words: Foundations, Dynamics, and Significance"')
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText('Summary: Arch Linux. Easy Words: Foundations, Dynamics, and Significance')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Pacman and rolling-release architecture keep packages current.')
    ).toBeInTheDocument();
    expect(screen.getByText(/2 related notes/i)).toBeInTheDocument();

    // 2. Verify /reconcile-duplicates user prompt and full InChatActionResultCard survive reload
    expect(
      screen.getByText('/reconcile-duplicates "Life of Umar ibn al-Khattab"')
    ).toBeInTheDocument();
    expect(screen.getByText('/reconcile-duplicates')).toBeInTheDocument();
    expect(screen.getByText('DUPLICATE_COUNT:')).toBeInTheDocument();
    expect(screen.getByText('reconciled')).toBeInTheDocument();

    // 3. Verify committed /create-note InChatSavedNoteCard survives reload
    expect(screen.getAllByText('Quantum Decoherence Fundamentals').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('245 words')).toBeInTheDocument();

    // 4. Verify historical message with missing optional fields renders safely
    expect(
      screen.getByText('Legacy Summary Card With Missing Optional Fields')
    ).toBeInTheDocument();
  });

  it('displays clear coming-soon placeholder messages for unfinished commands without fake completion cards', async () => {
    render(
      <StellaSessionProvider>
        <HyadesStella workspaceId={mockWorkspaceId} />
      </StellaSessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask Stella about your notes/i)).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/Ask Stella about your notes/i);
    fireEvent.change(textarea, { target: { value: '/link-notes "Arch Linux"' } });
    fireEvent.click(screen.getByRole('button', { name: /Send Inquiry/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Link Notes is under development and coming soon\./i)
      ).toBeInTheDocument();
    });

    // Must not render a fake Completed action card
    expect(screen.queryByText(/Command Executed:/i)).not.toBeInTheDocument();
  });

  it('renders artifact preview drawer for create-source proposal and maintains coherent state before and after commit', async () => {
    const researchBriefContent = `# Research Brief: Evaluating LLM and RAG

### Research Question & Scope
How can we evaluate Large Language Models (LLMs) and Retrieval-Augmented Generation (RAG) systems?

### Key Findings
- LLM evaluation measures quality, reliability, and safety.
- RAG evaluation adds retrieval quality (e.g. recall, precision).

### Comparison: Web Search Access Methods
| Method | Examples | Notes |
| --- | --- | --- |
| Search APIs | Tavily, SerpAPI, Brave | Managed service |
| Self-hosted | SearXNG | Self-hosted control |
`;

    const sourceProposalEnvelope = JSON.stringify({
      command: '/create-source',
      action_id: 'sources.create',
      status: 'proposed',
      message: 'Create Source proposal staged.',
      requires_confirmation: true,
      proposal_id: 'prop-source-123',
      confirmation_token: 'tok-source-123',
      data: {
        title: 'Evaluating LLM and RAG',
        source_type: 'text',
        content: researchBriefContent,
      },
    });

    vi.mocked(conversationsApi.listConversations).mockResolvedValue({
      items: [
        {
          id: 'conv-source-1',
          title: 'Source Proposal Thread',
          workspace_id: mockWorkspaceId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    } as any);

    vi.mocked(messagesApi.listMessages).mockResolvedValue({
      items: [
        {
          id: 'm-user-src-1',
          conversation_id: 'conv-source-1',
          role: 'user',
          content: '/create-source evaluating llm and rag',
          citations: [],
          created_at: new Date().toISOString(),
        },
        {
          id: 'm-ast-src-1',
          conversation_id: 'conv-source-1',
          role: 'assistant',
          content: `I've prepared a proposal for **Create Source**. Please review the details below before confirming.\n\n<!--hyades-action-result:${sourceProposalEnvelope}-->`,
          citations: [],
          created_at: new Date().toISOString(),
        },
      ],
    } as any);

    render(
      <StellaSessionProvider>
        <HyadesStella workspaceId={mockWorkspaceId} />
      </StellaSessionProvider>
    );

    // Verify user command and proposal card render
    await waitFor(() => {
      expect(screen.getByText('/create-source evaluating llm and rag')).toBeInTheDocument();
      expect(screen.getByText('Proposal: Create Source')).toBeInTheDocument();
    });

    expect(screen.getByText('Awaiting Confirmation')).toBeInTheDocument();
    expect(screen.getByText('Evaluating LLM and RAG')).toBeInTheDocument();

    // Verify Preview button is present
    const previewBtn = screen.getByRole('button', { name: /Preview/i });
    expect(previewBtn).toBeInTheDocument();

    // Click Preview button
    fireEvent.click(previewBtn);

    // Verify Preview Drawer opened
    await waitFor(() => {
      expect(screen.getByTestId('artifact-preview-drawer')).toBeInTheDocument();
    });
    expect(screen.getByText('Preview: Evaluating LLM and RAG')).toBeInTheDocument();
    expect(screen.getByText('Source · Research Brief')).toBeInTheDocument();
    expect(screen.getByText('How can we evaluate Large Language Models (LLMs) and Retrieval-Augmented Generation (RAG) systems?')).toBeInTheDocument();
    expect(screen.getByText('Comparison: Web Search Access Methods')).toBeInTheDocument();
    expect(screen.getByText('Search APIs')).toBeInTheDocument();

    // Close preview drawer via bottom Close button
    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);

    // Verify drawer closed but pending proposal with Confirm Changes remains intact
    expect(screen.queryByTestId('artifact-preview-drawer')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirm Changes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();

    // Verify committed state rendering after commit/refresh
    const committedEnvelope = JSON.stringify({
      command: '/create-source',
      action_id: 'sources.create',
      status: 'committed',
      message: "Successfully committed 'Create Source'.",
      requires_confirmation: false,
      proposal_id: 'prop-source-123',
      data: {
        source_id: '247a38d4-69b2-4813-bca2-4637264a2432',
        title: 'Evaluating LLM and RAG',
        source_type: 'text',
      },
    });

    vi.mocked(messagesApi.listMessages).mockResolvedValue({
      items: [
        {
          id: 'm-user-src-1',
          conversation_id: 'conv-source-1',
          role: 'user',
          content: '/create-source evaluating llm and rag',
          citations: [],
          created_at: new Date().toISOString(),
        },
        {
          id: 'm-ast-src-1',
          conversation_id: 'conv-source-1',
          role: 'assistant',
          content: `I've prepared a proposal for **Create Source**.\n\n<!--hyades-action-result:${committedEnvelope}-->`,
          citations: [],
          created_at: new Date().toISOString(),
        },
      ],
    } as any);

    const onNavLibrary = vi.fn();
    render(
      <StellaSessionProvider>
        <HyadesStella workspaceId={mockWorkspaceId} onNavigateToLibrary={onNavLibrary} />
      </StellaSessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('committed-source-outcome')).toBeInTheDocument();
    });
    expect(screen.getByText('Committed')).toBeInTheDocument();
    expect(screen.getByText(/Source · Text · ID: 247a38d4/i)).toBeInTheDocument();
    const viewSrcBtn = screen.getByRole('button', { name: /View Source/i });
    expect(viewSrcBtn).toBeInTheDocument();
    fireEvent.click(viewSrcBtn);
    expect(onNavLibrary).toHaveBeenCalledTimes(1);
  });
});
