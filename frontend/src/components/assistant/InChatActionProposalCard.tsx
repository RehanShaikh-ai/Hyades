import React, { useState, useMemo, useEffect } from 'react';
import { GenericActionProposalData } from '@/types/commands';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Sliders,
  FileText,
  BookOpen,
  FolderOpen,
  GitBranch,
  Sparkles,
  GitMerge,
  Scissors,
  ArrowUpRight,
  AlertCircle,
  Eye,
} from 'lucide-react';

interface InChatActionProposalCardProps {
  proposal: GenericActionProposalData;
  isCommitting?: boolean;
  onConfirm: (overrides?: Record<string, any>) => void;
  onCancel: () => void;
  onNavigateToItem?: (id: string, itemType: string) => void;
  onPreviewArtifact?: (artifact: {
    title: string;
    content: string;
    type: string;
    subtitle?: string;
  }) => void;
}

export const InChatActionProposalCard: React.FC<InChatActionProposalCardProps> = ({
  proposal,
  isCommitting = false,
  onConfirm,
  onCancel,
  onNavigateToItem,
  onPreviewArtifact,
}) => {
  const isCommitted = proposal.status === 'committed';
  const isCancelled = proposal.status === 'cancelled';

  const rawData = proposal.data || {};
  const details =
    rawData.details && typeof rawData.details === 'object' && !Array.isArray(rawData.details)
      ? { ...rawData, ...rawData.details }
      : rawData;

  const cmd = (proposal.command || '').toLowerCase();
  const workflow = details.workflow || '';
  const isInteractiveCandidateProposal =
    cmd === '/populate-collection' ||
    workflow === 'populate_collection' ||
    workflow === 'organize_populate_collection' ||
    workflow === 'organize_knowledge' ||
    workflow === 'organize_create_thread';

  const candidateItemsList = useMemo(() => {
    const raw = Array.isArray(details.candidate_items)
      ? details.candidate_items
      : Array.isArray(details.selected_items)
        ? details.selected_items
        : Array.isArray(details.notes)
          ? details.notes
          : [];
    return raw.map((it: any, idx: number) => {
      if (typeof it === 'string') {
        return {
          key: it,
          item_id: it,
          item_type: 'note',
          title: it,
          excerpt: '',
          existing_collections: [] as string[],
          selected: true,
        };
      }
      const key = String(it.item_id || it.id || it.note_id || it.source_id || idx);
      return {
        key,
        item_id: String(it.item_id || it.id || it.note_id || it.source_id || idx),
        note_id: it.note_id,
        source_id: it.source_id,
        item_type: String(it.item_type || (it.source_id ? 'source' : 'note')),
        title: String(it.title || it.name || 'Untitled Item'),
        excerpt: String(it.excerpt || ''),
        existing_collections: Array.isArray(it.existing_collections)
          ? it.existing_collections
          : [],
        selected: it.selected !== false,
      };
    });
  }, [details.candidate_items, details.selected_items, details.notes]);

  const [selectedCandidateMap, setSelectedCandidateMap] = useState<Record<string, boolean>>({});
  const [editedName, setEditedName] = useState<string>('');

  useEffect(() => {
    const init: Record<string, boolean> = {};
    candidateItemsList.forEach((c: any) => {
      init[c.key] = c.selected !== false;
    });
    setSelectedCandidateMap(init);
    setEditedName(
      details.collection_name || details.name || details.title || ''
    );
  }, [candidateItemsList, details.collection_name, details.name, details.title]);

  const selectedCandidates = useMemo(
    () => candidateItemsList.filter((c: any) => selectedCandidateMap[c.key]),
    [candidateItemsList, selectedCandidateMap]
  );

  const isZeroSelected =
    isInteractiveCandidateProposal &&
    candidateItemsList.length > 0 &&
    selectedCandidates.length === 0;

  const handleConfirmClick = () => {
    if (isInteractiveCandidateProposal && candidateItemsList.length > 0) {
      if (selectedCandidates.length === 0) return;
      const overrides: Record<string, any> = {
        selected_items: selectedCandidates.map((c: any) => ({
          item_id: c.item_id,
          note_id: c.item_type === 'note' ? c.item_id : undefined,
          source_id: c.item_type === 'source' ? c.item_id : undefined,
          item_type: c.item_type,
          title: c.title,
          selected: true,
        })),
      };
      if (editedName.trim() && (workflow === 'organize_knowledge' || workflow === 'organize_create_thread')) {
        overrides.name = editedName.trim();
        overrides.title = editedName.trim();
      }
      onConfirm(overrides);
      return;
    }
    onConfirm();
  };

  const hasArtifactContent = Boolean(
    details.content ||
    details.enrichment_addition ||
    details.merged_content ||
    (Array.isArray(details.proposed_parts) && details.proposed_parts.some((p: any) => p.content || p.preview))
  );

  const handlePreviewClick = () => {
    if (!onPreviewArtifact) return;

    if (cmd === '/create-source' || proposal.actionId === 'sources.create') {
      const isBrief =
        details.content &&
        (details.content.includes('# Research Brief') ||
          details.content.includes('Research Question'));
      onPreviewArtifact({
        title: details.title || 'Untitled Source',
        content: details.content || '',
        type: details.source_type === 'document' ? 'Document' : 'Source',
        subtitle: isBrief ? 'Research Brief' : 'Ingestion Content',
      });
      return;
    }

    if (cmd === '/enrich-note' || details.enrichment_addition) {
      onPreviewArtifact({
        title: `Enrichment: ${details.title || 'Note'}`,
        content: details.enrichment_addition || '',
        type: 'Note',
        subtitle: 'Proposed Enrichment',
      });
      return;
    }

    if (cmd === '/merge-notes' || details.merged_content) {
      onPreviewArtifact({
        title: details.title || 'Merged Note',
        content: details.content || details.merged_content || '',
        type: 'Note',
        subtitle: 'Merged Content',
      });
      return;
    }

    if (Array.isArray(details.proposed_parts) && details.proposed_parts.length > 0) {
      const partsContent = details.proposed_parts
        .map(
          (p: any, i: number) =>
            `## Part ${i + 1}: ${p.title || `Section ${i + 1}`}\n\n${p.content || p.preview || ''}`
        )
        .join('\n\n---\n\n');
      onPreviewArtifact({
        title: `Split Note: ${details.original_title || details.title || 'Note'}`,
        content: partsContent,
        type: 'Note',
        subtitle: `${details.proposed_parts.length} Modular Parts`,
      });
      return;
    }

    if (details.content) {
      onPreviewArtifact({
        title: details.title || 'Untitled Artifact',
        content: details.content,
        type: proposal.actionId.startsWith('notes.') ? 'Note' : 'Artifact',
        subtitle: 'Draft Content',
      });
      return;
    }
  };

  const renderStructuredDetails = () => {
    // 1. /split-note
    if (
      cmd === '/split-note' ||
      workflow === 'split_note' ||
      Array.isArray(details.proposed_parts) ||
      Array.isArray(details.created_notes)
    ) {
      const parts = Array.isArray(details.proposed_parts) ? details.proposed_parts : [];
      const createdNotes = Array.isArray(details.created_notes) ? details.created_notes : [];

      if (isCommitted && createdNotes.length > 0) {
        return (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-800">
              Created {createdNotes.length} Modular Notes in Library:
            </span>
            <div className="flex flex-col gap-1.5">
              {createdNotes.map((cn: any, idx: number) => (
                <div
                  key={cn.note_id || idx}
                  onClick={() => cn.note_id && onNavigateToItem?.(cn.note_id, 'note')}
                  className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200 flex items-center justify-between gap-2 cursor-pointer hover:bg-emerald-50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={13} className="text-emerald-700 shrink-0" />
                    <span className="text-xs font-semibold text-[var(--ink-primary)] truncate">
                      {cn.title}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-700 flex items-center gap-1 shrink-0">
                    Open in Library <ArrowUpRight size={11} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      }

      if (parts.length > 0) {
        return (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] font-mono text-[var(--ink-tertiary)]">
              <span>
                Source Note:{' '}
                <strong className="text-[var(--ink-primary)]">
                  {details.original_title || details.title}
                </strong>
              </span>
              <span>{parts.length} Proposed Parts</span>
            </div>
            <div className="flex flex-col gap-2">
              {parts.map((part: any, idx: number) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-serif font-bold text-[var(--ink-primary)] flex items-center gap-1.5">
                      <Scissors size={12} className="text-[var(--accent-terracotta)]" />
                      Part {idx + 1}: {part.title}
                    </span>
                    {part.word_count && (
                      <span className="text-[10px] font-mono text-[var(--ink-tertiary)]">
                        ~{part.word_count} words
                      </span>
                    )}
                  </div>
                  {part.focus && (
                    <span className="text-[11px] text-[var(--accent-midnight)] font-medium">
                      Focus: {part.focus}
                    </span>
                  )}
                  {(part.preview || part.content) && (
                    <p className="text-[11.5px] text-[var(--ink-secondary)] line-clamp-3 mt-1 whitespace-pre-line">
                      {part.preview || part.content}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      }
    }

    // 2. /merge-notes
    if (
      cmd === '/merge-notes' ||
      workflow === 'merge_notes' ||
      Array.isArray(details.source_notes)
    ) {
      const sourceNotes = Array.isArray(details.source_notes) ? details.source_notes : [];
      return (
        <div className="flex flex-col gap-2.5">
          {sourceNotes.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)]">
                Source Notes to Merge ({sourceNotes.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {sourceNotes.map((sn: any, idx: number) => (
                  <span
                    key={sn.note_id || idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-xs font-medium text-[var(--ink-primary)]"
                  >
                    <GitMerge size={11} className="text-[var(--accent-terracotta)]" />
                    {sn.title || sn}
                  </span>
                ))}
              </div>
            </div>
          )}
          {details.title && (
            <div className="p-2.5 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex flex-col gap-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)]">
                Proposed Merged Note Title
              </span>
              <span className="text-xs font-serif font-bold text-[var(--ink-primary)]">
                {details.title}
              </span>
              {details.content && (
                <p className="text-[11.5px] text-[var(--ink-secondary)] line-clamp-4 mt-1 whitespace-pre-line">
                  {details.content}
                </p>
              )}
            </div>
          )}
          {isCommitted && details.note_id && onNavigateToItem && (
            <button
              type="button"
              onClick={() => onNavigateToItem(details.note_id, 'note')}
              className="self-start text-xs font-mono text-[var(--accent-midnight)] hover:underline flex items-center gap-1 cursor-pointer"
            >
              Open Merged Note in Library <ArrowUpRight size={12} />
            </button>
          )}
        </div>
      );
    }

    // 3. /enrich-note
    if (cmd === '/enrich-note' || workflow === 'enrich_note' || details.enrichment_addition) {
      const relatedItems = Array.isArray(details.related_items) ? details.related_items : [];
      return (
        <div className="flex flex-col gap-2.5">
          <div className="p-2.5 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex flex-col gap-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)]">
              Target Note
            </span>
            <span className="text-xs font-serif font-bold text-[var(--ink-primary)]">
              {details.title}
            </span>
          </div>

          {relatedItems.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)]">
                Context Drawn From ({relatedItems.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {relatedItems.map((ri: any, idx: number) => (
                  <span
                    key={ri.id || idx}
                    className="text-[11px] px-2 py-0.5 rounded bg-amber-50/70 text-amber-900 border border-amber-200 font-medium"
                  >
                    {ri.title}
                  </span>
                ))}
              </div>
            </div>
          )}

          {details.enrichment_addition && (
            <div className="p-2.5 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex flex-col gap-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)]">
                Proposed Enrichment Section
              </span>
              <p className="text-[11.5px] text-[var(--ink-secondary)] whitespace-pre-line line-clamp-6">
                {details.enrichment_addition}
              </p>
            </div>
          )}
        </div>
      );
    }

    // 4. /create-source
    if (cmd === '/create-source' || proposal.actionId === 'sources.create') {
      if (isCommitted) {
        return (
          <div className="flex flex-col gap-2" data-testid="committed-source-outcome">
            <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <BookOpen size={16} className="text-emerald-700 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-serif font-bold text-[var(--ink-primary)] truncate">
                    {details.title || 'Created Source'}
                  </span>
                  <span className="text-[10.5px] font-mono text-emerald-800">
                    Source · {details.source_type === 'document' ? 'Document' : 'Text'} {details.source_id ? `· ID: ${String(details.source_id).slice(0, 8)}...` : ''}
                  </span>
                </div>
              </div>
              {onNavigateToItem && (details.source_id || proposal.affectedItemIds?.[0]) && (
                <button
                  type="button"
                  onClick={() =>
                    onNavigateToItem(
                      details.source_id || proposal.affectedItemIds![0],
                      'source'
                    )
                  }
                  className="px-2.5 py-1 rounded bg-white hover:bg-emerald-700 hover:text-white border border-emerald-300 text-[11px] font-mono font-medium text-emerald-900 flex items-center gap-1 transition-colors shrink-0 cursor-pointer shadow-2xs"
                >
                  <span>View Source</span>
                  <ArrowUpRight size={11} />
                </button>
              )}
            </div>
          </div>
        );
      }

      return (
        <div className="flex flex-col gap-2">
          <div className="p-2.5 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex items-center justify-between gap-2">
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)]">
                Source Title
              </span>
              <span className="text-xs font-serif font-bold text-[var(--ink-primary)] truncate">
                {details.title}
              </span>
            </div>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white border border-[var(--border-parchment)] text-[var(--ink-secondary)] shrink-0">
              {details.source_type || 'text'}
            </span>
          </div>
          {details.content && (
            <div className="p-2.5 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex flex-col gap-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)]">
                Content ( Excerpt )
              </span>
              <p className="text-[11.5px] text-[var(--ink-secondary)] whitespace-pre-line line-clamp-6">
                {details.content}
              </p>
            </div>
          )}
        </div>
      );
    }

    // 5. /populate-collection or organize_knowledge / organize_create_thread
    if (isInteractiveCandidateProposal) {
      const addedItems = Array.isArray(details.added_items) ? details.added_items : [];
      const isThread = workflow === 'organize_create_thread' || details.artifact_type === 'thread';
      const targetTitle =
        details.collection_name || details.name || details.title || 'Collection';

      if (isCommitted) {
        const committedList = addedItems.length > 0 ? addedItems : selectedCandidates;
        return (
          <div className="flex flex-col gap-2.5" data-testid="committed-organization-outcome">
            <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {isThread ? (
                  <GitBranch size={14} className="text-emerald-700 shrink-0" />
                ) : (
                  <FolderOpen size={14} className="text-emerald-700 shrink-0" />
                )}
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-serif font-bold text-[var(--ink-primary)] truncate">
                    {targetTitle}
                  </span>
                  <span className="text-[10.5px] font-mono text-emerald-800">
                    {committedList.length} item(s) included · Existing memberships preserved
                  </span>
                </div>
              </div>
              {onNavigateToItem && (details.collection_id || details.thread_id) && (
                <button
                  type="button"
                  onClick={() =>
                    onNavigateToItem(
                      details.collection_id || details.thread_id,
                      isThread ? 'thread' : 'collection'
                    )
                  }
                  className="px-2.5 py-1 rounded bg-white hover:bg-emerald-700 hover:text-white border border-emerald-300 text-[11px] font-mono font-medium text-emerald-900 flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
                >
                  <span>{isThread ? 'Open Thread' : 'Open Collection'}</span>
                  <ArrowUpRight size={11} />
                </button>
              )}
            </div>

            {committedList.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)]">
                  Committed Items ({committedList.length})
                </span>
                {committedList.map((item: any, idx: number) => {
                  const id = item.item_id || item.note_id || item.source_id;
                  const iType = item.item_type || 'note';
                  return (
                    <div
                      key={id || idx}
                      onClick={() => id && onNavigateToItem?.(id, iType)}
                      className="p-2 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex items-center justify-between gap-2 text-xs cursor-pointer hover:border-[var(--accent-midnight)]"
                    >
                      <span className="font-medium text-[var(--ink-primary)] flex items-center gap-1.5 truncate">
                        {iType === 'source' ? (
                          <BookOpen size={11} className="text-[var(--accent-terracotta)] shrink-0" />
                        ) : (
                          <FileText size={11} className="text-[var(--accent-midnight)] shrink-0" />
                        )}
                        {typeof item === 'string' ? item : item.title}
                      </span>
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-white border border-[var(--border-parchment)] text-[var(--ink-tertiary)] shrink-0">
                        {iType}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      }

      return (
        <div className="flex flex-col gap-2.5">
          <div className="p-2.5 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              {isThread ? (
                <GitBranch size={14} className="text-[var(--accent-midnight)] shrink-0" />
              ) : (
                <FolderOpen size={14} className="text-[var(--accent-terracotta)] shrink-0" />
              )}
              <span className="text-xs font-serif font-bold text-[var(--ink-primary)] truncate">
                {targetTitle}
              </span>
            </div>
            {details.scope && (
              <span className="text-[10px] font-mono text-[var(--ink-tertiary)]">
                Scope: {details.scope}
              </span>
            )}
          </div>

          {candidateItemsList.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span
                  data-testid="proposal-selection-counter"
                  className="text-[10.5px] font-mono uppercase tracking-wider text-[var(--accent-midnight)] font-semibold"
                >
                  {selectedCandidates.length} of {candidateItemsList.length} items selected
                </span>
                {!isCancelled && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const all: Record<string, boolean> = {};
                        candidateItemsList.forEach((c: any) => {
                          all[c.key] = true;
                        });
                        setSelectedCandidateMap(all);
                      }}
                      className="px-2 py-0.5 rounded bg-white hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-[10.5px] font-medium text-[var(--ink-primary)] cursor-pointer"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const none: Record<string, boolean> = {};
                        candidateItemsList.forEach((c: any) => {
                          none[c.key] = false;
                        });
                        setSelectedCandidateMap(none);
                      }}
                      className="px-2 py-0.5 rounded bg-white hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-[10.5px] font-medium text-[var(--ink-secondary)] cursor-pointer"
                    >
                      Deselect All
                    </button>
                  </div>
                )}
              </div>

              {isZeroSelected && (
                <div
                  role="alert"
                  className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] flex items-center gap-1.5"
                >
                  <AlertCircle size={13} className="text-rose-600 shrink-0" />
                  <span>Select at least one candidate item before confirming.</span>
                </div>
              )}

              <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-0.5">
                {candidateItemsList.map((item: any) => {
                  const checked = Boolean(selectedCandidateMap[item.key]);
                  return (
                    <label
                      key={item.key}
                      className={`p-2.5 rounded-lg border transition-colors flex items-start justify-between gap-2.5 text-xs cursor-pointer ${
                        checked
                          ? 'bg-[var(--bg-panel-subtle)] border-[var(--border-parchment)]'
                          : 'bg-stone-50/60 border-[var(--border-parchment)]/60 opacity-65'
                      }`}
                    >
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isCancelled || isCommitting}
                          onChange={() =>
                            setSelectedCandidateMap((prev) => ({
                              ...prev,
                              [item.key]: !prev[item.key],
                            }))
                          }
                          aria-label={`Select ${item.title}`}
                          className="mt-0.5 accent-[var(--accent-midnight)] cursor-pointer"
                        />
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <span className="font-medium text-[var(--ink-primary)] truncate">
                            {item.title}
                          </span>
                          {item.excerpt && (
                            <p className="text-[11px] text-[var(--ink-secondary)] line-clamp-1">
                              {item.excerpt}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {Array.isArray(item.existing_collections) &&
                          item.existing_collections.map((cName: string) => (
                            <span
                              key={cName}
                              className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200"
                            >
                              In: {cName}
                            </span>
                          ))}
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-white border border-[var(--border-parchment)] text-[var(--ink-tertiary)]">
                          {item.item_type}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    }

    // 6. /extract-entities or organize_entities
    if (
      cmd === '/extract-entities' ||
      workflow === 'extract_entities' ||
      workflow === 'organize_entities' ||
      Array.isArray(details.entities)
    ) {
      const entities = Array.isArray(details.entities) ? details.entities : [];
      const relationships = Array.isArray(details.relationships) ? details.relationships : [];
      return (
        <div className="flex flex-col gap-2">
          {details.target && (
            <span className="text-[11px] font-mono text-[var(--ink-tertiary)]">
              Source: <strong className="text-[var(--ink-primary)]">{details.target}</strong> (
              {entities.length} entities)
            </span>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {entities.map((ent: any, idx: number) => {
              const name = typeof ent === 'string' ? ent : ent.name;
              const etype =
                typeof ent === 'object' && ent?.entity_type ? ent.entity_type : 'concept';
              const desc = typeof ent === 'object' ? ent?.description : null;
              const isExisting =
                typeof ent === 'object' && (ent?.already_in_graph || ent?.status === 'existing');
              return (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-xs font-semibold text-[var(--ink-primary)] flex items-center gap-1 truncate">
                      <Sparkles size={11} className="text-[var(--accent-brass)] shrink-0" />
                      {name}
                    </span>
                    <span className="text-[9.5px] font-mono uppercase px-1.5 py-0.2 rounded bg-white border border-[var(--border-parchment)] text-[var(--ink-tertiary)] shrink-0">
                      {etype}
                    </span>
                  </div>
                  {desc && (
                    <p className="text-[11px] text-[var(--ink-secondary)] line-clamp-2">{desc}</p>
                  )}
                  <span className="text-[9.5px] font-mono text-[var(--ink-tertiary)]">
                    {isExisting ? 'Already in Graph' : 'New Graph Entity'}
                  </span>
                </div>
              );
            })}
          </div>
          {relationships.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)]">
                Graph Relationships ({relationships.length})
              </span>
              {relationships.map((rel: any, idx: number) => (
                <div
                  key={idx}
                  className="p-2 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex items-center justify-between text-xs"
                >
                  <span className="font-medium text-[var(--ink-primary)]">
                    {rel.source_entity} → {rel.target_entity}
                  </span>
                  <span className="text-[10px] font-mono uppercase text-[var(--ink-tertiary)]">
                    {rel.relationship_type}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Default clean key/value fallback (never raw JSON dumps for nested objects)
    const entries = Object.entries(details).filter(
      ([key, val]) =>
        ![
          'status',
          'idempotency_key',
          'workspace_id',
          'proposed_action',
          'details',
          'workflow',
        ].includes(key) &&
        val !== null &&
        val !== undefined &&
        typeof val !== 'object'
    );

    if (entries.length === 0) {
      return null;
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        {entries.map(([key, val]) => {
          const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          return (
            <div
              key={key}
              className="p-2 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex flex-col gap-0.5"
            >
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)]">
                {displayKey}
              </span>
              <span className="font-medium text-[var(--ink-primary)] line-clamp-2">
                {String(val)}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="card-surface mt-3 p-4 rounded-xl border border-[var(--border-parchment)] bg-white/95 shadow-xs flex flex-col gap-3.5 max-w-2xl text-[var(--ink-primary)] animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex items-center justify-center shrink-0">
            <Sliders size={15} className="text-[var(--accent-midnight)]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-serif font-bold text-[14px] text-[var(--ink-primary)]">
              Proposal: {proposal.commandName || proposal.command}
            </span>
            <span className="text-[11px] font-mono text-[var(--ink-tertiary)]">
              Action:{' '}
              <code className="text-[var(--accent-midnight)] font-bold">{proposal.actionId}</code>
            </span>
          </div>
        </div>

        {/* Status Pill */}
        {isCommitted ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
            <CheckCircle2 size={12} /> Committed
          </span>
        ) : isCancelled ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-stone-500 bg-stone-100 px-2.5 py-0.5 rounded-full border border-stone-200">
            <XCircle size={12} /> Cancelled
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 animate-pulse">
            Awaiting Confirmation
          </span>
        )}
      </div>

      {/* Description / Summary */}
      <div className="flex flex-col gap-2.5">
        <p className="text-xs text-[var(--ink-primary)] font-medium leading-relaxed">
          {proposal.message}
        </p>
        {renderStructuredDetails()}
      </div>

      {/* Action Footer */}
      {!isCommitted && !isCancelled && (
        <div className="flex items-center justify-between pt-1 border-t border-[var(--border-parchment)]">
          <div className="flex items-center gap-2">
            {hasArtifactContent && onPreviewArtifact && (
              <button
                type="button"
                onClick={handlePreviewClick}
                disabled={isCommitting}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-parchment)] hover:bg-[var(--bg-panel-subtle)] bg-white text-xs text-[var(--ink-primary)] font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                title="Preview full artifact in drawer"
              >
                <Eye size={13} className="text-[var(--accent-midnight)]" />
                <span>Preview</span>
              </button>
            )}

            <button
              type="button"
              onClick={onCancel}
              disabled={isCommitting}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-parchment)] hover:bg-[var(--bg-panel-subtle)] text-xs text-[var(--ink-secondary)] font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
          </div>

          <button
            type="button"
            onClick={handleConfirmClick}
            disabled={isCommitting || isZeroSelected}
            className="px-3.5 py-1.5 rounded-lg bg-[var(--accent-midnight)] text-white hover:bg-[var(--accent-midnight-light)] text-xs font-medium flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {isCommitting ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                <span>Committing...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={13} className="text-[var(--accent-brass)]" />
                <span>Confirm Changes</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
