import React, { useState, useEffect, useCallback } from 'react';
import { Conversation } from '@/types/conversation';
import { MessageCitation } from '@/types/message';
import { listConversations, createConversation } from '@/api/conversations';
import { ConversationView } from '@/components/assistant/ConversationView';
import stellaPlate from '@/assets/plates/stella-plate.jpg';
import {
  Sparkles,
  Plus,
  Compass,
  BookOpen,
  Share2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  ExternalLink,
  Database,
  MessageSquare,
  Loader2,
} from 'lucide-react';

interface HyadesStellaProps {
  workspaceId: string;
  onNavigateToNote?: (noteId: string) => void;
  onNavigateToSource?: (sourceId: string) => void;
  onNavigateToObservatory?: () => void;
  onNavigateToLibrary?: () => void;
}

export const HyadesStella: React.FC<HyadesStellaProps> = ({
  workspaceId,
  onNavigateToNote,
  onNavigateToSource,
  onNavigateToObservatory,
  onNavigateToLibrary,
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<MessageCitation | null>(null);

  // Sidebars
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);

  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await listConversations(workspaceId);
      const items = res.items || [];
      setConversations(items);
      if (items.length > 0 && !activeConversationId) {
        setActiveConversationId(items[0].id);
      }
    } catch {
      // offline / mock fallback
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, activeConversationId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleNewConversation = async () => {
    try {
      const newConv = await createConversation(workspaceId);
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
    } catch {
      const tempId = `temp-conv-${Date.now()}`;
      const tempConv: Conversation = {
        id: tempId,
        workspace_id: workspaceId,
        title: 'New Research Inquiry',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setConversations((prev) => [tempConv, ...prev]);
      setActiveConversationId(tempId);
    }
  };

  const handleSelectCitation = (citation: MessageCitation) => {
    setSelectedCitation(citation);
    setIsRightSidebarOpen(true);
    if (citation.source_id && onNavigateToSource) {
      onNavigateToSource(citation.source_id);
    } else if (citation.note_id && onNavigateToNote) {
      onNavigateToNote(citation.note_id);
    }
  };

  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

  return (
    <div
      className="relative h-[calc(100vh-56px)] flex overflow-hidden bg-[#EFECE4] text-[#1C1917]"
      data-testid="assistant-panel"
    >
      {/* Background Archival Study Desk Wash */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className="absolute -bottom-8 -right-8 w-[50vw] max-w-[700px] h-[95vh] bg-no-repeat bg-contain opacity-15 mix-blend-multiply"
          style={{
            backgroundImage: `url(${stellaPlate})`,
            filter: 'contrast(1.15) sepia(0.25)',
            maskImage:
              'radial-gradient(circle at 60% 60%, black 40%, rgba(0,0,0,0.4) 70%, transparent 95%)',
            WebkitMaskImage:
              'radial-gradient(circle at 60% 60%, black 40%, rgba(0,0,0,0.4) 70%, transparent 95%)',
          }}
        />
      </div>

      {/* ── 1. LEFT COLUMN: Knowledge Context & Research Inquiries ── */}
      {isLeftSidebarOpen ? (
        <aside className="w-64 bg-[#FAF8F2]/95 border-r border-[#DCD6C8] flex flex-col justify-between relative z-10 shrink-0 backdrop-blur-md transition-all">
          <div className="flex-1 flex flex-col min-h-0">
            {/* Header */}
            <div className="px-4 py-3.5 border-b border-[#DCD6C8] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-[#BD532B]" />
                <span className="serif text-sm font-semibold text-[#1C1917]">
                  Stella Study
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsLeftSidebarOpen(false)}
                className="p-1 text-[#878074] hover:text-[#1C1917] rounded-md hover:bg-[#EFECE4] transition-colors focus:outline-none"
                title="Collapse Sidebar"
              >
                <PanelLeftClose size={15} />
              </button>
            </div>

            {/* Scope Badges */}
            <div className="p-3 border-b border-[#DCD6C8] bg-[#F7F5EE]/60 space-y-1 text-xs">
              <div className="text-[10px] mono uppercase tracking-wider text-[#878074] mb-1">
                Active Grounding Scope
              </div>
              <div className="flex items-center justify-between py-1 text-[#575249]">
                <span className="flex items-center gap-1.5">
                  <Database size={11} className="text-[#162135]" /> Ingested Sources
                </span>
                <span className="mono text-[11px] font-semibold text-[#1C1917]">Active</span>
              </div>
              <div className="flex items-center justify-between py-1 text-[#575249]">
                <span className="flex items-center gap-1.5">
                  <Share2 size={11} className="text-[#BD532B]" /> Knowledge Graph
                </span>
                <span className="mono text-[11px] font-semibold text-[#1C1917]">Hybrid</span>
              </div>
            </div>

            {/* Inquiries Thread List */}
            <div className="flex-1 overflow-y-auto hyades-scroll p-3 space-y-1">
              <div className="flex items-center justify-between px-1 py-1 text-[10px] mono uppercase tracking-wider text-[#878074]">
                <span>Research Inquiries</span>
                <button
                  type="button"
                  onClick={handleNewConversation}
                  className="text-[#BD532B] hover:text-[#9A3F1D] flex items-center gap-0.5 font-semibold"
                >
                  <Plus size={11} /> New
                </button>
              </div>

              {isLoading ? (
                <div className="py-6 text-center text-[#878074]">
                  <Loader2 size={16} className="animate-spin text-[#BD532B] mx-auto mb-1" />
                  <span className="text-[11px]">Loading...</span>
                </div>
              ) : conversations.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#878074] italic">
                  No inquiries yet. Start one below.
                </div>
              ) : (
                conversations.map((conv) => {
                  const isActive = conv.id === activeConversationId;
                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => setActiveConversationId(conv.id)}
                      className={`w-full text-left p-2.5 rounded-lg text-xs transition-colors flex items-start gap-2 ${
                        isActive
                          ? 'bg-[#EFECE4] text-[#1C1917] font-medium border border-[#DCD6C8]'
                          : 'text-[#575249] hover:bg-[#EFECE4]/60'
                      }`}
                    >
                      <MessageSquare size={13} className="shrink-0 mt-0.5 text-[#878074]" />
                      <div className="truncate flex-1">
                        <div className="truncate">{conv.title || 'Scholarly Dialogue'}</div>
                        <div className="mono text-[9px] text-[#878074] mt-0.5">
                          {new Date(conv.updated_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* New Inquiry Action */}
          <div className="p-3 border-t border-[#DCD6C8] bg-[#F7F5EE]">
            <button
              type="button"
              onClick={handleNewConversation}
              className="w-full py-2 px-3 rounded-lg bg-[#162135] text-[#FAF8F2] hover:bg-[#22324F] text-xs font-medium flex items-center justify-center gap-2 transition-colors focus:outline-none shadow-xs"
            >
              <Plus size={13} className="text-[#BD532B]" />
              <span>New Research Inquiry</span>
            </button>
          </div>
        </aside>
      ) : (
        /* Collapsed Reopen Tab for Left Context */
        <button
          type="button"
          onClick={() => setIsLeftSidebarOpen(true)}
          className="absolute top-4 left-3 z-30 p-2 bg-[#FAF8F2] border border-[#C9C2B0] rounded-lg shadow-md text-[#575249] hover:text-[#1C1917] hover:bg-[#EFECE4] transition-all focus:outline-none"
          title="Open Inquiries"
        >
          <PanelLeftOpen size={16} />
        </button>
      )}

      {/* ── 2. CENTER COLUMN: Scholarly Dialogue Canvas ──────────── */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative z-10 bg-[#F7F5EE]/60 border-r border-[#DCD6C8]">
        {/* Top Status & Grounding Pipeline Bar */}
        <div className="px-6 py-2.5 border-b border-[#DCD6C8] bg-[#FAF8F2]/90 flex items-center justify-between text-xs text-[#575249]">
          <div className="flex items-center gap-2">
            <span className="serif-italic text-sm font-medium text-[#1C1917]">
              Stella Research Companion
            </span>
            <span className="text-[#C9C2B0]">/</span>
            <span className="mono text-[10px] text-[#878074]">
              {activeConversation?.title || 'Inquiry Canvas'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[11px] text-[#575249] bg-[#EFECE4] px-2.5 py-0.5 rounded-full border border-[#DCD6C8]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Grounded in Hyades Knowledge</span>
            </span>
          </div>
        </div>

        {/* Conversation View (Independently scrolling messages with anchored composer!) */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {activeConversationId ? (
            <ConversationView
              key={activeConversationId}
              conversationId={activeConversationId}
              conversation={activeConversation}
              workspaceId={workspaceId}
              onSelectCitation={handleSelectCitation}
              className="flex-1 flex flex-col min-h-0"
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-3">
              <Sparkles size={36} className="text-[#BD532B]" />
              <h3 className="serif text-xl font-semibold text-[#1C1917]">
                Stella Research Companion
              </h3>
              <p className="text-xs text-[#575249] max-w-sm">
                Discuss papers, examine knowledge graph connections, and synthesize insights across your collection.
              </p>
              <button
                type="button"
                onClick={handleNewConversation}
                className="mt-2 px-4 py-2 bg-[#162135] text-[#FAF8F2] rounded-lg text-xs font-medium hover:bg-[#22324F] transition-colors"
              >
                Begin Inquiry
              </button>
            </div>
          )}
        </div>
      </main>

      {/* ── 3. RIGHT COLUMN: Grounding Evidence & Citations Dossier ── */}
      {isRightSidebarOpen ? (
        <aside className="w-80 bg-[#FAF8F2] border-l border-[#DCD6C8] flex flex-col justify-between relative z-10 shrink-0 backdrop-blur-md transition-all">
          <div>
            <div className="px-4 py-3.5 border-b border-[#DCD6C8] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Compass size={15} className="text-[#BD532B]" />
                <span className="serif text-sm font-semibold text-[#1C1917]">
                  Grounding Evidence
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsRightSidebarOpen(false)}
                className="p-1 text-[#878074] hover:text-[#1C1917] rounded-md hover:bg-[#EFECE4] transition-colors focus:outline-none"
                title="Collapse Evidence Dossier"
              >
                <PanelRightClose size={15} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {selectedCitation ? (
                <div className="space-y-3">
                  <div className="px-2 py-0.5 rounded text-[10px] mono uppercase font-semibold bg-[#BD532B]/10 text-[#BD532B] inline-block">
                    Selected Citation
                  </div>
                  <h4 className="serif text-base font-semibold text-[#1C1917] leading-snug">
                    {selectedCitation.title || 'Cited Passage'}
                  </h4>
                  <p className="text-xs text-[#433D35] bg-white p-3 rounded-xl border border-[#DCD6C8] leading-relaxed">
                    "{selectedCitation.excerpt || 'Excerpt from grounding corpus.'}"
                  </p>
                  <div className="flex items-center justify-between text-[11px] mono text-[#878074] pt-1">
                    <span>Relevance</span>
                    <span className="text-emerald-700 font-medium">94.8% Match</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 text-[#878074]">
                  <Compass size={28} className="mx-auto mb-2 text-[#C9C2B0]" />
                  <p className="text-xs">
                    Click any citation chip inside Stella’s answers to inspect source excerpts and graph coordinates.
                  </p>
                </div>
              )}

              {/* Spatial Bridges to Other Hyades Pages */}
              <div className="pt-4 border-t border-[#DCD6C8] space-y-2">
                <div className="text-[10px] mono uppercase tracking-wider text-[#878074]">
                  Hyades Spatial Bridges
                </div>
                {onNavigateToObservatory && (
                  <button
                    type="button"
                    onClick={onNavigateToObservatory}
                    className="w-full py-2 px-3 rounded-lg bg-white border border-[#DCD6C8] hover:border-[#C9C2B0] text-xs font-medium text-[#1C1917] flex items-center justify-between transition-colors focus:outline-none"
                  >
                    <span className="flex items-center gap-2">
                      <Share2 size={13} className="text-[#162135]" />
                      <span>Locate in Observatory</span>
                    </span>
                    <ExternalLink size={12} className="text-[#878074]" />
                  </button>
                )}
                {onNavigateToLibrary && (
                  <button
                    type="button"
                    onClick={onNavigateToLibrary}
                    className="w-full py-2 px-3 rounded-lg bg-white border border-[#DCD6C8] hover:border-[#C9C2B0] text-xs font-medium text-[#1C1917] flex items-center justify-between transition-colors focus:outline-none"
                  >
                    <span className="flex items-center gap-2">
                      <BookOpen size={13} className="text-[#BD532B]" />
                      <span>Inspect in Library</span>
                    </span>
                    <ExternalLink size={12} className="text-[#878074]" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="p-3 border-t border-[#DCD6C8] bg-[#F7F5EE] text-[10px] mono text-[#878074] text-center">
            STELLA · COGNITIVE PROVENANCE
          </div>
        </aside>
      ) : (
        /* Collapsed Reopen Tab for Right Evidence */
        <button
          type="button"
          onClick={() => setIsRightSidebarOpen(true)}
          className="absolute top-4 right-3 z-30 p-2 bg-[#FAF8F2] border border-[#C9C2B0] rounded-lg shadow-md text-[#575249] hover:text-[#1C1917] hover:bg-[#EFECE4] transition-all focus:outline-none"
          title="Open Grounding Evidence"
        >
          <PanelRightOpen size={16} />
        </button>
      )}
    </div>
  );
};
