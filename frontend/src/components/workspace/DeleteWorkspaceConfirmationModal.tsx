import React, { useState, useEffect } from 'react';
import { Workspace } from '@/types/workspaces';

interface DeleteWorkspaceConfirmationModalProps {
  isOpen: boolean;
  workspace: Workspace | null;
  isDeleting: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteWorkspaceConfirmationModal: React.FC<DeleteWorkspaceConfirmationModalProps> = ({
  isOpen,
  workspace,
  isDeleting,
  error,
  onConfirm,
  onCancel,
}) => {
  const [typedName, setTypedName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTypedName('');
    }
  }, [isOpen]);

  if (!isOpen || !workspace) return null;

  const isNameMatched = typedName.trim() === workspace.name.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs dialog-backdrop animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-workspace-title"
    >
      <div
        className="w-full max-w-lg bg-[#FAF8F2] border border-[#DCD6C8] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#E5E0D4] bg-[#F4F1EA] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-100 border border-red-300 flex items-center justify-center text-red-800">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <h3 id="delete-workspace-title" className="serif text-lg font-semibold text-[#1C1917] leading-tight">
                Delete Entire Workspace
              </h3>
              <p className="text-[11px] text-[#878074] font-mono mt-0.5">
                Irreversible Archive Destructure
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            aria-label="Close dialog"
            className="w-7 h-7 rounded-md flex items-center justify-center text-[#878074] hover:text-[#1C1917] hover:bg-[#E5E0D4] transition-colors disabled:opacity-50 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 leading-relaxed flex items-start gap-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5 text-amber-700">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div>
              <strong>Warning:</strong> Deleting this workspace will permanently erase all contained records. This action cannot be undone.
            </div>
          </div>

          <div className="text-xs text-[#575249] leading-relaxed space-y-1.5">
            <p className="font-medium text-[#1C1917]">
              The following resources will be permanently removed:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-[#878074]">
              <li>All notes, revisions, and Git repository versions</li>
              <li>All ingested sources and document previews</li>
              <li>All curated collections and item associations</li>
              <li>All conversational threads, flashcard decks, and messages</li>
              <li>All knowledge graph entities, relationships, and vector embeddings</li>
            </ul>
          </div>

          <div className="pt-2">
            <label htmlFor="confirm-workspace-name" className="block text-xs font-medium text-[#1C1917] mb-1.5">
              To confirm, type <span className="font-mono font-semibold px-1 py-0.5 bg-white border border-[#DCD6C8] rounded text-[#1C1917]">{workspace.name}</span> below:
            </label>
            <input
              id="confirm-workspace-name"
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              disabled={isDeleting}
              placeholder="Type workspace name exactly..."
              data-testid="confirm-workspace-name-input"
              className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#DCD6C8] rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 text-[#1C1917] placeholder:text-[#B5AFA4]"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#F4F1EA] border-t border-[#E5E0D4] flex items-center justify-between gap-3">
          <span className="text-[11px] font-mono text-[#878074]">
            {isNameMatched ? '✓ Name verified' : 'Enter matching name'}
          </span>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isDeleting}
              data-testid="cancel-delete-workspace-btn"
              className="px-3.5 py-1.5 rounded-lg border border-[#DCD6C8] bg-white text-xs font-medium text-[#1C1917] hover:bg-[#EFECE4] transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!isNameMatched || isDeleting}
              data-testid="confirm-delete-workspace-btn"
              className="px-4 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-medium transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isDeleting ? (
                <>
                  <svg className="animate-spin -ml-0.5 mr-1 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Deleting Archive...</span>
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  </svg>
                  <span>Delete Workspace</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

