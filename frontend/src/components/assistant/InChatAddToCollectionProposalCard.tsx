import React from 'react';
import { AddToCollectionProposalData } from '@/types/commands';
import { Layers, ArrowRight, CheckCircle2, XCircle, Loader2, Bookmark, FileText, Hash } from 'lucide-react';

interface InChatAddToCollectionProposalCardProps {
  proposal: AddToCollectionProposalData;
  isCommitting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onOpenCollection?: (collectionId: string) => void;
}

export const InChatAddToCollectionProposalCard: React.FC<InChatAddToCollectionProposalCardProps> = ({
  proposal,
  isCommitting = false,
  onConfirm,
  onCancel,
  onOpenCollection,
}) => {
  const getItemIcon = (type: string) => {
    switch (type) {
      case 'note':
        return <FileText size={13} className="text-[var(--accent-midnight)]" />;
      case 'source':
        return <Bookmark size={13} className="text-[var(--accent-terracotta)]" />;
      case 'entity':
        return <Hash size={13} className="text-[var(--accent-brass)]" />;
      default:
        return <FileText size={13} className="text-[var(--ink-secondary)]" />;
    }
  };

  const isCommitted = proposal.status === 'committed';
  const isCancelled = proposal.status === 'cancelled';

  return (
    <div className="card-surface mt-3 p-4 rounded-xl border border-[var(--border-parchment)] bg-white/95 shadow-xs flex flex-col gap-3.5 max-w-2xl text-[var(--ink-primary)] animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex items-center justify-center shrink-0">
            <Layers size={15} className="text-[var(--accent-olive)]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-serif font-bold text-[14px] text-[var(--ink-primary)]">
              Proposal: Add to Collection
            </span>
            <span className="text-[11px] font-mono text-[var(--ink-tertiary)]">
              Action: <code className="text-[var(--accent-midnight)] font-bold">{proposal.actionId}</code>
            </span>
          </div>
        </div>

        {/* Status Pill */}
        {isCommitted ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
            <CheckCircle2 size={12} /> Committed
          </span>
        ) : isCancelled ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-stone-500 bg-stone-100 px-2.5 py-0.5 rounded-full border border-stone-200">
            <XCircle size={12} /> Cancelled
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 animate-pulse">
            Awaiting Confirmation
          </span>
        )}
      </div>

      {/* Movement Graphic */}
      <div className="p-3 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex items-center justify-between gap-3 text-xs">
        {/* Item */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {getItemIcon(proposal.itemType)}
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)]">
              {proposal.itemType}
            </span>
            <span className="font-medium text-[13px] text-[var(--ink-primary)] truncate">
              {proposal.itemTitle}
            </span>
          </div>
        </div>

        <ArrowRight size={16} className="text-[var(--accent-terracotta)] shrink-0" />

        {/* Collection */}
        <div className="flex items-center gap-2 min-w-0 flex-1 justify-end text-right">
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)]">
              Destination Collection
            </span>
            <span className="font-medium text-[13px] text-[var(--accent-olive)] truncate">
              {proposal.collectionName}
            </span>
          </div>
          <Layers size={14} className="text-[var(--accent-olive)] shrink-0" />
        </div>
      </div>

      {/* Action Footer */}
      {!isCommitted && !isCancelled && (
        <div className="flex items-center justify-between pt-1 border-t border-[var(--border-parchment)]">
          <button
            type="button"
            onClick={onCancel}
            disabled={isCommitting}
            className="px-3 py-1.5 rounded-lg border border-[var(--border-parchment)] hover:bg-[var(--bg-panel-subtle)] text-xs text-[var(--ink-secondary)] font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isCommitting}
            className="px-3.5 py-1.5 rounded-lg bg-[var(--accent-midnight)] text-white hover:bg-[var(--accent-midnight-light)] text-xs font-medium flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {isCommitting ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                <span>Committing...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={13} className="text-[var(--accent-brass)]" />
                <span>Confirm & Add</span>
              </>
            )}
          </button>
        </div>
      )}

      {isCommitted && onOpenCollection && (
        <div className="flex justify-end pt-1 border-t border-[var(--border-parchment)]">
          <button
            type="button"
            onClick={() => onOpenCollection(proposal.collectionId)}
            className="px-3 py-1 rounded bg-[var(--bg-panel-subtle)] hover:bg-white border border-[var(--border-parchment)] text-xs text-[var(--accent-midnight)] font-medium flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <span>Open Collection</span>
            <ArrowRight size={11} />
          </button>
        </div>
      )}
    </div>
  );
};
