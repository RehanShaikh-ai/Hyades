import React, { useState } from 'react';
import { MessageCitation } from '@/types/message';
import { CitationCard } from './CitationCard';
import { Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CitationListProps {
  citations: MessageCitation[];
  onSelectCitation?: (citation: MessageCitation) => void;
  className?: string;
}

export const CitationList: React.FC<CitationListProps> = ({
  citations,
  onSelectCitation,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!citations || citations.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'citation-list mt-3 pt-3 border-t border-slate-800/80 space-y-2',
        className
      )}
      data-testid="citation-list"
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-slate-100 transition-colors cursor-pointer group select-none"
        aria-expanded={isExpanded}
        aria-label="Toggle citations list"
      >
        <Layers size={13} className="text-sky-400" />
        <span>
          {citations.length} {citations.length === 1 ? 'Source Cited' : 'Sources Cited'}
        </span>
        {isExpanded ? (
          <ChevronUp size={14} className="text-slate-400 group-hover:text-slate-200" />
        ) : (
          <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-200" />
        )}
      </button>

      {isExpanded && (
        <div className="grid grid-cols-1 gap-2 pt-1" data-testid="citations-container">
          {citations.map((citation, idx) => (
            <CitationCard
              key={citation.id || `${citation.chunk_id}-${idx}`}
              citation={citation}
              index={idx}
              onSelectCitation={onSelectCitation}
            />
          ))}
        </div>
      )}
    </div>
  );
};
