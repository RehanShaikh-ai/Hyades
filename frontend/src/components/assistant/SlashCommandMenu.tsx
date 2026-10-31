import React from 'react';
import { SlashCommand } from '@/types/commands';
import {
  FilePlus,
  FileText,
  Link2,
  FolderPlus,
  Inbox,
  Sparkles,
  Layers,
  Search,
  Compass,
  HelpCircle,
  Terminal,
  ArrowRight,
  UploadCloud,
  GitMerge,
  Scissors,
  Scale,
  Network,
  CheckCheck,
} from 'lucide-react';

interface SlashCommandMenuProps {
  commands: SlashCommand[];
  filterQuery: string;
  selectedIndex: number;
  onSelectCommand: (command: SlashCommand) => void;
  onSelectExample?: (example: string) => void;
  onHoverIndex: (index: number) => void;
}

export const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  commands,
  filterQuery,
  selectedIndex,
  onSelectCommand,
  onSelectExample,
  onHoverIndex,
}) => {
  const listContainerRef = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);

  const filtered = commands.filter((c) => {
    if (c.availability === 'internal') return false;
    const q = filterQuery.toLowerCase();
    return (
      c.command.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q)
    );
  });

  // Keep itemRefs array size in sync
  itemRefs.current = itemRefs.current.slice(0, filtered.length);

  // Auto-scroll the list container to guarantee selected item is visible
  React.useEffect(() => {
    const container = listContainerRef.current;
    const selectedEl = itemRefs.current[selectedIndex];
    if (!container || !selectedEl) return;

    const containerRect = container.getBoundingClientRect();
    const itemRect = selectedEl.getBoundingClientRect();

    if (containerRect.height > 0 && itemRect.height > 0) {
      if (itemRect.top < containerRect.top) {
        // Scrolled above the visible viewport
        container.scrollTop -= (containerRect.top - itemRect.top);
      } else if (itemRect.bottom > containerRect.bottom) {
        // Scrolled below the visible viewport
        container.scrollTop += (itemRect.bottom - containerRect.bottom);
      }
    } else {
      // Fallback for headless environments or jsdom
      const itemTop = selectedEl.offsetTop;
      const itemHeight = selectedEl.offsetHeight || 44;
      const containerTop = container.scrollTop;
      const containerHeight = container.clientHeight || 300;

      if (itemTop < containerTop) {
        container.scrollTop = itemTop;
      } else if (itemTop + itemHeight > containerTop + containerHeight) {
        container.scrollTop = itemTop + itemHeight - containerHeight;
      }
    }
  }, [selectedIndex, filtered.length]);

  const getCommandIcon = (cmd: string) => {
    switch (cmd) {
      case '/create-note':
        return <FilePlus size={15} className="shrink-0 text-[var(--accent-midnight)]" />;
      case '/summarize':
        return <FileText size={15} className="shrink-0 text-[var(--accent-terracotta)]" />;
      case '/link-notes':
        return <Link2 size={15} className="shrink-0 text-[var(--accent-brass)]" />;
      case '/add-to-collection':
      case '/populate-collection':
        return <FolderPlus size={15} className="shrink-0 text-[var(--accent-midnight)]" />;
      case '/review-inbox':
      case '/process-inbox':
        return <Inbox size={15} className="shrink-0 text-[var(--accent-terracotta)]" />;
      case '/analyze':
      case '/enrich-note':
        return <Sparkles size={15} className="shrink-0 text-[var(--accent-brass)]" />;
      case '/generate-flashcards':
      case '/organize-knowledge':
        return <Layers size={15} className="shrink-0 text-[var(--accent-midnight)]" />;
      case '/search':
        return <Search size={15} className="shrink-0 text-[var(--accent-terracotta)]" />;
      case '/find-sources':
        return <Compass size={15} className="shrink-0 text-[var(--accent-brass)]" />;
      case '/ask-about':
        return <HelpCircle size={15} className="shrink-0 text-[var(--accent-midnight)]" />;
      case '/explore-graph':
      case '/extract-entities':
        return <Network size={15} className="shrink-0 text-[var(--accent-midnight)]" />;
      case '/create-source':
        return <UploadCloud size={15} className="shrink-0 text-[var(--accent-midnight)]" />;
      case '/merge-notes':
        return <GitMerge size={15} className="shrink-0 text-[var(--accent-brass)]" />;
      case '/split-note':
        return <Scissors size={15} className="shrink-0 text-[var(--accent-terracotta)]" />;
      case '/reconcile-duplicates':
        return <CheckCheck size={15} className="shrink-0 text-[var(--accent-midnight)]" />;
      case '/resolve-conflicts':
        return <Scale size={15} className="shrink-0 text-[var(--accent-terracotta)]" />;
      default:
        return <Terminal size={15} className="shrink-0 text-[var(--ink-secondary)]" />;
    }
  };

  const selectedCommand =
    filtered.length > 0
      ? filtered[Math.min(selectedIndex, filtered.length - 1)]
      : null;

  return (
    <div
      role="listbox"
      aria-label="Stella Slash Commands"
      className="absolute bottom-full left-0 mb-3 w-full max-w-2xl z-30 bg-[#FAF8F2] border border-[var(--border-strong)] rounded-xl shadow-2xl overflow-hidden backdrop-blur-md animate-fade-in text-[var(--ink-primary)]"
    >
      {/* Top Banner Header */}
      <div className="px-3.5 py-1.5 border-b border-[var(--border-parchment)] flex items-center justify-between text-[11.5px] text-[var(--ink-secondary)] bg-white/90">
        <span className="font-semibold uppercase tracking-wider text-[11px] text-[var(--accent-midnight)] flex items-center gap-1.5">
          <Terminal size={13} />
          Stella Actions
        </span>
        <span className="text-[11px] text-[var(--ink-tertiary)] select-none">
          ↑↓ Navigate · ↵ Select · Esc Dismiss
        </span>
      </div>

      {/* Two Column Layout: Command list on left, Details & Examples on right */}
      <div className="flex flex-col md:flex-row min-h-[260px] max-h-[360px]">
        {/* Left Column: Command List */}
        <div
          ref={listContainerRef}
          className="w-full md:w-7/12 border-b md:border-b-0 md:border-r border-[var(--border-parchment)] overflow-y-auto overscroll-contain p-2 flex flex-col gap-1 scrollbar-thin"
        >
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-[var(--ink-tertiary)] italic">
              No matching slash commands found for &ldquo;/{filterQuery}&rdquo;
            </div>
          ) : (
            filtered.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.command}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => onSelectCommand(cmd)}
                  onMouseEnter={() => onHoverIndex(idx)}
                  className={`px-2.5 py-2 rounded-lg flex items-center justify-between cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-white border border-[var(--accent-midnight)] shadow-2xs text-[var(--ink-primary)]'
                      : 'hover:bg-white/60 border border-transparent text-[var(--ink-secondary)]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-[var(--bg-panel-subtle)] text-[var(--accent-midnight)]'
                          : 'bg-white border border-[var(--border-parchment)] text-[var(--ink-secondary)]'
                      }`}
                    >
                      {getCommandIcon(cmd.command)}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-[var(--ink-primary)]">
                          {cmd.command}
                        </span>
                        {(cmd.availability === 'coming_soon' || cmd.execution_type === 'placeholder') && (
                          <span className="text-[9.5px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-[var(--ink-tertiary)]">
                            Coming soon
                          </span>
                        )}
                      </div>
                      <span className="text-[11.5px] text-[var(--ink-secondary)] truncate">
                        {cmd.description}
                      </span>
                    </div>
                  </div>

                  {isSelected && (
                    <ArrowRight size={13} className="text-[var(--accent-midnight)] shrink-0 ml-1 hidden md:block" />
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Command Preview & Clickable Example Pills */}
        <div className="w-full md:w-5/12 bg-white/70 p-4 flex flex-col justify-between overflow-y-auto overscroll-contain">
          {selectedCommand ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-[var(--bg-panel-subtle)] flex items-center justify-center shrink-0">
                  {getCommandIcon(selectedCommand.command)}
                </div>
                <span className="font-mono text-xs font-bold text-[var(--ink-primary)]">
                  {selectedCommand.command}
                </span>
                {(selectedCommand.availability === 'coming_soon' || selectedCommand.execution_type === 'placeholder') && (
                  <span className="text-[9.5px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-[var(--ink-tertiary)]">
                    Coming soon
                  </span>
                )}
              </div>

              <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                {selectedCommand.description}
              </p>

              {/* Examples section */}
              {selectedCommand.examples && selectedCommand.examples.length > 0 && (
                <div className="flex flex-col gap-1.5 pt-1 border-t border-[var(--border-parchment)]">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--ink-tertiary)] font-semibold select-none">
                    Examples
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {selectedCommand.examples.map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSelectExample) {
                            onSelectExample(ex);
                          } else {
                            onSelectCommand({ ...selectedCommand, example: ex });
                          }
                        }}
                        className="text-left font-mono text-[11px] px-2.5 py-1.5 rounded-md bg-[#FAF8F2] hover:bg-white border border-[var(--border-parchment)] hover:border-[var(--border-strong)] text-[var(--ink-primary)] transition-all cursor-pointer truncate shadow-2xs hover:shadow-xs active:scale-[0.98]"
                        title={`Run ${ex}`}
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-[var(--ink-tertiary)] italic">
              Select a command to view details and examples.
            </div>
          )}

          <div className="pt-2 border-t border-[var(--border-parchment)] text-[11px] text-[var(--ink-tertiary)] select-none">
            Press <kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-white border border-[var(--border-parchment)] shadow-3xs">Tab</kbd> or <kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-white border border-[var(--border-parchment)] shadow-3xs">↵</kbd> to insert
          </div>
        </div>
      </div>
    </div>
  );
};
