import React from 'react';
import {
  FileText,
  Layers,
  Search,
  Share2,
  Sparkles,
  LayoutDashboard,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Workspace } from '@/types/workspaces';

export type WorkspaceSection = 'notes' | 'sources' | 'search' | 'graph' | 'assistant' | 'dashboard';

export interface WorkspaceNavProps {
  activeSection: WorkspaceSection;
  onSelectSection: (section: WorkspaceSection) => void;
  selectedWorkspace?: Workspace | null;
  onOpenWorkspaceSwitcher?: () => void;
  badgeCounts?: Partial<Record<WorkspaceSection, number>>;
  collapsed?: boolean;
  className?: string;
}

interface NavItemConfig {
  id: WorkspaceSection;
  label: string;
  icon: React.ElementType;
  testId: string;
}

const WORKSPACE_NAV_ITEMS: NavItemConfig[] = [
  { id: 'notes', label: 'Notes', icon: FileText, testId: 'nav-notes' },
  { id: 'sources', label: 'Sources', icon: Layers, testId: 'nav-sources' },
  { id: 'search', label: 'Search', icon: Search, testId: 'nav-search' },
  { id: 'graph', label: 'Graph', icon: Share2, testId: 'nav-graph' },
  { id: 'assistant', label: 'Assistant', icon: Sparkles, testId: 'nav-assistant' },
];

export const WorkspaceNav: React.FC<WorkspaceNavProps> = ({
  activeSection,
  onSelectSection,
  selectedWorkspace,
  onOpenWorkspaceSwitcher,
  badgeCounts = {},
  collapsed = false,
  className,
}) => {
  const wsInitial = selectedWorkspace?.name?.charAt(0).toUpperCase() ?? 'K';
  const wsName = selectedWorkspace?.name ?? 'Knowledge Atlas';

  return (
    <nav
      className={cn(
        'workspace-nav flex flex-col h-full bg-slate-950/80 backdrop-blur-xl border-r border-slate-800/80 select-none z-20 transition-all duration-200',
        collapsed ? 'w-16 min-w-[64px]' : 'w-60 min-w-[240px]',
        className
      )}
      aria-label="Workspace navigation"
      data-testid="workspace-nav"
    >
      {/* Workspace Switcher / Header */}
      <div
        className={cn(
          'sidebar-workspace-switcher flex items-center gap-3 p-4 border-b border-slate-800/80 cursor-pointer hover:bg-white/[0.04] transition-colors',
          collapsed && 'justify-center p-3'
        )}
        role="button"
        tabIndex={0}
        aria-label={`Current workspace: ${wsName}`}
        onClick={onOpenWorkspaceSwitcher}
        onKeyDown={(e) => e.key === 'Enter' && onOpenWorkspaceSwitcher?.()}
        data-testid="workspace-switcher-trigger"
      >
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-sky-400 text-slate-950 font-bold flex items-center justify-center flex-shrink-0 text-sm shadow-md shadow-sky-500/20">
          {wsInitial}
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-100 truncate">
              {wsName}
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              Knowledge Atlas v0.4.1
            </div>
          </div>
        )}
        {!collapsed && onOpenWorkspaceSwitcher && (
          <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
        )}
      </div>

      {/* Main Navigation Links */}
      <div className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {!collapsed && (
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Workspace Hub
          </div>
        )}

        {WORKSPACE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          const count = badgeCounts[item.id];

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-150 relative group',
                isActive
                  ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30 shadow-[0_0_12px_rgba(56,189,248,0.15)] font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent',
                collapsed && 'justify-center px-0'
              )}
              aria-current={isActive ? 'page' : undefined}
              data-testid={item.testId}
              title={collapsed ? item.label : undefined}
            >
              <Icon
                size={16}
                className={cn(
                  'flex-shrink-0 transition-colors',
                  isActive ? 'text-sky-400' : 'text-slate-400 group-hover:text-slate-300'
                )}
              />
              {!collapsed && (
                <span className="flex-1 text-left truncate">{item.label}</span>
              )}
              {!collapsed && count !== undefined && count > 0 && (
                <span
                  className={cn(
                    'px-1.5 py-0.5 text-[10px] rounded-full font-mono font-medium',
                    isActive
                      ? 'bg-sky-500/30 text-sky-200'
                      : 'bg-slate-800 text-slate-400'
                  )}
                >
                  {count}
                </span>
              )}
              {collapsed && count !== undefined && count > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-sky-400" />
              )}
            </button>
          );
        })}

        {/* Dashboard shortcut */}
        <div className="pt-2">
          {!collapsed && (
            <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Overview
            </div>
          )}
          <button
            type="button"
            onClick={() => onSelectSection('dashboard')}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150',
              activeSection === 'dashboard'
                ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent',
              collapsed && 'justify-center px-0'
            )}
            aria-current={activeSection === 'dashboard' ? 'page' : undefined}
            data-testid="nav-dashboard"
            title={collapsed ? 'Dashboard' : undefined}
          >
            <LayoutDashboard size={16} className="flex-shrink-0" />
            {!collapsed && <span className="flex-1 text-left truncate">Dashboard</span>}
          </button>
        </div>
      </div>
    </nav>
  );
};
