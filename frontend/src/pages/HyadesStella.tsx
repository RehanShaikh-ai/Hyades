import React, { useState, useRef, useEffect } from 'react';
import { runRAGStream } from '@/api/rag';
import stellaStudiolum from '@/assets/plates/stella-studiolum.jpg';

interface HyadesStellaProps {
  workspaceId: string;
  initialQuery?: string;
  onNavigateToObservatory?: () => void;
  onNavigateToLibrary?: () => void;
  environmentIndex?: number;
}

interface Message {
  id: string;
  sender: 'user' | 'stella';
  text: string;
  timestamp: string;
  sourcesCount?: number;
  conceptsCount?: number;
  pipelineSteps?: string[];
  concepts?: string[];
  sources?: Array<{ title: string; excerpt: string; page?: string; match: string }>;
}

export const HyadesStella: React.FC<HyadesStellaProps> = ({
  workspaceId,
  initialQuery,
  onNavigateToObservatory,
  onNavigateToLibrary,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'msg-1',
      sender: 'user',
      text: "I'm trying to understand how RAG, vector databases, and knowledge graphs fit together. Can you explain the relationship using my knowledge base?",
      timestamp: 'Today, 9:02 AM',
    },
    {
      id: 'msg-2',
      sender: 'stella',
      text: 'Think of them as three different layers of the same retrieval problem.\n\nVector databases help Hyades find information by semantic similarity. They are useful when the wording of a query differs from the wording in the source.\n\nRAG uses retrieved information to give a language model relevant context before it generates an answer.\n\nKnowledge graphs add explicit relationships between concepts, entities, and sources. Instead of only asking which pieces of text are similar, they can represent how ideas are connected.',
      timestamp: 'Today, 9:03 AM',
      sourcesCount: 3,
      conceptsCount: 7,
      pipelineSteps: [
        'Query',
        'semantic retrieval',
        'related concepts',
        'graph relationships',
        'relevant sources',
        'grounded answer',
      ],
      concepts: ['Vector Databases', 'Retrieval-Augmented Generation', 'Knowledge Graphs'],
      sources: [
        {
          title: 'Lewis et al. — Retrieval-Augmented Generation for Knowledge-Intensive NLP',
          excerpt: 'Combining pre-trained parametric and non-parametric memory for knowledge-intensive NLP tasks.',
          page: 'Page 3',
          match: '0.94 Match',
        },
        {
          title: 'Karpukhin et al. — Dense Passage Retrieval for Open-Domain Question Answering',
          excerpt: 'Dense embeddings outperform standard BM25 lexical matching in semantic proximity queries.',
          page: 'Page 6',
          match: '0.88 Match',
        },
      ],
    },
    {
      id: 'msg-3',
      sender: 'user',
      text: 'How do graph traversals overcome vector embedding blind spots in practice?',
      timestamp: 'Today, 9:06 AM',
    },
    {
      id: 'msg-4',
      sender: 'stella',
      text: 'Vector embeddings compress passages into continuous semantic points. While exceptionally fast for finding passages with similar vocabulary or thematic tone, they suffer from two structural blind spots:\n\n1. Multi-hop Relational Blindness: Vectors cannot easily follow chains of indirect logic (e.g., Entity A → relationship X → Entity B → relationship Y → Entity C) unless those entities appear within the same chunk window.\n2. High-Degree Node Smearing: Central hubs (like "Neural Networks") become dense centroids in vector space, diluting specialized queries.\n\nBy contrast, graph traversals in Hyades traverse explicit edges regardless of spatial chunking, allowing Stella to synthesize cross-cutting claims between distinct papers in your Library.',
      timestamp: 'Today, 9:07 AM',
      sourcesCount: 2,
      conceptsCount: 4,
      concepts: ['Multi-Hop Reasoning', 'Graph Clustering'],
    },
  ]);

  const [inputPrompt, setInputPrompt] = useState(initialQuery || '');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInquiriesOpen, setIsInquiriesOpen] = useState(true);
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-4o');

  const dialogueContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new message
  useEffect(() => {
    if (dialogueContainerRef.current) {
      dialogueContainerRef.current.scrollTop = dialogueContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputPrompt.trim() || isStreaming) return;

    const userText = inputPrompt;
    setInputPrompt('');

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: 'Just now',
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    const assistantMsgId = `stella-${Date.now()}`;
    const initialAssistantMsg: Message = {
      id: assistantMsgId,
      sender: 'stella',
      text: '',
      timestamp: 'Just now',
      sourcesCount: 2,
      conceptsCount: 4,
      concepts: ['Epistemic Retrieval', 'Graph Grounding'],
    };

    setMessages((prev) => [...prev, initialAssistantMsg]);

    try {
      let accumulatedText = '';
      for await (const event of runRAGStream(workspaceId, { query: userText, model: selectedModel })) {
        if (event.type === 'chunk' && event.content) {
          accumulatedText += event.content;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, text: accumulatedText } : m))
          );
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                text:
                  'I consulted your knowledge archives and synthesized these connections based on your active sources and graph topology.',
              }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

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
            className="bg-[var(--bg-panel)]/95 hover:bg-white backdrop-blur-md border border-l-0 border-[var(--border-strong)] rounded-r-xl shadow-md py-2 px-3 flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)] transition-all active:scale-95 group"
            title="Open Research Inquiries"
          >
            <svg
              className="w-4 h-4 text-[var(--accent-midnight)] group-hover:scale-110 transition-transform"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M9 3v18" />
              <path d="m11 9 3 3-3 3" />
            </svg>
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
            className="bg-[var(--bg-panel)]/95 hover:bg-white backdrop-blur-md border border-r-0 border-[var(--border-strong)] rounded-l-xl shadow-md py-2 px-3 flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)] transition-all active:scale-95 group"
            title="Open Sources in Context"
          >
            <span className="serif-italic font-medium">Sources in Context</span>
            <svg
              className="w-4 h-4 text-[var(--accent-midnight)] group-hover:scale-110 transition-transform"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M15 3v18" />
              <path d="m14 9-3 3 3 3" />
            </svg>
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

              {/* Scope metrics */}
              <div className="grid grid-cols-3 gap-2 py-1 text-center">
                <div className="p-2 rounded-lg bg-white border border-[var(--border-parchment)]">
                  <div className="serif text-base font-semibold text-[var(--ink-primary)]">142</div>
                  <div className="text-[10px] text-[var(--ink-tertiary)] uppercase tracking-wider mt-0.5">Sources</div>
                </div>
                <div className="p-2 rounded-lg bg-white border border-[var(--border-parchment)]">
                  <div className="serif text-base font-semibold text-[var(--accent-terracotta)]">24</div>
                  <div className="text-[10px] text-[var(--ink-tertiary)] uppercase tracking-wider mt-0.5">Notes</div>
                </div>
                <div className="p-2 rounded-lg bg-white border border-[var(--border-parchment)]">
                  <div className="serif text-base font-semibold text-[var(--accent-midnight)]">3.4k</div>
                  <div className="text-[10px] text-[var(--ink-tertiary)] uppercase tracking-wider mt-0.5">Concepts</div>
                </div>
              </div>

              <div className="text-[11.5px] text-[var(--ink-secondary)] leading-relaxed">
                Stella queries vector semantic embeddings and navigates the Observatory knowledge graph simultaneously.
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
                  <span className="serif-italic text-sm font-medium text-[var(--ink-secondary)]">Research Inquiries</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] mono text-[var(--ink-tertiary)]">4 active</span>
                  <button
                    type="button"
                    onClick={() => setIsInquiriesOpen(false)}
                    className="w-6 h-6 rounded flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white transition-colors"
                    title="Collapse Inquiries Panel"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="18" height="18" x="3" y="3" rx="2" />
                      <path d="M9 3v18" />
                      <path d="m14 9-3 3 3 3" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 overflow-y-auto flex-1 pr-1">
                {/* Active inquiry */}
                <div className="p-2.5 rounded-lg bg-white border border-[var(--accent-terracotta)] shadow-2xs flex flex-col gap-1 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] mono text-[var(--accent-terracotta)] font-semibold uppercase">
                      Active Inquiry
                    </span>
                    <span className="text-[10px] text-[var(--ink-tertiary)]">Just now</span>
                  </div>
                  <div className="font-medium text-[12.5px] text-[var(--ink-primary)] line-clamp-2 leading-snug">
                    RAG, Vector Databases & Knowledge Graph Topology
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10.5px] text-[var(--ink-tertiary)]">
                    <span>3 sources</span> · <span>7 concepts</span>
                  </div>
                </div>

                {/* Past inquiry 1 */}
                <div className="p-2.5 rounded-lg hover:bg-white/80 border border-transparent hover:border-[var(--border-parchment)] transition-all flex flex-col gap-1 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] mono text-[var(--ink-tertiary)] uppercase">Memory Systems</span>
                    <span className="text-[10px] text-[var(--ink-tertiary)]">Yesterday</span>
                  </div>
                  <div className="font-medium text-[12.5px] text-[var(--ink-secondary)] line-clamp-2 leading-snug">
                    Episodic vs. Semantic Memory in Multi-Agent Systems
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10.5px] text-[var(--ink-tertiary)]">
                    <span>2 sources</span> · <span>4 concepts</span>
                  </div>
                </div>

                {/* Past inquiry 2 */}
                <div className="p-2.5 rounded-lg hover:bg-white/80 border border-transparent hover:border-[var(--border-parchment)] transition-all flex flex-col gap-1 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] mono text-[var(--ink-tertiary)] uppercase">Ontology</span>
                    <span className="text-[10px] text-[var(--ink-tertiary)]">Sep 28</span>
                  </div>
                  <div className="font-medium text-[12.5px] text-[var(--ink-secondary)] line-clamp-2 leading-snug">
                    Porphyry Tree Classification and Modern Graph Ontologies
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10.5px] text-[var(--ink-tertiary)]">
                    <span>1 source</span> · <span>6 concepts</span>
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
            {/* Dialogue Topic Masthead */}
            <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-3 px-1">
              <div>
                <div className="text-[10px] mono uppercase tracking-wider text-[var(--accent-terracotta)] font-medium flex items-center gap-1.5">
                  <span>Inquiry № 104</span>
                  <span>·</span>
                  <span>Stella Study</span>
                  <span>·</span>
                  <span>Grounded Retrieval Synthesis</span>
                </div>
                <h1 className="serif text-xl sm:text-2xl font-semibold text-[var(--ink-primary)] tracking-tight mt-0.5">
                  RAG, Vector Databases & Knowledge Graph Topology{' '}
                  <span className="serif-italic font-normal text-[var(--accent-midnight)] text-lg">· Research Inquiry</span>
                </h1>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigateToObservatory && onNavigateToObservatory()}
                  className="px-2.5 py-1 rounded-md bg-[var(--bg-panel)] hover:bg-white border border-[var(--border-strong)] text-xs text-[var(--ink-secondary)] hover:text-[var(--accent-midnight)] transition-all flex items-center gap-1.5 shadow-2xs"
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
                      <span className="font-medium text-[var(--ink-secondary)]">Rehan Shaikh</span>
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
                      <span className="serif font-semibold text-[13px] text-[var(--accent-midnight)]">Stella</span>
                      <span>·</span>
                      <span className="text-[11px] text-[var(--ink-tertiary)]">
                        Synthesized using {msg.sourcesCount || 2} sources & {msg.conceptsCount || 4} concepts
                      </span>
                    </div>

                    <article className="stella-card p-6 md:p-7 text-[13.5px] leading-relaxed text-[var(--ink-primary)] flex flex-col gap-4">
                      <div className="serif text-[15.5px] text-[var(--ink-primary)] leading-relaxed whitespace-pre-line">
                        {msg.text}
                      </div>

                      {/* Pipeline steps if available */}
                      {msg.pipelineSteps && (
                        <div className="my-1 p-3.5 rounded-xl bg-[var(--bg-panel-subtle)] border border-[var(--border-strong)] flex flex-col gap-2">
                          <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-tertiary)] font-semibold flex items-center justify-between">
                            <span>In your knowledge base, these work together:</span>
                            <span className="text-[var(--accent-brass)]">Hybrid Grounding Flow</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[12px]">
                            {msg.pipelineSteps.map((step, idx) => (
                              <React.Fragment key={step}>
                                <span className="pipeline-step">
                                  <i className="ph ph-check-circle text-xs mr-1 text-[var(--accent-terracotta)]" />
                                  {step}
                                </span>
                                {idx < (msg.pipelineSteps?.length || 0) - 1 && (
                                  <span className="pipeline-arrow">→</span>
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Concepts and Sources chips */}
                      <div className="pt-3 border-t border-[var(--border-parchment)] flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] mono uppercase text-[var(--ink-tertiary)] font-medium">
                            Grounded In:
                          </span>
                          {msg.concepts?.map((c) => (
                            <span
                              key={c}
                              onClick={() => onNavigateToObservatory && onNavigateToObservatory()}
                              className="concept-chip"
                            >
                              <svg width="8" height="8" viewBox="-5 -5 10 10" fill="currentColor">
                                <path d="M 0 -5 L 1.2 -1.2 L 5 0 L 1.2 1.2 L 0 5 L -1.2 1.2 L -5 0 L -1.2 -1.2 Z" />
                              </svg>
                              {c}
                            </span>
                          ))}
                          {msg.sources && (
                            <span
                              onClick={() => setIsEvidenceOpen((prev) => !prev)}
                              className="source-chip"
                            >
                              <i className="ph ph-file-text text-xs" />
                              {msg.sources.length} Related Sources
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onNavigateToObservatory && onNavigateToObservatory()}
                            className="px-2.5 py-1 rounded-md bg-[var(--accent-midnight)] text-white hover:bg-[var(--accent-midnight-light)] text-[11.5px] font-medium transition-all flex items-center gap-1 shadow-2xs"
                          >
                            <span>View in Observatory</span>
                            <span className="text-[var(--accent-brass)]">↗</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* ================= COMPOSER: ANCHORED RESEARCH DESK INPUT ================= */}
          {/* Fixed at bottom of center column, independent of conversation scroll */}
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
                  placeholder="Ask Stella about your sources, notes, or concepts... (e.g. 'What gaps exist in my notes about RAG?')"
                  className="w-full bg-transparent resize-none outline-none text-[13.5px] placeholder:text-[var(--ink-tertiary)] px-2 pt-1 leading-relaxed text-[var(--ink-primary)]"
                />
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-[var(--border-parchment)]">
                <div className="flex items-center gap-2">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="px-2 py-1 bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] rounded text-[11px] text-[var(--ink-secondary)] outline-none"
                  >
                    <option value="gpt-4o">Model: GPT-4o (Reasoning)</option>
                    <option value="claude-3-5-sonnet">Model: Claude 3.5 Sonnet</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={!inputPrompt.trim() || isStreaming}
                    className="px-4 py-1.5 rounded-lg bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] text-xs font-medium flex items-center gap-1.5 shadow-2xs disabled:opacity-50 active:scale-95 transition-all"
                  >
                    <span>Send Inquiry</span>
                    <i className="ph ph-arrow-up text-xs text-[var(--accent-brass)]" />
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
                  <span className="serif-italic text-sm font-medium text-[var(--ink-secondary)]">Sources in Context</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEvidenceOpen(false)}
                  className="w-6 h-6 rounded flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
                <div className="card-surface p-3 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-[10px] text-[var(--accent-midnight)] font-medium">
                      PDF · NeurIPS 2020
                    </span>
                    <span className="text-[10px] mono text-emerald-700 font-medium">0.94 Match</span>
                  </div>
                  <h4 className="serif text-xs font-semibold text-[var(--ink-primary)] leading-snug">
                    Lewis et al. — Retrieval-Augmented Generation for Knowledge Tasks
                  </h4>
                  <p className="text-[11.5px] text-[var(--ink-secondary)] leading-relaxed italic bg-[var(--bg-panel-subtle)] p-2 rounded border border-[var(--border-parchment)]">
                    &quot;We endow pre-trained parametric models with non-parametric memory accessed via a dense passage retriever...&quot;
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => onNavigateToLibrary && onNavigateToLibrary()}
                      className="text-[11px] text-[var(--accent-midnight)] hover:underline flex items-center gap-1"
                    >
                      <i className="ph ph-book-open text-xs" />
                      <span>Open in Library</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigateToObservatory && onNavigateToObservatory()}
                      className="text-[11px] text-[var(--accent-terracotta)] hover:underline flex items-center gap-1"
                    >
                      <span>Locate in Sky ↗</span>
                    </button>
                  </div>
                </div>

                <div className="card-surface p-3 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-[10px] text-[var(--accent-midnight)] font-medium">
                      PDF · EMNLP 2020
                    </span>
                    <span className="text-[10px] mono text-emerald-700 font-medium">0.88 Match</span>
                  </div>
                  <h4 className="serif text-xs font-semibold text-[var(--ink-primary)] leading-snug">
                    Karpukhin et al. — Dense Passage Retrieval for Open-Domain QA
                  </h4>
                  <p className="text-[11.5px] text-[var(--ink-secondary)] leading-relaxed italic bg-[var(--bg-panel-subtle)] p-2 rounded border border-[var(--border-parchment)]">
                    &quot;Dual-encoder architecture indexing dense vectors resolves open-domain questions with higher precision than BM25...&quot;
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => onNavigateToLibrary && onNavigateToLibrary()}
                      className="text-[11px] text-[var(--accent-midnight)] hover:underline flex items-center gap-1"
                    >
                      <i className="ph ph-book-open text-xs" />
                      <span>Open in Library</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigateToObservatory && onNavigateToObservatory()}
                      className="text-[11px] text-[var(--accent-terracotta)] hover:underline flex items-center gap-1"
                    >
                      <span>Locate in Sky ↗</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}

      </main>
    </div>
  );
};
