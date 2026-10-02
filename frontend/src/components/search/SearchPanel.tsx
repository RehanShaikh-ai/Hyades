import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SearchMode, SearchResultItem } from '@/types/search';
import { searchNotes } from '@/api/search';
import { SearchResultCard } from './SearchResultCard';
import { SavedSearchesList } from './SavedSearchesList';
import { createSavedSearch } from '@/api/saved_searches';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ObservatoryTarget, StellaContext } from '@/types/navigation';
import { Search, Loader2, Database, Zap, Hash, BookmarkPlus } from 'lucide-react';

interface SearchPanelProps {
  workspaceId: string;
  onNoteSelect: (noteId: string) => void;
  onClose?: () => void;
  onViewInObservatory?: (target: ObservatoryTarget) => void;
  onAskStella?: (context: StellaContext) => void;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({
  workspaceId,
  onNoteSelect,
  onClose: _onClose,
  onViewInObservatory,
  onAskStella,
}) => {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('hybrid');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isSavingSearch, setIsSavingSearch] = useState(false);
  const [refreshSearches, setRefreshSearches] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const performSearch = useCallback(async (searchQuery: string, searchMode: SearchMode) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await searchNotes(workspaceId, {
        query: searchQuery,
        mode: searchMode,
        limit: 20
      });
      setResults(res.items || res.results || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Search failed'));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim()) {
      debounceRef.current = setTimeout(() => performSearch(query, mode), 300);
    } else {
      setResults([]);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, mode, performSearch]);

  const handleSaveSearch = async () => {
    if (!query.trim()) return;
    setIsSavingSearch(true);
    try {
      await createSavedSearch(workspaceId, {
        name: query.slice(0, 50) + (query.length > 50 ? '...' : ''),
        query: query.trim(),
        search_mode: mode
      });
      setRefreshSearches(prev => prev + 1);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingSearch(false);
    }
  };

  return (
    <div className="flex flex-col h-full !p-0 overflow-hidden bg-[#FAF8F2] text-[var(--ink-primary)]">
      <div className="p-4 border-b border-[var(--border-parchment)] bg-white/70">
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-tertiary)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Hyades..."
            className="w-full bg-white border border-[var(--border-strong)] rounded-xl pl-10 pr-10 py-2 text-[13.5px] text-[var(--ink-primary)] placeholder:text-[var(--ink-tertiary)] outline-none focus:border-[var(--accent-midnight)] focus:ring-1 focus:ring-[var(--accent-midnight)] shadow-xs transition-all"
            autoFocus
          />
          {isLoading && (
            <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--accent-midnight)] animate-spin" />
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)] mr-1">Mode</span>
            {(['hybrid', 'semantic', 'lexical'] as SearchMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-medium capitalize transition-all cursor-pointer ${
                  mode === m 
                    ? 'bg-[var(--accent-midnight)] border-[var(--accent-midnight)] text-[#FAF8F2] shadow-xs' 
                    : 'bg-white border-[var(--border-parchment)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:border-[var(--border-strong)]'
                }`}
              >
                {m === 'hybrid' && <Zap size={11} className={mode === m ? 'text-[var(--accent-brass)]' : ''} />}
                {m === 'semantic' && <Database size={11} className={mode === m ? 'text-[var(--accent-brass)]' : ''} />}
                {m === 'lexical' && <Hash size={11} className={mode === m ? 'text-[var(--accent-brass)]' : ''} />}
                {m}
              </button>
            ))}
          </div>
          
          <button
            type="button"
            onClick={handleSaveSearch}
            disabled={!query.trim() || isSavingSearch}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] bg-white hover:bg-[var(--bg-panel-subtle)] disabled:opacity-50 transition-colors border border-[var(--border-strong)] cursor-pointer"
          >
            {isSavingSearch ? <Loader2 size={12} className="animate-spin text-[var(--accent-midnight)]" /> : <BookmarkPlus size={12} className="text-[var(--accent-terracotta)]" />}
            Save Search
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-surface1">
        {error ? (
          <ErrorState error={error.message} />
        ) : !query.trim() ? (
          <div className="flex flex-col h-full">
            <SavedSearchesList
              workspaceId={workspaceId}
              refreshTrigger={refreshSearches}
              onSelectSearch={(q, m) => {
                setQuery(q);
                setMode(m);
              }}
            />
            <div className="flex-1 mt-8 min-h-[200px]">
              <EmptyState 
                icon={<Search size={48} />} 
                message="Type a query to begin searching" 
                className="h-full border-none bg-transparent"
              />
            </div>
          </div>
        ) : results.length === 0 && !isLoading ? (
          <EmptyState 
            icon={<Search size={48} />} 
            message={`No results found for "${query}"`} 
            className="h-full border-none bg-transparent"
          />
        ) : (
          <div className="flex flex-col gap-3">
            {results.map((result) => (
              <SearchResultCard 
                key={result.chunk_id || result.note_id} 
                result={result} 
                onClick={onNoteSelect} 
                onViewInObservatory={onViewInObservatory}
                onAskStella={onAskStella}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
