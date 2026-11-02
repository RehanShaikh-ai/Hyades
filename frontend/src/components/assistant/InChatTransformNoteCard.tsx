import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Sliders,
  Minimize2,
  Maximize2,
  Target,
  Layout,
  Pencil,
  Share2,
  BookOpen,
  ShieldCheck,
  Eye,
  FileText,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Loader2,
  Edit3,
  Search,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';

export interface TransformProposalItem {
  id: string;
  type?: string;
  title: string;
  proposed_text: string;
  target_section?: string;
  evidence_basis?: string;
  supporting_evidence?: string | null;
  source_id?: string | null;
  source_title?: string | null;
  source_type?: string | null;
  chunk_id?: string | null;
  rationale?: string;
  status?: 'pending' | 'accepted' | 'rejected';
}

export interface InChatTransformNoteCardProps {
  proposal?: {
    proposalId?: string;
    confirmationToken?: string;
    actionId?: string;
    command?: string;
    commandName?: string;
    message?: string;
    status?: 'preview' | 'committed' | 'cancelled' | 'committing';
    data?: Record<string, any>;
    affectedItemIds?: string[];
  };
  result?: {
    command?: string;
    actionId?: string;
    status?: string;
    message?: string;
    data?: Record<string, any>;
  };
  isCommitting?: boolean;
  onConfirm?: (overrides?: Record<string, any>) => void;
  onCancel?: () => void;
  onPreviewArtifact?: (artifact: {
    title: string;
    content: string;
    type: string;
    subtitle?: string;
  }) => void;
  onNavigateToItem?: (id: string, itemType: string) => void;
  onRunCommand?: (commandText: string) => void;
  onOpenDocumentPanel?: (draftData: any) => void;
}

const OPERATION_ICONS: Record<string, React.ReactNode> = {
  enrich: <Sparkles size={16} className="text-[var(--accent-terracotta)]" />,
  shorten: <Minimize2 size={16} className="text-[var(--accent-terracotta)]" />,
  expand: <Maximize2 size={16} className="text-[var(--accent-terracotta)]" />,
  simplify: <Target size={16} className="text-[var(--accent-terracotta)]" />,
  restructure: <Layout size={16} className="text-[var(--accent-terracotta)]" />,
  improve: <Pencil size={16} className="text-[var(--accent-terracotta)]" />,
  connect: <Share2 size={16} className="text-[var(--accent-terracotta)]" />,
  study: <BookOpen size={16} className="text-[var(--accent-terracotta)]" />,
  audit: <ShieldCheck size={16} className="text-[var(--accent-terracotta)]" />,
};

/**
 * 3-Step Progress Indicator matching visual specification:
 * 1 Operation · 2 Note · 3 Result
 */
const WorkflowProgressIndicator: React.FC<{ step: 1 | 2 | 3 }> = ({ step }) => {
  return (
    <div
      data-testid="workflow-progress-indicator"
      className="flex items-center gap-2 sm:gap-2.5 text-xs shrink-0 select-none font-medium ml-auto"
    >
      {/* Step 1: Operation */}
      <div
        className={`flex items-center gap-1.5 ${
          step === 1
            ? 'text-[#C85A32] font-bold'
            : step > 1
            ? 'text-[#8B5E3C]'
            : 'text-stone-400'
        }`}
      >
        <div
          className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[10px] sm:text-[11px] font-mono ${
            step === 1
              ? 'bg-[#C85A32] text-white font-bold'
              : step > 1
              ? 'bg-[#FBF0EA] text-[#C85A32] border border-[#F0D5C7]'
              : 'border border-stone-300 text-stone-400'
          }`}
        >
          {step > 1 ? <Check size={11} strokeWidth={3} /> : '1'}
        </div>
        <span className="hidden xs:inline sm:inline">Operation</span>
      </div>

      <span className="text-stone-300">·</span>

      {/* Step 2: Note */}
      <div
        className={`flex items-center gap-1.5 ${
          step === 2
            ? 'text-[#C85A32] font-bold'
            : step > 2
            ? 'text-[#8B5E3C]'
            : 'text-stone-400'
        }`}
      >
        <div
          className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[10px] sm:text-[11px] font-mono ${
            step === 2
              ? 'bg-[#C85A32] text-white font-bold'
              : step > 2
              ? 'bg-[#FBF0EA] text-[#C85A32] border border-[#F0D5C7]'
              : 'border border-stone-300 text-stone-400'
          }`}
        >
          {step > 2 ? <Check size={11} strokeWidth={3} /> : '2'}
        </div>
        <span className="hidden xs:inline sm:inline">Note</span>
      </div>

      <span className="text-stone-300">·</span>

      {/* Step 3: Result */}
      <div
        className={`flex items-center gap-1.5 ${
          step === 3 ? 'text-[#C85A32] font-bold' : 'text-stone-400'
        }`}
      >
        <div
          className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[10px] sm:text-[11px] font-mono ${
            step === 3
              ? 'bg-[#C85A32] text-white font-bold'
              : 'border border-stone-300 text-stone-400'
          }`}
        >
          3
        </div>
        <span className="hidden xs:inline sm:inline">Result</span>
      </div>
    </div>
  );
};

export const InChatTransformNoteCard: React.FC<InChatTransformNoteCardProps> = ({
  proposal,
  result,
  isCommitting = false,
  onConfirm,
  onCancel,
  onPreviewArtifact,
  onNavigateToItem,
  onRunCommand,
  onOpenDocumentPanel,
}) => {
  const data = proposal?.data || result?.data || {};
  const operation = (data.operation || 'enrich').toLowerCase();
  const cardType = data.card_type || (proposal ? 'transform_proposal' : 'completed');
  const isCommitted = proposal?.status === 'committed';
  const isCancelled = proposal?.status === 'cancelled';

  // Step 1: Operation Selection State
  const [selectedOperation, setSelectedOperation] = useState<string | null>(null);

  // Step 2: Note Selection State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  // Proposals list for enrich
  const rawProposals: TransformProposalItem[] = Array.isArray(data.proposals) ? data.proposals : [];
  const [selectedMap, setSelectedMap] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    rawProposals.forEach((p) => {
      init[p.id] = p.status !== 'rejected';
    });
    return init;
  });
  const [expandedEvidenceMap, setExpandedEvidenceMap] = useState<Record<string, boolean>>({});
  const [isEditingInline, setIsEditingInline] = useState(false);
  const [editedTextMap, setEditedTextMap] = useState<Record<string, string>>({});

  const isTextTransform = ['shorten', 'expand', 'simplify', 'restructure', 'improve'].includes(
    operation
  );

  const selectedCount = useMemo(() => {
    return Object.values(selectedMap).filter(Boolean).length;
  }, [selectedMap]);

  const toggleProposal = (id: string) => {
    if (isCommitted || isCancelled || isCommitting) return;
    setSelectedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const toggleEvidence = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedEvidenceMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleApplyEnrichChanges = () => {
    if (!onConfirm) return;
    const selectedIds = Object.keys(selectedMap).filter((id) => selectedMap[id]);
    onConfirm({
      selected_proposal_ids: selectedIds,
      edited_proposals: editedTextMap,
    });
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Step 1: Operations Grid (/transform-note options or bare /transform-note)
  // Requires explicit operation selection + Confirm Operation button click!
  // ───────────────────────────────────────────────────────────────────────────
  if (cardType === 'transform_options' || operation === 'options') {
    const operationsList = Array.isArray(data.operations) ? data.operations : [];
    const activeOpMeta = operationsList.find(
      (op: any) => op.operation === selectedOperation
    );

    return (
      <div
        data-testid="transform-note-options-card"
        className="card-surface mt-3 p-4 sm:p-5 rounded-2xl border border-[var(--border-parchment)] bg-[#FAF8F2] shadow-xs flex flex-col gap-4 max-w-4xl text-[var(--ink-primary)] animate-fade-in"
      >
        {/* Header with 3-Step Progress Indicator */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-parchment)] pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-white border border-[var(--border-parchment)] flex items-center justify-center shrink-0 shadow-2xs">
              <Sliders size={17} className="text-[var(--accent-midnight)]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-serif font-bold text-sm sm:text-base text-[var(--ink-primary)] tracking-tight">
                /transform-note — Intelligent note operations
              </span>
              <span className="text-xs text-[var(--ink-secondary)]">
                Transform, improve, and develop your notes. Choose an operation to continue.
              </span>
            </div>
          </div>

          <WorkflowProgressIndicator step={1} />
        </div>

        {/* 9-Card Interactive Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {operationsList.map((op: any) => {
            const isSelected = selectedOperation === op.operation;

            return (
              <button
                key={op.operation}
                type="button"
                data-testid={`transform-option-${op.operation}`}
                onClick={() => setSelectedOperation(op.operation)}
                className={`p-3 rounded-xl border transition-all text-left flex flex-col gap-1.5 cursor-pointer select-none relative group ${
                  isSelected
                    ? 'bg-[#FBF0EA] border-[#C85A32] shadow-2xs'
                    : 'bg-white/80 border-[var(--border-parchment)] hover:bg-[#FBF0EA]/50 hover:border-[#C85A32]/40 shadow-2xs'
                }`}
              >
                {/* Checkmark badge when selected */}
                {isSelected && (
                  <div className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-[#C85A32] text-white flex items-center justify-center shadow-xs">
                    <Check size={11} strokeWidth={3} />
                  </div>
                )}

                <div className="w-6 h-6 rounded-md bg-white border border-[var(--border-parchment)] flex items-center justify-center shrink-0">
                  {OPERATION_ICONS[op.operation] || <Sparkles size={14} className="text-[var(--accent-terracotta)]" />}
                </div>
                <div
                  className={`font-bold text-xs transition-colors ${
                    isSelected ? 'text-[#C85A32]' : 'text-[var(--ink-primary)] group-hover:text-[var(--accent-terracotta)]'
                  }`}
                >
                  {op.title || op.name || op.operation}
                </div>
                <div className="text-[11px] text-[var(--ink-secondary)] leading-tight line-clamp-2">
                  {op.description}
                </div>
              </button>
            );
          })}
        </div>

        {/* Confirmation Bar when operation is selected */}
        {selectedOperation && activeOpMeta ? (
          <div
            data-testid="operation-confirmation-bar"
            className="pt-3 border-t border-[var(--border-parchment)] flex items-center justify-between gap-3 flex-wrap animate-fade-in"
          >
            <div className="text-xs text-[var(--ink-primary)]">
              <span className="font-bold text-[#C85A32]">
                Selected: {activeOpMeta.title || activeOpMeta.operation}
              </span>{' '}
              ·{' '}
              <span className="text-[var(--ink-secondary)]">
                {activeOpMeta.description}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="btn-cancel-operation"
                onClick={() => {
                  setSelectedOperation(null);
                  onCancel?.();
                }}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-parchment)] hover:bg-white text-xs font-medium text-[var(--ink-secondary)] transition-colors cursor-pointer shadow-2xs"
              >
                Cancel
              </button>

              <button
                type="button"
                data-testid="btn-confirm-operation"
                onClick={() => {
                  if (onRunCommand) {
                    onRunCommand(`/transform-note ${selectedOperation}`);
                  }
                }}
                className="px-4 py-1.5 rounded-lg bg-[#C85A32] text-white hover:bg-[#B34D28] text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
              >
                <span>Confirm Operation</span>
                <ArrowRight size={13} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        ) : (
          /* Usage / Example Footer if no operation selected */
          <div className="pt-2 border-t border-[var(--border-parchment)] flex items-center gap-2.5 flex-wrap text-xs">
            <span className="px-2 py-0.5 rounded-md bg-[#FAF5EE] border border-[#E8DFD3] text-[11px] font-semibold text-[#8B5E3C]">
              Usage
            </span>
            <span className="px-2.5 py-1 rounded-full bg-white border border-[var(--border-parchment)] text-[11.5px] font-mono text-[var(--ink-secondary)] shadow-2xs">
              <code>/transform-note &lt;operation&gt; "&lt;note title&gt;"</code>
            </span>
            <span className="text-xs text-[var(--ink-tertiary)] ml-auto italic">
              Click an operation above and confirm to proceed.
            </span>
          </div>
        )}
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Step 2: Interactive Note Selection (/transform-note <op>)
  // Requires explicit note selection + Confirm Note button click!
  // ───────────────────────────────────────────────────────────────────────────
  if (cardType === 'select_note' || data.card_type === 'select_note') {
    const notesList: Array<{
      id: string;
      title: string;
      word_count?: number;
      updated_at_relative?: string;
    }> = Array.isArray(data.notes) ? data.notes : [];

    const filteredNotes = notesList.filter((n) =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const targetOp = operation || data.operation || 'shorten';
    const selectedNoteObj = notesList.find((n) => n.id === selectedNoteId);

    return (
      <div
        data-testid="transform-note-select-card"
        className="card-surface mt-3 p-4 sm:p-5 rounded-2xl border border-[var(--border-parchment)] bg-[#FAF8F2] shadow-xs flex flex-col gap-3.5 max-w-3xl text-[var(--ink-primary)] animate-fade-in"
      >
        {/* Header with 3-Step Progress Indicator */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-parchment)] pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#FAF5EE] border border-[#E8DFD3] flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
              <FileText size={18} className="text-[#8B5E3C]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-serif font-bold text-sm sm:text-base text-[var(--ink-primary)] tracking-tight">
                Select a note to {targetOp}
              </span>
              <span className="text-xs text-[var(--ink-secondary)]">
                Choose a note from your workspace.
              </span>
            </div>
          </div>

          <WorkflowProgressIndicator step={2} />
        </div>

        {/* Search input + Note count pill */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none"
            />
            <input
              type="text"
              data-testid="select-note-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes..."
              className="w-full pl-9 pr-3.5 py-1.5 text-xs rounded-full border border-[var(--border-parchment)] bg-white text-[var(--ink-primary)] placeholder-stone-400 outline-none focus:border-[#C85A32] transition-all shadow-2xs"
            />
          </div>
          <span
            data-testid="select-note-count-pill"
            className="px-3 py-1 rounded-full bg-white border border-[var(--border-parchment)] text-xs text-[var(--ink-secondary)] font-mono shrink-0 shadow-2xs"
          >
            {filteredNotes.length} {filteredNotes.length === 1 ? 'note' : 'notes'}
          </span>
        </div>

        {/* Notes list */}
        <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto pr-1">
          {filteredNotes.length === 0 ? (
            <div className="p-4 text-center text-xs text-[var(--ink-secondary)] italic">
              No matching notes found in this workspace.
            </div>
          ) : (
            filteredNotes.map((note) => {
              const isSelected = selectedNoteId === note.id;
              return (
                <div
                  key={note.id}
                  data-testid={`select-note-item-${note.id}`}
                  onClick={() => setSelectedNoteId(note.id)}
                  className={`px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 select-none ${
                    isSelected
                      ? 'bg-[#FBF0EA] border-[#C85A32] shadow-2xs'
                      : 'bg-white/80 border-[var(--border-parchment)]/80 hover:bg-[#FBF0EA]/50 hover:border-[#C85A32]/40 shadow-2xs'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'border-[#C85A32] bg-[#C85A32]'
                          : 'border-stone-300 bg-white hover:border-[#C85A32]'
                      }`}
                    >
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="font-bold text-xs sm:text-[13px] text-[var(--ink-primary)] truncate">
                      {note.title}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--ink-secondary)] font-mono shrink-0">
                    {note.word_count !== undefined
                      ? `${note.word_count.toLocaleString()} words · `
                      : ''}
                    {note.updated_at_relative || 'Updated recently'}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Note Confirmation Bar with Back and Confirm Note buttons */}
        <div
          data-testid="note-confirmation-bar"
          className="pt-3 border-t border-[var(--border-parchment)] flex items-center justify-between gap-3 flex-wrap"
        >
          <div className="text-xs text-[var(--ink-secondary)]">
            {selectedNoteObj ? (
              <span className="font-medium text-[#C85A32]">
                1 note selected: <strong>{selectedNoteObj.title}</strong>
              </span>
            ) : (
              <span>Select a note to continue.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="btn-back-to-operations"
              onClick={() => {
                if (onRunCommand) {
                  onRunCommand('/transform-note');
                }
              }}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-parchment)] hover:bg-white text-xs font-medium text-[var(--ink-secondary)] flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
            >
              <ArrowLeft size={12} />
              <span>Back</span>
            </button>

            <button
              type="button"
              data-testid="btn-confirm-note"
              disabled={!selectedNoteObj}
              onClick={() => {
                if (selectedNoteObj && onRunCommand) {
                  onRunCommand(`/transform-note ${targetOp} "${selectedNoteObj.title}"`);
                }
              }}
              className="px-4 py-1.5 rounded-lg bg-[#C85A32] text-white hover:bg-[#B34D28] text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>Confirm Note</span>
              <ArrowRight size={13} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Sub-view 3: Audit Findings (/transform-note audit)
  // ───────────────────────────────────────────────────────────────────────────
  if (cardType === 'transform_audit' || operation === 'audit') {
    const findings: any[] = Array.isArray(data.findings) ? data.findings : [];

    return (
      <div
        data-testid="transform-note-audit-card"
        className="card-surface mt-3 p-4 sm:p-5 rounded-2xl border border-[var(--border-parchment)] bg-[#FAF8F2] shadow-xs flex flex-col gap-3.5 max-w-2xl text-[var(--ink-primary)] animate-fade-in"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FAF5EE] border border-[#E8DFD3] flex items-center justify-center shrink-0">
              <ShieldCheck size={18} className="text-[#8B5E3C]" />
            </div>
            <div className="flex flex-col">
              <span className="font-serif font-bold text-sm text-[var(--ink-primary)]">
                Note Audit · {data.title || 'Target Note'}
              </span>
              <span className="text-[11px] text-[var(--ink-secondary)]">
                Evaluated claims, logical consistency, terminology, and edge cases.
              </span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-[11px] font-mono font-medium text-stone-700">
            {findings.length} Finding(s)
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {findings.map((f, idx) => {
            const isConcern = f.severity === 'concern';
            const isWarning = f.severity === 'warning';
            return (
              <div
                key={f.id || idx}
                className="p-3 rounded-xl bg-white border border-[var(--border-parchment)] flex flex-col gap-1.5 shadow-2xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--ink-primary)]">
                    {f.section}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-bold ${
                      isConcern
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : isWarning
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : 'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}
                  >
                    {f.severity}
                  </span>
                </div>
                {f.claim && (
                  <div className="text-[11.5px] italic text-[var(--ink-secondary)] bg-[#FAF8F2] p-1.5 rounded border border-[var(--border-parchment)]/60">
                    "{f.claim}"
                  </div>
                )}
                <p className="text-xs text-[var(--ink-primary)] leading-relaxed">
                  {f.critique}
                </p>
                <div className="text-[11px] text-[var(--accent-midnight)] font-medium flex items-center gap-1 mt-0.5">
                  <span className="font-bold">Recommendation:</span> {f.recommendation}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Sub-view 4: Candidate Connections (/transform-note connect)
  // ───────────────────────────────────────────────────────────────────────────
  if (cardType === 'transform_connections' || operation === 'connect') {
    const connections: any[] = Array.isArray(data.connections) ? data.connections : [];

    return (
      <div
        data-testid="transform-note-connect-card"
        className="card-surface mt-3 p-4 sm:p-5 rounded-2xl border border-[var(--border-parchment)] bg-[#FAF8F2] shadow-xs flex flex-col gap-3.5 max-w-2xl text-[var(--ink-primary)] animate-fade-in"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FAF5EE] border border-[#E8DFD3] flex items-center justify-center shrink-0">
              <Share2 size={18} className="text-[var(--accent-terracotta)]" />
            </div>
            <div className="flex flex-col">
              <span className="font-serif font-bold text-sm text-[var(--ink-primary)]">
                Connect Note · {data.title || 'Target Note'}
              </span>
              <span className="text-[11px] text-[var(--ink-secondary)]">
                Candidate relationships discovered across your workspace.
              </span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-white border border-[var(--border-parchment)] text-[11px] font-mono text-[var(--ink-secondary)]">
            {connections.length} candidate(s)
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {connections.map((c, idx) => (
            <div
              key={c.target_note_id || idx}
              className="p-3 rounded-xl bg-white border border-[var(--border-parchment)] flex items-center justify-between gap-3 shadow-2xs"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-serif font-bold text-[var(--ink-primary)] truncate">
                  {c.target_note_title}
                </span>
                <span className="text-[11px] text-[var(--ink-secondary)] leading-relaxed">
                  {c.rationale}
                </span>
              </div>
              {onRunCommand && (
                <button
                  type="button"
                  onClick={() =>
                    onRunCommand(
                      `/link-notes "${data.title || ''}" "${c.target_note_title}"`
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-xs font-medium text-[var(--accent-midnight)] shrink-0 transition-colors cursor-pointer shadow-2xs"
                >
                  Link Notes
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Step 3 / Result: Text Transformation Summary Card with Document Panel Action
  // ───────────────────────────────────────────────────────────────────────────
  const opLabel = operation.charAt(0).toUpperCase() + operation.slice(1);
  const headerTitle = `Transform Note · ${opLabel}`;

  if (isTextTransform) {
    const origWords =
      data.original_word_count ??
      (data.original_content
        ? data.original_content.split(/\s+/).filter(Boolean).length
        : 0);
    const proposedWords =
      data.proposed_word_count ??
      (data.proposed_content
        ? data.proposed_content.split(/\s+/).filter(Boolean).length
        : 0);
    const pctChange =
      data.word_count_change_percent ??
      (origWords > 0 ? Math.round(((proposedWords - origWords) / origWords) * 100) : 0);
    const sign = pctChange > 0 ? '+' : '';
    const pctStr = `(${sign}${pctChange}%)`;

    const pastTenseOp =
      operation === 'shorten'
        ? 'shortened'
        : operation === 'expand'
        ? 'expanded'
        : operation === 'simplify'
        ? 'simplified'
        : operation === 'restructure'
        ? 'restructured'
        : 'improved';
    const textSubtitle =
      data.summary || `Prepared a ${pastTenseOp} version of "${data.title || 'Note'}".`;

    const whatChangedList: string[] =
      Array.isArray(data.what_changed) && data.what_changed.length > 0
        ? data.what_changed
        : [
            operation === 'shorten'
              ? 'Condensed verbose explanations and redundant details.'
              : operation === 'expand'
              ? 'Expanded core technical mechanisms with concrete details.'
              : operation === 'simplify'
              ? 'Clarified complex terminology with intuitive explanations.'
              : operation === 'restructure'
              ? 'Reorganized content into clear hierarchical sections.'
              : 'Polished phrasing, tone, and overall prose clarity.',
            operation === 'shorten'
              ? 'Reorganized content for clearer flow.'
              : operation === 'expand'
              ? 'Added architectural context and illustrative examples.'
              : operation === 'simplify'
              ? 'Streamlined sentence structures for better readability.'
              : operation === 'restructure'
              ? 'Structured key takeaways and conceptual progression.'
              : 'Eliminated repetitive phrasing and tightened transitions.',
            'Preserved key concepts, definitions, and technical accuracy.',
          ];

    const openPanelHandler = () => {
      if (onOpenDocumentPanel) {
        onOpenDocumentPanel({
          ...data,
          proposalId: proposal?.proposalId || data.proposal_id,
          confirmationToken: proposal?.confirmationToken || data.confirmation_token,
          actionId: proposal?.actionId || result?.actionId,
          command: proposal?.command || result?.command,
        });
      }
    };

    return (
      <div
        data-testid="transform-note-proposal-card"
        className="card-surface mt-3 p-4 sm:p-5 rounded-2xl border border-[var(--border-parchment)] bg-[#FAF8F2] shadow-xs flex flex-col gap-3.5 max-w-2xl text-[var(--ink-primary)] animate-fade-in"
      >
        {/* Header with Step 3 Progress Indicator */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-parchment)] pb-2.5">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FBF0EA] border border-[#F0D5C7] flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
              {OPERATION_ICONS[operation] || <Minimize2 size={16} className="text-[var(--accent-terracotta)]" />}
            </div>
            <div className="flex flex-col">
              <span className="font-serif font-bold text-sm sm:text-base text-[var(--ink-primary)] tracking-tight">
                {headerTitle}
              </span>
              <span className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                {textSubtitle}
              </span>
              <div className="flex items-center gap-1.5 mt-1 font-mono text-xs text-[var(--ink-secondary)]">
                <FileText size={12} className="text-[#8B5E3C]" />
                <span>
                  Original: {origWords.toLocaleString()} words → Proposed: {proposedWords.toLocaleString()} words {pctStr}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <WorkflowProgressIndicator step={3} />
            {isCommitted ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 shrink-0 mt-1">
                <CheckCircle2 size={12} /> Committed
              </span>
            ) : isCancelled ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-stone-500 bg-stone-100 px-2.5 py-0.5 rounded-full border border-stone-200 shrink-0 mt-1">
                <XCircle size={12} /> Cancelled
              </span>
            ) : null}
          </div>
        </div>

        {/* What Changed Points */}
        <div className="flex flex-col gap-2">
          <span className="font-bold text-xs text-[var(--ink-primary)]">
            What changed
          </span>
          <div className="flex flex-col gap-1.5">
            {whatChangedList.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-[var(--ink-primary)] leading-snug">
                <Check size={14} className="text-emerald-600 shrink-0 mt-0.5" strokeWidth={2.5} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Document Panel Launch Banner */}
        <div className="p-3.5 rounded-xl bg-white border border-[var(--border-parchment)] flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-xs text-[var(--ink-primary)]">
              Document Preview &amp; Editor
            </span>
            <span className="text-[11px] text-[var(--ink-secondary)]">
              Read formatted markdown, inspect unified changes, or edit before applying.
            </span>
          </div>

          <button
            type="button"
            data-testid="btn-open-document-panel"
            onClick={openPanelHandler}
            className="px-3.5 py-1.5 rounded-lg bg-[#1B2A4A] text-white hover:bg-[#24365C] text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <Eye size={13} />
            <span>Open Document Panel</span>
          </button>
        </div>

        {/* Inline Footer Controls */}
        {!isCommitted && !isCancelled && (
          <div className="flex items-center justify-between pt-1 border-t border-[var(--border-parchment)]">
            <button
              type="button"
              data-testid="btn-cancel-transformation"
              onClick={onCancel}
              disabled={isCommitting}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-parchment)] hover:bg-[var(--bg-panel-subtle)] text-xs text-[var(--ink-secondary)] font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              data-testid="btn-apply-changes"
              onClick={() => onConfirm?.({ content: data.proposed_content })}
              disabled={isCommitting}
              className="px-4 py-1.5 rounded-lg bg-[#1B2A4A] text-white hover:bg-[#24365C] text-xs font-medium flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isCommitting ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  <span>Applying...</span>
                </>
              ) : (
                <>
                  <Check size={13} strokeWidth={2.5} />
                  <span>Apply Changes</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Sub-view 6: Evidence-Aware Enrichment Proposal Review (for /transform-note enrich & /enrich-note)
  // Preserves multi-item proposals with checkboxes, citations, quotes, and provenance links.
  // ───────────────────────────────────────────────────────────────────────────
  const enrichSubtitle =
    data.summary ||
    `Analyzed the note, identified knowledge gaps, and prepared ${rawProposals.length} enrichment proposals with supporting evidence.`;

  return (
    <div
      data-testid="transform-note-proposal-card"
      className="card-surface mt-3 p-4 sm:p-5 rounded-2xl border border-[var(--border-parchment)] bg-[#FAF8F2] shadow-xs flex flex-col gap-3.5 max-w-2xl text-[var(--ink-primary)] animate-fade-in"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#FBF0EA] border border-[#F0D5C7] flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
            {OPERATION_ICONS[operation] || <Sparkles size={16} className="text-[var(--accent-terracotta)]" />}
          </div>
          <div className="flex flex-col">
            <span className="font-serif font-bold text-sm sm:text-base text-[var(--ink-primary)] tracking-tight">
              {headerTitle}
            </span>
            <span className="text-xs text-[var(--ink-secondary)] leading-relaxed">
              {enrichSubtitle}
            </span>
          </div>
        </div>

        {/* Status Pill */}
        {isCommitted ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 shrink-0">
            <CheckCircle2 size={12} /> Committed
          </span>
        ) : isCancelled ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-stone-500 bg-stone-100 px-2.5 py-0.5 rounded-full border border-stone-200 shrink-0">
            <XCircle size={12} /> Cancelled
          </span>
        ) : null}
      </div>

      {/* Proposals List with Evidence Citations */}
      <div className="flex flex-col gap-2">
        {rawProposals.map((prop) => {
          const isChecked = Boolean(selectedMap[prop.id]);
          const isExpanded = Boolean(expandedEvidenceMap[prop.id]);
          const provenanceTitle = prop.source_title || 'Workspace Evidence';

          return (
            <div
              key={prop.id}
              data-testid={`proposal-item-${prop.id}`}
              onClick={() => toggleProposal(prop.id)}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                isChecked
                  ? 'bg-white border-[var(--border-parchment)] shadow-2xs'
                  : 'bg-white/60 border-[var(--border-parchment)]/60 opacity-70'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                {/* Left: Checkbox + Title & Description */}
                <div className="flex items-start gap-2.5 min-w-0">
                  <button
                    type="button"
                    aria-label={isChecked ? 'Deselect proposal' : 'Select proposal'}
                    className={`w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 mt-0.5 transition-colors cursor-pointer ${
                      isChecked
                        ? 'bg-[var(--accent-terracotta)] border-[var(--accent-terracotta)] text-white'
                        : 'border-[var(--border-strong)] bg-white'
                    }`}
                  >
                    {isChecked && <Check size={11} strokeWidth={3} />}
                  </button>

                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-serif font-bold text-xs sm:text-[13px] text-[var(--ink-primary)] leading-snug">
                      {prop.title}
                    </span>
                    {isEditingInline ? (
                      <textarea
                        value={editedTextMap[prop.id] ?? prop.proposed_text}
                        onChange={(e) => {
                          e.stopPropagation();
                          setEditedTextMap((prev) => ({
                            ...prev,
                            [prop.id]: e.target.value,
                          }));
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full text-xs font-mono p-2 rounded border border-[var(--border-parchment)] bg-white text-[var(--ink-primary)] mt-1"
                        rows={3}
                      />
                    ) : (
                      <span className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                        {editedTextMap[prop.id] ?? prop.proposed_text}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Provenance Tag & Expand Chevron */}
                {provenanceTitle && (
                  <div
                    onClick={(e) => {
                      if (prop.source_id && onNavigateToItem) {
                        onNavigateToItem(prop.source_id, prop.source_type || 'source');
                      }
                      toggleEvidence(prop.id, e);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FAF8F2] border border-[var(--border-parchment)] text-[11px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors shrink-0 max-w-[200px] sm:max-w-[240px]"
                    title="Click to view supporting passage"
                  >
                    <BookOpen size={12} className="text-[var(--accent-terracotta)] shrink-0" />
                    <span className="truncate font-medium">{provenanceTitle}</span>
                    <ExternalLink size={10} className="shrink-0 text-[var(--ink-tertiary)]" />
                    {isExpanded ? (
                      <ChevronUp size={11} className="shrink-0 text-[var(--ink-tertiary)]" />
                    ) : (
                      <ChevronDown size={11} className="shrink-0 text-[var(--ink-tertiary)]" />
                    )}
                  </div>
                )}
              </div>

              {/* Expandable Supporting Passage */}
              {isExpanded && prop.supporting_evidence && (
                <div className="mt-1 p-2.5 rounded-lg bg-[#FAF8F4] border border-[#EAE3D9] text-[11px] text-[var(--ink-secondary)] flex flex-col gap-1">
                  <span className="font-mono uppercase tracking-wider text-[10px] text-[var(--accent-terracotta)] font-semibold">
                    Supporting Passage
                  </span>
                  <p className="italic leading-relaxed font-serif">"{prop.supporting_evidence}"</p>
                  {prop.rationale && (
                    <span className="text-[10.5px] text-[var(--ink-tertiary)] mt-0.5">
                      Rationale: {prop.rationale}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Action Footer for Enrichment */}
      {!isCommitted && !isCancelled && (
        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-parchment)] flex-wrap gap-2">
          {/* Left: Preview button */}
          <div className="flex items-center gap-1.5">
            {onOpenDocumentPanel ? (
              <button
                type="button"
                data-testid="btn-open-document-panel"
                onClick={() => onOpenDocumentPanel(data)}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--border-parchment)] hover:bg-white bg-white/70 text-xs text-[var(--ink-primary)] font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <Eye size={13} className="text-[var(--accent-midnight)]" />
                <span>Open Document Panel</span>
              </button>
            ) : (
              <button
                type="button"
                data-testid="btn-preview-full-note"
                onClick={() => {
                  if (onPreviewArtifact) {
                    onPreviewArtifact({
                      title: data.title || 'Transformed Note',
                      content: data.proposed_content || data.original_content || '',
                      type: 'Note',
                      subtitle: `Full Transformed Note (${operation})`,
                    });
                  }
                }}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--border-parchment)] hover:bg-white bg-white/70 text-xs text-[var(--ink-primary)] font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <Eye size={13} className="text-[var(--accent-midnight)]" />
                <span>Preview: Full Note</span>
              </button>
            )}
          </div>

          {/* Right: Counter + Edit + Cancel + Apply Changes */}
          <div className="flex items-center gap-2">
            <span
              data-testid="selected-count-label"
              className="text-xs text-[var(--ink-secondary)] font-medium"
            >
              {selectedCount} selected
            </span>

            <button
              type="button"
              data-testid="btn-edit-proposals"
              onClick={() => setIsEditingInline((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer shadow-2xs ${
                isEditingInline
                  ? 'bg-[var(--accent-midnight)] text-white border-[var(--accent-midnight)]'
                  : 'bg-white hover:bg-[var(--bg-panel-subtle)] border-[var(--border-parchment)] text-[var(--ink-primary)]'
              }`}
            >
              <Edit3 size={12} />
              <span>{isEditingInline ? 'Done' : 'Edit'}</span>
            </button>

            <button
              type="button"
              data-testid="btn-cancel-transformation"
              onClick={onCancel}
              disabled={isCommitting}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-parchment)] hover:bg-[var(--bg-panel-subtle)] text-xs text-[var(--ink-secondary)] font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              data-testid="btn-apply-changes"
              onClick={handleApplyEnrichChanges}
              disabled={isCommitting || selectedCount === 0}
              className="px-4 py-1.5 rounded-lg bg-[#1B2A4A] text-white hover:bg-[#24365C] text-xs font-medium flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isCommitting ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  <span>Applying...</span>
                </>
              ) : (
                <>
                  <Check size={13} strokeWidth={2.5} />
                  <span>Apply Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
