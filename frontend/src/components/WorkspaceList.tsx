import React from 'react';
import { Workspace } from '@/types/workspaces';
import { ApiError } from '@/types/api';
import { LoadingState } from './LoadingState';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { Check, ArrowRight } from 'lucide-react';

interface WorkspaceListProps {
  workspaces: Workspace[];
  loading: boolean;
  error: ApiError | string | null;
  onRefresh?: () => void;
  onSelectWorkspace?: (workspace: Workspace) => void;
  selectedWorkspaceId?: string;
}

export const WorkspaceList: React.FC<WorkspaceListProps> = ({
  workspaces,
  loading,
  error,
  onRefresh,
  onSelectWorkspace,
  selectedWorkspaceId,
}) => {
  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-semibold text-[#878074] uppercase tracking-wider font-mono">
          Workspaces ({workspaces.length})
        </h3>
        {onRefresh && (
          <button
            type="button"
            data-testid="refresh-workspaces-button"
            onClick={onRefresh}
            className="px-2.5 py-1 text-xs font-mono text-[#575249] hover:text-[#1C1917] bg-[#EFECE4] hover:bg-[#E5E0D4] border border-[#DCD6C8] rounded-md transition-colors"
          >
            Refresh
          </button>
        )}
      </div>

      {loading && <LoadingState message="Loading workspaces..." />}
      {error && <ErrorState error={error} />}

      {!loading && !error && workspaces.length === 0 && (
        <EmptyState message="No workspaces created yet." />
      )}

      {!loading && !error && workspaces.length > 0 && (
        <ul data-testid="workspace-list" className="flex flex-col gap-3 list-none p-0 m-0">
          {workspaces.map((workspace) => {
            const isSelected = selectedWorkspaceId === workspace.id;
            return (
              <li
                key={workspace.id}
                data-testid="workspace-item"
                className={`p-4 rounded-xl border transition-all duration-200 flex flex-col gap-3 ${
                  isSelected
                    ? 'bg-[#F2EFE7] border-[#162135] shadow-xs'
                    : 'bg-[#FAF8F2] border-[#DCD6C8] hover:border-[#B5AFA4] hover:bg-white shadow-2xs'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="serif font-semibold text-[#1C1917] text-sm tracking-tight m-0">
                        {workspace.name}
                      </h4>
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 bg-[#162135] text-[#FAF8F2] rounded-full shrink-0">
                          <Check size={10} strokeWidth={2.5} /> Active
                        </span>
                      )}
                    </div>
                    {workspace.description && (
                      <p className="text-xs text-[#575249] mt-1.5 mb-0 leading-relaxed line-clamp-2">
                        {workspace.description}
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] text-[#878074] font-mono shrink-0 pt-0.5">
                    {new Date(workspace.created_at).toLocaleDateString()}
                  </span>
                </div>

                <div className="pt-2.5 border-t border-[#E5E0D4] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-[#878074] font-mono min-w-0">
                    <span>Owner:</span>
                    <span className="truncate max-w-[180px] sm:max-w-[220px] text-[#575249] font-mono">
                      {workspace.owner_id}
                    </span>
                  </div>

                  {onSelectWorkspace && (
                    <button
                      type="button"
                      data-testid={`open-workspace-${workspace.id}`}
                      onClick={() => onSelectWorkspace(workspace)}
                      className={`whitespace-nowrap inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer ${
                        isSelected
                          ? 'bg-[#162135] text-[#FAF8F2] hover:bg-[#233350] border border-[#162135]'
                          : 'bg-[#EFECE4] hover:bg-[#E5E0D4] text-[#1C1917] border border-[#DCD6C8]'
                      }`}
                    >
                      <span>Open Workspace</span>
                      <ArrowRight size={13} strokeWidth={2} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

