import React from 'react';
import { LinkSuggestion } from '@/types/link_suggestion';
import { Sparkles, ArrowRight, Check, X, FileText, Loader2 } from 'lucide-react';

export interface SuggestionCardProps {
  suggestion: LinkSuggestion;
  onAccept: (suggestionId: string) => Promise<void> | void;
  onReject: (suggestionId: string) => Promise<void> | void;
  onNavigateToNote?: (noteId: string) => void;
  isProcessing?: boolean;
}

export const SuggestionCard: React.FC<SuggestionCardProps> = ({
  suggestion,
  onAccept,
  onReject,
  onNavigateToNote,
  isProcessing = false,
}) => {
  const confPercent = Math.round(suggestion.confidence * 100);

  return (
    <div
      data-testid={`suggestion-card-${suggestion.id}`}
      className="p-3.5 bg-white hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] hover:border-[var(--border-strong)] rounded-xl space-y-2.5 shadow-2xs transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-primary)]">
            <FileText size={13} className="text-[var(--accent-terracotta)] shrink-0" />
            {onNavigateToNote ? (
              <button
                type="button"
                onClick={() => onNavigateToNote(suggestion.source_note_id)}
                className="hover:text-[var(--accent-midnight)] hover:underline text-left truncate max-w-[130px] cursor-pointer"
                title={suggestion.source_note_title}
              >
                {suggestion.source_note_title}
              </button>
            ) : (
              <span className="truncate max-w-[130px]" title={suggestion.source_note_title}>
                {suggestion.source_note_title}
              </span>
            )}
          </div>

          <ArrowRight size={13} className="text-[var(--ink-tertiary)] shrink-0" />

          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-primary)]">
            <FileText size={13} className="text-[var(--accent-terracotta)] shrink-0" />
            {onNavigateToNote ? (
              <button
                type="button"
                onClick={() => onNavigateToNote(suggestion.target_note_id)}
                className="hover:text-[var(--accent-midnight)] hover:underline text-left truncate max-w-[130px] cursor-pointer"
                title={suggestion.target_note_title}
              >
                {suggestion.target_note_title}
              </button>
            ) : (
              <span className="truncate max-w-[130px]" title={suggestion.target_note_title}>
                {suggestion.target_note_title}
              </span>
            )}
          </div>
        </div>

        <span
          data-testid={`suggestion-confidence-${suggestion.id}`}
          className="text-[10px] mono px-2 py-0.5 rounded-full bg-[var(--accent-brass-soft)] border border-[var(--accent-brass)]/40 text-[var(--accent-brass)] shrink-0 font-semibold"
        >
          {confPercent}% Match
        </span>
      </div>

      {suggestion.reason && (
        <div
          data-testid={`suggestion-reason-${suggestion.id}`}
          className="text-xs text-[var(--ink-archival)] bg-[var(--bg-panel-subtle)] p-2.5 rounded-lg border border-[var(--border-parchment)] flex items-start gap-2 leading-relaxed"
        >
          <Sparkles size={13} className="text-[var(--accent-terracotta)] mt-0.5 shrink-0" />
          <span>{suggestion.reason}</span>
        </div>
      )}

      {suggestion.shared_entity_ids && suggestion.shared_entity_ids.length > 0 && (
        <div className="text-[10px] mono text-[var(--ink-tertiary)]">
          Shared concepts: {suggestion.shared_entity_ids.length}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1 border-t border-[var(--border-parchment)]">
        <button
          type="button"
          onClick={() => onReject(suggestion.id)}
          disabled={isProcessing}
          data-testid={`reject-btn-${suggestion.id}`}
          className="px-2.5 py-1 rounded-lg text-xs font-medium text-[var(--ink-secondary)] hover:text-rose-700 hover:bg-rose-50 border border-[var(--border-strong)] hover:border-rose-300 transition-colors flex items-center gap-1 disabled:opacity-50 cursor-pointer"
        >
          {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
          <span>Reject</span>
        </button>
        <button
          type="button"
          onClick={() => onAccept(suggestion.id)}
          disabled={isProcessing}
          data-testid={`accept-btn-${suggestion.id}`}
          className="px-3 py-1 rounded-lg text-xs font-semibold bg-[var(--accent-midnight)] hover:bg-[var(--accent-midnight-light)] text-[#FAF8F2] transition-colors flex items-center gap-1 disabled:opacity-50 shadow-2xs cursor-pointer"
        >
          {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          <span>Accept Link</span>
        </button>
      </div>
    </div>
  );
};
