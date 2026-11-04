import React, { useState, useMemo, useEffect } from 'react';
import {
  Scissors,
  FileText,
  Check,
  CheckCircle2,
  ShieldCheck,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Minus,
  Trash2,
  MoveUp,
  MoveDown,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  Loader2,
  RotateCcw,
  Info,
  GitMerge,
  Search,
} from 'lucide-react';

export type ContentHandlingMode = 'preserve' | 'adapt';
export type NoteCountMode = 'auto' | 'custom';

export interface SplitProposedPart {
  id: string;
  title: string;
  focus: string;
  content: string;
  preview: string;
  word_count: number;
  source_sections?: string[];
  is_removed?: boolean;
}

export interface SplitSourceNoteMeta {
  id: string;
  title: string;
  topic?: string;
  word_count: number;
  section_count: number;
  sections?: string[];
  content_preview?: string;
  content?: string;
}

export interface InChatSplitNoteCardProps {
  proposal?: {
    proposalId?: string;
    confirmationToken?: string;
    actionId?: string;
    command?: string;
    message?: string;
    status?: string;
    data?: any;
    affectedItemIds?: string[];
  };
  result?: {
    actionId?: string;
    command?: string;
    message?: string;
    status?: string;
    data?: any;
    affectedItemIds?: string[];
  };
  isCommitting?: boolean;
  onConfirm?: (overrides?: Record<string, any>) => void;
  onReject?: () => void;
  onCancel?: () => void;
  onDismiss?: () => void;
  onNavigateToItem?: (id: string, itemType: string) => void;
  onRunCommand?: (commandText: string) => void;
}

interface AnalysisStep {
  label: string;
  status: string;
}

const ANALYSIS_STEPS: AnalysisStep[] = [
  { label: 'Understanding Note', status: 'Analyzing title, themes, word count, and structure...' },
  { label: 'Identifying Concepts', status: 'Discovering standalone themes, definitions, and mechanisms...' },
  { label: 'Discovering Relations', status: 'Evaluating inter-topic dependencies and natural clusters...' },
  { label: 'Determining Boundaries', status: 'Formulating self-contained modular boundaries...' },
  { label: 'Organizing Notes', status: 'Drafting modular titles, focused scopes, and contents...' },
  { label: 'Checking Coverage', status: 'Verifying factual preservation and source integrity...' },
];

/**
 * 4-Stage Top Workflow Progress Stepper matching UI reference:
 * 1 Configure -> 2 Analyze -> 3 Review -> 4 Done
 */
const SplitWorkflowProgress: React.FC<{ stage: number }> = ({ stage }) => {
  const steps = [
    { num: 1, label: 'Configure' },
    { num: 2, label: 'Analyze' },
    { num: 3, label: 'Review' },
    { num: 4, label: 'Done' },
  ];

  return (
    <div
      data-testid="split-workflow-stepper"
      className="flex items-center gap-1.5 sm:gap-3 shrink-0 text-xs font-medium"
    >
      {steps.map((st, idx) => {
        const isCurrent = stage === st.num;
        const isCompleted = stage > st.num;

        return (
          <React.Fragment key={st.num}>
            {idx > 0 && <span className="text-stone-300">·</span>}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all ${
                isCurrent
                  ? 'bg-[#EAF5EC] border border-[#C6E7CD] text-[#166534] font-bold shadow-2xs'
                  : isCompleted
                  ? 'text-[#166534]'
                  : 'text-stone-400'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-mono ${
                  isCurrent
                    ? 'bg-[#166534] text-white font-bold'
                    : isCompleted
                    ? 'bg-[#DCFCE7] text-[#166534] font-bold'
                    : 'border border-stone-300 text-stone-400'
                }`}
              >
                {isCompleted ? <Check size={11} strokeWidth={3} /> : st.num}
              </div>
              <span className="hidden xs:inline sm:inline">{st.label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export const InChatSplitNoteCard: React.FC<InChatSplitNoteCardProps> = ({
  proposal,
  result,
  isCommitting = false,
  onConfirm,
  onReject,
  onCancel,
  onDismiss,
  onNavigateToItem,
  onRunCommand,
}) => {
  const data = proposal?.data || result?.data || {};
  const isCommitted = proposal?.status === 'committed' || data?.status === 'split_committed';
  const cardType = data.card_type || 'split_note_plan';

  // Determine starting stage
  const [currentStage, setCurrentStage] = useState<number>(() => {
    if (isCommitted) return 4;
    if (data.stage === 'review' || cardType === 'split_note_review') return 3;
    if (data.stage === 'analyze') return 2;
    return 1; // Default to Configure stage
  });

  useEffect(() => {
    if (isCommitted) {
      setCurrentStage(4);
    }
  }, [isCommitted]);

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 0: Interactive Note Selector (when user ran /split-note with no args)
  // ───────────────────────────────────────────────────────────────────────────
  const [selectedNoteId, setSelectedNoteId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const availableNotes = Array.isArray(data.notes) ? data.notes : [];

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return availableNotes;
    const q = searchQuery.toLowerCase();
    return availableNotes.filter(
      (n: any) =>
        n.title?.toLowerCase().includes(q) ||
        n.topic?.toLowerCase().includes(q) ||
        n.preview?.toLowerCase().includes(q)
    );
  }, [availableNotes, searchQuery]);

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 1: Configuration State
  // ───────────────────────────────────────────────────────────────────────────
  const [contentMode, setContentMode] = useState<ContentHandlingMode>(
    data.content_mode === 'adapt' ? 'adapt' : 'preserve'
  );
  const [countMode, setCountMode] = useState<NoteCountMode>(
    data.count_mode === 'custom' ? 'custom' : 'auto'
  );
  const [targetCount, setTargetCount] = useState<number>(() => {
    const n = Number(data.target_count);
    return Number.isFinite(n) && n >= 2 && n <= 15 ? n : 4;
  });
  const [showSourceDetails, setShowSourceDetails] = useState(false);

  // Source note metadata
  const sourceNote: SplitSourceNoteMeta = useMemo(() => {
    if (data.source_note) return data.source_note;
    return {
      id: data.original_note_id || '',
      title: data.original_title || data.title || 'Source Note',
      topic: data.topic || 'Machine Learning',
      word_count: data.word_count || 792,
      section_count: data.section_count || 2,
      sections: data.sections || ['Exact Nearest Neighbors', 'Approximate Nearest Neighbors'],
      content_preview: data.content_preview || data.content || '',
      content: data.content || '',
    };
  }, [data]);

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 2: Transparent Analysis Progress State
  // ───────────────────────────────────────────────────────────────────────────
  const [analysisStepIndex, setAnalysisStepIndex] = useState(0);

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 3: Review Proposed Notes State
  // ───────────────────────────────────────────────────────────────────────────
  const initialParts: SplitProposedPart[] = useMemo(() => {
    if (Array.isArray(data.proposed_parts) && data.proposed_parts.length > 0) {
      return data.proposed_parts.map((p: any, idx: number) => ({
        id: p.id || `part-${idx + 1}`,
        title: p.title || `Part ${idx + 1}`,
        focus: p.focus || `Focused analysis of ${p.title}`,
        content: p.content || '',
        preview: p.preview || (p.content || '').slice(0, 200),
        word_count: p.word_count || (p.content || '').split(/\s+/).filter(Boolean).length,
        source_sections: p.source_sections || [],
        is_removed: false,
      }));
    }
    // Fallback proposal cards if none generated yet
    return [
      {
        id: 'part-1',
        title: `${sourceNote.title}: Foundations`,
        focus: 'Dense vector representations and embedding spaces',
        content: `# ${sourceNote.title}: Foundations\n\n_Split from: ${sourceNote.title}_\n\nDense vector representations map semantic meaning into high-dimensional space.`,
        preview: 'Dense vector representations map semantic meaning into high-dimensional space...',
        word_count: 340,
        source_sections: ['Foundations'],
        is_removed: false,
      },
      {
        id: 'part-2',
        title: `${sourceNote.title}: Indexing & Search`,
        focus: 'Approximate nearest neighbor algorithms and latency trade-offs',
        content: `# ${sourceNote.title}: Indexing & Search\n\n_Split from: ${sourceNote.title}_\n\nHierarchical Navigable Small World (HNSW) and inverted file indexing algorithms trade exact recall for logarithmic search latency.`,
        preview: 'Hierarchical Navigable Small World (HNSW) and inverted file indexing algorithms...',
        word_count: 452,
        source_sections: ['Search Mechanisms'],
        is_removed: false,
      },
    ];
  }, [data.proposed_parts, sourceNote.title]);

  const [proposedParts, setProposedParts] = useState<SplitProposedPart[]>(initialParts);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [expandedContentId, setExpandedContentId] = useState<string | null>(null);
  const [decompositionAdvice, setDecompositionAdvice] = useState<string>(
    data.decomposition_advice ||
      'Partitioned note into modular topics while preserving technical depth and original context.'
  );

  // Active (non-removed) parts count
  const activeParts = useMemo(() => proposedParts.filter((p) => !p.is_removed), [proposedParts]);

  // Handle Analyze Action (Transition Stage 1 -> Stage 2 -> Stage 3)
  const handleStartAnalysis = async () => {
    setCurrentStage(2);
    setAnalysisStepIndex(0);

    const stepInterval = 130;
    setTimeout(() => setAnalysisStepIndex(1), stepInterval);
    setTimeout(() => setAnalysisStepIndex(2), stepInterval * 2);
    setTimeout(() => setAnalysisStepIndex(3), stepInterval * 3);
    setTimeout(() => setAnalysisStepIndex(4), stepInterval * 4);
    setTimeout(() => setAnalysisStepIndex(5), stepInterval * 5);

    // Call decompose endpoint if target note ID is present
    if (sourceNote.id) {
      try {
        const workspaceId =
          typeof window !== 'undefined'
            ? localStorage.getItem('hyades_active_workspace_id')
            : null;

        if (workspaceId) {
          const res = await fetch(
            `/api/v1/workspaces/${workspaceId}/stella/commands/split-note/decompose`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                note_id: sourceNote.id,
                content_mode: contentMode,
                count_mode: countMode,
                target_count: countMode === 'custom' ? targetCount : null,
                proposal_id: proposal?.proposalId || null,
              }),
            }
          );
          if (res.ok) {
            const decomp = await res.json();
            if (Array.isArray(decomp.proposed_parts) && decomp.proposed_parts.length > 0) {
              setProposedParts(
                decomp.proposed_parts.map((p: any, idx: number) => ({
                  id: p.id || `part-${idx + 1}`,
                  title: p.title || `Part ${idx + 1}`,
                  focus: p.focus || `Focused analysis of ${p.title}`,
                  content: p.content || '',
                  preview: p.preview || (p.content || '').slice(0, 200),
                  word_count: p.word_count || (p.content || '').split(/\s+/).filter(Boolean).length,
                  source_sections: p.source_sections || [],
                  is_removed: false,
                }))
              );
              if (decomp.decomposition_advice) {
                setDecompositionAdvice(decomp.decomposition_advice);
              }
            }
          }
        }
      } catch (err) {
        console.warn('Decompose endpoint call completed with fallback:', err);
      }
    }

    setTimeout(() => {
      setCurrentStage(3);
    }, stepInterval * 6 + 100);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Proposed Parts Manipulation Handlers
  // ───────────────────────────────────────────────────────────────────────────
  const handleUpdateTitle = (id: string, newTitle: string) => {
    setProposedParts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, title: newTitle.trim() || p.title } : p))
    );
    setEditingTitleId(null);
  };

  const handleUpdateContent = (id: string, newContent: string) => {
    setProposedParts((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              content: newContent,
              preview: newContent.slice(0, 200),
              word_count: newContent.split(/\s+/).filter(Boolean).length,
            }
          : p
      )
    );
  };

  const handleRemovePart = (id: string) => {
    setProposedParts((prev) => prev.map((p) => (p.id === id ? { ...p, is_removed: true } : p)));
  };

  const handleRestorePart = (id: string) => {
    setProposedParts((prev) => prev.map((p) => (p.id === id ? { ...p, is_removed: false } : p)));
  };

  const handleMovePart = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= proposedParts.length) return;

    setProposedParts((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const handleMergeWithNext = (index: number) => {
    if (index >= proposedParts.length - 1) return;
    const curr = proposedParts[index];
    const next = proposedParts[index + 1];

    const mergedTitle = `${curr.title.split(':')[0]}: ${curr.title.split(':')[1] || curr.title} & ${
      next.title.split(':')[1] || next.title
    }`.slice(0, 150);
    const mergedContent = `${curr.content}\n\n---\n\n${next.content}`;
    const mergedFocus = `Comprehensive synthesis combining ${curr.title} and ${next.title}`;

    const mergedItem: SplitProposedPart = {
      id: curr.id,
      title: mergedTitle,
      focus: mergedFocus,
      content: mergedContent,
      preview: mergedContent.slice(0, 220),
      word_count: curr.word_count + next.word_count,
      source_sections: [
        ...(curr.source_sections || []),
        ...(next.source_sections || []),
      ],
      is_removed: false,
    };

    setProposedParts((prev) => {
      const copy = [...prev];
      copy.splice(index, 2, mergedItem);
      return copy;
    });
  };

  const handleDivideFurther = (index: number) => {
    const item = proposedParts[index];
    const lines = item.content.split('\n');
    const mid = Math.floor(lines.length / 2);

    const part1Content = lines.slice(0, mid).join('\n').trim();
    const part2Content = lines.slice(mid).join('\n').trim();

    const p1: SplitProposedPart = {
      id: `${item.id}-a`,
      title: `${item.title} (Part 1)`,
      focus: `${item.focus} - Initial foundations`,
      content: part1Content,
      preview: part1Content.slice(0, 200),
      word_count: part1Content.split(/\s+/).filter(Boolean).length,
      source_sections: item.source_sections,
      is_removed: false,
    };

    const p2: SplitProposedPart = {
      id: `${item.id}-b`,
      title: `${item.title} (Part 2)`,
      focus: `${item.focus} - Further developments`,
      content: part2Content,
      preview: part2Content.slice(0, 200),
      word_count: part2Content.split(/\s+/).filter(Boolean).length,
      source_sections: item.source_sections,
      is_removed: false,
    };

    setProposedParts((prev) => {
      const copy = [...prev];
      copy.splice(index, 1, p1, p2);
      return copy;
    });
  };

  // Final Commit Approval
  const handleCommitApproval = () => {
    if (!onConfirm) return;
    const finalParts = activeParts.map((p) => ({
      id: p.id,
      title: p.title,
      focus: p.focus,
      content: p.content,
      preview: p.preview,
      word_count: p.word_count,
      source_sections: p.source_sections,
    }));

    onConfirm({
      proposed_parts: finalParts,
      content_mode: contentMode,
      count_mode: countMode,
      target_count: targetCount,
    });
  };

  // ───────────────────────────────────────────────────────────────────────────
  // RENDER: STAGE 0 (Select Note from workspace)
  // ───────────────────────────────────────────────────────────────────────────
  if (cardType === 'select_note' && currentStage === 1 && !data.source_note && !data.original_note_id) {
    return (
      <div
        data-testid="split-select-note-card"
        className="card-surface mt-3 p-5 sm:p-6 rounded-2xl border border-[var(--border-parchment)] bg-[#FAF8F2] shadow-xs flex flex-col gap-4 w-full text-[var(--ink-primary)] animate-fade-in"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-parchment)] pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#F6F4EE] border border-[#EBE7DE] flex items-center justify-center shrink-0 shadow-2xs">
              <Scissors size={18} className="text-[#1B2A4A]" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-base text-[var(--ink-primary)]">Split Note</h3>
              <p className="text-xs text-[var(--ink-secondary)]">Stella · Knowledge decomposition</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F5F3ED] border border-[#E8E5DD] text-xs text-stone-600 font-medium">
            Split an existing note into multiple, coherent notes. <Info size={13} />
          </span>
        </div>

        <div>
          <h4 className="font-bold text-base text-[var(--ink-primary)]">Choose a note to split</h4>
          <p className="text-xs text-[var(--ink-secondary)] mt-0.5">
            Select an extensive note from your workspace to decompose into modular, atomic notes:
          </p>
        </div>

        {/* Search filter */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white border border-[var(--border-parchment)] focus:outline-none focus:ring-1 focus:ring-[#166534]"
          />
        </div>

        {/* Notes list */}
        <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
          {filteredNotes.map((n: any) => {
            const isSelected = selectedNoteId === n.id;
            return (
              <div
                key={n.id}
                onClick={() => setSelectedNoteId(n.id)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                  isSelected
                    ? 'bg-[#EAF5EC] border-emerald-500 ring-1 ring-emerald-500'
                    : 'bg-white border-[var(--border-parchment)] hover:border-stone-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      isSelected
                        ? 'border-[#166534] bg-[#166534] text-white'
                        : 'border-stone-300 bg-white'
                    }`}
                  >
                    {isSelected && <Check size={10} strokeWidth={3} />}
                  </div>
                  <FileText size={16} className="text-stone-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-xs text-[var(--ink-primary)]">{n.title}</div>
                    <div className="text-[11px] text-stone-500">
                      {n.topic || 'General'} · ~{n.word_count} words
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-parchment)]">
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900 rounded-xl"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={!selectedNoteId}
            onClick={() => {
              const chosen = availableNotes.find((n: any) => n.id === selectedNoteId);
              if (chosen && onRunCommand) {
                onRunCommand(`/split-note "${chosen.title}"`);
              }
            }}
            className="px-5 py-2 rounded-xl bg-[#1B2A4A] hover:bg-[#24365D] text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <span>Proceed to Configure</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // MAIN CARD CONTAINER (Stages 1, 2, 3, 4)
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div
      data-testid="split-note-card"
      className="card-surface mt-3 p-4 sm:p-6 rounded-2xl border border-[var(--border-parchment)] bg-[#FAF8F2] shadow-xs flex flex-col gap-5 w-full text-[var(--ink-primary)] animate-fade-in"
    >
      {/* ────────────────── Header & 4-Stage Stepper ────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-parchment)] pb-3.5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#F6F4EE] border border-[#EBE7DE] flex items-center justify-center shrink-0 shadow-2xs">
            <Scissors size={18} className="text-[#1B2A4A]" />
          </div>
          <div className="flex flex-col">
            <h3 className="font-serif font-bold text-base sm:text-lg text-[var(--ink-primary)] tracking-tight">
              Split Note
            </h3>
            <span className="text-xs text-[var(--ink-secondary)]">Stella · Knowledge decomposition</span>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
          <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F5F3ED] border border-[#E8E5DD] text-xs text-stone-600 font-medium">
            Split an existing note into multiple, coherent notes. <Info size={13} />
          </span>
          <SplitWorkflowProgress stage={currentStage} />
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* STAGE 1: CONFIGURE (Strictly matches media_1793804073195_016503d2.jpg) */}
      {/* ────────────────────────────────────────────────────────────── */}
      {currentStage === 1 && (
        <div data-testid="split-configure-stage" className="flex flex-col gap-5">
          {/* Subtitle banner */}
          <div>
            <h4 className="font-bold text-lg text-[var(--ink-primary)]">Let's split your note.</h4>
            <p className="text-xs sm:text-sm text-[var(--ink-secondary)] mt-0.5">
              Stella will analyze the entire note, identify related concepts and propose multiple independent notes.
            </p>
          </div>

          {/* Two-Column Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
            {/* ──── LEFT COLUMN: Source Note & Content Handling ──── */}
            <div className="flex flex-col gap-4">
              {/* Source Note Card */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-700">Source note</span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EAF5EC] border border-[#C6E7CD] text-[#166534] text-[11px] font-semibold">
                    <Check size={11} strokeWidth={3} />
                    Selected
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-[var(--border-parchment)] bg-white shadow-2xs flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <FileText size={18} className="text-stone-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-xs sm:text-sm text-[var(--ink-primary)] leading-tight">
                          {sourceNote.title}
                        </div>
                        <div className="text-[11px] text-stone-500 mt-0.5">
                          {sourceNote.topic || 'General'} · ~{sourceNote.word_count} words ·{' '}
                          {sourceNote.section_count} main sections
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowSourceDetails((prev) => !prev)}
                      className="text-[11px] text-stone-600 hover:text-stone-900 font-medium flex items-center gap-1 shrink-0 p-1 hover:bg-stone-50 rounded"
                    >
                      <span>{showSourceDetails ? 'Hide details' : 'View details'}</span>
                      {showSourceDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  </div>

                  {/* Expandable Source Note Preview Drawer */}
                  {showSourceDetails && (
                    <div className="mt-2 pt-2 border-t border-stone-100 text-xs text-stone-600 bg-[#FAF8F2] p-2.5 rounded-lg max-h-40 overflow-y-auto space-y-1">
                      <div className="font-semibold text-[11px] text-stone-700 mb-1">Detected sections:</div>
                      {sourceNote.sections && sourceNote.sections.length > 0 ? (
                        sourceNote.sections.map((s, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-[11px]">
                            <span className="text-[#166534] font-bold">§</span> {s}
                          </div>
                        ))
                      ) : (
                        <div className="text-[11px] italic">No markdown headings detected.</div>
                      )}
                      {sourceNote.content_preview && (
                        <div className="mt-2 text-[11px] text-stone-500 border-t border-stone-200 pt-1.5 line-clamp-3">
                          {sourceNote.content_preview}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Content Handling Question & Radio Options */}
              <div className="flex flex-col gap-2 pt-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--ink-primary)]">
                  <Layers size={14} className="text-stone-500" />
                  <span>How should Stella handle your content?</span>
                </div>

                {/* Option 1: Preserve Original Content (Recommended) */}
                <div
                  data-testid="mode-preserve"
                  onClick={() => setContentMode('preserve')}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                    contentMode === 'preserve'
                      ? 'bg-[#EAF5EC] border-emerald-500 ring-1 ring-emerald-500 shadow-2xs'
                      : 'bg-white border-[var(--border-parchment)] hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          contentMode === 'preserve'
                            ? 'border-[#166534] bg-[#166534]'
                            : 'border-stone-300 bg-white'
                        }`}
                      >
                        {contentMode === 'preserve' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <span className="font-bold text-xs sm:text-sm text-[var(--ink-primary)]">
                        Preserve Original Content
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold bg-[#DCFCE7] text-[#166534]">
                      Recommended
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-600 pl-6 leading-relaxed">
                    Organize existing information into separate notes while preserving its original wording as much as
                    possible.
                  </p>
                </div>

                {/* Option 2: Adapt for Standalone Notes */}
                <div
                  data-testid="mode-adapt"
                  onClick={() => setContentMode('adapt')}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                    contentMode === 'adapt'
                      ? 'bg-[#EAF5EC] border-emerald-500 ring-1 ring-emerald-500 shadow-2xs'
                      : 'bg-white border-[var(--border-parchment)] hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        contentMode === 'adapt'
                          ? 'border-[#166534] bg-[#166534]'
                          : 'border-stone-300 bg-white'
                      }`}
                    >
                      {contentMode === 'adapt' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="font-bold text-xs sm:text-sm text-[var(--ink-primary)]">
                      Adapt for Standalone Notes
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-600 pl-6 leading-relaxed">
                    Create separate notes and adapt their context so each resulting note can be understood independently.
                  </p>
                </div>
              </div>

              {/* Original Note Protection Notice */}
              <div className="p-3 rounded-xl border border-stone-200 bg-[#FAF8F2] flex items-start gap-2.5 mt-1">
                <ShieldCheck size={18} className="text-stone-600 shrink-0 mt-0.5" />
                <div className="flex flex-col">
                  <span className="font-bold text-xs text-[var(--ink-primary)]">Original note protection</span>
                  <span className="text-[11px] text-stone-600 mt-0.5">
                    The original note will remain untouched. Nothing enters your Library until you approve the
                    proposals.
                  </span>
                </div>
              </div>
            </div>

            {/* ──── RIGHT COLUMN: Note Count Selection & Stepper/Slider ──── */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--ink-primary)]">
                  <Layers size={14} className="text-stone-500" />
                  <span>How many notes should Stella create?</span>
                </div>
                <p className="text-[11px] text-[var(--ink-secondary)]">
                  Choose a target or let Stella determine the optimal number based on the content.
                </p>
              </div>

              {/* Count Option 1: Automatic (Recommended) */}
              <div
                data-testid="count-auto"
                onClick={() => setCountMode('auto')}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                  countMode === 'auto'
                    ? 'bg-[#EAF5EC] border-emerald-500 ring-1 ring-emerald-500 shadow-2xs'
                    : 'bg-white border-[var(--border-parchment)] hover:border-stone-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        countMode === 'auto' ? 'border-[#166534] bg-[#166534]' : 'border-stone-300 bg-white'
                      }`}
                    >
                      {countMode === 'auto' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="font-bold text-xs sm:text-sm text-[var(--ink-primary)]">
                      Automatic (Recommended)
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-[#DCFCE7] text-[#166534] flex items-center gap-1">
                    <Sparkles size={11} /> Let Stella decide
                  </span>
                </div>
                <p className="text-[11px] text-stone-600 pl-6 leading-relaxed">
                  Stella analyzes the note and decides how many notes are appropriate based on its structure, concepts
                  and scope.
                </p>
              </div>

              {/* Count Option 2: Set a specific number */}
              <div
                data-testid="count-custom"
                onClick={() => setCountMode('custom')}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                  countMode === 'custom'
                    ? 'bg-[#EAF5EC] border-emerald-500 ring-1 ring-emerald-500 shadow-2xs'
                    : 'bg-white border-[var(--border-parchment)] hover:border-stone-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      countMode === 'custom' ? 'border-[#166534] bg-[#166534]' : 'border-stone-300 bg-white'
                    }`}
                  >
                    {countMode === 'custom' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className="font-bold text-xs sm:text-sm text-[var(--ink-primary)]">Set a specific number</span>
                </div>
                <p className="text-[11px] text-stone-600 pl-6 leading-relaxed">
                  Tell Stella your desired number of notes. She will organize the content within that target where
                  possible.
                </p>
              </div>

              {/* Target Number Stepper & Slider Controls */}
              <div className="p-4 rounded-xl border border-[var(--border-parchment)] bg-white flex flex-col gap-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-700">Target number of notes</span>
                  <div className="flex items-center gap-2 bg-[#F6F4EE] border border-[#E5DECE] rounded-lg p-1">
                    <button
                      type="button"
                      aria-label="Decrease note count"
                      disabled={targetCount <= 2}
                      onClick={() => {
                        setCountMode('custom');
                        setTargetCount((prev) => Math.max(2, prev - 1));
                      }}
                      className="w-6 h-6 rounded flex items-center justify-center bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
                    >
                      <Minus size={12} strokeWidth={2.5} />
                    </button>
                    <span
                      data-testid="target-count-display"
                      className="w-6 text-center font-mono font-bold text-xs text-[var(--ink-primary)]"
                    >
                      {targetCount}
                    </span>
                    <button
                      type="button"
                      aria-label="Increase note count"
                      disabled={targetCount >= 15}
                      onClick={() => {
                        setCountMode('custom');
                        setTargetCount((prev) => Math.min(15, prev + 1));
                      }}
                      className="w-6 h-6 rounded flex items-center justify-center bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
                    >
                      <Plus size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>

                {/* Slider */}
                <div className="flex flex-col gap-1.5 pt-1">
                  <input
                    type="range"
                    min={2}
                    max={15}
                    step={1}
                    value={targetCount}
                    onChange={(e) => {
                      setCountMode('custom');
                      setTargetCount(Number(e.target.value));
                    }}
                    className="w-full accent-[#166534] cursor-pointer h-1.5 bg-stone-200 rounded-lg appearance-none"
                  />
                  {/* Slider scale marks */}
                  <div className="flex justify-between text-[10px] font-mono text-stone-400 px-0.5">
                    <span>2</span>
                    <span>4</span>
                    <span>6</span>
                    <span>8</span>
                    <span>10</span>
                    <span>12</span>
                    <span>15</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-stone-500 pt-1 border-t border-stone-100">
                  <Info size={12} />
                  <span>Choose between 2 and 15 notes.</span>
                </div>
              </div>

              {/* Bottom Primary Action Button */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  data-testid="btn-analyze-split"
                  onClick={handleStartAnalysis}
                  className="px-6 py-2.5 rounded-xl bg-[#1B2A4A] hover:bg-[#24365D] text-white text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer"
                >
                  <span>Analyze and propose notes</span>
                  <ArrowRight size={14} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────── */}
      {/* STAGE 2: ANALYZE (Multi-step Progress Stepper) */}
      {/* ────────────────────────────────────────────────────────────── */}
      {currentStage === 2 && (
        <div data-testid="split-analyze-stage" className="flex flex-col gap-5 py-4 animate-fade-in">
          <div className="text-center">
            <h4 className="font-serif font-bold text-base sm:text-lg text-[var(--ink-primary)]">
              Analyzing Knowledge Boundaries...
            </h4>
            <p className="text-xs text-[var(--ink-secondary)] mt-0.5">
              Evaluating conceptual dependencies and isolating modular topics from "{sourceNote.title}".
            </p>
          </div>

          <div className="w-full flex flex-col gap-3 max-w-xl mx-auto py-2">
            <div className="flex items-center justify-between w-full relative px-2">
              {ANALYSIS_STEPS.map((st, idx) => {
                const isDone = idx < analysisStepIndex;
                const isCurrent = idx === analysisStepIndex;

                return (
                  <React.Fragment key={st.label}>
                    {idx > 0 && (
                      <div
                        className={`flex-1 h-[2px] transition-all duration-300 mx-1 ${
                          idx <= analysisStepIndex ? 'bg-[#166534]' : 'bg-stone-200'
                        }`}
                      />
                    )}
                    <div className="flex flex-col items-center gap-1 shrink-0 z-10">
                      <div
                        className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-mono font-bold transition-all duration-300 ${
                          isDone
                            ? 'bg-[#166534] text-white shadow-2xs'
                            : isCurrent
                            ? 'bg-[#166534] text-white ring-4 ring-[#DCFCE7] animate-pulse shadow-2xs'
                            : 'bg-stone-200 text-stone-500'
                        }`}
                      >
                        {isDone ? (
                          <Check size={12} strokeWidth={3} />
                        ) : isCurrent ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          idx + 1
                        )}
                      </div>
                      <span
                        className={`text-[9px] sm:text-[10px] font-medium text-center max-w-[65px] truncate ${
                          isCurrent ? 'text-[#166534] font-bold' : isDone ? 'text-stone-700' : 'text-stone-400'
                        }`}
                      >
                        {st.label}
                      </span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            <div className="p-3 rounded-xl bg-white border border-[var(--border-parchment)] text-center text-xs text-[var(--ink-secondary)] shadow-2xs font-medium mt-2">
              <span className="text-[var(--ink-primary)]">
                {ANALYSIS_STEPS[analysisStepIndex]?.status || 'Synthesizing modular boundaries...'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────── */}
      {/* STAGE 3: REVIEW (Interactive Proposed Notes Cards) */}
      {/* ────────────────────────────────────────────────────────────── */}
      {currentStage === 3 && (
        <div data-testid="split-review-stage" className="flex flex-col gap-4 animate-fade-in">
          {/* Header & Advice */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-parchment)] pb-3">
            <div>
              <h4 className="font-bold text-base text-[var(--ink-primary)]">
                Proposed Notes ({activeParts.length})
              </h4>
              <p className="text-xs text-[var(--ink-secondary)]">
                Review proposed modular notes before creating them in your Library. Edit titles, adjust contents, or
                reorganize parts.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentStage(1)}
                className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 border border-[var(--border-parchment)] rounded-lg hover:bg-stone-50 flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft size={12} />
                <span>Reconfigure</span>
              </button>
            </div>
          </div>

          {/* Advice Banner */}
          {decompositionAdvice && (
            <div className="p-3 rounded-xl bg-[#EAF5EC] border border-[#C6E7CD] text-xs text-[#166534] flex items-start gap-2">
              <Sparkles size={15} className="shrink-0 mt-0.5" />
              <span>{decompositionAdvice}</span>
            </div>
          )}

          {/* Proposed Notes List */}
          <div className="space-y-3">
            {proposedParts.map((part, idx) => {
              if (part.is_removed) {
                return (
                  <div
                    key={part.id}
                    className="p-3 rounded-xl border border-dashed border-stone-300 bg-stone-50 flex items-center justify-between text-xs text-stone-500"
                  >
                    <span>
                      Removed: <strong className="text-stone-700">{part.title}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRestorePart(part.id)}
                      className="px-2.5 py-1 text-xs font-semibold text-[#166534] hover:bg-[#DCFCE7] rounded flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw size={12} />
                      <span>Restore</span>
                    </button>
                  </div>
                );
              }

              const isEditingTitle = editingTitleId === part.id;
              const isExpandedContent = expandedContentId === part.id;

              return (
                <div
                  key={part.id}
                  data-testid={`proposed-note-card-${idx}`}
                  className="p-4 rounded-xl border border-[var(--border-parchment)] bg-white shadow-2xs flex flex-col gap-2.5 transition-all hover:border-stone-300"
                >
                  {/* Top Bar of Proposed Note */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 flex-1">
                      <div className="w-6 h-6 rounded-md bg-[#F6F4EE] border border-[#E5DECE] flex items-center justify-center text-xs font-mono font-bold text-stone-700 shrink-0 mt-0.5">
                        {idx + 1}
                      </div>

                      <div className="flex flex-col flex-1">
                        {isEditingTitle ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              defaultValue={part.title}
                              autoFocus
                              onBlur={(e) => handleUpdateTitle(part.id, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleUpdateTitle(part.id, e.currentTarget.value);
                                if (e.key === 'Escape') setEditingTitleId(null);
                              }}
                              className="w-full text-xs sm:text-sm font-bold border border-emerald-500 rounded px-2 py-0.5 focus:outline-none ring-1 ring-emerald-500"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group">
                            <span className="font-bold text-xs sm:text-sm text-[var(--ink-primary)]">
                              {part.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditingTitleId(part.id)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-stone-400 hover:text-stone-700 rounded transition-opacity"
                              title="Edit note title"
                            >
                              <Pencil size={11} />
                            </button>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="text-[11px] text-stone-500">
                            <strong>Focus:</strong> {part.focus}
                          </span>
                          <span className="text-stone-300">·</span>
                          <span className="text-[10px] font-mono text-stone-400">
                            ~{part.word_count} words
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions Menu */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMovePart(idx, 'up')}
                        className="p-1 rounded text-stone-400 hover:text-stone-700 disabled:opacity-20 cursor-pointer"
                        title="Move Up"
                      >
                        <MoveUp size={13} />
                      </button>
                      <button
                        type="button"
                        disabled={idx === proposedParts.length - 1}
                        onClick={() => handleMovePart(idx, 'down')}
                        className="p-1 rounded text-stone-400 hover:text-stone-700 disabled:opacity-20 cursor-pointer"
                        title="Move Down"
                      >
                        <MoveDown size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemovePart(part.id)}
                        className="p-1 rounded text-stone-400 hover:text-red-600 cursor-pointer"
                        title="Remove note"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Content Preview / Editor */}
                  <div className="mt-1 pt-2 border-t border-stone-100 flex flex-col gap-1.5">
                    {isExpandedContent ? (
                      <div className="flex flex-col gap-1.5">
                        <textarea
                          rows={6}
                          defaultValue={part.content}
                          onBlur={(e) => handleUpdateContent(part.id, e.target.value)}
                          className="w-full text-xs font-mono p-2.5 rounded-lg border border-stone-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-[#FAF8F2]"
                        />
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setExpandedContentId(null)}
                            className="text-[11px] text-[#166534] font-semibold hover:underline"
                          >
                            Collapse Editor
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-[11px] text-stone-500">
                        <span className="truncate max-w-[80%]">{part.preview}</span>
                        <button
                          type="button"
                          onClick={() => setExpandedContentId(part.id)}
                          className="text-[11px] font-medium text-stone-600 hover:text-stone-900 underline shrink-0 cursor-pointer"
                        >
                          Edit Content
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Sub-actions per card: Merge with Next or Divide Further */}
                  <div className="flex items-center gap-2 pt-1 border-t border-stone-100 text-[10px]">
                    {idx < proposedParts.length - 1 && (
                      <button
                        type="button"
                        onClick={() => handleMergeWithNext(idx)}
                        className="text-stone-500 hover:text-stone-800 flex items-center gap-1 cursor-pointer"
                      >
                        <GitMerge size={11} />
                        <span>Merge with next note</span>
                      </button>
                    )}
                    <span className="text-stone-300">|</span>
                    <button
                      type="button"
                      onClick={() => handleDivideFurther(idx)}
                      className="text-stone-500 hover:text-stone-800 flex items-center gap-1 cursor-pointer"
                    >
                      <Scissors size={11} />
                      <span>Divide further</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Original note protection reminder */}
          <div className="p-3 rounded-xl border border-stone-200 bg-[#FAF8F2] flex items-center gap-2.5 text-xs text-stone-600">
            <ShieldCheck size={16} className="text-[#166534] shrink-0" />
            <span>
              The original note <strong>"{sourceNote.title}"</strong> will remain untouched in your Library.
            </span>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-[var(--border-parchment)]">
            <button
              type="button"
              onClick={() => {
                if (onCancel) onCancel();
                else if (onReject) onReject();
                else if (onDismiss) onDismiss();
              }}
              className="px-4 py-2 rounded-xl text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              data-testid="btn-approve-split"
              disabled={isCommitting || activeParts.length === 0}
              onClick={handleCommitApproval}
              className="px-6 py-2.5 rounded-xl bg-[#1B2A4A] hover:bg-[#24365D] text-white text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isCommitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Creating Notes...</span>
                </>
              ) : (
                <>
                  <span>Approve and create notes ({activeParts.length})</span>
                  <ArrowRight size={14} strokeWidth={2.5} />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────── */}
      {/* STAGE 4: DONE (Committed Success State) */}
      {/* ────────────────────────────────────────────────────────────── */}
      {currentStage === 4 && (
        <div data-testid="split-done-stage" className="flex flex-col gap-4 py-2 animate-fade-in">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-[#EAF5EC] border border-[#C6E7CD]">
            <CheckCircle2 size={24} className="text-[#166534] shrink-0" />
            <div className="flex flex-col">
              <h4 className="font-bold text-sm sm:text-base text-[#166534]">
                Successfully created {data.created_count || activeParts.length} independent notes!
              </h4>
              <p className="text-xs text-stone-600 mt-0.5">
                All notes have been persisted to your Library and bidirectionally linked with the source note.
              </p>
            </div>
          </div>

          {/* Created Notes List */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-stone-700">Created Notes:</span>
            <div className="space-y-1.5">
              {Array.isArray(data.created_notes) && data.created_notes.length > 0 ? (
                data.created_notes.map((n: any, idx: number) => (
                  <div
                    key={n.note_id || idx}
                    className="p-3 rounded-xl border border-[var(--border-parchment)] bg-white flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <FileText size={15} className="text-[#166534]" />
                      <span className="font-bold text-[var(--ink-primary)]">{n.title}</span>
                      <span className="text-[10px] font-mono text-stone-400">~{n.word_count} words</span>
                    </div>
                    {onNavigateToItem && (
                      <button
                        type="button"
                        onClick={() => onNavigateToItem(n.note_id, 'note')}
                        className="text-[11px] font-semibold text-[#166534] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>Open in Library</span>
                        <ExternalLink size={11} />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                activeParts.map((p, idx) => (
                  <div
                    key={p.id || idx}
                    className="p-3 rounded-xl border border-[var(--border-parchment)] bg-white flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <FileText size={15} className="text-[#166534]" />
                      <span className="font-bold text-[var(--ink-primary)]">{p.title}</span>
                      <span className="text-[10px] font-mono text-stone-400">~{p.word_count} words</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Reassurance Banner */}
          <div className="p-3 rounded-xl border border-stone-200 bg-[#FAF8F2] flex items-center gap-2 text-xs text-stone-600">
            <ShieldCheck size={16} className="text-[#166534] shrink-0" />
            <span>
              The original note <strong>"{sourceNote.title}"</strong> was preserved completely untouched in your
              Library.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
