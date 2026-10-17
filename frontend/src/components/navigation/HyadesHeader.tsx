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
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const navRailRef = useRef<HTMLElement>(null);

  const tabRefs = useRef<{
    overview: HTMLButtonElement | null;
    library: HTMLButtonElement | null;
    observatory: HTMLButtonElement | null;
    stella: HTMLButtonElement | null;
  }>({
    overview: null,
    library: null,
    observatory: null,
    stella: null,
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
    if (isWorkspaceDestination) {
      setIndicatorStyle({ x: 0, width: 0, visible: false });
      return;
    }
    const activeTab = tabRefs.current[currentDestination as 'overview' | 'library' | 'observatory' | 'stella'];
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
      if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(target)) {
        setIsWorkspaceMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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

  const handleSelectNav = (dest: HyadesDestination) => {
    setIsWorkspaceMenuOpen(false);
    setIsMobileDrawerOpen(false);
    onNavigate(dest);
  };

  return (
    <header className="hyades-header sticky top-2 sm:top-3 z-40 w-full px-3 sm:px-6 pointer-events-none select-none transition-all flex justify-center">
      <div className="w-full max-w-7xl bg-[#FAF8F2]/92 backdrop-blur-md border border-[var(--border-parchment)] shadow-sm rounded-full px-3.5 sm:px-4 py-1.5 flex items-center justify-between pointer-events-auto transition-all">
        
        {/* Left Segment: Brand Logo + Section Tag */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 min-w-0">
          <button
            type="button"
            onClick={() => setIsMobileDrawerOpen(true)}
            data-testid="mobile-nav-toggle"
            aria-label="Open mobile navigation drawer"
            className="md:hidden p-1 rounded-full text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white border border-[var(--border-strong)] transition-colors cursor-pointer shrink-0"
          >
            <i className="ph-bold ph-list text-sm" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('overview')}
            className="flex items-center gap-2 group text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] focus-visible:rounded-full p-0.5"
            title="Hyades"
          >
            <div className="w-7 h-7 rounded-full bg-[var(--accent-midnight)] text-[#FAF8F2] flex items-center justify-center shadow-xs border border-[#2D3F5E] group-hover:bg-[var(--accent-midnight-light)] transition-colors shrink-0">
              <svg
                width="16"
                height="16"
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
            <div className="flex items-baseline gap-1.5 truncate">
              <span className="serif text-lg font-semibold tracking-tight text-[var(--ink-primary)] leading-none">Hyades</span>
              <div className="w-px h-3 bg-[var(--border-parchment)] hidden sm:block" />
              <span className="text-[9px] tracking-[0.18em] font-medium text-[var(--ink-secondary)] uppercase hidden sm:inline">
                {destinationTitle[currentDestination]}
              </span>
            </div>
          </button>
        </div>

        {/* Center Segment: Core Navigation Rail (Ivory Observatory Pill Style) */}
        <nav
          ref={navRailRef}
          className="nav-rail hidden md:flex items-center gap-1 sm:gap-2 px-1.5 py-0.5 bg-white/60 border border-[var(--border-parchment)] rounded-full relative shadow-2xs"
          aria-label="Main navigation"
        >
          <button
            ref={(el) => { tabRefs.current.overview = el; }}
            type="button"
            data-testid="nav-item-overview"
            aria-label="Overview"
            onClick={() => onNavigate('overview')}
            className={`nav-item px-3 py-1 text-xs rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] ${
              currentDestination === 'overview'
                ? 'active font-semibold text-[var(--ink-primary)] bg-white shadow-2xs'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white/50'
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
            className={`nav-item px-3 py-1 text-xs rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] ${
              currentDestination === 'library'
                ? 'active font-semibold text-[var(--ink-primary)] bg-white shadow-2xs'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white/50'
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
            className={`nav-item px-3 py-1 text-xs rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] ${
              currentDestination === 'observatory'
                ? 'active font-semibold text-[var(--ink-primary)] bg-white shadow-2xs'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white/50'
            }`}
            aria-current={currentDestination === 'observatory' ? 'page' : undefined}
          >
            <span>Observatory</span>
          </button>

          <button
            ref={(el) => { tabRefs.current.stella = el; }}
            type="button"
            data-testid="nav-item-stella"
            aria-label="Stella"
            onClick={() => onNavigate('stella')}
            className={`nav-item px-3 py-1 text-xs rounded-full transition-colors cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] ${
              currentDestination === 'stella'
                ? 'active font-semibold text-[var(--ink-primary)] bg-white shadow-2xs'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white/50'
            }`}
            aria-current={currentDestination === 'stella' ? 'page' : undefined}
          >
            <span>Stella</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-brass)]" />
          </button>

          {/* Gliding terracotta underline indicator */}
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

        {/* Right Segment: Single Clear Workspace Selector + Global Actions */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          
          {/* Single Unified Workspace Selector & Resources Menu */}
          <div className="relative" ref={workspaceMenuRef}>
            <button
              type="button"
              data-testid="nav-workspace-trigger"
              aria-label="Workspace Resources and Selector Menu"
              aria-expanded={isWorkspaceMenuOpen}
              aria-haspopup="true"
              onClick={() => setIsWorkspaceMenuOpen((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-xs transition-all border cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] ${
                isWorkspaceDestination
                  ? 'bg-white font-medium text-[var(--ink-primary)] border-[var(--accent-terracotta)] shadow-2xs'
                  : 'bg-white/80 hover:bg-white text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] border-[var(--border-strong)]'
              }`}
              title="Workspace Resources & Switcher"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-terracotta)] shrink-0" />
              <span
                data-testid="active-workspace-badge"
                className="max-w-[130px] sm:max-w-[180px] truncate font-medium text-[var(--ink-primary)]"
              >
                {isWorkspaceDestination
                  ? `Workspace: ${destinationTitle[currentDestination]}`
                  : `Workspace: ${selectedWorkspace?.name ?? 'Default'}`}
              </span>
              <i className={`ph ph-caret-down text-[10px] opacity-70 transition-transform duration-200 ${isWorkspaceMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Unified Workspace Dropdown Menu */}
            {isWorkspaceMenuOpen && (
              <div
                data-testid="nav-workspace-menu"
                className="absolute top-full right-0 mt-2 w-72 bg-[var(--bg-panel)] border border-[var(--border-strong)] rounded-2xl shadow-xl py-2 z-50 animate-fade-in select-none"
                role="menu"
                aria-orientation="vertical"
              >
                {/* Active Workspace Header */}
                <div className="px-3.5 py-1.5 border-b border-[var(--border-parchment)] flex items-center justify-between">
                  <div className="min-w-0">
                    <span className="mono text-[9px] uppercase tracking-wider text-[var(--ink-tertiary)] block font-semibold">
                      Active Workspace
                    </span>
                    <span className="text-xs font-semibold text-[var(--ink-primary)] truncate block mt-0.5">
                      {selectedWorkspace?.name ?? 'Default Workspace'}
                    </span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded-full bg-[#FAF8F2] border border-[var(--border-parchment)] text-[10px] mono text-[var(--accent-terracotta)] font-semibold">
                    Active
                  </span>
                </div>

                {/* Group 1: Workspace Resources (Collections, Threads, Inbox) */}
                <div className="px-3.5 pt-2 pb-1 text-[10px] mono uppercase tracking-wider text-[var(--ink-tertiary)] font-semibold flex items-center justify-between">
                  <span>Workspace Resources</span>
                  <span className="text-[9px] mono text-[var(--accent-midnight)]">3 Items</span>
                </div>

                <div className="py-0.5">
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="header-workspace-collections"
                    onClick={() => handleSelectNav('collections')}
                    className={`w-full text-left px-3.5 py-2 flex items-start gap-2.5 transition-colors cursor-pointer hover:bg-white focus-visible:outline-none focus-visible:bg-white ${
                      currentDestination === 'collections'
                        ? 'bg-white font-medium text-[var(--ink-primary)] border-l-2 border-[var(--accent-terracotta)] pl-3'
                        : 'text-[var(--ink-secondary)]'
                    }`}
                  >
                    <i className="ph-bold ph-folders text-base text-[var(--accent-terracotta)] mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[var(--ink-primary)]">Collections</span>
                        {currentDestination === 'collections' && (
                          <span className="mono text-[9px] text-[var(--accent-terracotta)] font-semibold">Active</span>
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
                    onClick={() => handleSelectNav('threads')}
                    className={`w-full text-left px-3.5 py-2 flex items-start gap-2.5 transition-colors cursor-pointer hover:bg-white focus-visible:outline-none focus-visible:bg-white ${
                      currentDestination === 'threads'
                        ? 'bg-white font-medium text-[var(--ink-primary)] border-l-2 border-[var(--accent-terracotta)] pl-3'
                        : 'text-[var(--ink-secondary)]'
                    }`}
                  >
                    <i className="ph-bold ph-chat-centered-text text-base text-[var(--accent-midnight)] mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[var(--ink-primary)]">Threads</span>
                        {currentDestination === 'threads' && (
                          <span className="mono text-[9px] text-[var(--accent-terracotta)] font-semibold">Active</span>
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
                    onClick={() => handleSelectNav('inbox')}
                    className={`w-full text-left px-3.5 py-2 flex items-start gap-2.5 transition-colors cursor-pointer hover:bg-white focus-visible:outline-none focus-visible:bg-white ${
                      currentDestination === 'inbox'
                        ? 'bg-white font-medium text-[var(--ink-primary)] border-l-2 border-[var(--accent-terracotta)] pl-3'
                        : 'text-[var(--ink-secondary)]'
                    }`}
                  >
                    <i className="ph-bold ph-tray text-base text-[var(--accent-brass)] mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[var(--ink-primary)]">Knowledge Inbox</span>
                        {currentDestination === 'inbox' && (
                          <span className="mono text-[9px] text-[var(--accent-terracotta)] font-semibold">Active</span>
                        )}
                      </div>
                      <span className="text-[11px] text-[var(--ink-tertiary)] leading-tight block">
                        Incoming sources, dry-run reviews & status triage
                      </span>
                    </div>
                  </button>
                </div>

                {/* Group 2: Workspaces List (if more than 1) */}
                {workspaces.length > 1 && (
                  <div className="border-t border-[var(--border-parchment)] pt-1.5 mt-1">
                    <div className="px-3.5 py-1 text-[10px] mono uppercase tracking-wider text-[var(--ink-tertiary)] font-semibold">
                      Switch Workspace
                    </div>
                    <div className="max-h-40 overflow-y-auto py-0.5">
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
                            className={`w-full text-left px-3.5 py-1.5 text-xs flex items-center justify-between transition-colors focus-visible:outline-none focus-visible:bg-white cursor-pointer ${
                              isSelected
                                ? 'bg-white font-semibold text-[var(--ink-primary)]'
                                : 'text-[var(--ink-secondary)] hover:bg-white/60 hover:text-[var(--ink-primary)]'
                            }`}
                          >
                            <span className="truncate">{ws.name}</span>
                            {isSelected && <span className="mono text-[9px] text-[var(--accent-terracotta)] font-semibold">Active</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Group 3: Setup & Settings */}
                <div className="border-t border-[var(--border-parchment)] pt-1.5 mt-1 px-2">
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

          {/* Global Search Pill */}
          <button
            type="button"
            onClick={onOpenSearch}
            className="px-2 sm:px-2.5 py-1 bg-white/80 hover:bg-white border border-[var(--border-strong)] rounded-full flex items-center gap-1.5 text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-all shadow-2xs group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] cursor-pointer"
            title="Global Search (⌘K)"
            aria-label="Global Search (⌘K)"
          >
            <i className="ph ph-magnifying-glass text-xs text-[var(--accent-midnight)] group-hover:scale-110 transition-transform" />
            <span className="text-[11px] hidden sm:inline text-[var(--ink-tertiary)] group-hover:text-[var(--ink-secondary)]">Search...</span>
            <kbd className="hidden sm:inline-block px-1 py-0.2 rounded border border-[var(--border-parchment)] bg-[var(--bg-panel-subtle)] text-[9px] mono text-[var(--ink-tertiary)]">
              ⌘K
            </kbd>
          </button>

          {/* Quick Action: New Note */}
          {currentDestination !== 'library' && onNewNote && (
            <button
              type="button"
              onClick={onNewNote}
              className="bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] transition-all px-2.5 py-1 rounded-full flex items-center gap-1 shadow-2xs border border-[#233552] text-xs font-medium active:scale-95 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] cursor-pointer"
              title="Create a new note"
            >
              <i className="ph ph-plus text-xs text-[var(--accent-brass)]" />
              <span className="hidden sm:inline text-xs">Note</span>
            </button>
          )}

          {/* Health Status Indicator */}
          {healthStatus && (
            <button
              type="button"
              onClick={onRefreshHealth}
              data-testid="health-status"
              className="w-6 h-6 rounded-full flex items-center justify-center bg-white/80 hover:bg-white border border-[var(--border-strong)] shadow-2xs transition-colors cursor-pointer"
              title={`Backend: ${healthStatus === 'connected' ? 'Connected' : healthStatus === 'loading' ? 'Loading' : 'Unavailable'}`}
              aria-label={`Backend: ${healthStatus === 'connected' ? 'Connected' : healthStatus === 'loading' ? 'Loading' : 'Unavailable'}`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  healthStatus === 'connected'
                    ? 'bg-emerald-600'
                    : healthStatus === 'loading'
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-rose-500'
                }`}
              />
              <span className="sr-only">
                {`Backend: ${healthStatus === 'connected' ? 'Connected' : healthStatus === 'loading' ? 'Loading' : 'Unavailable'}`}
              </span>
            </button>
          )}

          {/* Account Profile Trigger */}
          <button
            type="button"
            onClick={onOpenAccountModal}
            data-testid="profile-bottom-left-btn"
            title="Account & Setup"
            aria-label="Account & Setup"
            className="w-7 h-7 rounded-full bg-[var(--accent-midnight)] text-[#FAF8F2] flex items-center justify-center font-serif text-[10px] font-semibold hover:bg-[var(--accent-midnight-light)] transition-colors shadow-2xs border border-[#2D3F5E] cursor-pointer"
          >
            RS
          </button>

          {/* Environment/Perspective Cycle */}
          {onCycleEnvironment && (
            <button
              type="button"
              onClick={onCycleEnvironment}
              id="env-toggle-btn"
              className="w-7 h-7 rounded-full bg-white/80 hover:bg-white border border-[var(--border-strong)] flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors shadow-2xs cursor-pointer"
              title="Toggle archival canvas perspective"
              aria-label="Toggle archival canvas perspective"
            >
              <i className="ph-bold ph-columns text-xs text-[var(--accent-midnight)]" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Mobile Navigation Drawer (< md viewports) */}
      {isMobileDrawerOpen && (
        <div
          data-testid="mobile-nav-drawer"
          className="fixed inset-0 z-50 flex md:hidden pointer-events-auto"
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
                        onClick={() => handleSelectNav(dest)}
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
                  Workspace Resources
                </div>
                <div className="space-y-1">
                  {(['collections', 'threads', 'inbox'] as HyadesDestination[]).map((dest) => {
                    const isActive = currentDestination === dest;
                    return (
                      <button
                        key={dest}
                        type="button"
                        data-testid={`mobile-nav-${dest}`}
                        onClick={() => handleSelectNav(dest)}
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
                          <span className="capitalize">{dest}</span>
                        </div>
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-terracotta)]" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[var(--border-parchment)] space-y-2">
              <div className="text-xs text-[var(--ink-secondary)] px-2 font-medium">
                Workspace: {selectedWorkspace?.name ?? 'Default Workspace'}
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsMobileDrawerOpen(false);
                  onOpenAccountModal();
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white transition-colors flex items-center gap-2"
              >
                <i className="ph ph-gear text-xs text-[var(--accent-midnight)]" />
                <span>Account & Workspace Settings</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
