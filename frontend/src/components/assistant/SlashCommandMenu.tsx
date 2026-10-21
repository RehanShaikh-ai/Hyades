import React from 'react';
import { SlashCommand } from '@/types/commands';
import { FilePlus, FileText, Link2, Inbox, Search } from 'lucide-react';

interface SlashCommandMenuProps {
  commands: SlashCommand[];
  filterQuery: string;
  selectedIndex: number;
  onSelectCommand: (command: SlashCommand) => void;
  onHoverIndex: (index: number) => void;
}

export const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  commands,
  filterQuery,
  selectedIndex,
  onSelectCommand,
  onHoverIndex,
}) => {
  const filtered = commands.filter((c) => {
    const q = filterQuery.toLowerCase();
    return (
      c.command.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q)
    );
  });

  const getCommandIcon = (cmd: string) => {
    switch (cmd) {
      case '/create-note':
        return <FilePlus size={14} className="shrink-0 text-[var(--accent-midnight)]" />;
      case '/summarize':
        return <FileText size={14} className="shrink-0 text-[var(--accent-terracotta)]" />;
      case '/link-notes':
        return <Link2 size={14} className="shrink-0 text-[var(--accent-brass)]" />;
      case '/review-inbox':
        return <Inbox size={14} className="shrink-0 text-[var(--accent-midnight)]" />;
      case '/search':
        return <Search size={14} className="shrink-0 text-[var(--accent-terracotta)]" />;
      default:
        return <FilePlus size={14} className="shrink-0 text-[var(--ink-secondary)]" />;
    }
  };

  return (
    <div
      role="listbox"
      aria-label="Stella Slash Commands"
      className="absolute bottom-full left-0 mb-2 w-full max-w-lg z-30 bg-[#FAF8F2] border border-[var(--border-strong)] rounded-xl shadow-xl overflow-hidden backdrop-blur-md animate-fade-in"
    >
      <div className="px-3.5 py-1.5 border-b border-[var(--border-parchment)] flex items-center justify-between text-[10.5px] font-mono text-[var(--ink-tertiary)] bg-white/80">
        <span className="font-semibold uppercase tracking-wider text-[var(--accent-midnight)]">
          Stella Actions
        </span>
        <span>↑↓ Navigate · ↵ Select · Esc Dismiss</span>
      </div>

      <div className="max-h-64 overflow-y-auto p-1.5 flex flex-col gap-1">
        {filtered.length === 0 ? (
          <div className="p-3 text-center text-xs text-[var(--ink-tertiary)] italic">
            No matching slash commands found for &ldquo;/{filterQuery}&rdquo;
          </div>
        ) : (
          filtered.map((cmd, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={cmd.command}
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelectCommand(cmd)}
                onMouseEnter={() => onHoverIndex(idx)}
                className={`p-2 rounded-lg flex items-center justify-between cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-white border border-[var(--accent-midnight)] shadow-xs text-[var(--ink-primary)]'
                    : 'hover:bg-white/60 border border-transparent text-[var(--ink-secondary)]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-[var(--bg-panel-subtle)]'
                        : 'bg-white border border-[var(--border-parchment)]'
                    }`}
                  >
                    {getCommandIcon(cmd.command)}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[var(--ink-primary)]">
                        {cmd.command}
                      </span>
                      <span className="text-xs font-semibold text-[var(--ink-secondary)] serif truncate">
                        {cmd.name}
                      </span>
                    </div>
                    <span className="text-[11px] text-[var(--ink-tertiary)] truncate">
                      {cmd.description}
                    </span>
                  </div>
                </div>

                <span className="font-mono text-[10px] text-[var(--ink-tertiary)] px-1.5 py-0.5 rounded bg-[var(--bg-panel-subtle)] shrink-0 ml-2">
                  {cmd.syntax}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
