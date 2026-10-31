import React from 'react';
import { LinkNotesCardData } from '@/types/commands';
import { Link2, FileText, ArrowUpRight, Plus, Tag, CheckCircle2, Loader2 } from 'lucide-react';

interface InChatLinkSuggestionsCardProps {
  linkData: LinkNotesCardData;
  onConnectNotes?: (sourceNoteId: string, targetNoteId: string) => void;
  onOpenNote?: (noteId: string) => void;
}

export const InChatLinkSuggestionsCard: React.FC<InChatLinkSuggestionsCardProps> = ({
  linkData,
  onConnectNotes,
  onOpenNote,
}) => {
  const connectedCount = linkData.candidates.filter(
    (c) => c.alreadyLinked || c.connectionStatus === 'connected'
  ).length;

  return (
    <div className="card-surface mt-3 p-4 rounded-xl border border-[var(--border-parchment)] bg-white/95 shadow-xs flex flex-col gap-3 max-w-2xl text-[var(--ink-primary)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex items-center justify-center shrink-0">
            <Link2 size={15} className="text-[var(--accent-terracotta)]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-serif font-bold text-[14px] text-[var(--ink-primary)]">
              Related Connections: {linkData.sourceNoteTitle}
            </span>
            <span className="text-[11px] font-mono text-[var(--ink-tertiary)]">
              {linkData.summary}
            </span>
          </div>
        </div>

        {connectedCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
            <CheckCircle2 size={11} /> {connectedCount} Connected
          </span>
        )}
      </div>

      {/* Candidate List */}
      {linkData.candidates.length === 0 ? (
        <div className="py-4 text-center text-xs text-[var(--ink-secondary)] serif-italic">
          No related notes found in this workspace for this note.
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--border-parchment)]">
          {linkData.candidates.map((cand) => {
            const isConnected = cand.alreadyLinked || cand.connectionStatus === 'connected';
            const isConnecting = cand.connectionStatus === 'connecting';

            return (
              <div
                key={cand.noteId}
                className="py-2.5 px-2 hover:bg-[var(--bg-panel-subtle)] rounded-lg transition-colors flex items-start justify-between gap-3 group"
              >
                <div
                  onClick={() => onOpenNote && onOpenNote(cand.noteId)}
                  className="flex items-start gap-2.5 min-w-0 flex-1 cursor-pointer"
                >
                  <FileText size={14} className="text-[var(--accent-midnight)] shrink-0 mt-0.5" />
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[13px] text-[var(--ink-primary)] group-hover:text-[var(--accent-midnight)] transition-colors truncate">
                        {cand.title}
                      </span>
                      <ArrowUpRight size={11} className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--ink-tertiary)]" />
                    </div>

                    {cand.excerpt && (
                      <p className="text-[12px] text-[var(--ink-secondary)] line-clamp-1 mt-0.5 leading-snug">
                        {cand.excerpt}
                      </p>
                    )}

                    {cand.commonTags && cand.commonTags.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Tag size={10} className="text-[var(--ink-tertiary)]" />
                        {cand.commonTags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {onConnectNotes && (
                  isConnected ? (
                    <span
                      className="px-2.5 py-1 rounded bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium flex items-center gap-1 shrink-0"
                      data-testid={`connected-badge-${cand.noteId}`}
                    >
                      <CheckCircle2 size={12} />
                      <span>Connected</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={isConnecting}
                      onClick={() => onConnectNotes(linkData.sourceNoteId, cand.noteId)}
                      className="px-2.5 py-1 rounded bg-[var(--bg-panel-subtle)] hover:bg-white border border-[var(--border-parchment)] text-xs text-[var(--ink-primary)] font-medium flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs hover:border-[var(--accent-midnight)] transition-all active:scale-95 disabled:opacity-50"
                      title="Connect these notes"
                    >
                      {isConnecting ? (
                        <>
                          <Loader2 size={12} className="animate-spin text-[var(--accent-midnight)]" />
                          <span>Connecting...</span>
                        </>
                      ) : (
                        <>
                          <Plus size={12} className="text-[var(--accent-terracotta)]" />
                          <span>Connect</span>
                        </>
                      )}
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
