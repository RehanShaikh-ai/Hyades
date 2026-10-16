import React, { useState, useEffect } from 'react';
import { SavedView, SavedViewState } from '@/types/saved_views';
import { listSavedViews, createSavedView, deleteSavedView, restoreSavedView } from '@/api/saved_views';

interface SavedViewsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  currentState: SavedViewState;
  onRestoreState: (state: SavedViewState, activeFocusIds: string[]) => void;
}

export const SavedViewsModal: React.FC<SavedViewsModalProps> = ({
  isOpen,
  onClose,
  workspaceId,
  currentState,
  onRestoreState,
}) => {
  const [views, setViews] = useState<SavedView[]>([]);
  const [viewName, setViewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadViews = async () => {
    setError(null);
    try {
      const res = await listSavedViews(workspaceId);
      setViews(res.items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed loading saved views');
    }
  };

  useEffect(() => {
    if (isOpen && workspaceId) {
      loadViews();
    }
  }, [isOpen, workspaceId]);

  if (!isOpen) return null;

  const handleSaveCurrentView = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewName.trim()) return;
    setError(null);
    try {
      await createSavedView({
        workspace_id: workspaceId,
        name: viewName.trim(),
        state: currentState,
      });
      setViewName('');
      await loadViews();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed saving view');
    }
  };

  const handleRestore = async (viewId: string) => {
    setError(null);
    try {
      const res = await restoreSavedView(viewId);
      onRestoreState(res.state, res.active_focus_entity_ids);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed restoring view');
    }
  };

  const handleDelete = async (viewId: string) => {
    try {
      await deleteSavedView(viewId);
      await loadViews();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed deleting view');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-lg max-w-lg w-full space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-lg font-bold text-amber-200">Saved Observatory Views</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-sm">
            ✕
          </button>
        </div>

        {error && <div className="p-2 bg-red-950/60 text-red-300 text-xs rounded border border-red-800">{error}</div>}

        {/* Save Current View Form */}
        <form onSubmit={handleSaveCurrentView} className="flex gap-2">
          <input
            type="text"
            placeholder="Name current view..."
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-800 text-xs px-3 py-1.5 rounded focus:outline-none focus:border-amber-400 text-slate-200"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded transition-colors"
          >
            Save View
          </button>
        </form>

        {/* Saved Views List */}
        <div className="max-h-60 overflow-y-auto space-y-2">
          {views.map((v) => (
            <div
              key={v.id}
              className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded flex items-center justify-between"
            >
              <div>
                <div className="text-sm font-medium text-slate-200">{v.name}</div>
                <div className="text-[10px] text-slate-500">
                  Zoom: {v.state.zoom} • Focus: {v.state.focus_entity_ids?.length || 0} entities
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleRestore(v.id)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-amber-300 rounded"
                >
                  Restore
                </button>
                <button
                  onClick={() => handleDelete(v.id)}
                  className="text-slate-500 hover:text-red-400 text-xs p-1"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          {views.length === 0 && (
            <div className="text-xs text-slate-500 italic py-4 text-center">No saved views yet.</div>
          )}
        </div>
      </div>
    </div>
  );
};
