import React, { useState } from 'react';
import { WorkspaceNav, WorkspaceSection } from './WorkspaceNav';
import { StarField } from './StarField';
import { HealthStatus, HEALTH_DISPLAY_TEXT } from '@/hooks/useHealth';
import { Workspace } from '@/types/workspaces';
import { cn } from '@/lib/utils';
import { Menu, RefreshCw, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

export interface AppShellProps {
  activeSection: WorkspaceSection;
  onSelectSection: (section: WorkspaceSection) => void;
  selectedWorkspace?: Workspace | null;
  onOpenWorkspaceSwitcher?: () => void;
  healthStatus?: HealthStatus;
  onRefreshHealth?: () => void;
  badgeCounts?: Partial<Record<WorkspaceSection, number>>;
  children: React.ReactNode;
  headerContent?: React.ReactNode;
  className?: string;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeSection,
  onSelectSection,
  selectedWorkspace,
  onOpenWorkspaceSwitcher,
  healthStatus = 'connected',
  onRefreshHealth,
  badgeCounts = {},
  children,
  headerContent,
  className,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div
      className={cn(
        'app-shell relative flex h-screen w-screen overflow-hidden bg-[#030407] text-slate-100 font-sans',
        className
      )}
      data-testid="app-shell"
    >
      {/* Dynamic Starfield Background */}
      <StarField />

      {/* Desktop Navigation Sidebar */}
      <div className="hidden md:flex h-full flex-shrink-0 relative z-20">
        <WorkspaceNav
          activeSection={activeSection}
          onSelectSection={onSelectSection}
          selectedWorkspace={selectedWorkspace}
          onOpenWorkspaceSwitcher={onOpenWorkspaceSwitcher}
          badgeCounts={badgeCounts}
          collapsed={collapsed}
        />
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="md:hidden fixed inset-y-0 left-0 z-50">
            <WorkspaceNav
              activeSection={activeSection}
              onSelectSection={(sec) => {
                onSelectSection(sec);
                setMobileMenuOpen(false);
              }}
              selectedWorkspace={selectedWorkspace}
              onOpenWorkspaceSwitcher={() => {
                setMobileMenuOpen(false);
                onOpenWorkspaceSwitcher?.();
              }}
              badgeCounts={badgeCounts}
              collapsed={false}
            />
          </div>
        </>
      )}

      {/* Main App Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative z-10">
        {/* Top App Bar */}
        <header
          className="h-12 border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-md px-4 flex items-center justify-between flex-shrink-0"
          data-testid="app-shell-header"
        >
          <div className="flex items-center gap-3">
            {/* Mobile menu toggle button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors"
              aria-label="Toggle navigation menu"
            >
              <Menu size={18} />
            </button>

            {/* Desktop collapse sidebar toggle */}
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              className="hidden md:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>

            {/* Section / Workspace Context Title */}
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <span className="text-slate-400">Knowledge Atlas</span>
              <span className="text-slate-400">/</span>
              <span className="text-slate-100 uppercase tracking-wide font-mono text-[11px]">
                {activeSection}
              </span>
            </div>
          </div>

          {/* Header Action Slots + System Health */}
          <div className="flex items-center gap-3">
            {headerContent}

            {/* Health indicator */}
            <div
              className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-900/80 border border-slate-800/80 text-[11px]"
              aria-live="polite"
              data-testid="health-container"
            >
              <span
                className={cn(
                  'w-2 h-2 rounded-full animate-pulse',
                  healthStatus === 'connected' && 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
                  healthStatus === 'loading' && 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]',
                  healthStatus === 'error' && 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]'
                )}
                aria-hidden="true"
              />
              <span className="text-slate-300 font-medium hidden sm:inline" data-testid="health-status">
                {HEALTH_DISPLAY_TEXT[healthStatus]}
              </span>
              {onRefreshHealth && (
                <button
                  type="button"
                  onClick={onRefreshHealth}
                  className="text-slate-400 hover:text-slate-100 transition-colors ml-0.5"
                  aria-label="Refresh system health"
                  title="Refresh system health"
                >
                  <RefreshCw size={11} />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Dynamic Main Workspace View */}
        <main
          className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden relative"
          aria-label="Workspace content"
          data-testid="app-shell-content"
        >
          {children}
        </main>
      </div>
    </div>
  );
};
