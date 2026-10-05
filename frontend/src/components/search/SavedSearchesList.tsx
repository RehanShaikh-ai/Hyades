import React, { useState, useEffect } from 'react';
import { SavedSearch } from '@/types/saved_searches';
import { getSavedSearches, deleteSavedSearch } from '@/api/saved_searches';
import { Bookmark, Trash2, Loader2 } from 'lucide-react';

interface SavedSearchesListProps {
  workspaceId: string;
  onSelectSearch: (query: string, searchMode: 'semantic' | 'lexical' | 'hybrid') => void;
  refreshTrigger?: number;
  className?: string;
}

export const SavedSearchesList: React.FC<SavedSearchesListProps> = ({
  workspaceId,
  onSelectSearch,
  refreshTrigger = 0,
  className = ''
}) => {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    
    getSavedSearches(workspaceId)
      .then(res => {
        if (mounted) setSearches(res.items || []);
      })
      .catch(err => {
        console.error('Failed to load saved searches', err);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
      
    return () => { mounted = false; };
  }, [workspaceId, refreshTrigger]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setIsDeletingId(id);
    try {
      await deleteSavedSearch(workspaceId, id);
      setSearches(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error('Failed to delete saved search', err);
    } finally {
      setIsDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className={`flex justify-center p-4 ${className}`}>
        <Loader2 size={16} className="animate-spin text-[var(--accent-midnight)]" />
      </div>
    );
  }

  if (searches.length === 0) {
    return null; // Don't show anything if no saved searches
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <h3 className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-secondary)] font-semibold flex items-center gap-1.5 px-1 mb-1">
        <Bookmark size={12} className="text-[var(--accent-midnight)]" />
        Saved Searches
      </h3>
      
      <div className="flex flex-col gap-1">
        {searches.map(search => (
          <button
            key={search.id}
            type="button"
            onClick={() => onSelectSearch(search.query, search.search_mode)}
            className="group flex items-center justify-between w-full text-left p-2 rounded-lg hover:bg-white transition-colors border border-transparent hover:border-[var(--border-parchment)] cursor-pointer"
          >
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium text-[var(--ink-primary)] truncate">
                {search.name}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-[var(--ink-secondary)] truncate max-w-[150px]">
                  "{search.query}"
                </span>
                <span className="text-[9px] font-mono uppercase tracking-wider bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] px-1.5 py-0.2 rounded text-[var(--ink-tertiary)]">
                  {search.search_mode}
                </span>
              </div>
            </div>
            
            <div 
              className="p-1.5 rounded-md hover:bg-red-50 hover:text-red-600 text-transparent group-hover:text-[var(--ink-tertiary)] transition-colors ml-2 cursor-pointer"
              onClick={(e) => handleDelete(e, search.id)}
            >
              {isDeletingId === search.id ? (
                <Loader2 size={13} className="animate-spin text-red-600" />
              ) : (
                <Trash2 size={13} />
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
