import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CitationCard } from './CitationCard';
import { CitationList } from './CitationList';
import { StreamingIndicator } from './StreamingIndicator';
import { MessageBubble } from './MessageBubble';
import { AssistantInput } from './AssistantInput';
import { ConversationList } from './ConversationList';
import { ConversationView } from './ConversationView';
import { AssistantPanel } from './AssistantPanel';
import { Message, MessageCitation } from '@/types/message';
import { Conversation } from '@/types/conversation';
import * as messagesApi from '@/api/messages';
import * as assistantApi from '@/api/assistant';
import * as conversationsApi from '@/api/conversations';

vi.mock('@/api/conversations', () => ({
  createConversation: vi.fn(),
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  renameConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));

vi.mock('@/api/messages', () => ({
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('@/api/assistant', () => ({
  streamAssistantResponse: vi.fn(),
}));

const mockCitation: MessageCitation = {
  id: 'cit-1',
  chunk_id: 'chk-1',
  source_id: 'src-1',
  source_title: 'Quantum Computing.pdf',
  excerpt: 'Qubits exploit quantum superposition to process complex states.',
  similarity_score: 0.92, // 92% similarity
  page_number: 4,
  rank: 1,
};

const mockUserMessage: Message = {
  id: 'msg-1',
  conversation_id: 'conv-1',
  role: 'user',
  content: 'What is quantum superposition?',
  created_at: '2026-09-26T12:00:00Z',
};

const mockAssistantMessage: Message = {
  id: 'msg-2',
  conversation_id: 'conv-1',
  role: 'assistant',
  content: 'Quantum superposition allows qubits to exist in multiple states simultaneously.',
  citations: [mockCitation],
  provider: 'ollama',
  model: 'llama3.2',
  latency_ms: 850,
  created_at: '2026-09-26T12:00:02Z',
};

const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    workspace_id: 'ws-1',
    title: 'Quantum Computing Research',
    created_at: '2026-09-26T11:50:00Z',
    updated_at: '2026-09-26T12:00:02Z',
  },
  {
    id: 'conv-2',
    workspace_id: 'ws-1',
    title: 'Graph RAG Architecture',
    created_at: '2026-09-26T09:00:00Z',
    updated_at: '2026-09-26T09:30:00Z',
  },
];

describe('CitationCard and CitationList (§8 Terminology Requirement)', () => {
  it('renders citation with "Similarity" label and NEVER "Confidence"', () => {
    render(<CitationCard citation={mockCitation} index={0} />);

    // Must have "Similarity" label per §8
    const badge = screen.getByTestId('citation-similarity-badge');
    expect(badge).toHaveTextContent(/Similarity:\s*92%/i);
    expect(screen.getByText('Quantum Computing.pdf')).toBeInTheDocument();
    expect(screen.getByText('p. 4')).toBeInTheDocument();
    expect(screen.getByText(/Qubits exploit quantum superposition/i)).toBeInTheDocument();

    // MUST NOT have "Confidence"
    expect(screen.queryByText(/confidence/i)).not.toBeInTheDocument();
  });

  it('renders CitationList with citation count and toggles expansion', async () => {
    const user = userEvent.setup();
    render(<CitationList citations={[mockCitation]} />);

    expect(screen.getByTestId('citation-list')).toBeInTheDocument();
    expect(screen.getByText('1 Source Cited')).toBeInTheDocument();
    expect(screen.getByTestId('citation-card')).toBeInTheDocument();

    // Toggle collapse
    const toggleBtn = screen.getByRole('button', { name: /toggle citations list/i });
    await user.click(toggleBtn);
    expect(screen.queryByTestId('citations-container')).not.toBeInTheDocument();
  });
});

describe('StreamingIndicator', () => {
  it('renders pulsing indicator with accessible status', () => {
    render(<StreamingIndicator label="Generating response..." />);
    const indicator = screen.getByTestId('streaming-indicator');
    expect(indicator).toHaveTextContent('Generating response...');
    expect(indicator).toHaveAttribute('role', 'status');
  });
});

describe('MessageBubble', () => {
  it('renders user message bubble with correct role distinction', () => {
    render(<MessageBubble message={mockUserMessage} />);
    const bubble = screen.getByTestId('message-bubble-msg-1');
    expect(bubble).toHaveAttribute('data-role', 'user');
    expect(screen.getByText('What is quantum superposition?')).toBeInTheDocument();
  });

  it('renders assistant message bubble with citations and metadata', () => {
    render(<MessageBubble message={mockAssistantMessage} />);
    const bubble = screen.getByTestId('message-bubble-msg-2');
    expect(bubble).toHaveAttribute('data-role', 'assistant');
    expect(screen.getByText(/Quantum superposition allows/i)).toBeInTheDocument();
    expect(screen.getByTestId('citation-list')).toBeInTheDocument();
    expect(screen.getByText('llama3.2')).toBeInTheDocument();
  });
});

describe('AssistantInput', () => {
  it('disables send button when empty and triggers onSendMessage on Enter', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<AssistantInput onSendMessage={onSend} />);

    const sendBtn = screen.getByTestId('assistant-send-btn');
    expect(sendBtn).toBeDisabled();

    const input = screen.getByTestId('assistant-query-input');
    await user.type(input, 'Tell me about embeddings');

    expect(sendBtn).not.toBeDisabled();

    await user.click(sendBtn);
    expect(onSend).toHaveBeenCalledWith('Tell me about embeddings');
    expect(input).toHaveValue('');
  });

  it('shows stop button when isStreaming is true and triggers onStopStreaming', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    render(<AssistantInput onSendMessage={vi.fn()} onStopStreaming={onStop} isStreaming={true} />);

    const stopBtn = screen.getByTestId('assistant-stop-btn');
    expect(stopBtn).toBeInTheDocument();

    await user.click(stopBtn);
    expect(onStop).toHaveBeenCalled();
  });
});

describe('ConversationList', () => {
  it('renders conversations and handles click selection and creation', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onNew = vi.fn();

    render(
      <ConversationList
        conversations={mockConversations}
        activeConversationId="conv-1"
        onSelectConversation={onSelect}
        onNewConversation={onNew}
      />
    );

    expect(screen.getByText('Quantum Computing Research')).toBeInTheDocument();
    expect(screen.getByText('Graph RAG Architecture')).toBeInTheDocument();

    const item1 = screen.getByTestId('conversation-item-conv-1');
    expect(item1).toHaveAttribute('aria-current', 'true');

    await user.click(screen.getByTestId('conversation-item-conv-2'));
    expect(onSelect).toHaveBeenCalledWith('conv-2');

    await user.click(screen.getByTestId('new-conversation-btn'));
    expect(onNew).toHaveBeenCalled();
  });
});

describe('ConversationView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and renders message history', async () => {
    vi.mocked(messagesApi.listMessages).mockResolvedValueOnce({
      items: [mockUserMessage, mockAssistantMessage],
      total: 2,
    });

    render(
      <ConversationView
        conversationId="conv-1"
        conversation={mockConversations[0]}
        workspaceId="ws-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('What is quantum superposition?')).toBeInTheDocument();
      expect(screen.getByText(/Quantum superposition allows/i)).toBeInTheDocument();
    });
  });

  it('handles streaming assistant message lifecycle and displays citation', async () => {
    const user = userEvent.setup();
    vi.mocked(messagesApi.listMessages).mockResolvedValueOnce({ items: [], total: 0 });

    vi.mocked(assistantApi.streamAssistantResponse).mockImplementation(
      async (_convId, _content, onEvent) => {
        onEvent({ type: 'user_message_created', message_id: 'real-user-1' });
        onEvent({ type: 'chunk', content: 'Streaming ' });
        onEvent({ type: 'chunk', content: 'partial tokens.' });
        onEvent({
          type: 'done',
          message_id: 'real-ast-1',
          citations: [mockCitation],
          provider: 'ollama',
          model: 'llama3.2',
        });
      }
    );

    render(
      <ConversationView
        conversationId="conv-1"
        conversation={mockConversations[0]}
        workspaceId="ws-1"
      />
    );

    const input = screen.getByTestId('assistant-query-input');
    await waitFor(() => expect(input).not.toBeDisabled());

    await user.type(input, 'Stream this');
    await user.click(screen.getByTestId('assistant-send-btn'));

    await waitFor(() => {
      expect(screen.getByText(/Streaming partial tokens\./i)).toBeInTheDocument();
      expect(screen.getByTestId('citation-similarity-badge')).toHaveTextContent(/Similarity:\s*92%/i);
    });
  });
});

describe('AssistantPanel', () => {
  it('loads conversations and renders active conversation', async () => {
    vi.mocked(conversationsApi.listConversations).mockResolvedValueOnce({
      items: mockConversations,
      total: 2,
    });
    vi.mocked(messagesApi.listMessages).mockResolvedValueOnce({
      items: [mockUserMessage, mockAssistantMessage],
      total: 2,
    });

    render(<AssistantPanel workspaceId="ws-1" />);

    await waitFor(() => {
      expect(screen.getAllByText('Quantum Computing Research').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
    });
  });
});
