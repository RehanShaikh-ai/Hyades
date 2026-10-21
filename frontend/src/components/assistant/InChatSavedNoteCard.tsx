import React, { useState } from 'react';
import { NoteDraftProposal } from '@/types/commands';
import { FileText, ExternalLink, Network, MoreHorizontal, CheckCircle2, Sparkles, FolderPlus } from 'lucide-react';

interface InChatSavedNoteCardProps {
  draft: NoteDraftProposal;
  onOpenNote: (noteId: string) => void;
  onViewInGraph: (noteId: string, title: string) => void;
  onAskFollowUp?: (prompt: string) => void;
}

export const InChatSavedNoteCard: React.FC<InChatSavedNoteCardProps> = ({
  draft,
  onOpenNote,
  onViewInGraph,
  onAskFollowUp,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const wordCount = draft.wordCount || draft.content.split(/\s+/).filter(Boolean).length;
  const noteId = draft.savedNoteId || '';

  const handleCopyId = () => {
    if (noteId) {
      navigator.clipboard.writeText(noteId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      setShowMenu(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 mt-3 max-w-2xl">
      {/* Compact Saved Card */}
      <div className="card-surface p-3.5 rounded-xl border border-[var(--border-parchment)] bg-white/95 shadow-2xs flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex items-center justify-center shrink-0 relative">
            <FileText size={16} className="text-[var(--accent-midnight)]" />
            <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-600 flex items-center justify-center text-white shadow-xs">
              <CheckCircle2 size={10} />
            </div>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-serif font-bold text-[14px] text-[var(--ink-primary)] truncate">
              {draft.title}
            </span>
            <span className="text-[11px] font-mono text-[var(--ink-tertiary)] flex items-center gap-1.5">
              <span>Note</span>
              <span>·</span>
              <span>{wordCount} words</span>
              <span>·</span>
              <span className="text-emerald-700 font-medium">{draft.savedAt || 'Just now'}</span>
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => noteId && onOpenNote(noteId)}
            className="px-2.5 py-1 rounded-lg bg-[var(--bg-panel-subtle)] hover:bg-white border border-[var(--border-parchment)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--ink-primary)] flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
            title="Open Note in Editor"
          >
            <ExternalLink size={12} className="text-[var(--accent-midnight)]" />
            <span>Open</span>
          </button>

          <button
            type="button"
            onClick={() => noteId && onViewInGraph(noteId, draft.title)}
            className="px-2.5 py-1 rounded-lg bg-[var(--bg-panel-subtle)] hover:bg-white border border-[var(--border-parchment)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--ink-primary)] flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
            title="Locate Note in Knowledge Graph"
          >
            <Network size={12} className="text-[var(--accent-brass)]" />
            <span>View in Graph</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 rounded-lg bg-[var(--bg-panel-subtle)] hover:bg-white border border-[var(--border-parchment)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-all cursor-pointer"
              title="More options"
            >
              <MoreHorizontal size={14} />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-[var(--border-strong)] rounded-lg shadow-lg py-1 z-20 text-xs text-[var(--ink-primary)]">
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-panel-subtle)] cursor-pointer"
                >
                  {copied ? 'Copied UUID!' : 'Copy Note ID'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    if (onAskFollowUp) onAskFollowUp(`/summarize ${draft.title}`);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-panel-subtle)] cursor-pointer"
                >
                  Summarize Note
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stella Follow-up Inquiry Prompt & Suggestions */}
      <div className="px-2 pt-1 flex flex-col gap-2">
        <p className="text-[12px] text-[var(--ink-secondary)] serif-italic leading-relaxed">
          Saved to your notes library. Would you like me to find connections to other notes, or create a collection?
        </p>

        {onAskFollowUp && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => onAskFollowUp(`/link-notes ${draft.title}`)}
              className="text-[11px] px-2.5 py-1 rounded-full bg-white/80 hover:bg-white border border-[var(--border-parchment)] hover:border-[var(--border-strong)] text-[var(--ink-primary)] flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            >
              <Sparkles size={11} className="text-[var(--accent-brass)]" />
              <span>Find connections to other notes</span>
            </button>

            <button
              type="button"
              onClick={() => onAskFollowUp(`Create a research collection for topics related to "${draft.title}".`)}
              className="text-[11px] px-2.5 py-1 rounded-full bg-white/80 hover:bg-white border border-[var(--border-parchment)] hover:border-[var(--border-strong)] text-[var(--ink-primary)] flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            >
              <FolderPlus size={11} className="text-[var(--accent-terracotta)]" />
              <span>Create research collection</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
