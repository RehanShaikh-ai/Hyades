import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { getWorkspaceGraph } from '@/api/graph';
import { GraphResponse, GraphQueryParams, GraphNodeResponse } from '@/types/graph';
import { ENTITY_TYPE_COLORS, getEntityTypeColor } from '@/lib/graph_constants';
import {
  Loader2,
  AlertTriangle,
  Maximize,
  Minimize,
  ZoomIn,
  ZoomOut,
  Compass,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConstellationGraphProps {
  workspaceId: string;
  graphData?: GraphResponse | null;
  isLoading?: boolean;
  error?: Error | null;
  onRefresh?: () => void;
  onSelectEntity?: (entityId: string) => void;
  selectedEntityId?: string | null;
  highlightEntityIds?: string[];
  filterParams?: GraphQueryParams;
  className?: string;
}

interface InternalGraphNode extends GraphNodeResponse {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface InternalGraphLink {
  id: string;
  source: string | InternalGraphNode;
  target: string | InternalGraphNode;
  relationship_type: string;
  confidence: number;
  is_manual: boolean;
}

export const ConstellationGraph: React.FC<ConstellationGraphProps> = ({
  workspaceId,
  graphData: externalGraphData,
  isLoading: externalLoading,
  error: externalError,
  onRefresh,
  onSelectEntity,
  selectedEntityId,
  highlightEntityIds = [],
  filterParams,
  className,
}) => {
  const [internalData, setInternalData] = useState<GraphResponse | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);
  const [internalError, setInternalError] = useState<Error | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLegend, setShowLegend] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);

  const isControlled =
    externalGraphData !== undefined ||
    externalLoading !== undefined ||
    externalError !== undefined;
  const graphData = externalGraphData !== undefined ? externalGraphData : internalData;
  const isLoading = externalLoading !== undefined ? Boolean(externalLoading) : internalLoading;
  const error = externalError !== undefined ? externalError : internalError;

  const fetchGraph = useCallback(async () => {
    if (isControlled) return;
    setInternalLoading(true);
    setInternalError(null);
    try {
      const data = await getWorkspaceGraph(workspaceId, filterParams);
      setInternalData(data);
    } catch (err) {
      setInternalError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setInternalLoading(false);
    }
  }, [workspaceId, filterParams, isControlled]);

  useEffect(() => {
    if (!isControlled) {
      fetchGraph();
    }
  }, [fetchGraph, isControlled]);

  // Dimension tracking
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isFullscreen, isLoading]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        graphRef.current?.pauseAnimation?.();
      } else {
        graphRef.current?.resumeAnimation?.();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);


  const handleNodeClick = useCallback(
    (node: unknown) => {
      const typedNode = node as { id?: string };
      if (typedNode?.id && onSelectEntity) {
        onSelectEntity(typedNode.id);
      }
    },
    [onSelectEntity]
  );

  const toggleFullscreen = () => setIsFullscreen((prev) => !prev);

  const handleZoomIn = () => {
    if (graphRef.current) {
      const zoom = graphRef.current.zoom();
      graphRef.current.zoom(zoom * 1.3, 400);
    }
  };

  const handleZoomOut = () => {
    if (graphRef.current) {
      const zoom = graphRef.current.zoom();
      graphRef.current.zoom(zoom / 1.3, 400);
    }
  };

  const handleResetZoom = () => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(500, 40);
    }
  };

  // Convert to ForceGraph2D payload
  const formattedData = useMemo(() => {
    if (!graphData) return { nodes: [], links: [] };

    const nodes: InternalGraphNode[] = graphData.nodes.map((node) => ({
      ...node,
    }));

    const links: InternalGraphLink[] = graphData.edges.map((edge) => ({
      id: edge.id,
      source: edge.source_entity_id,
      target: edge.target_entity_id,
      relationship_type: edge.relationship_type,
      confidence: edge.confidence,
      is_manual: edge.is_manual,
    }));

    return { nodes, links };
  }, [graphData]);

  // Constellation star rendering
  const renderNode = useCallback(
    (node: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as InternalGraphNode;
      if (n.x === undefined || n.y === undefined) return;

      const isSelected = selectedEntityId === n.id;
      const isHighlighted = highlightEntityIds.includes(n.id);
      const degree = n.degree || 1;
      const baseRadius = Math.max(3, Math.min(10, 3 + Math.log2(degree + 1) * 2));
      const color = getEntityTypeColor(n.entity_type);

      // Celestial halo / glow
      const glowRadius = isSelected ? baseRadius * 3 : isHighlighted ? baseRadius * 2.4 : baseRadius * 1.5;
      const gradient = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowRadius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(0.4, isSelected ? 'rgba(56, 189, 248, 0.4)' : `${color}44`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.beginPath();
      ctx.arc(n.x, n.y, glowRadius, 0, 2 * Math.PI);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Core star body
      ctx.beginPath();
      ctx.arc(n.x, n.y, baseRadius, 0, 2 * Math.PI);
      ctx.fillStyle = isSelected ? '#ffffff' : color;
      ctx.fill();

      // Outer ring for selected or manual nodes
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, baseRadius + 3, 0, 2 * Math.PI);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.8 / globalScale;
        ctx.stroke();
      } else if (n.is_manual) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, baseRadius + 1.5, 0, 2 * Math.PI);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1 / globalScale;
        ctx.stroke();
      }

      // Label rendering at readable zoom levels
      if (globalScale > 0.8 || isSelected || isHighlighted) {
        const label = n.name || n.title || 'Entity';
        const fontSize = Math.max(10 / globalScale, 11);
        ctx.font = `${isSelected ? '600' : '400'} ${fontSize}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Background shadow for readability
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 4;
        ctx.fillStyle = isSelected ? '#ffffff' : isHighlighted ? '#7dd3fc' : '#cbd5e1';
        ctx.fillText(label, n.x, n.y + baseRadius + 4);
        ctx.shadowBlur = 0;
      }
    },
    [selectedEntityId, highlightEntityIds]
  );

  return (
    <div
      ref={containerRef}
      data-testid="constellation-graph"
      className={cn(
        'relative bg-[#030712] border border-white/[0.08] rounded-2xl overflow-hidden flex flex-col',
        isFullscreen ? 'fixed inset-4 z-50 shadow-2xl' : className || 'flex-1 min-h-[500px]'
      )}
    >
      {/* ── Truncation Indicator Banner (Required by contract) ── */}
      {graphData?.stats?.truncated && (
        <div
          data-testid="graph-truncation-indicator"
          className="absolute top-4 left-4 z-20 bg-amber-500/10 border border-amber-500/25 text-amber-200 px-3.5 py-2 rounded-xl text-xs font-medium backdrop-blur-xl flex items-center gap-2.5 shadow-xl shadow-black/40 animate-fade-in"
        >
          <AlertTriangle size={15} className="text-amber-400 shrink-0" />
          <div>
            <span className="font-semibold text-amber-200">Graph Truncated:</span> Showing{' '}
            {graphData.nodes.length} nodes (limit reached). Workspace has {graphData.stats.node_count} total entities. Filter by type or cluster to inspect more.
          </div>
        </div>
      )}

      {/* ── Control Action Buttons ── */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1 bg-slate-950/70 border border-white/[0.08] p-1 rounded-xl backdrop-blur-xl shadow-xl shadow-black/40">
        <button
          onClick={handleZoomIn}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
          title="Zoom In"
          aria-label="Zoom in"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
          title="Zoom Out"
          aria-label="Zoom out"
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={handleResetZoom}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
          title="Reset View"
          aria-label="Reset zoom"
        >
          <Compass size={16} />
        </button>
        {(onRefresh || !isControlled) && (
          <button
            onClick={onRefresh || fetchGraph}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
            title="Refresh Graph"
            aria-label="Refresh graph"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin text-sky-400' : ''} />
          </button>
        )}
        <div className="w-[1px] h-4 bg-white/[0.08] mx-0.5" />
        <button
          onClick={toggleFullscreen}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
      </div>

      {/* ── Graph Statistics Overlay ── */}
      {graphData?.stats && (
        <div
          data-testid="graph-stats-indicator"
          className="absolute bottom-4 left-4 z-20 text-xs font-mono text-slate-400 bg-slate-950/70 border border-white/[0.08] px-3 py-1.5 rounded-xl backdrop-blur-xl flex items-center gap-3 pointer-events-none shadow-xl shadow-black/40"
        >
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            <strong className="text-slate-200">{graphData.stats.node_count}</strong> entities
          </span>
          <span className="text-slate-600">·</span>
          <span>
            <strong className="text-slate-200">{graphData.stats.edge_count}</strong> relationships
          </span>
          {graphData.stats.cluster_count !== undefined && (
            <>
              <span className="text-slate-600">·</span>
              <span>
                <strong className="text-slate-200">{graphData.stats.cluster_count}</strong> clusters
              </span>
            </>
          )}
        </div>
      )}

      {/* ── Legend Overlay ── */}
      <div className="absolute bottom-4 right-4 z-20">
        <button
          onClick={() => setShowLegend((v) => !v)}
          className="text-[11px] text-slate-400 bg-slate-950/70 hover:bg-white/[0.06] border border-white/[0.08] px-2.5 py-1 rounded-lg backdrop-blur-xl mb-2 flex items-center gap-1.5 ml-auto transition-colors"
        >
          <span>{showLegend ? 'Hide' : 'Show'} Legend</span>
        </button>
        {showLegend && (
          <div className="bg-slate-950/90 border border-white/[0.08] p-3 rounded-xl backdrop-blur-2xl shadow-2xl text-xs space-y-1.5 min-w-[140px] animate-fade-in">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Entity Types
            </div>
            {Object.entries(ENTITY_TYPE_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2 text-slate-300 capitalize text-[11px]">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                  style={{ backgroundColor: color }}
                />
                <span>{type}</span>
              </div>
            ))}
            <div className="pt-2 border-t border-white/[0.06] flex items-center gap-2 text-[10px] text-slate-400">
              <span className="w-2 h-2 rounded-full border border-amber-400" />
              <span>Manual Entity</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Loading State ── */}
      {isLoading && (
        <div
          data-testid="graph-loading"
          className="absolute inset-0 z-30 bg-[#030712]/75 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-slate-300"
        >
          <Loader2 size={36} className="animate-spin text-sky-400 mb-3" />
          <p className="font-medium text-sm">Aligning constellation...</p>
          <p className="text-xs text-slate-500 mt-1">Retrieving entity relationships and clusters</p>
        </div>
      )}

      {/* ── Error State ── */}
      {error && (
        <div
          data-testid="graph-error"
          className="absolute inset-x-8 top-16 z-30 bg-rose-950/80 border border-rose-800/60 text-rose-200 p-4 rounded-xl flex items-start gap-3 backdrop-blur-md shadow-xl"
        >
          <AlertTriangle size={20} className="text-rose-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <h4 className="font-semibold text-sm">Failed to load Knowledge Constellation</h4>
            <p className="text-xs text-rose-300/80 mt-1">{error.message}</p>
          </div>
          <button
            onClick={onRefresh || fetchGraph}
            className="text-xs bg-rose-900/60 hover:bg-rose-850 px-3 py-1.5 rounded-lg border border-rose-700/60 text-rose-200 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Empty State ── */}
      {!isLoading && !error && graphData && graphData.nodes.length === 0 && (
        <div
          data-testid="graph-empty"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8 text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-sky-950/40 border border-sky-800/40 flex items-center justify-center text-sky-400 mb-3 shadow-inner">
            <Compass size={28} />
          </div>
          <h3 className="font-semibold text-slate-200 text-base">No Entities in Constellation</h3>
          <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4 leading-relaxed">
            Extract knowledge from your notes or manually create entities to form your personal knowledge graph.
          </p>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="text-xs font-medium bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <RefreshCw size={13} /> Refresh Graph
            </button>
          )}
        </div>
      )}

      {/* ── ForceGraph2D Canvas ── */}
      <div className="flex-1 overflow-hidden" style={{ width: '100%', height: '100%' }}>
        <ForceGraph2D
          ref={graphRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={formattedData}
          nodeCanvasObject={renderNode}
          nodeRelSize={6}
          linkColor={(link: unknown) => {
            const l = link as InternalGraphLink;
            return l.is_manual ? 'rgba(251, 191, 36, 0.65)' : 'rgba(56, 189, 248, 0.55)';
          }}
          linkWidth={(link: unknown) => {
            const l = link as InternalGraphLink;
            return Math.max(1.2, (l.confidence || 0.5) * 2.2);
          }}
          linkDirectionalParticles={1}
          linkDirectionalParticleSpeed={0.004}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleColor={() => '#38bdf8'}
          linkLabel={(link: unknown) => {
            const l = link as InternalGraphLink;
            return `${l.relationship_type} (${Math.round((l.confidence || 1) * 100)}%)`;
          }}
          onNodeClick={handleNodeClick}
          cooldownTicks={80}
          cooldownTime={2000}
          onNodeDrag={() => graphRef.current?.resumeAnimation?.()}
          onNodeDragEnd={() => graphRef.current?.pauseAnimation?.()}
          onEngineStop={() => {
            graphRef.current?.zoomToFit(400, 40);
            graphRef.current?.pauseAnimation?.();
          }}
          backgroundColor="rgba(3, 7, 18, 0)"

        />
      </div>
    </div>
  );
};
