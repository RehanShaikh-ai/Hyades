import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { getRAGStatus } from '@/api/rag';
import { getWorkspaceDashboard } from '@/api/dashboard';
import { getWorkspaceGraph } from '@/api/graph';
import { renderMarkdown } from '@/lib/markdown';
import { DashboardStats } from '@/types/dashboard';
import { GraphResponse, ObservatoryTarget } from '@/types/graph';
import { StellaContext } from '@/types/navigation';
import { RAGStatusResponse } from '@/types/rag';
import { useStellaSession } from '@/context/StellaSessionContext';
import stellaStudiolum from '@/assets/plates/stella-studiolum.jpg';

interface HyadesStellaProps {
  workspaceId: string;
  initialQuery?: string;
  initialContext?: StellaContext | null;
  onNavigateToObservatory?: (target?: ObservatoryTarget) => void;
  onNavigateToLibrary?: () => void;
  environmentIndex?: number;
}

export const HyadesStella: React.FC<HyadesStellaProps> = ({
  workspaceId,
  initialQuery,
  initialContext,
  onNavigateToObservatory,
}) => {
  const {
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
  } = useStellaSession();

  const [isInquiriesOpen, setIsInquiriesOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Workspace metadata & Scope
  const [selectedModel, setSelectedModel] = useState('auto');
  const [ragStatus, setRagStatus] = useState<RAGStatusResponse | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);

  const dialogueContainerRef = useRef<HTMLDivElement>(null);

  // Handle Escape key to cancel delete confirmation dialog
  useEffect(() => {
    if (!deleteConfirmId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setDeleteConfirmId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [deleteConfirmId]);

  // Auto-scroll on new message
  useEffect(() => {
    if (dialogueContainerRef.current) {
      dialogueContainerRef.current.scrollTop = dialogueContainerRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  // Contextual Prompt & Carried Context Handler (§12, §13, §14)
  // Prefills the prompt and structured context for user review, but does NOT auto-submit.
  useEffect(() => {
    if (initialContext) {
      setActiveScope(initialContext);
      if (initialContext.prompt) {
        setInputPrompt(initialContext.prompt);
      }
    } else if (initialQuery) {
      setInputPrompt(initialQuery);
    }
  }, [initialContext, initialQuery, setActiveScope, setInputPrompt]);

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

  useEffect(() => {
    fetchConversations(workspaceId);
  }, [workspaceId, fetchConversations]);

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
    newChat();
  }, [newChat]);

  // Delete Conversation action with CASCADE cleanup
  const handleDeleteConversation = useCallback(
    async (convId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await deleteConversationById(convId);
      setDeleteConfirmId(null);
    },
    [deleteConversationById]
  );

  // Send Message: Delegate to persistent session store (survives page switching)
  const handleSendMessage = useCallback(
    async (textToSend?: string) => {
      const userText = textToSend !== undefined ? textToSend : inputPrompt;
      await sendMessage(workspaceId, userText);
    },
    [inputPrompt, sendMessage, workspaceId]
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
            aria-label="Open Research Inquiries"
            className="bg-[var(--bg-panel)]/95 hover:bg-white backdrop-blur-md border border-l-0 border-[var(--border-strong)] rounded-r-xl shadow-md py-2 px-3 flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)] transition-all active:scale-95 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] cursor-pointer"
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
            aria-label="Open Sources in Context"
            className="bg-[var(--bg-panel)]/95 hover:bg-white backdrop-blur-md border border-r-0 border-[var(--border-strong)] rounded-l-xl shadow-md py-2 px-3 flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)] transition-all active:scale-95 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] cursor-pointer"
            title="Open Sources in Context"
          >
            <span className="serif-italic font-medium">Sources in Context</span>
            <i className="ph ph-book-bookmark text-sm text-[var(--accent-midnight)] group-hover:scale-110 transition-transform" />
          </button>
        </div>
      )}

      {/* ================= MAIN WORKSPACE: 3-COLUMN RESEARCH STUDY ================= */}
      <main className="relative z-10 flex-1 w-full max-w-[1720px] mx-auto px-4 py-3 md:px-8 md:py-5 flex gap-4 md:gap-6 overflow-hidden min-h-0">
        {/* ================= LEFT COLUMN: INQUIRY THREADS & CONTEXT (280px) ================= */}
        {isInquiriesOpen && (
          <aside className="fixed inset-y-16 left-0 z-20 w-[280px] sm:w-[320px] lg:static lg:w-[280px] lg:h-full shrink-0 flex flex-col gap-4 transition-all duration-300 shadow-2xl lg:shadow-none bg-[var(--bg-base)]/95 lg:bg-transparent backdrop-blur-md lg:backdrop-blur-none p-3 lg:p-0">
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
                  aria-label="Collapse Inquiries Panel"
                  className="w-6 h-6 rounded flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)]"
                  title="Collapse Inquiries Panel"
                >
                  <i className="ph ph-caret-left text-sm" />
                </button>
              </div>

              {/* + New Chat Button (Approved Hyades Styling) */}
              <button
                type="button"
                onClick={handleNewChat}
                className="w-full py-1.5 px-3 rounded-lg bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] text-xs font-medium flex items-center justify-center gap-2 shadow-2xs transition-all active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)]"
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
                            selectConversation(conv.id);
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
                    onClick={() => onNavigateToObservatory()}
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
                      ? 'message-enter flex flex-col items-end gap-1.5 self-end max-w-[85%]'
                      : 'message-enter flex flex-col gap-2 self-start w-full'
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
                          <div className="text-[var(--ink-secondary)] flex items-center gap-2.5 py-2">
                            <span className="relative flex h-2 w-2">
                              <span className="pulse-dot absolute inline-flex h-full w-full rounded-full bg-[var(--accent-terracotta)] opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent-terracotta)]" />
                            </span>
                            <span className="serif-italic text-[13.5px] text-[var(--ink-secondary)]">Synthesizing response from knowledge archive...</span>
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
                                      onClick={() => onNavigateToObservatory && onNavigateToObservatory({ entityName: c })}
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
                                onClick={() => onNavigateToObservatory()}
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
            {/* Carried Context Banner (§12, §14) */}
            {activeScope && (
              <div className="mb-2 px-3 py-1.5 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex items-center justify-between text-xs text-[var(--ink-secondary)] animate-fade-in">
                <div className="flex items-center gap-2 truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-terracotta)] shrink-0" />
                  <span className="font-semibold text-[var(--ink-primary)] shrink-0">Carried Context:</span>
                  {activeScope.connectionSummary ? (
                    <span className="truncate">
                      Connection: <strong>{activeScope.connectionSummary.sourceEntityName}</strong> ⟷ <strong>{activeScope.connectionSummary.targetEntityName}</strong> ({activeScope.connectionSummary.relationshipType.replace(/_/g, ' ')})
                    </span>
                  ) : activeScope.noteTitle ? (
                    <span className="truncate">Note: <strong>{activeScope.noteTitle}</strong></span>
                  ) : activeScope.sourceTitle ? (
                    <span className="truncate">Source: <strong>{activeScope.sourceTitle}</strong></span>
                  ) : activeScope.entityNames ? (
                    <span className="truncate">Concepts: <strong>{activeScope.entityNames.join(', ')}</strong></span>
                  ) : (
                    <span>Structured Workspace Context</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveScope(null)}
                  aria-label="Clear carried context"
                  className="text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)] p-0.5 rounded transition-colors ml-2 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)]"
                  title="Clear carried context"
                >
                  <i className="ph ph-x text-xs" />
                </button>
              </div>
            )}

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
                  className="w-full bg-transparent resize-none outline-none text-[13.5px] placeholder:text-[var(--ink-tertiary)] px-2 pt-1 leading-relaxed text-[var(--ink-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-midnight)] rounded-md"
                />
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-[var(--border-parchment)]">
                <div className="flex items-center gap-2">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="px-2 py-1 bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] rounded text-[11px] text-[var(--ink-secondary)] outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)]"
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
                  {isStreaming && (
                    <button
                      type="button"
                      onClick={cancelGeneration}
                      className="px-3 py-1.5 rounded-lg bg-[var(--accent-terracotta)] text-[#FAF8F2] hover:bg-[#8F3819] text-xs font-medium flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-terracotta)]"
                      title="Stop inquiry generation (explicit cancel)"
                    >
                      <i className="ph-bold ph-stop text-xs" />
                      <span>Stop</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleSendMessage()}
                    disabled={!inputPrompt.trim() || isStreaming}
                    className="px-4 py-1.5 rounded-lg bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] text-xs font-medium flex items-center gap-1.5 shadow-2xs disabled:opacity-50 active:scale-95 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)]"
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
          <aside className="fixed inset-y-16 right-0 z-20 w-[280px] sm:w-[320px] lg:static lg:w-[320px] lg:h-full shrink-0 flex flex-col gap-4 transition-all duration-300 shadow-2xl lg:shadow-none bg-[var(--bg-base)]/95 lg:bg-transparent backdrop-blur-md lg:backdrop-blur-none p-3 lg:p-0">
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
                  aria-label="Close Sources Panel"
                  className="w-6 h-6 rounded flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)]"
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
