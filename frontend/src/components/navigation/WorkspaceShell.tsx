import React, { useState } from 'react';
import { HyadesDestination } from './HyadesHeader';

interface WorkspaceShellProps {
  currentDestination: 'collections' | 'threads' | 'inbox';
  onNavigate: (dest: HyadesDestination) => void;
  workspaceName?: string;
  children: React.ReactNode;
}

interface WorkspaceNavItem {
  id: 'collections' | 'threads' | 'inbox';
  label: string;
  description: string;
  iconClass: string;
  testId: string;
}

const WORKSPACE_NAV_ITEMS: WorkspaceNavItem[] = [
  {
    id: 'collections',
    label: 'Collections',
    description: 'Curated dossiers & themes',
    iconClass: 'ph-bold ph-folders',
    testId: 'workspace-nav-collections',
  },
  {
    id: 'threads',
    label: 'Threads',
    description: 'Dialectical inquiry lines',
    iconClass: 'ph-bold ph-chat-centered-text',
    testId: 'workspace-nav-threads',
  },
  {
    id: 'inbox',
    label: 'Inbox',
    description: 'Source intake & triage',
    iconClass: 'ph-bold ph-tray',
    testId: 'workspace-nav-inbox',
  },
];

export const WorkspaceShell: React.FC<WorkspaceShellProps> = ({
  currentDestination,
  onNavigate,
  workspaceName = 'Active Workspace',
  children,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('hyades_workspace_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('hyades_workspace_sidebar_collapsed', String(next));
      } catch {
        // Ignore localStorage error
      }
      return next;
    });
  };

  return (
    <div className="flex-1 flex min-h-0 w-full overflow-hidden bg-[var(--bg-base)]">
      {/* Contextual Workspace Sidebar */}
      <aside
        data-testid="workspace-sidebar"
        aria-label="Workspace Navigation Sidebar"
        className={`hidden sm:flex flex-col shrink-0 bg-[var(--bg-canvas)] border-r border-[var(--border-parchment)] transition-all duration-200 select-none ${
          isCollapsed ? 'w-14' : 'w-56'
        }`}
      >
        {/* Sidebar Header with Workspace Badge & Collapse Button */}
        <div className="h-12 border-b border-[var(--border-parchment)] px-3 flex items-center justify-between gap-1">
          {!isCollapsed && (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-terracotta)] shrink-0" />
              <div className="truncate">
                <span className="mono text-[10px] tracking-[0.16em] uppercase text-[var(--ink-tertiary)] block leading-none font-semibold">
                  Workspace
                </span>
                <span className="text-xs font-medium text-[var(--ink-primary)] truncate block leading-tight mt-0.5">
                  {workspaceName}
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={toggleSidebar}
            data-testid="workspace-sidebar-toggle"
            aria-label={isCollapsed ? 'Expand workspace sidebar' : 'Collapse workspace sidebar'}
            title={isCollapsed ? 'Expand workspace sidebar' : 'Collapse workspace sidebar'}
            className={`p-1.5 rounded-lg text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white border border-transparent hover:border-[var(--border-strong)] transition-all cursor-pointer ${
              isCollapsed ? 'mx-auto' : ''
            }`}
          >
            <i
              className={`ph-bold ${
                isCollapsed ? 'ph-caret-right' : 'ph-caret-left'
              } text-xs`}
            />
          </button>
        </div>

        {/* Navigation Destination Links */}
        <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto hyades-scroll" aria-label="Workspace destinations">
          {WORKSPACE_NAV_ITEMS.map((item) => {
            const isActive = currentDestination === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                data-testid={item.testId}
                aria-current={isActive ? 'page' : undefined}
                title={isCollapsed ? item.label : undefined}
                className={`w-full text-left rounded-lg transition-all flex items-center gap-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] ${
                  isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2'
                } ${
                  isActive
                    ? 'bg-white shadow-2xs text-[var(--ink-primary)] border-l-2 border-[var(--accent-terracotta)] pl-2.5 font-medium'
                    : 'text-[var(--ink-secondary)] hover:bg-white/60 hover:text-[var(--ink-primary)] border-l-2 border-transparent'
                }`}
              >
                <i
                  className={`${item.iconClass} text-sm shrink-0 ${
                    isActive ? 'text-[var(--accent-terracotta)]' : 'text-[var(--ink-tertiary)]'
                  }`}
                />
                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium truncate leading-tight">
                        {item.label}
                      </span>
                      {isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-terracotta)] shrink-0" />
                      )}
                    </div>
                    <span className="text-[10px] text-[var(--ink-tertiary)] block truncate leading-none mt-0.5 font-normal">
                      {item.description}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sub-navigation footer note */}
        {!isCollapsed && (
          <div className="p-3 border-t border-[var(--border-parchment)] bg-[var(--bg-canvas)]/50">
            <div className="mono text-[9px] text-[var(--ink-tertiary)] uppercase tracking-wider">
              Contextual Triage
            </div>
            <p className="text-[11px] text-[var(--ink-secondary)] mt-1 leading-snug">
              Research collections, query dialectic, and incoming knowledge sources.
            </p>
          </div>
        )}
      </aside>

      {/* Primary Workspace Viewport Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {children}
      </div>
    </div>
  );
};
