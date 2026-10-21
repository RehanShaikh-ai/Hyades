import React from 'react';
import { SearchResultItem } from '@/types/search';
import { ObservatoryTarget, StellaContext } from '@/types/navigation';
import { FileText, Database, Zap, Hash, BookOpen, Network, Folder, MessageSquare } from 'lucide-react';

interface SearchResultCardProps {
  result: SearchResultItem;
  onClick: (itemId: string) => void;
  onViewInObservatory?: (target: ObservatoryTarget) => void;
  onAskStella?: (context: StellaContext) => void;
}

export const SearchResultCard: React.FC<SearchResultCardProps> = ({
  result,
  onClick,
  onViewInObservatory,
  onAskStella,
}) => {
  const itemType = result.item_type || 'note';
  const targetId = result.item_id || result.note_id || result.entity_id || result.collection_id || result.thread_id || '';

  const getItemIcon = () => {
    switch (itemType) {
      case 'source':
        return <BookOpen size={15} className="text-[var(--accent-terracotta)] opacity-80 shrink-0" />;
      case 'entity':
        return <Network size={15} className="text-[var(--accent-brass)] opacity-80 shrink-0" />;
      case 'collection':
        return <Folder size={15} className="text-[var(--accent-midnight)] opacity-80 shrink-0" />;
      case 'thread':
        return <MessageSquare size={15} className="text-[var(--accent-terracotta)] opacity-80 shrink-0" />;
      case 'note':
      default:
        return <FileText size={15} className="text-[var(--accent-midnight)] opacity-80 shrink-0" />;
    }
  };

  const handleCardClick = () => {
    if (itemType === 'entity' && onViewInObservatory) {
      onViewInObservatory({
        entityName: result.title,
        entityId: result.entity_id || targetId,
      });
      return;
    }
    onClick(targetId);
  };

  const formatScore = () => {
    const s = result.score;
    if (result.search_mode === 'semantic') {
      return `sim ${s.toFixed(2)}`;
    }
    if (result.search_mode === 'hybrid') {
      return `rrf ${s.toFixed(3)}`;
    }
    if (result.search_mode === 'lexical') {
      return `bm25 ${s.toFixed(2)}`;
    }
    return `score ${s.toFixed(2)}`;
  };

  const getScoreIcon = () => {
    switch (result.search_mode) {
      case 'semantic':
        return <Database size={12} className="text-[var(--accent-midnight)]" />;
      case 'lexical':
        return <Hash size={12} className="text-[var(--accent-brass)]" />;
      case 'hybrid':
        return <Zap size={12} className="text-[var(--accent-terracotta)]" />;
      default:
        return <Database size={12} className="text-[var(--ink-tertiary)]" />;
    }
  };

  const getScoreTitle = () => {
    if (result.search_mode === 'semantic') {
      return `Cosine Similarity: ${result.score.toFixed(4)} (Metric: ${result.score_meaning})`;
    }
    if (result.search_mode === 'hybrid') {
      return `Reciprocal Rank Fusion Score: ${result.score.toFixed(4)} (Metric: ${result.score_meaning})`;
    }
    if (result.search_mode === 'lexical') {
      return `Lexical BM25 Score: ${result.score.toFixed(4)} (Metric: ${result.score_meaning})`;
    }
    return `Score: ${result.score} (${result.score_meaning})`;
  };

  return (
    <div
      className="card-surface p-3.5 rounded-xl border border-[var(--border-parchment)] bg-white hover:border-[var(--border-strong)] hover:shadow-2xs transition-all cursor-pointer group"
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleCardClick();
      }}
    >
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex items-center gap-2 text-[var(--ink-primary)] font-semibold text-[14.5px] serif">
          {getItemIcon()}
          <span className="group-hover:underline">{result.title}</span>
          <span className="px-1.5 py-0.2 rounded bg-[var(--bg-panel-subtle)] text-[9.5px] font-mono uppercase tracking-wider text-[var(--ink-secondary)] border border-[var(--border-parchment)] font-medium">
            {itemType}
          </span>
        </div>
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-[10.5px] font-mono text-[var(--ink-secondary)] font-medium"
          title={getScoreTitle()}
        >
          {getScoreIcon()}
          <span>{formatScore()}</span>
        </div>
      </div>

      <p className="text-[var(--ink-secondary)] text-[12.5px] leading-relaxed line-clamp-3 mb-2.5">
        {result.excerpt}
      </p>

      <div className="mt-2.5 pt-2 border-t border-[var(--border-parchment)] flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)]">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              result.search_mode === 'semantic'
                ? 'bg-[var(--accent-midnight)]'
                : result.search_mode === 'hybrid'
                ? 'bg-[var(--accent-terracotta)]'
                : 'bg-[var(--accent-brass)]'
            }`}
          />
          <span>{result.search_mode} match</span>
          {result.is_archived && (
            <span className="ml-1 px-1.5 py-0.2 rounded bg-[var(--bg-panel-subtle)] text-[var(--ink-tertiary)] border border-[var(--border-parchment)]">
              Archived
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onViewInObservatory && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewInObservatory({
                  noteId: result.note_id,
                  entityName: result.title,
                });
              }}
              className="text-[11px] font-medium text-[var(--accent-terracotta)] hover:underline flex items-center gap-1 focus:outline-none cursor-pointer"
              title="Locate this note's concepts in Observatory"
            >
              <span>View in Observatory ↗</span>
            </button>
          )}
          {onAskStella && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAskStella({
                  prompt: `Explain the key concepts and findings in note "${result.title}" and how they connect with other topics in my research.`,
                  noteId: result.note_id,
                  noteTitle: result.title,
                });
              }}
              className="text-[11px] font-medium text-[var(--accent-midnight)] hover:underline flex items-center gap-1 focus:outline-none cursor-pointer ml-1"
              title="Consult Stella about this note"
            >
              <i className="ph ph-sparkle text-[var(--accent-brass)] text-xs" />
              <span>Ask Stella</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
