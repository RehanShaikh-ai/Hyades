import React, { useState, useRef, useEffect } from 'react';
import { Workspace } from '@/types/workspaces';
import { HealthStatus } from '@/hooks/useHealth';

export type HyadesDestination =
  | 'overview'
  | 'library'
  | 'observatory'
  | 'stella'
  | 'collections'
  | 'threads'
  | 'inbox';

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
  const [isWorkspaceNavOpen, setIsWorkspaceNavOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const workspaceSwitcherRef = useRef<HTMLDivElement>(null);
  const workspaceNavRef = useRef<HTMLDivElement>(null);
  const navRailRef = useRef<HTMLElement>(null);

  const tabRefs = useRef<{
    overview: HTMLButtonElement | null;
    library: HTMLButtonElement | null;
    observatory: HTMLButtonElement | null;
    stella: HTMLButtonElement | null;
    workspace: HTMLButtonElement | null;
  }>({
    overview: null,
    library: null,
    observatory: null,
    stella: null,
    workspace: null,
  });

  const [indicatorStyle, setIndicatorStyle] = useState<{ x: number; width: number; visible: boolean }>({
    x: 0,
    width: 0,
    visible: false,
  });

  const isWorkspaceDestination =
    currentDestination === 'collections' ||
    currentDestination === 'threads' ||
    currentDestination === 'inbox';

  const updateIndicator = () => {
    const activeTab = isWorkspaceDestination
      ? tabRefs.current.workspace
      : tabRefs.current[currentDestination as 'overview' | 'library' | 'observatory' | 'stella'];
    const rail = navRailRef.current;
    if (activeTab && rail) {
      const railRect = rail.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();
      setIndicatorStyle({
        x: tabRect.left - railRect.left,
        width: tabRect.width,
        visible: true,
      });
    }
  };

  useEffect(() => {
    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [currentDestination, isWorkspaceDestination]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (workspaceSwitcherRef.current && !workspaceSwitcherRef.current.contains(target)) {
        setIsWorkspaceMenuOpen(false);
      }
      if (workspaceNavRef.current && !workspaceNavRef.current.contains(target)) {
        setIsWorkspaceNavOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsWorkspaceNavOpen(false);
        setIsWorkspaceMenuOpen(false);
        setIsMobileDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const destinationTitle: Record<HyadesDestination, string> = {
    overview: 'Overview',
    library: 'Library',
    observatory: 'Observatory',
    stella: 'Stella',
    collections: 'Collections',
    threads: 'Threads',
    inbox: 'Inbox',
  };

  const handleSelectWorkspaceNav = (dest: HyadesDestination) => {
    setIsWorkspaceNavOpen(false);
    setIsMobileDrawerOpen(false);
    onNavigate(dest);
  };

  return (
    <header className="hyades-header sticky top-0 z-30 w-full bg-[var(--bg-base)]/85 backdrop-blur-md border-b border-[var(--border-parchment)] px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex items-center justify-between transition-all select-none">
      <div className="flex items-center gap-3 sm:gap-6 lg:gap-8 min-w-0">
        <button
          type="button"
          onClick={() => setIsMobileDrawerOpen(true)}
          data-testid="mobile-nav-toggle"
          aria-label="Open mobile navigation drawer"
          className="md:hidden p-1.5 rounded-lg text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white border border-[var(--border-strong)] shadow-2xs transition-colors cursor-pointer"
        >
          <i className="ph-bold ph-list text-base" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate('overview')}
          className="flex items-center gap-2.5 group text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] focus-visible:rounded-lg p-0.5"
          title="Hyades Overview"
        >
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-midnight)] text-[#FAF8F2] flex items-center justify-center shadow-xs border border-[#2D3F5E] group-hover:bg-[var(--accent-midnight-light)] transition-colors shrink-0">
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
          <div className="flex items-baseline gap-2 truncate">
            <span className="serif text-[22px] font-semibold tracking-tight text-[var(--ink-primary)] leading-none">Hyades</span>
            <div className="w-px h-3 bg-[var(--border-strong)] hidden sm:block" />
            <span className="text-[10px] tracking-[0.2em] font-medium text-[var(--ink-secondary)] uppercase hidden sm:inline">
              {destinationTitle[currentDestination]}
            </span>
          </div>
        </button>

        <nav ref={navRailRef} className="nav-rail hidden md:flex items-center gap-3 lg:gap-6 ml-1" aria-label="Main navigation">
          <button
            ref={(el) => { tabRefs.current.overview = el; }}
            type="button"
            data-testid="nav-item-overview"
            aria-label="Overview"
            onClick={() => onNavigate('overview')}
            className={`nav-item flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] focus-visible:rounded-md cursor-pointer ${
              currentDestination === 'overview' ? 'active font-semibold text-[var(--ink-primary)]' : ''
            }`}
            aria-current={currentDestination === 'overview' ? 'page' : undefined}
          >
            <span>Overview</span>
          </button>

          <button
            ref={(el) => { tabRefs.current.library = el; }}
            type="button"
            data-testid="nav-item-library"
            aria-label="Library"
            onClick={() => onNavigate('library')}
            className={`nav-item flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] focus-visible:rounded-md cursor-pointer ${
              currentDestination === 'library' ? 'active font-semibold text-[var(--ink-primary)]' : ''
            }`}
            aria-current={currentDestination === 'library' ? 'page' : undefined}
          >
            <span>Library</span>
          </button>

          <button
            ref={(el) => { tabRefs.current.observatory = el; }}
            type="button"
            data-testid="nav-item-observatory"
            aria-label="Observatory"
            onClick={() => onNavigate('observatory')}
            className={`nav-item group flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] focus-visible:rounded-md cursor-pointer ${
              currentDestination === 'observatory' ? 'active font-semibold text-[var(--ink-primary)]' : ''
            }`}
            aria-current={currentDestination === 'observatory' ? 'page' : undefined}
          >
            <span>Observatory</span>
            <span className="text-[11px] text-[var(--accent-terracotta)] opacity-0 group-hover:opacity-100 transition-opacity">✦</span>
          </button>

          <button
            ref={(el) => { tabRefs.current.stella = el; }}
            type="button"
            data-testid="nav-item-stella"
            aria-label="Stella"
            onClick={() => onNavigate('stella')}
            className={`nav-item flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] focus-visible:rounded-md cursor-pointer ${
              currentDestination === 'stella' ? 'active font-semibold text-[var(--ink-primary)]' : ''
            }`}
            aria-current={currentDestination === 'stella' ? 'page' : undefined}
          >
            <span>Stella</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-brass)]" />
          </button>

          <div className="relative" ref={workspaceNavRef}>
            <button
              ref={(el) => { tabRefs.current.workspace = el; }}
              type="button"
              data-testid="nav-workspace-trigger"
              aria-label="Workspace Destinations Menu"
              aria-expanded={isWorkspaceNavOpen}
              aria-haspopup="true"
              onClick={() => setIsWorkspaceNavOpen((prev) => !prev)}
              className={`nav-item flex items-center gap-1.5 py-1 px-2 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] ${
                isWorkspaceDestination
                  ? 'active font-semibold text-[var(--ink-primary)] bg-white/60 shadow-2xs'
                  : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white/40'
              }`}
              aria-current={isWorkspaceDestination ? 'page' : undefined}
            >
              <div className="flex items-center gap-1">
                <span>
                  {isWorkspaceDestination
                    ? `Workspace: ${destinationTitle[currentDestination]}`
                    : 'Workspace'}
                </span>
                {isWorkspaceDestination && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-terracotta)]" />
                )}
              </div>
              <i
                className={`ph-bold ph-caret-down text-[10px] transition-transform duration-200 ${
                  isWorkspaceNavOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isWorkspaceNavOpen && (
              <div
                data-testid="nav-workspace-menu"
                className="absolute top-full left-0 mt-2 w-64 bg-[var(--bg-panel)] border border-[var(--border-strong)] rounded-xl shadow-xl py-2 z-50 animate-fade-in"
                role="menu"
                aria-orientation="vertical"
              >
                <div className="px-3.5 py-1 text-[10px] mono uppercase tracking-wider text-[var(--ink-tertiary)] border-b border-[var(--border-parchment)] font-semibold flex items-center justify-between">
                  <span>Workspace Context</span>
                  <span className="text-[9px] mono text-[var(--accent-terracotta)]">3 Tools</span>
                </div>

                <div className="py-1">
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="header-workspace-collections"
                    onClick={() => handleSelectWorkspaceNav('collections')}
                    className={`w-full text-left px-3.5 py-2.5 flex items-start gap-3 transition-colors cursor-pointer hover:bg-white focus-visible:outline-none focus-visible:bg-white ${
                      currentDestination === 'collections'
                        ? 'bg-white font-medium text-[var(--ink-primary)] border-l-2 border-[var(--accent-terracotta)] pl-3'
                        : 'text-[var(--ink-secondary)]'
                    }`}
                  >
                    <i className="ph-bold ph-folders text-base text-[var(--accent-terracotta)] mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[var(--ink-primary)]">Collections</span>
                        {currentDestination === 'collections' && (
                          <span className="mono text-[10px] text-[var(--accent-terracotta)]">Active</span>
                        )}
                      </div>
                      <span className="text-[11px] text-[var(--ink-tertiary)] leading-tight block">
                        Curated dossiers, sources & thematic groupings
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    data-testid="header-workspace-threads"
                    onClick={() => handleSelectWorkspaceNav('threads')}
                    className={`w-full text-left px-3.5 py-2.5 flex items-start gap-3 transition-colors cursor-pointer hover:bg-white focus-visible:outline-none focus-visible:bg-white ${
                      currentDestination === 'threads'
                        ? 'bg-white font-medium text-[var(--ink-primary)] border-l-2 border-[var(--accent-terracotta)] pl-3'
                        : 'text-[var(--ink-secondary)]'
                    }`}
                  >
                    <i className="ph-bold ph-chat-centered-text text-base text-[var(--accent-midnight)] mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[var(--ink-primary)]">Threads</span>
                        {currentDestination === 'threads' && (
                          <span className="mono text-[10px] text-[var(--accent-terracotta)]">Active</span>
                        )}
                      </div>
                      <span className="text-[11px] text-[var(--ink-tertiary)] leading-tight block">
                        Inquiry tracks, questions & dialectical synthesis
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    data-testid="header-workspace-inbox"
                    onClick={() => handleSelectWorkspaceNav('inbox')}
                    className={`w-full text-left px-3.5 py-2.5 flex items-start gap-3 transition-colors cursor-pointer hover:bg-white focus-visible:outline-none focus-visible:bg-white ${
                      currentDestination === 'inbox'
                        ? 'bg-white font-medium text-[var(--ink-primary)] border-l-2 border-[var(--accent-terracotta)] pl-3'
                        : 'text-[var(--ink-secondary)]'
                    }`}
                  >
                    <i className="ph-bold ph-tray text-base text-[var(--accent-brass)] mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[var(--ink-primary)]">Knowledge Inbox</span>
                        {currentDestination === 'inbox' && (
                          <span className="mono text-[10px] text-[var(--accent-terracotta)]">Active</span>
                        )}
                      </div>
                      <span className="text-[11px] text-[var(--ink-tertiary)] leading-tight block">
                        Incoming sources, dry-run reviews & status triage
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

          <span
            className="nav-indicator"
            style={{
              transform: `translateX(${indicatorStyle.x}px)`,
              width: `${indicatorStyle.width}px`,
              opacity: indicatorStyle.visible ? 1 : 0,
            }}
            aria-hidden="true"
          />
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div className="relative hidden lg:block" ref={workspaceSwitcherRef}>
          <button
            type="button"
            onClick={() => setIsWorkspaceMenuOpen((prev) => !prev)}
            data-testid="active-workspace-badge"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--ink-secondary)] bg-[var(--bg-panel)] hover:bg-white border border-[var(--border-strong)] transition-colors shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] cursor-pointer"
            title="Switch Workspace"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-terracotta)]" />
            <span className="max-w-[130px] truncate">{selectedWorkspace?.name ?? 'Default Workspace'}</span>
            <i className="ph ph-caret-down text-[10px] opacity-70" />
          </button>

          {isWorkspaceMenuOpen && (
            <div className="absolute top-full right-0 mt-1 w-64 bg-[var(--bg-panel)] border border-[var(--border-strong)] rounded-xl shadow-xl py-1.5 z-50 animate-fade-in">
              <div className="px-3 py-1 text-[10px] mono uppercase tracking-wider text-[var(--ink-tertiary)] border-b border-[var(--border-parchment)] font-semibold">
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
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors focus-visible:outline-none focus-visible:bg-white cursor-pointer ${
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
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white transition-colors flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] cursor-pointer"
                >
                  <i className="ph ph-gear text-xs text-[var(--accent-midnight)]" />
                  <span>Workspace Settings & Setup</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {healthStatus && (
          <button
            type="button"
            onClick={onRefreshHealth}
            data-testid="health-status"
            className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs mono text-[var(--ink-secondary)] bg-[var(--bg-panel)] hover:bg-white border border-[var(--border-strong)] transition-colors shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] cursor-pointer"
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

        <button
          type="button"
          onClick={onOpenAccountModal}
          data-testid="profile-bottom-left-btn"
          title="Account & Setup"
          className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--ink-secondary)] bg-[var(--bg-panel)] hover:bg-white border border-[var(--border-strong)] transition-colors shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] cursor-pointer"
        >
          <div className="w-5 h-5 rounded-full bg-[var(--accent-midnight)] text-[#FAF8F2] flex items-center justify-center font-serif text-[10px] font-semibold">
            RS
          </div>
          <span className="hidden xl:inline text-xs font-medium text-[var(--ink-primary)]">Account</span>
          <i className="ph ph-gear text-xs text-[var(--ink-tertiary)]" />
        </button>

        <button
          type="button"
          onClick={onOpenSearch}
          className="w-9 sm:w-48 lg:w-56 px-2 sm:px-3 py-1.5 bg-[var(--bg-panel)] hover:bg-white border border-[var(--border-strong)] rounded-xl flex items-center justify-center sm:justify-between text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-all shadow-2xs group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] cursor-pointer"
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

        {currentDestination !== 'library' && onNewNote && (
          <button
            type="button"
            onClick={onNewNote}
            className="bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] transition-all px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs border border-[#233552] text-xs font-medium active:scale-95 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] cursor-pointer"
          >
            <i className="ph ph-plus text-xs text-[var(--accent-brass)]" />
            <span className="hidden sm:inline">New Note</span>
          </button>
        )}

        {onCycleEnvironment && (
          <button
            type="button"
            onClick={onCycleEnvironment}
            id="env-toggle-btn"
            className="w-8 h-8 rounded-lg bg-[var(--bg-panel)] hover:bg-white border border-[var(--border-strong)] flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] cursor-pointer"
            title="Toggle background perspective"
          >
            <i className="ph-bold ph-columns text-sm text-[var(--accent-midnight)]" />
          </button>
        )}
      </div>

      {/* Collapsible Mobile Navigation Drawer (< md viewports) */}
      {isMobileDrawerOpen && (
        <div
          data-testid="mobile-nav-drawer"
          className="fixed inset-0 z-50 flex md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation"
        >
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileDrawerOpen(false)}
            aria-hidden="true"
          />

          <div className="relative w-72 max-w-[85vw] bg-[var(--bg-panel)] border-r border-[var(--border-strong)] shadow-2xl h-full flex flex-col z-10 animate-fade-in p-4 select-none">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-parchment)]">
              <div className="flex items-center gap-2">
                <span className="serif text-lg font-semibold text-[var(--ink-primary)]">Hyades</span>
                <span className="text-[10px] mono tracking-wider uppercase text-[var(--ink-tertiary)]">Navigation</span>
              </div>
              <button
                type="button"
                data-testid="close-mobile-nav"
                onClick={() => setIsMobileDrawerOpen(false)}
                className="p-1 rounded-md text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white cursor-pointer"
                aria-label="Close navigation drawer"
              >
                <i className="ph-bold ph-x text-base" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-5">
              <div>
                <div className="mono text-[10px] tracking-wider uppercase text-[var(--ink-tertiary)] font-semibold px-2 mb-1.5">
                  Core Destinations
                </div>
                <div className="space-y-1">
                  {(['overview', 'library', 'observatory', 'stella'] as HyadesDestination[]).map((dest) => {
                    const isActive = currentDestination === dest;
                    return (
                      <button
                        key={dest}
                        type="button"
                        data-testid={`mobile-nav-${dest}`}
                        onClick={() => handleSelectWorkspaceNav(dest)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-white font-semibold text-[var(--ink-primary)] shadow-2xs border-l-2 border-[var(--accent-terracotta)] pl-2.5'
                            : 'text-[var(--ink-secondary)] hover:bg-white/60 hover:text-[var(--ink-primary)]'
                        }`}
                      >
                        <span className="capitalize">{dest}</span>
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-terracotta)]" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mono text-[10px] tracking-wider uppercase text-[var(--ink-tertiary)] font-semibold px-2 mb-1.5">
                  Workspace Tools
                </div>
                <div className="space-y-1">
                  {(['collections', 'threads', 'inbox'] as HyadesDestination[]).map((dest) => {
                    const isActive = currentDestination === dest;
                    return (
                      <button
                        key={dest}
                        type="button"
                        data-testid={`mobile-nav-${dest}`}
                        onClick={() => handleSelectWorkspaceNav(dest)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-white font-semibold text-[var(--ink-primary)] shadow-2xs border-l-2 border-[var(--accent-terracotta)] pl-2.5'
                            : 'text-[var(--ink-secondary)] hover:bg-white/60 hover:text-[var(--ink-primary)]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <i
                            className={`${
                              dest === 'collections'
                                ? 'ph-bold ph-folders text-[var(--accent-terracotta)]'
                                : dest === 'threads'
                                ? 'ph-bold ph-chat-centered-text text-[var(--accent-midnight)]'
                                : 'ph-bold ph-tray text-[var(--accent-brass)]'
                            } text-sm`}
                          />
                          <span className="capitalize">{dest === 'inbox' ? 'Knowledge Inbox' : dest}</span>
                        </div>
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-terracotta)]" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[var(--border-parchment)] space-y-2">
              <button
                type="button"
                onClick={() => {
                  setIsMobileDrawerOpen(false);
                  onOpenAccountModal();
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white transition-colors flex items-center gap-2 cursor-pointer border border-[var(--border-strong)]"
              >
                <i className="ph ph-gear text-sm text-[var(--accent-midnight)]" />
                <span>Account & Workspace Settings</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
