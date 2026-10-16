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

export const HyadesCollections: React.FC<HyadesCollectionsProps> = ({ workspaceId }) => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [related, setRelated] = useState<RelatedKnowledgeItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New collection form state
  const [newCollName, setNewCollName] = useState('');
  const [newCollDesc, setNewCollDesc] = useState('');

  // Add member form state
  const [newItemType, setNewItemType] = useState<KnowledgeItemType>('note');
  const [newItemId, setNewItemId] = useState('');

  const loadCollections = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await listCollections(workspaceId);
      setCollections(res.items);
      if (res.items.length > 0 && !selectedCollection) {
        setSelectedCollection(res.items[0]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed loading collections');
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
        getCollectionStats(collId),
        getCollectionRelated(collId),
      ]);
      setItems(itemsRes.items);
      setStats(statsRes);
      setRelated(relatedRes.related_entities);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed loading collection details');
    }
  };

  useEffect(() => {
    if (selectedCollection) {
      loadCollectionDetails(selectedCollection.id);
    }
  }, [selectedCollection]);

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollName.trim()) return;
    try {
      const created = await createCollection({
        workspace_id: workspaceId,
        name: newCollName.trim(),
        description: newCollDesc.trim() || null,
      });
      setNewCollName('');
      setNewCollDesc('');
      await loadCollections();
      setSelectedCollection(created);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed creating collection');
    }
  };

  const handleDeleteCollection = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this collection?')) return;
    try {
      await deleteCollection(id);
      setSelectedCollection(null);
      await loadCollections();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed deleting collection');
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCollection || !newItemId.trim()) return;
    try {
      await addKnowledgeItem(selectedCollection.id, {
        item_type: newItemType,
        item_id: newItemId.trim(),
      });
      setNewItemId('');
      await loadCollectionDetails(selectedCollection.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed adding member item');
    }
  };

  const handleRemoveItem = async (itemType: KnowledgeItemType, itemId: string) => {
    if (!selectedCollection) return;
    try {
      await removeKnowledgeItem(selectedCollection.id, itemType, itemId);
      await loadCollectionDetails(selectedCollection.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed removing member item');
    }
  };

  return (
    <div className="flex h-full w-full bg-slate-950 text-slate-100 overflow-hidden" data-testid="hyades-collections">
      {/* Sidebar: Collections List */}
      <div className="w-80 border-r border-slate-800 flex flex-col bg-slate-900/60 p-4 space-y-4">
        <h2 className="text-xl font-bold tracking-tight text-amber-200">Collections</h2>
        
        {/* Create Collection Form */}
        <form onSubmit={handleCreateCollection} className="space-y-2 border-b border-slate-800 pb-4">
          <input
            type="text"
            placeholder="Collection name..."
            value={newCollName}
            onChange={(e) => setNewCollName(e.target.value)}
            className="w-full px-3 py-1.5 text-sm bg-slate-950 border border-slate-800 rounded focus:outline-none focus:border-amber-400"
          />
          <input
            type="text"
            placeholder="Description (optional)..."
            value={newCollDesc}
            onChange={(e) => setNewCollDesc(e.target.value)}
            className="w-full px-3 py-1.5 text-sm bg-slate-950 border border-slate-800 rounded focus:outline-none focus:border-amber-400"
          />
          <button
            type="submit"
            className="w-full py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded transition-colors"
          >
            Create Collection
          </button>
        </form>

        {/* Collections List */}
        <div className="flex-1 overflow-y-auto space-y-1">
          {collections.map((coll) => (
            <div
              key={coll.id}
              onClick={() => setSelectedCollection(coll)}
              className={`p-2.5 rounded cursor-pointer transition-colors flex items-center justify-between ${
                selectedCollection?.id === coll.id
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30'
                  : 'hover:bg-slate-800/60 text-slate-300'
              }`}
            >
              <div>
                <div className="font-medium text-sm">{coll.name}</div>
                {coll.description && <div className="text-xs text-slate-400 truncate">{coll.description}</div>}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteCollection(coll.id);
                }}
                className="text-xs text-slate-500 hover:text-red-400 p-1"
                title="Delete collection"
              >
                ✕
              </button>
            </div>
          ))}
          {collections.length === 0 && !isLoading && (
            <div className="text-xs text-slate-500 italic p-2">No collections yet. Create one above.</div>
          )}
        </div>
      </div>

      {/* Main Content: Selected Collection Details */}
      <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
        {error && (
          <div className="p-3 bg-red-950/60 border border-red-500/50 text-red-200 text-sm rounded">
            {error}
          </div>
        )}

        {selectedCollection ? (
          <>
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h1 className="text-2xl font-bold text-amber-100">{selectedCollection.name}</h1>
                {selectedCollection.description && (
                  <p className="text-sm text-slate-400 mt-1">{selectedCollection.description}</p>
                )}
              </div>
              {stats && (
                <div className="flex gap-3 text-xs">
                  <div className="px-3 py-1 bg-slate-900 border border-slate-800 rounded">
                    Total: <span className="font-bold text-amber-400">{stats.total_items}</span>
                  </div>
                  {Object.entries(stats.by_type).map(([k, v]) => (
                    <div key={k} className="px-3 py-1 bg-slate-900 border border-slate-800 rounded capitalize">
                      {k}: <span className="font-bold text-slate-200">{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Member Form */}
            <form onSubmit={handleAddItem} className="flex gap-2 items-center bg-slate-900/40 p-3 rounded border border-slate-800">
              <span className="text-xs font-semibold text-slate-400">Add Member:</span>
              <select
                value={newItemType}
                onChange={(e) => setNewItemType(e.target.value as KnowledgeItemType)}
                className="bg-slate-950 border border-slate-800 text-xs px-2 py-1.5 rounded focus:outline-none text-slate-200"
              >
                <option value="note">Note</option>
                <option value="source">Source</option>
                <option value="entity">Entity</option>
                <option value="conversation">Conversation</option>
              </select>
              <input
                type="text"
                placeholder="UUID of target item..."
                value={newItemId}
                onChange={(e) => setNewItemId(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 text-xs px-3 py-1.5 rounded focus:outline-none focus:border-amber-400 text-slate-200"
              />
              <button
                type="submit"
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded text-amber-200 transition-colors"
              >
                Attach
              </button>
            </form>

            {/* Members List */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-300">Attached Knowledge Items</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {items.map((item) => (
                  <div
                    key={`${item.item_type}-${item.item_id}`}
                    className="p-3 bg-slate-900/70 border border-slate-800/80 rounded flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs uppercase tracking-wider text-amber-400/80 font-bold">
                        {item.item_type}
                      </div>
                      <div className="text-sm font-medium text-slate-200">{item.title}</div>
                      <div className="text-[10px] text-slate-500 font-mono truncate">{item.item_id}</div>
                    </div>
                    <button
                      onClick={() => handleRemoveItem(item.item_type, item.item_id)}
                      className="text-xs text-slate-500 hover:text-red-400 p-1"
                      title="Remove member"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="col-span-2 text-xs text-slate-500 italic py-4">No items attached yet.</div>
                )}
              </div>
            </div>

            {/* Dynamic Related Knowledge (Read-only, no graph mutation) */}
            <div className="space-y-2 border-t border-slate-800 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-300">Related Knowledge (Dynamic Context)</h3>
                <span className="text-xs text-slate-500">Computed on request • No graph mutations</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {related.map((rel) => (
                  <div key={rel.id} className="p-2.5 bg-slate-950/60 border border-slate-800/60 rounded">
                    <div className="text-xs font-medium text-amber-200">{rel.name}</div>
                    <div className="text-[10px] text-slate-400 capitalize">{rel.entity_type}</div>
                    <div className="text-[10px] text-slate-500 mt-1 truncate">Via: {rel.via_item_title}</div>
                  </div>
                ))}
                {related.length === 0 && (
                  <div className="col-span-3 text-xs text-slate-500 italic py-2">
                    No related knowledge discovered for current members.
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            Select or create a collection to begin.
          </div>
        )}
      </div>
    </div>
  );
};
