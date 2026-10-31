import React, { useState } from 'react';
import { GenericActionResultData } from '@/types/commands';
import { OrganizationConfigDialog } from './OrganizationConfigDialog';
import {
  CheckCircle2,
  AlertTriangle,
  Zap,
  FolderPlus,
  FolderOpen,
  GitBranch,
  GitMerge,
  Scale,
  FileText,
  BookOpen,
  Sparkles,
  Layers,
  Sliders,
  Compass,
  ShieldCheck,
} from 'lucide-react';

interface InChatActionResultCardProps {
  result: GenericActionResultData;
  onNavigateToItem?: (id: string, itemType: string) => void;
  onRunCommand?: (commandText: string) => void;
  onStageRecommendation?: (configuredPayload: Record<string, any>) => void | Promise<void>;
}

export const InChatActionResultCard: React.FC<InChatActionResultCardProps> = ({
  result,
  onNavigateToItem,
  onRunCommand,
  onStageRecommendation,
}) => {
  const [activeConfigRec, setActiveConfigRec] = useState<Record<string, any> | null>(null);
  const [isStagingConfig, setIsStagingConfig] = useState(false);

  const isError = result.status === 'error';
  const data = result.data || {};
  const cmd = (result.command || '').toLowerCase();

  const getBadgeLabel = () => {
    if (isError) return 'Failed';
    if (cmd === '/organize-knowledge') {
      if (data.organization_status === 'disambiguation_required') {
        return 'Disambiguation Needed';
      }
      if (
        data.organization_status === 'adequate_organization' ||
        (Array.isArray(data.recommendations) && data.recommendations.length === 0 &&
          (!Array.isArray(data.suggested_clusters) || data.suggested_clusters.length === 0))
      ) {
        return 'Well Organized';
      }
      return 'Recommendations Ready';
    }
    if (cmd === '/reconcile-duplicates') {
      return (data.duplicate_count || 0) > 0
        ? `${data.duplicate_count} Duplicate Pair(s)`
        : 'Completed';
    }
    if (cmd === '/resolve-conflicts') {
      return (data.conflict_count || 0) > 0
        ? `${data.conflict_count} Conflict(s) Found`
        : 'Analysis Complete';
    }
    return 'Completed';
  };

  const handleConfirmConfiguredRec = async (configuredPayload: Record<string, any>) => {
    setIsStagingConfig(true);
    try {
      if (onStageRecommendation) {
        await onStageRecommendation(configuredPayload);
      } else if (onRunCommand) {
        const targetName =
          configuredPayload.proposed_name ||
          configuredPayload.cluster_name ||
          configuredPayload.name ||
          'Curated Collection';
        if (configuredPayload.operation === 'populate_collection') {
          onRunCommand(`/populate-collection "${targetName}"`);
        } else {
          onRunCommand(`/create-collection "${targetName}"`);
        }
      }
      setActiveConfigRec(null);
    } finally {
      setIsStagingConfig(false);
    }
  };

  const renderRecommendationIcon = (rec: any) => {
    const aType = rec.artifact_type || 'collection';
    if (aType === 'thread') {
      return <GitBranch size={13} className="text-[var(--accent-midnight)] shrink-0" />;
    }
    if (aType === 'entities') {
      return <Sparkles size={13} className="text-[var(--accent-brass)] shrink-0" />;
    }
    if (aType === 'workspace') {
      return <Layers size={13} className="text-[var(--accent-terracotta)] shrink-0" />;
    }
    if (rec.operation === 'populate_collection' || rec.existing_collection_id || rec.target_collection_id) {
      return <FolderOpen size={13} className="text-[var(--accent-terracotta)] shrink-0" />;
    }
    return <FolderPlus size={13} className="text-[var(--accent-terracotta)] shrink-0" />;
  };

  const renderArtifactTypeBadge = (rec: any) => {
    const aType = rec.artifact_type || 'collection';
    if (aType === 'thread') return 'Research Thread';
    if (aType === 'entities') return 'Entities & Graph';
    if (aType === 'workspace') return 'Workspace Boundary';
    return rec.operation === 'populate_collection' || rec.existing_collection_id
      ? 'Existing Collection'
      : 'New Collection';
  };

  const renderStructuredBody = () => {
    // 1. /organize-knowledge (Intelligent Organization Planner)
    if (
      cmd === '/organize-knowledge' &&
      (Array.isArray(data.recommendations) || Array.isArray(data.suggested_clusters))
    ) {
      const recommendations: any[] = Array.isArray(data.recommendations)
        ? data.recommendations
        : data.suggested_clusters || [];
      const disambiguationOptions: any[] = Array.isArray(data.disambiguation_options)
        ? data.disambiguation_options
        : [];
      const seedItem = data.seed_item || null;
      const examined = data.examined_scope || {};

      return (
        <div className="flex flex-col gap-3">
          {/* Scope & Audit Summary Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[var(--ink-tertiary)] bg-[var(--bg-panel-subtle)] px-3 py-2 rounded-lg border border-[var(--border-parchment)]">
            <div className="flex items-center gap-1.5">
              <Compass size={12} className="text-[var(--accent-terracotta)] shrink-0" />
              <span>
                Scope: <strong className="text-[var(--ink-primary)]">{data.scope || 'Workspace'}</strong>
              </span>
            </div>
            <span>
              {examined.notes_examined ?? data.total_notes ?? 0} notes ·{' '}
              {examined.sources_examined ?? data.total_sources ?? 0} sources ·{' '}
              {examined.collections_examined ?? data.total_collections ?? 0} collections
            </span>
          </div>

          {/* Starting Point Callout when seeded from a specific Note/Source/Collection */}
          {seedItem && (
            <div
              data-testid="organize-seed-item-banner"
              className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200 flex items-center justify-between gap-2 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-white border border-amber-200 text-amber-900 font-semibold shrink-0">
                  Starting Point ({seedItem.item_type})
                </span>
                <span
                  onClick={() => seedItem.id && onNavigateToItem?.(seedItem.id, seedItem.item_type || 'note')}
                  className="font-serif font-bold text-[var(--ink-primary)] truncate cursor-pointer hover:underline"
                >
                  {seedItem.title}
                </span>
              </div>
            </div>
          )}

          {/* Ambiguity / Disambiguation Picker */}
          {(data.is_ambiguous || disambiguationOptions.length >= 2) && (
            <div
              data-testid="organize-disambiguation-picker"
              className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 flex flex-col gap-2"
            >
              <div className="flex items-center gap-1.5 text-xs font-serif font-bold text-amber-950">
                <AlertTriangle size={13} className="text-amber-700 shrink-0" />
                <span>Multiple Matching Items or Sub-Themes Detected</span>
              </div>
              <p className="text-[11px] text-amber-900 leading-relaxed">
                {data.ambiguity_metadata?.reason ||
                  'Multiple workspace items match your query. Choose a specific item as the starting point, or review the topic-wide recommendations below.'}
              </p>
              {disambiguationOptions.length > 0 && onRunCommand && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {disambiguationOptions.map((opt: any, idx: number) => (
                    <button
                      key={opt.id || idx}
                      type="button"
                      onClick={() =>
                        onRunCommand(opt.command || `/organize-knowledge "${opt.title}"`)
                      }
                      className="px-2.5 py-1 rounded-md bg-white hover:bg-[var(--accent-midnight)] hover:text-white border border-amber-300 text-[11px] font-medium text-[var(--ink-primary)] transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      {opt.item_type === 'source' ? (
                        <BookOpen size={11} />
                      ) : (
                        <FileText size={11} />
                      )}
                      <span>{opt.label || `${opt.item_type}: ${opt.title}`}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Empty / Already Adequate State */}
          {recommendations.length === 0 ? (
            <div
              data-testid="organize-adequate-state"
              className="p-3.5 rounded-xl bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex items-center gap-2.5 text-xs text-[var(--ink-secondary)]"
            >
              <ShieldCheck size={16} className="text-emerald-700 shrink-0" />
              <span>
                Your knowledge in this scope is already well-organized across existing collections
                and threads. No new organizational changes are needed right now.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {recommendations.map((rec: any, idx: number) => {
                const recTitle =
                  rec.proposed_name || rec.cluster_name || rec.name || 'Recommended Structure';
                const candidateItems = Array.isArray(rec.candidate_items)
                  ? rec.candidate_items
                  : Array.isArray(rec.notes)
                    ? rec.notes
                    : (rec.recommended_notes || []).map((t: string) => ({
                        title: t,
                        item_type: 'note',
                      }));
                const previewItems = Array.isArray(rec.representative_items)
                  ? rec.representative_items
                  : candidateItems.slice(0, 4);
                const counts = rec.counts || {
                  notes: candidateItems.filter((c: any) => (c.item_type || 'note') === 'note').length,
                  sources: candidateItems.filter((c: any) => c.item_type === 'source').length,
                  total: candidateItems.length,
                };
                const isInformational =
                  rec.operation === 'informational_workspace' || rec.executable === false;

                return (
                  <div
                    key={rec.recommendation_id || idx}
                    data-testid={`organize-recommendation-card-${idx}`}
                    className="p-3.5 rounded-xl bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex flex-col gap-2.5"
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-serif font-bold text-[var(--ink-primary)] flex items-center gap-1.5">
                            {renderRecommendationIcon(rec)}
                            {recTitle}
                          </span>
                          <span className="text-[9.5px] font-mono uppercase px-2 py-0.5 rounded-full bg-white border border-[var(--border-parchment)] text-[var(--ink-secondary)]">
                            {renderArtifactTypeBadge(rec)}
                          </span>
                        </div>
                        {(rec.purpose || rec.description) && (
                          <p className="text-[11.5px] text-[var(--ink-secondary)] leading-relaxed">
                            {rec.purpose || rec.description}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        data-testid={`inspect-configure-btn-${idx}`}
                        onClick={() => setActiveConfigRec(rec)}
                        className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-[var(--accent-midnight)] hover:text-white border border-[var(--border-parchment)] text-[11px] font-medium text-[var(--ink-primary)] transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <Sliders size={11} />
                        <span>{isInformational ? 'Inspect Scope' : 'Inspect & Configure'}</span>
                      </button>
                    </div>

                    {/* Rationale & Supporting Evidence */}
                    {rec.rationale && (
                      <div className="text-[11px] text-[var(--ink-secondary)] bg-white/70 px-2.5 py-1.5 rounded-lg border border-[var(--border-parchment)]/80">
                        <strong className="font-mono text-[10px] uppercase text-[var(--ink-tertiary)] mr-1.5">
                          Why recommended:
                        </strong>
                        {rec.rationale}
                      </div>
                    )}

                    {/* Counts & Overlap Meta Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-mono text-[var(--ink-tertiary)]">
                      <span>
                        {rec.artifact_type === 'entities'
                          ? `${counts.entities ?? 0} entities · ${counts.relationships ?? 0} relationships`
                          : `${counts.notes ?? 0} note(s) · ${counts.sources ?? 0} source(s)${
                              counts.conversations ? ` · ${counts.conversations} conversation(s)` : ''
                            }`}
                      </span>
                      {rec.overlap_summary && (
                        <span className="text-[var(--ink-secondary)] truncate max-w-[340px]">
                          {rec.overlap_summary}
                        </span>
                      )}
                    </div>

                    {/* Representative Items Preview */}
                    {previewItems.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {previewItems.map((n: any, nIdx: number) => {
                          const itemId = n.item_id || n.note_id || n.source_id;
                          const itemType = n.item_type || 'note';
                          const itemTitle =
                            n.title ||
                            n.name ||
                            (n.source_entity && n.target_entity
                              ? `${n.source_entity} → ${n.target_entity}`
                              : String(n));
                          return (
                            <span
                              key={itemId || nIdx}
                              onClick={() =>
                                itemId &&
                                (itemType === 'note' || itemType === 'source') &&
                                onNavigateToItem?.(itemId, itemType)
                              }
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-[var(--border-parchment)] text-[11px] text-[var(--ink-primary)] cursor-pointer hover:border-[var(--accent-midnight)]"
                            >
                              {itemType === 'source' ? (
                                <BookOpen size={10} className="text-[var(--accent-terracotta)]" />
                              ) : itemType === 'entity' ? (
                                <Sparkles size={10} className="text-[var(--accent-brass)]" />
                              ) : (
                                <FileText size={10} className="text-[var(--accent-midnight)]" />
                              )}
                              <span>{itemTitle}</span>
                              {Array.isArray(n.existing_collections) &&
                                n.existing_collections.length > 0 && (
                                  <span className="text-[9.5px] font-mono text-amber-800 bg-amber-50 px-1 rounded">
                                    In: {n.existing_collections[0]}
                                  </span>
                                )}
                            </span>
                          );
                        })}
                        {candidateItems.length > previewItems.length && (
                          <span className="text-[10.5px] font-mono text-[var(--ink-tertiary)] self-center px-1">
                            +{candidateItems.length - previewItems.length} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Stage 2 & Stage 3 Dedicated Configuration Dialog */}
          <OrganizationConfigDialog
            isOpen={Boolean(activeConfigRec)}
            recommendation={activeConfigRec}
            isSubmitting={isStagingConfig}
            onClose={() => setActiveConfigRec(null)}
            onConfirmStage={handleConfirmConfiguredRec}
          />
        </div>
      );
    }

    // 2. /reconcile-duplicates
    if (cmd === '/reconcile-duplicates') {
      if (Array.isArray(data.pairs) && data.pairs.length > 0) {
        return (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[var(--ink-tertiary)] bg-[var(--bg-panel-subtle)] px-3 py-1.5 rounded-lg border border-[var(--border-parchment)]">
              <span>
                Scope Examined:{' '}
                <strong className="text-[var(--ink-primary)]">
                  {data.scope_examined || 'Entire Workspace'}
                </strong>
              </span>
              <span>{data.notes_examined_count ?? 0} note(s) checked</span>
            </div>

            <div className="flex flex-col gap-2">
              {data.pairs.map((pair: any, idx: number) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span
                        onClick={() =>
                          pair.original_id && onNavigateToItem?.(pair.original_id, 'note')
                        }
                        className="text-xs font-semibold text-[var(--ink-primary)] hover:underline cursor-pointer"
                      >
                        {pair.original}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--ink-tertiary)]">↔</span>
                      <span
                        onClick={() =>
                          pair.duplicate_id && onNavigateToItem?.(pair.duplicate_id, 'note')
                        }
                        className="text-xs font-semibold text-[var(--ink-primary)] hover:underline cursor-pointer"
                      >
                        {pair.duplicate}
                      </span>
                    </div>
                    {pair.similarity_score !== undefined && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                        {Math.round(Number(pair.similarity_score) * 100)}% overlap
                      </span>
                    )}
                  </div>

                  {pair.reason && (
                    <span className="text-[11px] text-[var(--ink-secondary)]">
                      Reason: {pair.reason}
                    </span>
                  )}

                  {onRunCommand && (
                    <button
                      type="button"
                      onClick={() =>
                        onRunCommand(`/merge-notes "${pair.original}" "${pair.duplicate}"`)
                      }
                      className="self-start px-2.5 py-1 rounded bg-white hover:bg-[var(--accent-midnight)] hover:text-white border border-[var(--border-parchment)] text-[11px] font-medium text-[var(--ink-primary)] flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <GitMerge size={11} />
                      <span>Stage Merge Proposal</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      }

      // Reconciled state with 0 duplicate pairs
      return (
        <div className="p-2.5 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-xs flex flex-wrap gap-x-6 gap-y-1 font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--ink-tertiary)]">
              DUPLICATE_COUNT:
            </span>
            <span className="font-semibold text-[var(--ink-primary)]">
              {data.duplicate_count ?? 0}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--ink-tertiary)]">
              PAIRS:
            </span>
            <span className="font-semibold text-[var(--ink-primary)]">[]</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--ink-tertiary)]">
              STATUS:
            </span>
            <span className="font-semibold text-[var(--ink-primary)]">
              {data.status || 'reconciled'}
            </span>
          </div>
        </div>
      );
    }

    // 3. /resolve-conflicts
    if (cmd === '/resolve-conflicts') {
      const sourceDetails = Array.isArray(data.source_details) ? data.source_details : [];
      const conflicts = Array.isArray(data.conflicts) ? data.conflicts : [];

      return (
        <div className="flex flex-col gap-2.5">
          {sourceDetails.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)]">
                Sources & Notes Analyzed ({sourceDetails.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {sourceDetails.map((sd: any, idx: number) => (
                  <span
                    key={sd.id || idx}
                    onClick={() =>
                      sd.id && onNavigateToItem?.(sd.id, sd.item_type || 'note')
                    }
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-[11px] font-medium text-[var(--ink-primary)] cursor-pointer hover:border-[var(--accent-midnight)]"
                  >
                    <FileText size={10} className="text-[var(--accent-midnight)]" />
                    {sd.title}
                  </span>
                ))}
              </div>
            </div>
          )}

          {conflicts.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)]">
                Detected Divergences & Conflicts ({conflicts.length})
              </span>
              {conflicts.map((conf: any, idx: number) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex flex-col gap-2"
                >
                  <span className="text-xs font-serif font-bold text-[var(--ink-primary)] flex items-center gap-1.5">
                    <Scale size={12} className="text-[var(--accent-terracotta)]" />
                    {conf.dimension || 'Divergent Claim'}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11.5px]">
                    <div className="p-2 rounded bg-white border border-[var(--border-parchment)]">
                      <span className="text-[10px] font-mono font-bold text-[var(--accent-midnight)] block mb-0.5">
                        {conf.source_a_title}
                      </span>
                      <p className="text-[var(--ink-secondary)] line-clamp-3">{conf.claim_a}</p>
                    </div>
                    <div className="p-2 rounded bg-white border border-[var(--border-parchment)]">
                      <span className="text-[10px] font-mono font-bold text-[var(--accent-terracotta)] block mb-0.5">
                        {conf.source_b_title}
                      </span>
                      <p className="text-[var(--ink-secondary)] line-clamp-3">{conf.claim_b}</p>
                    </div>
                  </div>
                  {conf.resolution_suggestion && (
                    <span className="text-[11px] text-[var(--ink-tertiary)] italic">
                      {conf.resolution_suggestion}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // 4. /extract-entities (empty or completed state)
    if (cmd === '/extract-entities' && Array.isArray(data.entities)) {
      if (data.entities.length === 0) {
        return null;
      }
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {data.entities.map((ent: any, idx: number) => (
            <div
              key={idx}
              className="p-2 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex items-center justify-between gap-2 text-xs"
            >
              <span className="font-medium text-[var(--ink-primary)] flex items-center gap-1 truncate">
                <Sparkles size={11} className="text-[var(--accent-brass)]" />
                {typeof ent === 'string' ? ent : ent.name}
              </span>
              {typeof ent === 'object' && ent?.entity_type && (
                <span className="text-[10px] font-mono uppercase text-[var(--ink-tertiary)]">
                  {ent.entity_type}
                </span>
              )}
            </div>
          ))}
        </div>
      );
    }

    // Default clean scalar fields only (never raw JSON dumps)
    const scalarEntries = Object.entries(data).filter(
      ([k, v]) =>
        !['status', 'consensus'].includes(k) &&
        v !== null &&
        v !== undefined &&
        typeof v !== 'object'
    );
    if (scalarEntries.length === 0) return null;

    return (
      <div className="p-2.5 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-xs flex flex-wrap gap-x-4 gap-y-1">
        {scalarEntries.map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)]">
              {k.replace(/_/g, ' ')}:
            </span>
            <span className="font-medium text-[var(--ink-primary)]">{String(v)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="card-surface mt-3 p-4 rounded-xl border border-[var(--border-parchment)] bg-white/95 shadow-xs flex flex-col gap-3 max-w-2xl text-[var(--ink-primary)] animate-fade-in">
      <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex items-center justify-center shrink-0">
            <Zap size={13} className="text-[var(--accent-midnight)]" />
          </div>
          <span className="font-serif font-bold text-[13.5px] text-[var(--ink-primary)]">
            Command Executed:{' '}
            <code className="text-[var(--accent-midnight)] font-bold">{result.command}</code>
          </span>
        </div>

        {isError ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
            <AlertTriangle size={11} /> {getBadgeLabel()}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            <CheckCircle2 size={11} /> {getBadgeLabel()}
          </span>
        )}
      </div>

      <p className="text-xs text-[var(--ink-primary)] leading-relaxed">{result.message}</p>

      {renderStructuredBody()}
    </div>
  );
};
