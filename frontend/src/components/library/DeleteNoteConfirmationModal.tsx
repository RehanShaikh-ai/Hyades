import React from 'react';

interface DeleteNoteConfirmationModalProps {
  isOpen: boolean;
  noteTitle: string;
  isDeleting: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteNoteConfirmationModal: React.FC<DeleteNoteConfirmationModalProps> = ({
  isOpen,
  noteTitle,
  isDeleting,
  error,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs dialog-backdrop animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-note-title"
    >
      <div
        className="w-full max-w-md bg-[#FAF8F2] border border-[#DCD6C8] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#E5E0D4] bg-[#F4F1EA] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center text-red-700">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </div>
            <div>
              <h3 id="delete-note-title" className="serif text-base font-semibold text-[#1C1917] leading-tight">
                Delete Note
              </h3>
              <p className="text-[11px] text-[#878074] font-mono mt-0.5">
                Permanent Removal
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
          <div className="p-3.5 bg-white border border-[#E5E0D4] rounded-lg">
            <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-[#878074] block mb-1">
              Target Note
            </span>
            <div className="serif font-semibold text-sm text-[#1C1917] break-words">
              {noteTitle || 'Untitled Note'}
            </div>
          </div>

          <div className="text-xs text-[#575249] leading-relaxed space-y-2">
            <p>
              Are you sure you want to delete this note? This action cannot be reversed.
            </p>
            <ul className="list-disc pl-4 space-y-1 text-[#878074]">
              <li>Note text and version history will be removed.</li>
              <li>Incoming and outgoing concept links will be detached.</li>
              <li>Memberships in collections and saved views will be cleared.</li>
              <li>Vector search embeddings and graph index provenance will be purged.</li>
            </ul>
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
        <div className="px-6 py-4 bg-[#F4F1EA] border-t border-[#E5E0D4] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            data-testid="cancel-delete-note-btn"
            className="px-3.5 py-1.5 rounded-lg border border-[#DCD6C8] bg-white text-xs font-medium text-[#1C1917] hover:bg-[#EFECE4] transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            data-testid="confirm-delete-note-btn"
            className="px-3.5 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-medium transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {isDeleting ? (
              <>
                <svg className="animate-spin -ml-0.5 mr-1 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                </svg>
                <span>Delete Note</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

