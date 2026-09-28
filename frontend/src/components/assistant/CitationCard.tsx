import React from 'react';
import { MessageCitation } from '@/types/message';
import { FileText, Layers, Quote } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CitationCardProps {
  citation: MessageCitation;
  index?: number;
  onSelectCitation?: (citation: MessageCitation) => void;
  className?: string;
}

export const CitationCard: React.FC<CitationCardProps> = ({
  citation,
  index,
  onSelectCitation,
  className,
}) => {
  const isSource = Boolean(citation.source_id);
  const displayTitle =
    citation.source_title ||
    citation.note_title ||
    citation.title ||
    (isSource ? 'Source Document' : 'Workspace Note');
  const displayRank = citation.rank ?? (index !== undefined ? index + 1 : 1);
  const similarityScore = typeof citation.similarity_score === 'number'
    ? citation.similarity_score
    : 0;
  const similarityPercent = Math.round(similarityScore * 100);

  return (
    <div
      className={cn(
        'citation-card p-3 rounded-xl bg-slate-900/70 border border-slate-800/80 hover:border-sky-500/40 hover:bg-slate-900/90 transition-all duration-200 text-xs group select-text',
        onSelectCitation && 'cursor-pointer',
        className
      )}
      onClick={() => onSelectCitation?.(citation)}
      role={onSelectCitation ? 'button' : 'article'}
      tabIndex={onSelectCitation ? 0 : undefined}
      onKeyDown={(e) => e.key === 'Enter' && onSelectCitation?.(citation)}
      data-testid="citation-card"
    >
      <div className="flex items-start gap-2.5">
        {/* Rank indicator badge */}
        <div className="w-5 h-5 rounded-md bg-sky-500/15 border border-sky-500/30 text-sky-300 font-mono font-bold text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">
          [{displayRank}]
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Header with icon, title, page & Similarity Badge */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 min-w-0">
              {isSource ? (
                <Layers size={13} className="text-sky-400 flex-shrink-0" />
              ) : (
                <FileText size={13} className="text-indigo-400 flex-shrink-0" />
              )}
              <span className="font-semibold text-slate-200 truncate group-hover:text-sky-300 transition-colors">
                {displayTitle}
              </span>
              {citation.page_number && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                  p. {citation.page_number}
                </span>
              )}
            </div>

            {/* CRITICAL §8 REQUIREMENT: Label is Similarity (never Confidence) */}
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-sky-500/10 text-sky-300 border border-sky-500/20"
              data-testid="citation-similarity-badge"
            >
              Similarity: {similarityPercent}%
            </span>
          </div>

          {/* Excerpt */}
          <div className="relative pl-3 border-l-2 border-slate-700/60 text-slate-300 italic text-[11px] leading-relaxed line-clamp-3">
            <Quote size={10} className="absolute -left-1.5 top-0.5 text-slate-400 opacity-60" />
            <p className="whitespace-pre-wrap break-words">{citation.excerpt}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
