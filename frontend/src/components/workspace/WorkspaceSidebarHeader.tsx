import React from 'react';
import { HyadesDestination } from '../navigation/HyadesHeader';

interface WorkspaceSidebarHeaderProps {
  currentDestination: 'collections' | 'threads' | 'inbox';
  onNavigate?: (dest: HyadesDestination) => void;
  workspaceName?: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItem {
  id: 'collections' | 'threads' | 'inbox';
  label: string;
  iconClass: string;
  testId: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'collections',
    label: 'Collections',
    iconClass: 'ph-bold ph-folders',
    testId: 'workspace-nav-collections',
  },
  {
    id: 'threads',
    label: 'Threads',
    iconClass: 'ph-bold ph-chat-centered-text',
    testId: 'workspace-nav-threads',
  },
  {
    id: 'inbox',
    label: 'Inbox',
    iconClass: 'ph-bold ph-tray',
    testId: 'workspace-nav-inbox',
  },
];

export const WorkspaceSidebarHeader: React.FC<WorkspaceSidebarHeaderProps> = ({
  currentDestination,
  onNavigate,
  workspaceName = 'Workspace',
  isCollapsed,
  onToggleCollapse,
}) => {
  return (
    <div className="shrink-0 border-b border-[var(--border-parchment)] bg-[var(--bg-canvas)]/70 backdrop-blur-xs select-none">
      {/* Top Header Row: Workspace Indicator & Collapse Button */}
      <div className={`h-11 px-3 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} gap-1.5`}>
        {!isCollapsed && (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="w-2 h-2 rounded-full bg-[var(--accent-terracotta)] shrink-0" />
            <div className="truncate">
              <span className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-tertiary)] block leading-none font-semibold">
                Workspace
              </span>
              <span className="text-xs font-semibold text-[var(--ink-primary)] truncate block leading-tight mt-0.5">
                {workspaceName}
              </span>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onToggleCollapse}
          data-testid="workspace-sidebar-toggle"
          aria-label={isCollapsed ? 'Expand workspace sidebar' : 'Collapse workspace sidebar'}
          title={isCollapsed ? 'Expand workspace sidebar' : 'Collapse workspace sidebar'}
          className="p-1.5 rounded-lg text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white border border-transparent hover:border-[var(--border-strong)] transition-all cursor-pointer"
        >
          <i
            className={`ph-bold ${
              isCollapsed ? 'ph-caret-right' : 'ph-caret-left'
            } text-xs text-[var(--accent-terracotta)]`}
          />
        </button>
      </div>

      {/* Segmented Resource Navigation Bar */}
      <div className={`px-2 pb-2.5 ${isCollapsed ? 'flex flex-col gap-1 items-center' : ''}`}>
        {!isCollapsed ? (
          <div className="grid grid-cols-3 p-1 rounded-xl bg-black/5 border border-[var(--border-parchment)] gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = currentDestination === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={item.testId}
                  onClick={() => onNavigate && onNavigate(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`py-1.5 px-1.5 rounded-lg text-xs flex items-center justify-center gap-1.5 font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white text-[var(--ink-primary)] shadow-2xs font-semibold border border-[var(--border-parchment)]'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white/50 border border-transparent'
                  }`}
                >
                  <i
                    className={`${item.iconClass} text-xs ${
                      isActive ? 'text-[var(--accent-terracotta)]' : 'text-[var(--ink-tertiary)]'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-1 py-1">
            {NAV_ITEMS.map((item) => {
              const isActive = currentDestination === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={item.testId}
                  onClick={() => onNavigate && onNavigate(item.id)}
                  title={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white text-[var(--accent-terracotta)] shadow-2xs border border-[var(--border-parchment)]'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white/60 border border-transparent'
                  }`}
                >
                  <i className={`${item.iconClass} text-sm`} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
