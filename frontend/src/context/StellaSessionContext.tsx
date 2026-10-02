/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { Conversation } from '@/types/conversation';
import { Message, MessageCitation } from '@/types/message';
import { CitedSourceItem, LocalDisplayMessage } from '@/types/stella';
import { StellaContext } from '@/types/navigation';
import {
  listConversations,
  createConversation,
  deleteConversation,
} from '@/api/conversations';
import { listMessages } from '@/api/messages';
import { streamAssistantResponse } from '@/api/assistant';

export const WELCOME_MESSAGE: LocalDisplayMessage = {
  id: 'stella-welcome',
  role: 'assistant',
  content:
    '### Welcome to Stella\n\nI am your scholarly research assistant connected directly to your active workspace knowledge graph and archival sources.\n\nAsk me any inquiry to synthesize concepts, surface grounded citations, or explore relationships across your notes.',
  timestamp: 'Just now',
};

interface StellaSessionContextValue {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: LocalDisplayMessage[];
  isStreaming: boolean;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  activeCitations: CitedSourceItem[];
  setActiveCitations: React.Dispatch<React.SetStateAction<CitedSourceItem[]>>;
  isEvidenceOpen: boolean;
  activeScope: StellaContext | null;
  inputPrompt: string;
  setInputPrompt: React.Dispatch<React.SetStateAction<string>>;
  setActiveScope: React.Dispatch<React.SetStateAction<StellaContext | null>>;
  setIsEvidenceOpen: React.Dispatch<React.SetStateAction<boolean>>;
  fetchConversations: (workspaceId: string) => Promise<void>;
  selectConversation: (convId: string) => Promise<void>;
  sendMessage: (workspaceId: string, userText: string) => Promise<void>;
  cancelGeneration: () => void;
  newChat: () => void;
  deleteConversationById: (convId: string) => Promise<void>;
}

const StellaSessionContext = createContext<StellaSessionContextValue | null>(null);

export const StellaSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // Messages in current conversation
  const [messages, setMessages] = useState<LocalDisplayMessage[]>([WELCOME_MESSAGE]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeCitations, setActiveCitations] = useState<CitedSourceItem[]>([]);
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);

  // Carried Context & Composer
  const [activeScope, setActiveScope] = useState<StellaContext | null>(null);
  const [inputPrompt, setInputPrompt] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const currentWorkspaceIdRef = useRef<string>('');

  // Fetch conversations list
  const fetchConversations = useCallback(async (workspaceId: string) => {
    if (!workspaceId) return;
    currentWorkspaceIdRef.current = workspaceId;
    setIsLoadingConversations(true);
    try {
      const res = await listConversations(workspaceId);
      const items = res.items || [];
      setConversations(items);

      if (items.length > 0 && !activeConversationId) {
        setActiveConversationId(items[0].id);
      }
    } catch {
      // Gracefully handle error
    } finally {
      setIsLoadingConversations(false);
    }
  }, [activeConversationId]);

  // Load message history for a conversation
  const loadMessagesForConversation = useCallback(async (convId: string) => {
    setIsLoadingMessages(true);
    try {
      const rawRes = await listMessages(convId);
      const rawList: Message[] = Array.isArray(rawRes) ? rawRes : rawRes.items || [];
      if (rawList.length === 0) {
        setMessages([WELCOME_MESSAGE]);
        setActiveCitations([]);
        return;
      }

      const mapped: LocalDisplayMessage[] = rawList.map((m) => {
        const cites: CitedSourceItem[] = (m.citations || []).map((c: MessageCitation) => ({
          chunk_id: c.chunk_id,
          note_id: c.note_id,
          source_id: c.source_id,
          title: c.source_title || c.note_title || c.title || 'Referenced Source',
          excerpt: c.excerpt || '',
          score: c.similarity_score || 0.8,
        }));

        return {
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.created_at
            ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Recently',
          citations: cites,
          latencyMs: m.latency_ms || undefined,
          model: m.model || undefined,
        };
      });

      setMessages(mapped);

      const lastAssistant = [...mapped].reverse().find((msg) => msg.role === 'assistant' && msg.citations && msg.citations.length > 0);
      if (lastAssistant && lastAssistant.citations) {
        setActiveCitations(lastAssistant.citations);
      } else {
        setActiveCitations([]);
      }
    } catch {
      setMessages([
        {
          id: 'load-error',
          role: 'assistant',
          content: 'Failed to load conversation messages from the database.',
          timestamp: 'Just now',
          error: 'Could not retrieve message history for this conversation thread.',
        },
      ]);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  // Select conversation (DOES NOT send anything or trigger LLM request)
  const selectConversation = useCallback(async (convId: string) => {
    if (activeConversationId === convId) return;
    setActiveConversationId(convId);
    await loadMessagesForConversation(convId);
  }, [activeConversationId, loadMessagesForConversation]);

  // Explicit cancellation
  const cancelGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  // New Chat action
  const newChat = useCallback(() => {
    cancelGeneration();
    setActiveConversationId(null);
    setMessages([WELCOME_MESSAGE]);
    setActiveCitations([]);
    setInputPrompt('');
    setActiveScope(null);
  }, [cancelGeneration]);

  // Delete conversation with CASCADE cleanup
  const deleteConversationById = useCallback(async (convId: string) => {
    try {
      await deleteConversation(convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));

      if (activeConversationId === convId) {
        const remaining = conversations.filter((c) => c.id !== convId);
        if (remaining.length > 0) {
          setActiveConversationId(remaining[0].id);
          await loadMessagesForConversation(remaining[0].id);
        } else {
          newChat();
        }
      }
    } catch {
      // Gracefully handle
    }
  }, [activeConversationId, conversations, loadMessagesForConversation, newChat]);

  // Send message with streaming that SURVIVES page navigation
  const sendMessage = useCallback(async (workspaceId: string, userText: string) => {
    const text = userText.trim();
    if (!text || isStreaming || !workspaceId) return;

    setInputPrompt('');
    setIsStreaming(true);

    let targetConvId = activeConversationId;

    if (!targetConvId) {
      try {
        const convTitle = text.length > 45 ? `${text.slice(0, 45)}...` : text;
        const createdConv = await createConversation(workspaceId, { title: convTitle });
        targetConvId = createdConv.id;
        setActiveConversationId(createdConv.id);
        setConversations((prev) => [createdConv, ...prev]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: 'Failed to initialize a persistent conversation thread in this workspace.',
            timestamp: 'Just now',
            error: 'Unable to create conversation thread on server.',
          },
        ]);
        setIsStreaming(false);
        return;
      }
    }

    const userMsgId = `user-${Date.now()}`;
    const userDisplayMsg: LocalDisplayMessage = {
      id: userMsgId,
      role: 'user',
      content: text,
      timestamp: 'Just now',
    };

    const assistantMsgId = `assistant-${Date.now()}`;
    const initialAssistantMsg: LocalDisplayMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: 'Just now',
    };

    setMessages((prev) => [...prev, userDisplayMsg, initialAssistantMsg]);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let accumulatedContent = '';
    const gatheredCitations: CitedSourceItem[] = [];

    try {
      await streamAssistantResponse(
        targetConvId,
        text,
        (event) => {
          if (event.type === 'chunk' && event.content) {
            accumulatedContent += event.content;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, content: accumulatedContent } : m
              )
            );
          } else if (event.type === 'done') {
            const cites: CitedSourceItem[] = (event.citations || []).map((c: MessageCitation) => ({
              chunk_id: c.chunk_id,
              note_id: c.note_id,
              source_id: c.source_id,
              title: c.source_title || c.note_title || c.title || 'Referenced Source',
              excerpt: c.excerpt || '',
              score: c.similarity_score || 0.8,
            }));

            gatheredCitations.push(...cites);
            setActiveCitations(cites);
            if (cites.length > 0) {
              setIsEvidenceOpen(true);
            }

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content:
                        accumulatedContent ||
                        'Stella retrieved knowledge citations, but no text response was synthesized.',
                      citations: cites,
                      latencyMs: event.latency_ms,
                      model: event.model || event.provider,
                    }
                  : m
              )
            );
          } else if (event.type === 'error') {
            throw new Error(event.message || 'Error occurred during streaming.');
          }
        },
        (err) => {
          throw err;
        },
        abortController.signal
      );
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: accumulatedContent
                    ? `${accumulatedContent}\n\n*[Inquiry generation stopped by user]*`
                    : '*[Inquiry generation stopped by user]*',
                }
              : m
          )
        );
      } else {
        const errorMsg =
          err instanceof Error
            ? err.message
            : 'Failed to communicate with the assistant reasoning service.';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: accumulatedContent || 'An error interrupted the scholarly inquiry response.',
                  error: errorMsg,
                }
              : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [activeConversationId, isStreaming]);

  return (
    <StellaSessionContext.Provider
      value={{
        conversations,
        activeConversationId,
        messages,
        isStreaming,
        isLoadingConversations,
        isLoadingMessages,
        activeCitations,
        setActiveCitations,
        isEvidenceOpen,
        activeScope,
        inputPrompt,
        setInputPrompt,
        setActiveScope,
        setIsEvidenceOpen,
        fetchConversations,
        selectConversation,
        sendMessage,
        cancelGeneration,
        newChat,
        deleteConversationById,
      }}
    >
      {children}
    </StellaSessionContext.Provider>
  );
};

export function useStellaSession() {
  const context = useContext(StellaSessionContext);
  if (!context) {
    throw new Error('useStellaSession must be used within a StellaSessionProvider');
  }
  return context;
}
