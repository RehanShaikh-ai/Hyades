import React, { useState, useEffect } from 'react';
import { X, Bookmark, RotateCcw, Trash2 } from 'lucide-react';
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

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="saved-views-title"
    >
      <div className="dialog-content w-full max-w-lg bg-[#FAF8F2] border border-[#C9C2B0] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#DCD6C8] flex items-center justify-between bg-[#F7F5EE]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#162135] text-[#FAF8F2] flex items-center justify-center">
              <Bookmark size={16} className="text-[#C05638]" />
            </div>
            <div>
              <h3 id="saved-views-title" className="serif text-lg font-semibold text-[#1C1917] leading-tight">
                Saved Observatory Views
              </h3>
              <p className="text-xs text-[#878074]">
                Preserve and restore custom camera & constellation coordinates
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#878074] hover:text-[#1C1917] hover:bg-[#EFECE4] rounded-lg transition-colors focus:outline-none"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-[#FDF2E9] border border-[#FADBD8] text-[#9A3412] text-xs rounded-lg">
              {error}
            </div>
          )}

          {/* Save Current View Form */}
          <form onSubmit={handleSaveCurrentView} className="flex gap-2">
            <input
              type="text"
              placeholder="Name current coordinates view..."
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              className="flex-1 bg-white border border-[#C9C2B0] text-xs px-3 py-2 rounded-lg text-[#1C1917] placeholder:text-[#878074] focus:outline-none focus:border-[#C05638] transition-colors"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-[#C05638] hover:bg-[#A9482E] text-[#FAF8F2] text-xs font-semibold rounded-lg transition-colors shadow-xs"
            >
              Save View
            </button>
          </form>

          {/* Saved Views List */}
          <div className="max-h-64 overflow-y-auto hyades-scroll space-y-2 pr-1">
            {views.map((v) => (
              <div
                key={v.id}
                className="p-3 bg-white border border-[#DCD6C8] rounded-xl flex items-center justify-between hover:border-[#C9C2B0] transition-colors shadow-xs"
              >
                <div>
                  <div className="text-sm font-medium text-[#1C1917]">{v.name}</div>
                  <div className="text-[11px] text-[#878074] mono mt-0.5">
                    Zoom: {v.state.zoom} • Focus: {v.state.focus_entity_ids?.length || 0} entities
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleRestore(v.id)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[#EFECE4] hover:bg-[#E5E0D5] text-xs font-medium text-[#1C1917] rounded-lg border border-[#DCD6C8] transition-colors"
                  >
                    <RotateCcw size={12} className="text-[#C05638]" />
                    <span>Restore</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(v.id)}
                    className="p-1.5 text-[#878074] hover:text-[#C05638] rounded-lg hover:bg-[#FDF2E9] transition-colors"
                    title="Delete view"
                    aria-label="Delete view"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
            {views.length === 0 && (
              <div className="text-xs text-[#878074] italic py-8 text-center bg-white/50 border border-dashed border-[#DCD6C8] rounded-xl">
                No saved observatory views yet. Position the map and save your first view above.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};