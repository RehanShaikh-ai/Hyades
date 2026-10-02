import React, { useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { SearchPanel } from './SearchPanel';
import { ObservatoryTarget, StellaContext } from '@/types/navigation';

interface HyadesGlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  onSelectNote: (noteId: string) => void;
  onNavigateToObservatory?: (target: ObservatoryTarget) => void;
  onNavigateToStella?: (context: StellaContext) => void;
}

export const HyadesGlobalSearchModal: React.FC<HyadesGlobalSearchModalProps> = ({
  isOpen,
  onClose,
  workspaceId,
  onSelectNote,
  onNavigateToObservatory,
  onNavigateToStella,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 p-4 bg-black/45 backdrop-blur-xs animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="global-search-title"
    >
      <div className="w-full max-w-3xl bg-[#FAF8F2] border border-[#C9C2B0] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Search Header */}
        <div className="px-5 py-3 border-b border-[#DCD6C8] flex items-center justify-between bg-[#F7F5EE]">
          <div className="flex items-center gap-2 text-xs text-[#575249]">
            <Search size={14} className="text-[#BD532B]" />
            <span id="global-search-title" className="serif font-semibold text-sm text-[#1C1917]">
              Global Knowledge Search
            </span>
            <span className="mono text-[10px] text-[#878074]">· Hybrid Semantic & Graph</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#878074] hover:text-[#1C1917] hover:bg-[#EFECE4] rounded-md transition-colors focus:outline-none"
            aria-label="Close search"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto hyades-scroll p-4 sm:p-5">
          <SearchPanel
            workspaceId={workspaceId}
            onNoteSelect={(noteId) => {
              onSelectNote(noteId);
              onClose();
            }}
            onViewInObservatory={(target) => {
              if (onNavigateToObservatory) {
                onNavigateToObservatory(target);
                onClose();
              }
            }}
            onAskStella={(context) => {
              if (onNavigateToStella) {
                onNavigateToStella(context);
                onClose();
              }
            }}
            onClose={onClose}
          />
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-[#DCD6C8] bg-[#F7F5EE] flex items-center justify-between text-[11px] text-[#878074]">
          <div className="flex items-center gap-3">
            <span><kbd className="mono px-1 py-0.5 bg-white border border-[#C9C2B0] rounded">↑↓</kbd> Navigate</span>
            <span><kbd className="mono px-1 py-0.5 bg-white border border-[#C9C2B0] rounded">↵</kbd> Select</span>
            <span><kbd className="mono px-1 py-0.5 bg-white border border-[#C9C2B0] rounded">ESC</kbd> Close</span>
          </div>
          <span className="mono text-[10px]">HYADES SEARCH</span>
        </div>
      </div>
    </div>
  );
};
