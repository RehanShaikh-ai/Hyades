import React, { useState } from 'react';
import { SummaryCardData } from '@/types/commands';
import { FileText, BookOpen, Link2, MoreHorizontal, Check, Copy } from 'lucide-react';

interface InChatSummaryCardProps {
  summary: SummaryCardData;
  onOpenSource?: (id: string, type: string) => void;
  onFindRelatedNotes?: (title: string) => void;
}

export const InChatSummaryCard: React.FC<InChatSummaryCardProps> = ({
  summary,
  onOpenSource,
  onFindRelatedNotes,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const textToCopy = `${summary.summaryTitle}\n${summary.metaDescription}\n\n${summary.keyPoints.map((pt) => `• ${pt}`).join('\n')}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setShowMenu(false);
  };

  const relatedCount = summary.relatedNotesCount || 4;

  return (
    <div className="card-surface mt-3 p-4 rounded-xl border border-[var(--border-parchment)] bg-white/95 shadow-xs flex flex-col gap-3 max-w-2xl text-[var(--ink-primary)]">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-[var(--border-parchment)] pb-2.5">
        <div className="w-8 h-8 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex items-center justify-center shrink-0 mt-0.5">
          <FileText size={16} className="text-[var(--accent-midnight)]" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-serif font-bold text-[14.5px] text-[var(--ink-primary)] leading-snug">
            {summary.summaryTitle}
          </span>
          <span className="text-[11px] font-mono text-[var(--ink-tertiary)] mt-0.5">
            {summary.metaDescription}
          </span>
        </div>
      </div>

      {/* Bullet Points */}
      <ul className="flex flex-col gap-2 pl-1 text-[13px] text-[var(--ink-primary)] leading-relaxed">
        {summary.keyPoints.map((pt, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="text-[var(--accent-terracotta)] font-bold shrink-0 mt-0.5">•</span>
            <span className="leading-snug">{pt}</span>
          </li>
        ))}
      </ul>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-2 border-t border-[var(--border-parchment)] text-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenSource && onOpenSource(summary.targetId, summary.targetType)}
            className="px-2.5 py-1 rounded-lg bg-[var(--bg-panel-subtle)] hover:bg-white border border-[var(--border-parchment)] hover:border-[var(--border-strong)] font-medium text-[var(--ink-primary)] flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
          >
            <BookOpen size={12} className="text-[var(--accent-midnight)]" />
            <span>View Source</span>
          </button>

          <button
            type="button"
            onClick={() => onFindRelatedNotes && onFindRelatedNotes(summary.targetTitle)}
            className="px-2.5 py-1 rounded-lg bg-[var(--bg-panel-subtle)] hover:bg-white border border-[var(--border-parchment)] hover:border-[var(--border-strong)] font-medium text-[var(--ink-primary)] flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
          >
            <Link2 size={12} className="text-[var(--accent-terracotta)]" />
            <span>Related Notes ({relatedCount})</span>
          </button>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 rounded-lg bg-[var(--bg-panel-subtle)] hover:bg-white border border-[var(--border-parchment)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-all cursor-pointer"
            title="More actions"
          >
            <MoreHorizontal size={14} />
          </button>

          {showMenu && (
            <div className="absolute right-0 bottom-full mb-1 w-36 bg-white border border-[var(--border-strong)] rounded-lg shadow-lg py-1 z-20 text-xs text-[var(--ink-primary)]">
              <button
                type="button"
                onClick={handleCopy}
                className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-panel-subtle)] flex items-center gap-2 cursor-pointer"
              >
                {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                <span>{copied ? 'Copied!' : 'Copy Summary'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
