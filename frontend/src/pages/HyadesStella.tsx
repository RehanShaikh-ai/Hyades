/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  listConversations,
  createConversation,
  deleteConversation,
} from '@/api/conversations';
import { listMessages } from '@/api/messages';
import { streamAssistantResponse } from '@/api/assistant';
import { getRAGStatus } from '@/api/rag';
import { getWorkspaceDashboard } from '@/api/dashboard';
import { getWorkspaceGraph } from '@/api/graph';
import { renderMarkdown } from '@/lib/markdown';
import { Conversation } from '@/types/conversation';
import { Message, MessageCitation } from '@/types/message';
import { DashboardStats } from '@/types/dashboard';
import { GraphResponse } from '@/types/graph';
import { RAGStatusResponse } from '@/types/rag';
import stellaStudiolum from '@/assets/plates/stella-studiolum.jpg';

interface HyadesStellaProps {
  workspaceId: string;
  initialQuery?: string;
  onNavigateToObservatory?: () => void;
  onNavigateToLibrary?: () => void;
  environmentIndex?: number;
}

export interface CitedSourceItem {
  chunk_id: string;
  note_id?: string | null;
  source_id?: string | null;
  title: string;
  excerpt: string;
  score: number;
}

interface LocalDisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citations?: CitedSourceItem[];
  latencyMs?: number;
  model?: string;
  error?: string;
}

const WELCOME_MESSAGE: LocalDisplayMessage = {
  id: 'stella-welcome',
  role: 'assistant',
  content:
    '### Welcome to Stella\n\nI am your scholarly research assistant connected directly to your active workspace knowledge graph and archival sources.\n\nAsk me any inquiry to synthesize concepts, surface grounded citations, or explore relationships across your notes.',
  timestamp: 'Just now',
};

export const HyadesStella: React.FC<HyadesStellaProps> = ({
  workspaceId,
  initialQuery,
  onNavigateToObservatory,
}) => {
  // Conversation threads state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Messages in current active conversation
  const [messages, setMessages] = useState<LocalDisplayMessage[]>([WELCOME_MESSAGE]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // Composer & Streaming state
  const [inputPrompt, setInputPrompt] = useState(initialQuery || '');
  const [isStreaming, setIsStreaming] = useState(false);

  // Sidebars & Drawers
  const [isInquiriesOpen, setIsInquiriesOpen] = useState(true);
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const [activeCitations, setActiveCitations] = useState<CitedSourceItem[]>([]);

  // Workspace metadata & Scope
  const [selectedModel, setSelectedModel] = useState('auto');
  const [ragStatus, setRagStatus] = useState<RAGStatusResponse | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);

  const dialogueContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll on new message
  useEffect(() => {
    if (dialogueContainerRef.current) {
      dialogueContainerRef.current.scrollTop = dialogueContainerRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  // Fetch workspace scope statistics & graph
  const fetchWorkspaceContext = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const [statsData, graphResp, statusData] = await Promise.all([
        getWorkspaceDashboard(workspaceId).catch(() => null),
        getWorkspaceGraph(workspaceId).catch(() => null),
        getRAGStatus(workspaceId).catch(() => null),
      ]);
      if (statsData) setStats(statsData);
      if (graphResp) setGraphData(graphResp);
      if (statusData) {
        setRagStatus(statusData);
        if (statusData.current_model) {
          setSelectedModel(statusData.current_model);
        }
      }
    } catch {
      // Gracefully maintain state
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchWorkspaceContext();
  }, [fetchWorkspaceContext]);

  // Fetch real persistent conversations list for the active workspace
  const fetchConversations = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoadingConversations(true);
    try {
      const res = await listConversations(workspaceId);
      const items = res.items || [];
      setConversations(items);

      // If activeConversationId is not set and conversations exist, select the first thread
      if (items.length > 0 && !activeConversationId) {
        setActiveConversationId(items[0].id);
      }
    } catch {
      // Handle gracefully
    } finally {
      setIsLoadingConversations(false);
    }
  }, [workspaceId, activeConversationId]);

  useEffect(() => {
    fetchConversations();
  }, [workspaceId]); // only run when workspaceId changes

  // Load message history when active conversation changes
  // CRITICAL: Switching conversation NEVER submits a prompt or sends to LLM!
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([WELCOME_MESSAGE]);
      setActiveCitations([]);
      return;
    }

    let isMounted = true;
    const loadConversationMessages = async () => {
      setIsLoadingMessages(true);
      try {
        const rawRes = await listMessages(activeConversationId);
        if (!isMounted) return;

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

        // Populate active citations from the last assistant message
        const lastAssistant = [...mapped].reverse().find((msg) => msg.role === 'assistant' && msg.citations && msg.citations.length > 0);
        if (lastAssistant && lastAssistant.citations) {
          setActiveCitations(lastAssistant.citations);
        } else {
          setActiveCitations([]);
        }
      } catch {
        if (isMounted) {
          setMessages([
            {
              id: 'load-error',
              role: 'assistant',
              content: 'Failed to load conversation messages from the database.',
              timestamp: 'Just now',
              error: 'Could not retrieve message history for this conversation thread.',
            },
          ]);
        }
      } finally {
        if (isMounted) setIsLoadingMessages(false);
      }
    };

    loadConversationMessages();

    return () => {
      isMounted = false;
    };
  }, [activeConversationId]);

  // Suggested inquiries derived from actual workspace entities
  const suggestedInquiries = useMemo(() => {
    if (!graphData || graphData.nodes.length === 0) {
      return [
        'What are the primary themes in my active notes?',
        'Which concepts are currently isolated without connections?',
      ];
    }
    const nodes = graphData.nodes;
    const suggestions: string[] = [];
    if (nodes[0]) {
      suggestions.push(`What does my knowledge base say about ${nodes[0].name}?`);
    }
    if (nodes[0] && nodes[1]) {
      suggestions.push(`How do ${nodes[0].name} and ${nodes[1].name} connect in my research?`);
    }
    if (nodes.length > 2) {
      suggestions.push(
        `Synthesize the relationships between ${nodes
          .slice(0, 3)
          .map((n) => n.name)
          .join(', ')}.`
      );
    }
    return suggestions;
  }, [graphData]);

  // Compute RESTRAINED and genuinely relevant Grounded Concepts for an assistant message
  // Strict rule: Only include concepts mentioned in the user query or assistant answer!
  const getRelevantGroundedConcepts = useCallback(
    (messageContent: string, priorUserQuery?: string): string[] => {
      if (!graphData || !graphData.nodes || graphData.nodes.length === 0) return [];
      const contentLower = messageContent.toLowerCase();
      const queryLower = (priorUserQuery || '').toLowerCase();

      const matched: string[] = [];
      for (const node of graphData.nodes) {
        const nameLower = node.name.toLowerCase();
        // Ignore single/two letter names to prevent false substring matches
        if (nameLower.length < 3) continue;
        if (contentLower.includes(nameLower) || queryLower.includes(nameLower)) {
          matched.push(node.name);
          if (matched.length >= 5) break; // Restrain to at most 5 relevant concepts
        }
      }
      return matched;
    },
    [graphData]
  );

  // New Chat action: Creates a fresh clean session without submitting anything
  const handleNewChat = useCallback(() => {
    if (isStreaming) {
      abortControllerRef.current?.abort();
      setIsStreaming(false);
    }
    setActiveConversationId(null);
    setMessages([WELCOME_MESSAGE]);
    setActiveCitations([]);
    setInputPrompt('');
  }, [isStreaming]);

  // Delete Conversation action with CASCADE cleanup
  const handleDeleteConversation = useCallback(
    async (convId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await deleteConversation(convId);
        setConversations((prev) => prev.filter((c) => c.id !== convId));
        setDeleteConfirmId(null);

        // If the deleted conversation was active, switch to next available or new chat
        if (activeConversationId === convId) {
          const remaining = conversations.filter((c) => c.id !== convId);
          if (remaining.length > 0) {
            setActiveConversationId(remaining[0].id);
          } else {
            handleNewChat();
          }
        }
      } catch {
        // Handle error gracefully
      }
    },
    [activeConversationId, conversations, handleNewChat]
  );

  // Send Message: One submission produces one backend request and one response.
  const handleSendMessage = useCallback(
    async (textToSend?: string) => {
      const userText = (textToSend !== undefined ? textToSend : inputPrompt).trim();
      if (!userText || isStreaming || !workspaceId) return;

      setInputPrompt('');
      setIsStreaming(true);

      let targetConvId = activeConversationId;

      // 1. If this is a new conversation thread, create it in the database first
      if (!targetConvId) {
        try {
          const convTitle = userText.length > 45 ? `${userText.slice(0, 45)}...` : userText;
          const createdConv = await createConversation(workspaceId, { title: convTitle });
          targetConvId = createdConv.id;
          setActiveConversationId(createdConv.id);
          setConversations((prev) => [createdConv, ...prev]);
        } catch {
          // If creation fails, show error
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

      // Add user message to UI
      const userMsgId = `user-${Date.now()}`;
      const userDisplayMsg: LocalDisplayMessage = {
        id: userMsgId,
        role: 'user',
        content: userText,
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

      // Prepare AbortController
      abortControllerRef.current = new AbortController();

      let accumulatedContent = '';
      const gatheredCitations: CitedSourceItem[] = [];

      try {
        await streamAssistantResponse(
          targetConvId,
          userText,
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
          abortControllerRef.current.signal
        );
      } catch (err: unknown) {
        const errorMsg =
          err instanceof Error
            ? err.message
            : 'Failed to communicate with the assistant reasoning service.';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: accumulatedContent,
                  error: errorMsg,
                }
              : m
          )
        );
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [activeConversationId, inputPrompt, isStreaming, workspaceId]
  );

  // Active conversation title for the masthead
  const currentConversation = conversations.find((c) => c.id === activeConversationId);
  const activeTitle = currentConversation?.title || initialQuery || 'Knowledge Inquiry';

  return (
    <div className="relative flex flex-col h-[calc(100vh-57px)] overflow-hidden text-[13px] leading-relaxed select-none">
      {/* Archival paper grain texture */}
      <div className="paper-grain" />

      {/* Background Intimate Study Desk Environment */}
      <div className="study-environment">
        <div
          className="study-plate"
          style={{ backgroundImage: `url(${stellaStudiolum})` }}
        />
        <div className="ambient-candlelamp" />
      </div>

      {/* Persistent Reopen Inquiries Edge Tab */}
      {!isInquiriesOpen && (
        <div className="fixed top-20 left-0 z-30 pointer-events-auto">
          <button
            type="button"
            onClick={() => setIsInquiriesOpen(true)}
            className="bg-[var(--bg-panel)]/95 hover:bg-white backdrop-blur-md border border-l-0 border-[var(--border-strong)] rounded-r-xl shadow-md py-2 px-3 flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)] transition-all active:scale-95 group cursor-pointer"
            title="Open Research Inquiries"
          >
            <i className="ph ph-chat-teardrop-text text-sm text-[var(--accent-midnight)] group-hover:scale-110 transition-transform" />
            <span className="serif-italic font-medium">Inquiries</span>
          </button>
        </div>
      )}

      {/* Persistent Reopen Evidence Edge Tab */}
      {!isEvidenceOpen && (
        <div className="fixed top-20 right-0 z-30 pointer-events-auto">
          <button
            type="button"
            onClick={() => setIsEvidenceOpen(true)}
            className="bg-[var(--bg-panel)]/95 hover:bg-white backdrop-blur-md border border-r-0 border-[var(--border-strong)] rounded-l-xl shadow-md py-2 px-3 flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)] transition-all active:scale-95 group cursor-pointer"
            title="Open Sources in Context"
          >
            <span className="serif-italic font-medium">Sources in Context</span>
            <i className="ph ph-book-bookmark text-sm text-[var(--accent-midnight)] group-hover:scale-110 transition-transform" />
          </button>
        </div>
      )}

      {/* ================= MAIN WORKSPACE: 3-COLUMN RESEARCH STUDY ================= */}
      <main className="relative z-10 flex-1 w-full max-w-[1720px] mx-auto px-6 py-4 md:px-8 md:py-5 flex gap-6 overflow-hidden min-h-0">
        {/* ================= LEFT COLUMN: INQUIRY THREADS & CONTEXT (280px) ================= */}
        {isInquiriesOpen && (
          <aside className="w-[280px] shrink-0 h-full min-h-0 flex flex-col gap-4 transition-all duration-300">
            {/* Header / New Chat Trigger */}
            <div className="instrument-panel p-3 flex flex-col gap-2.5">
              <div className="panel-bracket-tl" />
              <div className="panel-bracket-br" />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="ph ph-sparkle text-sm text-[var(--accent-midnight)]" />
                  <span className="serif-italic text-sm font-semibold text-[var(--ink-primary)]">
                    Stella Inquiries
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsInquiriesOpen(false)}
                  className="w-6 h-6 rounded flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white transition-colors cursor-pointer"
                  title="Collapse Inquiries Panel"
                >
                  <i className="ph ph-caret-left text-sm" />
                </button>
              </div>

              {/* + New Chat Button (Approved Hyades Styling) */}
              <button
                type="button"
                onClick={handleNewChat}
                className="w-full py-1.5 px-3 rounded-lg bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] text-xs font-medium flex items-center justify-center gap-2 shadow-2xs transition-all active:scale-95 cursor-pointer"
              >
                <i className="ph ph-plus text-xs text-[var(--accent-brass)]" />
                <span>+ New Chat</span>
              </button>
            </div>

            {/* Conversation Threads List */}
            <div className="instrument-panel p-3 flex-1 flex flex-col gap-2 min-h-0">
              <div className="panel-bracket-tl" />
              <div className="panel-bracket-br" />

              <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border-parchment)]">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-secondary)]">
                  Conversations ({conversations.length})
                </span>
                {isLoadingConversations && (
                  <i className="ph ph-spinner animate-spin text-xs text-[var(--accent-midnight)]" />
                )}
              </div>

              <div className="flex flex-col gap-1.5 overflow-y-auto flex-1 pr-1">
                {conversations.length > 0 ? (
                  conversations.map((conv) => {
                    const isActive = conv.id === activeConversationId;
                    const isDeleting = deleteConfirmId === conv.id;

                    return (
                      <div
                        key={conv.id}
                        onClick={() => {
                          if (activeConversationId !== conv.id) {
                            setActiveConversationId(conv.id);
                          }
                        }}
                        className={`p-2.5 rounded-lg border transition-all flex flex-col gap-1 cursor-pointer group relative ${
                          isActive
                            ? 'bg-white border-[var(--accent-terracotta)] shadow-2xs'
                            : 'hover:bg-white/80 border-transparent hover:border-[var(--border-parchment)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`text-xs font-medium truncate flex-1 ${
                              isActive ? 'text-[var(--ink-primary)]' : 'text-[var(--ink-secondary)] group-hover:text-[var(--ink-primary)]'
                            }`}
                          >
                            {conv.title || 'Untitled Research'}
                          </span>

                          {/* Delete Thread Button */}
                          {isDeleting ? (
                            <div className="flex items-center gap-1 z-10" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteConversation(conv.id, e)}
                                className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-medium hover:bg-red-700 cursor-pointer"
                                title="Confirm Delete"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirmId(null);
                                }}
                                className="px-1 py-0.5 rounded text-[9px] text-[var(--ink-secondary)] hover:bg-gray-200 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmId(conv.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 text-[var(--ink-tertiary)] hover:text-red-600 p-1 transition-opacity cursor-pointer rounded"
                              title="Delete conversation"
                            >
                              <i className="ph ph-trash text-xs" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-[var(--ink-tertiary)]">
                          <span>
                            {conv.updated_at
                              ? new Date(conv.updated_at).toLocaleDateString([], {
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : 'Recent'}
                          </span>
                          {isActive && (
                            <span className="mono text-[9px] text-[var(--accent-terracotta)] font-medium">
                              Active
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-3 text-center text-xs text-[var(--ink-tertiary)] italic">
                    No prior conversations recorded. Start an inquiry below.
                  </div>
                )}
              </div>
            </div>

            {/* Knowledge Context Scope Box */}
            <div className="instrument-panel p-3.5 flex flex-col gap-2.5">
              <div className="panel-bracket-tl" />
              <div className="panel-bracket-br" />

              <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-2">
                <div className="flex items-center gap-1.5">
                  <i className="ph ph-brain text-xs text-[var(--accent-terracotta)]" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-primary)]">
                    Knowledge Context
                  </span>
                </div>
              </div>

              {/* Real Scope metrics */}
              <div className="grid grid-cols-3 gap-1.5 py-0.5 text-center">
                <div className="p-1.5 rounded-lg bg-white border border-[var(--border-parchment)]">
                  <div className="serif text-sm font-semibold text-[var(--ink-primary)]">
                    {stats?.total_sources ?? 0}
                  </div>
                  <div className="text-[9px] text-[var(--ink-tertiary)] uppercase tracking-wider">
                    Sources
                  </div>
                </div>
                <div className="p-1.5 rounded-lg bg-white border border-[var(--border-parchment)]">
                  <div className="serif text-sm font-semibold text-[var(--accent-terracotta)]">
                    {stats?.total_notes ?? 0}
                  </div>
                  <div className="text-[9px] text-[var(--ink-tertiary)] uppercase tracking-wider">
                    Notes
                  </div>
                </div>
                <div className="p-1.5 rounded-lg bg-white border border-[var(--border-parchment)]">
                  <div className="serif text-sm font-semibold text-[var(--accent-midnight)]">
                    {graphData?.stats?.node_count ?? 0}
                  </div>
                  <div className="text-[9px] text-[var(--ink-tertiary)] uppercase tracking-wider">
                    Concepts
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* ================= CENTER: DIALOGUE CANVAS & ANCHORED COMPOSER ================= */}
        <section className="flex-1 flex flex-col min-w-0 h-full min-h-0 relative">
          {/* Conversation Scroll Canvas */}
          <div
            ref={dialogueContainerRef}
            className="flex-1 overflow-y-auto pr-2 pb-6 flex flex-col gap-6"
            id="dialogue-container"
          >
            {/* Dialogue Masthead */}
            <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-3 px-1">
              <div>
                <div className="text-[10px] mono uppercase tracking-wider text-[var(--accent-terracotta)] font-medium flex items-center gap-1.5">
                  <span>Stella Study</span>
                  <span>·</span>
                  <span>Scholarly Reasoning</span>
                  {ragStatus && (
                    <>
                      <span>·</span>
                      <span className="text-[var(--accent-midnight)]">
                        Provider: {ragStatus.provider}
                      </span>
                    </>
                  )}
                </div>
                <h1 className="serif text-xl sm:text-2xl font-semibold text-[var(--ink-primary)] tracking-tight mt-0.5">
                  {activeTitle}{' '}
                  <span className="serif-italic font-normal text-[var(--accent-midnight)] text-lg">
                    · Research Thread
                  </span>
                </h1>
              </div>

              <div className="flex items-center gap-2">
                {onNavigateToObservatory && (
                  <button
                    type="button"
                    onClick={onNavigateToObservatory}
                    className="px-2.5 py-1 rounded-md bg-[var(--bg-panel)] hover:bg-white border border-[var(--border-strong)] text-xs text-[var(--ink-secondary)] hover:text-[var(--accent-midnight)] transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <i className="ph ph-compass text-xs text-[var(--accent-terracotta)]" />
                    <span>View in Observatory ↗</span>
                  </button>
                )}
              </div>
            </div>

            {/* Loading indicator for messages */}
            {isLoadingMessages && (
              <div className="p-6 text-center text-xs text-[var(--ink-tertiary)] flex items-center justify-center gap-2 italic">
                <i className="ph ph-spinner animate-spin text-sm text-[var(--accent-midnight)]" />
                Loading conversation messages...
              </div>
            )}

            {/* Messages list */}
            {messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              // Find prior user prompt for context matching
              const priorUserPrompt = isUser
                ? undefined
                : messages
                    .slice(0, index)
                    .reverse()
                    .find((m) => m.role === 'user')?.content;

              const relevantConcepts = !isUser
                ? getRelevantGroundedConcepts(msg.content, priorUserPrompt)
                : [];

              return (
                <div
                  key={msg.id}
                  className={
                    isUser
                      ? 'flex flex-col items-end gap-1.5 self-end max-w-[85%]'
                      : 'flex flex-col gap-2 self-start w-full'
                  }
                >
                  {isUser ? (
                    <>
                      <div className="flex items-center gap-2 px-1 text-[11px] text-[var(--ink-tertiary)]">
                        <span className="font-medium text-[var(--ink-secondary)]">You</span>
                        <span>·</span>
                        <span>{msg.timestamp}</span>
                      </div>
                      <div className="user-bubble p-4 text-[13.5px] leading-relaxed text-[var(--ink-primary)]">
                        {msg.content}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 px-1 text-[11.5px] text-[var(--ink-secondary)]">
                        <div className="w-5 h-5 rounded-full bg-[var(--accent-midnight)] text-[var(--accent-brass)] flex items-center justify-center text-[10px] shadow-2xs">
                          <i className="ph ph-sparkle" />
                        </div>
                        <span className="serif font-semibold text-[13px] text-[var(--accent-midnight)]">
                          Stella
                        </span>
                        <span>·</span>
                        <span className="text-[11px] text-[var(--ink-tertiary)]">
                          {msg.citations && msg.citations.length > 0
                            ? `Grounded in ${msg.citations.length} sources`
                            : msg.timestamp}
                          {msg.latencyMs ? ` · ${(msg.latencyMs / 1000).toFixed(1)}s` : ''}
                        </span>
                      </div>

                      <article className="stella-card p-6 md:p-7 text-[13.5px] leading-relaxed text-[var(--ink-primary)] flex flex-col gap-4">
                        {msg.error ? (
                          <div className="p-4 rounded-xl bg-red-50/80 border border-red-200 text-red-800 flex flex-col gap-2">
                            <div className="flex items-center gap-2 font-medium text-xs">
                              <i className="ph ph-warning-circle text-base text-red-600" />
                              <span>Assistant Reasoning Error</span>
                            </div>
                            <p className="text-xs text-red-700 leading-relaxed">{msg.error}</p>
                            <button
                              type="button"
                              onClick={() => {
                                const lastUser = [...messages]
                                  .reverse()
                                  .find((m) => m.role === 'user');
                                if (lastUser) handleSendMessage(lastUser.content);
                              }}
                              className="self-start mt-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium cursor-pointer transition-colors"
                            >
                              Retry Inquiry
                            </button>
                          </div>
                        ) : msg.content ? (
                          // Render Markdown with rich editorial typography
                          <div
                            className="markdown-body serif text-[15px] leading-relaxed text-[var(--ink-primary)]"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                          />
                        ) : (
                          <div className="text-[var(--ink-tertiary)] italic flex items-center gap-2 py-2">
                            <i className="ph ph-spinner animate-spin text-sm text-[var(--accent-midnight)]" />
                            <span>Synthesizing response from knowledge graph...</span>
                          </div>
                        )}

                        {/* Restrained Grounded Concepts and Citations footer */}
                        {((relevantConcepts && relevantConcepts.length > 0) ||
                          (msg.citations && msg.citations.length > 0)) && (
                          <div className="pt-3 border-t border-[var(--border-parchment)] flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              {relevantConcepts.length > 0 && (
                                <>
                                  <span className="text-[11px] mono uppercase text-[var(--ink-tertiary)] font-medium">
                                    Grounded In:
                                  </span>
                                  {relevantConcepts.map((c) => (
                                    <button
                                      key={c}
                                      type="button"
                                      onClick={() => onNavigateToObservatory && onNavigateToObservatory()}
                                      className="concept-chip cursor-pointer"
                                      title={`View ${c} in Observatory`}
                                    >
                                      <svg width="8" height="8" viewBox="-5 -5 10 10" fill="currentColor">
                                        <path d="M 0 -5 L 1.2 -1.2 L 5 0 L 1.2 1.2 L 0 5 L -1.2 1.2 L -5 0 L -1.2 -1.2 Z" />
                                      </svg>
                                      {c}
                                    </button>
                                  ))}
                                </>
                              )}

                              {msg.citations && msg.citations.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveCitations(msg.citations || []);
                                    setIsEvidenceOpen(true);
                                  }}
                                  className="source-chip cursor-pointer"
                                >
                                  <i className="ph ph-file-text text-xs" />
                                  {msg.citations.length} Grounded Sources
                                </button>
                              )}
                            </div>

                            {onNavigateToObservatory && (
                              <button
                                type="button"
                                onClick={onNavigateToObservatory}
                                className="px-2.5 py-1 rounded-md bg-[var(--accent-midnight)] text-white hover:bg-[var(--accent-midnight-light)] text-[11.5px] font-medium transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                              >
                                <span>Observatory</span>
                                <span className="text-[var(--accent-brass)]">↗</span>
                              </button>
                            )}
                          </div>
                        )}
                      </article>
                    </>
                  )}
                </div>
              );
            })}

            {/* Suggested inquiries for empty thread */}
            {messages.length <= 1 && (
              <div className="p-4 rounded-xl border border-[var(--border-parchment)] bg-white/60 flex flex-col gap-2.5 max-w-xl mx-auto my-4">
                <span className="text-[10px] mono uppercase text-[var(--ink-tertiary)] font-semibold">
                  Suggested Research Inquiries
                </span>
                {suggestedInquiries.map((sq) => (
                  <button
                    key={sq}
                    type="button"
                    onClick={() => handleSendMessage(sq)}
                    className="text-left p-2.5 rounded-lg bg-white hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-[12.5px] text-[var(--ink-primary)] leading-snug transition-all cursor-pointer shadow-2xs"
                  >
                    <i className="ph ph-sparkle text-xs text-[var(--accent-terracotta)] mr-2 inline" />
                    {sq}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ================= COMPOSER: ANCHORED RESEARCH DESK INPUT ================= */}
          <div className="mt-auto pt-3 border-t border-[var(--border-parchment)] shrink-0">
            <div className="instrument-panel p-2.5 shadow-md flex flex-col gap-2 bg-white/95">
              <div className="panel-bracket-tl" />
              <div className="panel-bracket-br" />

              <div className="relative">
                <textarea
                  rows={2}
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Ask Stella about your notes, sources, or concepts... (Press Enter to send)"
                  className="w-full bg-transparent resize-none outline-none text-[13.5px] placeholder:text-[var(--ink-tertiary)] px-2 pt-1 leading-relaxed text-[var(--ink-primary)]"
                />
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-[var(--border-parchment)]">
                <div className="flex items-center gap-2">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="px-2 py-1 bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] rounded text-[11px] text-[var(--ink-secondary)] outline-none cursor-pointer"
                  >
                    <option value="auto">Model: Auto ({ragStatus?.provider || 'Standard'})</option>
                    {ragStatus?.recommended_models?.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSendMessage()}
                    disabled={!inputPrompt.trim() || isStreaming}
                    className="px-4 py-1.5 rounded-lg bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] text-xs font-medium flex items-center gap-1.5 shadow-2xs disabled:opacity-50 active:scale-95 transition-all cursor-pointer"
                  >
                    {isStreaming ? (
                      <>
                        <i className="ph ph-spinner animate-spin text-xs text-[var(--accent-brass)]" />
                        <span>Reasoning...</span>
                      </>
                    ) : (
                      <>
                        <span>Send Inquiry</span>
                        <i className="ph ph-arrow-up text-xs text-[var(--accent-brass)]" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= RIGHT COLUMN: SOURCES IN CONTEXT (EVIDENCE DRAWER) ================= */}
        {isEvidenceOpen && (
          <aside className="w-[320px] shrink-0 h-full min-h-0 flex flex-col gap-4 transition-all duration-300">
            <div className="instrument-panel p-4 flex-1 flex flex-col gap-3 min-h-0">
              <div className="panel-bracket-tl" />
              <div className="panel-bracket-br" />

              <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-2.5">
                <div className="flex items-center gap-2">
                  <i className="ph ph-book-bookmark text-sm text-[var(--accent-terracotta)]" />
                  <span className="serif-italic text-sm font-medium text-[var(--ink-secondary)]">
                    Sources in Context
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEvidenceOpen(false)}
                  className="w-6 h-6 rounded flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white transition-colors cursor-pointer"
                  title="Close Sources Panel"
                >
                  <i className="ph ph-x text-sm" />
                </button>
              </div>

              <div className="flex flex-col gap-3 overflow-y-auto flex-1 pr-1">
                {activeCitations.length > 0 ? (
                  activeCitations.map((cite, idx) => (
                    <div
                      key={cite.chunk_id || idx}
                      className="card-surface p-3 flex flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="mono text-[10px] font-semibold text-[var(--accent-midnight)] uppercase">
                          Source #{idx + 1}
                        </span>
                        <span className="mono text-[9.5px] text-[var(--accent-terracotta)]">
                          {(cite.score * 100).toFixed(0)}% Match
                        </span>
                      </div>
                      <div className="font-semibold text-xs text-[var(--ink-primary)]">
                        {cite.title}
                      </div>
                      <p className="text-[11.5px] text-[var(--ink-secondary)] leading-relaxed line-clamp-4">
                        &ldquo;{cite.excerpt}&rdquo;
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-xs text-[var(--ink-tertiary)] italic">
                    Submit an inquiry to inspect retrieved source passages and citations.
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}
      </main>
    </div>
  );
};
