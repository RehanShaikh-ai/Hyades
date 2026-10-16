import React, { useState, useEffect } from 'react';
import {
  Collection,
  KnowledgeItem,
  CollectionStats,
  RelatedKnowledgeItem,
  KnowledgeItemType,
} from '@/types/collections';
import {
  listCollections,
  createCollection,
  deleteCollection,
  getCollectionStats,
  getCollectionRelated,
  listKnowledgeItems,
  addKnowledgeItem,
  removeKnowledgeItem,
} from '@/api/collections';

interface HyadesCollectionsProps {
  workspaceId: string;
  onNavigateToObservatory?: () => void;
  onNavigateToStella?: () => void;
}

export const HyadesCollections: React.FC<HyadesCollectionsProps> = ({
  workspaceId,
  onNavigateToObservatory: _onNavigateToObservatory,
  onNavigateToStella: _onNavigateToStella,
}) => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [related, setRelated] = useState<RelatedKnowledgeItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // New collection form state
  const [newCollName, setNewCollName] = useState('');
  const [newCollDesc, setNewCollDesc] = useState('');
  const [isCreatingColl, setIsCreatingColl] = useState(false);

  // Add member form state
  const [newItemType, setNewItemType] = useState<KnowledgeItemType>('note');
  const [newItemId, setNewItemId] = useState('');
  const [isAddingItem, setIsAddingItem] = useState(false);

  const loadCollections = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await listCollections(workspaceId);
      setCollections(res.items);
      if (res.items.length > 0) {
        setSelectedCollection((prev) => {
          if (!prev) return res.items[0];
          const matched = res.items.find((c) => c.id === prev.id);
          return matched || res.items[0];
        });
      } else {
        setSelectedCollection(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed loading collections from repository');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (workspaceId) {
      loadCollections();
    }
  }, [workspaceId]);

  const loadCollectionDetails = async (collId: string) => {
    try {
      const [itemsRes, statsRes, relatedRes] = await Promise.all([
        listKnowledgeItems(collId),
        getCollectionStats(collId).catch(() => null),
        getCollectionRelated(collId).catch(() => ({ related_entities: [], total_related: 0 })),
      ]);
      setItems(itemsRes.items || []);
      setStats(statsRes);
      const relItems = relatedRes?.related_entities || (relatedRes as unknown as { items?: RelatedKnowledgeItem[] })?.items || [];
      setRelated(relItems);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed loading collection items and relations');
    }
  };

  useEffect(() => {
    if (selectedCollection?.id) {
      loadCollectionDetails(selectedCollection.id);
    } else {
      setItems([]);
      setStats(null);
      setRelated([]);
    }
  }, [selectedCollection?.id]);

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCollName.trim();
    if (!trimmed) {
      setError('Collection name cannot be empty.');
      return;
    }

    setIsCreatingColl(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const created = await createCollection({
        workspace_id: workspaceId,
        name: trimmed,
        description: newCollDesc.trim() || null,
      });
      setNewCollName('');
      setNewCollDesc('');
      setSuccessMessage(`Collection "${created.name}" created successfully.`);
      await loadCollections();
      setSelectedCollection(created);
    } catch (err: unknown) {
      const apiErr = err as { error?: { message?: string; code?: string } } | Error;
      const code = (apiErr as { error?: { code?: string } })?.error?.code;
      const msg =
        code === 'COLLECTION_NAME_CONFLICT'
          ? 'A collection with this name already exists in this workspace.'
          : (apiErr as { error?: { message?: string } })?.error?.message ||
            (err instanceof Error ? err.message : 'Failed creating collection');
      setError(msg);
    } finally {
      setIsCreatingColl(false);
    }
  };

  const handleDeleteCollection = async (id: string, name: string) => {
    if (!window.confirm(`Permanently remove collection "${name}"? Member items will remain intact.`)) {
      return;
    }
    setError(null);
    setSuccessMessage(null);
    try {
      await deleteCollection(id);
      setSuccessMessage(`Collection "${name}" deleted.`);
      setSelectedCollection(null);
      await loadCollections();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed deleting collection');
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCollection || !newItemId.trim()) return;

    setIsAddingItem(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await addKnowledgeItem(selectedCollection.id, {
        item_type: newItemType,
        item_id: newItemId.trim(),
      });
      setNewItemId('');
      setSuccessMessage(`Added ${newItemType} to collection.`);
      await loadCollectionDetails(selectedCollection.id);
    } catch (err: unknown) {
      const apiErr = err as { error?: { message?: string; code?: string } } | Error;
      const code = (apiErr as { error?: { code?: string } })?.error?.code;
      const msg =
        code === 'DUPLICATE_MEMBERSHIP'
          ? 'Item is already a member of this collection.'
          : (apiErr as { error?: { message?: string } })?.error?.message ||
            (err instanceof Error ? err.message : 'Failed adding member item');
      setError(msg);
    } finally {
      setIsAddingItem(false);
    }
  };

  const handleRemoveItem = async (itemType: KnowledgeItemType, itemId: string) => {
    if (!selectedCollection) return;
    setError(null);
    setSuccessMessage(null);
    try {
      await removeKnowledgeItem(selectedCollection.id, itemType, itemId);
      setSuccessMessage('Removed item from collection.');
      await loadCollectionDetails(selectedCollection.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed removing member item');
    }
  };

  const getItemTypeBadgeStyle = (type: string) => {
    switch (type.toLowerCase()) {
      case 'note':
        return 'bg-amber-50 text-amber-900 border-amber-200';
      case 'source':
        return 'bg-sky-50 text-sky-900 border-sky-200';
      case 'entity':
        return 'bg-emerald-50 text-emerald-900 border-emerald-200';
      default:
        return 'bg-[var(--bg-panel)] text-[var(--ink-secondary)] border-[var(--border-parchment)]';
    }
  };

  return (
    <div
      className="relative flex-1 h-[calc(100vh-57px)] flex flex-col md:flex-row overflow-x-hidden overflow-y-auto w-full select-none text-[13px] leading-relaxed bg-[var(--bg-base)] text-[var(--ink-primary)]"
      data-testid="hyades-collections"
    >
      {/* Paper grain and ambient observatory atmosphere */}
      <div className="paper-grain" />
      <div className="classical-environment">
        <div className="ambient-sunlight" />
      </div>

      {/* Left Sidebar: Collections Folio */}
      <aside className="w-full md:w-80 lg:w-88 flex-shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-[var(--border-parchment)] bg-[var(--bg-panel)]/95 backdrop-blur-sm z-10">
        {/* Folio Header */}
        <div className="p-4 border-b border-[var(--border-parchment)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-[var(--accent-terracotta)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m16 6 4 14" />
              <path d="M12 6v14" />
              <path d="M8 8v12" />
              <path d="M4 4v16" />
            </svg>
            <h2 className="serif text-lg font-medium text-[var(--ink-primary)] tracking-wide">
              Collections
            </h2>
          </div>
          <span className="mono text-xs px-2 py-0.5 rounded bg-white/80 border border-[var(--border-parchment)] text-[var(--ink-secondary)]">
            {collections.length} {collections.length === 1 ? 'folio' : 'folios'}
          </span>
        </div>

        {/* Create Collection Form */}
        <form
          onSubmit={handleCreateCollection}
          className="p-3.5 border-b border-[var(--border-parchment)] bg-white/40 space-y-2.5"
        >
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[var(--ink-tertiary)] font-mono mb-1">
              New Folio Name
            </label>
            <input
              type="text"
              placeholder="Collection name..."
              value={newCollName}
              onChange={(e) => setNewCollName(e.target.value)}
              disabled={isCreatingColl}
              className="w-full px-3 py-1.5 text-xs bg-white border border-[var(--border-parchment)] rounded-lg text-[var(--ink-primary)] placeholder-[var(--ink-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-midnight)] focus:border-[var(--accent-midnight)] transition-all"
            />
          </div>
          <div>
            <input
              type="text"
              placeholder="Description (optional)..."
              value={newCollDesc}
              onChange={(e) => setNewCollDesc(e.target.value)}
              disabled={isCreatingColl}
              className="w-full px-3 py-1.5 text-xs bg-white border border-[var(--border-parchment)] rounded-lg text-[var(--ink-primary)] placeholder-[var(--ink-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-midnight)] focus:border-[var(--accent-midnight)] transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={isCreatingColl || !newCollName.trim()}
            className="w-full py-1.5 px-3 text-xs font-medium bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight)]/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {isCreatingColl ? (
              <>
                <div className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                <span>Binding...</span>
              </>
            ) : (
              <>
                <span>+</span>
                <span>Create Collection</span>
              </>
            )}
          </button>
        </form>

        {/* Collections Scroll List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5 divide-y divide-transparent">
          {isLoading && collections.length === 0 ? (
            <div className="p-6 text-center text-xs text-[var(--ink-tertiary)] flex flex-col items-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-[var(--accent-midnight)] border-t-transparent animate-spin" />
              <span className="serif-italic">Examining library folios...</span>
            </div>
          ) : collections.length === 0 ? (
            <div className="p-6 text-center text-xs text-[var(--ink-tertiary)] serif-italic">
              No collections yet. Bind a new folio using the form above.
            </div>
          ) : (
            collections.map((coll) => {
              const isSelected = selectedCollection?.id === coll.id;
              return (
                <div
                  key={coll.id}
                  onClick={() => setSelectedCollection(coll)}
                  className={`group relative p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white shadow-sm border-[var(--border-strong)] ring-1 ring-[var(--accent-midnight)]/10'
                      : 'bg-transparent border-transparent hover:bg-white/60 hover:border-[var(--border-parchment)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3
                        className={`text-sm font-medium truncate ${
                          isSelected
                            ? 'text-[var(--accent-midnight)] font-semibold'
                            : 'text-[var(--ink-primary)]'
                        }`}
                      >
                        {coll.name}
                      </h3>
                      {coll.description && (
                        <p className="text-xs text-[var(--ink-secondary)] truncate mt-0.5">
                          {coll.description}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCollection(coll.id, coll.name);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-[var(--ink-tertiary)] hover:text-red-600 transition-all rounded hover:bg-red-50 cursor-pointer"
                      title="Delete collection"
                      aria-label={`Delete ${coll.name}`}
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                  {isSelected && (
                    <div className="absolute left-0 top-2 bottom-2 w-1 bg-[var(--accent-terracotta)] rounded-r" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Center & Right: Selected Collection Dossier */}
      <main className="flex-1 flex flex-col overflow-y-auto p-4 md:p-6 z-10 space-y-5">
        {/* Alerts and Feedback */}
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-red-700">Notice:</span>
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-900 font-bold px-1.5 cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {successMessage && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-emerald-700">Recorded:</span>
              <span>{successMessage}</span>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-600 hover:text-emerald-900 font-bold px-1.5 cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {selectedCollection ? (
          <div className="space-y-6 max-w-5xl w-full mx-auto">
            {/* Header Instrument Panel */}
            <div className="instrument-panel p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="mono text-[10px] tracking-wider uppercase text-[var(--accent-terracotta)] font-semibold">
                      Archival Folio
                    </span>
                    <span className="text-[var(--border-strong)]">/</span>
                    <span className="mono text-xs text-[var(--ink-tertiary)]">
                      {selectedCollection.id}
                    </span>
                  </div>
                  <h1 className="serif text-2xl md:text-3xl font-medium text-[var(--ink-primary)] mt-1">
                    {selectedCollection.name}
                  </h1>
                  {selectedCollection.description && (
                    <p className="text-xs md:text-sm text-[var(--ink-secondary)] mt-1.5 max-w-2xl leading-relaxed">
                      {selectedCollection.description}
                    </p>
                  )}
                </div>

                {/* Quantitative Metrics Badge */}
                {stats && (
                  <div className="flex flex-wrap items-center gap-2 bg-white/80 p-2 rounded-xl border border-[var(--border-parchment)] shadow-xs">
                    <div className="px-3 py-1 bg-[var(--bg-panel)] rounded-lg text-center">
                      <div className="mono text-xs font-semibold text-[var(--accent-midnight)]">
                        {stats.total_items}
                      </div>
                      <div className="text-[10px] uppercase font-mono text-[var(--ink-tertiary)]">
                        Total
                      </div>
                    </div>
                    {Object.entries(stats.by_type || {}).map(([t, count]) => (
                      <div key={t} className="px-2.5 py-1 text-center">
                        <div className="mono text-xs font-medium text-[var(--ink-primary)]">
                          {count}
                        </div>
                        <div className="text-[10px] capitalize font-mono text-[var(--ink-tertiary)]">
                          {t}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Two-Column Grid: Membership Items & Dynamic Relations */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Member Items Column (2 Cols) */}
              <div className="lg:col-span-2 space-y-4">
                <div className="instrument-panel p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-3">
                    <div className="flex items-center gap-2">
                      <svg
                        className="w-4 h-4 text-[var(--accent-midnight)]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                      <h3 className="serif text-base font-medium text-[var(--ink-primary)]">
                        Folio Members ({items.length})
                      </h3>
                    </div>
                  </div>

                  {/* Add Member Form */}
                  <form
                    onSubmit={handleAddItem}
                    className="p-3 bg-[var(--bg-panel)] rounded-xl border border-[var(--border-parchment)] flex flex-wrap items-center gap-2.5"
                  >
                    <select
                      value={newItemType}
                      onChange={(e) => setNewItemType(e.target.value as KnowledgeItemType)}
                      className="px-2.5 py-1.5 text-xs bg-white border border-[var(--border-parchment)] rounded-lg text-[var(--ink-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-midnight)] cursor-pointer"
                    >
                      <option value="note">Note</option>
                      <option value="source">Source</option>
                      <option value="entity">Entity</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Item UUID or identifier..."
                      value={newItemId}
                      onChange={(e) => setNewItemId(e.target.value)}
                      disabled={isAddingItem}
                      className="flex-1 min-w-[160px] px-3 py-1.5 text-xs bg-white border border-[var(--border-parchment)] rounded-lg text-[var(--ink-primary)] placeholder-[var(--ink-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-midnight)]"
                    />
                    <button
                      type="submit"
                      disabled={isAddingItem || !newItemId.trim()}
                      className="px-3 py-1.5 text-xs font-medium bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight)]/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all cursor-pointer"
                    >
                      {isAddingItem ? 'Adding...' : '+ Attach Member'}
                    </button>
                  </form>

                  {/* Members List */}
                  <div className="space-y-2">
                    {items.length === 0 ? (
                      <div className="p-8 text-center text-xs text-[var(--ink-tertiary)] serif-italic border border-dashed border-[var(--border-parchment)] rounded-xl bg-white/40">
                        No items bound to this collection yet. Use the form above to attach existing notes, sources, or entities.
                      </div>
                    ) : (
                      items.map((item, idx) => (
                        <div
                          key={`${item.item_type}-${item.item_id || idx}`}
                          className="p-3 bg-white rounded-xl border border-[var(--border-parchment)] hover:border-[var(--border-strong)] transition-all flex items-center justify-between gap-3 group shadow-2xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded border ${getItemTypeBadgeStyle(
                                item.item_type
                              )}`}
                            >
                              {item.item_type}
                            </span>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-[var(--ink-primary)] truncate">
                                {item.title || item.item_id}
                              </div>
                              <div className="mono text-[10px] text-[var(--ink-tertiary)] truncate">
                                ID: {item.item_id}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.item_type, item.item_id)}
                            className="p-1 text-[var(--ink-tertiary)] hover:text-red-600 rounded transition-colors cursor-pointer"
                            title="Remove from collection"
                            aria-label={`Remove ${item.title || item.item_id}`}
                          >
                            <svg
                              className="w-3.5 h-3.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Related Knowledge Column (1 Col) */}
              <div className="space-y-4">
                <div className="instrument-panel p-5 space-y-3.5">
                  <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-2.5">
                    <div className="flex items-center gap-2">
                      <svg
                        className="w-4 h-4 text-[var(--accent-terracotta)]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                      <h3 className="serif text-base font-medium text-[var(--ink-primary)]">
                        Connected Knowledge
                      </h3>
                    </div>
                    <span className="mono text-[10px] text-[var(--ink-tertiary)]">
                      {related.length} found
                    </span>
                  </div>

                  <p className="text-[11px] text-[var(--ink-tertiary)] leading-relaxed">
                    Concepts dynamically intersected across member notes without mutating the underlying knowledge graph.
                  </p>

                  <div className="space-y-2 mt-2">
                    {related.length === 0 ? (
                      <div className="p-4 text-center text-xs text-[var(--ink-tertiary)] serif-italic bg-white/40 border border-dashed border-[var(--border-parchment)] rounded-xl">
                        No linked entities detected yet. Attach notes to surface dynamic connections.
                      </div>
                    ) : (
                      related.map((rel, idx) => (
                        <div
                          key={rel.id || idx}
                          className="p-2.5 bg-white rounded-lg border border-[var(--border-parchment)] shadow-2xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-[var(--ink-primary)] truncate">
                              {(rel as unknown as { title?: string }).title || rel.name}
                            </span>
                            <span className="mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                              {rel.entity_type || 'concept'}
                            </span>
                          </div>
                          {rel.via_item_title && (
                            <div className="text-[10px] text-[var(--ink-tertiary)] truncate">
                              via {rel.via_item_title}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-12 text-center">
            <div className="instrument-panel p-8 max-w-md space-y-3">
              <div className="w-10 h-10 rounded-full bg-[var(--accent-terracotta)]/10 text-[var(--accent-terracotta)] mx-auto flex items-center justify-center">
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m16 6 4 14" />
                  <path d="M12 6v14" />
                  <path d="M8 8v12" />
                  <path d="M4 4v16" />
                </svg>
              </div>
              <h3 className="serif text-lg font-medium text-[var(--ink-primary)]">
                Select a Collection Folio
              </h3>
              <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                Choose an existing folio from the left archival shelf or create a new collection to organize research materials.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
