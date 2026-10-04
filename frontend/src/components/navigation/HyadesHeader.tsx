import React, { useState, useRef, useEffect } from 'react';
import { Workspace } from '@/types/workspaces';
import { HealthStatus } from '@/hooks/useHealth';

export type HyadesDestination = 'overview' | 'library' | 'observatory' | 'stella';

interface HyadesHeaderProps {
  currentDestination: HyadesDestination;
  onNavigate: (destination: HyadesDestination) => void;
  workspaces: Workspace[];
  selectedWorkspace: Workspace | null;
  onSelectWorkspace: (workspace: Workspace) => void;
  onOpenAccountModal: () => void;
  onOpenSearch: () => void;
  onNewNote?: () => void;
  onCycleEnvironment?: () => void;
  healthStatus?: HealthStatus;
  onRefreshHealth?: () => void;
}

export const HyadesHeader: React.FC<HyadesHeaderProps> = ({
  currentDestination,
  onNavigate,
  workspaces,
  selectedWorkspace,
  onSelectWorkspace,
  onOpenAccountModal,
  onOpenSearch,
  onNewNote,
  onCycleEnvironment,
  healthStatus,
  onRefreshHealth,
}) => {
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsWorkspaceMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const destinationTitle = {
    overview: 'Overview',
    library: 'Library',
    observatory: 'Observatory',
    stella: 'Stella',
  }[currentDestination];

  return (
    <header className="sticky top-0 z-30 w-full bg-[var(--bg-base)]/85 backdrop-blur-md border-b border-[var(--border-parchment)] px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex items-center justify-between transition-all select-none">
      {/* Left: Branding & Core Navigation */}
      <div className="flex items-center gap-4 sm:gap-6 lg:gap-8">
        <button
          type="button"
          onClick={() => onNavigate('overview')}
          className="flex items-center gap-3 group text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] focus-visible:rounded-lg p-0.5"
          title="Hyades Overview"
        >
          {/* Astrolabe Mark */}
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-midnight)] text-[#FAF8F2] flex items-center justify-center shadow-xs border border-[#2D3F5E] group-hover:bg-[var(--accent-midnight-light)] transition-colors">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              className="transition-transform duration-700 group-hover:rotate-90"
            >
              <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.4" strokeDasharray="2,2" />
              <circle cx="12" cy="12" r="5.5" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.7" />
              <path d="M 12 3.5 L 13.5 10.5 L 20.5 12 L 13.5 13.5 L 12 20.5 L 10.5 13.5 L 3.5 12 L 10.5 10.5 Z" fill="currentColor" />
              <circle cx="12" cy="12" r="1.5" fill="#FAF8F2" />
            </svg>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="serif text-[22px] font-semibold tracking-tight text-[var(--ink-primary)] leading-none">Hyades</span>
            <div className="w-px h-3 bg-[var(--border-strong)] hidden xs:block" />
            <span className="text-[10px] tracking-[0.2em] font-medium text-[var(--ink-secondary)] uppercase hidden xs:inline">
              {destinationTitle}
            </span>
          </div>
        </button>

        {/* Primary Application Destinations */}
        <nav className="flex items-center gap-3 sm:gap-5 lg:gap-7 ml-1" aria-label="Main navigation">
          <button
            type="button"
            aria-label="Overview"
            onClick={() => onNavigate('overview')}
            className={`nav-item flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] focus-visible:rounded-md ${currentDestination === 'overview' ? 'active' : ''}`}
            aria-current={currentDestination === 'overview' ? 'page' : undefined}
          >
            <span>Overview</span>
          </button>
          <button
            type="button"
            aria-label="Library"
            onClick={() => onNavigate('library')}
            className={`nav-item flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] focus-visible:rounded-md ${currentDestination === 'library' ? 'active' : ''}`}
            aria-current={currentDestination === 'library' ? 'page' : undefined}
          >
            <span>Library</span>
          </button>
          <button
            type="button"
            aria-label="Observatory"
            onClick={() => onNavigate('observatory')}
            className={`nav-item group flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] focus-visible:rounded-md ${currentDestination === 'observatory' ? 'active' : ''}`}
            aria-current={currentDestination === 'observatory' ? 'page' : undefined}
          >
            <span>Observatory</span>
            <span className="text-[11px] text-[var(--accent-terracotta)] opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
          </button>
          <button
            type="button"
            aria-label="Stella"
            onClick={() => onNavigate('stella')}
            className={`nav-item flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] focus-visible:rounded-md ${currentDestination === 'stella' ? 'active' : ''}`}
            aria-current={currentDestination === 'stella' ? 'page' : undefined}
          >
            <span>Stella</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-brass)]" />
          </button>
        </nav>
      </div>

      {/* Right: Global Search & Fast Actions */}
      <div className="flex items-center gap-3">
        {/* Workspace Switcher Pill */}
        <div className="relative hidden md:block" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsWorkspaceMenuOpen((prev) => !prev)}
            data-testid="active-workspace-badge"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--ink-secondary)] bg-[var(--bg-panel)] hover:bg-white border border-[var(--border-strong)] transition-colors shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)]"
            title="Switch Workspace"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-terracotta)]" />
            <span className="max-w-[130px] truncate">{selectedWorkspace?.name ?? 'Default Workspace'}</span>
            <i className="ph ph-caret-down text-[10px] opacity-70" />
          </button>

          {isWorkspaceMenuOpen && (
            <div className="absolute top-full right-0 mt-1 w-64 bg-[var(--bg-panel)] border border-[var(--border-strong)] rounded-xl shadow-xl py-1.5 z-50 animate-fade-in">
              <div className="px-3 py-1 text-[10px] mono uppercase tracking-wider text-[var(--ink-tertiary)] border-b border-[var(--border-parchment)]">
                Workspaces
              </div>
              <div className="max-h-56 overflow-y-auto py-1">
                {workspaces.map((ws) => {
                  const isSelected = ws.id === selectedWorkspace?.id;
                  return (
                    <button
                      key={ws.id}
                      type="button"
                      onClick={() => {
                        onSelectWorkspace(ws);
                        setIsWorkspaceMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors focus-visible:outline-none focus-visible:bg-white ${
                        isSelected
                          ? 'bg-white font-medium text-[var(--ink-primary)]'
                          : 'text-[var(--ink-secondary)] hover:bg-white/60 hover:text-[var(--ink-primary)]'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            isSelected ? 'bg-[var(--accent-terracotta)]' : 'bg-[var(--border-strong)]'
                          }`}
                        />
                        <span className="truncate">{ws.name}</span>
                      </div>
                      {isSelected && <span className="mono text-[10px] text-[var(--accent-terracotta)]">Active</span>}
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-[var(--border-parchment)] pt-1 mt-1 px-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsWorkspaceMenuOpen(false);
                    onOpenAccountModal();
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white transition-colors flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)]"
                >
                  <i className="ph ph-gear text-xs text-[var(--accent-midnight)]" />
                  <span>Workspace Settings & Setup</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Backend Telemetry Health Indicator */}
        {healthStatus && (
          <button
            type="button"
            onClick={onRefreshHealth}
            data-testid="health-status"
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs mono text-[var(--ink-secondary)] bg-[var(--bg-panel)] hover:bg-white border border-[var(--border-strong)] transition-colors shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)]"
            title={`Backend: ${healthStatus === 'connected' ? 'Connected' : healthStatus === 'loading' ? 'Loading' : 'Unavailable'}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                healthStatus === 'connected'
                  ? 'bg-emerald-600'
                  : healthStatus === 'loading'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-rose-500'
              }`}
            />
            <span>
              Backend: {healthStatus === 'connected' ? 'Connected' : healthStatus === 'loading' ? 'Loading' : 'Unavailable'}
            </span>
          </button>
        )}

        {/* Global Quick Search Trigger (⌘K) */}
        <button
          type="button"
          onClick={onOpenSearch}
          className="w-9 sm:w-52 md:w-60 px-2 sm:px-3 py-1.5 bg-[var(--bg-panel)] hover:bg-white border border-[var(--border-strong)] rounded-xl flex items-center justify-center sm:justify-between text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-all shadow-2xs group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)]"
          title="Global Search (⌘K)"
          aria-label="Global Search (⌘K)"
        >
          <div className="flex items-center gap-2 truncate">
            <i className="ph ph-magnifying-glass text-sm text-[var(--accent-midnight)] group-hover:scale-105 transition-transform" />
            <span className="text-[12px] truncate hidden sm:inline">Search knowledge base...</span>
          </div>
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded border border-[var(--border-parchment)] bg-[var(--bg-panel-subtle)] text-[10px] mono text-[var(--ink-tertiary)] shrink-0">
            ⌘K
          </kbd>
        </button>

        {/* New Note Action (Hidden on Library where Library's dedicated action is canonical) */}
        {currentDestination !== 'library' && (
          <button
            type="button"
            onClick={onNewNote}
            className="bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] transition-all px-3.5 py-1.5 rounded-lg flex items-center gap-2 shadow-2xs border border-[#233552] text-xs font-medium active:scale-95 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)]"
          >
            <i className="ph ph-plus text-xs text-[var(--accent-brass)]" />
            <span className="hidden sm:inline">New Note</span>
          </button>
        )}

        {/* Architectural Environment Perspective Toggle */}
        {onCycleEnvironment && (
          <div className="relative ml-1">
            <button
              type="button"
              onClick={onCycleEnvironment}
              id="env-toggle-btn"
              className="w-8 h-8 rounded-lg bg-[var(--bg-panel)] hover:bg-white border border-[var(--border-strong)] flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)]"
              title="Toggle background perspective"
            >
              <i className="ph-bold ph-columns text-sm text-[var(--accent-midnight)]" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
