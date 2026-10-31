import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  FolderPlus,
  FolderOpen,
  GitBranch,
  Sparkles,
  Layers,
  FileText,
  BookOpen,
  MessageSquare,
  Search,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
  Loader2,
} from 'lucide-react';

export interface OrganizationConfigDialogProps {
  isOpen: boolean;
  recommendation: Record<string, any> | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirmStage: (configuredPayload: Record<string, any>) => void | Promise<void>;
}

export const OrganizationConfigDialog: React.FC<OrganizationConfigDialogProps> = ({
  isOpen,
  recommendation,
  isSubmitting = false,
  onClose,
  onConfirmStage,
}) => {
  const [step, setStep] = useState<'configure' | 'review'>('configure');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [question, setQuestion] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMap, setSelectedMap] = useState<Record<string, boolean>>({});
  const [selectedEntityMap, setSelectedEntityMap] = useState<Record<string, boolean>>({});
  const [selectedRelMap, setSelectedRelMap] = useState<Record<string, boolean>>({});
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!recommendation || !isOpen) return;
    setStep('configure');
    setSearchQuery('');
    setValidationError(null);
    setName(
      recommendation.proposed_name ||
        recommendation.cluster_name ||
        recommendation.collection_name ||
        recommendation.name ||
        recommendation.title ||
        ''
    );
    setDescription(
      recommendation.description || recommendation.purpose || ''
    );
    setQuestion(
      recommendation.question || recommendation.description || recommendation.purpose || ''
    );

    const rawItems: any[] = Array.isArray(recommendation.candidate_items)
      ? recommendation.candidate_items
      : Array.isArray(recommendation.notes)
        ? recommendation.notes.map((n: any) =>
            typeof n === 'string'
              ? { item_id: n, title: n, item_type: 'note', selected: true }
              : {
                  item_id: n.item_id || n.note_id,
                  note_id: n.note_id || n.item_id,
                  title: n.title,
                  item_type: n.item_type || 'note',
                  excerpt: n.excerpt || '',
                  existing_collections: n.existing_collections || [],
                  selected: n.selected !== false,
                }
          )
        : [];

    const initialMap: Record<string, boolean> = {};
    rawItems.forEach((it, idx) => {
      const key = String(it.item_id || it.id || it.note_id || it.source_id || idx);
      initialMap[key] = it.selected !== false && !it.already_in_target;
    });
    setSelectedMap(initialMap);

    const rawEnts: any[] = Array.isArray(recommendation.candidate_entities)
      ? recommendation.candidate_entities
      : [];
    const entMap: Record<string, boolean> = {};
    rawEnts.forEach((e, idx) => {
      const key = String(e.item_id || e.name || idx);
      entMap[key] = e.selected !== false;
    });
    setSelectedEntityMap(entMap);

    const rawRels: any[] = Array.isArray(recommendation.candidate_relationships)
      ? recommendation.candidate_relationships
      : [];
    const relMap: Record<string, boolean> = {};
    rawRels.forEach((r, idx) => {
      const key = String(r.item_id || `${r.source_entity}-${r.target_entity}-${idx}`);
      relMap[key] = r.selected !== false;
    });
    setSelectedRelMap(relMap);
  }, [recommendation, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  const artifactType: string = recommendation?.artifact_type || 'collection';
  const operation: string =
    recommendation?.operation ||
    (recommendation?.target_collection_id || recommendation?.existing_collection_id
      ? 'populate_collection'
      : 'create_collection');
  const isInformational =
    operation === 'informational_workspace' || recommendation?.executable === false;
  const isPopulateExisting = operation === 'populate_collection';

  const normalizedItems = useMemo(() => {
    if (!recommendation) return [];
    const rawItems: any[] = Array.isArray(recommendation.candidate_items)
      ? recommendation.candidate_items
      : Array.isArray(recommendation.notes)
        ? recommendation.notes
        : [];
    return rawItems.map((it, idx) => {
      if (typeof it === 'string') {
        return {
          key: it,
          item_id: it,
          item_type: 'note',
          title: it,
          excerpt: '',
          existing_collections: [] as string[],
          already_in_target: false,
          evidence: '',
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
        excerpt: String(it.excerpt || it.description || ''),
        existing_collections: Array.isArray(it.existing_collections)
          ? it.existing_collections
          : [],
        already_in_target: Boolean(it.already_in_target),
        evidence: String(it.evidence || ''),
      };
    });
  }, [recommendation]);

  const normalizedEntities = useMemo(() => {
    if (!recommendation || !Array.isArray(recommendation.candidate_entities)) return [];
    return recommendation.candidate_entities.map((e: any, idx: number) => ({
      key: String(e.item_id || e.name || idx),
      item_id: String(e.item_id || e.name || idx),
      name: String(e.name || e.title || ''),
      entity_type: String(e.entity_type || 'concept'),
      description: String(e.description || e.excerpt || ''),
      source_title: String(e.source_title || ''),
    }));
  }, [recommendation]);

  const normalizedRelationships = useMemo(() => {
    if (!recommendation || !Array.isArray(recommendation.candidate_relationships)) return [];
    return recommendation.candidate_relationships.map((r: any, idx: number) => ({
      key: String(r.item_id || `${r.source_entity}-${r.target_entity}-${idx}`),
      item_id: String(r.item_id || `rel-${idx}`),
      source_entity: String(r.source_entity || ''),
      target_entity: String(r.target_entity || ''),
      relationship_type: String(r.relationship_type || 'related_to'),
      description: String(r.description || ''),
      source_title: String(r.source_title || ''),
    }));
  }, [recommendation]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return normalizedItems;
    return normalizedItems.filter(
      (it) =>
        it.title.toLowerCase().includes(q) ||
        it.item_type.toLowerCase().includes(q) ||
        it.excerpt.toLowerCase().includes(q) ||
        it.existing_collections.some((c: string) => c.toLowerCase().includes(q))
    );
  }, [normalizedItems, searchQuery]);

  const selectedItems = useMemo(
    () => normalizedItems.filter((it) => selectedMap[it.key]),
    [normalizedItems, selectedMap]
  );

  const selectedEntities = useMemo(
    () => normalizedEntities.filter((e) => selectedEntityMap[e.key]),
    [normalizedEntities, selectedEntityMap]
  );

  const selectedRelationships = useMemo(
    () => normalizedRelationships.filter((r) => selectedRelMap[r.key]),
    [normalizedRelationships, selectedRelMap]
  );

  const totalSelectableCount =
    artifactType === 'entities'
      ? normalizedEntities.length + normalizedRelationships.length
      : normalizedItems.length;

  const currentSelectedCount =
    artifactType === 'entities'
      ? selectedEntities.length + selectedRelationships.length
      : selectedItems.length;

  if (!isOpen || !recommendation) return null;

  const handleToggleItem = (key: string) => {
    setValidationError(null);
    setSelectedMap((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelectAll = () => {
    setValidationError(null);
    if (artifactType === 'entities') {
      const nextEnts: Record<string, boolean> = {};
      normalizedEntities.forEach((e) => {
        nextEnts[e.key] = true;
      });
      const nextRels: Record<string, boolean> = {};
      normalizedRelationships.forEach((r) => {
        nextRels[r.key] = true;
      });
      setSelectedEntityMap(nextEnts);
      setSelectedRelMap(nextRels);
    } else {
      const next: Record<string, boolean> = { ...selectedMap };
      filteredItems.forEach((it) => {
        if (!it.already_in_target) {
          next[it.key] = true;
        }
      });
      setSelectedMap(next);
    }
  };

  const handleDeselectAll = () => {
    setValidationError(null);
    if (artifactType === 'entities') {
      const nextEnts: Record<string, boolean> = {};
      normalizedEntities.forEach((e) => {
        nextEnts[e.key] = false;
      });
      const nextRels: Record<string, boolean> = {};
      normalizedRelationships.forEach((r) => {
        nextRels[r.key] = false;
      });
      setSelectedEntityMap(nextEnts);
      setSelectedRelMap(nextRels);
    } else {
      const next: Record<string, boolean> = { ...selectedMap };
      filteredItems.forEach((it) => {
        next[it.key] = false;
      });
      setSelectedMap(next);
    }
  };

  const handleProceedToReview = () => {
    if (!isPopulateExisting && artifactType !== 'entities' && !name.trim()) {
      setValidationError('Please provide a name before reviewing.');
      return;
    }
    if (currentSelectedCount === 0) {
      setValidationError('Please select at least one item to include.');
      return;
    }
    setValidationError(null);
    setStep('review');
  };

  const handleConfirm = async () => {
    if (!isPopulateExisting && artifactType !== 'entities' && !name.trim()) {
      setValidationError('Name cannot be empty.');
      return;
    }
    if (currentSelectedCount === 0) {
      setValidationError('Please select at least one item.');
      return;
    }
    const payload: Record<string, any> = {
      ...recommendation,
      operation,
      artifact_type: artifactType,
      name: name.trim(),
      proposed_name: name.trim(),
      cluster_name: name.trim(),
      title: name.trim(),
      description: description.trim(),
      question: question.trim(),
      selected_items: selectedItems.map((it) => ({
        item_id: it.item_id,
        note_id: it.item_type === 'note' ? it.item_id : undefined,
        source_id: it.item_type === 'source' ? it.item_id : undefined,
        item_type: it.item_type,
        title: it.title,
        excerpt: it.excerpt,
        existing_collections: it.existing_collections,
        selected: true,
      })),
      selected_entities: selectedEntities.map((e) => ({
        ...e,
        selected: true,
      })),
      selected_relationships: selectedRelationships.map((r) => ({
        ...r,
        selected: true,
      })),
    };
    await onConfirmStage(payload);
  };

  const renderArtifactIcon = () => {
    if (artifactType === 'thread') {
      return <GitBranch size={16} className="text-[var(--accent-midnight)]" />;
    }
    if (artifactType === 'entities') {
      return <Sparkles size={16} className="text-[var(--accent-brass)]" />;
    }
    if (artifactType === 'workspace') {
      return <Layers size={16} className="text-[var(--accent-terracotta)]" />;
    }
    return isPopulateExisting ? (
      <FolderOpen size={16} className="text-[var(--accent-terracotta)]" />
    ) : (
      <FolderPlus size={16} className="text-[var(--accent-terracotta)]" />
    );
  };

  const getOperationBadge = () => {
    if (artifactType === 'thread') return 'Create Research Thread';
    if (artifactType === 'entities') return 'Extract Graph Entities & Links';
    if (artifactType === 'workspace') return 'Workspace Boundary Guidance';
    return isPopulateExisting ? 'Populate Existing Collection' : 'Create New Collection';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="org-config-dialog-title"
      data-testid="organization-config-dialog"
    >
      <div className="bg-[#FAF8F2] border border-[var(--border-parchment)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden text-[var(--ink-primary)]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[var(--border-parchment)] bg-white/90 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex items-center justify-center shrink-0">
              {renderArtifactIcon()}
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  id="org-config-dialog-title"
                  className="font-serif font-bold text-sm text-[var(--ink-primary)] truncate"
                >
                  {step === 'configure'
                    ? `Configure: ${name || recommendation.proposed_name || 'Artifact'}`
                    : `Review Changes: ${name || recommendation.proposed_name || 'Artifact'}`}
                </h2>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-[var(--ink-secondary)]">
                  {getOperationBadge()}
                </span>
              </div>
              <span className="text-[11px] text-[var(--ink-tertiary)]">
                {step === 'configure'
                  ? 'Stage 2 of 3 · Inspect candidate contents and exclude any items you do not want included'
                  : 'Stage 3 of 3 · Review configured changes before staging confirmation'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close configuration dialog"
            className="p-1.5 rounded-lg text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-panel-subtle)] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-4">
          {validationError && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2"
            >
              <AlertCircle size={14} className="shrink-0 text-rose-600" />
              <span>{validationError}</span>
            </div>
          )}

          {isInformational ? (
            <div className="flex flex-col gap-3">
              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-950 flex flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-wider font-bold text-amber-800">
                  Informational Boundary Assessment
                </span>
                <p className="leading-relaxed">{recommendation.rationale}</p>
                <p className="text-[11px] text-amber-800 mt-1">
                  {recommendation.consequences ||
                    'Hyades never moves notes or sources across workspaces automatically.'}
                </p>
              </div>

              {normalizedItems.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)]">
                    Representative Items in This Domain ({normalizedItems.length})
                  </span>
                  {normalizedItems.map((it) => (
                    <div
                      key={it.key}
                      className="p-2.5 rounded-lg bg-white border border-[var(--border-parchment)] flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="font-medium text-[var(--ink-primary)]">{it.title}</span>
                      <span className="text-[10px] font-mono uppercase text-[var(--ink-tertiary)]">
                        {it.item_type}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : step === 'configure' ? (
            <>
              {/* Editable Artifact Metadata */}
              {artifactType !== 'entities' && (
                <div className="grid grid-cols-1 gap-3 p-3.5 rounded-xl bg-white border border-[var(--border-parchment)]">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="org-artifact-name-input"
                      className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)] font-semibold"
                    >
                      {artifactType === 'thread'
                        ? 'Thread Title'
                        : isPopulateExisting
                          ? 'Target Collection (Existing)'
                          : 'Proposed Collection Name'}
                    </label>
                    <input
                      id="org-artifact-name-input"
                      type="text"
                      value={name}
                      disabled={isPopulateExisting}
                      onChange={(e) => {
                        setValidationError(null);
                        setName(e.target.value);
                      }}
                      placeholder="Enter artifact name..."
                      className="px-3 py-1.5 rounded-lg border border-[var(--border-parchment)] bg-[#FAF8F2] disabled:opacity-70 text-xs font-serif font-bold text-[var(--ink-primary)] outline-none focus:border-[var(--accent-midnight)]"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="org-artifact-desc-input"
                      className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)] font-semibold"
                    >
                      {artifactType === 'thread'
                        ? 'Core Research Question / Purpose'
                        : 'Description & Organizational Purpose'}
                    </label>
                    <textarea
                      id="org-artifact-desc-input"
                      rows={2}
                      value={artifactType === 'thread' ? question : description}
                      onChange={(e) => {
                        if (artifactType === 'thread') {
                          setQuestion(e.target.value);
                        } else {
                          setDescription(e.target.value);
                        }
                      }}
                      placeholder="Describe the purpose of this structure..."
                      className="px-3 py-1.5 rounded-lg border border-[var(--border-parchment)] bg-[#FAF8F2] text-xs text-[var(--ink-primary)] resize-none outline-none focus:border-[var(--accent-midnight)]"
                    />
                  </div>
                </div>
              )}

              {/* Selection Toolbar: Search + Select All / Deselect All + Counter */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--bg-panel-subtle)] p-2.5 rounded-xl border border-[var(--border-parchment)]">
                {artifactType !== 'entities' && (
                  <div className="relative flex-1 min-w-[180px]">
                    <Search
                      size={13}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-tertiary)]"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      aria-label="Filter candidate items"
                      placeholder="Filter candidate items by title or type..."
                      className="w-full pl-8 pr-3 py-1 rounded-lg bg-white border border-[var(--border-parchment)] text-xs text-[var(--ink-primary)] outline-none focus:border-[var(--accent-midnight)]"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2 ml-auto">
                  <span
                    data-testid="selection-counter"
                    className="text-[11px] font-mono font-semibold text-[var(--accent-midnight)] px-2 py-0.5 rounded bg-white border border-[var(--border-parchment)]"
                  >
                    {currentSelectedCount} of {totalSelectableCount} items selected
                  </span>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="px-2 py-1 rounded bg-white hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-[11px] font-medium text-[var(--ink-primary)] cursor-pointer"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="px-2 py-1 rounded bg-white hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-[11px] font-medium text-[var(--ink-secondary)] cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Candidate List */}
              {artifactType === 'entities' ? (
                <div className="flex flex-col gap-3">
                  {normalizedEntities.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)] font-semibold">
                        Candidate Entities ({selectedEntities.length}/{normalizedEntities.length})
                      </span>
                      {normalizedEntities.map((ent) => {
                        const checked = Boolean(selectedEntityMap[ent.key]);
                        return (
                          <label
                            key={ent.key}
                            className={`p-3 rounded-xl border transition-colors flex items-start gap-3 cursor-pointer ${
                              checked
                                ? 'bg-white border-[var(--accent-midnight)]/40 shadow-2xs'
                                : 'bg-[var(--bg-panel-subtle)]/60 border-[var(--border-parchment)] opacity-70'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setSelectedEntityMap((prev) => ({
                                  ...prev,
                                  [ent.key]: !prev[ent.key],
                                }))
                              }
                              className="mt-0.5 accent-[var(--accent-midnight)] cursor-pointer"
                            />
                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-serif font-bold text-[var(--ink-primary)]">
                                  {ent.name}
                                </span>
                                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-[var(--ink-secondary)]">
                                  {ent.entity_type}
                                </span>
                              </div>
                              {ent.description && (
                                <p className="text-[11px] text-[var(--ink-secondary)] line-clamp-2">
                                  {ent.description}
                                </p>
                              )}
                              {ent.source_title && (
                                <span className="text-[10px] font-mono text-[var(--ink-tertiary)]">
                                  Source Evidence: {ent.source_title}
                                </span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {normalizedRelationships.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)] font-semibold">
                        Candidate Relationships ({selectedRelationships.length}/
                        {normalizedRelationships.length})
                      </span>
                      {normalizedRelationships.map((rel) => {
                        const checked = Boolean(selectedRelMap[rel.key]);
                        return (
                          <label
                            key={rel.key}
                            className={`p-3 rounded-xl border transition-colors flex items-start gap-3 cursor-pointer ${
                              checked
                                ? 'bg-white border-[var(--accent-midnight)]/40 shadow-2xs'
                                : 'bg-[var(--bg-panel-subtle)]/60 border-[var(--border-parchment)] opacity-70'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setSelectedRelMap((prev) => ({
                                  ...prev,
                                  [rel.key]: !prev[rel.key],
                                }))
                              }
                              className="mt-0.5 accent-[var(--accent-midnight)] cursor-pointer"
                            />
                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                              <div className="flex items-center gap-1.5 flex-wrap text-xs font-semibold text-[var(--ink-primary)]">
                                <span>{rel.source_entity}</span>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200">
                                  {rel.relationship_type}
                                </span>
                                <span>{rel.target_entity}</span>
                              </div>
                              {rel.description && (
                                <span className="text-[11px] text-[var(--ink-secondary)]">
                                  {rel.description}
                                </span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {filteredItems.length === 0 ? (
                    <div className="p-4 rounded-xl bg-white border border-[var(--border-parchment)] text-center text-xs text-[var(--ink-tertiary)]">
                      No candidate items match filter &ldquo;{searchQuery}&rdquo;.
                    </div>
                  ) : (
                    filteredItems.map((item) => {
                      const checked = Boolean(selectedMap[item.key]);
                      return (
                        <label
                          key={item.key}
                          className={`p-3 rounded-xl border transition-colors flex items-start gap-3 cursor-pointer ${
                            checked
                              ? 'bg-white border-[var(--accent-midnight)]/40 shadow-2xs'
                              : 'bg-[var(--bg-panel-subtle)]/60 border-[var(--border-parchment)] opacity-70'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={item.already_in_target}
                            onChange={() => handleToggleItem(item.key)}
                            aria-label={`Include ${item.title}`}
                            className="mt-1 accent-[var(--accent-midnight)] cursor-pointer"
                          />
                          <div className="flex-1 min-w-0 flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-xs font-serif font-bold text-[var(--ink-primary)] flex items-center gap-1.5">
                                {item.item_type === 'source' ? (
                                  <BookOpen size={12} className="text-[var(--accent-terracotta)] shrink-0" />
                                ) : item.item_type === 'conversation' ? (
                                  <MessageSquare size={12} className="text-[var(--accent-brass)] shrink-0" />
                                ) : (
                                  <FileText size={12} className="text-[var(--accent-midnight)] shrink-0" />
                                )}
                                {item.title}
                              </span>

                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-[var(--ink-secondary)]">
                                  {item.item_type}
                                </span>
                                {item.existing_collections.map((colName: string) => (
                                  <span
                                    key={colName}
                                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50/80 text-amber-900 border border-amber-200"
                                    title="Existing collection membership will be preserved"
                                  >
                                    In: {colName}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {item.excerpt && (
                              <p className="text-[11.5px] text-[var(--ink-secondary)] line-clamp-2 leading-relaxed">
                                {item.excerpt}
                              </p>
                            )}
                            {item.evidence && (
                              <span className="text-[10px] font-mono text-[var(--ink-tertiary)]">
                                Why included: {item.evidence}
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              )}
            </>
          ) : (
            /* Step 2: Final Review Summary before Staging/Committing */
            <div className="flex flex-col gap-3" data-testid="organization-final-review">
              <div className="p-4 rounded-xl bg-white border border-[var(--border-parchment)] flex flex-col gap-2.5">
                <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)] font-semibold">
                    Final Operation Summary
                  </span>
                  <span className="text-[11px] font-mono font-bold text-[var(--accent-midnight)]">
                    {getOperationBadge()}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-[var(--ink-tertiary)] block">
                      Target Name
                    </span>
                    <strong className="font-serif text-sm text-[var(--ink-primary)]">
                      {name}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase text-[var(--ink-tertiary)] block">
                      Selected Contents
                    </span>
                    <strong className="font-mono text-xs text-[var(--ink-primary)]">
                      {currentSelectedCount} selected ·{' '}
                      {Math.max(0, totalSelectableCount - currentSelectedCount)} excluded
                    </strong>
                  </div>
                </div>

                {(description || question) && (
                  <div className="text-xs text-[var(--ink-secondary)] pt-1">
                    <span className="text-[10px] font-mono uppercase text-[var(--ink-tertiary)] block">
                      {artifactType === 'thread' ? 'Research Question' : 'Description'}
                    </span>
                    <p className="mt-0.5">{artifactType === 'thread' ? question : description}</p>
                  </div>
                )}

                <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200 text-[11px] text-emerald-900 flex items-center gap-2 mt-1">
                  <ShieldCheck size={14} className="text-emerald-700 shrink-0" />
                  <span>
                    {recommendation.overlap_summary ||
                      'Existing memberships in other collections and threads will be preserved without duplication.'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-tertiary)] font-semibold">
                  Items to Include ({currentSelectedCount})
                </span>
                <div className="max-h-48 overflow-y-auto flex flex-col gap-1.5 pr-1">
                  {artifactType === 'entities' ? (
                    <>
                      {selectedEntities.map((ent) => (
                        <div
                          key={ent.key}
                          className="p-2 rounded-lg bg-white border border-[var(--border-parchment)] flex items-center justify-between text-xs"
                        >
                          <span className="font-medium text-[var(--ink-primary)]">{ent.name}</span>
                          <span className="text-[10px] font-mono uppercase text-[var(--ink-tertiary)]">
                            Entity · {ent.entity_type}
                          </span>
                        </div>
                      ))}
                      {selectedRelationships.map((rel) => (
                        <div
                          key={rel.key}
                          className="p-2 rounded-lg bg-white border border-[var(--border-parchment)] flex items-center justify-between text-xs"
                        >
                          <span className="font-medium text-[var(--ink-primary)]">
                            {rel.source_entity} → {rel.target_entity}
                          </span>
                          <span className="text-[10px] font-mono uppercase text-[var(--ink-tertiary)]">
                            {rel.relationship_type}
                          </span>
                        </div>
                      ))}
                    </>
                  ) : (
                    selectedItems.map((it) => (
                      <div
                        key={it.key}
                        className="p-2 rounded-lg bg-white border border-[var(--border-parchment)] flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="font-medium text-[var(--ink-primary)] truncate">
                          {it.title}
                        </span>
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-[var(--ink-tertiary)] shrink-0">
                          {it.item_type}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-[var(--border-parchment)] bg-white/90 flex items-center justify-between gap-3">
          {isInformational ? (
            <button
              type="button"
              onClick={onClose}
              className="ml-auto px-4 py-1.5 rounded-lg bg-[var(--accent-midnight)] text-white text-xs font-medium cursor-pointer"
            >
              Close
            </button>
          ) : step === 'configure' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-3.5 py-1.5 rounded-lg border border-[var(--border-parchment)] bg-white hover:bg-[var(--bg-panel-subtle)] text-xs font-medium text-[var(--ink-secondary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProceedToReview}
                disabled={currentSelectedCount === 0 || isSubmitting}
                data-testid="review-selection-btn"
                className="px-4 py-1.5 rounded-lg bg-[var(--accent-midnight)] hover:bg-[var(--accent-midnight-light)] disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <span>Review Selection ({currentSelectedCount})</span>
                <ArrowRight size={13} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep('configure')}
                disabled={isSubmitting}
                className="px-3.5 py-1.5 rounded-lg border border-[var(--border-parchment)] bg-white hover:bg-[var(--bg-panel-subtle)] text-xs font-medium text-[var(--ink-secondary)] flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft size={13} />
                <span>Back to Configure</span>
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isSubmitting || currentSelectedCount === 0}
                data-testid="confirm-stage-proposal-btn"
                className="px-4 py-1.5 rounded-lg bg-[var(--accent-midnight)] hover:bg-[var(--accent-midnight-light)] disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Staging Proposal...</span>
                  </>
                ) : (
                  <>
                    <span>Stage Proposal for Confirmation</span>
                    <ArrowRight size={13} />
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
