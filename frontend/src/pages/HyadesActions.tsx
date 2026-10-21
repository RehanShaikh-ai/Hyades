import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ActionDefinition,
  ActionResultEnvelope,
  ActionProposal,
  ExecuteActionRequest,
} from '@/types/actions';
import {
  getActionCatalogue,
  executeAction,
  getExecution,
  cancelExecution,
  listExecutions,
  undoExecution,
} from '@/api/actions';
import { ActionCatalogue } from '@/components/actions/ActionCatalogue';
import { ActionInputForm } from '@/components/actions/ActionInputForm';
import { ExecutionResultView } from '@/components/actions/ExecutionResultView';
import { ExecutionHistory } from '@/components/actions/ExecutionHistory';
import { ResolvedRecord } from '@/components/common/MarkdownPreview';

export interface HyadesActionsProps {
  workspaceId: string;
  userId?: string;
  onNavigateToLibrary?: () => void;
  onNavigateToObservatory?: (target?: { noteId?: string; sourceId?: string; entityName?: string }) => void;
  onNavigateToStella?: (context?: { prompt?: string; noteId?: string }) => void;
  resolvedRecords?: ResolvedRecord[];
  onNavigateRecord?: (record: ResolvedRecord) => void;
}

const STORAGE_ACTIVE_EXECUTION_KEY = 'hyades_v051_active_execution_id';

export const HyadesActions: React.FC<HyadesActionsProps> = ({
  workspaceId,
  userId: _userId,
  onNavigateToLibrary: _onNavigateToLibrary,
  onNavigateToObservatory: _onNavigateToObservatory,
  onNavigateToStella: _onNavigateToStella,
  resolvedRecords = [],
  onNavigateRecord,
}) => {
  // Action Catalogue State
  const [actions, setActions] = useState<ActionDefinition[]>([]);
  const [selectedAction, setSelectedAction] = useState<ActionDefinition | null>(null);
  const [isLoadingCatalogue, setIsLoadingCatalogue] = useState<boolean>(true);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);

  // Execution & Result State
  const [currentExecution, setCurrentExecution] = useState<ActionResultEnvelope | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [isUndoing, setIsUndoing] = useState<boolean>(false);
  const [executionError, setExecutionError] = useState<string | null>(null);

  // Accessible Status Announcement Live Region (§13)
  const [a11yAnnouncement, setA11yAnnouncement] = useState<string>('');

  // Execution History State (§5, §10)
  const [historyItems, setHistoryItems] = useState<ActionResultEnvelope[]>([]);
  const [historyTotal, setHistoryTotal] = useState<number>(0);
  const [historyPage, setHistoryPage] = useState<number>(1);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Active Center View ('form' | 'result' | 'history')
  const [centerView, setCenterView] = useState<'form' | 'result' | 'history'>('form');

  // Polling ref
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = (message: string) => {
    setA11yAnnouncement(message);
  };

  // 1. Load canonical action catalogue (§3.3, §5, §7)
  const loadCatalogue = useCallback(async () => {
    setIsLoadingCatalogue(true);
    setCatalogueError(null);
    try {
      const res = await getActionCatalogue();
      const list = res.actions || [];
      setActions(list);
      setSelectedAction((prev) => prev ?? (list.length > 0 ? list[0] : null));
      announce(`Loaded ${list.length} canonical actions from registry.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reach action registry backend';
      setCatalogueError(msg);
      announce(`Error loading catalogue: ${msg}`);
    } finally {
      setIsLoadingCatalogue(false);
    }
  }, []);

  // 2. Load execution history (§5)
  const loadHistory = useCallback(
    async (page: number = 1) => {
      setIsLoadingHistory(true);
      try {
        const res = await listExecutions({
          workspace_id: workspaceId,
          page,
          page_size: 10,
        });
        setHistoryItems(res.items || []);
        setHistoryTotal(res.total || 0);
        setHistoryPage(page);
      } catch {
        // Handled silently
      } finally {
        setIsLoadingHistory(false);
      }
    },
    [workspaceId]
  );

  // Initial load
  useEffect(() => {
    loadCatalogue();
    loadHistory(1);
  }, [loadCatalogue, loadHistory]);

  // 3. Persistent execution retrieval after refresh (§3.C)
  useEffect(() => {
    try {
      const savedExecutionId = sessionStorage.getItem(STORAGE_ACTIVE_EXECUTION_KEY);
      if (savedExecutionId) {
        getExecution(savedExecutionId)
          .then((env) => {
            setCurrentExecution((prev) => prev ?? env);
            setCenterView('result');
            announce(`Restored execution ${env.execution_id} with status ${env.status}.`);
          })
          .catch(() => {
            sessionStorage.removeItem(STORAGE_ACTIVE_EXECUTION_KEY);
          });
      }
    } catch {
      // Ignore sessionStorage errors
    }
  }, []);

  // 4. Polling for active execution state updates (§3.C, §6.1, §6.8)
  const activeExecutionId = currentExecution?.execution_id;
  const activeStatus = currentExecution?.status;
  const isPendingOrRunning =
    activeStatus === 'pending' || activeStatus === 'running' || activeStatus === 'cancelling';

  useEffect(() => {
    if (!activeExecutionId || !isPendingOrRunning) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      try {
        const updated = await getExecution(activeExecutionId);
        setCurrentExecution(updated);

        if (
          updated.status === 'succeeded' ||
          updated.status === 'failed' ||
          updated.status === 'cancelled' ||
          updated.status === 'proposed' ||
          updated.status === 'awaiting_confirmation'
        ) {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          loadHistory(historyPage);
          announce(`Execution status transitioned to ${updated.status}.`);
        }
      } catch {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    }, 1000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [activeExecutionId, isPendingOrRunning, historyPage, loadHistory]);

  // 5. Handle action execution submission (§5.1, §6.2)
  const handleExecute = async (req: ExecuteActionRequest) => {
    if (!selectedAction) return;
    setIsSubmitting(true);
    setExecutionError(null);
    announce(`Submitting execution for ${selectedAction.name}...`);

    try {
      const resultEnv = await executeAction(selectedAction.id, req, workspaceId);
      setCurrentExecution(resultEnv);
      setCenterView('result');

      try {
        sessionStorage.setItem(STORAGE_ACTIVE_EXECUTION_KEY, resultEnv.execution_id);
      } catch {
        // Ignore
      }

      announce(
        `Action ${resultEnv.action_id} submitted with status ${resultEnv.status}. Duration: ${resultEnv.duration_ms}ms.`
      );
      loadHistory(1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action execution failed';
      setExecutionError(msg);
      announce(`Execution submission failed: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 6. Handle execution cancellation (§6.8)
  const handleCancel = async (executionId: string) => {
    setIsCancelling(true);
    announce('Requesting execution cancellation...');
    try {
      const cancelledEnv = await cancelExecution(executionId);
      setCurrentExecution(cancelledEnv);
      announce(`Execution status is now ${cancelledEnv.status}.`);
      loadHistory(historyPage);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Cancellation request failed';
      announce(`Cancellation error: ${msg}`);
    } finally {
      setIsCancelling(false);
    }
  };

  // 7. Handle two-phase proposal confirmation commit (§6.2, §3.E)
  const handleConfirmProposal = async (proposal: ActionProposal, token: string) => {
    if (!currentExecution) return;
    setIsSubmitting(true);
    announce('Committing proposed changes with confirmation token...');

    try {
      const commitRequest: ExecuteActionRequest = {
        mode: 'commit',
        confirmation_token: token,
        idempotency_key: `commit-${proposal.id}-${Date.now()}`,
        input: (proposal.proposal_payload as Record<string, unknown>) || {},
      };

      const resultEnv = await executeAction(proposal.action_id, commitRequest, workspaceId);
      setCurrentExecution(resultEnv);
      announce('Proposed changes committed successfully to workspace vault.');
      loadHistory(historyPage);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Proposal commit failed';
      announce(`Commit failed: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 8. Handle proposal rejection (§6.2, §3.E)
  const handleRejectProposal = (proposal: ActionProposal) => {
    if (!currentExecution) return;
    const updatedProposals = currentExecution.proposals.map((p) =>
      p.id === proposal.id ? { ...p, status: 'rejected' as const, rejected_at: new Date().toISOString() } : p
    );
    setCurrentExecution({
      ...currentExecution,
      status: 'cancelled',
      proposals: updatedProposals,
    });
    announce(`Proposal ${proposal.id} rejected.`);
  };

  // 9. Handle undo for supported mutations (§6.5)
  const handleUndo = async (executionId: string) => {
    setIsUndoing(true);
    announce('Executing undo mutation on backend...');
    try {
      const undoneEnv = await undoExecution(executionId);
      setCurrentExecution(undoneEnv);
      announce('Undo completed and verified by server.');
      loadHistory(historyPage);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Undo operation rejected by server';
      announce(`Undo failed: ${msg}`);
    } finally {
      setIsUndoing(false);
    }
  };

  return (
    <div
      data-testid="hyades-actions-page"
      className="flex flex-col h-full w-full overflow-hidden bg-[var(--bg-base)] text-[var(--ink-primary)]"
    >
      {/* Invisible Screen Reader Live Region for Accessible Announcements (§13) */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="a11y-announcements"
      >
        {a11yAnnouncement}
      </div>

      {/* Action Workspace Top Bar */}
      <header className="shrink-0 px-4 sm:px-6 py-3 border-b border-[var(--border-parchment)] bg-white/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none">
        <div>
          <h1 className="serif text-xl sm:text-2xl font-bold tracking-tight text-[var(--ink-primary)]">
            Manual Actions <span className="serif-italic font-normal text-[var(--accent-midnight)] text-lg sm:text-xl">· Safe Execution Observatory</span>
          </h1>
          <p className="text-xs text-[var(--ink-secondary)]">
            Select contract-registered actions, review two-phase proposals, and inspect verified evidence.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <button
            type="button"
            data-testid="view-form-tab"
            onClick={() => setCenterView('form')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              centerView === 'form'
                ? 'bg-[var(--accent-midnight)] text-[#FAF8F2] shadow-2xs'
                : 'bg-white border border-[var(--border-parchment)] text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)]'
            }`}
          >
            <i className="ph ph-sliders text-xs" />
            <span>Configure Input</span>
          </button>
          <button
            type="button"
            data-testid="view-result-tab"
            disabled={!currentExecution}
            onClick={() => setCenterView('result')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
              centerView === 'result'
                ? 'bg-[var(--accent-midnight)] text-[#FAF8F2] shadow-2xs'
                : 'bg-white border border-[var(--border-parchment)] text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)]'
            }`}
          >
            <i className="ph ph-chart-bar text-xs" />
            <span>Execution Result</span>
            {currentExecution && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>
          <button
            type="button"
            data-testid="view-history-tab"
            onClick={() => setCenterView('history')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              centerView === 'history'
                ? 'bg-[var(--accent-midnight)] text-[#FAF8F2] shadow-2xs'
                : 'bg-white border border-[var(--border-parchment)] text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)]'
            }`}
          >
            <i className="ph ph-clock-counter-clockwise text-xs" />
            <span>History ({historyTotal})</span>
          </button>
        </div>
      </header>

      {/* Main 2-Column Responsive Workspace Grid (§13.2: 768px min width, 1280, 1440, 1920) */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
        {/* Left Flank: Action Catalogue (4 cols on lg, full width when collapsed) */}
        <aside className="lg:col-span-4 xl:col-span-4 h-full min-h-0 overflow-hidden flex flex-col border-b lg:border-b-0">
          <ActionCatalogue
            actions={actions}
            selectedActionId={selectedAction?.id || null}
            onSelectAction={(action) => {
              setSelectedAction(action);
              setCenterView('form');
            }}
            isLoading={isLoadingCatalogue}
            error={catalogueError}
            onRefresh={loadCatalogue}
          />
        </aside>

        {/* Right Flank: Dynamic Workspace Display (8 cols on lg) */}
        <section className="lg:col-span-8 xl:col-span-8 h-full min-h-0 overflow-y-auto p-4 sm:p-6 bg-[var(--bg-canvas)] flex flex-col gap-4 hyades-scroll">
          {executionError && (
            <div
              data-testid="global-execution-error"
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-center justify-between gap-2 shrink-0 animate-fade-in"
            >
              <div className="flex items-center gap-2">
                <i className="ph ph-warning-circle text-base text-rose-700 shrink-0" />
                <span>{executionError}</span>
              </div>
              <button
                type="button"
                onClick={() => setExecutionError(null)}
                className="text-xs text-rose-800 hover:text-rose-950 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {centerView === 'form' && selectedAction && (
            <div className="flex-1 min-h-0 flex flex-col">
              <ActionInputForm
                action={selectedAction}
                workspaceId={workspaceId}
                isSubmitting={isSubmitting}
                onSubmit={handleExecute}
              />
            </div>
          )}

          {centerView === 'result' && currentExecution && (
            <div className="flex-1 min-h-0 flex flex-col">
              <ExecutionResultView
                envelope={currentExecution}
                isCancelling={isCancelling}
                onCancelExecution={handleCancel}
                onConfirmProposal={handleConfirmProposal}
                onRejectProposal={handleRejectProposal}
                onUndoChange={handleUndo}
                isUndoing={isUndoing}
                resolvedRecords={resolvedRecords}
                onNavigateRecord={onNavigateRecord}
                onRerunAction={() => setCenterView('form')}
              />
            </div>
          )}

          {centerView === 'history' && (
            <div className="flex-1 min-h-0 flex flex-col">
              <ExecutionHistory
                executions={historyItems}
                total={historyTotal}
                page={historyPage}
                pageSize={10}
                onPageChange={(p) => loadHistory(p)}
                selectedExecutionId={currentExecution?.execution_id || null}
                onSelectExecution={(ex) => {
                  setCurrentExecution(ex);
                  setCenterView('result');
                }}
                isLoading={isLoadingHistory}
                onRefresh={() => loadHistory(historyPage)}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default HyadesActions;
