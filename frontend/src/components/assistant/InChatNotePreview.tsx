import React, { useState } from 'react';
import { NoteDraftProposal } from '@/types/commands';
import { renderMarkdown } from '@/lib/markdown';
import { FileText, Check, Edit3, RotateCw, X, ChevronUp, ChevronDown, Loader2, Eye } from 'lucide-react';

interface InChatNotePreviewProps {
  draft: NoteDraftProposal;
  onSave: (revisedTitle?: string, revisedContent?: string) => Promise<void>;
  onRegenerate: () => Promise<void>;
  onCancel: () => Promise<void>;
  isSaving?: boolean;
  isRegenerating?: boolean;
  onPreviewArtifact?: (artifact: {
    title: string;
    content: string;
    type: string;
    subtitle?: string;
  }) => void;
}

export const InChatNotePreview: React.FC<InChatNotePreviewProps> = ({
  draft,
  onSave,
  onRegenerate,
  onCancel,
  isSaving = false,
  isRegenerating = false,
  onPreviewArtifact,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isRevising, setIsRevising] = useState(false);
  const [editedTitle, setEditedTitle] = useState(draft.title);
  const [editedContent, setEditedContent] = useState(draft.content);

  const wordCount = draft.wordCount || draft.content.split(/\s+/).filter(Boolean).length;

  const handleSaveClick = async () => {
    if (isRevising) {
      setIsRevising(false);
      await onSave(editedTitle, editedContent);
    } else {
      await onSave();
    }
  };

  return (
    <div className="card-surface mt-3 p-4 rounded-xl border border-[var(--border-parchment)] bg-white/95 shadow-xs flex flex-col gap-3 max-w-2xl text-[var(--ink-primary)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border-parchment)] pb-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex items-center justify-center shrink-0 mt-0.5">
            <FileText size={17} className="text-[var(--accent-midnight)]" />
          </div>
          <div className="flex flex-col min-w-0">
            {isRevising ? (
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                className="w-full font-serif font-bold text-[15px] bg-[#FAF8F2] border border-[var(--border-strong)] rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-[var(--accent-midnight)] text-[var(--ink-primary)]"
                placeholder="Note Title"
              />
            ) : (
              <span className="font-serif font-bold text-[15px] text-[var(--ink-primary)] leading-tight truncate">
                {editedTitle || draft.title}
              </span>
            )}
            <span className="text-[11px] font-mono text-[var(--ink-tertiary)] mt-0.5">
              A new note · ~{wordCount} words · <span className="text-[var(--accent-terracotta)] font-semibold">Not yet saved</span>
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-[11px] font-mono text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] px-2 py-1 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] transition-colors cursor-pointer shrink-0"
        >
          <span>{isExpanded ? 'Collapse' : 'Preview'}</span>
          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {/* Body Preview */}
      {isExpanded && (
        <div className="flex flex-col gap-2 pt-1">
          {isRevising ? (
            <div className="flex flex-col gap-2">
              <label className="text-[10.5px] font-mono uppercase text-[var(--ink-tertiary)]">
                Markdown Body:
              </label>
              <textarea
                rows={10}
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="w-full font-mono text-[12px] bg-[#FAF8F2] border border-[var(--border-strong)] rounded-lg p-3 outline-none focus:ring-1 focus:ring-[var(--accent-midnight)] text-[var(--ink-primary)] leading-relaxed resize-y"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditedTitle(draft.title);
                    setEditedContent(draft.content);
                    setIsRevising(false);
                  }}
                  className="px-2.5 py-1 text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] cursor-pointer"
                >
                  Discard Edits
                </button>
                <button
                  type="button"
                  onClick={() => setIsRevising(false)}
                  className="px-3 py-1 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-xs font-medium text-[var(--ink-primary)] hover:bg-white cursor-pointer"
                >
                  Done Editing
                </button>
              </div>
            </div>
          ) : (
            <div
              className="prose prose-sm max-w-none text-[12.5px] text-[var(--ink-secondary)] leading-relaxed max-h-72 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-surface1"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(editedContent || draft.content) }}
            />
          )}
        </div>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-between border-t border-[var(--border-parchment)] pt-3 mt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={isSaving || isRegenerating}
            className="px-3.5 py-1.5 rounded-lg bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isSaving ? (
              <>
                <Loader2 size={13} className="animate-spin text-[var(--accent-brass)]" />
                <span>Saving to Notes...</span>
              </>
            ) : (
              <>
                <Check size={14} className="text-[var(--accent-brass)]" />
                <span>Save to Notes</span>
              </>
            )}
          </button>

          {onPreviewArtifact && (
            <button
              type="button"
              onClick={() =>
                onPreviewArtifact({
                  title: editedTitle || draft.title || 'Untitled Note',
                  content: editedContent || draft.content,
                  type: 'Note',
                  subtitle: draft.topic ? `Topic: ${draft.topic}` : 'Draft Concept',
                })
              }
              disabled={isSaving || isRegenerating}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-strong)] text-xs font-medium text-[var(--ink-primary)] flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Preview full rendered note in drawer"
            >
              <Eye size={13} className="text-[var(--accent-midnight)]" />
              <span>Preview</span>
            </button>
          )}

          {!isRevising && (
            <button
              type="button"
              onClick={() => {
                setIsExpanded(true);
                setIsRevising(true);
              }}
              disabled={isSaving || isRegenerating}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-strong)] text-xs font-medium text-[var(--ink-primary)] flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Edit3 size={13} className="text-[var(--ink-secondary)]" />
              <span>Revise</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRegenerate}
            disabled={isSaving || isRegenerating}
            className="px-3 py-1.5 rounded-lg bg-white hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-strong)] text-xs font-medium text-[var(--ink-primary)] flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Regenerate draft with an alternate synthesis"
          >
            <RotateCw size={13} className={`text-[var(--accent-terracotta)] ${isRegenerating ? 'animate-spin' : ''}`} />
            <span>Regenerate</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving || isRegenerating}
          className="text-xs text-[var(--ink-tertiary)] hover:text-[var(--accent-terracotta)] flex items-center gap-1 transition-colors px-2 py-1 rounded cursor-pointer"
          title="Dismiss this draft"
        >
          <X size={13} />
          <span>Cancel</span>
        </button>
      </div>
    </div>
  );
};
