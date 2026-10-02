import React from 'react';
import { SearchResultItem } from '@/types/search';
import { FileText, Database, Zap, Hash } from 'lucide-react';

interface SearchResultCardProps {
  result: SearchResultItem;
  onClick: (noteId: string) => void;
}

export const SearchResultCard: React.FC<SearchResultCardProps> = ({ result, onClick }) => {
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
      onClick={() => onClick(result.note_id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick(result.note_id);
      }}
    >
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex items-center gap-2 text-[var(--ink-primary)] font-semibold text-[14.5px] serif">
          <FileText size={15} className="text-[var(--accent-midnight)] opacity-80" />
          <span className="group-hover:underline">{result.title}</span>
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

      <div className="flex items-center justify-between text-[10.5px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)]">
        <span className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              result.search_mode === 'semantic'
                ? 'bg-[var(--accent-midnight)]'
                : result.search_mode === 'hybrid'
                ? 'bg-[var(--accent-terracotta)]'
                : 'bg-[var(--accent-brass)]'
            }`}
          />
          {result.search_mode} match
        </span>
        {result.is_archived && (
          <span className="px-1.5 py-0.2 rounded bg-[var(--bg-panel-subtle)] text-[var(--ink-tertiary)] border border-[var(--border-parchment)]">
            Archived
          </span>
        )}
      </div>
    </div>
  );
};
