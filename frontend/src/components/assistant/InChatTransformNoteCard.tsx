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

function computeSimpleDiff(orig: string, proposed: string): string[] {
  const origLines = orig.split('\n');
  const propLines = proposed.split('\n');
  const res: string[] = [];
  let i = 0;
  let j = 0;
  while (i < origLines.length || j < propLines.length) {
    if (i < origLines.length && j < propLines.length && origLines[i] === propLines[j]) {
      res.push(`  ${origLines[i]}`);
      i++;
      j++;
    } else if (i < origLines.length && !propLines.includes(origLines[i])) {
      res.push(`- ${origLines[i]}`);
      i++;
    } else if (j < propLines.length && !origLines.includes(propLines[j])) {
      res.push(`+ ${propLines[j]}`);
      j++;
    } else {
      if (i < origLines.length) res.push(`- ${origLines[i++]}`);
      if (j < propLines.length) res.push(`+ ${propLines[j++]}`);
    }
  }
  return res.slice(0, 50);
}

export const InChatTransformNoteCard: React.FC<InChatTransformNoteCardProps> = ({
  proposal,
  result,
  isCommitting = false,
  onConfirm,
  onCancel,
  onPreviewArtifact,
  onNavigateToItem,
  onRunCommand,
}) => {
  const data = proposal?.data || result?.data || {};
  const operation = (data.operation || 'enrich').toLowerCase();
  const cardType = data.card_type || (proposal ? 'transform_proposal' : 'completed');
  const isCommitted = proposal?.status === 'committed';
  const isCancelled = proposal?.status === 'cancelled';

  // Proposal items list (for enrich)
  const rawProposals: TransformProposalItem[] = Array.isArray(data.proposals) ? data.proposals : [];

  // Track selection per proposal (for enrich)
  const [selectedMap, setSelectedMap] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    rawProposals.forEach((p) => {
      init[p.id] = p.status !== 'rejected';
    });
    return init;
  });

  // Track expanded evidence cards (for enrich)
  const [expandedEvidenceMap, setExpandedEvidenceMap] = useState<Record<string, boolean>>({});

  // Inline editing state (for enrich)
  const [isEditingInline, setIsEditingInline] = useState(false);
  const [editedTextMap, setEditedTextMap] = useState<Record<string, string>>({});

  // Preview mode toggle for enrich: 'full' | 'changes' | null
  const [previewMode, setPreviewMode] = useState<'full' | 'changes' | null>(null);

  // Note selection state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  // Dedicated text transformation state (shorten, expand, simplify, restructure, improve)
  const [textPreviewMode, setTextPreviewMode] = useState<'changes' | 'full'>('changes');
  const [isEditingText, setIsEditingText] = useState(false);
  const [editedProposedContent, setEditedProposedContent] = useState<string>(
    data.proposed_content || ''
  );

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

  const handleApplyChanges = () => {
    if (!onConfirm) return;
    const selectedIds = Object.keys(selectedMap).filter((id) => selectedMap[id]);
    onConfirm({
      selected_proposal_ids: selectedIds,
      edited_proposals: editedTextMap,
    });
  };

  const handlePreviewFullNote = () => {
    if (onPreviewArtifact) {
      onPreviewArtifact({
        title: data.title || 'Transformed Note',
        content: data.proposed_content || data.original_content || '',
        type: 'Note',
        subtitle: `Full Transformed Note (${operation})`,
      });
    } else {
      setPreviewMode((prev) => (prev === 'full' ? null : 'full'));
    }
  };

  const handlePreviewChangesOnly = () => {
    if (onPreviewArtifact) {
      const additionText =
        data.enrichment_addition ||
        rawProposals.map((p) => `### ${p.title}\n${p.proposed_text}`).join('\n\n') ||
        data.proposed_content ||
        '';
      onPreviewArtifact({
        title: `Changes: ${data.title || 'Note'}`,
        content: additionText,
        type: 'Note Diff',
        subtitle: `Proposed Additions (${operation})`,
      });
    } else {
      setPreviewMode((prev) => (prev === 'changes' ? null : 'changes'));
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Sub-view 1: Options Grid (/transform-note options or bare /transform-note)
  // ───────────────────────────────────────────────────────────────────────────
  if (cardType === 'transform_options' || operation === 'options') {
    const operationsList = Array.isArray(data.operations) ? data.operations : [];

    return (
      <div
        data-testid="transform-note-options-card"
        className="card-surface mt-3 p-4 sm:p-5 rounded-2xl border border-[var(--border-parchment)] bg-[#FAF8F2] shadow-xs flex flex-col gap-4 max-w-4xl text-[var(--ink-primary)] animate-fade-in"
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white border border-[var(--border-parchment)] flex items-center justify-center shrink-0 shadow-2xs">
            <Sliders size={17} className="text-[var(--accent-midnight)]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-serif font-bold text-sm sm:text-base text-[var(--ink-primary)] tracking-tight">
              /transform-note — Intelligent note operations
            </span>
            <span className="text-xs text-[var(--ink-secondary)]">
              {data.description || 'Transform, improve, and develop your notes. Choose an operation to continue:'}
            </span>
          </div>
        </div>

        {/* 9-Card Interactive Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {operationsList.map((op: any) => {
            const isEnrich = op.operation === 'enrich';
            return (
              <button
                key={op.operation}
                type="button"
                data-testid={`transform-option-${op.operation}`}
                onClick={() => {
                  if (onRunCommand) {
                    onRunCommand(`/transform-note ${op.operation}`);
                  }
                }}
                className={`p-3 rounded-xl border transition-all text-left flex flex-col gap-1.5 cursor-pointer select-none group ${
                  isEnrich
                    ? 'bg-[#FBF0EA]/60 border-[#C85A32]/30 hover:border-[#C85A32] shadow-2xs'
                    : 'bg-white/70 border-[var(--border-parchment)] hover:bg-[#FBF0EA]/40 hover:border-[#C85A32]/40 shadow-2xs'
                }`}
              >
                <div className="w-6 h-6 rounded-md bg-white border border-[var(--border-parchment)] flex items-center justify-center shrink-0">
                  {OPERATION_ICONS[op.operation] || <Sparkles size={14} className="text-[var(--accent-terracotta)]" />}
                </div>
                <div className="font-bold text-xs text-[var(--ink-primary)] group-hover:text-[var(--accent-terracotta)] transition-colors">
                  {op.title || op.name || op.operation}
                </div>
                <div className="text-[11px] text-[var(--ink-secondary)] leading-tight line-clamp-2">
                  {op.description}
                </div>
              </button>
            );
          })}
        </div>

        {/* Usage & Example Pills Footer matching reference screenshot */}
        <div className="pt-2 border-t border-[var(--border-parchment)] flex items-center gap-2.5 flex-wrap text-xs">
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-md bg-[#FAF5EE] border border-[#E8DFD3] text-[11px] font-semibold text-[#8B5E3C]">
              Usage
            </span>
            <span className="px-2.5 py-1 rounded-full bg-white border border-[var(--border-parchment)] text-[11.5px] font-mono text-[var(--ink-secondary)] shadow-2xs">
              <code>{data.usage || '/transform-note <operation> "<note title>"'}</code>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-md bg-[#FAF5EE] border border-[#E8DFD3] text-[11px] font-semibold text-[#8B5E3C]">
              Example
            </span>
            <button
              type="button"
              onClick={() =>
                onRunCommand?.(
                  data.example ||
                    '/transform-note shorten "The OSI 7-Layer Reference Model and Modern Protocol Stacks"'
                )
              }
              className="px-2.5 py-1 rounded-full bg-white hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-[11.5px] font-mono text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer shadow-2xs"
            >
              <code>
                {data.example ||
                  '/transform-note shorten "The OSI 7-Layer Reference Model..."'}
              </code>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Sub-view 2: Interactive Note Selection (/transform-note <op> without note)
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

    return (
      <div
        data-testid="transform-note-select-card"
        className="card-surface mt-3 p-4 sm:p-5 rounded-2xl border border-[var(--border-parchment)] bg-[#FAF8F2] shadow-xs flex flex-col gap-3.5 max-w-3xl text-[var(--ink-primary)] animate-fade-in"
      >
        {/* Header matching middle screenshot */}
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#FAF5EE] border border-[#E8DFD3] flex items-center justify-center shrink-0 mt-0.5">
            <FileText size={18} className="text-[#8B5E3C]" />
          </div>
          <div className="flex flex-col">
            <span className="font-serif font-bold text-sm sm:text-base text-[var(--ink-primary)] tracking-tight">
              Select a note to {targetOp}
            </span>
            <span className="text-xs text-[var(--ink-secondary)]">
              {data.prompt || 'Choose a note from your workspace:'}
            </span>
          </div>
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
                  onClick={() => {
                    setSelectedNoteId(note.id);
                    if (onRunCommand) {
                      onRunCommand(`/transform-note ${targetOp} "${note.title}"`);
                    }
                  }}
                  className={`px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 select-none ${
                    isSelected
                      ? 'bg-[#FBF0EA] border-[#C85A32]/50 shadow-2xs'
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
  // Sub-view 5: Dedicated Text Transformation Result (shorten, expand, simplify, restructure, improve)
  // Matches bottom reference screenshot exactly:
  // - Clean Header with Stat line (Original words → Proposed words)
  // - Two-column layout: What changed (checkmarks) vs Preview (Changes Only diff / Full Note)
  // - NO Workspace Evidence, NO citations, NO fragmented checkboxes
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

    const diffLines: string[] =
      Array.isArray(data.diff_lines) && data.diff_lines.length > 0
        ? data.diff_lines
        : computeSimpleDiff(data.original_content || '', data.proposed_content || '');

    const handleApplyTextChanges = () => {
      if (!onConfirm) return;
      onConfirm({
        content: editedProposedContent || data.proposed_content,
      });
    };

    return (
      <div
        data-testid="transform-note-proposal-card"
        className="card-surface mt-3 p-4 sm:p-5 rounded-2xl border border-[var(--border-parchment)] bg-[#FAF8F2] shadow-xs flex flex-col gap-3.5 max-w-4xl text-[var(--ink-primary)] animate-fade-in"
      >
        {/* Header matching bottom reference screenshot */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FBF0EA] border border-[#F0D5C7] flex items-center justify-center shrink-0 mt-0.5">
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

        {/* Two-column layout: What changed (Left) | Preview / Diff (Right) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-1">
          {/* Left Column: What changed */}
          <div className="md:col-span-5 flex flex-col gap-2.5">
            <span className="font-bold text-xs text-[var(--ink-primary)]">
              What changed
            </span>
            <div className="flex flex-col gap-2">
              {whatChangedList.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-[var(--ink-primary)] leading-snug">
                  <Check size={14} className="text-emerald-600 shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Preview tabs + Diff / Content Box */}
          <div className="md:col-span-7 flex flex-col gap-2">
            {/* Toolbar: Preview Mode Pills + Edit Button */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="btn-preview-changes-only"
                  onClick={() => setTextPreviewMode('changes')}
                  className={`px-3 py-1 rounded-full text-xs transition-colors cursor-pointer ${
                    textPreviewMode === 'changes'
                      ? 'bg-[#FBF0EA] text-[#C85A32] border border-[#F0D5C7] font-semibold shadow-2xs'
                      : 'bg-white hover:bg-[var(--bg-panel-subtle)] text-[var(--ink-secondary)] border border-[var(--border-parchment)] font-medium shadow-2xs'
                  }`}
                >
                  Preview: Changes Only
                </button>
                <button
                  type="button"
                  data-testid="btn-preview-full-note"
                  onClick={() => setTextPreviewMode('full')}
                  className={`px-3 py-1 rounded-full text-xs transition-colors cursor-pointer ${
                    textPreviewMode === 'full'
                      ? 'bg-[#FBF0EA] text-[#C85A32] border border-[#F0D5C7] font-semibold shadow-2xs'
                      : 'bg-white hover:bg-[var(--bg-panel-subtle)] text-[var(--ink-secondary)] border border-[var(--border-parchment)] font-medium shadow-2xs'
                  }`}
                >
                  Preview: Full Note
                </button>
              </div>

              {!isCommitted && !isCancelled && (
                <button
                  type="button"
                  data-testid="btn-edit-proposals"
                  onClick={() => setIsEditingText((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer shadow-2xs ${
                    isEditingText
                      ? 'bg-[var(--accent-midnight)] text-white border-[var(--accent-midnight)]'
                      : 'bg-white hover:bg-[var(--bg-panel-subtle)] border-[var(--border-parchment)] text-[var(--ink-primary)]'
                  }`}
                >
                  <Edit3 size={12} />
                  <span>{isEditingText ? 'Done' : 'Edit'}</span>
                </button>
              )}
            </div>

            {/* Diff / Content Box */}
            <div className="p-3 rounded-xl bg-white border border-[var(--border-parchment)] font-mono text-[11px] leading-relaxed max-h-64 sm:max-h-72 overflow-y-auto shadow-2xs">
              {isEditingText ? (
                <textarea
                  data-testid="edit-transformed-content-textarea"
                  value={editedProposedContent}
                  onChange={(e) => setEditedProposedContent(e.target.value)}
                  rows={9}
                  className="w-full font-mono text-xs p-2 rounded border border-[var(--border-parchment)] bg-[#FAF8F2] text-[var(--ink-primary)] outline-none focus:border-[#C85A32]"
                />
              ) : textPreviewMode === 'changes' ? (
                <div className="flex flex-col gap-0.5">
                  {diffLines.map((line, idx) => {
                    const isMinus = line.startsWith('-');
                    const isPlus = line.startsWith('+');
                    const isHunk = line.startsWith('@@');

                    if (isMinus) {
                      return (
                        <div
                          key={idx}
                          className="bg-rose-50 text-rose-900 border-l-2 border-rose-400 px-2 py-0.5 my-0.5 rounded-sm whitespace-pre-wrap font-mono"
                        >
                          {line}
                        </div>
                      );
                    }
                    if (isPlus) {
                      return (
                        <div
                          key={idx}
                          className="bg-emerald-50 text-emerald-900 border-l-2 border-emerald-400 px-2 py-0.5 my-0.5 rounded-sm whitespace-pre-wrap font-mono"
                        >
                          {line}
                        </div>
                      );
                    }
                    if (isHunk) {
                      return (
                        <div key={idx} className="text-stone-400 text-[10px] px-2 py-0.5 italic font-mono">
                          {line}
                        </div>
                      );
                    }
                    return (
                      <div key={idx} className="text-stone-600 px-2 py-0.5 whitespace-pre-wrap font-mono">
                        {line}
                      </div>
                    );
                  })}
                  <div className="text-stone-400 px-2 py-0.5 font-mono">...</div>
                </div>
              ) : (
                <div className="whitespace-pre-wrap text-[var(--ink-primary)] font-mono text-xs leading-relaxed">
                  {editedProposedContent || data.proposed_content}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Footer */}
        {!isCommitted && !isCancelled && (
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-parchment)]">
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
              onClick={handleApplyTextChanges}
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
          <div className="w-8 h-8 rounded-lg bg-[#FBF0EA] border border-[#F0D5C7] flex items-center justify-center shrink-0 mt-0.5">
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

      {/* Inline Preview Accordion */}
      {previewMode && (
        <div className="p-3 rounded-xl bg-white border border-[var(--border-parchment)] text-xs flex flex-col gap-2 max-h-60 overflow-y-auto">
          <div className="font-semibold text-xs text-[var(--accent-midnight)] flex items-center justify-between">
            <span>{previewMode === 'full' ? 'Preview: Full Note' : 'Preview: Changes Only'}</span>
            <button
              type="button"
              onClick={() => setPreviewMode(null)}
              className="text-[11px] text-[var(--ink-tertiary)] hover:underline"
            >
              Close
            </button>
          </div>
          <pre className="font-mono text-[11px] whitespace-pre-wrap text-[var(--ink-primary)] leading-relaxed">
            {previewMode === 'full'
              ? data.proposed_content || data.original_content
              : data.enrichment_addition || data.proposed_content}
          </pre>
        </div>
      )}

      {/* Action Footer for Enrichment */}
      {!isCommitted && !isCancelled && (
        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-parchment)] flex-wrap gap-2">
          {/* Left: Preview buttons */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="btn-preview-full-note"
              onClick={handlePreviewFullNote}
              className="px-2.5 py-1.5 rounded-lg border border-[var(--border-parchment)] hover:bg-white bg-white/70 text-xs text-[var(--ink-primary)] font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <Eye size={13} className="text-[var(--accent-midnight)]" />
              <span>Preview: Full Note</span>
            </button>

            <button
              type="button"
              data-testid="btn-preview-changes-only"
              onClick={handlePreviewChangesOnly}
              className="px-2.5 py-1.5 rounded-lg border border-[var(--border-parchment)] hover:bg-white bg-white/70 text-xs text-[var(--ink-primary)] font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <FileText size={13} className="text-[var(--accent-terracotta)]" />
              <span>Preview: Changes Only</span>
            </button>
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
              onClick={handleApplyChanges}
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
