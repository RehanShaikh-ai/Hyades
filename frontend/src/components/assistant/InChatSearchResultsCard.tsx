import React from 'react';
import { SearchCardData } from '@/types/commands';
import { Search, FileText, Layers, Hash, Bookmark, ArrowUpRight } from 'lucide-react';

interface InChatSearchResultsCardProps {
  searchData: SearchCardData;
  onOpenItem?: (id: string, itemType: string) => void;
}

export const InChatSearchResultsCard: React.FC<InChatSearchResultsCardProps> = ({
  searchData,
  onOpenItem,
}) => {
  const getItemIcon = (type: string) => {
    switch (type) {
      case 'note':
        return <FileText size={13} className="text-[var(--accent-midnight)]" />;
      case 'source':
        return <Bookmark size={13} className="text-[var(--accent-terracotta)]" />;
      case 'collection':
        return <Layers size={13} className="text-[var(--accent-olive)]" />;
      case 'entity':
        return <Hash size={13} className="text-[var(--accent-brass)]" />;
      default:
        return <Search size={13} className="text-[var(--ink-secondary)]" />;
    }
  };

  const getBadgeStyle = (type: string) => {
    switch (type) {
      case 'note':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'source':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'collection':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'entity':
        return 'bg-purple-50 text-purple-800 border-purple-200';
      default:
        return 'bg-stone-50 text-stone-700 border-stone-200';
    }
  };

  return (
    <div className="card-surface mt-3 p-4 rounded-xl border border-[var(--border-parchment)] bg-white/95 shadow-xs flex flex-col gap-3 max-w-2xl text-[var(--ink-primary)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex items-center justify-center shrink-0">
            <Search size={15} className="text-[var(--accent-midnight)]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-serif font-bold text-[14px] text-[var(--ink-primary)]">
              Multi-Domain Search: &ldquo;{searchData.query}&rdquo;
            </span>
            <span className="text-[11px] font-mono text-[var(--ink-tertiary)]">
              {searchData.total} {searchData.total === 1 ? 'match' : 'matches'} across notes, sources, collections, & entities
            </span>
          </div>
        </div>
      </div>

      {/* Results List */}
      {searchData.items.length === 0 ? (
        <div className="py-4 text-center text-xs text-[var(--ink-secondary)] serif-italic">
          No matches found for &ldquo;{searchData.query}&rdquo; in this workspace.
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--border-parchment)]">
          {searchData.items.map((item) => (
            <div
              key={`${item.item_type}-${item.id}`}
              onClick={() => onOpenItem && onOpenItem(item.id, item.item_type)}
              className="py-2.5 px-2 hover:bg-[var(--bg-panel-subtle)] rounded-lg transition-colors cursor-pointer group flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="mt-0.5 shrink-0">{getItemIcon(item.item_type)}</div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[13px] text-[var(--ink-primary)] group-hover:text-[var(--accent-midnight)] transition-colors truncate">
                      {item.title}
                    </span>
                    <span
                      className={`text-[9.5px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${getBadgeStyle(
                        item.item_type
                      )}`}
                    >
                      {item.item_type}
                    </span>
                  </div>
                  {item.snippet && (
                    <p className="text-[12px] text-[var(--ink-secondary)] line-clamp-2 mt-0.5 leading-snug">
                      {item.snippet}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0 text-[var(--ink-tertiary)] group-hover:text-[var(--ink-primary)]">
                {item.score !== undefined && item.score !== null && (
                  <span className="text-[10px] font-mono opacity-80">
                    {Math.round(item.score * 100)}%
                  </span>
                )}
                <ArrowUpRight size={13} className="opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
