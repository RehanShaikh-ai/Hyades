import React, { useState, useMemo } from 'react';
import {
  Check,
  CheckSquare,
  Square,
  BookOpen,
  Compass,
  AlertCircle,
  ExternalLink,
  Edit3,
  Layers,
  Lightbulb,
  GitFork,
  Globe,
  Eye,
} from 'lucide-react';

export interface EnrichmentProposalItem {
  id: string;
  type: 'clarity' | 'knowledge' | 'connection';
  title: string;
  proposed_text: string;
  target_section?: string;
  evidence_basis: 'workspace' | 'model_knowledge' | 'inference' | 'external';
  supporting_evidence?: string | null;
  source_id?: string | null;
  source_title?: string | null;
  source_type?: 'note' | 'source' | null;
  chunk_id?: string | null;
  rationale: string;
  status?: 'pending' | 'accepted' | 'rejected';
}

export interface InChatEnrichmentProposalReviewProps {
  details: {
    note_id?: string;
    title?: string;
    outcome?: 'enriched' | 'partially_enriched' | 'insufficient_information' | 'no_changes_suggested';
    summary?: string;
    original_content?: string;
    proposed_content?: string;
    enrichment_addition?: string;
    proposals?: EnrichmentProposalItem[];
    unresolved_gaps?: Array<{ gap_id: string; description: string; reason?: string }>;
    research_directions?: string[];
    rejected_evidence?: Array<{ item_id: string; title: string; rejection_reason?: string }>;
  };
  isCommitted?: boolean;
  isCancelled?: boolean;
  onNavigateToItem?: (id: string, itemType: string) => void;
  onPreviewArtifact?: (artifact: {
    title: string;
    content: string;
    type: string;
    subtitle?: string;
  }) => void;
  onSelectionChange?: (selectedIds: string[], editedProposals: Record<string, string>) => void;
}

export const InChatEnrichmentProposalReview: React.FC<InChatEnrichmentProposalReviewProps> = ({
  details,
  isCommitted = false,
  isCancelled = false,
  onNavigateToItem,
  onPreviewArtifact,
  onSelectionChange,
}) => {
  const proposals: EnrichmentProposalItem[] = Array.isArray(details.proposals)
    ? details.proposals
    : [];

  const outcome = details.outcome || (proposals.length > 0 ? 'enriched' : 'no_changes_suggested');

  // Track selection state per proposal
  const [selectedMap, setSelectedMap] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    proposals.forEach((p) => {
      init[p.id] = p.status !== 'rejected';
    });
    return init;
  });

  // Track inline edited text per proposal
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedTextMap, setEditedTextMap] = useState<Record<string, string>>({});

  // Notify parent of selection / edit changes
  const updateSelectionsAndEdits = (
    newMap: Record<string, boolean>,
    newEdits: Record<string, string>
  ) => {
    if (onSelectionChange) {
      const activeIds = Object.keys(newMap).filter((id) => newMap[id]);
      onSelectionChange(activeIds, newEdits);
    }
  };

  const handleToggleProposal = (id: string) => {
    if (isCommitted || isCancelled) return;
    const nextMap = { ...selectedMap, [id]: !selectedMap[id] };
    setSelectedMap(nextMap);
    updateSelectionsAndEdits(nextMap, editedTextMap);
  };

  const handleTextEditSave = (id: string, text: string) => {
    const nextEdits = { ...editedTextMap, [id]: text };
    setEditedTextMap(nextEdits);
    setEditingId(null);
    updateSelectionsAndEdits(selectedMap, nextEdits);
  };

  // Group into content additions vs connections
  const contentProposals = useMemo(
    () => proposals.filter((p) => p.type !== 'connection'),
    [proposals]
  );
  const connectionProposals = useMemo(
    () => proposals.filter((p) => p.type === 'connection'),
    [proposals]
  );

  // Bulk toggle for connections
  const allConnectionsSelected = useMemo(() => {
    if (connectionProposals.length === 0) return false;
    return connectionProposals.every((p) => selectedMap[p.id]);
  }, [connectionProposals, selectedMap]);

  const handleToggleAllConnections = () => {
    if (isCommitted || isCancelled) return;
    const nextMap = { ...selectedMap };
    const targetState = !allConnectionsSelected;
    connectionProposals.forEach((p) => {
      nextMap[p.id] = targetState;
    });
    setSelectedMap(nextMap);
    updateSelectionsAndEdits(nextMap, editedTextMap);
  };

  // Preview Note with only accepted proposals
  const handlePreviewUpdatedNote = () => {
    if (!onPreviewArtifact) return;
    const body = (details.original_content || '').trimEnd();
    const activeProps = proposals.filter((p) => selectedMap[p.id]);

    const contentAdditions = activeProps
      .filter((p) => p.type !== 'connection')
      .map((p) => {
        const text = editedTextMap[p.id] !== undefined ? editedTextMap[p.id] : p.proposed_text;
        return `### ${p.target_section || 'Additions'}\n${text}`;
      });

    const connAdditions = activeProps
      .filter((p) => p.type === 'connection')
      .map((p) => {
        const text = editedTextMap[p.id] !== undefined ? editedTextMap[p.id] : p.proposed_text;
        return `- **${p.source_title || 'Related Source'}** (${p.source_type || 'workspace'}): ${text}`;
      });

    let previewMd = body;
    const blocks: string[] = [];
    if (contentAdditions.length > 0) {
      blocks.push(`## Contextual Enrichment\n\n${contentAdditions.join('\n\n')}`);
    }
    if (connAdditions.length > 0) {
      blocks.push(`## Workspace Connections\n\n${connAdditions.join('\n\n')}`);
    }

    if (blocks.length > 0) {
      previewMd = body ? `${body}\n\n${blocks.join('\n\n')}` : blocks.join('\n\n');
    }

    onPreviewArtifact({
      title: `Enriched: ${details.title || 'Note'}`,
      content: previewMd,
      type: 'Note',
      subtitle: `${activeProps.length} Accepted Proposals`,
    });
  };

  // Render badge helper for Evidence Basis
  const renderBasisBadge = (basis: EnrichmentProposalItem['evidence_basis']) => {
    switch (basis) {
      case 'workspace':
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-mono font-medium bg-[#E8F1E5] text-[#2C5E28] border border-[#C5DAC0]"
            title="Verified from retrieved workspace document"
          >
            <BookOpen size={11} className="text-[#2C5E28]" />
            <span>Workspace</span>
          </span>
        );
      case 'model_knowledge':
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-mono font-medium bg-[#FBF2E6] text-[#8C4A17] border border-[#ECD1B3]"
            title="Generated from general knowledge base; not in workspace files"
          >
            <Lightbulb size={11} className="text-[#8C4A17]" />
            <span>Model knowledge</span>
          </span>
        );
      case 'inference':
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-mono font-medium bg-[#EEF2F6] text-[#294B69] border border-[#CCD8E3]"
            title="Deductive inference from note context"
          >
            <GitFork size={11} className="text-[#294B69]" />
            <span>Inference</span>
          </span>
        );
      case 'external':
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-mono font-medium bg-[#F3EBF9] text-[#63297A] border border-[#DCC3E7]"
            title="Verified from external research tool"
          >
            <Globe size={11} className="text-[#63297A]" />
            <span>External</span>
          </span>
        );
      default:
        return null;
    }
  };

  // Render badge helper for Proposal Type
  const renderTypeBadge = (type: EnrichmentProposalItem['type']) => {
    switch (type) {
      case 'clarity':
        return (
          <span className="text-[10.5px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
            Clarity
          </span>
        );
      case 'knowledge':
        return (
          <span className="text-[10.5px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
            Knowledge
          </span>
        );
      case 'connection':
        return (
          <span className="text-[10.5px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
            Connection
          </span>
        );
    }
  };

  // Render Outcome Banner
  const renderOutcomeBanner = () => {
    let outcomeClass = 'bg-[#FAF8F3] border-[#E0D8C8] text-[#2C2724]';
    let outcomeLabel = 'Enriched';
    let icon = <Check size={14} className="text-emerald-700" />;

    if (outcome === 'partially_enriched') {
      outcomeClass = 'bg-[#FFF9F2] border-[#EAD5BE] text-[#5C3B14]';
      outcomeLabel = 'Partially Enriched';
      icon = <AlertCircle size={14} className="text-amber-700" />;
    } else if (outcome === 'insufficient_information') {
      outcomeClass = 'bg-[#F9F7F4] border-[#DDD5C7] text-[#4A433A]';
      outcomeLabel = 'Insufficient Information';
      icon = <Compass size={14} className="text-[#8A7A6A]" />;
    } else if (outcome === 'no_changes_suggested') {
      outcomeClass = 'bg-[#F4F8F4] border-[#CDE0CC] text-[#254A23]';
      outcomeLabel = 'No Changes Suggested';
      icon = <Check size={14} className="text-emerald-700" />;
    }

    return (
      <div className={`p-3.5 rounded-xl border ${outcomeClass} flex flex-col gap-2 font-sans`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {icon}
            <span className="font-serif font-bold text-sm tracking-wide">{outcomeLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-[var(--ink-secondary)]">
              {proposals.length} addition(s)
            </span>
            {onPreviewArtifact && proposals.length > 0 && !isCommitted && (
              <button
                type="button"
                onClick={handlePreviewUpdatedNote}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[var(--border-parchment)] bg-white hover:bg-[var(--bg-panel-subtle)] text-[11px] font-medium text-[var(--ink-primary)] shadow-2xs transition-colors cursor-pointer"
                title="Preview note with accepted additions applied"
              >
                <Eye size={12} />
                <span>Preview Note</span>
              </button>
            )}
          </div>
        </div>

        <p className="text-xs leading-relaxed text-[var(--ink-secondary)]">
          {details.summary || `Enrichment analysis complete for note '${details.title}'.`}
        </p>

        {/* Unresolved Gaps & Research Directions */}
        {details.unresolved_gaps && details.unresolved_gaps.length > 0 && (
          <div className="mt-1 pt-2 border-t border-[var(--border-parchment)] flex flex-col gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-900 font-semibold flex items-center gap-1">
              <Compass size={11} />
              <span>Unresolved Gaps ({details.unresolved_gaps.length})</span>
            </span>
            <ul className="text-[11.5px] text-[var(--ink-secondary)] list-disc list-inside space-y-0.5">
              {details.unresolved_gaps.map((g, idx) => (
                <li key={g.gap_id || idx}>
                  <span className="font-medium">{g.description}</span>
                  {g.reason && <span className="opacity-80"> — {g.reason}</span>}
                </li>
              ))}
            </ul>

            {details.research_directions && details.research_directions.length > 0 && (
              <div className="mt-1 text-[11px] text-[var(--ink-tertiary)] italic">
                <span className="font-medium text-[var(--ink-secondary)]">Suggested research: </span>
                {details.research_directions.join(' ')}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Render a Single Proposal Item Card
  const renderProposalCard = (prop: EnrichmentProposalItem) => {
    const isSelected = Boolean(selectedMap[prop.id]);
    const isEditing = editingId === prop.id;
    const currentText = editedTextMap[prop.id] !== undefined ? editedTextMap[prop.id] : prop.proposed_text;

    return (
      <div
        key={prop.id}
        className={`p-3.5 rounded-xl border transition-all ${
          isSelected
            ? 'bg-white border-[#E0D8C8] shadow-xs'
            : 'bg-[#FAF8F3]/60 border-[#E8E2D5] opacity-60'
        } flex flex-col gap-2.5 font-sans`}
      >
        {/* Top Header: Selection checkbox + badges */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {!isCommitted && !isCancelled && (
              <button
                type="button"
                onClick={() => handleToggleProposal(prop.id)}
                className="text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] cursor-pointer shrink-0"
                aria-label={isSelected ? 'Reject addition' : 'Accept addition'}
              >
                {isSelected ? (
                  <CheckSquare size={16} className="text-[#BD532B]" />
                ) : (
                  <Square size={16} className="text-[#8A7A6A]" />
                )}
              </button>
            )}

            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              {renderTypeBadge(prop.type)}
              {renderBasisBadge(prop.evidence_basis)}
              {prop.target_section && (
                <span className="text-[10px] font-mono text-[var(--ink-tertiary)] truncate">
                  Section: {prop.target_section}
                </span>
              )}
            </div>
          </div>

          {!isCommitted && !isCancelled && (
            <button
              type="button"
              onClick={() => setEditingId(isEditing ? null : prop.id)}
              className="p-1 rounded hover:bg-[var(--bg-panel-subtle)] text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer shrink-0"
              title="Edit proposed text"
            >
              <Edit3 size={13} />
            </button>
          )}
        </div>

        {/* Proposed Text (Editable or Read-Only) */}
        {isEditing ? (
          <div className="flex flex-col gap-2">
            <textarea
              defaultValue={currentText}
              id={`edit-textarea-${prop.id}`}
              className="w-full text-xs font-serif p-2 rounded-lg border border-[var(--border-parchment)] bg-[#FAF8F3] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#BD532B] min-h-[90px] leading-relaxed"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="px-2.5 py-1 rounded text-[11px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById(`edit-textarea-${prop.id}`) as HTMLTextAreaElement;
                  if (el) handleTextEditSave(prop.id, el.value);
                }}
                className="px-2.5 py-1 rounded bg-[#BD532B] text-white text-[11px] font-medium hover:bg-[#A84520] cursor-pointer"
              >
                Save Edit
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs font-serif leading-relaxed text-[var(--ink-primary)] whitespace-pre-line pl-6">
            {currentText}
          </p>
        )}

        {/* Supporting Evidence Snippet & Real Source Link */}
        {prop.supporting_evidence && (
          <div className="ml-6 p-2 rounded-lg bg-[#FAF8F3] border border-[#EADBCC] flex flex-col gap-1 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#8A6032] font-semibold flex items-center gap-1">
                <BookOpen size={10} />
                <span>Supporting Evidence Passage</span>
              </span>

              {prop.source_id && onNavigateToItem && (
                <button
                  type="button"
                  onClick={() => onNavigateToItem(prop.source_id!, prop.source_type || 'note')}
                  className="text-[10.5px] text-[#BD532B] hover:underline flex items-center gap-1 cursor-pointer font-medium"
                  title="Open source document"
                >
                  <span>{prop.source_title || 'View Source'}</span>
                  <ExternalLink size={10} />
                </button>
              )}
            </div>
            <p className="text-[#3A332C] italic leading-relaxed">
              "{prop.supporting_evidence}"
            </p>
          </div>
        )}

        {/* Rationale Explanation */}
        {prop.rationale && (
          <div className="ml-6 text-[10.5px] text-[var(--ink-secondary)] flex items-center gap-1">
            <span className="font-medium text-[var(--ink-tertiary)]">Why:</span>
            <span>{prop.rationale}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3 font-sans">
      {/* 1. Top Outcome Banner */}
      {renderOutcomeBanner()}

      {/* 2. Content Proposals (Clarity & Knowledge) */}
      {contentProposals.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)] font-semibold flex items-center gap-1">
              <Layers size={12} />
              <span>Proposed Knowledge & Clarity Additions ({contentProposals.length})</span>
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {contentProposals.map(renderProposalCard)}
          </div>
        </div>
      )}

      {/* 3. Connections Proposals (Grouped Separately with Bulk Toggle) */}
      {connectionProposals.length > 0 && (
        <div className="flex flex-col gap-2 mt-1">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)] font-semibold flex items-center gap-1">
              <GitFork size={12} />
              <span>Workspace Connections ({connectionProposals.length})</span>
            </span>

            {!isCommitted && !isCancelled && (
              <button
                type="button"
                onClick={handleToggleAllConnections}
                className="text-[10.5px] font-mono text-[#BD532B] hover:underline cursor-pointer"
              >
                {allConnectionsSelected ? 'Reject All Connections' : 'Accept All Connections'}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {connectionProposals.map(renderProposalCard)}
          </div>
        </div>
      )}
    </div>
  );
};
