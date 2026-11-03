import React, { useState, useMemo, useEffect } from 'react';
import {
  Sparkles,
  Minimize2,
  Maximize2,
  Target,
  Layout,
  Pencil,
  Share2,
  BookOpen,
  ShieldCheck,
  Check,
  X,
  Info,
  Loader2,
  AlertCircle,
  GitMerge,
} from 'lucide-react';
import { renderMarkdown } from '@/lib/markdown';

export interface DiffLine {
  type: 'add' | 'delete' | 'neutral';
  text: string;
}

/**
 * Robust line-by-line Longest Common Subsequence (LCS) diff.
 * Accurately determines additions, deletions, and neutral context lines.
 */
export function computeLCSDiff(original: string, modified: string): DiffLine[] {
  if (!original && !modified) return [];
  if (original === modified) {
    return original.split('\n').map((text) => ({ type: 'neutral', text }));
  }

  const a = original.split('\n');
  const b = modified.split('\n');

  // Cap at 1000 lines for high performance in interactive editing
  const maxLines = 1000;
  const aSlice = a.slice(0, maxLines);
  const bSlice = b.slice(0, maxLines);

  const dp: number[][] = Array.from({ length: aSlice.length + 1 }, () =>
    new Array(bSlice.length + 1).fill(0)
  );

  for (let i = 0; i < aSlice.length; i++) {
    for (let j = 0; j < bSlice.length; j++) {
      if (aSlice[i] === bSlice[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = aSlice.length;
  let j = bSlice.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aSlice[i - 1] === bSlice[j - 1]) {
      result.push({ type: 'neutral', text: aSlice[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'add', text: bSlice[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      result.push({ type: 'delete', text: aSlice[i - 1] });
      i--;
    }
  }

  return result.reverse();
}

export function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const OPERATION_ICONS: Record<string, React.ReactNode> = {
  merge: <GitMerge size={18} className="text-[var(--accent-terracotta)]" />,
  enrich: <Sparkles size={18} className="text-[var(--accent-terracotta)]" />,
  shorten: <Minimize2 size={18} className="text-[var(--accent-terracotta)]" />,
  expand: <Maximize2 size={18} className="text-[var(--accent-terracotta)]" />,
  simplify: <Target size={18} className="text-[var(--accent-terracotta)]" />,
  restructure: <Layout size={18} className="text-[var(--accent-terracotta)]" />,
  improve: <Pencil size={18} className="text-[var(--accent-terracotta)]" />,
  connect: <Share2 size={18} className="text-[var(--accent-terracotta)]" />,
  study: <BookOpen size={18} className="text-[var(--accent-terracotta)]" />,
  audit: <ShieldCheck size={18} className="text-[var(--accent-terracotta)]" />,
};

export interface TransformDocumentDraft {
  proposalId: string;
  confirmationToken: string;
  operation: string;
  noteId: string;
  noteTitle: string;
  originalContent: string;
  proposedContent: string;
  draftContent: string;
  originalWordCount?: number;
  proposedWordCount?: number;
  wordCountChangePercent?: number;
  whatChanged?: string[];
  diffLines?: string[];
  messageId: string;
  status: 'draft' | 'committing' | 'committed' | 'discarded';
  isDirty?: boolean;
}

export interface TransformDocumentPanelProps {
  draft: TransformDocumentDraft;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  onClose: () => void;
  onApply: (finalContent: string) => Promise<void> | void;
  onDiscard: () => void;
  onDraftChange?: (updatedContent: string) => void;
}

export const TransformDocumentPanel: React.FC<TransformDocumentPanelProps> = ({
  draft,
  isMaximized = false,
  onToggleMaximize,
  onClose,
  onApply,
  onDiscard,
  onDraftChange,
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'edit' | 'changes'>('preview');
  const [localContent, setLocalContent] = useState<string>(
    draft.draftContent || draft.proposedContent || ''
  );
  const [isApplying, setIsApplying] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Sync when draft changes from parent
  useEffect(() => {
    setLocalContent(draft.draftContent || draft.proposedContent || '');
  }, [draft.draftContent, draft.proposedContent]);

  const operation = (draft.operation || 'shorten').toLowerCase();
  const opLabel = operation.charAt(0).toUpperCase() + operation.slice(1);

  // Live word counts calculated dynamically from real content
  const origWords = useMemo(
    () => countWords(draft.originalContent),
    [draft.originalContent]
  );
  const currentWords = useMemo(
    () => countWords(localContent),
    [localContent]
  );
  const wordDiffPercent = useMemo(() => {
    if (origWords === 0) return 0;
    return Math.round(((currentWords - origWords) / origWords) * 100);
  }, [origWords, currentWords]);

  const sign = wordDiffPercent > 0 ? '+' : '';
  const pctStr = `(${sign}${wordDiffPercent}%)`;

  // Compute live line-by-line diff comparing original note to current draft
  const diffLines = useMemo(() => {
    return computeLCSDiff(draft.originalContent || '', localContent || '');
  }, [draft.originalContent, localContent]);

  const hasManualEdits = localContent !== draft.proposedContent;

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setLocalContent(val);
    setApplyError(null);
    onDraftChange?.(val);
  };

  const handleApplyClick = async () => {
    try {
      setIsApplying(true);
      setApplyError(null);
      await onApply(localContent);
    } catch (err: any) {
      setApplyError(err?.message || 'Failed to apply transformation. Please check for concurrent edits.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleDiscardClick = () => {
    if (hasManualEdits && !showDiscardConfirm) {
      setShowDiscardConfirm(true);
      return;
    }
    onDiscard();
  };

  return (
    <aside
      data-testid="transform-document-panel"
      className={`flex flex-col bg-[#FAF8F2] transition-all duration-300 z-30 select-text ${
        isMaximized
          ? 'fixed inset-0 z-50 w-full h-full bg-[#FAF8F2] rounded-none p-4 md:p-8 overflow-hidden'
          : 'w-full h-full shrink-0 min-w-0 border border-[var(--border-parchment)] rounded-2xl shadow-sm overflow-hidden'
      }`}
    >
      {/* ────────────────── Header ────────────────── */}
      <div className="px-5 py-3.5 border-b border-[var(--border-parchment)] flex items-center justify-between gap-3 bg-white/70 backdrop-blur-xs shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#FBF0EA] border border-[#F0D5C7] flex items-center justify-center shrink-0 shadow-2xs">
            {OPERATION_ICONS[operation] || <Minimize2 size={16} className="text-[var(--accent-terracotta)]" />}
          </div>
          <div className="flex flex-col min-w-0">
            <span
              className="font-serif font-bold text-sm sm:text-base text-[var(--ink-primary)] tracking-tight truncate"
              title={operation === 'merge' ? 'Merge Notes' : `Transform Note · ${opLabel}`}
            >
              {operation === 'merge' ? 'Merge Notes' : `Transform Note · ${opLabel}`}
            </span>
            <div className="flex items-center gap-1.5 text-xs text-[var(--ink-secondary)]">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span>Draft · Not applied</span>
            </div>
          </div>
        </div>

        {/* Maximize and Close Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onToggleMaximize && (
            <button
              type="button"
              data-testid="btn-maximize-document-panel"
              onClick={onToggleMaximize}
              aria-label={isMaximized ? 'Restore Split View' : 'Maximize Document Panel'}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white border border-[var(--border-parchment)] transition-colors cursor-pointer shadow-2xs"
              title={isMaximized ? 'Restore Split View' : 'Maximize Document Panel'}
            >
              {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          )}

          <button
            type="button"
            data-testid="btn-close-document-panel"
            onClick={onClose}
            aria-label="Close Document Panel"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white border border-[var(--border-parchment)] transition-colors cursor-pointer shadow-2xs"
            title="Close Document Panel"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ────────────────── Document Toolbar ────────────────── */}
      <div className="px-5 py-2.5 border-b border-[var(--border-parchment)] bg-white/40 flex items-center justify-between gap-3 flex-wrap shrink-0">
        {/* Mode Segmented Controls: Preview | Edit | Changes */}
        <div className="flex items-center gap-1 bg-[#FAF5EE] p-0.5 rounded-full border border-[var(--border-parchment)]">
          <button
            type="button"
            data-testid="tab-preview"
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-1 rounded-full text-xs transition-all cursor-pointer ${
              activeTab === 'preview'
                ? 'bg-[#FDF4EE] text-[#C85A32] border border-[#F0D5C7] font-semibold shadow-2xs'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] font-medium border border-transparent'
            }`}
          >
            Preview
          </button>

          <button
            type="button"
            data-testid="tab-edit"
            onClick={() => setActiveTab('edit')}
            className={`px-3 py-1 rounded-full text-xs transition-all cursor-pointer ${
              activeTab === 'edit'
                ? 'bg-[#FDF4EE] text-[#C85A32] border border-[#F0D5C7] font-semibold shadow-2xs'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] font-medium border border-transparent'
            }`}
          >
            Edit
          </button>

          <button
            type="button"
            data-testid="tab-changes"
            onClick={() => setActiveTab('changes')}
            className={`px-3 py-1 rounded-full text-xs transition-all cursor-pointer ${
              activeTab === 'changes'
                ? 'bg-[#FDF4EE] text-[#C85A32] border border-[#F0D5C7] font-semibold shadow-2xs'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] font-medium border border-transparent'
            }`}
          >
            Changes
          </button>
        </div>

        {/* Live Stat Line */}
        <div
          data-testid="document-stat-line"
          className="text-xs text-[var(--ink-secondary)] font-mono flex items-center gap-1.5 shrink-0"
        >
          <span>Original: {origWords.toLocaleString()} words</span>
          <span>→</span>
          <span className="font-bold text-[var(--ink-primary)]">
            Proposed: {currentWords.toLocaleString()} words
          </span>
          <span className={wordDiffPercent < 0 ? 'text-amber-800' : 'text-emerald-700'}>
            {pctStr}
          </span>
        </div>
      </div>

      {/* ────────────────── Error Banner (if any) ────────────────── */}
      {applyError && (
        <div className="px-5 py-2.5 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle size={14} className="text-rose-600 shrink-0" />
            <span>{applyError}</span>
          </div>
          <button
            type="button"
            onClick={() => setApplyError(null)}
            className="text-rose-700 hover:text-rose-900 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ────────────────── Document Content Area ────────────────── */}
      <div className="flex-1 overflow-y-auto p-6 sm:p-8 min-h-0 bg-[#FAF8F2]">
        {/* Preview Mode */}
        {activeTab === 'preview' && (
          <div
            data-testid="document-preview-content"
            className="max-w-3xl mx-auto flex flex-col gap-4 animate-fade-in"
          >
            <div
              className="markdown-body serif text-[15px] leading-relaxed text-[var(--ink-primary)]"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(localContent) }}
            />
          </div>
        )}

        {/* Edit Mode */}
        {activeTab === 'edit' && (
          <div
            data-testid="document-edit-content"
            className="max-w-3xl mx-auto h-full flex flex-col gap-2 animate-fade-in"
          >
            <div className="text-xs text-[var(--ink-secondary)] flex items-center justify-between pb-1">
              <span>Editing proposed Markdown draft:</span>
              {hasManualEdits && (
                <span className="text-[11px] text-[var(--accent-terracotta)] font-medium">
                  • Modified from original AI proposal
                </span>
              )}
            </div>
            <textarea
              data-testid="document-panel-textarea"
              value={localContent}
              onChange={handleTextChange}
              rows={24}
              placeholder="Enter markdown content..."
              className="w-full flex-1 min-h-[460px] p-4 font-mono text-xs leading-relaxed bg-white rounded-xl border border-[var(--border-parchment)] text-[var(--ink-primary)] outline-none focus:border-[#C85A32] shadow-2xs resize-none"
            />
          </div>
        )}

        {/* Changes Mode */}
        {activeTab === 'changes' && (
          <div
            data-testid="document-changes-content"
            className="max-w-3xl mx-auto flex flex-col gap-2 animate-fade-in"
          >
            <div className="p-3 bg-white rounded-xl border border-[var(--border-parchment)] flex flex-col gap-0.5 shadow-2xs font-mono text-xs">
              {diffLines.length === 0 ? (
                <div className="p-4 text-center text-stone-500 italic">
                  No differences between original note and proposed version.
                </div>
              ) : (
                diffLines.map((line, idx) => {
                  if (line.type === 'delete') {
                    return (
                      <div
                        key={idx}
                        className="bg-rose-50 text-rose-950 border-l-2 border-rose-500 px-3 py-1 my-0.5 rounded-xs whitespace-pre-wrap font-mono leading-relaxed"
                      >
                        - {line.text}
                      </div>
                    );
                  }
                  if (line.type === 'add') {
                    return (
                      <div
                        key={idx}
                        className="bg-emerald-50 text-emerald-950 border-l-2 border-emerald-500 px-3 py-1 my-0.5 rounded-xs whitespace-pre-wrap font-mono leading-relaxed"
                      >
                        + {line.text}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={idx}
                      className="text-stone-600 px-3 py-0.5 whitespace-pre-wrap font-mono leading-relaxed"
                    >
                      &nbsp;&nbsp;{line.text}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* ────────────────── Footer Action Bar ────────────────── */}
      <div className="px-5 py-3 border-t border-[var(--border-parchment)] bg-[#FAF8F2] flex items-center justify-between gap-3 flex-wrap shrink-0">
        <div className="flex items-center gap-2 text-xs text-[var(--ink-secondary)]">
          <Info size={14} className="text-[#8B5E3C] shrink-0" />
          <span className="hidden sm:inline">
            Review the proposed changes. You can edit the content or view the diff.
          </span>
          <span className="sm:hidden">Review and apply changes.</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2.5">
          {showDiscardConfirm ? (
            <div className="flex items-center gap-2 bg-rose-50 p-1.5 rounded-lg border border-rose-200">
              <span className="text-[11px] text-rose-800 font-medium">Discard edits?</span>
              <button
                type="button"
                onClick={() => {
                  setShowDiscardConfirm(false);
                  onDiscard();
                }}
                className="px-2 py-0.5 bg-rose-700 text-white rounded text-[11px] font-semibold hover:bg-rose-800 cursor-pointer"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="px-2 py-0.5 bg-white text-stone-700 rounded text-[11px] border border-stone-200 cursor-pointer"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-testid="btn-discard-draft"
              onClick={handleDiscardClick}
              disabled={isApplying}
              className="px-3.5 py-1.5 rounded-lg border border-[var(--border-parchment)] hover:bg-white text-xs font-medium text-[var(--ink-secondary)] hover:text-rose-700 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
            >
              Discard
            </button>
          )}

          <button
            type="button"
            data-testid="btn-apply-to-note"
            onClick={handleApplyClick}
            disabled={isApplying || draft.status === 'committed'}
            className="px-4 py-1.5 rounded-lg bg-[#1B2A4A] text-white hover:bg-[#24365C] text-xs font-medium flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {isApplying ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Applying...</span>
              </>
            ) : draft.status === 'committed' ? (
              <>
                <Check size={13} strokeWidth={2.5} />
                <span>Applied</span>
              </>
            ) : (
              <>
                <Check size={13} strokeWidth={2.5} />
                <span>Apply to Note</span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
};
