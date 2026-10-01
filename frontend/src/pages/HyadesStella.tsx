import React, { useState, useRef, useEffect, useCallback } from 'react';
import { runRAGStream, getRAGStatus } from '@/api/rag';
import { getDashboardStats } from '@/api/dashboard';
import { getWorkspaceGraph } from '@/api/graph';
import { DashboardStats } from '@/types/dashboard';
import { WorkspaceGraphResponse } from '@/types/graph';
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
  note_id: string;
  title: string;
  excerpt: string;
  score: number;
}

interface Message {
  id: string;
  sender: 'user' | 'stella';
  text: string;
  timestamp: string;
  sourcesCount?: number;
  conceptsCount?: number;
  concepts?: string[];
  citations?: CitedSourceItem[];
  latencyMs?: number;
  model?: string;
  error?: string;
}

interface ResearchInquiryRecord {
  id: string;
  query: string;
  timestamp: string;
  sourcesCount: number;
  conceptsCount: number;
}

export const HyadesStella: React.FC<HyadesStellaProps> = ({
  workspaceId,
  initialQuery,
  onNavigateToObservatory,
  onNavigateToLibrary,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'stella-welcome',
      sender: 'stella',
      text: 'Welcome to Stella. I am your scholarly assistant connected directly to your active workspace knowledge graph and sources.\n\nAsk me any inquiry to synthesize concepts, surface citations, or explore relationships across your notes.',
      timestamp: 'Just now',
    },
  ]);

  const [inputPrompt, setInputPrompt] = useState(initialQuery || '');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInquiriesOpen, setIsInquiriesOpen] = useState(true);
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const [activeCitations, setActiveCitations] = useState<CitedSourceItem[]>([]);
  const [selectedModel, setSelectedModel] = useState('auto');
  const [ragStatus, setRagStatus] = useState<RAGStatusResponse | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [graphData, setGraphData] = useState<WorkspaceGraphResponse | null>(null);
  const [inquiryHistory, setInquiryHistory] = useState<ResearchInquiryRecord[]>([]);

  const dialogueContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new message
  useEffect(() => {
    if (dialogueContainerRef.current) {
      dialogueContainerRef.current.scrollTop = dialogueContainerRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  // Fetch real workspace scope metrics and RAG status
  const fetchWorkspaceContext = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const [statsData, graphResp, statusData] = await Promise.all([
        getDashboardStats(workspaceId).catch(() => null),
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

  // Suggested inquiries derived from actual workspace entities
  const suggestedInquiries = React.useMemo(() => {
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
      suggestions.push(`Synthesize the relationships between ${nodes.slice(0, 3).map((n) => n.name).join(', ')}.`);
    }
    return suggestions;
  }, [graphData]);

  const handleSendMessage = async (textToSend?: string) => {
    const userText = (textToSend !== undefined ? textToSend : inputPrompt).trim();
    if (!userText || isStreaming || !workspaceId) return;

    setInputPrompt('');

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    const assistantMsgId = `stella-${Date.now()}`;
    const initialAssistantMsg: Message = {
      id: assistantMsgId,
      sender: 'stella',
      text: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, initialAssistantMsg]);

    try {
      let accumulatedText = '';
      let citationsResult: CitedSourceItem[] = [];
      let conceptsResult: string[] = [];
      let latencyMsResult: number | undefined;

      const conversationHistory = messages
        .filter((m) => !m.error && m.text.trim())
        .map((m) => ({
          role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.text,
        }));

      for await (const event of runRAGStream(workspaceId, {
        query: userText,
        model: selectedModel,
        history: conversationHistory,
      })) {
        if (event.type === 'chunk' && event.content) {
          accumulatedText += event.content;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, text: accumulatedText } : m))
          );
        } else if (event.type === 'done') {
          citationsResult = (event.citations || []).map((c) => ({
            chunk_id: c.chunk_id,
            note_id: c.note_id,
            title: c.title,
            excerpt: c.excerpt,
            score: c.score,
          }));
          conceptsResult = (event.graph_context?.entities_traversed || []).map((e) => e.name);
          latencyMsResult = event.latency_ms;

          setActiveCitations(citationsResult);
          if (citationsResult.length > 0) {
            setIsEvidenceOpen(true);
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    text:
                      accumulatedText ||
                      'Stella retrieved matching citations and graph context, but no synthesized text was returned.',
                    sourcesCount: citationsResult.length,
                    conceptsCount: conceptsResult.length,
                    concepts: conceptsResult,
                    citations: citationsResult,
                    latencyMs: latencyMsResult,
                    model: event.model,
                  }
                : m
            )
          );

          // Add to local inquiry history
          setInquiryHistory((prev) => [
            {
              id: assistantMsgId,
              query: userText,
              timestamp: 'Just now',
              sourcesCount: citationsResult.length,
              conceptsCount: conceptsResult.length,
            },
            ...prev,
          ]);
        } else if (event.type === 'ai_unavailable') {
          citationsResult = (event.citations || []).map((c) => ({
            chunk_id: c.chunk_id,
            note_id: c.note_id,
            title: c.title,
            excerpt: c.excerpt,
            score: c.score,
          }));
          setActiveCitations(citationsResult);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    text:
                      event.message ||
                      'AI service is currently unavailable. Displaying retrieved citations from your workspace.',
                    sourcesCount: citationsResult.length,
                    citations: citationsResult,
                  }
                : m
            )
          );
        } else if (event.type === 'error') {
          throw new Error(event.message || 'An error occurred during generation.');
        }
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                text: '',
                error: err?.message || 'Failed to communicate with the Stella assistant service.',
              }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const activeInquiryTitle = inquiryHistory[0]?.query || initialQuery || 'Knowledge Synthesis';

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
        {/* ================= LEFT COLUMN: INQUIRIES & KNOWLEDGE CONTEXT (280px) ================= */}
        {isInquiriesOpen && (
          <aside className="w-[280px] shrink-0 h-full min-h-0 flex flex-col gap-4 transition-all duration-300">
            {/* Current Knowledge Context Scope Box */}
            <div className="instrument-panel p-4 flex flex-col gap-3">
              <div className="panel-bracket-tl" />
              <div className="panel-bracket-br" />

              <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-2.5">
                <div className="flex items-center gap-2">
                  <i className="ph ph-brain text-sm text-[var(--accent-terracotta)]" />
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--ink-primary)]">
                    Knowledge Context
                  </span>
                </div>
              </div>

              {/* Real Scope metrics */}
              <div className="grid grid-cols-3 gap-2 py-1 text-center">
                <div className="p-2 rounded-lg bg-white border border-[var(--border-parchment)]">
                  <div className="serif text-base font-semibold text-[var(--ink-primary)]">
                    {stats?.total_sources ?? 0}
                  </div>
                  <div className="text-[10px] text-[var(--ink-tertiary)] uppercase tracking-wider mt-0.5">
                    Sources
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white border border-[var(--border-parchment)]">
                  <div className="serif text-base font-semibold text-[var(--accent-terracotta)]">
                    {stats?.total_notes ?? 0}
                  </div>
                  <div className="text-[10px] text-[var(--ink-tertiary)] uppercase tracking-wider mt-0.5">
                    Notes
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white border border-[var(--border-parchment)]">
                  <div className="serif text-base font-semibold text-[var(--accent-midnight)]">
                    {graphData?.stats?.node_count ?? 0}
                  </div>
                  <div className="text-[10px] text-[var(--ink-tertiary)] uppercase tracking-wider mt-0.5">
                    Concepts
                  </div>
                </div>
              </div>

              <div className="text-[11.5px] text-[var(--ink-secondary)] leading-relaxed">
                Stella combines semantic vector retrieval with graph topology traversals across your active notes.
              </div>

              <div className="pt-2 border-t border-[var(--border-parchment)] flex items-center justify-between text-[11px]">
                <span className="text-[var(--ink-tertiary)]">Active Scope:</span>
                <span className="font-medium text-[var(--ink-primary)] flex items-center gap-1">
                  <i className="ph ph-globe text-xs text-[var(--accent-brass)]" /> All Knowledge
                </span>
              </div>
            </div>

            {/* Recent Research Inquiries List */}
            <div className="instrument-panel p-4 flex-1 flex flex-col gap-3 min-h-0">
              <div className="panel-bracket-tl" />
              <div className="panel-bracket-br" />

              <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-2.5">
                <div className="flex items-center gap-2">
                  <i className="ph ph-chat-teardrop-text text-sm text-[var(--accent-midnight)]" />
                  <span className="serif-italic text-sm font-medium text-[var(--ink-secondary)]">
                    Research Inquiries
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsInquiriesOpen(false)}
                    className="w-6 h-6 rounded flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white transition-colors cursor-pointer"
                    title="Collapse Inquiries Panel"
                  >
                    <i className="ph ph-caret-left text-sm" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-1">
                {inquiryHistory.length > 0 ? (
                  inquiryHistory.map((item, idx) => (
                    <div
                      key={item.id}
                      onClick={() => handleSendMessage(item.query)}
                      className={`p-2.5 rounded-lg border transition-all flex flex-col gap-1 cursor-pointer ${
                        idx === 0
                          ? 'bg-white border-[var(--accent-terracotta)] shadow-2xs'
                          : 'hover:bg-white/80 border-transparent hover:border-[var(--border-parchment)]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-[10px] mono uppercase font-semibold ${
                            idx === 0 ? 'text-[var(--accent-terracotta)]' : 'text-[var(--ink-tertiary)]'
                          }`}
                        >
                          {idx === 0 ? 'Latest Inquiry' : 'Prior Inquiry'}
                        </span>
                        <span className="text-[10px] text-[var(--ink-tertiary)]">{item.timestamp}</span>
                      </div>
                      <div className="font-medium text-[12px] text-[var(--ink-primary)] line-clamp-2 leading-snug">
                        {item.query}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-[var(--ink-tertiary)]">
                        <span>{item.sourcesCount} sources</span> · <span>{item.conceptsCount} concepts</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] mono uppercase text-[var(--ink-tertiary)] font-semibold">
                      Suggested Inquiries
                    </span>
                    {suggestedInquiries.map((sq) => (
                      <button
                        key={sq}
                        type="button"
                        onClick={() => handleSendMessage(sq)}
                        className="text-left p-2.5 rounded-lg bg-white/70 hover:bg-white border border-[var(--border-parchment)] hover:border-[var(--border-strong)] text-[12px] text-[var(--ink-primary)] leading-snug transition-all cursor-pointer shadow-2xs"
                      >
                        <i className="ph ph-sparkle text-xs text-[var(--accent-terracotta)] mr-1.5 inline" />
                        {sq}
                      </button>
                    ))}
                  </div>
                )}
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
            {/* Dialogue Topic Masthead */}
            <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-3 px-1">
              <div>
                <div className="text-[10px] mono uppercase tracking-wider text-[var(--accent-terracotta)] font-medium flex items-center gap-1.5">
                  <span>Stella Study</span>
                  <span>·</span>
                  <span>Grounded Knowledge Reasoning</span>
                  {ragStatus && (
                    <>
                      <span>·</span>
                      <span className="text-[var(--accent-midnight)]">Provider: {ragStatus.provider}</span>
                    </>
                  )}
                </div>
                <h1 className="serif text-xl sm:text-2xl font-semibold text-[var(--ink-primary)] tracking-tight mt-0.5">
                  {activeInquiryTitle}{' '}
                  <span className="serif-italic font-normal text-[var(--accent-midnight)] text-lg">
                    · Scholarly Synthesis
                  </span>
                </h1>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigateToObservatory && onNavigateToObservatory()}
                  className="px-2.5 py-1 rounded-md bg-[var(--bg-panel)] hover:bg-white border border-[var(--border-strong)] text-xs text-[var(--ink-secondary)] hover:text-[var(--accent-midnight)] transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <i className="ph ph-compass text-xs text-[var(--accent-terracotta)]" />
                  <span>View in Observatory ↗</span>
                </button>
              </div>
            </div>

            {/* Messages list */}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={
                  msg.sender === 'user'
                    ? 'flex flex-col items-end gap-1.5 self-end max-w-[85%]'
                    : 'flex flex-col gap-2 self-start w-full'
                }
              >
                {msg.sender === 'user' ? (
                  <>
                    <div className="flex items-center gap-2 px-1 text-[11px] text-[var(--ink-tertiary)]">
                      <span className="font-medium text-[var(--ink-secondary)]">You</span>
                      <span>·</span>
                      <span>{msg.timestamp}</span>
                    </div>
                    <div className="user-bubble p-4 text-[13.5px] leading-relaxed text-[var(--ink-primary)]">
                      {msg.text}
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
                        {msg.sourcesCount !== undefined && msg.conceptsCount !== undefined
                          ? `Grounded in ${msg.sourcesCount} sources & ${msg.conceptsCount} concepts`
                          : msg.timestamp}
                        {msg.latencyMs ? ` · ${(msg.latencyMs / 1000).toFixed(1)}s` : ''}
                      </span>
                    </div>

                    <article className="stella-card p-6 md:p-7 text-[13.5px] leading-relaxed text-[var(--ink-primary)] flex flex-col gap-4">
                      {msg.error ? (
                        <div className="p-4 rounded-xl bg-red-50/80 border border-red-200 text-red-800 flex flex-col gap-2">
                          <div className="flex items-center gap-2 font-medium text-xs">
                            <i className="ph ph-warning-circle text-base text-red-600" />
                            <span>Inquiry Processing Error</span>
                          </div>
                          <p className="text-xs text-red-700 leading-relaxed">{msg.error}</p>
                          <button
                            type="button"
                            onClick={() => {
                              const lastUser = [...messages].reverse().find((m) => m.sender === 'user');
                              if (lastUser) handleSendMessage(lastUser.text);
                            }}
                            className="self-start mt-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium cursor-pointer transition-colors"
                          >
                            Retry Inquiry
                          </button>
                        </div>
                      ) : (
                        <div className="serif text-[15.5px] text-[var(--ink-primary)] leading-relaxed whitespace-pre-line">
                          {msg.text || (
                            <span className="text-[var(--ink-tertiary)] italic flex items-center gap-2">
                              <i className="ph ph-spinner animate-spin text-sm" />
                              Synthesizing response from knowledge graph...
                            </span>
                          )}
                        </div>
                      )}

                      {/* Concepts and Sources chips */}
                      {((msg.concepts && msg.concepts.length > 0) || (msg.citations && msg.citations.length > 0)) && (
                        <div className="pt-3 border-t border-[var(--border-parchment)] flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] mono uppercase text-[var(--ink-tertiary)] font-medium">
                              Grounded In:
                            </span>
                            {msg.concepts?.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => onNavigateToObservatory && onNavigateToObservatory()}
                                className="concept-chip cursor-pointer"
                                title={`Explore ${c} in Observatory`}
                              >
                                <svg width="8" height="8" viewBox="-5 -5 10 10" fill="currentColor">
                                  <path d="M 0 -5 L 1.2 -1.2 L 5 0 L 1.2 1.2 L 0 5 L -1.2 1.2 L -5 0 L -1.2 -1.2 Z" />
                                </svg>
                                {c}
                              </button>
                            ))}
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
                                {msg.citations.length} Related Sources
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onNavigateToObservatory && onNavigateToObservatory()}
                              className="px-2.5 py-1 rounded-md bg-[var(--accent-midnight)] text-white hover:bg-[var(--accent-midnight-light)] text-[11.5px] font-medium transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                            >
                              <span>View in Observatory</span>
                              <span className="text-[var(--accent-brass)]">↗</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  </>
                )}
              </div>
            ))}
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
                  placeholder="Ask Stella about your notes, sources, or concepts... (e.g. 'What is quantum entanglement and how does it relate to qubits?')"
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
                  title="Close Evidence Drawer"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
                {activeCitations.length > 0 ? (
                  activeCitations.map((cit) => (
                    <div key={cit.chunk_id} className="card-surface p-3 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="px-1.5 py-0.5 rounded bg-blue-50 text-[10px] text-[var(--accent-midnight)] font-medium">
                          Note Citation
                        </span>
                        <span className="text-[10px] mono text-emerald-700 font-medium">
                          {(cit.score * 100).toFixed(0)}% Match
                        </span>
                      </div>
                      <h4 className="serif text-xs font-semibold text-[var(--ink-primary)] leading-snug">
                        {cit.title}
                      </h4>
                      <p className="text-[11.5px] text-[var(--ink-secondary)] leading-relaxed italic bg-[var(--bg-panel-subtle)] p-2 rounded border border-[var(--border-parchment)]">
                        &quot;{cit.excerpt}&quot;
                      </p>
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => onNavigateToLibrary && onNavigateToLibrary()}
                          className="text-[11px] text-[var(--accent-midnight)] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <i className="ph ph-book-open text-xs" />
                          <span>Open in Library</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onNavigateToObservatory && onNavigateToObservatory()}
                          className="text-[11px] text-[var(--accent-terracotta)] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>Locate in Sky ↗</span>
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-center text-xs text-[var(--ink-tertiary)] italic">
                    No active citations retrieved for this inquiry. Send a query to surface matching passages from your library.
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
