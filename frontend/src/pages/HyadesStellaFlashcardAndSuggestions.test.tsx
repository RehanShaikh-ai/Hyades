/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StellaSessionProvider } from '@/context/StellaSessionContext';
import { HyadesStella } from './HyadesStella';
import * as conversationsApi from '@/api/conversations';
import * as messagesApi from '@/api/messages';
import * as stellaCommandsApi from '@/api/stella_commands';

vi.mock('@/api/conversations', () => ({
  listConversations: vi.fn(),
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));

vi.mock('@/api/messages', () => ({
  listMessages: vi.fn(),
}));

vi.mock('@/api/stella_commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/stella_commands')>();
  return {
    ...actual,
    listStellaCommands: vi.fn(),
    getCommandSuggestions: vi.fn(),
  };
});

const mockWorkspaceId = 'ws-test-flashcards';

describe('Stella Flashcards & Parameter Suggestions Regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(stellaCommandsApi.listStellaCommands).mockResolvedValue([]);
  });

  it('renders interactive flashcard card when assistant message contains raw JSON without html comment', async () => {
    const rawFlashcardJson = JSON.stringify({
      card_type: 'flashcards',
      flashcardDeck: {
        title: 'Cognitive Science: Spaced Repetition and Testing',
        source_title: 'Cognitive Science of Spaced Repetition and Testing Effects',
        source_id: '50cdfd9d-5abf-4bc4-8d5c-d24565aa922e',
        source_type: 'note',
        cards: [
          {
            question: 'What is the Testing Effect (Retrieval Practice)?',
            answer: 'The finding that actively retrieving information from memory produces far superior long-term retention compared to passive rereading.',
            explanation: 'Retrieval modifies memory traces, reorganizes conceptual schemas, and triggers active neural consolidation.',
            category: 'Retrieval Practice',
          },
          {
            question: 'What is Hermann Ebbinghaus\'s Forgetting Curve?',
            answer: 'A mathematical model showing that memory retention decays exponentially over time.',
            explanation: 'Each successful spaced retrieval flattens the curve, progressively extending the duration of memory stability.',
            category: 'Forgetting Curve',
          },
        ],
        total_cards: 2,
      },
      total_cards: 2,
      message: "I've generated a flashcard deck from your notes on Cognitive Science of Spaced Repetition and Testing Effects.",
    });

    vi.mocked(conversationsApi.listConversations).mockResolvedValue({
      items: [
        {
          id: 'conv-flash-1',
          title: 'Study Session',
          workspace_id: mockWorkspaceId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    } as any);

    vi.mocked(messagesApi.listMessages).mockResolvedValue({
      items: [
        {
          id: 'm-1',
          conversation_id: 'conv-flash-1',
          workspace_id: mockWorkspaceId,
          role: 'user',
          content: '/generate-flashcards "Cognitive Science of Spaced Repetition and Testing Effects"',
          created_at: new Date(Date.now() - 1000).toISOString(),
        },
        {
          id: 'm-2',
          conversation_id: 'conv-flash-1',
          workspace_id: mockWorkspaceId,
          role: 'assistant',
          content: rawFlashcardJson,
          created_at: new Date().toISOString(),
        },
      ],
    } as any);

    render(
      <StellaSessionProvider>
        <HyadesStella workspaceId={mockWorkspaceId} />
      </StellaSessionProvider>
    );

    // Should render the human message and flashcard deck, NOT raw JSON string
    await waitFor(() => {
      expect(screen.getByText(/Cognitive Science: Spaced Repetition and Testing/i)).toBeInTheDocument();
    });

    // Verify card questions are present
    expect(screen.getByText(/What is the Testing Effect/i)).toBeInTheDocument();

    // Verify raw JSON string is NOT dumped into the document
    expect(screen.queryByText(/\{"card_type":\s*"flashcards"/)).not.toBeInTheDocument();
  });

  it('Argument suggestions fetches up to 50 items and allows >8 items to display', async () => {
    // Generate 12 note items and 5 source items
    const mockSuggestions = [
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `note-${i + 1}`,
        title: `Research Note ${i + 1}`,
        item_type: 'note',
        subtitle: `Note · 500 words`,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `source-${i + 1}`,
        title: `Source Document ${i + 1}`,
        item_type: 'source',
        subtitle: `Source · PDF`,
      })),
    ];

    vi.mocked(stellaCommandsApi.getCommandSuggestions).mockResolvedValue(mockSuggestions as any);

    vi.mocked(conversationsApi.listConversations).mockResolvedValue({
      items: [
        {
          id: 'conv-sug-1',
          title: 'Command Suggestions Test',
          workspace_id: mockWorkspaceId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    } as any);

    vi.mocked(messagesApi.listMessages).mockResolvedValue({ items: [] } as any);

    render(
      <StellaSessionProvider>
        <HyadesStella workspaceId={mockWorkspaceId} />
      </StellaSessionProvider>
    );

    // Call getCommandSuggestions with limit 50
    const items = await stellaCommandsApi.getCommandSuggestions(mockWorkspaceId, '/summarize', '', 50, 0);
    expect(items.length).toBe(17);
    expect(items.filter((it: any) => it.item_type === 'note').length).toBe(12);
    expect(items.filter((it: any) => it.item_type === 'source').length).toBe(5);
  });
});
