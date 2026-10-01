import React from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { HealthStatus, HEALTH_DISPLAY_TEXT } from '@/hooks/useHealth';
import { Workspace } from '@/types/workspaces';

export type HyadesDestination = 'overview' | 'library' | 'observatory' | 'stella';

interface HyadesHeaderProps {
  currentDestination: HyadesDestination;
  onNavigate: (destination: HyadesDestination) => void;
  workspaces: Workspace[];
  selectedWorkspace: Workspace | null;
  onSelectWorkspace: (workspace: Workspace) => void;
  onOpenAccountModal: () => void;
  onOpenSearch: () => void;
  healthStatus: HealthStatus;
  onRefreshHealth: () => void;
}

export const HyadesHeader: React.FC<HyadesHeaderProps> = ({
  currentDestination,
  onNavigate,
  workspaces,
  selectedWorkspace,
  onSelectWorkspace,
  onOpenAccountModal,
  onOpenSearch,
  healthStatus,
  onRefreshHealth,
}) => {
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsWorkspaceMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const destinations: Array<{ id: HyadesDestination; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'library', label: 'Library' },
    { id: 'observatory', label: 'Observatory' },
    { id: 'stella', label: 'Stella' },
  ];

  return (
    <header className="w-full bg-[#FAF8F2]/95 border-b border-[#DCD6C8] z-30 sticky top-0 backdrop-blur-md transition-all select-none">
      <div className="max-w-[1720px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Left: Brand Mark */}
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => onNavigate('overview')}
            className="flex items-center gap-2.5 text-left group focus:outline-none"
            aria-label="Hyades Home"
          >
            {/* Hyades Celestial Starburst Mark */}
            <div className="w-8 h-8 rounded-lg bg-[#162135] flex items-center justify-center shadow-xs border border-[#C9C2B0] transition-transform group-hover:scale-105">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5Z" fill="#BD532B" />
                <circle cx="12" cy="12" r="3" fill="#FAF8F2" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="serif text-lg font-semibold tracking-wide text-[#1C1917] leading-none">
                HYADES
              </span>
              <span className="mono text-[9px] tracking-widest text-[#878074] uppercase mt-0.5">
                Archival Atlas
              </span>
            </div>
          </button>

          {/* Workspace Switcher Pill */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsWorkspaceMenuOpen((prev) => !prev)}
              data-testid="active-workspace-badge"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-[#575249] bg-[#EFECE4]/80 hover:bg-[#EFECE4] border border-[#DCD6C8] transition-colors focus:outline-none"
              title="Switch Workspace"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#BD532B]" />
              <span className="max-w-[130px] truncate">{selectedWorkspace?.name ?? 'Default Workspace'}</span>
              <ChevronDown size={12} className="text-[#878074]" />
            </button>

            {isWorkspaceMenuOpen && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-[#FAF8F2] border border-[#C9C2B0] rounded-xl shadow-xl py-1.5 z-50 animate-fade-in">
                <div className="px-3 py-1 text-[10px] mono uppercase tracking-wider text-[#878074] border-b border-[#DCD6C8]">
                  Workspaces
                </div>
                <div className="max-h-56 overflow-y-auto hyades-scroll py-1">
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
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-[#EFECE4] transition-colors ${
                          isSelected ? 'font-semibold text-[#BD532B] bg-[#EFECE4]/50' : 'text-[#1C1917]'
                        }`}
                      >
                        <span className="truncate">{ws.name}</span>
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#BD532B]" />}
                      </button>
                    );
                  })}
                </div>
                <div className="border-t border-[#DCD6C8] pt-1 px-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsWorkspaceMenuOpen(false);
                      onOpenAccountModal();
                    }}
                    className="w-full text-left px-2.5 py-1.5 text-xs text-[#575249] hover:text-[#1C1917] hover:bg-[#EFECE4] rounded-md transition-colors"
                  >
                    Manage Workspaces & Accounts →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center: Primary Editorial Navigation */}
        <nav className="flex items-center gap-1 sm:gap-2 h-full" aria-label="Hyades main destinations">
          {destinations.map((dest) => {
            const isActive = currentDestination === dest.id;
            return (
              <button
                key={dest.id}
                type="button"
                onClick={() => onNavigate(dest.id)}
                className={`relative h-14 px-3 sm:px-4 flex items-center text-sm font-medium transition-colors focus:outline-none ${
                  isActive
                    ? 'text-[#1C1917] font-semibold'
                    : 'text-[#878074] hover:text-[#1C1917]'
                }`}
              >
                <span>{dest.label}</span>
                {isActive && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#BD532B] rounded-full transition-all"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right: Global Search Trigger & Health & Profile */}
        <div className="flex items-center gap-3">
          {/* Global Search Pill */}
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EFECE4] hover:bg-[#E5E0D5] border border-[#DCD6C8] text-[#575249] hover:text-[#1C1917] transition-all text-xs focus:outline-none"
            title="Global Search (⌘K)"
          >
            <Search size={13} className="text-[#878074]" />
            <span className="hidden md:inline text-xs">Search knowledge...</span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] mono bg-[#FAF8F2] border border-[#C9C2B0] rounded text-[#878074]">
              ⌘K
            </kbd>
          </button>

          {/* System Health Indicator */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FAF8F2] border border-[#DCD6C8] text-[11px] text-[#575249]"
            title={`System Health: ${HEALTH_DISPLAY_TEXT[healthStatus]}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                healthStatus === 'connected'
                  ? 'bg-emerald-500'
                  : healthStatus === 'loading'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-rose-500'
              }`}
            />
            <span data-testid="health-status" className="hidden lg:inline text-[11px] mono">
              {HEALTH_DISPLAY_TEXT[healthStatus]}
            </span>
            <button
              type="button"
              onClick={onRefreshHealth}
              className="text-[#878074] hover:text-[#1C1917] p-0.5 rounded transition-colors focus:outline-none"
              title="Refresh Health"
            >
              ↻
            </button>
          </div>

          {/* Profile / Account Administration Icon */}
          <button
            type="button"
            onClick={onOpenAccountModal}
            className="w-8 h-8 rounded-full bg-[#162135] text-[#FAF8F2] font-semibold text-xs flex items-center justify-center hover:ring-2 hover:ring-[#BD532B] transition-all focus:outline-none shadow-xs"
            title="Account & Setup"
          >
            RS
          </button>
        </div>
      </div>
    </header>
  );
};
