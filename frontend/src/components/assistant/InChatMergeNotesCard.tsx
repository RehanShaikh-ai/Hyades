import React, { useState, useMemo, useEffect } from 'react';
import {
  GitMerge,
  FileText,
  Check,
  X,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Trash2,
  MoveUp,
  MoveDown,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Eye,
  AlertTriangle,
} from 'lucide-react';

export type GenerationMode = 'verbatim' | 'rewritten' | 'connective';

export interface ProposedSectionItem {
  id: string;
  title: string;
  description?: string;
  mode: GenerationMode;
  source_note_ids?: string[];
  source_block_ids?: string[];
  content?: string;
  generation_status?: 'pending' | 'processing' | 'completed' | 'failed' | 'fallback_verbatim';
  validation_warnings?: string[];
  has_connective_text?: boolean;
}

export interface InChatMergeNotesCardProps {
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
  onNavigateToItem?: (id: string, itemType: string) => void;
  onRunCommand?: (commandText: string) => void;
  onOpenDocumentPanel?: (draftData: any) => void;
}

/**
 * 4-Step Progress Indicator matching Mockup A:
 * 1 Plan · 2 Generate · 3 Review · 4 Apply
 */
const MergeWorkflowProgress: React.FC<{ stage: 1 | 2 | 3 | 4 }> = ({ stage }) => {
  return (
    <div
      data-testid="merge-workflow-progress"
      className="flex items-center gap-1.5 sm:gap-2 text-xs shrink-0 select-none font-medium ml-auto"
    >
      {/* Step 1: Plan */}
      <div
        className={`flex items-center gap-1 sm:gap-1.5 ${
          stage === 1
            ? 'text-[#C85A32] font-bold'
            : stage > 1
            ? 'text-[#8B5E3C]'
            : 'text-stone-400'
        }`}
      >
        <div
          className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[10px] sm:text-[11px] font-mono ${
            stage === 1
              ? 'bg-[#C85A32] text-white font-bold'
              : stage > 1
              ? 'bg-[#FBF0EA] text-[#C85A32] border border-[#F0D5C7]'
              : 'border border-stone-300 text-stone-400'
          }`}
        >
          {stage > 1 ? <Check size={11} strokeWidth={3} /> : '1'}
        </div>
        <span className="hidden xs:inline sm:inline">Plan</span>
      </div>

      <span className="text-stone-300">·</span>

      {/* Step 2: Generate */}
      <div
        className={`flex items-center gap-1 sm:gap-1.5 ${
          stage === 2
            ? 'text-[#C85A32] font-bold'
            : stage > 2
            ? 'text-[#8B5E3C]'
            : 'text-stone-400'
        }`}
      >
        <div
          className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[10px] sm:text-[11px] font-mono ${
            stage === 2
              ? 'bg-[#C85A32] text-white font-bold'
              : stage > 2
              ? 'bg-[#FBF0EA] text-[#C85A32] border border-[#F0D5C7]'
              : 'border border-stone-300 text-stone-400'
          }`}
        >
          {stage > 2 ? <Check size={11} strokeWidth={3} /> : '2'}
        </div>
        <span className="hidden xs:inline sm:inline">Generate</span>
      </div>

      <span className="text-stone-300">·</span>

      {/* Step 3: Review */}
      <div
        className={`flex items-center gap-1 sm:gap-1.5 ${
          stage === 3
            ? 'text-[#C85A32] font-bold'
            : stage > 3
            ? 'text-[#8B5E3C]'
            : 'text-stone-400'
        }`}
      >
        <div
          className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[10px] sm:text-[11px] font-mono ${
            stage === 3
              ? 'bg-[#C85A32] text-white font-bold'
              : stage > 3
              ? 'bg-[#FBF0EA] text-[#C85A32] border border-[#F0D5C7]'
              : 'border border-stone-300 text-stone-400'
          }`}
        >
          {stage > 3 ? <Check size={11} strokeWidth={3} /> : '3'}
        </div>
        <span className="hidden xs:inline sm:inline">Review</span>
      </div>

      <span className="text-stone-300">·</span>

      {/* Step 4: Apply */}
      <div
        className={`flex items-center gap-1 sm:gap-1.5 ${
          stage === 4 ? 'text-[#C85A32] font-bold' : 'text-stone-400'
        }`}
      >
        <div
          className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[10px] sm:text-[11px] font-mono ${
            stage === 4
              ? 'bg-[#C85A32] text-white font-bold'
              : 'border border-stone-300 text-stone-400'
          }`}
        >
          4
        </div>
        <span className="hidden xs:inline sm:inline">Apply</span>
      </div>
    </div>
  );
};

export const InChatMergeNotesCard: React.FC<InChatMergeNotesCardProps> = ({
  proposal,
  result,
  isCommitting = false,
  onConfirm,
  onCancel,
  onNavigateToItem,
  onRunCommand,
  onOpenDocumentPanel,
}) => {
  const data = proposal?.data || result?.data || {};
  const isCommitted = proposal?.status === 'committed';
  const isCancelled = proposal?.status === 'cancelled';
  const cardType = data.card_type || 'merge_plan';

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 1: Interactive Note Selection Card (when < 2 notes provided)
  // ───────────────────────────────────────────────────────────────────────────
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 2: Merge Plan & Outline Editing
  // ───────────────────────────────────────────────────────────────────────────
  const planData = data.plan || data;
  const analysis = planData.analysis || {};
  const rawSourceNotes = Array.isArray(planData.source_notes) ? planData.source_notes : [];
  const [showAllSources, setShowAllSources] = useState(false);

  // Intelligent Merged Note Title state
  const defaultInitialTitle =
    data.title ||
    planData.title ||
    (rawSourceNotes.length > 0 ? `Synthesis: ${rawSourceNotes[0].title}` : 'Merged Research Note');
  const [mergedTitle, setMergedTitle] = useState<string>(defaultInitialTitle);
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  useEffect(() => {
    if (data.title || planData.title) {
      setMergedTitle(data.title || planData.title);
    }
  }, [data.title, planData.title]);

  const initialSections: ProposedSectionItem[] = useMemo(() => {
    return Array.isArray(planData.outline)
      ? planData.outline
      : [
          { id: 'sec-1', title: 'Introduction', mode: 'verbatim' },
          { id: 'sec-2', title: 'Core Concepts', mode: 'rewritten', description: 'Consolidate overlapping material' },
          { id: 'sec-3', title: 'How They Work Together', mode: 'connective', description: 'A brief section to link concepts', has_connective_text: true },
          { id: 'sec-4', title: 'Key Takeaways', mode: 'verbatim' },
        ];
  }, [planData.outline]);

  const [currentSections, setCurrentSections] = useState<ProposedSectionItem[]>(initialSections);
  const [isEditingOutline, setIsEditingOutline] = useState(false);
  const [currentStage, setCurrentStage] = useState<1 | 2 | 3 | 4>(
    data.stage === 'review' ? 3 : data.stage === 'apply' ? 4 : 1
  );

  // Synchronize when data.outline changes
  useEffect(() => {
    if (Array.isArray(planData.outline) && planData.outline.length > 0) {
      setCurrentSections(planData.outline);
    }
  }, [planData.outline]);

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 5: Destination Selection & Confirmation State
  // ───────────────────────────────────────────────────────────────────────────
  const [destination, setDestination] = useState<'new_note' | 'replace_source'>('new_note');
  const [targetReplaceNoteId, setTargetReplaceNoteId] = useState<string>(
    rawSourceNotes.length > 0 ? rawSourceNotes[0].note_id : ''
  );
  const [confirmOverwriteChecked, setConfirmOverwriteChecked] = useState(false);

  // ───────────────────────────────────────────────────────────────────────────
  // Render: Stage 1 (Select Notes)
  // ───────────────────────────────────────────────────────────────────────────
  if (cardType === 'select_notes' || data.stage === 'select') {
    const availableNotes = Array.isArray(data.notes) ? data.notes : [];
    const filteredNotes = availableNotes.filter((n: any) =>
      (n.title || '').toLowerCase().includes(searchQuery.toLowerCase().trim())
    );

    const toggleNoteSelection = (noteId: string) => {
      setSelectedNoteIds((prev) =>
        prev.includes(noteId) ? prev.filter((id) => id !== noteId) : [...prev, noteId]
      );
    };

    const handleConfirmSelection = () => {
      if (selectedNoteIds.length < 2 || !onRunCommand) return;
      const selectedTitles = availableNotes
        .filter((n: any) => selectedNoteIds.includes(n.id))
        .map((n: any) => `"${n.title}"`);
      onRunCommand(`/merge-notes ${selectedTitles.join(' ')}`);
    };

    return (
      <div
        data-testid="merge-notes-select-card"
        className="card-surface mt-3 p-4 sm:p-5 rounded-2xl border border-[var(--border-parchment)] bg-[#FAF8F2] shadow-xs flex flex-col gap-4 w-full text-[var(--ink-primary)] animate-fade-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-parchment)] pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#FAF5EE] border border-[#E8DFD3] flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
              <GitMerge size={17} className="text-[var(--accent-terracotta)]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-serif font-bold text-sm sm:text-base text-[var(--ink-primary)] tracking-tight">
                Select Notes to Merge
              </span>
              <span className="text-xs text-[var(--ink-secondary)]">
                Choose at least two notes from your workspace to synthesize.
              </span>
            </div>
          </div>
        </div>

        {/* Search Bar & Counter */}
        <div className="flex items-center gap-3">
          <input
            type="text"
            data-testid="merge-select-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes to merge..."
            className="w-full px-3.5 py-1.5 text-xs rounded-full border border-[var(--border-parchment)] bg-white text-[var(--ink-primary)] placeholder-stone-400 outline-none focus:border-[#C85A32] transition-all shadow-2xs"
          />
          <span
            data-testid="merge-select-count-pill"
            className="px-3 py-1 rounded-full bg-white border border-[var(--border-parchment)] text-xs text-[var(--ink-secondary)] font-mono shrink-0 shadow-2xs"
          >
            {selectedNoteIds.length} selected
          </span>
        </div>

        {/* Notes List */}
        <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto pr-1">
          {filteredNotes.map((n: any) => {
            const isChecked = selectedNoteIds.includes(n.id);
            return (
              <div
                key={n.id}
                data-testid={`merge-note-item-${n.id}`}
                onClick={() => toggleNoteSelection(n.id)}
                className={`px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 select-none ${
                  isChecked
                    ? 'bg-[#FBF0EA] border-[#C85A32] shadow-2xs'
                    : 'bg-white/80 border-[var(--border-parchment)]/80 hover:bg-[#FBF0EA]/50 shadow-2xs'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors ${
                      isChecked
                        ? 'bg-[var(--accent-terracotta)] border-[var(--accent-terracotta)] text-white'
                        : 'border-[var(--border-strong)] bg-white'
                    }`}
                  >
                    {isChecked && <Check size={11} strokeWidth={3} />}
                  </div>
                  <span className="font-serif font-bold text-xs sm:text-[13px] text-[var(--ink-primary)] truncate">
                    {n.title}
                  </span>
                </div>
                <div className="text-xs text-[var(--ink-secondary)] font-mono shrink-0">
                  {n.word_count ? `${n.word_count.toLocaleString()} words` : ''}
                </div>
              </div>
            );
          })}
        </div>

        {/* Confirmation Footer */}
        <div className="pt-3 border-t border-[var(--border-parchment)] flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-[var(--ink-secondary)]">
            {selectedNoteIds.length >= 2
              ? `${selectedNoteIds.length} notes selected ready for merge analysis.`
              : 'Select at least 2 notes to proceed.'}
          </span>
          <button
            type="button"
            data-testid="btn-confirm-merge-notes"
            disabled={selectedNoteIds.length < 2}
            onClick={handleConfirmSelection}
            className="px-4 py-1.5 rounded-lg bg-[#C85A32] text-white hover:bg-[#B34D28] text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span>Analyze &amp; Plan Merge</span>
            <ArrowRight size={13} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Committed Outcome Card
  // ───────────────────────────────────────────────────────────────────────────
  if (isCommitted) {
    const committedNoteId = data.note_id || data.replace_note_id || proposal?.affectedItemIds?.[0];
    return (
      <div
        data-testid="merge-committed-card"
        className="card-surface mt-3 p-4 sm:p-5 rounded-2xl border border-emerald-200 bg-emerald-50/50 shadow-xs flex flex-col gap-3.5 w-full text-[var(--ink-primary)] animate-fade-in"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0 text-emerald-800">
              <CheckCircle2 size={18} />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-serif font-bold text-sm sm:text-base text-[var(--ink-primary)] truncate">
                  {destination === 'replace_source' ? 'Source Note Overwritten' : 'Merged Note Created'}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#FBF0EA] text-[#C85A32] border border-[#F0D5C7]">
                  <GitMerge size={10} className="text-[#C85A32]" />
                  Merged
                </span>
              </div>
              <span className="text-xs text-emerald-800">
                {destination === 'replace_source'
                  ? 'The selected source note was updated and linked to sibling sources.'
                  : 'Synthesized note was saved to your workspace library.'}
              </span>
            </div>
          </div>
          <span className="text-[11px] font-mono text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-200 shrink-0 font-medium">
            Committed
          </span>
        </div>

        {data.title && (
          <div className="p-3 rounded-xl bg-white border border-emerald-200 flex items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={14} className="text-emerald-700 shrink-0" />
              <span className="text-xs font-serif font-bold text-[var(--ink-primary)] truncate">
                {mergedTitle || data.title}
              </span>
            </div>
            {onNavigateToItem && committedNoteId && (
              <button
                type="button"
                data-testid="btn-open-committed-note"
                onClick={() => onNavigateToItem(committedNoteId, 'note')}
                className="px-2.5 py-1 rounded bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 flex items-center gap-1 shrink-0 transition-colors shadow-2xs cursor-pointer"
              >
                <span>View Note</span>
                <ExternalLink size={11} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Cancelled State
  // ───────────────────────────────────────────────────────────────────────────
  if (isCancelled) {
    return (
      <div
        data-testid="merge-cancelled-card"
        className="card-surface mt-3 p-4 rounded-xl border border-stone-200 bg-stone-50/70 shadow-xs flex items-center justify-between gap-3 w-full text-stone-600 animate-fade-in"
      >
        <div className="flex items-center gap-2.5">
          <X size={16} className="text-stone-400" />
          <span className="text-xs font-medium">Merge operation was cancelled.</span>
        </div>
        <span className="text-[11px] font-mono text-stone-500 bg-stone-100 px-2.5 py-0.5 rounded-full border border-stone-200">
          Cancelled
        </span>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 2: Merge Plan Card (Mockup A Layout, Full Available Width)
  // ───────────────────────────────────────────────────────────────────────────
  const relationshipLevel = analysis.relationship_level || 'Strong';
  const visibleSources = showAllSources ? rawSourceNotes : rawSourceNotes.slice(0, 3);

  const getRelationshipBadge = (level: string) => {
    if (level === 'Strong') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          Strong
        </span>
      );
    }
    if (level === 'Weak') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          Weak
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-stone-100 text-stone-600 border border-stone-200">
        None apparent
      </span>
    );
  };

  const getModeBadge = (mode: GenerationMode) => {
    if (mode === 'verbatim') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-stone-100 text-stone-700 border border-stone-200 shrink-0">
          Verbatim
        </span>
      );
    }
    if (mode === 'rewritten') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
          Rewritten
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#FBF0EA] text-[#C85A32] border border-[#F0D5C7] shrink-0">
        Connective
      </span>
    );
  };

  // Section outline operations
  const moveSection = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= currentSections.length) return;
    const updated = [...currentSections];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIdx, 0, moved);
    setCurrentSections(updated);
  };

  const updateSectionTitle = (index: number, newTitle: string) => {
    const updated = [...currentSections];
    updated[index] = { ...updated[index], title: newTitle };
    setCurrentSections(updated);
  };

  const updateSectionMode = (index: number, newMode: GenerationMode) => {
    const updated = [...currentSections];
    updated[index] = { ...updated[index], mode: newMode };
    setCurrentSections(updated);
  };

  const deleteSection = (index: number) => {
    if (currentSections.length <= 1) return;
    setCurrentSections((prev) => prev.filter((_, idx) => idx !== index));
  };

  const addNewSection = () => {
    const newId = `sec-${Date.now()}`;
    setCurrentSections((prev) => [
      ...prev,
      { id: newId, title: 'New Custom Section', mode: 'rewritten', description: 'Custom synthesized section' },
    ]);
  };

  const removeAllConnective = () => {
    setCurrentSections((prev) => prev.filter((s) => s.mode !== 'connective'));
  };

  // Handle generation action
  const handleGenerateDraft = () => {
    setCurrentStage(2);
    setTimeout(() => {
      setCurrentStage(3);
    }, 700);
  };

  const handleOpenDocPanel = () => {
    if (onOpenDocumentPanel) {
      onOpenDocumentPanel({
        ...data,
        workflow: 'merge_notes',
        operation: 'merge',
        title: mergedTitle || data.title || planData.title || 'Merged Note',
        proposed_content: data.content || '',
        original_content: rawSourceNotes.map((s: any) => `## ${s.title}\n\n`).join('\n'),
      });
    }
  };

  return (
    <div
      data-testid="merge-plan-card"
      className="card-surface mt-3 p-4 sm:p-6 rounded-2xl border border-[var(--border-parchment)] bg-[#FAF8F2] shadow-xs flex flex-col gap-5 w-full text-[var(--ink-primary)] animate-fade-in"
    >
      {/* ────────────────── Header ────────────────── */}
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border-parchment)] pb-3.5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#FBF0EA] border border-[#F0D5C7] flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
            <GitMerge size={17} className="text-[var(--accent-terracotta)]" />
          </div>
          <div className="flex flex-col">
            <span className="font-serif font-bold text-sm sm:text-base text-[var(--ink-primary)] tracking-tight">
              {currentStage === 1
                ? 'Merge Plan'
                : currentStage === 2
                ? 'Generating Draft'
                : currentStage === 3
                ? 'Review Merged Draft'
                : 'Choose Destination & Apply'}
            </span>
            <span className="text-xs text-[var(--ink-secondary)]">
              {currentStage === 1
                ? 'Proposed structure, key changes, and how the notes will be combined.'
                : currentStage === 2
                ? 'Synthesizing sections and preserving verified facts...'
                : currentStage === 3
                ? 'Review section attributions, edit draft, or strip connective text.'
                : 'Select where to persist the merged note.'}
            </span>
          </div>
        </div>

        <MergeWorkflowProgress stage={currentStage} />
      </div>

      {/* ────────────────── Proposed Merged Note Title (Prominently in Plan Stage) ────────────────── */}
      {currentStage === 1 && (
        <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-[var(--border-parchment)] shadow-2xs flex flex-col gap-1.5 w-full">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--accent-midnight)] font-bold flex items-center gap-1.5">
              <Sparkles size={13} className="text-[#C85A32]" />
              <span>Proposed merged note title</span>
            </span>
            <button
              type="button"
              data-testid="btn-edit-merged-title"
              onClick={() => setIsEditingTitle(!isEditingTitle)}
              className="text-xs text-[#C85A32] hover:underline flex items-center gap-1 font-medium cursor-pointer"
            >
              <Pencil size={11} />
              <span>{isEditingTitle ? 'Done' : 'Edit Title'}</span>
            </button>
          </div>

          {isEditingTitle ? (
            <input
              type="text"
              data-testid="input-merged-title"
              value={mergedTitle}
              onChange={(e) => setMergedTitle(e.target.value)}
              placeholder="Enter title for merged note..."
              className="w-full px-3 py-1.5 text-sm sm:text-base font-serif font-bold text-[var(--ink-primary)] rounded-lg border border-[#C85A32] bg-[#FAF8F2] outline-none shadow-2xs"
            />
          ) : (
            <h3
              data-testid="text-merged-title"
              className="font-serif font-bold text-sm sm:text-base text-[var(--ink-primary)] leading-snug tracking-tight"
            >
              {mergedTitle || 'Untitled Merged Note'}
            </h3>
          )}
        </div>
      )}

      {/* ────────────────── Stage 1: Mockup A Two-Column Body (Full Available Width) ────────────────── */}
      {currentStage === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 min-h-0 w-full">
          {/* ────── Left Column: Merge Analysis & Source Notes (4/12 or 5/12 cols) ────── */}
          <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-4">
            {/* Merge Analysis Box */}
            <div className="flex flex-col gap-2.5">
              <span className="font-bold text-xs text-[var(--ink-primary)]">
                Merge Analysis
              </span>

              {/* Relationship */}
              <div className="p-3 rounded-xl bg-white border border-[var(--border-parchment)] flex flex-col gap-1 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-[var(--ink-primary)]">
                    <Sparkles size={13} className="text-emerald-600" />
                    <span>Relationship</span>
                  </div>
                  {getRelationshipBadge(relationshipLevel)}
                </div>
                <span className="text-[11.5px] text-[var(--ink-secondary)] leading-relaxed">
                  {analysis.relationship_description ||
                    'The notes cover closely related concepts in neural network training.'}
                </span>
              </div>

              {/* Duplicate Content */}
              <div className="p-3 rounded-xl bg-white border border-[var(--border-parchment)] flex flex-col gap-1 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-[var(--ink-primary)]">
                    <ShieldCheck size={13} className="text-[#8B5E3C]" />
                    <span>Duplicate Content</span>
                  </div>
                  <span
                    data-testid="analysis-duplicate-count"
                    className="w-5 h-5 rounded-full bg-stone-100 border border-stone-200 text-stone-700 text-[11px] font-mono font-bold flex items-center justify-center"
                  >
                    {analysis.duplicate_count ?? 2}
                  </span>
                </div>
                <span className="text-[11.5px] text-[var(--ink-secondary)] leading-relaxed">
                  {analysis.duplicate_summary || 'Repeated explanations will be consolidated.'}
                </span>
              </div>

              {/* Differences */}
              <div className="p-3 rounded-xl bg-white border border-[var(--border-parchment)] flex flex-col gap-1 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-[var(--ink-primary)]">
                    <AlertTriangle size={13} className="text-amber-600" />
                    <span>Differences</span>
                  </div>
                  <span
                    data-testid="analysis-difference-count"
                    className="w-5 h-5 rounded-full bg-stone-100 border border-stone-200 text-stone-700 text-[11px] font-mono font-bold flex items-center justify-center"
                  >
                    {analysis.difference_count ?? 1}
                  </span>
                </div>
                <span className="text-[11.5px] text-[var(--ink-secondary)] leading-relaxed">
                  {analysis.difference_summary || 'Minor differences in hyperparameter examples.'}
                </span>
              </div>
            </div>

            {/* Source Notes Section */}
            <div className="flex flex-col gap-2 pt-1 border-t border-[var(--border-parchment)]">
              <span className="font-bold text-xs text-[var(--ink-primary)]">
                Source Notes ({rawSourceNotes.length})
              </span>

              <div className="flex flex-col gap-1.5">
                {visibleSources.map((sn: any, idx: number) => (
                  <div
                    key={sn.note_id || idx}
                    className="p-2.5 rounded-xl bg-white border border-[var(--border-parchment)] flex items-center justify-between gap-2 shadow-2xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={13} className="text-[#8B5E3C] shrink-0" />
                      <span className="text-xs font-serif font-bold text-[var(--ink-primary)] truncate">
                        {sn.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-[var(--ink-secondary)] font-mono">
                        {sn.word_count ? `${sn.word_count.toLocaleString()} words` : ''}
                      </span>
                      {onNavigateToItem && (
                        <button
                          type="button"
                          onClick={() => onNavigateToItem(sn.note_id, 'note')}
                          className="text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
                          title="Open note in Library"
                        >
                          <ExternalLink size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {rawSourceNotes.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllSources(!showAllSources)}
                    className="text-xs text-[#C85A32] hover:underline font-medium flex items-center gap-1 pt-0.5 cursor-pointer"
                  >
                    <span>
                      {showAllSources ? 'Show fewer source notes' : `+ ${rawSourceNotes.length - 3} more source notes`}
                    </span>
                    {showAllSources ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ────── Right Column: Proposed Outline (7/12 or 8/12 cols, ample horizontal space) ────── */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-2">
              <span className="font-bold text-xs text-[var(--ink-primary)]">
                Proposed Outline
              </span>

              <button
                type="button"
                data-testid="btn-edit-outline"
                onClick={() => setIsEditingOutline(!isEditingOutline)}
                className="px-2.5 py-1 rounded-lg border border-[var(--border-parchment)] bg-white text-xs font-semibold text-[var(--ink-primary)] hover:border-[#C85A32] flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <Pencil size={11} className="text-[#C85A32]" />
                <span>{isEditingOutline ? 'Done Editing' : 'Edit Outline'}</span>
              </button>
            </div>

            {/* Outline Sections List */}
            <div className="flex flex-col gap-2 overflow-y-auto max-h-[380px] pr-1">
              {currentSections.map((sec, idx) => (
                <div
                  key={sec.id}
                  data-testid={`outline-section-${sec.id}`}
                  className="p-3 rounded-xl bg-white border border-[var(--border-parchment)] flex flex-col gap-1.5 shadow-2xs transition-all hover:border-[var(--border-strong)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-stone-300 font-mono select-none">::</span>
                      {isEditingOutline ? (
                        <input
                          type="text"
                          value={sec.title}
                          onChange={(e) => updateSectionTitle(idx, e.target.value)}
                          className="px-2 py-0.5 text-xs font-bold font-serif rounded border border-[#C85A32] bg-[#FAF8F2] text-[var(--ink-primary)] flex-1 min-w-0 outline-none"
                        />
                      ) : (
                        <span className="font-bold text-xs sm:text-[13px] text-[var(--ink-primary)] truncate font-serif">
                          {sec.title}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isEditingOutline && (
                        <div className="flex items-center gap-1 mr-1">
                          <button
                            type="button"
                            onClick={() => moveSection(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1 rounded text-stone-400 hover:text-stone-700 disabled:opacity-30 cursor-pointer"
                            title="Move section up"
                          >
                            <MoveUp size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSection(idx, 'down')}
                            disabled={idx === currentSections.length - 1}
                            className="p-1 rounded text-stone-400 hover:text-stone-700 disabled:opacity-30 cursor-pointer"
                            title="Move section down"
                          >
                            <MoveDown size={11} />
                          </button>
                          <select
                            value={sec.mode}
                            onChange={(e) => updateSectionMode(idx, e.target.value as GenerationMode)}
                            className="text-[11px] font-medium rounded border border-stone-200 px-1 py-0.5 bg-stone-50 text-stone-700 outline-none cursor-pointer"
                          >
                            <option value="verbatim">Verbatim</option>
                            <option value="rewritten">Rewritten</option>
                            <option value="connective">Connective</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => deleteSection(idx)}
                            className="p-1 rounded text-rose-500 hover:bg-rose-50 cursor-pointer"
                            title="Delete section"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )}
                      {getModeBadge(sec.mode)}
                    </div>
                  </div>

                  {sec.description && (
                    <span className="text-[11px] text-[var(--ink-secondary)] pl-5 leading-relaxed">
                      {sec.description}
                    </span>
                  )}
                </div>
              ))}

              {isEditingOutline && (
                <button
                  type="button"
                  data-testid="btn-add-section"
                  onClick={addNewSection}
                  className="p-2.5 rounded-xl border border-dashed border-[var(--border-strong)] hover:border-[#C85A32] text-xs font-semibold text-[#C85A32] flex items-center justify-center gap-1.5 transition-colors cursor-pointer bg-white/50"
                >
                  <Plus size={13} />
                  <span>Add New Section</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── Stage 2: Generation Progress Indicator ────────────────── */}
      {currentStage === 2 && (
        <div
          data-testid="merge-generating-view"
          className="p-8 rounded-xl bg-white border border-[var(--border-parchment)] flex flex-col items-center justify-center gap-4 text-center shadow-2xs w-full animate-fade-in"
        >
          <Loader2 size={26} className="text-[#C85A32] animate-spin" />
          <div className="flex flex-col gap-1">
            <span className="font-serif font-bold text-base text-[var(--ink-primary)]">
              Generating Merged Draft: {mergedTitle}...
            </span>
            <span className="text-xs text-[var(--ink-secondary)] max-w-md">
              Extracting verbatim blocks, rewriting overlapping sections, and validating factual consistency.
            </span>
          </div>

          <div className="flex flex-col gap-1.5 w-full max-w-md mt-2 text-left">
            {currentSections.map((sec) => (
              <div
                key={sec.id}
                className="px-3.5 py-2 rounded-lg bg-[#FAF8F2] border border-[var(--border-parchment)] flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-serif font-bold text-[var(--ink-primary)] truncate">
                    {sec.title}
                  </span>
                  {getModeBadge(sec.mode)}
                </div>
                <span className="font-mono text-[11px] text-emerald-700 font-medium shrink-0">
                  Synthesized ✓
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ────────────────── Stage 3: Review Draft ────────────────── */}
      {currentStage === 3 && (
        <div data-testid="merge-review-view" className="flex flex-col gap-4 w-full animate-fade-in">
          {/* Document Title Banner (Review Stage) */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-[var(--border-parchment)] shadow-2xs flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)] font-bold">
                  Proposed merged note title
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#FBF0EA] text-[#C85A32] border border-[#F0D5C7]">
                  <GitMerge size={10} className="text-[#C85A32]" />
                  Merged
                </span>
              </div>
              <button
                type="button"
                data-testid="btn-edit-review-title"
                onClick={() => setIsEditingTitle(!isEditingTitle)}
                className="text-xs text-[#C85A32] hover:underline flex items-center gap-1 font-medium cursor-pointer"
              >
                <Pencil size={11} />
                <span>{isEditingTitle ? 'Done' : 'Edit Title'}</span>
              </button>
            </div>

            {isEditingTitle ? (
              <input
                type="text"
                data-testid="input-review-title"
                value={mergedTitle}
                onChange={(e) => setMergedTitle(e.target.value)}
                className="w-full px-3 py-1.5 text-sm sm:text-base font-serif font-bold text-[var(--ink-primary)] rounded-lg border border-[#C85A32] bg-[#FAF8F2] outline-none shadow-2xs"
              />
            ) : (
              <h2
                data-testid="text-review-title"
                className="font-serif font-bold text-base sm:text-lg text-[var(--ink-primary)] leading-snug tracking-tight"
              >
                {mergedTitle || 'Untitled Merged Note'}
              </h2>
            )}
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-[var(--border-parchment)] flex items-center justify-between gap-3 shadow-2xs flex-wrap">
            <div className="flex flex-col min-w-0">
              <span className="font-serif font-bold text-sm text-[var(--ink-primary)]">
                Draft Generated Successfully
              </span>
              <span className="text-[11.5px] text-[var(--ink-secondary)]">
                {currentSections.length} sections compiled with verbatim blocks and factual protections.
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {currentSections.some((s) => s.mode === 'connective') && (
                <button
                  type="button"
                  data-testid="btn-remove-connective"
                  onClick={removeAllConnective}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border-parchment)] hover:bg-stone-50 text-xs font-medium text-stone-700 transition-colors cursor-pointer shadow-2xs"
                >
                  Remove Connective Text
                </button>
              )}

              {onOpenDocumentPanel && (
                <button
                  type="button"
                  data-testid="btn-open-document-panel"
                  onClick={handleOpenDocPanel}
                  className="px-3.5 py-1.5 rounded-lg bg-[#1B2A4A] text-white hover:bg-[#24365C] text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
                >
                  <Eye size={13} />
                  <span>Open Document Panel</span>
                </button>
              )}
            </div>
          </div>

          {/* Section Summary Cards */}
          <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto pr-1">
            {currentSections.map((sec, idx) => (
              <div
                key={sec.id}
                className="p-3.5 rounded-xl bg-white border border-[var(--border-parchment)] flex flex-col gap-1.5 shadow-2xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-serif font-bold text-xs sm:text-[13px] text-[var(--ink-primary)]">
                    {idx + 1}. {sec.title}
                  </span>
                  {getModeBadge(sec.mode)}
                </div>
                <span className="text-[11.5px] text-[var(--ink-secondary)] leading-relaxed">
                  {sec.description || (sec.mode === 'verbatim' ? 'Directly assembled from source notes' : 'Synthesized content')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ────────────────── Stage 4: Choose Destination & Apply ────────────────── */}
      {currentStage === 4 && (
        <div data-testid="merge-destination-view" className="flex flex-col gap-4 w-full animate-fade-in">
          <div className="p-4 rounded-xl bg-white border border-[var(--border-parchment)] flex flex-col gap-3.5 shadow-2xs">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border-parchment)] pb-2.5">
              <span className="font-serif font-bold text-sm text-[var(--ink-primary)]">
                Choose Destination for "{mergedTitle}":
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#FBF0EA] text-[#C85A32] border border-[#F0D5C7]">
                <GitMerge size={10} className="text-[#C85A32]" />
                Merged
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <label
                data-testid="label-destination-new"
                className="flex items-center gap-2.5 text-xs text-[var(--ink-primary)] cursor-pointer select-none p-3 rounded-lg border border-[var(--border-parchment)] bg-[#FAF8F2] flex-1 hover:border-[#C85A32] transition-colors"
              >
                <input
                  type="radio"
                  name="merge_destination"
                  value="new_note"
                  checked={destination === 'new_note'}
                  onChange={() => setDestination('new_note')}
                  className="accent-[#C85A32]"
                />
                <div className="flex flex-col">
                  <span className="font-bold">Create a new note</span>
                  <span className="text-[11px] text-[var(--ink-secondary)]">Preserve all source notes untouched in library</span>
                </div>
              </label>

              <label
                data-testid="label-destination-replace"
                className="flex items-center gap-2.5 text-xs text-[var(--ink-primary)] cursor-pointer select-none p-3 rounded-lg border border-[var(--border-parchment)] bg-[#FAF8F2] flex-1 hover:border-[#C85A32] transition-colors"
              >
                <input
                  type="radio"
                  name="merge_destination"
                  value="replace_source"
                  checked={destination === 'replace_source'}
                  onChange={() => setDestination('replace_source')}
                  className="accent-[#C85A32]"
                />
                <div className="flex flex-col">
                  <span className="font-bold">Replace a source note</span>
                  <span className="text-[11px] text-[var(--ink-secondary)]">Overwrite one note in place and link siblings</span>
                </div>
              </label>
            </div>

            {destination === 'replace_source' && (
              <div className="flex flex-col gap-2.5 pt-3 border-t border-[var(--border-parchment)] animate-fade-in">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-xs font-medium text-[var(--ink-secondary)]">
                    Target note to overwrite:
                  </span>
                  <select
                    data-testid="select-replace-note"
                    value={targetReplaceNoteId}
                    onChange={(e) => setTargetReplaceNoteId(e.target.value)}
                    className="text-xs font-serif font-bold rounded-lg border border-[var(--border-parchment)] px-3 py-1.5 bg-[#FAF8F2] text-[var(--ink-primary)] outline-none focus:border-[#C85A32]"
                  >
                    {rawSourceNotes.map((sn: any) => (
                      <option key={sn.note_id} value={sn.note_id}>
                        {sn.title}
                      </option>
                    ))}
                  </select>
                </div>

                <label
                  data-testid="label-confirm-overwrite"
                  className="flex items-center gap-2 text-xs text-rose-800 bg-rose-50 p-3 rounded-xl border border-rose-200 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    data-testid="checkbox-confirm-overwrite"
                    checked={confirmOverwriteChecked}
                    onChange={(e) => setConfirmOverwriteChecked(e.target.checked)}
                    className="accent-rose-700 w-4 h-4 rounded"
                  />
                  <span>
                    I confirm that I want to replace the contents of this source note.
                  </span>
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────── Footer Note ────────────────── */}
      <div className="pt-3 border-t border-[var(--border-parchment)] flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-[var(--ink-secondary)] flex items-center gap-1.5">
          <AlertCircle size={13} className="text-[#8B5E3C] shrink-0" />
          <span>
            {planData.explanation ||
              'The LLM will write only for sections marked Rewritten or Connective. Other sections will be assembled from the original notes.'}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 ml-auto">
          {currentStage > 1 && currentStage < 4 && (
            <button
              type="button"
              onClick={() => setCurrentStage((s) => ((s - 1) as any))}
              disabled={isCommitting}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-parchment)] hover:bg-white text-xs font-medium text-[var(--ink-secondary)] transition-colors cursor-pointer shadow-2xs flex items-center gap-1"
            >
              <ArrowLeft size={12} />
              <span>Back</span>
            </button>
          )}

          {currentStage === 4 && (
            <button
              type="button"
              onClick={() => setCurrentStage(3)}
              disabled={isCommitting}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-parchment)] hover:bg-white text-xs font-medium text-[var(--ink-secondary)] transition-colors cursor-pointer shadow-2xs flex items-center gap-1"
            >
              <ArrowLeft size={12} />
              <span>Back to Review</span>
            </button>
          )}

          <button
            type="button"
            data-testid="btn-cancel-merge"
            onClick={onCancel}
            disabled={isCommitting}
            className="px-3.5 py-1.5 rounded-lg border border-[var(--border-parchment)] hover:bg-white text-xs font-medium text-[var(--ink-secondary)] transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
          >
            Cancel
          </button>

          {currentStage === 1 && (
            <button
              type="button"
              data-testid="btn-generate-draft"
              onClick={handleGenerateDraft}
              className="px-4 py-1.5 rounded-lg bg-[#C85A32] text-white hover:bg-[#B34D28] text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
            >
              <span>Generate Draft</span>
              <ArrowRight size={13} strokeWidth={2.5} />
            </button>
          )}

          {currentStage === 3 && (
            <button
              type="button"
              data-testid="btn-proceed-destination"
              onClick={() => setCurrentStage(4)}
              className="px-4 py-1.5 rounded-lg bg-[#C85A32] text-white hover:bg-[#B34D28] text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
            >
              <span>Choose Destination</span>
              <ArrowRight size={13} strokeWidth={2.5} />
            </button>
          )}

          {currentStage === 4 && (
            <button
              type="button"
              data-testid="btn-apply-merge"
              disabled={isCommitting || (destination === 'replace_source' && !confirmOverwriteChecked)}
              onClick={() =>
                onConfirm?.({
                  title: mergedTitle,
                  content: data.content,
                  destination,
                  replace_note_id: destination === 'replace_source' ? targetReplaceNoteId : undefined,
                })
              }
              className="px-4 py-1.5 rounded-lg bg-[#1B2A4A] text-white hover:bg-[#24365C] text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isCommitting ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Applying...</span>
                </>
              ) : (
                <>
                  <Check size={13} strokeWidth={2.5} />
                  <span>{destination === 'replace_source' ? 'Overwrite Note' : 'Create Merged Note'}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
