import React, { useState, useEffect, useCallback } from 'react';
import { Note } from '@/types/note';
import { listNotes } from '@/api/notes';
import { NoteList } from '@/components/NoteList';
import { NoteEditor } from '@/components/NoteEditor';
import { NoteLinks } from '@/components/NoteLinks';
import { SearchPanel } from '@/components/search/SearchPanel';
import { RAGPanel } from '@/components/rag/RAGPanel';
import { TagFilter } from '@/components/TagFilter';
import { FlowHoverButton } from '@/components/ui/flow-hover-button';
import { SourceList } from '@/components/SourceList';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';
import { Plus, Archive, ChevronLeft, AlertTriangle, UploadCloud, LayoutDashboard, Share2, FileText, Search, Sparkles, Layers } from 'lucide-react';
import { DashboardView } from './DashboardView';
import { ImportWizard } from '@/components/ImportWizard';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';

import { ConstellationGraph } from '@/components/ConstellationGraph';
import { KnowledgeExplorer } from '@/components/KnowledgeExplorer';
import { EntityEditor } from '@/components/EntityEditor';
import { RelationshipEditor } from '@/components/RelationshipEditor';
import { GraphEditToolbar } from '@/components/GraphEditToolbar';
import { LinkSuggestionPanel } from '@/components/LinkSuggestionPanel';
import { ClusterView } from '@/components/ClusterView';
import { GraphSearchBar } from '@/components/GraphSearchBar';
import { GraphFilterPanel } from '@/components/GraphFilterPanel';
import { GraphJobIndicator } from '@/components/GraphJobIndicator';
import { ExtractionResultSummary } from '@/components/ExtractionResultSummary';
import { GraphRAGPanel } from '@/components/GraphRAGPanel';

import { GraphEntity } from '@/types/graph_entity';
import { GraphRelationship } from '@/types/graph_relationship';
import { GraphQueryParams, GraphClusterSummary } from '@/types/graph';
import { ExtractionJobResponse } from '@/types/jobs';
import { listClusters } from '@/api/clusters';
import { getLinkSuggestions } from '@/api/link_suggestions';
import { triggerExtraction, triggerReindex } from '@/api/graph_index';
import { getJobStatus } from '@/api/jobs';
import { listEntities } from '@/api/entities';


interface NotesDashboardProps {
  workspaceId: string;
  workspaceName?: string;
  userId?: string;
  onBack?: () => void;
}

export type TabType = 'notes' | 'sources' | 'search' | 'graph' | 'assistant' | 'dashboard';

const TabButton = ({ tab, label, icon: Icon, currentTab, setCurrentTab }: { tab: TabType, label: string, icon: React.ElementType, currentTab: TabType, setCurrentTab: (t: TabType) => void }) => (
  <button
    onClick={() => setCurrentTab(tab)}
    className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
      currentTab === tab 
        ? "bg-sky-500/15 text-sky-300 border-sky-500/30" 
        : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
    )}
  >
    <Icon size={16} />
    {label}
  </button>
);

export const NotesDashboard: React.FC<NotesDashboardProps> = ({
  workspaceId,
  workspaceName,
  userId,
  onBack,
}) => {
  const [currentTab, setCurrentTab] = useState<TabType>('notes');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isRagModalOpen, setIsRagModalOpen] = useState(false);

  const [graphFilters, setGraphFilters] = useState<GraphQueryParams>({});
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [highlightEntityIds, setHighlightEntityIds] = useState<string[]>([]);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isClustersOpen, setIsClustersOpen] = useState(false);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [isGraphRAGModalOpen, setIsGraphRAGModalOpen] = useState(false);
  const [isEntityEditorOpen, setIsEntityEditorOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<GraphEntity | null>(null);
  const [isRelationshipEditorOpen, setIsRelationshipEditorOpen] = useState(false);
  const [editingRelationship, setEditingRelationship] = useState<GraphRelationship | null>(null);
  const [relationshipSourceEntity, setRelationshipSourceEntity] = useState<GraphEntity | null>(null);
  const [activeJob, setActiveJob] = useState<ExtractionJobResponse | null>(null);
  const [isTriggeringJob, setIsTriggeringJob] = useState<'extract' | 'reindex' | null>(null);
  const [showResultSummary, setShowResultSummary] = useState(false);
  const [graphRefreshKey, setGraphRefreshKey] = useState(0);
  const [clusterOptions, setClusterOptions] = useState<GraphClusterSummary[]>([]);
  const [availableEntities, setAvailableEntities] = useState<Array<{ id: string; name: string }>>([]);
  const [pendingSuggestionCount, setPendingSuggestionCount] = useState(0);

  const [pinnedNotes, setPinnedNotes] = useState<Note[]>([]);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [isArchivedView, setIsArchivedView] = useState(false);
  const [archivedNotes, setArchivedNotes] = useState<Note[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | undefined>(undefined);

  const [isLoadingPinned, setIsLoadingPinned] = useState(false);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [isLoadingArchived, setIsLoadingArchived] = useState(false);

  const [error, setError] = useState<Error | null>(null);
  const [totalNotes, setTotalNotes] = useState(0);

  // Editor State
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [newNoteCounter, setNewNoteCounter] = useState(0);

  const fetchDashboardData = useCallback(async () => {
    setError(null);
    setIsLoadingPinned(true);
    setIsLoadingRecent(true);

    try {
      const [pinnedRes, recentRes] = await Promise.all([
        listNotes(workspaceId, { is_pinned: true, tag: selectedTag, page_size: 100 }),
        listNotes(workspaceId, { is_archived: false, tag: selectedTag, sort: 'updated_at_desc', page_size: 100 }),
      ]);

      setPinnedNotes(pinnedRes.items);
      const pinnedIds = new Set(pinnedRes.items.map((n) => n.id));
      setRecentNotes(recentRes.items.filter((n) => !pinnedIds.has(n.id)));
      setTotalNotes(recentRes.total);
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      const msg =
        apiErr?.error?.message ||
        (err instanceof Error ? err.message : 'Failed to load dashboard data');
      setError(new Error(msg));
    } finally {
      setIsLoadingPinned(false);
      setIsLoadingRecent(false);
    }
  }, [workspaceId, selectedTag]);

  const fetchArchivedData = useCallback(async () => {
    setIsLoadingArchived(true);
    try {
      const res = await listNotes(workspaceId, {
        is_archived: true,
        tag: selectedTag,
        sort: 'updated_at_desc',
        page_size: 100,
      });
      setArchivedNotes(res.items);
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      const msg =
        apiErr?.error?.message ||
        (err instanceof Error ? err.message : 'Failed to load archived notes');
      setError(new Error(msg));
    } finally {
      setIsLoadingArchived(false);
    }
  }, [workspaceId, selectedTag]);

  useEffect(() => {
    if (isArchivedView) {
      fetchArchivedData();
    } else {
      fetchDashboardData();
    }
  }, [workspaceId, isArchivedView, selectedTag, fetchDashboardData, fetchArchivedData]);

  const handleNoteSelect = (note: Note) => {
    setSelectedNote(note);
    setIsCreatingNote(false);
  };

  const handleNewNote = () => {
    setSelectedNote(null);
    setIsCreatingNote(true);
    setNewNoteCounter((c) => c + 1);
  };

  const closeEditor = () => {
    setSelectedNote(null);
    setIsCreatingNote(false);
  };

  const handleNoteSaved = (note: Note) => {
    setSelectedNote(note);
    setIsCreatingNote(false);
    if (isArchivedView) fetchArchivedData();
    else fetchDashboardData();
  };

  const handleNoteDeleted = () => {
    closeEditor();
    if (isArchivedView) fetchArchivedData();
    else fetchDashboardData();
  };

  const handleNavigateToNote = (noteId: string) => {
    const found =
      pinnedNotes.find((n) => n.id === noteId) ||
      recentNotes.find((n) => n.id === noteId) ||
      archivedNotes.find((n) => n.id === noteId);
    if (found) {
      handleNoteSelect(found);
      setCurrentTab('notes');
    } else {
      // Fallback: If not in current view, could fetch it, but for now just close editor
      closeEditor();
    }
  };

  const isEditorOpen = isCreatingNote || selectedNote !== null;
  const isBackendPending =
    error && (error.message.includes('404') || error.message.toLowerCase().includes('not found'));

  // Load cluster and entity options for graph view
  useEffect(() => {
    if (currentTab === 'graph') {
      listClusters(workspaceId)
        .then((res) => {
          setClusterOptions(
            res.map((c) => ({
              id: c.id,
              label: c.label,
              member_count: c.member_count ?? 0,
            }))
          );
        })
        .catch(() => {
          setClusterOptions([]);
        });

      listEntities(workspaceId)
        .then((res) => {
          setAvailableEntities(res.map((e) => ({ id: e.id, name: e.name })));
        })
        .catch(() => {
          setAvailableEntities([]);
        });

      getLinkSuggestions(workspaceId, { status: 'pending' })
        .then((res) => {
          setPendingSuggestionCount(res.total);
        })
        .catch(() => {
          setPendingSuggestionCount(0);
        });
    }
  }, [currentTab, workspaceId, graphRefreshKey]);

  // Polling for active background job (Extract / Reindex / Clustering)
  const activeJobId = activeJob?.job_id || activeJob?.id;
  const activeJobStatus = activeJob?.status;
  const isJobRunning = Boolean(
    isTriggeringJob !== null ||
    (activeJob && (activeJob.status === 'queued' || activeJob.status === 'running'))
  );

  useEffect(() => {
    if (!activeJobId || activeJobId === 'pending') return;
    const isOngoing = activeJobStatus === 'queued' || activeJobStatus === 'running';
    if (!isOngoing) return;

    const interval = setInterval(async () => {
      try {
        const updated = await getJobStatus(activeJobId);
        setActiveJob((prev) => (prev ? { ...prev, ...updated, job_id: updated.id } : null));
        if (updated.status === 'completed' || updated.status === 'failed') {
          clearInterval(interval);
          if (updated.status === 'completed') {
            setShowResultSummary(true);
            setGraphRefreshKey((k) => k + 1);
          }
        }
      } catch (err) {
        console.error('Failed to poll job status:', err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [activeJobId, activeJobStatus]);

  const handleExtractGraph = async () => {
    if (isJobRunning) return;
    setIsTriggeringJob('extract');
    // Immediate active state before network call completes
    setActiveJob({
      job_id: 'pending',
      status: 'running',
      job_type: 'extract_entities',
      progress: { stage: 'Starting extraction...' },
    });
    try {
      const job = await triggerExtraction(workspaceId);
      setActiveJob({ ...job, job_type: 'extract_entities' });
      if (job.status === 'completed') {
        setShowResultSummary(true);
        setGraphRefreshKey((k) => k + 1);
      }
    } catch (err) {
      console.error('Failed to trigger graph extraction:', err);
      const apiErr = err as { error?: { message?: string } };
      const msg = apiErr?.error?.message || (err instanceof Error ? err.message : 'Extraction request failed');
      setActiveJob({
        job_id: '',
        status: 'failed',
        job_type: 'extract_entities',
        error_message: msg,
      });
    } finally {
      setIsTriggeringJob(null);
    }
  };

  const handleReindexGraph = async () => {
    if (isJobRunning) return;
    setIsTriggeringJob('reindex');
    // Immediate active state before network call completes
    setActiveJob({
      job_id: 'pending',
      status: 'running',
      job_type: 'reindex_graph',
      progress: { stage: 'Starting full reindex...' },
    });
    try {
      const job = await triggerReindex(workspaceId);
      setActiveJob({ ...job, job_type: 'reindex_graph' });
      if (job.status === 'completed') {
        setShowResultSummary(true);
        setGraphRefreshKey((k) => k + 1);
      }
    } catch (err) {
      console.error('Failed to trigger graph reindex:', err);
      const apiErr = err as { error?: { message?: string } };
      const msg = apiErr?.error?.message || (err instanceof Error ? err.message : 'Reindex request failed');
      setActiveJob({
        job_id: '',
        status: 'failed',
        job_type: 'reindex_graph',
        error_message: msg,
      });
    } finally {
      setIsTriggeringJob(null);
    }
  };


  const handleSelectEntity = useCallback((entityId: string) => {
    setSelectedEntityId(entityId);
    setHighlightEntityIds([entityId]);
  }, []);

  const handleHighlightEntities = useCallback((entityIds: string[]) => {
    setHighlightEntityIds(entityIds);
  }, []);

  const getActiveFilterCount = (params: GraphQueryParams): number => {
    let count = 0;
    if (params.entity_type) count++;
    if (params.relationship_type) count++;
    if (params.cluster_id) count++;
    if (params.note_id) count++;
    if (params.min_confidence && params.min_confidence > 0) count++;
    return count;
  };

  useKeyboardShortcuts([
    {
      key: 'space',
      modKey: true,
      handler: () => setIsSearchModalOpen((prev) => !prev),
    },
    {
      key: 'j',
      modKey: true,
      handler: () => {
        if (currentTab === 'graph') {
          setIsGraphRAGModalOpen((prev) => !prev);
        } else {
          setIsRagModalOpen((prev) => !prev);
        }
      },
    },
    {
      key: 'n',
      modKey: true,
      handler: () => {
        if (currentTab === 'graph') {
          setEditingEntity(null);
          setIsEntityEditorOpen(true);
        } else if (!isEditorOpen) {
          handleNewNote();
        }
      },
    },
    {
      key: 'Escape',
      handler: () => {
        if (isSearchModalOpen) setIsSearchModalOpen(false);
        else if (isRagModalOpen) setIsRagModalOpen(false);
        else if (isGraphRAGModalOpen) setIsGraphRAGModalOpen(false);
        else if (isImportModalOpen) setIsImportModalOpen(false);
        else if (isEntityEditorOpen) setIsEntityEditorOpen(false);
        else if (isRelationshipEditorOpen) setIsRelationshipEditorOpen(false);
        else if (selectedEntityId) setSelectedEntityId(null);
        else if (isFiltersOpen) setIsFiltersOpen(false);
        else if (isClustersOpen) setIsClustersOpen(false);
        else if (isSuggestionsOpen) setIsSuggestionsOpen(false);
        else if (isEditorOpen) closeEditor();
      },
    },
  ]);

  return (
    <div className="notes-layout">
      {/* ── Left: Main Panel ─────────────────────────────── */}
      <div
        className="notes-panel animate-slide-right flex flex-col h-full"
        style={currentTab === 'notes' && isEditorOpen ? { maxWidth: '45%', minWidth: '320px' } : {}}
      >
        {/* Top bar */}
        <header className="notes-topbar flex-wrap gap-y-3">
          <div className="notes-topbar-left w-full sm:w-auto">
            {onBack && (
              <button
                type="button"
                data-testid="back-to-workspaces"
                onClick={onBack}
                className="btn-back"
                title="Back to Workspaces"
              >
                <ChevronLeft size={15} aria-hidden="true" />
                <span className="sr-only">Back</span>
              </button>
            )}
            <nav className="notes-breadcrumb" aria-label="Location">
              {workspaceName && (
                <>
                  <span data-testid="active-workspace-badge">
                    {workspaceName}
                  </span>
                  <span className="notes-breadcrumb-sep" aria-hidden="true">/</span>
                </>
              )}
              <span className="notes-breadcrumb-current">
                Knowledge Base
              </span>
            </nav>
            
            <div className="flex items-center gap-1 ml-2 overflow-x-auto">
              <TabButton tab="notes" label="Notes" icon={FileText} currentTab={currentTab} setCurrentTab={setCurrentTab} />
              <TabButton tab="sources" label="Sources" icon={Layers} currentTab={currentTab} setCurrentTab={setCurrentTab} />
              <TabButton tab="search" label="Search" icon={Search} currentTab={currentTab} setCurrentTab={setCurrentTab} />
              <TabButton tab="graph" label="Graph" icon={Share2} currentTab={currentTab} setCurrentTab={setCurrentTab} />
              <TabButton tab="assistant" label="Assistant" icon={Sparkles} currentTab={currentTab} setCurrentTab={setCurrentTab} />
              <TabButton tab="dashboard" label="Dashboard" icon={LayoutDashboard} currentTab={currentTab} setCurrentTab={setCurrentTab} />
            </div>
          </div>

          <div className="notes-topbar-right ml-auto">
            {currentTab === 'notes' && (
              <>
                <button
                  type="button"
                  onClick={() => setIsSearchModalOpen(true)}
                  className="btn-ghost-dark flex items-center gap-2 text-overlay1 hover:text-text"
                  title="Semantic Search (Mod+Space)"
                >
                  <Search size={15} />
                  <span className="hidden lg:inline">Search</span>
                </button>
                <button
                  type="button"
                  data-testid="graph-rag-trigger-btn"
                  onClick={() => setIsRagModalOpen(true)}
                  className="btn-ghost-dark flex items-center gap-2 text-blue-400 hover:text-blue-300"
                  title="Knowledge Assistant (Mod+J)"
                >
                  <Sparkles size={15} />
                  <span className="hidden sm:inline">Assistant</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsArchivedView(!isArchivedView)}
                  className={`btn-ghost-dark${isArchivedView ? ' active' : ''}`}
                  aria-pressed={isArchivedView}
                  title="Toggle archived notes"
                >
                  <Archive size={14} aria-hidden="true" />
                  <span className="hidden xl:inline">Archived</span>
                </button>
              </>
            )}

            {currentTab === 'graph' && (
              <button
                type="button"
                data-testid="graph-rag-trigger-btn"
                onClick={() => setIsRagModalOpen(true)}
                className="btn-ghost-dark flex items-center gap-2 text-violet-400 hover:text-violet-300"
                title="Knowledge Assistant (Mod+J)"
              >
                <Sparkles size={15} />
                <span className="hidden sm:inline">Assistant</span>
              </button>
            )}

            <button
              onClick={() => setIsImportModalOpen(true)}
              className="btn-ghost-dark flex items-center gap-2 text-sky-400 hover:text-sky-300"
            >
              <UploadCloud size={15} />
              <span className="hidden lg:inline">Import</span>
            </button>

            {currentTab === 'notes' && (
              <FlowHoverButton
                type="button"
                onClick={handleNewNote}
                icon={<Plus size={15} strokeWidth={2.5} aria-hidden="true" />}
                className="px-3.5 py-1.5 text-xs font-semibold"
                title="New Note (Mod+N)"
              >
                New Note
              </FlowHoverButton>
            )}
          </div>
        </header>

        {currentTab === 'notes' && (
          <>
            {/* Tag strip */}
            <div className="notes-tagstrip" role="navigation" aria-label="Tag filters">
              <TagFilter
                workspaceId={workspaceId}
                selectedTag={selectedTag}
                onSelectTag={setSelectedTag}
              />
            </div>

            {/* Scrollable content */}
            <main className="notes-scroll" aria-label="Notes">
              <div className="notes-container">
                {/* Error banner */}
                {error && (
                  <div className="error-banner" role="alert">
                    <div className="error-banner-icon" aria-hidden="true">
                      <AlertTriangle size={18} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p className="error-banner-title">
                        {isBackendPending
                          ? 'Backend Notes API Pending (Workstream B)'
                          : 'Error loading notes'}
                      </p>
                      <p className="error-banner-msg">
                        {isBackendPending
                          ? 'Notes endpoints (/api/v1/workspaces/.../notes) are not yet implemented. You can still test the Note Editor and Markdown preview!'
                          : error.message}
                      </p>
                    </div>
                    {isBackendPending && (
                      <button
                        type="button"
                        className="btn-ghost-dark whitespace-nowrap shrink-0"
                        onClick={handleNewNote}
                      >
                        Launch Editor
                      </button>
                    )}
                  </div>
                )}

                {isArchivedView ? (
                  <section aria-labelledby="archived-heading">
                    <h2 id="archived-heading" className="notes-section-heading">
                      <span className="node-dot" aria-hidden="true" />
                      Archived Notes
                    </h2>
                    <NoteList
                      notes={archivedNotes}
                      isLoading={isLoadingArchived}
                      onNoteClick={handleNoteSelect}
                      onNoteUpdated={handleNoteSaved}
                      onNoteDeleted={handleNoteDeleted}
                      emptyStateMessage="No archived notes"
                      emptyStateSubMessage="Notes you archive will appear here."
                    />
                  </section>
                ) : (
                  <>
                    {(pinnedNotes.length > 0 || isLoadingPinned) && (
                      <section aria-labelledby="pinned-heading" style={{ marginBottom: '32px' }}>
                        <h2 id="pinned-heading" className="notes-section-heading">
                          <span className="node-dot amber" aria-hidden="true" />
                          Pinned
                        </h2>
                        <NoteList
                          notes={pinnedNotes}
                          isLoading={isLoadingPinned}
                          onNoteClick={handleNoteSelect}
                          onNoteUpdated={handleNoteSaved}
                          onNoteDeleted={handleNoteDeleted}
                          emptyStateMessage="No pinned notes"
                          emptyStateSubMessage=""
                        />
                      </section>
                    )}

                    <section aria-labelledby="recent-heading">
                      <h2 id="recent-heading" className="notes-section-heading">
                        <span className="node-dot" aria-hidden="true" />
                        Recent Notes
                        {totalNotes > 0 && (
                          <span
                            style={{
                              fontSize: '10px',
                              fontFamily: 'Space Mono, monospace',
                              color: 'var(--overlay0)',
                              marginLeft: '6px',
                            }}
                          >
                            {totalNotes}
                          </span>
                        )}
                      </h2>
                      <NoteList
                        notes={recentNotes}
                        isLoading={isLoadingRecent}
                        onNoteClick={handleNoteSelect}
                        onNoteUpdated={handleNoteSaved}
                        onNoteDeleted={handleNoteDeleted}
                        emptyStateMessage="No recent notes"
                        emptyStateSubMessage="Create your first note to begin building your knowledge atlas."
                      />
                    </section>
                  </>
                )}
              </div>
            </main>
          </>
        )}

        {currentTab === 'graph' && (
          <div className="flex-1 flex flex-col relative overflow-hidden p-3 sm:p-4 gap-3 min-h-0">
            {/* Top Graph Controls Bar */}
            <div className="flex items-center justify-between gap-3 z-10 flex-wrap">
              <div className="w-full sm:w-72 md:w-96">
                <GraphSearchBar
                  workspaceId={workspaceId}
                  onSelectEntity={handleSelectEntity}
                  onHighlightEntities={handleHighlightEntities}
                  onSelectNote={(noteId) => {
                    handleNavigateToNote(noteId);
                  }}
                />
              </div>

              {/* Active Job status indicator */}
              {activeJob && (
                <GraphJobIndicator
                  status={activeJob.status}
                  jobId={activeJob.job_id || activeJob.id || ''}
                  jobType={activeJob.job_type || 'extraction'}
                  errorMessage={activeJob.error_message || undefined}
                  progress={activeJob.progress}
                  onRetry={() => {
                    if (activeJob.job_type === 'reindex_graph') {
                      handleReindexGraph();
                    } else {
                      handleExtractGraph();
                    }
                  }}
                />
              )}


              {/* Toolbar */}
              <GraphEditToolbar
                onAddEntity={() => {
                  setEditingEntity(null);
                  setIsEntityEditorOpen(true);
                }}
                onAddRelationship={() => {
                  setEditingRelationship(null);
                  setRelationshipSourceEntity(null);
                  setIsRelationshipEditorOpen(true);
                }}
                onToggleFilters={() => setIsFiltersOpen((prev) => !prev)}
                isFiltersOpen={isFiltersOpen}
                activeFilterCount={getActiveFilterCount(graphFilters)}
                onToggleClusters={() => setIsClustersOpen((prev) => !prev)}
                isClustersOpen={isClustersOpen}
                onToggleSuggestions={() => setIsSuggestionsOpen((prev) => !prev)}
                isSuggestionsOpen={isSuggestionsOpen}
                pendingSuggestionCount={pendingSuggestionCount}
                onExtractGraph={handleExtractGraph}
                onReindexGraph={handleReindexGraph}
                isJobInProgress={isJobRunning}
                activeJobType={activeJob?.job_type || (isTriggeringJob === 'extract' ? 'extract_entities' : isTriggeringJob === 'reindex' ? 'reindex_graph' : null)}
              />
            </div>

            {/* Main Graph Canvas Area */}
            <div className="flex-1 relative rounded-2xl overflow-hidden border border-white/[0.08] bg-slate-950/40 backdrop-blur-sm flex min-h-0">
              {/* Left Drawer: Filter Panel */}
              {isFiltersOpen && (
                <div className="absolute top-3 left-3 z-20 w-80 max-h-[calc(100%-24px)] overflow-y-auto">
                  <GraphFilterPanel
                    filters={graphFilters}
                    onChange={(newFilters) => setGraphFilters(newFilters)}
                    onClose={() => setIsFiltersOpen(false)}
                    clusters={clusterOptions}
                  />
                </div>
              )}

              {/* Left Drawer: Cluster View */}
              {isClustersOpen && (
                <div className="absolute top-3 left-3 z-20 w-96 max-h-[calc(100%-24px)] overflow-y-auto">
                  <ClusterView
                    workspaceId={workspaceId}
                    isOpen={isClustersOpen}
                    onClose={() => setIsClustersOpen(false)}
                    onSelectCluster={(clusterId) => {
                      setGraphFilters((prev) => ({ ...prev, cluster_id: clusterId }));
                      setIsClustersOpen(false);
                    }}
                    onNavigateToNote={(noteId) => handleNavigateToNote(noteId)}
                    className="shadow-2xl"
                  />
                </div>
              )}

              {/* Center Canvas: ConstellationGraph */}
              <ConstellationGraph
                key={`graph-${graphRefreshKey}`}
                workspaceId={workspaceId}
                filterParams={graphFilters}
                selectedEntityId={selectedEntityId}
                highlightEntityIds={highlightEntityIds}
                onSelectEntity={handleSelectEntity}
                className="flex-1 w-full h-full"
              />

              {/* Right Drawer: Knowledge Explorer */}
              {selectedEntityId && (
                <div className="absolute top-3 right-3 z-20 w-96 max-h-[calc(100%-24px)] overflow-y-auto">
                  <KnowledgeExplorer
                    entityId={selectedEntityId}
                    onClose={() => {
                      setSelectedEntityId(null);
                      setHighlightEntityIds([]);
                    }}
                    onSelectEntity={(nextEntityId) => {
                      setSelectedEntityId(nextEntityId);
                      setHighlightEntityIds([nextEntityId]);
                    }}
                    onNavigateToNote={(noteId) => handleNavigateToNote(noteId)}
                    onEditEntity={(entity) => {
                      setEditingEntity(entity);
                      setIsEntityEditorOpen(true);
                    }}
                    onAddRelationship={(entity) => {
                      setRelationshipSourceEntity(entity);
                      setEditingRelationship(null);
                      setIsRelationshipEditorOpen(true);
                    }}
                    onEntityDeleted={() => {
                      setSelectedEntityId(null);
                      setHighlightEntityIds([]);
                      setGraphRefreshKey((k) => k + 1);
                    }}
                    className="shadow-2xl"
                  />
                </div>
              )}

              {/* Right Drawer: Link Suggestions */}
              {isSuggestionsOpen && !selectedEntityId && (
                <div className="absolute top-3 right-3 z-20 w-96 max-h-[calc(100%-24px)] overflow-y-auto">
                  <LinkSuggestionPanel
                    workspaceId={workspaceId}
                    isOpen={isSuggestionsOpen}
                    onClose={() => setIsSuggestionsOpen(false)}
                    onNavigateToNote={(noteId) => handleNavigateToNote(noteId)}
                    onLinkCreated={() => {
                      setPendingSuggestionCount((c) => Math.max(0, c - 1));
                      setGraphRefreshKey((k) => k + 1);
                    }}
                    className="shadow-2xl"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {currentTab === 'sources' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <SourceList workspaceId={workspaceId} />
          </div>
        )}

        {currentTab === 'search' && (
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto max-w-5xl mx-auto w-full">
            <SearchPanel
              workspaceId={workspaceId}
              onNoteSelect={(noteId) => {
                handleNavigateToNote(noteId);
                setCurrentTab('notes');
              }}
            />
          </div>
        )}

        {currentTab === 'assistant' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <AssistantPanel
              workspaceId={workspaceId}
              onNavigateToNote={(noteId) => {
                handleNavigateToNote(noteId);
                setCurrentTab('notes');
              }}
            />
          </div>
        )}

        {currentTab === 'dashboard' && (
          <DashboardView 
            workspaceId={workspaceId}
            onNavigateToNote={handleNavigateToNote}
          />
        )}
      </div>

      {/* ── Right: Editor Panel (Only visible on Notes tab) ──────────────────────────────── */}
      {currentTab === 'notes' && isEditorOpen && (
        <aside className="editor-panel animate-slide-left" aria-label="Note editor">
          <div className="editor-panel-inner">
            <div style={{ flex: 1, minWidth: 0 }}>
              <NoteEditor
                key={selectedNote ? selectedNote.id : `new-${newNoteCounter}`}
                workspaceId={workspaceId}
                userId={userId}
                initialNote={selectedNote || undefined}
                onClose={closeEditor}
                onSaved={handleNoteSaved}
                onDeleted={handleNoteDeleted}
                className="h-full min-h-[700px]"
              />
            </div>

            {selectedNote && (
              <div style={{ minWidth: 0 }}>
                <NoteLinks
                  workspaceId={workspaceId}
                  noteId={selectedNote.id}
                  onNavigateToNote={handleNavigateToNote}
                  className="sticky top-6"
                />
              </div>
            )}
          </div>
        </aside>
      )}

      {/* ── Import Modal ──────────────────────────────── */}
      <Modal 
        isOpen={isImportModalOpen} 
        onClose={() => setIsImportModalOpen(false)}
        width="full"
        className="max-w-2xl bg-transparent border-none shadow-none"
      >
        <ImportWizard 
          workspaceId={workspaceId}
          userId={userId || '00000000-0000-0000-0000-000000000000'}
          onClose={() => setIsImportModalOpen(false)}
          onImportComplete={() => {
            fetchDashboardData();
            if (isArchivedView) fetchArchivedData();
          }}
        />
      </Modal>

      {/* ── Search Modal ──────────────────────────────── */}
      <Modal 
        isOpen={isSearchModalOpen} 
        onClose={() => setIsSearchModalOpen(false)}
        width="md"
        className="h-[70vh] bg-transparent border-none shadow-none"
      >
        <SearchPanel
          workspaceId={workspaceId}
          onNoteSelect={(noteId) => {
            setIsSearchModalOpen(false);
            handleNavigateToNote(noteId);
          }}
          onClose={() => setIsSearchModalOpen(false)}
        />
      </Modal>

      {/* ── RAG Modal ──────────────────────────────── */}
      <Modal 
        isOpen={isRagModalOpen} 
        onClose={() => setIsRagModalOpen(false)}
        width="lg"
        className="h-[85vh] bg-transparent border-none shadow-none"
      >
        <RAGPanel
          workspaceId={workspaceId}
          onNavigateToNote={(noteId) => {
            setIsRagModalOpen(false);
            handleNavigateToNote(noteId);
          }}
          onClose={() => setIsRagModalOpen(false)}
        />
      </Modal>

      {/* ── Entity Editor Modal ───────────────────────── */}
      <EntityEditor
        workspaceId={workspaceId}
        entity={editingEntity}
        isOpen={isEntityEditorOpen}
        onClose={() => {
          setIsEntityEditorOpen(false);
          setEditingEntity(null);
        }}
        onSave={(savedEntity) => {
          setIsEntityEditorOpen(false);
          setEditingEntity(null);
          setSelectedEntityId(savedEntity.id);
          setHighlightEntityIds([savedEntity.id]);
          setGraphRefreshKey((k) => k + 1);
        }}
      />

      {/* ── Relationship Editor Modal ─────────────────── */}
      <RelationshipEditor
        workspaceId={workspaceId}
        relationship={editingRelationship}
        sourceEntity={relationshipSourceEntity}
        availableEntities={availableEntities}
        isOpen={isRelationshipEditorOpen}
        onClose={() => {
          setIsRelationshipEditorOpen(false);
          setEditingRelationship(null);
          setRelationshipSourceEntity(null);
        }}
        onSave={() => {
          setIsRelationshipEditorOpen(false);
          setEditingRelationship(null);
          setRelationshipSourceEntity(null);
          setGraphRefreshKey((k) => k + 1);
        }}
      />

      {/* ── GraphRAG Modal ────────────────────────────── */}
      <Modal
        isOpen={isGraphRAGModalOpen}
        onClose={() => setIsGraphRAGModalOpen(false)}
        width="lg"
        className="h-[85vh] bg-transparent border-none shadow-none"
      >
        <GraphRAGPanel
          workspaceId={workspaceId}
          className="h-full overflow-y-auto"
          onNavigateToNote={(noteId) => {
            setIsGraphRAGModalOpen(false);
            handleNavigateToNote(noteId);
          }}
          onSelectEntity={(entityId) => {
            setIsGraphRAGModalOpen(false);
            setSelectedEntityId(entityId);
            setHighlightEntityIds([entityId]);
          }}
        />
      </Modal>

      {/* ── Extraction Result Summary Modal ───────────── */}
      {showResultSummary && activeJob && (
        <Modal
          isOpen={showResultSummary}
          onClose={() => setShowResultSummary(false)}
          width="md"
          className="bg-transparent border-none shadow-none"
        >
          <ExtractionResultSummary
            status={activeJob.status}
            entityCount={activeJob.progress?.extracted_entities}
            relationshipCount={activeJob.progress?.extracted_relationships}
            notesProcessedCount={activeJob.progress?.processed_notes}
            message={activeJob.progress?.summary || activeJob.error_message}
            onDismiss={() => setShowResultSummary(false)}
            onViewGraph={() => setShowResultSummary(false)}
            onRetry={() => {
              setShowResultSummary(false);
              if (activeJob.job_type === 'reindex_graph') {
                handleReindexGraph();
              } else {
                handleExtractGraph();
              }
            }}
          />
        </Modal>
      )}
    </div>
  );
};

