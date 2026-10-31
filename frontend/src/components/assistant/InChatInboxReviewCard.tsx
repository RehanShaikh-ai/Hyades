import React from 'react';
import { InboxReviewCardData } from '@/types/commands';
import { Inbox, CheckCircle2, FileText, ArrowRight, Sparkles } from 'lucide-react';

interface InChatInboxReviewCardProps {
  inboxData: InboxReviewCardData;
  onNavigateToLibrary?: () => void;
  onReviewSource?: (sourceId: string) => void;
}

export const InChatInboxReviewCard: React.FC<InChatInboxReviewCardProps> = ({
  inboxData,
  onNavigateToLibrary,
  onReviewSource,
}) => {
  return (
    <div className="card-surface mt-3 p-4 rounded-xl border border-[var(--border-parchment)] bg-white/95 shadow-xs flex flex-col gap-3 max-w-2xl text-[var(--ink-primary)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex items-center justify-center shrink-0">
            <Inbox size={15} className="text-[var(--accent-midnight)]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-serif font-bold text-[14px] text-[var(--ink-primary)]">
              Workspace Ingestion Inbox
            </span>
            <span className="text-[11px] font-mono text-[var(--ink-tertiary)]">
              {inboxData.summaryMessage}
            </span>
          </div>
        </div>

        {inboxData.totalPending === 0 ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            <CheckCircle2 size={12} /> Clear
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
            {inboxData.totalPending} Pending
          </span>
        )}
      </div>

      {/* Items List */}
      {inboxData.items.length === 0 ? (
        <div className="py-5 text-center flex flex-col items-center justify-center gap-1.5 text-xs text-[var(--ink-secondary)]">
          <CheckCircle2 size={24} className="text-emerald-600 mb-1" />
          <span className="font-medium text-[var(--ink-primary)]">All ingested items reviewed</span>
          <span className="serif-italic">Upload documents or drop vaults to trigger inbox processing.</span>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--border-parchment)]">
          {inboxData.items.map((item) => (
            <div
              key={item.id}
              className="py-2.5 px-2 hover:bg-[var(--bg-panel-subtle)] rounded-lg transition-colors flex items-center justify-between gap-3"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <FileText size={14} className="text-[var(--accent-midnight)] shrink-0 mt-0.5" />
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[13px] text-[var(--ink-primary)] truncate">
                      {item.source_title}
                    </span>
                    <span className="text-[9.5px] font-mono uppercase tracking-wider px-1.5 py-0.2 rounded border bg-stone-50 text-stone-700 border-stone-200">
                      {item.source_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[var(--ink-secondary)]">
                    <span className="flex items-center gap-1">
                      <Sparkles size={11} className="text-[var(--accent-terracotta)]" />
                      {item.detected_count} {item.detected_count === 1 ? 'concept' : 'concepts'} detected
                    </span>
                    {item.detected_entities.length > 0 && (
                      <span className="truncate max-w-xs text-[var(--ink-tertiary)]">
                        ({item.detected_entities.slice(0, 3).join(', ')}
                        {item.detected_entities.length > 3 ? '...' : ''})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {onReviewSource && (
                <button
                  type="button"
                  onClick={() => onReviewSource(item.source_id)}
                  className="px-2 py-1 rounded bg-[var(--bg-panel-subtle)] hover:bg-white border border-[var(--border-parchment)] text-xs text-[var(--ink-primary)] font-medium flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
                >
                  <span>Review</span>
                  <ArrowRight size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Action Footer */}
      {onNavigateToLibrary && inboxData.totalPending > 0 && (
        <div className="pt-2 border-t border-[var(--border-parchment)] flex justify-end">
          <button
            type="button"
            onClick={onNavigateToLibrary}
            className="px-3 py-1.5 rounded-lg bg-[var(--accent-midnight)] text-white hover:bg-[var(--accent-midnight-light)] text-xs font-medium flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
          >
            <span>Open Ingestion Inbox</span>
            <ArrowRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
};
