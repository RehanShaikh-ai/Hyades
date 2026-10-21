import React, { useState } from 'react';
import { ActionResultEnvelope } from '@/types/actions';

export interface ExecutionHistoryProps {
  executions: ActionResultEnvelope[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (newPage: number) => void;
  selectedExecutionId: string | null;
  onSelectExecution: (execution: ActionResultEnvelope) => void;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export const ExecutionHistory: React.FC<ExecutionHistoryProps> = ({
  executions,
  total,
  page,
  pageSize,
  onPageChange,
  selectedExecutionId,
  onSelectExecution,
  isLoading = false,
  onRefresh,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const filteredExecutions = executions.filter((ex) => {
    if (statusFilter !== 'all' && ex.status !== statusFilter) return false;
    return true;
  });

  return (
    <div
      data-testid="execution-history"
      className="flex flex-col h-full bg-white rounded-2xl border border-[var(--border-parchment)] shadow-sm overflow-hidden"
    >
      {/* Header & Controls */}
      <div className="p-4 border-b border-[var(--border-parchment)] bg-[var(--bg-panel)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h3 className="serif text-base font-semibold text-[var(--ink-primary)]">
            Execution Log & History
          </h3>
          <p className="text-[11px] text-[var(--ink-secondary)]">
            Persistent execution audit trail in current workspace ({total} total)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <select
            data-testid="history-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-white border border-[var(--border-parchment)] rounded-lg px-2.5 py-1 text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-midnight)]"
          >
            <option value="all">All Statuses</option>
            <option value="succeeded">Succeeded</option>
            <option value="failed">Failed</option>
            <option value="proposed">Proposed</option>
            <option value="running">Running</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {onRefresh && (
            <button
              type="button"
              data-testid="refresh-history-btn"
              onClick={onRefresh}
              aria-label="Refresh history"
              disabled={isLoading}
              className="p-1.5 rounded-lg border border-[var(--border-parchment)] bg-white text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-panel-subtle)] transition-colors cursor-pointer disabled:opacity-50"
            >
              <i className={`ph ph-arrows-clockwise text-sm ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* History Items List */}
      <div
        data-testid="history-list-container"
        className="flex-1 overflow-y-auto divide-y divide-[var(--border-parchment)] p-2 space-y-1 hyades-scroll"
      >
        {isLoading ? (
          <div className="py-12 text-center text-xs text-[var(--ink-secondary)] flex flex-col items-center justify-center space-y-2">
            <div className="w-6 h-6 rounded-full border-2 border-[var(--accent-terracotta)] border-t-transparent animate-spin" />
            <span>Loading execution history...</span>
          </div>
        ) : filteredExecutions.length === 0 ? (
          <div data-testid="history-empty-state" className="py-12 text-center text-xs text-[var(--ink-tertiary)] italic">
            No executions found in history.
          </div>
        ) : (
          filteredExecutions.map((ex) => {
            const isSelected = selectedExecutionId === ex.execution_id;
            const durationFormatted =
              ex.duration_ms < 1000
                ? `${ex.duration_ms} ms`
                : `${(ex.duration_ms / 1000).toFixed(2)} s`;

            return (
              <div
                key={ex.execution_id}
                data-testid={`history-row-${ex.execution_id}`}
                onClick={() => onSelectExecution(ex)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'bg-white border-[var(--accent-midnight)] shadow-xs ring-1 ring-[var(--accent-midnight)]'
                    : 'bg-white/70 border-[var(--border-parchment)] hover:bg-white hover:border-[var(--border-strong)]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="serif text-xs font-semibold text-[var(--ink-primary)]">
                      {ex.action_id}
                    </span>
                    <span className="mono text-[10px] text-[var(--ink-tertiary)] truncate max-w-xs">
                      {ex.execution_id}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-[var(--ink-tertiary)] mono mt-0.5">
                    <span>By: {ex.initiated_by}</span>
                    <span>·</span>
                    <span>{durationFormatted}</span>
                    {ex.created_at && (
                      <>
                        <span>·</span>
                        <span>{new Date(ex.created_at).toLocaleTimeString()}</span>
                      </>
                    )}
                  </div>
                </div>

                <span
                  data-testid={`history-status-${ex.execution_id}`}
                  className={`mono text-[10px] font-semibold px-2 py-0.5 rounded border uppercase shrink-0 ${
                    ex.status === 'succeeded'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : ex.status === 'failed'
                      ? 'bg-rose-50 text-rose-800 border-rose-200'
                      : ex.status === 'proposed' || ex.status === 'awaiting_confirmation'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : ex.status === 'running'
                      ? 'bg-sky-50 text-sky-800 border-sky-200'
                      : 'bg-gray-100 text-gray-700 border-gray-300'
                  }`}
                >
                  {ex.status}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Controls (§5) */}
      <div
        data-testid="history-pagination"
        className="p-3 border-t border-[var(--border-parchment)] bg-[var(--bg-panel)] flex items-center justify-between text-xs text-[var(--ink-secondary)] shrink-0"
      >
        <span className="mono text-[11px]">
          Page {page} of {totalPages}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="history-prev-page"
            disabled={page <= 1 || isLoading}
            onClick={() => onPageChange(page - 1)}
            className="px-2.5 py-1 rounded-md border border-[var(--border-parchment)] bg-white text-xs font-medium hover:bg-[var(--bg-panel-subtle)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Previous
          </button>
          <button
            type="button"
            data-testid="history-next-page"
            disabled={page >= totalPages || isLoading}
            onClick={() => onPageChange(page + 1)}
            className="px-2.5 py-1 rounded-md border border-[var(--border-parchment)] bg-white text-xs font-medium hover:bg-[var(--bg-panel-subtle)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};
