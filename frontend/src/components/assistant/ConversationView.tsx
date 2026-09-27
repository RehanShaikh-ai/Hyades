import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Conversation } from '@/types/conversation';
import { Message, MessageCitation } from '@/types/message';
import { listMessages } from '@/api/messages';
import { streamAssistantResponse } from '@/api/assistant';
import { MessageBubble } from './MessageBubble';
import { AssistantInput } from './AssistantInput';
import {
  Sparkles,
  Bot,
  AlertTriangle,
  RotateCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConversationViewProps {
  conversationId: string;
  conversation?: Conversation | null;
  workspaceId: string;
  onSelectCitation?: (citation: MessageCitation) => void;
  onConversationUpdated?: (updated: Conversation) => void;
  className?: string;
}

const STARTER_PROMPTS = [
  'What are the main concepts in my workspace?',
  'Summarize the uploaded documents.',
  'How do the notes and entities connect to each other?',
  'Find any key takeaways from recent notes.',
];

let tempCounter = 0;
function createTempMessageId(prefix: string): string {
  tempCounter += 1;
  return `temp-${prefix}-${tempCounter}`;
}

export const ConversationView: React.FC<ConversationViewProps> = ({
  conversationId,
  conversation,
  workspaceId,
  onSelectCitation,
  onConversationUpdated,
  className,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Streaming State
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;
    setIsLoadingMessages(true);
    setError(null);

    try {
      const res = await listMessages(conversationId, { page: 1, page_size: 100 });
      setMessages(res.items || []);
    } catch (err: unknown) {
      const apiErr = err as { error?: { message?: string } } | Error;
      const msg =
        (apiErr as { error?: { message?: string } })?.error?.message ||
        (err instanceof Error ? err.message : 'Failed to load messages');
      setError(msg);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    scrollToBottom(false);
  }, [messages.length, scrollToBottom]);

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isStreaming) return;

    setError(null);
    setIsStreaming(true);

    const tempUserMsgId = createTempMessageId('user');
    const tempAssistantMsgId = createTempMessageId('assistant');

    const userMsg: Message = {
      id: tempUserMsgId,
      conversation_id: conversationId,
      workspace_id: workspaceId,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };

    const assistantMsg: Message = {
      id: tempAssistantMsgId,
      conversation_id: conversationId,
      workspace_id: workspaceId,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreamingMessageId(tempAssistantMsgId);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Update conversation title if first message
    if (messages.length === 0 && conversation && !conversation.title) {
      const autoTitle = content.slice(0, 80).trim();
      onConversationUpdated?.({ ...conversation, title: autoTitle });
    }

    try {
      await streamAssistantResponse(
        conversationId,
        content,
        (event) => {
          if (event.type === 'user_message_created') {
            setMessages((prev) =>
              prev.map((m) => (m.id === tempUserMsgId ? { ...m, id: event.message_id } : m))
            );
          } else if (event.type === 'chunk') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAssistantMsgId
                  ? { ...m, content: m.content + event.content }
                  : m
              )
            );
            scrollToBottom(true);
          } else if (event.type === 'done') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAssistantMsgId
                  ? {
                      ...m,
                      id: event.message_id || m.id,
                      citations: event.citations || [],
                      provider: event.provider,
                      model: event.model,
                      latency_ms: event.latency_ms,
                    }
                  : m
              )
            );
            setIsStreaming(false);
            setStreamingMessageId(null);
            scrollToBottom(true);
          } else if (event.type === 'error') {
            // Retain partial content per §9.2 and display error
            setError(event.message || `Error during response generation (${event.code})`);
            setIsStreaming(false);
            setStreamingMessageId(null);
          }
        },
        (err) => {
          setError(err.message || 'Stream connection error');
          setIsStreaming(false);
          setStreamingMessageId(null);
        },
        abortController.signal
      );
    } catch (err: unknown) {
      const apiErr = err as { error?: { message?: string } } | Error;
      const msg =
        (apiErr as { error?: { message?: string } })?.error?.message ||
        (err instanceof Error ? err.message : 'Failed to send message');
      setError(msg);
      setIsStreaming(false);
      setStreamingMessageId(null);
    }
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
      setStreamingMessageId(null);
    }
  };

  const displayTitle = conversation?.title || 'Persistent Assistant Conversation';

  return (
    <div
      className={cn(
        'conversation-view flex flex-col h-full bg-slate-950/40 text-slate-100 overflow-hidden relative',
        className
      )}
      data-testid="conversation-view"
    >
      {/* Top Conversation Header */}
      <div className="p-4 px-6 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md flex items-center justify-between gap-4 flex-shrink-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 text-slate-950 flex items-center justify-center flex-shrink-0 shadow-md shadow-sky-500/20">
            <Sparkles size={16} />
          </div>
          <div className="min-w-0">
            <h2
              className="text-sm font-semibold text-slate-100 truncate"
              data-testid="conversation-title"
            >
              {displayTitle}
            </h2>
            <p className="text-[11px] text-slate-400 flex items-center gap-2">
              <span>Workspace RAG &amp; Graph Context</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchMessages}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            aria-label="Refresh messages"
            title="Refresh messages"
          >
            <RotateCw size={14} className={cn(isLoadingMessages && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Message History Thread */}
      <div
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5"
        data-testid="message-thread"
      >
        {/* Error notification banner */}
        {error && (
          <div
            className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3 shadow-lg"
            role="alert"
            data-testid="conversation-error"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-400 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-rose-400 hover:text-rose-200 text-xs font-semibold px-2 py-0.5 rounded"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Empty State / Starter Prompts */}
        {messages.length === 0 && !isLoadingMessages ? (
          <div
            className="flex flex-col items-center justify-center h-full max-w-lg mx-auto text-center p-6 space-y-4 my-auto"
            data-testid="conversation-empty-state"
          >
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400/20 to-indigo-500/20 border border-sky-500/30 text-sky-400 flex items-center justify-center shadow-lg shadow-sky-500/10">
              <Bot size={28} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                AI Knowledge Assistant
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
                Ask questions across your entire knowledge base. Answers cite specific source documents and notes.
              </p>
            </div>

            {/* Starter prompt cards */}
            <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 text-left">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSendMessage(prompt)}
                  className="p-3 rounded-xl bg-slate-900/60 hover:bg-slate-900/90 border border-slate-800 hover:border-sky-500/30 text-xs text-slate-300 hover:text-sky-300 text-left transition-all duration-150 group"
                  data-testid="starter-prompt-btn"
                >
                  <p className="line-clamp-2 leading-relaxed">{prompt}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Messages List */
          messages.map((message) => {
            const isThisStreaming = isStreaming && message.id === streamingMessageId;
            return (
              <MessageBubble
                key={message.id}
                message={message}
                isStreaming={isThisStreaming}
                onSelectCitation={onSelectCitation}
              />
            );
          })
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Query Input Bar at Bottom */}
      <div className="p-4 sm:px-6 pt-2 border-t border-slate-800/80 bg-slate-950/80 backdrop-blur-xl flex-shrink-0">
        <AssistantInput
          onSendMessage={handleSendMessage}
          onStopStreaming={handleStopStreaming}
          isStreaming={isStreaming}
          disabled={isLoadingMessages}
        />
      </div>
    </div>
  );
};
