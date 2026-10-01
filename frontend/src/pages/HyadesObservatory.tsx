import React, { useState, useEffect, useCallback } from 'react';
import { ConstellationGraph } from '@/components/ConstellationGraph';
import { GraphSearchBar } from '@/components/GraphSearchBar';
import { GraphEditToolbar } from '@/components/GraphEditToolbar';
import { GraphFilterPanel } from '@/components/GraphFilterPanel';
import { ClusterView } from '@/components/ClusterView';
import { KnowledgeExplorer } from '@/components/KnowledgeExplorer';
import { LinkSuggestionPanel } from '@/components/LinkSuggestionPanel';
import { EntityEditor } from '@/components/EntityEditor';
import { RelationshipEditor } from '@/components/RelationshipEditor';
import { GraphJobIndicator } from '@/components/GraphJobIndicator';
import { GraphEntity } from '@/types/graph_entity';
import { GraphRelationship } from '@/types/graph_relationship';
import { GraphQueryParams, GraphClusterSummary } from '@/types/graph';
import { ExtractionJobResponse } from '@/types/jobs';
import { listClusters } from '@/api/clusters';
import { getLinkSuggestions } from '@/api/link_suggestions';
import { triggerExtraction, triggerReindex } from '@/api/graph_index';
import { getJobStatus } from '@/api/jobs';
import { listEntities } from '@/api/entities';
import observatoryPlate from '@/assets/plates/observatory-plate.jpg';
import {
  Maximize2,
  Minimize2,
  Compass,
  SlidersHorizontal,
  Layers,
  Sparkles,
} from 'lucide-react';

interface HyadesObservatoryProps {
  workspaceId: string;
  onNavigateToNote?: (noteId: string) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export const HyadesObservatory: React.FC<HyadesObservatoryProps> = ({
  workspaceId,
  onNavigateToNote,
  isFullscreen: externalFullscreen,
  onToggleFullscreen: externalToggleFullscreen,
}) => {
  const [internalFullscreen, setInternalFullscreen] = useState(false);
  const isFullscreen = externalFullscreen !== undefined ? externalFullscreen : internalFullscreen;
  const toggleFullscreen = externalToggleFullscreen || (() => setInternalFullscreen((prev) => !prev));

  const [graphFilters, setGraphFilters] = useState<GraphQueryParams>({});
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [highlightEntityIds, setHighlightEntityIds] = useState<string[]>([]);
  const [selectedEntityName, setSelectedEntityName] = useState<string | null>(null);

  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isClustersOpen, setIsClustersOpen] = useState(false);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);

  const [isEntityEditorOpen, setIsEntityEditorOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<GraphEntity | null>(null);
  const [isRelationshipEditorOpen, setIsRelationshipEditorOpen] = useState(false);
  const [editingRelationship, setEditingRelationship] = useState<GraphRelationship | null>(null);
  const [relationshipSourceEntity, setRelationshipSourceEntity] = useState<GraphEntity | null>(null);

  const [activeJob, setActiveJob] = useState<ExtractionJobResponse | null>(null);
  const [isTriggeringJob, setIsTriggeringJob] = useState<'extract' | 'reindex' | null>(null);
  const [graphRefreshKey, setGraphRefreshKey] = useState(0);

  const [clusterOptions, setClusterOptions] = useState<GraphClusterSummary[]>([]);
  const [availableEntities, setAvailableEntities] = useState<Array<{ id: string; name: string }>>([]);
  const [pendingSuggestionCount, setPendingSuggestionCount] = useState(0);

  // Load cluster and entity options
  useEffect(() => {
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
      .catch(() => setClusterOptions([]));

    listEntities(workspaceId)
      .then((res) => {
        setAvailableEntities(res.map((e) => ({ id: e.id, name: e.name })));
      })
      .catch(() => setAvailableEntities([]));

    getLinkSuggestions(workspaceId, { status: 'pending' })
      .then((res) => setPendingSuggestionCount(res.total))
      .catch(() => setPendingSuggestionCount(0));
  }, [workspaceId, graphRefreshKey]);

  // Polling for active background job
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
        setGraphRefreshKey((k) => k + 1);
      }
    } catch (err) {
      console.error('Failed to trigger graph extraction:', err);
      const apiErr = err as { error?: { message?: string } };
      const msg =
        apiErr?.error?.message ||
        (err instanceof Error ? err.message : 'Extraction request failed');
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
        setGraphRefreshKey((k) => k + 1);
      }
    } catch (err) {
      console.error('Failed to trigger graph reindex:', err);
      const apiErr = err as { error?: { message?: string } };
      const msg =
        apiErr?.error?.message ||
        (err instanceof Error ? err.message : 'Reindex request failed');
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

  const handleSelectEntity = useCallback(
    (entityId: string) => {
      setSelectedEntityId(entityId);
      setHighlightEntityIds([entityId]);
      const found = availableEntities.find((e) => e.id === entityId);
      if (found) setSelectedEntityName(found.name);
    },
    [availableEntities]
  );

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

  return (
    <div
      className={`relative w-full flex flex-col overflow-hidden bg-[#EFECE4] transition-all ${
        isFullscreen ? 'fixed inset-0 z-50 h-screen' : 'h-[calc(100vh-56px)]'
      }`}
    >
      {/* Background Celestial Plate Wash */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-10 mix-blend-multiply"
          style={{
            backgroundImage: `url(${observatoryPlate})`,
            filter: 'contrast(1.2) sepia(0.3)',
          }}
        />
        {/* Subtle grid lines */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #1C1917 1px, transparent 1px), linear-gradient(to bottom, #1C1917 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      {/* Top Center Celestial HUD Bar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex items-center gap-3 bg-[#FAF8F2]/95 border border-[#C9C2B0] px-4 py-1.5 rounded-full shadow-md backdrop-blur-md">
        <div className="flex items-center gap-2 pointer-events-auto">
          <Compass size={13} className="text-[#BD532B]" />
          <span className="serif text-xs font-semibold text-[#1C1917]">
            {selectedEntityName ? selectedEntityName : 'Observatory Constellation Atlas'}
          </span>
          <span className="mono text-[10px] text-[#878074]">· RA 19h 50m / DEC +08°52′</span>
        </div>
      </div>

      {/* Exit Fullscreen Control (Visible in Focus Mode) */}
      {isFullscreen && (
        <button
          type="button"
          onClick={toggleFullscreen}
          className="absolute top-3 right-4 z-40 px-3 py-1.5 bg-[#FAF8F2] border border-[#C9C2B0] rounded-full shadow-lg text-xs font-medium text-[#1C1917] hover:bg-[#EFECE4] transition-all flex items-center gap-1.5 focus:outline-none"
        >
          <Minimize2 size={13} className="text-[#BD532B]" />
          <span>Exit Focus</span>
        </button>
      )}

      {/* Top Controls Bar (Search Bar & Graph Edit Toolbar) */}
      {!isFullscreen && (
        <div className="relative z-10 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap border-b border-[#DCD6C8] bg-[#FAF8F2]/80 backdrop-blur-sm">
          <div className="w-full sm:w-72 md:w-96">
            <GraphSearchBar
              workspaceId={workspaceId}
              onSelectEntity={handleSelectEntity}
              onHighlightEntities={handleHighlightEntities}
              onSelectNote={(noteId) => {
                if (onNavigateToNote) onNavigateToNote(noteId);
              }}
            />
          </div>

          {activeJob && (
            <GraphJobIndicator
              status={activeJob.status}
              jobId={activeJob.job_id || activeJob.id || ''}
              jobType={activeJob.job_type || 'extraction'}
              errorMessage={activeJob.error_message || undefined}
              progress={activeJob.progress}
              onRetry={() => {
                if (activeJob.job_type === 'reindex_graph') handleReindexGraph();
                else handleExtractGraph();
              }}
            />
          )}

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
            activeJobType={
              activeJob?.job_type ||
              (isTriggeringJob === 'extract'
                ? 'extract_entities'
                : isTriggeringJob === 'reindex'
                ? 'reindex_graph'
                : null)
            }
          />
        </div>
      )}

      {/* Main Canvas & Spatial Instrument Container */}
      <div className="flex-1 relative overflow-hidden flex min-h-0">
        {/* Left Drawer: Filter Panel */}
        {isFiltersOpen && (
          <div className="absolute top-4 left-4 z-30 w-80 max-h-[calc(100%-32px)] overflow-y-auto animate-fade-in shadow-2xl rounded-2xl">
            <div className="relative">
              <GraphFilterPanel
                filters={graphFilters}
                onChange={(newFilters) => setGraphFilters(newFilters)}
                onClose={() => setIsFiltersOpen(false)}
                clusters={clusterOptions}
              />
            </div>
          </div>
        )}

        {/* Left Drawer: Cluster View */}
        {isClustersOpen && (
          <div className="absolute top-4 left-4 z-30 w-96 max-h-[calc(100%-32px)] overflow-y-auto animate-fade-in shadow-2xl rounded-2xl">
            <ClusterView
              workspaceId={workspaceId}
              isOpen={isClustersOpen}
              onClose={() => setIsClustersOpen(false)}
              onSelectCluster={(clusterId) => {
                setGraphFilters((prev) => ({ ...prev, cluster_id: clusterId }));
                setIsClustersOpen(false);
              }}
              onNavigateToNote={(noteId) => {
                if (onNavigateToNote) onNavigateToNote(noteId);
              }}
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

        {/* Vertical Instrument Controls (Right-side HUD pill) */}
        <div className="absolute bottom-6 right-6 z-30 flex flex-col gap-1.5 bg-[#FAF8F2]/95 border border-[#C9C2B0] p-1.5 rounded-2xl shadow-xl backdrop-blur-md">
          {/* Fullscreen / Focused View Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className={`p-2 rounded-xl text-[#575249] hover:text-[#1C1917] hover:bg-[#EFECE4] transition-all focus:outline-none ${
              isFullscreen ? 'bg-[#BD532B]/15 text-[#BD532B]' : ''
            }`}
            title={isFullscreen ? 'Exit Focused View' : 'Enter Focused Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>

          <div className="w-full h-px bg-[#DCD6C8] my-0.5" />

          {/* Filters Toggle in vertical control */}
          <button
            type="button"
            onClick={() => setIsFiltersOpen((prev) => !prev)}
            className={`p-2 rounded-xl text-[#575249] hover:text-[#1C1917] hover:bg-[#EFECE4] transition-all focus:outline-none ${
              isFiltersOpen ? 'bg-[#162135] text-white' : ''
            }`}
            title="Toggle Filters"
          >
            <SlidersHorizontal size={16} />
          </button>

          {/* Clusters Toggle in vertical control */}
          <button
            type="button"
            onClick={() => setIsClustersOpen((prev) => !prev)}
            className={`p-2 rounded-xl text-[#575249] hover:text-[#1C1917] hover:bg-[#EFECE4] transition-all focus:outline-none ${
              isClustersOpen ? 'bg-[#162135] text-white' : ''
            }`}
            title="Toggle Clusters"
          >
            <Layers size={16} />
          </button>

          {/* Suggestions Toggle in vertical control */}
          <button
            type="button"
            onClick={() => setIsSuggestionsOpen((prev) => !prev)}
            className={`p-2 rounded-xl text-[#575249] hover:text-[#1C1917] hover:bg-[#EFECE4] transition-all focus:outline-none ${
              isSuggestionsOpen ? 'bg-[#BD532B] text-white' : ''
            }`}
            title="Toggle Link Suggestions"
          >
            <Sparkles size={16} />
          </button>
        </div>

        {/* Right Drawer: Knowledge Explorer */}
        {selectedEntityId && (
          <div className="absolute top-4 right-4 z-30 w-96 max-h-[calc(100%-32px)] overflow-y-auto animate-fade-in shadow-2xl rounded-2xl">
            <KnowledgeExplorer
              entityId={selectedEntityId}
              onClose={() => {
                setSelectedEntityId(null);
                setHighlightEntityIds([]);
                setSelectedEntityName(null);
              }}
              onSelectEntity={(nextEntityId) => {
                setSelectedEntityId(nextEntityId);
                setHighlightEntityIds([nextEntityId]);
              }}
              onNavigateToNote={(noteId) => {
                if (onNavigateToNote) onNavigateToNote(noteId);
              }}
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
                setSelectedEntityName(null);
                setGraphRefreshKey((k) => k + 1);
              }}
            />
          </div>
        )}

        {/* Right Drawer: Link Suggestions */}
        {isSuggestionsOpen && !selectedEntityId && (
          <div className="absolute top-4 right-4 z-30 w-96 max-h-[calc(100%-32px)] overflow-y-auto animate-fade-in shadow-2xl rounded-2xl">
            <LinkSuggestionPanel
              workspaceId={workspaceId}
              isOpen={isSuggestionsOpen}
              onClose={() => setIsSuggestionsOpen(false)}
              onNavigateToNote={(noteId) => {
                if (onNavigateToNote) onNavigateToNote(noteId);
              }}
              onLinkCreated={() => {
                setPendingSuggestionCount((c) => Math.max(0, c - 1));
                setGraphRefreshKey((k) => k + 1);
              }}
            />
          </div>
        )}
      </div>

      {/* Entity and Relationship Editors */}
      {isEntityEditorOpen && (
        <EntityEditor
          workspaceId={workspaceId}
          entity={editingEntity || undefined}
          isOpen={isEntityEditorOpen}
          onClose={() => {
            setIsEntityEditorOpen(false);
            setEditingEntity(null);
          }}
          onSave={() => {
            setIsEntityEditorOpen(false);
            setEditingEntity(null);
            setGraphRefreshKey((k) => k + 1);
          }}
        />
      )}

      {isRelationshipEditorOpen && (
        <RelationshipEditor
          workspaceId={workspaceId}
          relationship={editingRelationship || undefined}
          sourceEntity={relationshipSourceEntity || undefined}
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
      )}
    </div>
  );
};
