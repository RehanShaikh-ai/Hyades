import React, { useState } from 'react';
import {
  ActionResultEnvelope,
  ActionProposal,
  ExecutionStatus,
} from '@/types/actions';
import { MarkdownPreview, ResolvedRecord } from '@/components/common/MarkdownPreview';

export interface ExecutionResultViewProps {
  envelope: ActionResultEnvelope;
  isCancelling?: boolean;
  onCancelExecution?: (executionId: string) => void;
  onConfirmProposal?: (proposal: ActionProposal, token: string) => void;
  onRejectProposal?: (proposal: ActionProposal) => void;
  onUndoChange?: (changeIdOrExecutionId: string) => void;
  isUndoing?: boolean;
  resolvedRecords?: ResolvedRecord[];
  onNavigateRecord?: (record: ResolvedRecord) => void;
  onRerunAction?: () => void;
}

const STATUS_CONFIG: Record<
  ExecutionStatus,
  { label: string; bg: string; text: string; border: string; icon: string; pulse?: boolean }
> = {
  pending: {
    label: 'Pending',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-300',
    icon: 'ph-hourglass',
  },
  running: {
    label: 'Running',
    bg: 'bg-sky-50',
    text: 'text-sky-800',
    border: 'border-sky-300',
    icon: 'ph-spinner',
    pulse: true,
  },
  proposed: {
    label: 'Proposed (Awaiting Confirmation)',
    bg: 'bg-amber-50',
    text: 'text-amber-900',
    border: 'border-amber-300',
    icon: 'ph-git-pull-request',
  },
  awaiting_confirmation: {
    label: 'Awaiting Confirmation',
    bg: 'bg-amber-50',
    text: 'text-amber-900',
    border: 'border-amber-300',
    icon: 'ph-shield-warning',
  },
  succeeded: {
    label: 'Succeeded',
    bg: 'bg-emerald-50',
    text: 'text-emerald-900',
    border: 'border-emerald-300',
    icon: 'ph-check-circle',
  },
  failed: {
    label: 'Failed',
    bg: 'bg-rose-50',
    text: 'text-rose-900',
    border: 'border-rose-300',
    icon: 'ph-x-circle',
  },
  cancelling: {
    label: 'Cancelling...',
    bg: 'bg-purple-50',
    text: 'text-purple-900',
    border: 'border-purple-300',
    icon: 'ph-spinner',
    pulse: true,
  },
  cancelled: {
    label: 'Cancelled',
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    border: 'border-gray-300',
    icon: 'ph-prohibit',
  },
};

export const ExecutionResultView: React.FC<ExecutionResultViewProps> = ({
  envelope,
  isCancelling = false,
  onCancelExecution,
  onConfirmProposal,
  onRejectProposal,
  onUndoChange,
  isUndoing = false,
  resolvedRecords = [],
  onNavigateRecord,
  onRerunAction,
}) => {
  const [activeTab, setActiveTab] = useState<'result' | 'evidence' | 'proposals' | 'raw'>('result');
  const [isRawExpanded, setIsRawExpanded] = useState(false);
  const [currentTime] = useState(() => Date.now());

  const statusConfig = STATUS_CONFIG[envelope.status] || STATUS_CONFIG.pending;
  const isTerminal =
    envelope.status === 'succeeded' ||
    envelope.status === 'failed' ||
    envelope.status === 'cancelled';
  const isActive = envelope.status === 'pending' || envelope.status === 'running' || envelope.status === 'cancelling';

  const hasProposals = envelope.proposals && envelope.proposals.length > 0;
  const hasCommittedChanges = envelope.committed_changes && envelope.committed_changes.length > 0;
  const hasEvidence = envelope.evidence && envelope.evidence.length > 0;

  // Format execution duration
  const formattedDuration =
    envelope.duration_ms < 1000
      ? `${envelope.duration_ms} ms`
      : `${(envelope.duration_ms / 1000).toFixed(2)} s`;

  return (
    <div
      data-testid="execution-result-view"
      className="flex flex-col h-full bg-white rounded-2xl border border-[var(--border-parchment)] shadow-sm overflow-hidden"
    >
      {/* Execution Status Header (§9, §10) */}
      <div className="p-4 sm:p-5 border-b border-[var(--border-parchment)] bg-[var(--bg-panel)] space-y-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="serif text-base sm:text-lg font-bold text-[var(--ink-primary)]">
                Execution: {envelope.action_id}
              </span>
              <span
                data-testid="execution-id-badge"
                className="mono text-[10px] bg-white px-2 py-0.5 rounded border border-[var(--border-parchment)] text-[var(--ink-secondary)] truncate max-w-xs"
                title={envelope.execution_id}
              >
                {envelope.execution_id}
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs text-[var(--ink-tertiary)] mono mt-1 flex-wrap">
              <span>Initiated by: <strong className="text-[var(--ink-primary)]">{envelope.initiated_by}</strong></span>
              <span>·</span>
              <span>Duration: <strong className="text-[var(--ink-primary)]">{formattedDuration}</strong></span>
              {envelope.current_stage && (
                <>
                  <span>·</span>
                  <span>Stage: <strong className="text-[var(--accent-midnight)]">{envelope.current_stage}</strong></span>
                </>
              )}
            </div>
          </div>

          {/* Status Badge & Cancel Action (§6.8) */}
          <div className="flex items-center gap-2 shrink-0">
            <span
              data-testid="execution-status-badge"
              className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold border flex items-center gap-1.5 ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}
            >
              <i
                className={`ph ${statusConfig.icon} text-sm ${
                  statusConfig.pulse ? 'animate-spin' : ''
                }`}
              />
              <span>{statusConfig.label}</span>
            </span>

            {/* Cancel Execution Button (only when running or pending) */}
            {isActive && envelope.status !== 'cancelling' && onCancelExecution && (
              <button
                type="button"
                data-testid="cancel-execution-btn"
                disabled={isCancelling}
                onClick={() => onCancelExecution(envelope.execution_id)}
                className="px-3 py-1 rounded-lg border border-rose-300 bg-white text-rose-800 hover:bg-rose-50 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                title="Request cancellation of active execution"
              >
                <i className="ph ph-hand text-xs" />
                <span>Cancel</span>
              </button>
            )}

            {isTerminal && onRerunAction && (
              <button
                type="button"
                data-testid="rerun-action-btn"
                onClick={onRerunAction}
                className="px-3 py-1 rounded-lg border border-[var(--border-strong)] bg-white text-[var(--ink-primary)] hover:bg-[var(--bg-panel-subtle)] text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
              >
                <i className="ph ph-arrow-counter-clockwise text-xs" />
                <span>New Run</span>
              </button>
            )}
          </div>
        </div>

        {/* Progress accounting bar for bulk operations (§10.1) */}
        {envelope.total_items !== undefined && envelope.total_items !== null && envelope.total_items > 0 && (
          <div data-testid="execution-progress-bar" className="p-2.5 rounded-xl bg-white border border-[var(--border-parchment)] space-y-1.5">
            <div className="flex items-center justify-between text-[11px] mono">
              <span className="text-[var(--ink-secondary)]">
                Processed: <strong>{envelope.completed_items ?? 0}</strong> of <strong>{envelope.total_items}</strong> items
              </span>
              {(envelope.failed_items ?? 0) > 0 && (
                <span className="text-rose-700 font-semibold">
                  Failed: {envelope.failed_items}
                </span>
              )}
            </div>
            <div className="w-full bg-[var(--bg-panel-subtle)] h-2 rounded-full overflow-hidden border border-[var(--border-parchment)]">
              <div
                className="bg-[var(--accent-midnight)] h-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, (((envelope.completed_items ?? 0) / envelope.total_items) * 100))}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Failure / Error Banner (§10.3) */}
        {envelope.status === 'failed' && (
          <div
            data-testid="execution-error-banner"
            className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1"
          >
            <div className="flex items-center gap-2 font-semibold">
              <i className="ph ph-warning-circle text-base text-rose-700 shrink-0" />
              <span>Execution Failed {envelope.error_code ? `[${envelope.error_code}]` : ''}</span>
            </div>
            <p className="text-[11px] leading-relaxed pl-6">
              {envelope.error_message || 'The backend reported an execution failure. Please inspect parameters or retry.'}
            </p>
          </div>
        )}

        {/* Navigation Sub-Tabs */}
        <div className="flex items-center gap-2 border-t border-[var(--border-parchment)]/60 pt-2 text-xs">
          <button
            type="button"
            data-testid="tab-interpretation"
            onClick={() => setActiveTab('result')}
            className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              activeTab === 'result'
                ? 'bg-white border border-[var(--border-strong)] text-[var(--ink-primary)] shadow-2xs font-semibold'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            Interpretation & Output
          </button>
          <button
            type="button"
            data-testid="tab-evidence"
            onClick={() => setActiveTab('evidence')}
            className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'evidence'
                ? 'bg-white border border-[var(--border-strong)] text-[var(--ink-primary)] shadow-2xs font-semibold'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            <span>Evidence</span>
            <span className="mono text-[10px] bg-[var(--bg-panel-subtle)] px-1.5 py-0.2 rounded border border-[var(--border-parchment)]">
              {envelope.evidence?.length ?? 0}
            </span>
          </button>
          <button
            type="button"
            data-testid="tab-proposals"
            onClick={() => setActiveTab('proposals')}
            className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'proposals'
                ? 'bg-white border border-[var(--border-strong)] text-[var(--ink-primary)] shadow-2xs font-semibold'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            <span>Proposals & Changes</span>
            {(hasProposals || hasCommittedChanges) && (
              <span className="mono text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded border border-amber-300 font-semibold">
                {(envelope.proposals?.length ?? 0) + (envelope.committed_changes?.length ?? 0)}
              </span>
            )}
          </button>
          <button
            type="button"
            data-testid="tab-raw"
            onClick={() => setActiveTab('raw')}
            className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              activeTab === 'raw'
                ? 'bg-white border border-[var(--border-strong)] text-[var(--ink-primary)] shadow-2xs font-semibold'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            Envelope Inspector
          </button>
        </div>
      </div>

      {/* Main Tab View Content */}
      <div
        tabIndex={0}
        aria-label="Execution details view"
        className="flex-1 overflow-y-auto p-5 space-y-5 hyades-scroll focus:outline-none"
      >
        {/* ================= TAB 1: INTERPRETATION & OUTPUT ================= */}
        {activeTab === 'result' && (
          <div className="space-y-4">
            {/* Generated Interpretation Section (§8.3, §3.D) */}
            <div data-testid="interpretation-section" className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="serif text-sm font-semibold text-[var(--ink-primary)] flex items-center gap-1.5">
                  <i className="ph ph-chat-circle-text text-[var(--accent-midnight)]" />
                  <span>Generated Interpretation & Synthesis</span>
                </h4>
                <span className="mono text-[10px] text-[var(--ink-tertiary)] uppercase">
                  Model Output
                </span>
              </div>

              {envelope.interpretation ? (
                <div className="p-4 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-parchment)] shadow-2xs">
                  <MarkdownPreview
                    content={envelope.interpretation}
                    resolvedRecords={resolvedRecords}
                    onNavigateRecord={onNavigateRecord}
                    dataTestId="interpretation-markdown"
                  />
                </div>
              ) : (
                <div className="p-6 rounded-xl bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-center text-xs text-[var(--ink-tertiary)] italic">
                  No textual interpretation was generated by this execution.
                </div>
              )}
            </div>

            {/* Direct Structured Result if present */}
            {Boolean(envelope.result && typeof envelope.result === 'object' && Object.keys(envelope.result as object).length > 0) && (
              <div data-testid="structured-result-section" className="space-y-2 pt-2 border-t border-[var(--border-parchment)]">
                <h4 className="serif text-sm font-semibold text-[var(--ink-primary)] flex items-center gap-1.5">
                  <i className="ph ph-tree-structure text-[var(--accent-brass)]" />
                  <span>Structured Action Result</span>
                </h4>
                <pre className="p-3.5 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-parchment)] mono text-xs text-[var(--ink-primary)] overflow-x-auto leading-relaxed max-h-72">
                  <code>{JSON.stringify(envelope.result, null, 2)}</code>
                </pre>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: EVIDENCE (DISTINCT SEPARATION §8.3) ================= */}
        {activeTab === 'evidence' && (
          <div data-testid="evidence-section" className="space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-[var(--border-parchment)]">
              <div>
                <h4 className="serif text-sm font-semibold text-[var(--ink-primary)] flex items-center gap-1.5">
                  <i className="ph ph-quotes text-[var(--accent-terracotta)]" />
                  <span>Retrieved Evidence</span>
                </h4>
                <p className="text-[11px] text-[var(--ink-secondary)]">
                  Stored knowledge items and verified provenance supporting this execution.
                </p>
              </div>
              <span className="mono text-[10px] text-[var(--ink-tertiary)]">
                Total: {envelope.evidence?.length ?? 0}
              </span>
            </div>

            {!hasEvidence ? (
              <div
                data-testid="no-evidence-message"
                className="p-8 text-center rounded-xl bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] space-y-1.5"
              >
                <i className="ph ph-magnifying-glass text-2xl text-[var(--ink-tertiary)]" />
                <p className="serif text-xs font-semibold text-[var(--ink-primary)]">
                  No Supporting Evidence Retrieved
                </p>
                <p className="text-[11px] text-[var(--ink-secondary)] max-w-sm mx-auto">
                  The system did not retrieve stored evidence chunks for this execution (§8.3). No citations or scores are invented.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {envelope.evidence.map((ev, idx) => {
                  const scorePercent =
                    ev.similarity_score !== undefined && ev.similarity_score !== null
                      ? (ev.similarity_score * 100).toFixed(1)
                      : null;

                  return (
                    <div
                      key={ev.chunk_id || ev.item_id || idx}
                      data-testid={`evidence-card-${ev.item_id || idx}`}
                      className="p-3.5 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-parchment)] space-y-2 hover:border-[var(--border-strong)] transition-all"
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          {ev.item_type && (
                            <span className="mono text-[10px] uppercase font-semibold bg-white px-2 py-0.5 rounded border border-[var(--border-parchment)] text-[var(--ink-secondary)]">
                              {ev.item_type}
                            </span>
                          )}
                          {ev.title && (
                            <span className="serif text-xs font-semibold text-[var(--ink-primary)]">
                              {ev.title}
                            </span>
                          )}
                          {ev.item_id && (
                            <span className="mono text-[10px] text-[var(--ink-tertiary)] truncate max-w-xs" title={ev.item_id}>
                              ID: {ev.item_id}
                            </span>
                          )}
                        </div>

                        {/* Similarity Score: MUST NEVER BE LABELED CONFIDENCE (§8.2) */}
                        {scorePercent !== null && (
                          <span
                            data-testid="evidence-similarity-score"
                            className="mono text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200"
                            title="Vector / Lexical Similarity Score"
                          >
                            Similarity: {scorePercent}%
                          </span>
                        )}
                      </div>

                      {/* Excerpt quote */}
                      {ev.excerpt && (
                        <blockquote className="border-l-2 border-[var(--accent-brass)] pl-3 py-1 text-xs text-[var(--ink-archival)] italic leading-relaxed bg-white/60 rounded-r-lg">
                          &ldquo;{ev.excerpt}&rdquo;
                        </blockquote>
                      )}

                      {/* Provenance footer */}
                      <div className="flex items-center gap-3 text-[10px] mono text-[var(--ink-tertiary)] pt-1 border-t border-[var(--border-parchment)]/60 flex-wrap">
                        {ev.source_id && <span>Source: {ev.source_id}</span>}
                        {ev.chunk_id && <span>Chunk: {ev.chunk_id}</span>}
                        {ev.reference && <span>Ref: {ev.reference}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: PROPOSALS & COMMITTED CHANGES (§6.2, §6.4) ================= */}
        {activeTab === 'proposals' && (
          <div className="space-y-5">
            {/* Phase 1: Proposed Changes Awaiting Confirmation (§6.2) */}
            <div data-testid="proposals-review-section" className="space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-[var(--border-parchment)]">
                <div>
                  <h4 className="serif text-sm font-semibold text-[var(--ink-primary)] flex items-center gap-1.5">
                    <i className="ph ph-shield-warning text-amber-600" />
                    <span>Proposed Mutations (Two-Phase Safety)</span>
                  </h4>
                  <p className="text-[11px] text-[var(--ink-secondary)]">
                    Server-staged changes requiring explicit human review and token confirmation before storage commit.
                  </p>
                </div>
                <span className="mono text-[10px] text-[var(--ink-tertiary)]">
                  Proposals: {envelope.proposals?.length ?? 0}
                </span>
              </div>

              {!hasProposals ? (
                <div className="p-5 text-center rounded-xl bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-xs text-[var(--ink-tertiary)] italic">
                  No uncommitted proposals pending review.
                </div>
              ) : (
                <div className="space-y-3">
                  {envelope.proposals.map((proposal) => {
                    const isExpired =
                      proposal.status === 'expired' ||
                      (proposal.expires_at
                        ? new Date(proposal.expires_at).getTime() < currentTime
                        : false);

                    return (
                      <div
                        key={proposal.id}
                        data-testid={`proposal-card-${proposal.id}`}
                        className="p-4 rounded-xl bg-amber-50/50 border border-amber-200 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="serif text-sm font-semibold text-amber-950">
                                Proposal: {proposal.action_id}
                              </span>
                              <span className="mono text-[10px] bg-white text-amber-900 px-1.5 py-0.5 rounded border border-amber-300">
                                {proposal.id}
                              </span>
                            </div>
                            {proposal.expires_at && (
                              <p className={`text-[10px] mono mt-0.5 ${isExpired ? 'text-rose-700 font-bold' : 'text-amber-800'}`}>
                                {isExpired
                                  ? 'Token Expired'
                                  : `Expires: ${new Date(proposal.expires_at).toLocaleTimeString()}`}
                              </p>
                            )}
                          </div>

                          <span className="mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-white text-amber-900 border border-amber-300">
                            Status: {proposal.status}
                          </span>
                        </div>

                        {/* Affected records (§6.2, §6.4) */}
                        {proposal.affected_item_ids && proposal.affected_item_ids.length > 0 && (
                          <div data-testid="affected-items-list" className="p-2.5 rounded-lg bg-white border border-amber-200 text-xs">
                            <span className="mono text-[10px] uppercase font-semibold text-amber-900 block mb-1">
                              Affected Record IDs ({proposal.affected_item_ids.length}):
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {proposal.affected_item_ids.map((id) => (
                                <span
                                  key={id}
                                  className="mono text-[10px] px-2 py-0.5 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-[var(--ink-primary)]"
                                >
                                  {id}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Proposed Payload Diff / View */}
                        <div className="space-y-1">
                          <span className="mono text-[10px] uppercase font-semibold text-amber-900 block">
                            Proposed Changes:
                          </span>
                          <pre className="p-3 rounded-lg bg-white border border-amber-200 mono text-xs text-[var(--ink-primary)] overflow-x-auto max-h-48 leading-relaxed">
                            <code>{JSON.stringify(proposal.proposal_payload, null, 2)}</code>
                          </pre>
                        </div>

                        {/* Confirmation Token Indicator */}
                        {proposal.confirmation_token && (
                          <div className="p-2 rounded bg-white border border-amber-300 text-[11px] mono flex items-center justify-between gap-2">
                            <span className="text-amber-900">Confirmation Token:</span>
                            <span className="text-[var(--ink-primary)] font-bold truncate max-w-xs" title={proposal.confirmation_token}>
                              {proposal.confirmation_token}
                            </span>
                          </div>
                        )}

                        {/* Two-Phase Confirmation Actions (§6.2, §3.E) */}
                        {proposal.status === 'pending' && !isExpired && (
                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-200">
                            {onRejectProposal && (
                              <button
                                type="button"
                                data-testid={`reject-proposal-btn-${proposal.id}`}
                                onClick={() => onRejectProposal(proposal)}
                                className="px-3 py-1.5 rounded-lg border border-rose-300 bg-white text-rose-800 text-xs font-medium hover:bg-rose-50 transition-colors cursor-pointer"
                              >
                                Reject Proposal
                              </button>
                            )}
                            {onConfirmProposal && proposal.confirmation_token && (
                              <button
                                type="button"
                                data-testid={`confirm-proposal-btn-${proposal.id}`}
                                onClick={() => onConfirmProposal(proposal, proposal.confirmation_token!)}
                                className="px-4 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                              >
                                <i className="ph ph-check-bold text-xs" />
                                <span>Confirm & Commit Changes</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Phase 2: Committed Changes & Undo Controls (§6.4, §6.5) */}
            <div data-testid="committed-changes-section" className="space-y-3 pt-4 border-t border-[var(--border-parchment)]">
              <div className="flex items-center justify-between pb-1 border-b border-[var(--border-parchment)]">
                <div>
                  <h4 className="serif text-sm font-semibold text-[var(--ink-primary)] flex items-center gap-1.5">
                    <i className="ph ph-git-commit text-emerald-700" />
                    <span>Committed Changes & Provenance</span>
                  </h4>
                  <p className="text-[11px] text-[var(--ink-secondary)]">
                    Permanent mutations recorded in workspace vault. Undo is supported for recoverable prior states.
                  </p>
                </div>
                <span className="mono text-[10px] text-[var(--ink-tertiary)]">
                  Committed: {envelope.committed_changes?.length ?? 0}
                </span>
              </div>

              {!hasCommittedChanges ? (
                <div className="p-5 text-center rounded-xl bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-xs text-[var(--ink-tertiary)] italic">
                  No committed changes recorded for this execution.
                </div>
              ) : (
                <div className="space-y-3">
                  {envelope.committed_changes.map((change, idx) => (
                    <div
                      key={change.change_set_id || change.item_id || idx}
                      data-testid={`committed-change-card-${idx}`}
                      className="p-4 rounded-xl bg-emerald-50/40 border border-emerald-200 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="serif text-xs font-semibold text-emerald-950">
                            Target Record: {change.item_id}
                          </span>
                          {change.item_type && (
                            <span className="mono text-[10px] bg-white text-emerald-900 px-1.5 py-0.2 rounded border border-emerald-300">
                              {change.item_type}
                            </span>
                          )}
                        </div>
                        <span className="mono text-[10px] text-emerald-800">
                          Committed: {new Date(change.committed_at).toLocaleTimeString()}
                        </span>
                      </div>

                      {/* Before / After Diff comparison */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {change.before_state !== undefined && (
                          <div className="p-2.5 rounded bg-white border border-slate-200">
                            <span className="mono text-[10px] uppercase font-semibold text-slate-600 block mb-1">
                              Prior State:
                            </span>
                            <pre className="mono text-[11px] text-[var(--ink-secondary)] overflow-x-auto max-h-32">
                              <code>{JSON.stringify(change.before_state, null, 2)}</code>
                            </pre>
                          </div>
                        )}
                        {change.after_state !== undefined && (
                          <div className="p-2.5 rounded bg-white border border-emerald-200">
                            <span className="mono text-[10px] uppercase font-semibold text-emerald-800 block mb-1">
                              Committed State:
                            </span>
                            <pre className="mono text-[11px] text-emerald-950 overflow-x-auto max-h-32">
                              <code>{JSON.stringify(change.after_state, null, 2)}</code>
                            </pre>
                          </div>
                        )}
                      </div>

                      {/* Undo Control (§6.5) */}
                      {change.undo_supported && onUndoChange && (
                        <div className="flex items-center justify-between pt-2 border-t border-emerald-200 text-xs">
                          <span className="text-[11px] text-emerald-900">
                            Safe undo operation is available for this change set.
                          </span>
                          <button
                            type="button"
                            data-testid={`undo-change-btn-${change.item_id}`}
                            disabled={isUndoing}
                            onClick={() => onUndoChange(change.change_set_id || envelope.execution_id)}
                            className="px-3 py-1 rounded-lg border border-amber-300 bg-white text-amber-900 hover:bg-amber-50 font-medium text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                          >
                            <i className="ph ph-arrow-u-up-left text-xs" />
                            <span>{isUndoing ? 'Reverting...' : 'Undo Change'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 4: ENVELOPE INSPECTOR ================= */}
        {activeTab === 'raw' && (
          <div data-testid="raw-envelope-view" className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="serif text-xs font-semibold text-[var(--ink-primary)]">
                Complete Canon Result Envelope (§9)
              </span>
              <button
                type="button"
                onClick={() => setIsRawExpanded(!isRawExpanded)}
                className="text-[11px] mono text-[var(--accent-midnight)] underline hover:text-[var(--accent-terracotta)] cursor-pointer"
              >
                {isRawExpanded ? 'Collapse' : 'Expand All'}
              </button>
            </div>
            <pre className="p-4 rounded-xl bg-[#162135] text-[#FAF8F2] mono text-xs overflow-x-auto leading-relaxed border border-[#2D3F5E] max-h-96">
              <code>{JSON.stringify(envelope, null, 2)}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
