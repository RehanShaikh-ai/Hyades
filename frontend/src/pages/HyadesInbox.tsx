import React, { useState, useEffect } from 'react';
import { InboxItem } from '@/types/inbox';
import {
  listInbox,
  getInboxItem,
  updateInboxItem,
  acceptInboxItem,
  rejectInboxItem,
  redetectInboxItem,
  uploadToInbox,
} from '@/api/inbox';

interface HyadesInboxProps {
  workspaceId: string;
}

export const HyadesInbox: React.FC<HyadesInboxProps> = ({ workspaceId }) => {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Rejection confirmation modal state
  const [rejectingItem, setRejectingItem] = useState<InboxItem | null>(null);

  const loadInbox = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await listInbox(workspaceId, statusFilter === 'all' ? undefined : statusFilter);
      setItems(res.items);
      if (res.items.length > 0 && (!selectedItem || !res.items.find((i) => i.id === selectedItem.id))) {
        await loadItemDetail(res.items[0].id);
      } else if (res.items.length === 0) {
        setSelectedItem(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed loading inbox');
    } finally {
      setIsLoading(false);
    }
  };

  const loadItemDetail = async (id: string) => {
    try {
      const detail = await getInboxItem(id);
      setSelectedItem(detail);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed loading item detail');
    }
  };

  useEffect(() => {
    if (workspaceId) {
      loadInbox();
    }
  }, [workspaceId, statusFilter]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setError(null);
    try {
      await uploadToInbox(workspaceId, file);
      await loadInbox();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload to Inbox failed');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleToggleExtractKnowledge = async (item: InboxItem) => {
    try {
      const updated = await updateInboxItem(item.id, {
        extract_knowledge: !item.extract_knowledge,
      });
      setSelectedItem(updated);
      await loadInbox();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed updating extraction setting');
    }
  };

  const handleAccept = async (item: InboxItem) => {
    try {
      await acceptInboxItem(item.id);
      await loadInbox();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed accepting item');
    }
  };

  const confirmReject = async () => {
    if (!rejectingItem) return;
    try {
      await rejectInboxItem(rejectingItem.id);
      setRejectingItem(null);
      await loadInbox();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed rejecting item');
    }
  };

  const handleRedetect = async (item: InboxItem) => {
    try {
      const updated = await redetectInboxItem(item.id);
      setSelectedItem(updated);
      await loadInbox();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed re-running concept detection');
    }
  };

  return (
    <div className="flex h-full w-full bg-slate-950 text-slate-100 overflow-hidden" data-testid="hyades-inbox">
      {/* Sidebar: Inbox List */}
      <div className="w-80 border-r border-slate-800 flex flex-col bg-slate-900/60 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight text-amber-200">Knowledge Inbox</h2>
          {/* Upload Button */}
          <label className="cursor-pointer px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold rounded transition-colors">
            {isUploading ? 'Uploading...' : 'Import File'}
            <input type="file" onChange={handleFileUpload} className="hidden" disabled={isUploading} />
          </label>
        </div>

        {/* Filter buttons */}
        <div className="flex gap-1 border-b border-slate-800 pb-2 text-xs">
          {(['pending', 'accepted', 'rejected', 'all'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded capitalize ${
                statusFilter === st ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto space-y-1">
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => loadItemDetail(item.id)}
              className={`p-2.5 rounded cursor-pointer transition-colors ${
                selectedItem?.id === item.id
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30'
                  : 'hover:bg-slate-800/60 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm truncate">{item.source_title}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {item.source_type}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                <span>Detection: {item.detection_status}</span>
                <span>{item.detected_count} concepts</span>
              </div>
            </div>
          ))}
          {items.length === 0 && !isLoading && (
            <div className="text-xs text-slate-500 italic p-2">No inbox items in this view.</div>
          )}
        </div>
      </div>

      {/* Main Panel: Item Review */}
      <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
        {error && (
          <div className="p-3 bg-red-950/60 border border-red-500/50 text-red-200 text-sm rounded">
            {error}
          </div>
        )}

        {selectedItem ? (
          <>
            {/* Header & Status */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h1 className="text-2xl font-bold text-amber-100">{selectedItem.source_title}</h1>
                <div className="flex gap-4 text-xs text-slate-400 mt-1">
                  <span>Type: <strong className="text-slate-200 uppercase">{selectedItem.source_type}</strong></span>
                  <span>Status: <strong className="text-amber-400 uppercase">{selectedItem.status}</strong></span>
                  <span>Detection: <strong className="text-slate-200">{selectedItem.detection_status}</strong></span>
                  {selectedItem.file_size_bytes && (
                    <span>Size: {Math.round(selectedItem.file_size_bytes / 1024)} KB</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              {selectedItem.status === 'pending' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRedetect(selectedItem)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded text-slate-200"
                  >
                    Re-detect
                  </button>
                  <button
                    onClick={() => setRejectingItem(selectedItem)}
                    className="px-3 py-1.5 bg-red-900/40 hover:bg-red-800 text-red-200 text-xs font-semibold rounded border border-red-700/50"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleAccept(selectedItem)}
                    className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded"
                  >
                    Accept
                  </button>
                </div>
              )}
            </div>

            {/* Extraction Policy Setting */}
            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded space-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-slate-200">Extract Knowledge into Graph</span>
                  <p className="text-xs text-slate-400">
                    Controls whether this source automatically extracts concepts and relationships into the knowledge graph upon acceptance.
                  </p>
                </div>
                <button
                  onClick={() => handleToggleExtractKnowledge(selectedItem)}
                  className={`px-3 py-1 text-xs font-bold rounded ${
                    selectedItem.extract_knowledge
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {selectedItem.extract_knowledge ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>

            {/* Dry-run Concept Preview */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-300">
                  Detected Concepts Preview (Dry-Run: Up to 100 concepts)
                </h3>
                {selectedItem.detection_truncated && (
                  <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                    Truncated at 100 concepts
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(selectedItem.detected_entities || []).map((c, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-900/40 border border-slate-800/80 rounded">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-amber-200">{c.name}</span>
                      <span className="text-[10px] text-slate-400 uppercase">{c.type}</span>
                    </div>
                    {c.description && <p className="text-xs text-slate-400 mt-1">{c.description}</p>}
                  </div>
                ))}
                {(!selectedItem.detected_entities || selectedItem.detected_entities.length === 0) && (
                  <div className="col-span-2 text-xs text-slate-500 italic py-4">
                    {selectedItem.detection_status === 'not_applicable'
                      ? 'Concept extraction is not applicable for this file format.'
                      : 'No concepts detected.'}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            Select an inbox item to review.
          </div>
        )}
      </div>

      {/* Confirmation Modal for Rejection */}
      {rejectingItem && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-lg max-w-md w-full space-y-4">
            <h3 className="text-lg font-bold text-red-200">Confirm Rejection</h3>
            <p className="text-sm text-slate-300">
              Rejecting &quot;{rejectingItem.source_title}&quot; is permanent. The source file, chunk embeddings, and inbox item will be completely removed from storage.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRejectingItem(null)}
                className="px-3 py-1.5 bg-slate-800 text-xs font-semibold text-slate-300 rounded"
              >
                Cancel
              </button>
              <button
                onClick={confirmReject}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-xs font-bold text-white rounded"
              >
                Permanently Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
