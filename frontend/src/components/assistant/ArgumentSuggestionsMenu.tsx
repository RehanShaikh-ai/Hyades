import React from 'react';
import { CommandSuggestionItem } from '@/types/commands';
import { FileText, Network, Folder, BookOpen, MessageSquare } from 'lucide-react';

interface ArgumentSuggestionsMenuProps {
  command: string;
  query: string;
  suggestions: CommandSuggestionItem[];
  selectedIndex: number;
  isLoading?: boolean;
  onSelectSuggestion: (item: CommandSuggestionItem) => void;
  onHoverIndex: (index: number) => void;
}

export const ArgumentSuggestionsMenu: React.FC<ArgumentSuggestionsMenuProps> = ({
  command,
  query,
  suggestions,
  selectedIndex,
  isLoading = false,
  onSelectSuggestion,
  onHoverIndex,
}) => {
  const getItemIcon = (type: string) => {
    switch (type) {
      case 'entity':
        return <Network size={14} className="text-[var(--accent-brass)]" />;
      case 'collection':
        return <Folder size={14} className="text-[var(--accent-midnight)]" />;
      case 'source':
        return <BookOpen size={14} className="text-[var(--accent-terracotta)]" />;
      case 'thread':
        return <MessageSquare size={14} className="text-[var(--accent-midnight)]" />;
      case 'note':
      default:
        return <FileText size={14} className="text-[var(--accent-midnight)]" />;
    }
  };

  return (
    <div
      role="listbox"
      aria-label={`${command} Target Suggestions`}
      className="absolute bottom-full left-0 mb-3 w-full max-w-md z-30 bg-[#FAF8F2] border border-[var(--border-strong)] rounded-xl shadow-2xl overflow-hidden backdrop-blur-md animate-fade-in text-[var(--ink-primary)]"
    >
      {/* Top Header Badge */}
      <div className="px-3.5 py-1.5 border-b border-[var(--border-parchment)] flex items-center justify-between text-[11px] font-mono text-[var(--ink-tertiary)] bg-white/90">
        <span className="font-semibold text-[var(--accent-midnight)] flex items-center gap-1.5">
          <span className="text-[var(--accent-terracotta)] font-bold">¿</span>
          <span>{command}</span>
          {query && <span className="text-[var(--ink-tertiary)]">&ldquo;{query}&rdquo;</span>}
        </span>
        <span>↑↓ Navigate · ↵ Select</span>
      </div>

      {/* Suggestion candidates list */}
      <div className="max-h-64 overflow-y-auto p-1.5 flex flex-col gap-1 scrollbar-thin">
        {isLoading ? (
          <div className="p-4 text-center text-xs font-mono text-[var(--ink-tertiary)] flex items-center justify-center gap-2">
            <span className="animate-spin text-[var(--accent-midnight)]">◷</span>
            <span>Searching workspace...</span>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="p-4 text-center text-xs text-[var(--ink-tertiary)] italic">
            No matching items found in this workspace.
          </div>
        ) : (
          suggestions.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={item.id}
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelectSuggestion(item)}
                onMouseEnter={() => onHoverIndex(idx)}
                className={`px-3 py-2 rounded-lg flex items-center gap-3 cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-white border border-[var(--accent-midnight)] shadow-2xs text-[var(--ink-primary)]'
                    : 'hover:bg-white/60 border border-transparent text-[var(--ink-secondary)]'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                    isSelected
                      ? 'bg-[var(--bg-panel-subtle)]'
                      : 'bg-white border border-[var(--border-parchment)]'
                  }`}
                >
                  {getItemIcon(item.item_type)}
                </div>

                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-serif font-bold text-[13.5px] text-[var(--ink-primary)] leading-snug truncate">
                    {item.title}
                  </span>
                  <span className="text-[11px] font-mono text-[var(--ink-tertiary)] truncate">
                    {item.subtitle}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
