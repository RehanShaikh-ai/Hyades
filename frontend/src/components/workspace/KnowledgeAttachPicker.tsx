import React, { useState, useEffect, useMemo, useRef } from 'react';
import { listNotes } from '@/api/notes';
import { listSources, uploadSource } from '@/api/sources';
import { listEntities } from '@/api/entities';
import { Note } from '@/types/note';
import { Source } from '@/types/source';
import { GraphEntity } from '@/types/graph_entity';

export type AttachableType = 'note' | 'source' | 'entity';

export interface AttachableItem {
  id: string;
  type: AttachableType;
  title: string;
  status: string;
  meta?: string;
  format?: string;
}

interface KnowledgeAttachPickerProps {
  workspaceId: string;
  attachedItemIds?: string[];
  onAttach: (itemType: AttachableType, itemId: string, itemTitle?: string) => Promise<void>;
  placeholder?: string;
  className?: string;
}

export const KnowledgeAttachPicker: React.FC<KnowledgeAttachPickerProps> = ({
  workspaceId,
  attachedItemIds = [],
  onAttach,
  placeholder = 'Search existing notes, sources, or entities to attach...',
  className = '',
}) => {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | AttachableType>('all');
  const [notes, setNotes] = useState<Note[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [entities, setEntities] = useState<GraphEntity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing repository knowledge items
  const loadKnowledgeItems = async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    try {
      const [notesRes, sourcesRes, entitiesRes] = await Promise.all([
        listNotes(workspaceId, { page_size: 100 }).catch(() => ({ items: [] })),
        listSources(workspaceId, 1, 100).catch(() => ({ items: [] })),
        listEntities(workspaceId, { limit: 100 }).catch(() => []),
      ]);

      setNotes(notesRes?.items || []);
      setSources(sourcesRes?.items || []);
      setEntities(Array.isArray(entitiesRes) ? entitiesRes : []);
    } catch {
      // Graceful fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadKnowledgeItems();
  }, [workspaceId]);

  // Combine and normalize items
  const allItems: AttachableItem[] = useMemo(() => {
    const list: AttachableItem[] = [];

    // Notes
    notes.forEach((n) => {
      list.push({
        id: n.id,
        type: 'note',
        title: n.title || 'Untitled Note',
        status: n.is_pinned ? 'Pinned' : n.is_archived ? 'Archived' : 'Active',
        meta: n.tags && n.tags.length > 0 ? n.tags.map((t) => t.name).join(', ') : 'Editorial Note',
      });
    });

    // Sources
    sources.forEach((s) => {
      const title = s.title || s.file_name || s.original_path || 'Unnamed Source';
      list.push({
        id: s.id,
        type: 'source',
        title,
        status: s.processing_status || s.import_status || 'Ready',
        meta: s.source_type || 'Source File',
        format: s.source_type,
      });
    });

    // Entities
    entities.forEach((e) => {
      list.push({
        id: e.id,
        type: 'entity',
        title: e.name,
        status: e.entity_type || 'Concept',
        meta: e.description ? e.description.slice(0, 50) : 'Graph Concept',
      });
    });

    return list;
  }, [notes, sources, entities]);

  // Filtered items based on search query and type filter
  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) {
        return false;
      }
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.status.toLowerCase().includes(q) ||
        (item.meta && item.meta.toLowerCase().includes(q))
      );
    });
  }, [allItems, typeFilter, query]);

  const handleAttachItem = async (item: AttachableItem) => {
    setAttachingId(item.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await onAttach(item.type, item.id, item.title);
      setSuccessMsg(`Attached ${item.type} "${item.title}" successfully.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to attach item';
      setErrorMsg(msg);
    } finally {
      setAttachingId(null);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !workspaceId) return;

    setIsImporting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // 1. Upload to Library/database
      const newSource = await uploadSource(workspaceId, file);
      // 2. Refresh local library items so it's in the catalog
      await loadKnowledgeItems();
      // 3. Immediately attach to current collection/thread
      const sourceTitle = newSource.title || newSource.file_name || file.name;
      await onAttach('source', newSource.id, sourceTitle);
      setSuccessMsg(`Imported source "${sourceTitle}" to Library and attached it.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed importing source file';
      setErrorMsg(msg);
    } finally {
      setIsImporting(false);
    }
  };

  const getTypeBadge = (type: AttachableType) => {
    switch (type) {
      case 'note':
        return 'bg-amber-50 text-amber-900 border-amber-200';
      case 'source':
        return 'bg-sky-50 text-sky-900 border-sky-200';
      case 'entity':
        return 'bg-emerald-50 text-emerald-900 border-emerald-200';
    }
  };

  return (
    <div className={`p-3 bg-[var(--bg-panel)] rounded-xl border border-[var(--border-parchment)] select-none text-xs ${className}`}>
      {/* Top Banner / Status Messages */}
      {successMsg && (
        <div className="mb-2.5 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold text-emerald-700">Attached:</span>
            <span className="truncate">{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold px-1 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="mb-2.5 p-2 rounded-lg bg-red-50 border border-red-200 text-red-800 text-[11px] flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold text-red-700">Notice:</span>
            <span className="truncate">{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-red-700 hover:text-red-900 font-bold px-1 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Main Search Bar & Import Action Row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-tertiary)]" />
          <input
            type="text"
            placeholder={placeholder}
            value={query}
            onFocus={() => setIsExpanded(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!isExpanded) setIsExpanded(true);
            }}
            className="w-full pl-8 pr-8 py-1.5 text-xs bg-white border border-[var(--border-parchment)] rounded-lg text-[var(--ink-primary)] placeholder-[var(--ink-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-midnight)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)] font-bold text-xs cursor-pointer"
            >
              ×
            </button>
          )}
        </div>

        {/* Type Filter Buttons */}
        <div className="flex items-center p-0.5 rounded-lg bg-black/5 border border-[var(--border-parchment)]">
          {(['all', 'note', 'source', 'entity'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTypeFilter(t);
                if (!isExpanded) setIsExpanded(true);
              }}
              className={`px-2 py-1 rounded text-[10px] capitalize transition-colors cursor-pointer ${
                typeFilter === t
                  ? 'bg-white text-[var(--ink-primary)] font-semibold shadow-2xs'
                  : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
              }`}
            >
              {t === 'all' ? 'All' : `${t}s`}
            </button>
          ))}
        </div>

        {/* Import Source Option */}
        <label className="cursor-pointer px-2.5 py-1.5 bg-white hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-strong)] text-[var(--ink-primary)] text-xs font-medium rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 shrink-0">
          <i className="ph-bold ph-upload-simple text-xs text-[var(--accent-terracotta)]" />
          <span>{isImporting ? 'Importing...' : '+ Import Source'}</span>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleImportFile}
            className="hidden"
            disabled={isImporting}
          />
        </label>
      </div>

      {/* Expanded Search Results Dropdown Panel */}
      {isExpanded && (
        <div className="mt-2.5 border-t border-[var(--border-parchment)] pt-2.5">
          <div className="flex items-center justify-between mb-1.5 text-[11px] text-[var(--ink-tertiary)]">
            <span>
              {isLoading
                ? 'Cataloging repository...'
                : `${filteredItems.length} available items in Library`}
            </span>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="hover:underline text-[var(--accent-midnight)] cursor-pointer"
            >
              Close
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-1 hyades-scroll pr-1">
            {isLoading ? (
              <div className="py-6 text-center text-xs text-[var(--ink-tertiary)] flex flex-col items-center gap-2">
                <div className="w-4 h-4 rounded-full border-2 border-[var(--accent-midnight)] border-t-transparent animate-spin" />
                <span className="serif-italic">Examining vault records...</span>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="py-5 px-3 text-center bg-white/50 rounded-lg border border-[var(--border-parchment)]">
                <p className="serif-italic text-[var(--ink-secondary)] text-xs">
                  No matching {typeFilter !== 'all' ? typeFilter + 's' : 'items'} found in Library.
                </p>
                <div className="mt-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1 bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] text-xs font-medium rounded-lg cursor-pointer transition-colors shadow-2xs">
                    <i className="ph-bold ph-plus text-xs" />
                    <span>Import New Source File</span>
                    <input
                      type="file"
                      onChange={handleImportFile}
                      className="hidden"
                      disabled={isImporting}
                    />
                  </label>
                </div>
              </div>
            ) : (
              filteredItems.map((item) => {
                const isAttached = attachedItemIds.includes(item.id);
                const isAttaching = attachingId === item.id;

                return (
                  <div
                    key={`${item.type}-${item.id}`}
                    className={`p-2 rounded-lg border transition-all flex items-center justify-between gap-3 ${
                      isAttached
                        ? 'bg-black/[0.02] border-[var(--border-parchment)] opacity-70'
                        : 'bg-white hover:border-[var(--border-strong)] border-[var(--border-parchment)] shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border shrink-0 ${getTypeBadge(
                          item.type
                        )}`}
                      >
                        {item.type}
                      </span>
                      <div className="min-w-0 flex-1 truncate">
                        <span className="font-medium text-[var(--ink-primary)] truncate block">
                          {item.title}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-[var(--ink-tertiary)] mono truncate">
                          <span>{item.status}</span>
                          {item.meta && (
                            <>
                              <span>·</span>
                              <span className="truncate">{item.meta}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isAttached ? (
                        <span className="px-2 py-1 rounded bg-black/5 text-[10px] font-mono text-[var(--ink-tertiary)]">
                          Attached
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAttachItem(item)}
                          disabled={isAttaching}
                          className="px-2.5 py-1 rounded-lg bg-[var(--accent-midnight)] hover:bg-[var(--accent-midnight-light)] disabled:opacity-50 text-[#FAF8F2] font-medium text-xs shadow-2xs flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          {isAttaching ? (
                            <>
                              <div className="w-2.5 h-2.5 rounded-full border border-white border-t-transparent animate-spin" />
                              <span>Attaching...</span>
                            </>
                          ) : (
                            <>
                              <i className="ph-bold ph-plus text-xs" />
                              <span>Attach</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
