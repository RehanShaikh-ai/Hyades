import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SearchMode, SearchResultItem } from '@/types/search';
import { searchNotes } from '@/api/search';
import { SearchResultCard } from './SearchResultCard';
import { SavedSearchesList } from './SavedSearchesList';
import { createSavedSearch } from '@/api/saved_searches';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Search, Loader2, Database, Zap, Hash, X, BookmarkPlus } from 'lucide-react';

interface SearchPanelProps {
  workspaceId: string;
  onNoteSelect: (noteId: string) => void;
  onClose?: () => void;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({ workspaceId, onNoteSelect, onClose }) => {
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
    <div className="workflow-panel flex flex-col h-full !p-0 overflow-hidden">
      <div className="flex items-center justify-between p-5 border-b border-card-border bg-mantle/50">
        <h2 className="flex items-center gap-2">
          <Search size={18} className="text-blue-400" />
          Semantic Search
          <kbd className="ml-2 text-[10px] font-mono bg-surface1 px-1.5 py-0.5 rounded text-overlay0 border border-surface2">Mod+Space</kbd>
        </h2>
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-surface1 text-overlay1 hover:text-text transition-colors">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="p-5 border-b border-card-border">
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-overlay1" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Hyades..."
            className="w-full bg-surface0 border border-surface1 rounded-lg pl-10 pr-10 py-2.5 text-[14px] text-text outline-none focus:border-blue-400/50 focus:bg-surface1 focus:shadow-[0_0_0_2px_rgba(56,189,248,0.1)] transition-all"
            autoFocus
          />
          {isLoading && (
            <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-blue-400 animate-spin" />
          )}
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-overlay1 mr-2">Mode</span>
            {(['hybrid', 'semantic', 'lexical'] as SearchMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-[12px] capitalize transition-all ${
                  mode === m 
                    ? 'bg-blue-400/10 border-blue-400/30 text-blue-400 shadow-[0_0_12px_rgba(56,189,248,0.15)]' 
                    : 'bg-surface0 border-surface1 text-overlay1 hover:text-text hover:bg-surface1'
                }`}
              >
                {m === 'hybrid' && <Zap size={13} />}
                {m === 'semantic' && <Database size={13} />}
                {m === 'lexical' && <Hash size={13} />}
                {m}
              </button>
            ))}
          </div>
          
          <button
            onClick={handleSaveSearch}
            disabled={!query.trim() || isSavingSearch}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 disabled:opacity-50 transition-colors border border-blue-500/20 hover:border-blue-500/30"
          >
            {isSavingSearch ? <Loader2 size={14} className="animate-spin" /> : <BookmarkPlus size={14} />}
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
