import { SavedViewsModal } from '@/components/observatory/SavedViewsModal';
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import celestialAtlasPlate from '@/assets/plates/celestial-atlas.jpg';
import { getWorkspaceGraph } from '@/api/graph';
import { listClusters } from '@/api/clusters';
import { EntityEditor } from '@/components/EntityEditor';
import { RelationshipEditor } from '@/components/RelationshipEditor';
import { LinkSuggestionPanel } from '@/components/LinkSuggestionPanel';
import { GraphResponse, GraphNodeResponse, ObservatoryTarget } from '@/types/graph';
import { StellaContext } from '@/types/navigation';
import { ClusterResponse } from '@/types/cluster';
import {
  CelestialNode,
  CelestialLink,
  EdgeTier,
  ConstellationRegion,
  NodeLabelPlacement,
  POSITION_CACHE_VERSION,
  computeLayoutSignature,
  deriveObservatoryClusters,
  computeClusterAnchors,
  computeObservatoryLayout,
  computeConstellationRegions,
  computeObservatoryLabelPlacements,
  computeVisibleLabelSet,
  selectVisibleCrossClusterLinkKeys,
  getNodeLabelZoomScale,
  getConstellationTitleZoomScale,
  getLinkEndpointIds,
  performLocalUntangle,
  computeConstellationPath,
  getEdgeTier,
  getLinkStroke,
  getLinkOpacity,
  getSubduedLinkOpacity,
  getLinkWidth,
  getLinkDashArray,
  shouldShowNodeLabel,
} from '@/lib/observatory_layout';

export type { CelestialNode, CelestialLink, EdgeTier, ConstellationRegion, NodeLabelPlacement };
export {
  POSITION_CACHE_VERSION,
  computeLayoutSignature,
  deriveObservatoryClusters,
  computeClusterAnchors,
  computeObservatoryLayout,
  computeConstellationRegions,
  computeObservatoryLabelPlacements,
  computeVisibleLabelSet,
  selectVisibleCrossClusterLinkKeys,
  performLocalUntangle,
  computeConstellationPath,
  getEdgeTier,
  getLinkStroke,
  getLinkOpacity,
  getSubduedLinkOpacity,
  getLinkWidth,
  getLinkDashArray,
  shouldShowNodeLabel,
};

interface HyadesObservatoryProps {
  workspaceId: string;
  initialTarget?: ObservatoryTarget | null;
  onNavigateToDestination?: (dest: 'overview' | 'library' | 'observatory' | 'stella') => void;
  onNavigateToStella?: (context: StellaContext) => void;
  onNavigateToNote?: (noteId: string) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onOpenSearch?: () => void;
}

function getStoredPositions(
  wsId: string,
  expectedSignature?: string
): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  if (!wsId) return map;
  try {
    // Purge legacy tangled / pre-cluster caches from older layout versions
    localStorage.removeItem(`hyades_graph_positions_v5_celestial_${wsId}`);
    localStorage.removeItem(`hyades_graph_positions_v6_celestial_${wsId}`);

    const raw = localStorage.getItem(`hyades_graph_positions_${POSITION_CACHE_VERSION}_${wsId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'positions' in parsed) {
        if (expectedSignature && parsed.signature !== expectedSignature) {
          return map;
        }
        const entries = parsed.positions || {};
        for (const [id, pos] of Object.entries(entries)) {
          if (pos && typeof (pos as any).x === 'number' && typeof (pos as any).y === 'number') {
            map.set(id, { x: (pos as any).x, y: (pos as any).y });
          }
        }
      } else if (!expectedSignature && parsed && typeof parsed === 'object') {
        for (const [id, pos] of Object.entries(parsed)) {
          if (pos && typeof (pos as any).x === 'number' && typeof (pos as any).y === 'number') {
            map.set(id, { x: (pos as any).x, y: (pos as any).y });
          }
        }
      }
    }
  } catch {
    // Graceful fallback
  }
  return map;
}

function saveStoredPositions(
  wsId: string,
  map: Map<string, { x: number; y: number }>,
  signature?: string
) {
  if (!wsId || map.size === 0) return;
  try {
    const obj: Record<string, { x: number; y: number }> = {};
    map.forEach((pos, id) => {
      obj[id] = { x: Math.round(pos.x * 10) / 10, y: Math.round(pos.y * 10) / 10 };
    });
    const payload = JSON.stringify({ signature: signature || POSITION_CACHE_VERSION, positions: obj });
    const flatSerialized = JSON.stringify(obj);
    localStorage.setItem(`hyades_graph_positions_${POSITION_CACHE_VERSION}_${wsId}`, payload);
    localStorage.setItem(`hyades_graph_positions_${wsId}`, flatSerialized);
  } catch {
    // Quota or private mode fallback
  }
}

function computeCelestialCoords(id: string): { coords: string; catalog: string } {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const absHash = Math.abs(hash);
  const raHours = String(4 + (absHash % 2)).padStart(2, '0');
  const raMinutes = String(10 + (absHash % 45)).padStart(2, '0');
  const raSeconds = String(absHash % 60).padStart(2, '0');
  const decDeg = String(10 + (absHash % 16)).padStart(2, '0');
  const decMin = String(absHash % 60).padStart(2, '0');
  const catalog = `HYA-${id.replace(/-/g, '').slice(0, 4).toUpperCase()}`;
  return {
    coords: `RA ${raHours}ʰ ${raMinutes}ᵐ ${raSeconds}ˢ · DEC +${decDeg}° ${decMin}′`,
    catalog,
  };
}

export const HyadesObservatory: React.FC<HyadesObservatoryProps> = ({
  workspaceId,
  initialTarget,
  onNavigateToDestination,
  onNavigateToStella,
  onNavigateToNote,
  isFullscreen = false,
  onToggleFullscreen,
  onOpenSearch,
}) => {
  void onOpenSearch;
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<d3.Selection<SVGSVGElement, unknown, null, undefined> | null>(null);
  const graticuleRef = useRef<SVGSVGElement>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // Persistent node position cache & derived layout geometry refs
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const constellationRegionsRef = useRef<ConstellationRegion[]>([]);
  const labelPlacementsRef = useRef<Map<string, NodeLabelPlacement>>(new Map());
  const nodeClusterLookupRef = useRef<Map<string, string>>(new Map());
  const layoutSignatureRef = useRef<string>('');

  // Reactive container dimensions for pure rendering and accurate minimap calculations
  const [containerDimensions, setContainerDimensions] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1600,
    height: typeof window !== 'undefined' ? window.innerHeight : 1000,
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth || window.innerWidth;
        const h = containerRef.current.clientHeight || window.innerHeight;
        setContainerDimensions({ width: w, height: h });
      }
    };
    updateSize();
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Constellation Link Curved Path Generator with obstacle-aware cross-cluster routing (§3)
  const linkConstellationPath = useCallback(
    (d: any, posOverride?: Map<string, { x: number; y: number }>) =>
      computeConstellationPath(
        d,
        nodePositionsRef.current,
        posOverride,
        constellationRegionsRef.current,
        nodeClusterLookupRef.current
      ),
    []
  );

  // Real backend graph state
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);
  const [clusters, setClusters] = useState<ClusterResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // UI state
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [showAtlasPlate, setShowAtlasPlate] = useState(true);
  const [showGraticule, setShowGraticule] = useState(true);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isMinimapExpanded, setIsMinimapExpanded] = useState(false);

  // Dialogs / Panels
  const [isEntityEditorOpen, setIsEntityEditorOpen] = useState(false);
  const [isRelationshipEditorOpen, setIsRelationshipEditorOpen] = useState(false);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);

  // Filters
  const [filterHubs, setFilterHubs] = useState(true);
  const [filterConcepts, setFilterConcepts] = useState(true);
  const [filterCrossLinks, setFilterCrossLinks] = useState(true);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);

  const filterCrossLinksRef = useRef(filterCrossLinks);
  const selectedClusterIdRef = useRef(selectedClusterId);

  // Focus node, hover & search state
  const [selectedNode, setSelectedNode] = useState<CelestialNode | null>(null);
  const [isSavedViewsModalOpen, setIsSavedViewsModalOpen] = useState(false);
  const selectedNodeRef = useRef<CelestialNode | null>(null);

  const [hoveredNode, setHoveredNode] = useState<CelestialNode | null>(null);
  const hoveredNodeRef = useRef<CelestialNode | null>(null);

  const [targetResolutionNotice, setTargetResolutionNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeCandidateIndex, setActiveCandidateIndex] = useState(0);

  // Current camera zoom transform for semantic zoom & orientation inset
  const [currentTransform, setCurrentTransform] = useState<d3.ZoomTransform>(d3.zoomIdentity);

  // Reset transient selection/filter state cleanly on workspace switch
  useEffect(() => {
    setSelectedNode(null);
    setHoveredNode(null);
    setSelectedClusterId(null);
    setTargetResolutionNotice(null);
    nodePositionsRef.current = new Map();
  }, [workspaceId]);

  // Debounce search input to avoid any keystroke overhead
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch real workspace graph & clusters
  const fetchGraph = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    try {
      const [resGraph, resClusters] = await Promise.all([
        getWorkspaceGraph(workspaceId),
        listClusters(workspaceId).catch(() => []),
      ]);
      setGraphData(resGraph);
      setClusters(resClusters);
    } catch {
      // Gracefully handle
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // Transform backend entities & edges into Celestial nodes, links, constellation regions & label placements
  const {
    celestialNodes,
    celestialLinks,
    resolvedClusters,
    constellationRegions,
    labelPlacements,
    storedPositionsMap,
    clusterLookupMap,
    layoutSignature,
  } = useMemo(() => {
    if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
      return {
        celestialNodes: [],
        celestialLinks: [],
        resolvedClusters: [],
        constellationRegions: [],
        labelPlacements: new Map<string, NodeLabelPlacement>(),
        storedPositionsMap: new Map<string, { x: number; y: number }>(),
        clusterLookupMap: new Map<string, string>(),
        layoutSignature: '',
      };
    }

    const nodesMap = new Map<string, GraphNodeResponse>();
    graphData.nodes.forEach((n) => nodesMap.set(n.id, n));

    // Merge explicit cluster definitions from both listClusters and graphData.clusters
    const mergedExplicitClusters: Array<{ id: string; label: string }> = [];
    const seenExplicitIds = new Set<string>();
    clusters.forEach((c) => {
      if (c.id && !seenExplicitIds.has(c.id)) {
        seenExplicitIds.add(c.id);
        mergedExplicitClusters.push({ id: c.id, label: c.label });
      }
    });
    (graphData.clusters || []).forEach((gc) => {
      if (gc.id && !seenExplicitIds.has(gc.id)) {
        seenExplicitIds.add(gc.id);
        mergedExplicitClusters.push({ id: gc.id, label: gc.label });
      }
    });

    // 1. Filter out self-loops strictly from visualization and layout (§2)
    const validEdges = (graphData.edges || []).filter(
      (e) =>
        e.source_entity_id &&
        e.target_entity_id &&
        e.source_entity_id !== e.target_entity_id
    );

    // 2. Build adjacency map & compute degrees based strictly on non-self edges
    const adj = new Map<string, Set<string>>();
    graphData.nodes.forEach((n) => adj.set(n.id, new Set()));
    validEdges.forEach((e) => {
      if (nodesMap.has(e.source_entity_id) && nodesMap.has(e.target_entity_id)) {
        adj.get(e.source_entity_id)?.add(e.target_entity_id);
        adj.get(e.target_entity_id)?.add(e.source_entity_id);
      }
    });

    // 3. Constellation membership resolution (explicit clusters + derived topic communities)
    const { nodeClusterMap, resolvedClusters: resolvedClusterList } = deriveObservatoryClusters(
      graphData.nodes,
      validEdges,
      mergedExplicitClusters
    );

    const clusterGroupNumber = new Map<string, number>();
    resolvedClusterList.forEach((rc, idx) => {
      clusterGroupNumber.set(rc.key, (idx % 12) + 1);
    });

    // 4. Group nodes by constellation to establish authentic 3-tier star hierarchy (§3, §4)
    const clusterNodesMap = new Map<string, GraphNodeResponse[]>();
    graphData.nodes.forEach((n) => {
      const cInfo = nodeClusterMap.get(n.id)!;
      const list = clusterNodesMap.get(cInfo.key) || [];
      list.push(n);
      clusterNodesMap.set(cInfo.key, list);
    });

    const coreNodeIds = new Set<string>();
    const subtopicNodeIds = new Set<string>();

    clusterNodesMap.forEach((cNodes, cKey) => {
      if (cNodes.length === 0) return;
      const isPeripheral = cKey === 'cluster_uncharted_singletons';
      if (isPeripheral && graphData.nodes.length > cNodes.length) {
        // Keep isolated degree-0 orphans as quiet related field stars
        return;
      }

      const sorted = [...cNodes].sort((a, b) => {
        const degA = adj.get(a.id)?.size || 0;
        const degB = adj.get(b.id)?.size || 0;
        return degB * 10 + (b.note_count || 0) - (degA * 10 + (a.note_count || 0)) || a.id.localeCompare(b.id);
      });

      // Level 1 Core: primary hub of the constellation
      coreNodeIds.add(sorted[0].id);
      if (sorted.length >= 16 && (adj.get(sorted[1].id)?.size || 0) >= 4) {
        coreNodeIds.add(sorted[1].id);
      }

      // Level 2 Subtopics: balanced secondary hubs (~28% of constellation, max 5)
      const maxSubs = Math.max(1, Math.min(5, Math.round(cNodes.length * 0.28)));
      const subCandidates = sorted.filter(
        (n) => !coreNodeIds.has(n.id) && (adj.get(n.id)?.size || 0) >= 2
      );
      subCandidates.slice(0, maxSubs).forEach((n) => subtopicNodeIds.add(n.id));
    });

    if (coreNodeIds.size === 0 && graphData.nodes.length > 0) {
      const nodesByDegree = [...graphData.nodes].sort(
        (a, b) => (adj.get(b.id)?.size || 0) - (adj.get(a.id)?.size || 0) || a.id.localeCompare(b.id)
      );
      coreNodeIds.add(nodesByDegree[0].id);
    }

    const nodes: CelestialNode[] = graphData.nodes.map((n) => {
      const { coords, catalog } = computeCelestialCoords(n.id);
      const deg = adj.get(n.id)?.size || 0;
      const cInfo = nodeClusterMap.get(n.id)!;

      let hierarchy: 'core' | 'subtopic' | 'related' = 'related';
      if (coreNodeIds.has(n.id)) {
        hierarchy = 'core';
      } else if (subtopicNodeIds.has(n.id)) {
        hierarchy = 'subtopic';
      }

      const size = hierarchy === 'core' ? 24 : hierarchy === 'subtopic' ? 16 : 9;

      const connections: Array<{ id: string; name: string; type: string; corr: string }> = [];
      validEdges.forEach((e) => {
        const edgeConf =
          typeof e.confidence === 'number'
            ? e.confidence
            : typeof (e as any).weight === 'number'
            ? (e as any).weight
            : 0.85;
        if (e.source_entity_id === n.id) {
          const target = nodesMap.get(e.target_entity_id);
          if (target) {
            connections.push({
              id: target.id,
              name: target.name,
              type: e.relationship_type,
              corr: edgeConf.toFixed(2),
            });
          }
        } else if (e.target_entity_id === n.id) {
          const source = nodesMap.get(e.source_entity_id);
          if (source) {
            connections.push({
              id: source.id,
              name: source.name,
              type: e.relationship_type,
              corr: edgeConf.toFixed(2),
            });
          }
        }
      });

      const groupNum = clusterGroupNumber.get(cInfo.key) || 1;

      return {
        id: n.id,
        label: n.name,
        catalog,
        clusterKey: cInfo.key,
        clusterName: cInfo.name,
        clusterId: cInfo.clusterId,
        isPeripheralSingleton: cInfo.isPeripheralSingleton,
        coords,
        group: groupNum,
        type: hierarchy === 'core' ? 'hub' : 'concept',
        hierarchy,
        size,
        degree: deg,
        noteCount: n.note_count || 0,
        desc:
          n.description ||
          `Extracted ${n.entity_type} concept with ${deg} active relationships in the Hyades knowledge sky.`,
        connections,
      };
    });

    const validNodeIds = new Set(nodes.map((n) => n.id));

    // 5. Consolidate parallel/bidirectional links between unique pairs into single celestial links
    const linkMap = new Map<string, CelestialLink>();
    validEdges.forEach((e) => {
      if (!validNodeIds.has(e.source_entity_id) || !validNodeIds.has(e.target_entity_id)) return;
      const edgeConf =
        typeof e.confidence === 'number'
          ? e.confidence
          : typeof (e as any).weight === 'number'
          ? (e as any).weight
          : 0.85;
      const pairKey =
        e.source_entity_id < e.target_entity_id
          ? `${e.source_entity_id}__${e.target_entity_id}`
          : `${e.target_entity_id}__${e.source_entity_id}`;
      const existing = linkMap.get(pairKey);
      if (!existing) {
        linkMap.set(pairKey, {
          source: e.source_entity_id,
          target: e.target_entity_id,
          weight: edgeConf,
          type: e.relationship_type || '',
          types: e.relationship_type ? [e.relationship_type] : [],
        });
      } else {
        existing.weight = Math.max(existing.weight, edgeConf);
        if (e.relationship_type && !existing.types?.includes(e.relationship_type)) {
          existing.types?.push(e.relationship_type);
          existing.type = existing.types?.join(', ') || existing.type;
        }
      }
    });

    const links: CelestialLink[] = Array.from(linkMap.values());

    // 6. Compute edge tier for every relationship
    const nodeLookup = new Map<string, CelestialNode>();
    const clusterLookup = new Map<string, string>();
    nodes.forEach((n) => {
      nodeLookup.set(n.id, n);
      clusterLookup.set(n.id, n.clusterKey);
    });

    links.forEach((l) => {
      const { sId, tId } = getLinkEndpointIds(l);
      l.tier = getEdgeTier(nodeLookup.get(sId), nodeLookup.get(tId));
    });

    // 7. Topology-signature validated position cache:
    // Automatically invalidates stale coordinates when constellation membership or edges change,
    // while keeping coordinates deterministic across refreshes, rerenders, and workspace switches.
    const signature = computeLayoutSignature(nodes, links);

    const storedPositions = workspaceId
      ? getStoredPositions(workspaceId, signature)
      : new Map<string, { x: number; y: number }>();

    const missingCount = nodes.filter((n) => !storedPositions.has(n.id)).length;
    if (missingCount > 0 || storedPositions.size === 0) {
      // Canonical world origin (800, 500) ensures layout coordinates never depend on transient window resize
      const computedPositions = computeObservatoryLayout(nodes, links, 800, 500);
      storedPositions.clear();
      computedPositions.forEach((pos, id) => {
        storedPositions.set(id, pos);
      });
      saveStoredPositions(workspaceId, storedPositions, signature);
    }

    nodes.forEach((n) => {
      const pos = storedPositions.get(n.id);
      if (pos) {
        n.x = pos.x;
        n.y = pos.y;
      }
    });

    // 8. Compute organic constellation contours, header titles, and 4-offset collision-free label placements
    const regions = computeConstellationRegions(nodes, storedPositions);
    const placements = computeObservatoryLabelPlacements(nodes, links, storedPositions, regions);

    return {
      celestialNodes: nodes,
      celestialLinks: links,
      resolvedClusters: resolvedClusterList,
      constellationRegions: regions,
      labelPlacements: placements,
      storedPositionsMap: new Map(storedPositions),
      clusterLookupMap: clusterLookup,
      layoutSignature: signature,
    };
  }, [graphData, clusters, workspaceId]);

  // Helper to determine if a node is visible under active filters
  const isNodeVisible = useCallback(
    (n: CelestialNode, hubs: boolean, concepts: boolean, clusterId: string | null) => {
      if (!hubs && n.hierarchy === 'core') return false;
      if (!concepts && n.hierarchy !== 'core') return false;
      if (clusterId && n.clusterId !== clusterId && n.clusterKey !== clusterId && n.clusterKey !== `cluster_${clusterId}`) {
        return false;
      }
      return true;
    },
    []
  );

  // Canonical memoized visible nodes across the entire Observatory
  const visibleNodes = useMemo(() => {
    return celestialNodes.filter((n) =>
      isNodeVisible(n, filterHubs, filterConcepts, selectedClusterId)
    );
  }, [celestialNodes, filterHubs, filterConcepts, selectedClusterId, isNodeVisible]);

  const visibleNodeIds = useMemo(() => {
    return new Set(visibleNodes.map((n) => n.id));
  }, [visibleNodes]);

  const visibleNodeIdsRef = useRef<Set<string>>(visibleNodeIds);

  // Automatically deselect node if it becomes filtered out
  useEffect(() => {
    if (selectedNode && !visibleNodeIds.has(selectedNode.id)) {
      setSelectedNode(null);
    }
  }, [visibleNodeIds, selectedNode]);

  const visibleLinks = useMemo(() => {
    return celestialLinks.filter((l) => {
      const { sId, tId } = getLinkEndpointIds(l);
      if (!visibleNodeIds.has(sId) || !visibleNodeIds.has(tId)) return false;
      if (!filterCrossLinks && l.tier === 'cross_cluster') return false;
      return true;
    });
  }, [celestialLinks, visibleNodeIds, filterCrossLinks]);

  /**
   * Computes the unobstructed canvas viewport rectangle between open sidebars,
   * top coordinates HUD, and bottom search/minimap overlays.
   */
  const getUnobstructedViewport = useCallback(
    (width: number, height: number, hasActiveDossier = false) => {
      const isDesktop = width >= 900;
      const safeLeft = isDesktop && isLeftSidebarOpen ? 316 : 32;
      const safeRight = width - (isDesktop && isRightSidebarOpen && hasActiveDossier ? 426 : 62);
      const safeTop = 58;
      const safeBottom = Math.max(safeTop + 160, height - 82);
      const usableWidth = Math.max(220, safeRight - safeLeft);
      const usableHeight = Math.max(180, safeBottom - safeTop);
      const centerX = (safeLeft + safeRight) / 2;
      const centerY = (safeTop + safeBottom) / 2;
      return { usableWidth, usableHeight, centerX, centerY };
    },
    [isLeftSidebarOpen, isRightSidebarOpen]
  );

  const computeFitViewTransform = useCallback(
    (width: number, height: number): d3.ZoomTransform => {
      const { usableWidth, usableHeight, centerX, centerY } = getUnobstructedViewport(
        width,
        height,
        Boolean(selectedNodeRef.current)
      );

      const pts: Array<{ minX: number; maxX: number; minY: number; maxY: number }> = [];
      visibleNodes.forEach((n) => {
        const cached = nodePositionsRef.current.get(n.id);
        const x = cached?.x ?? n.x;
        const y = cached?.y ?? n.y;
        if (x !== undefined && y !== undefined && !isNaN(x) && !isNaN(y)) {
          const pl = labelPlacementsRef.current.get(n.id);
          const halfLW = pl ? pl.width * 0.55 : 44;
          pts.push({
            minX: x - Math.max(n.size + 26, halfLW),
            maxX: x + Math.max(n.size + 26, halfLW),
            minY: y - (n.size + 32),
            maxY: y + (n.size + (pl ? pl.height + 18 : 30)),
          });
        }
      });

      // Include visible constellation region headers & contours so titles never clip
      constellationRegionsRef.current.forEach((r) => {
        if (r.isPeripheralPool) return;
        if (r.nodeIds.some((nid) => visibleNodeIds.has(nid))) {
          pts.push(r.bounds);
        }
      });

      if (pts.length === 0) {
        return d3.zoomIdentity.translate(centerX - 800, centerY - 500).scale(1.0);
      }

      if (visibleNodes.length === 1) {
        const only = visibleNodes[0];
        const p = nodePositionsRef.current.get(only.id) || { x: only.x ?? 800, y: only.y ?? 500 };
        const scale = 1.25;
        return d3.zoomIdentity.translate(centerX - p.x * scale, centerY - p.y * scale).scale(scale);
      }

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      pts.forEach((b) => {
        if (b.minX < minX) minX = b.minX;
        if (b.maxX > maxX) maxX = b.maxX;
        if (b.minY < minY) minY = b.minY;
        if (b.maxY > maxY) maxY = b.maxY;
      });

      const padX = 42;
      const padY = 36;
      const boxWidth = Math.max(140, maxX - minX + padX * 2);
      const boxHeight = Math.max(120, maxY - minY + padY * 2);
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;

      const fitScale = Math.min(
        1.35,
        Math.max(0.2, Math.min(usableWidth / boxWidth, usableHeight / boxHeight))
      );

      const tx = centerX - midX * fitScale;
      const ty = centerY - midY * fitScale;
      return d3.zoomIdentity.translate(tx, ty).scale(fitScale);
    },
    [visibleNodes, visibleNodeIds, getUnobstructedViewport]
  );

  // Deep Link Navigation Target Handler (§9, §10, §16)
  useEffect(() => {
    if (!initialTarget || celestialNodes.length === 0) return;

    let matched: CelestialNode | undefined;
    if (initialTarget.entityId) {
      matched = celestialNodes.find((n) => n.id === initialTarget.entityId);
    }
    if (!matched && initialTarget.relationshipId && graphData?.edges) {
      const edge = graphData.edges.find((e) => e.id === initialTarget.relationshipId);
      if (edge) {
        matched = celestialNodes.find(
          (n) => n.id === edge.source_entity_id || n.id === edge.target_entity_id
        );
      }
    }
    if (!matched && initialTarget.entityName) {
      const q = initialTarget.entityName.trim().toLowerCase();
      matched = celestialNodes.find(
        (n) => n.label.toLowerCase() === q || n.label.toLowerCase().includes(q)
      );
    }
    if (!matched && (initialTarget.noteId || initialTarget.sourceId)) {
      const targetId = initialTarget.noteId || initialTarget.sourceId;
      matched = celestialNodes.find(
        (n) => n.id === targetId || n.connections.some((c) => c.id === targetId)
      );
    }

    if (matched) {
      setTargetResolutionNotice(null);
      setSelectedNode(matched);
      setIsRightSidebarOpen(true);

      const targetX = nodePositionsRef.current.get(matched.id)?.x ?? matched.x;
      const targetY = nodePositionsRef.current.get(matched.id)?.y ?? matched.y;

      if (
        zoomBehaviorRef.current &&
        svgRef.current &&
        targetX !== undefined &&
        targetY !== undefined
      ) {
        const width = containerRef.current?.clientWidth || window.innerWidth;
        const height = containerRef.current?.clientHeight || window.innerHeight;
        const { centerX, centerY } = getUnobstructedViewport(width, height, true);
        const scale = 1.35;
        const x = centerX - targetX * scale;
        const y = centerY - targetY * scale;

        svgRef.current
          .transition()
          .duration(700)
          .ease(d3.easeCubicOut)
          .call(
            zoomBehaviorRef.current.transform,
            d3.zoomIdentity.translate(x, y).scale(scale)
          );
      }
    } else {
      setSelectedNode(null);
      const targetDesc = initialTarget.entityName || initialTarget.entityId || initialTarget.noteId || initialTarget.sourceId || 'requested item';
      setTargetResolutionNotice(`Target "${targetDesc}" could not be located in the visible knowledge graph.`);
    }
  }, [initialTarget, celestialNodes, graphData, getUnobstructedViewport]);

  // Fit-to-content Reset / Fit View (§1.A)
  const handleFitView = useCallback(() => {
    if (!svgRef.current || !zoomBehaviorRef.current || !containerRef.current) return;
    const width = containerRef.current.clientWidth || window.innerWidth;
    const height = containerRef.current.clientHeight || window.innerHeight;
    const targetTransform = computeFitViewTransform(width, height);

    svgRef.current
      .transition()
      .duration(580)
      .ease(d3.easeCubicOut)
      .call(zoomBehaviorRef.current.transform, targetTransform);
  }, [computeFitViewTransform]);

  // Reframe smoothly when user filters to a specific constellation or clears constellation filter
  const didMountClusterRef = useRef(false);
  useEffect(() => {
    if (!didMountClusterRef.current) {
      didMountClusterRef.current = true;
      return;
    }
    if (celestialNodes.length === 0) return;
    const timer = setTimeout(() => {
      handleFitView();
    }, 40);
    return () => clearTimeout(timer);
  }, [selectedClusterId, handleFitView, celestialNodes.length]);

  const getUnobstructedViewportRef = useRef(getUnobstructedViewport);
  const computeFitViewTransformRef = useRef(computeFitViewTransform);

  /**
   * Synchronizes constellation region contours/titles, collision-culled multi-offset
   * node labels, and progressive cross-constellation link visibility in-place on the SVG.
   */
  const syncCanvasVisibility = useCallback(
    (kOverride?: number) => {
      if (!svgRef.current) return;
      const svg = svgRef.current;
      const svgNode = svg.node();
      const k =
        kOverride ?? (svgNode ? d3.zoomTransform(svgNode).k : currentTransform.k || 1);

      const priorityIds = new Set<string>();
      const focusNodeIds = new Set<string>();
      if (selectedNodeRef.current) {
        priorityIds.add(selectedNodeRef.current.id);
        focusNodeIds.add(selectedNodeRef.current.id);
        selectedNodeRef.current.connections.forEach((c) => priorityIds.add(c.id));
      }
      if (hoveredNodeRef.current) {
        priorityIds.add(hoveredNodeRef.current.id);
        focusNodeIds.add(hoveredNodeRef.current.id);
        hoveredNodeRef.current.connections.forEach((c) => priorityIds.add(c.id));
      }

      const nodeLookup = new Map<string, CelestialNode>();
      celestialNodes.forEach((n) => nodeLookup.set(n.id, n));

      const visibleLabelSet = computeVisibleLabelSet(
        celestialNodes,
        nodePositionsRef.current,
        labelPlacementsRef.current,
        constellationRegionsRef.current,
        k,
        priorityIds,
        visibleNodeIdsRef.current
      );
      const labelScale = Math.round(getNodeLabelZoomScale(k) * 1000) / 1000;
      const titleScale = Math.round(getConstellationTitleZoomScale(k) * 1000) / 1000;

      const allowedCrossKeys = selectVisibleCrossClusterLinkKeys(
        celestialLinks,
        nodeLookup,
        k,
        focusNodeIds,
        selectedClusterIdRef.current,
        18
      );

      // 1. Constellation contours & editorial title headers
      svg
        .selectAll<SVGGElement, ConstellationRegion>('.constellation-region-group')
        .each(function (r) {
          const visibleMemberCount = r.nodeIds.filter((id) =>
            visibleNodeIdsRef.current.has(id)
          ).length;
          const showRegion = !r.isPeripheralPool && visibleMemberCount > 0;
          const groupEl = d3.select(this);
          groupEl.style('display', showRegion ? 'block' : 'none');
          if (showRegion) {
            groupEl
              .select('.constellation-hull')
              .style('display', r.hullPath ? 'block' : 'none');
            groupEl
              .select('.constellation-title-inner')
              .attr('transform', `scale(${titleScale})`);
          }
        });

      // 2. Stars & collision-resolved 4-offset labels
      svg.selectAll<SVGGElement, CelestialNode>('.celestial-node').each(function (d) {
        const isVisible = visibleNodeIdsRef.current.has(d.id);
        const el = d3.select(this);
        el.style('display', isVisible ? 'block' : 'none').style(
          'pointer-events',
          isVisible ? 'all' : 'none'
        );
        if (!isVisible) return;

        const pl = labelPlacementsRef.current.get(d.id);
        const showLabel = visibleLabelSet.has(d.id);
        const dx = pl ? pl.dx : 0;
        const dy = pl ? pl.dy : d.size + 13;
        el.select('.node-label-group')
          .style('display', showLabel ? 'block' : 'none')
          .attr('transform', `translate(${dx}, ${dy}) scale(${labelScale})`);
      });

      // 3. Internal constellation links & controlled cross-constellation bridges
      svg.selectAll<SVGPathElement, CelestialLink>('.celestial-link').each(function (l) {
        const { sId, tId, pairKey } = getLinkEndpointIds(l);
        const endpointsVisible =
          visibleNodeIdsRef.current.has(sId) && visibleNodeIdsRef.current.has(tId);
        const tier = l.tier || getEdgeTier(nodeLookup.get(sId), nodeLookup.get(tId));
        let showLink = endpointsVisible;
        if (showLink && tier === 'cross_cluster') {
          if (!filterCrossLinksRef.current || !allowedCrossKeys.has(pairKey)) {
            showLink = false;
          }
        }
        d3.select(this)
          .style('display', showLink ? 'block' : 'none')
          .style('pointer-events', showLink ? 'stroke' : 'none');
      });
    },
    [celestialNodes, celestialLinks, currentTransform.k]
  );

  const syncCanvasVisibilityRef = useRef(syncCanvasVisibility);

  // Synchronize mutable D3 event refs synchronously prior to passive effects
  useLayoutEffect(() => {
    nodePositionsRef.current = new Map(storedPositionsMap);
    constellationRegionsRef.current = constellationRegions;
    labelPlacementsRef.current = labelPlacements;
    nodeClusterLookupRef.current = clusterLookupMap;
    layoutSignatureRef.current = layoutSignature;
  }, [
    storedPositionsMap,
    constellationRegions,
    labelPlacements,
    clusterLookupMap,
    layoutSignature,
  ]);

  useLayoutEffect(() => {
    filterCrossLinksRef.current = filterCrossLinks;
    selectedClusterIdRef.current = selectedClusterId;
    selectedNodeRef.current = selectedNode;
    hoveredNodeRef.current = hoveredNode;
    visibleNodeIdsRef.current = visibleNodeIds;
    getUnobstructedViewportRef.current = getUnobstructedViewport;
    computeFitViewTransformRef.current = computeFitViewTransform;
    syncCanvasVisibilityRef.current = syncCanvasVisibility;
  }, [
    filterCrossLinks,
    selectedClusterId,
    selectedNode,
    hoveredNode,
    visibleNodeIds,
    getUnobstructedViewport,
    computeFitViewTransform,
    syncCanvasVisibility,
  ]);

  // Manual Untangle / Local Cleanup Action (§2)
  const handleUntangle = useCallback(() => {
    if (!containerRef.current || celestialNodes.length === 0) return;

    const newPositions = performLocalUntangle(
      celestialNodes,
      celestialLinks,
      nodePositionsRef.current,
      800,
      500
    );

    newPositions.forEach((pos, id) => {
      nodePositionsRef.current.set(id, pos);
    });
    celestialNodes.forEach((n) => {
      const pos = newPositions.get(n.id);
      if (pos) {
        n.x = pos.x;
        n.y = pos.y;
      }
    });
    saveStoredPositions(workspaceId, nodePositionsRef.current, layoutSignatureRef.current);

    const updatedRegions = computeConstellationRegions(celestialNodes, newPositions);
    const updatedPlacements = computeObservatoryLabelPlacements(
      celestialNodes,
      celestialLinks,
      newPositions,
      updatedRegions
    );
    constellationRegionsRef.current = updatedRegions;
    labelPlacementsRef.current = updatedPlacements;

    if (svgRef.current) {
      const regionByKey = new Map(updatedRegions.map((r) => [r.key, r]));
      svgRef.current
        .selectAll<SVGGElement, ConstellationRegion>('.constellation-region-group')
        .each(function (r) {
          const next = regionByKey.get(r.key);
          if (!next) return;
          d3.select(this).select('.constellation-hull').attr('d', next.hullPath);
          d3.select(this)
            .select('.constellation-title-group')
            .attr('transform', `translate(${next.titlePos.x}, ${next.titlePos.y})`);
        });

      const isJsdom =
        typeof window !== 'undefined' &&
        typeof (window as any).SVGElement !== 'undefined' &&
        !(document.createElementNS('http://www.w3.org/2000/svg', 'g') as any).transform?.baseVal;

      if (isJsdom) {
        svgRef.current
          .selectAll('.celestial-node')
          .attr('transform', (d: any) => {
            const pos = newPositions.get(d.id) || { x: d.x, y: d.y };
            return `translate(${pos.x || 0}, ${pos.y || 0})`;
          });

        svgRef.current
          .selectAll('.celestial-link')
          .attr('d', (d: any) => linkConstellationPath(d, newPositions));
      } else {
        svgRef.current
          .selectAll('.celestial-node')
          .transition()
          .duration(500)
          .ease(d3.easeCubicOut)
          .attr('transform', (d: any) => {
            const pos = newPositions.get(d.id) || { x: d.x, y: d.y };
            return `translate(${pos.x || 0}, ${pos.y || 0})`;
          });

        svgRef.current
          .selectAll('.celestial-link')
          .transition()
          .duration(500)
          .ease(d3.easeCubicOut)
          .attr('d', (d: any) => linkConstellationPath(d, newPositions));
      }

      syncCanvasVisibilityRef.current();
    }
  }, [celestialNodes, celestialLinks, workspaceId, linkConstellationPath]);

  // Keyboard Shortcuts System across Hyades Observatory (§7, §12)
  // Global: Esc closes open dialogs first; if none open, deselects node or cancels search.
  // Observatory: A (+Entity), C (Connect), F (Fit View), Shift+F (Fullscreen), U (Untangle)
  // Protected: NEVER trigger while typing in inputs, textareas, or search boxes!
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const tagName = activeEl?.tagName?.toLowerCase();
      const isInput =
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        Boolean(activeEl?.isContentEditable);

      if (e.key === 'Escape') {
        if (isEntityEditorOpen) {
          setIsEntityEditorOpen(false);
          return;
        }
        if (isRelationshipEditorOpen) {
          setIsRelationshipEditorOpen(false);
          return;
        }
        if (isSuggestionsOpen) {
          setIsSuggestionsOpen(false);
          return;
        }
        if (isMoreMenuOpen) {
          setIsMoreMenuOpen(false);
          return;
        }
        if (isMinimapExpanded) {
          setIsMinimapExpanded(false);
          return;
        }
        if (searchQuery || isSearchFocused) {
          setSearchQuery('');
          setIsSearchFocused(false);
          return;
        }
        if (isInput) return;
        if (selectedNode || hoveredNode) {
          e.preventDefault();
          setSelectedNode(null);
          setHoveredNode(null);
        }
        return;
      }

      // Never trigger letter shortcuts while the user is typing in forms or inputs!
      if (isInput) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        setIsEntityEditorOpen(true);
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        setIsRelationshipEditorOpen(true);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (e.shiftKey) {
          onToggleFullscreen?.();
        } else {
          handleFitView();
        }
      } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        handleUntangle();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isEntityEditorOpen,
    isRelationshipEditorOpen,
    isSuggestionsOpen,
    isMoreMenuOpen,
    isMinimapExpanded,
    searchQuery,
    isSearchFocused,
    selectedNode,
    hoveredNode,
    handleFitView,
    handleUntangle,
    onToggleFullscreen,
  ]);

  // Render Celestial Graticule (Astronomical Atlas Lines)
  const renderCelestialGraticule = useCallback(() => {
    if (!graticuleRef.current) return;
    const svg = d3.select(graticuleRef.current);
    svg.selectAll('*').remove();

    const width = containerRef.current?.clientWidth || window.innerWidth;
    const height = containerRef.current?.clientHeight || window.innerHeight;
    const { centerX: cx, centerY: cy } = getUnobstructedViewportRef.current(width, height, false);

    const g = svg.append('g').attr('class', 'graticule-group');

    // Declination Circles
    const radii = [130, 250, 370, 510, 670, 850];
    const declinationLabels = ['+25°', '+20°', '+15° (Hyades)', '+10°', '+05°', '0° Aequator'];

    radii.forEach((r, i) => {
      g.append('circle')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', r)
        .attr('fill', 'none')
        .attr('stroke', i === 2 ? 'rgba(189, 83, 43, 0.22)' : 'rgba(70, 60, 50, 0.09)')
        .attr('stroke-width', i === 2 ? 1.0 : 0.65)
        .attr('stroke-dasharray', i % 2 === 0 ? '4,4' : 'none');

      g.append('text')
        .attr('x', cx + 8)
        .attr('y', cy - r + 12)
        .attr('fill', i === 2 ? 'rgba(189, 83, 43, 0.65)' : 'rgba(100, 90, 80, 0.34)')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', '9px')
        .text(declinationLabels[i]);
    });

    // Right Ascension Radial Rays
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = (deg * Math.PI) / 180;
      const x2 = cx + Math.cos(rad) * 900;
      const y2 = cy + Math.sin(rad) * 900;

      g.append('line')
        .attr('x1', cx)
        .attr('y1', cy)
        .attr('x2', x2)
        .attr('y2', y2)
        .attr('stroke', 'rgba(70, 60, 50, 0.06)')
        .attr('stroke-width', 0.6)
        .attr('stroke-dasharray', '2,6');

      const h = Math.round(deg / 15);
      g.append('text')
        .attr('x', cx + Math.cos(rad) * 530)
        .attr('y', cy + Math.sin(rad) * 530)
        .attr('fill', 'rgba(100, 90, 80, 0.34)')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', '8.5px')
        .attr('text-anchor', 'middle')
        .text(`${h.toString().padStart(2, '0')}ʰ`);
    }

    // Ecliptic Curve
    const eclipticPath = `M ${cx - 700} ${cy + 220} Q ${cx} ${cy - 160} ${cx + 700} ${cy - 80}`;
    g.append('path')
      .attr('d', eclipticPath)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(192, 141, 56, 0.18)')
      .attr('stroke-width', 1.1)
      .attr('stroke-dasharray', '6,4');
  }, []);

  // Astronomical 8-Point Starburst Path Generator
  const createStarburstPath = (outerR: number, midR: number, innerR: number) => {
    let path = '';
    const points = 8;
    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const r = i % 2 === 0 ? (i % 4 === 0 ? outerR : midR) : innerR;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      path += i === 0 ? `M ${x} ${y} ` : `L ${x} ${y} `;
    }
    path += 'Z';
    return path;
  };

  // Symmetrical 4-Point Concept Star Generator
  const createSymmetricalConceptStar = (r: number) => {
    const p = r;
    const w = r * 0.28;
    return `M 0 ${-p} Q ${w} ${-w} ${p} 0 Q ${w} ${w} 0 ${p} Q ${-w} ${w} ${-p} 0 Q ${-w} ${-w} 0 ${-p} Z`;
  };

  // Export current SVG view as downloadable SVG graphic
  const handleExportView = useCallback(() => {
    if (!svgRef.current) return;
    try {
      const svgNode = svgRef.current.node();
      if (!svgNode) return;
      const serializer = new XMLSerializer();
      let source = serializer.serializeToString(svgNode);
      if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = `hyades-observatory-${new Date().toISOString().slice(0, 10)}.svg`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export view:', err);
    }
  }, []);

  // ================= STABLE D3 CELESTIAL ATLAS INITIALIZER =================
  // Strictly mounted ONCE per graph topology/workspace update.
  // NEVER recreated when selectedNode, hoveredNode, filters, or searchQuery change!
  useEffect(() => {
    if (!containerRef.current || celestialNodes.length === 0) return;

    renderCelestialGraticule();

    d3.select(containerRef.current).selectAll('*').remove();

    const width = containerRef.current.clientWidth || window.innerWidth;
    const height = containerRef.current.clientHeight || window.innerHeight;

    // Mount all celestial nodes & links into the SVG; visibility is managed non-destructively
    const filteredNodes: CelestialNode[] = celestialNodes;
    const filteredLinks: CelestialLink[] = celestialLinks;

    const svg = d3
      .select(containerRef.current)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height])
      .attr('class', 'celestial-svg select-none touch-none cursor-grab active:cursor-grabbing');

    svgRef.current = svg;

    // SVG Defs: Astrolabe Gradients & Glow Filters
    const defs = svg.append('defs');

    // 1. Core Primary Concept Radiant Gradient (Terracotta / Red starburst)
    const coreGrad = defs
      .append('radialGradient')
      .attr('id', 'core-starburst-grad')
      .attr('cx', '50%')
      .attr('cy', '50%')
      .attr('r', '50%');
    coreGrad.append('stop').attr('offset', '0%').attr('stop-color', '#FFF2EB');
    coreGrad.append('stop').attr('offset', '45%').attr('stop-color', '#E0693E');
    coreGrad.append('stop').attr('offset', '100%').attr('stop-color', '#BD532B');

    // 2. Subtopic Starburst Gradient (Medium Yellow / Gold starburst)
    const subtopicGrad = defs
      .append('radialGradient')
      .attr('id', 'subtopic-starburst-grad')
      .attr('cx', '50%')
      .attr('cy', '50%')
      .attr('r', '50%');
    subtopicGrad.append('stop').attr('offset', '0%').attr('stop-color', '#FFFDF0');
    subtopicGrad.append('stop').attr('offset', '45%').attr('stop-color', '#E8B854');
    subtopicGrad.append('stop').attr('offset', '100%').attr('stop-color', '#C08D38');

    // 3. Related Sub-subtopic Gradient (Smaller Terracotta / Orange star)
    const relatedGrad = defs
      .append('radialGradient')
      .attr('id', 'related-concept-grad')
      .attr('cx', '50%')
      .attr('cy', '50%')
      .attr('r', '50%');
    relatedGrad.append('stop').attr('offset', '0%').attr('stop-color', '#FFF4ED');
    relatedGrad.append('stop').attr('offset', '55%').attr('stop-color', '#D9653B');
    relatedGrad.append('stop').attr('offset', '100%').attr('stop-color', '#BD532B');

    // Celestial Halo Filter
    const filter = defs
      .append('filter')
      .attr('id', 'celestial-halo')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    filter.append('feGaussianBlur').attr('stdDeviation', '3.5').attr('result', 'blur');
    filter
      .append('feMerge')
      .selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic'])
      .enter()
      .append('feMergeNode')
      .attr('in', (d) => d);

    // Root Group with Zoom & Pan
    const g = svg.append('g').attr('class', 'observatory-viewport');

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.18, 3.8])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        setCurrentTransform(event.transform);
        syncCanvasVisibilityRef.current(event.transform.k);
      });

    svg.call(zoom);
    zoomBehaviorRef.current = zoom;

    // Background blank click catcher for entity deselection (§3)
    g.append('rect')
      .attr('class', 'graph-blank-catcher')
      .attr('x', -width * 6)
      .attr('y', -height * 6)
      .attr('width', width * 14)
      .attr('height', height * 14)
      .attr('fill', 'transparent')
      .style('pointer-events', 'all')
      .on('click', () => {
        setSelectedNode(null);
        setHoveredNode(null);
      });

    svg.on('click', (event) => {
      const target = event.target as HTMLElement | SVGElement;
      if (
        target === svg.node() ||
        target.classList?.contains('graph-blank-catcher') ||
        target.classList?.contains('observatory-viewport') ||
        target.classList?.contains('graticule-group')
      ) {
        setSelectedNode(null);
        setHoveredNode(null);
      }
    });

    // Fast node lookup for link and cluster queries
    const nodeLookup = new Map<string, CelestialNode>();
    filteredNodes.forEach((n) => nodeLookup.set(n.id, n));

    // Fast adjacency and incident link index for real-time neighborhood response (§2, §3)
    const neighborMap = new Map<string, Set<string>>();
    const incidentLinksMap = new Map<string, CelestialLink[]>();
    filteredNodes.forEach((n) => {
      neighborMap.set(n.id, new Set());
      incidentLinksMap.set(n.id, []);
    });
    filteredLinks.forEach((l) => {
      const { sId, tId } = getLinkEndpointIds(l);
      if (sId && tId && sId !== tId) {
        neighborMap.get(sId)?.add(tId);
        neighborMap.get(tId)?.add(sId);
        incidentLinksMap.get(sId)?.push(l);
        incidentLinksMap.get(tId)?.push(l);
      }
    });

    // Helper to resolve edge tier for link rendering (§1, §2, §3, §7)
    const resolveTier = (d: CelestialLink): EdgeTier => {
      const { sId, tId } = getLinkEndpointIds(d);
      return d.tier || getEdgeTier(nodeLookup.get(sId), nodeLookup.get(tId));
    };

    // Constellation Regions Layer (Subtle organic parchment islands & editorial headers)
    const regionsGroup = g
      .append('g')
      .attr('class', 'constellation-regions-layer pointer-events-none select-none');

    const regionEls = regionsGroup
      .selectAll<SVGGElement, ConstellationRegion>('.constellation-region-group')
      .data(
        constellationRegions.filter((r) => !r.isPeripheralPool),
        (r) => r.key
      )
      .enter()
      .append('g')
      .attr('class', 'constellation-region-group')
      .attr('data-cluster-key', (r) => r.key);

    regionEls
      .append('path')
      .attr('class', 'constellation-hull')
      .attr('d', (r) => r.hullPath)
      .attr('fill', 'rgba(232, 206, 180, 0.28)')
      .attr('stroke', 'rgba(189, 83, 43, 0.19)')
      .attr('stroke-width', 1.05)
      .attr('stroke-dasharray', '3.5,4');

    const titleGroups = regionEls
      .append('g')
      .attr('class', 'constellation-title-group')
      .attr('transform', (r) => `translate(${r.titlePos.x}, ${r.titlePos.y})`);

    const titleInners = titleGroups.append('g').attr('class', 'constellation-title-inner');

    const ornamentStarPath = createSymmetricalConceptStar(4.6);
    titleInners
      .append('path')
      .attr('class', 'constellation-title-ornament-left')
      .attr('d', ornamentStarPath)
      .attr('fill', '#C49234')
      .attr('transform', (r) => `translate(${-(r.titlePos.width / 2 - 7)}, -5.5)`);

    titleInners
      .append('text')
      .attr('class', 'constellation-title-text serif')
      .attr('text-anchor', 'middle')
      .attr('font-size', '18.5px')
      .attr('font-weight', '600')
      .attr('fill', '#162135')
      .attr('letter-spacing', '0.01em')
      .attr('paint-order', 'stroke')
      .attr('stroke', '#FAF8F2')
      .attr('stroke-width', '4.5px')
      .attr('stroke-linejoin', 'round')
      .text((r) => r.displayTitle);

    titleInners
      .append('path')
      .attr('class', 'constellation-title-ornament-right')
      .attr('d', ornamentStarPath)
      .attr('fill', '#C49234')
      .attr('transform', (r) => `translate(${r.titlePos.width / 2 - 7}, -5.5)`);

    // Links Layer
    const linkGroup = g.append('g').attr('class', 'links-layer');
    const link = linkGroup
      .selectAll<SVGPathElement, CelestialLink>('path')
      .data(filteredLinks)
      .enter()
      .append('path')
      .attr('class', 'celestial-link link-reveal')
      .attr('data-tier', (d) => resolveTier(d))
      .style('animation-delay', (_d, i) => `${Math.min(i * 8, 300)}ms`)
      .attr('fill', 'none')
      .attr('stroke', (d) => getLinkStroke(resolveTier(d)))
      .attr('stroke-opacity', (d) => getLinkOpacity(resolveTier(d)))
      .attr('stroke-width', (d) => getLinkWidth(resolveTier(d), d.weight))
      .attr('stroke-dasharray', (d) => getLinkDashArray(resolveTier(d)));

    // Nodes Layer
    const nodeGroup = g.append('g').attr('class', 'nodes-layer');
    const node = nodeGroup
      .selectAll<SVGGElement, CelestialNode>('.celestial-node')
      .data(filteredNodes, (d) => d.id)
      .enter()
      .append('g')
      .attr('class', 'celestial-node cursor-pointer star-reveal')
      .style('animation-delay', (d, i) => {
        const tierOffset = d.hierarchy === 'core' ? 0 : d.hierarchy === 'subtopic' ? 70 : 140;
        return `${tierOffset + Math.min(i * 8, 220)}ms`;
      })
      .attr('data-id', (d) => d.id)
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedNode(d);
        setIsRightSidebarOpen(true);
        // Smoothly center unobstructed viewport on clicked entity (§1.D)
        const pos = nodePositionsRef.current.get(d.id) || { x: d.x, y: d.y };
        if (svgRef.current && zoomBehaviorRef.current && pos.x !== undefined && pos.y !== undefined) {
          const w = containerRef.current?.clientWidth || window.innerWidth;
          const h = containerRef.current?.clientHeight || window.innerHeight;
          const { centerX, centerY } = getUnobstructedViewportRef.current(w, h, true);
          const scale = Math.max(1.25, d3.zoomTransform(svgRef.current.node()!).k);
          const tx = centerX - pos.x * scale;
          const ty = centerY - pos.y * scale;
          svgRef.current
            .transition()
            .duration(550)
            .ease(d3.easeCubicOut)
            .call(
              zoomBehaviorRef.current.transform,
              d3.zoomIdentity.translate(tx, ty).scale(scale)
            );
        }
      })
      .on('mouseenter', function (_event, d) {
        setHoveredNode(d);
        d3.select(this).select('.node-label-group').style('display', 'block');
      })
      .on('mouseleave', function () {
        setHoveredNode(null);
      });

    // Statically position all nodes and curved constellation links directly from established coordinates (§3, §4)
    link.attr('d', (d: any) => linkConstellationPath(d));
    node.attr('transform', (d) => {
      const pos = nodePositionsRef.current.get(d.id) || { x: d.x ?? 0, y: d.y ?? 0 };
      return `translate(${pos.x}, ${pos.y})`;
    });

    // Render Node Shapes & Multi-Offset Collision-Resolved Sky Labels
    node.each(function (d) {
      const el = d3.select(this);

      // Forgiving Invisible Interaction Hitbox (§3)
      el.append('circle')
        .attr('class', 'star-hitbox')
        .attr('r', Math.max(24, d.size + 13))
        .attr('fill', 'transparent')
        .style('cursor', 'pointer');

      // Selection Halo
      el.append('circle')
        .attr('class', 'selection-halo pointer-events-none')
        .attr('r', d.size * 2.0)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(189, 83, 43, 0.55)')
        .attr('stroke-width', 1.2)
        .attr('stroke-dasharray', '3,3')
        .style('opacity', 0);

      if (d.hierarchy === 'core') {
        // Large Red/Terracotta Starburst for Core Concepts
        el.append('path')
          .attr('d', createStarburstPath(24, 15, 6))
          .attr('fill', 'url(#core-starburst-grad)')
          .attr('filter', 'url(#celestial-halo)')
          .attr('stroke', '#8F3819')
          .attr('stroke-width', 1.1);

        el.append('circle')
          .attr('r', 3.5)
          .attr('fill', '#FAF8F2')
          .attr('stroke', '#BD532B')
          .attr('stroke-width', 0.9);
      } else if (d.hierarchy === 'subtopic') {
        // Medium Yellow/Gold Starburst for Subtopics
        el.append('path')
          .attr('d', createStarburstPath(16, 10, 4.5))
          .attr('fill', 'url(#subtopic-starburst-grad)')
          .attr('filter', 'url(#celestial-halo)')
          .attr('stroke', '#8F6418')
          .attr('stroke-width', 0.9);

        el.append('circle')
          .attr('r', 2.5)
          .attr('fill', '#FAF8F2')
          .attr('stroke', '#C08D38')
          .attr('stroke-width', 0.8);
      } else {
        // Smaller Terracotta/Orange Concept Star for Related/Lower concepts
        el.append('path')
          .attr('d', createSymmetricalConceptStar(9.5))
          .attr('fill', 'url(#related-concept-grad)')
          .attr('stroke', '#BD532B')
          .attr('stroke-width', 0.95);

        el.append('circle').attr('r', 1.9).attr('fill', '#FAF8F2');
      }

      const pl = labelPlacements.get(d.id);
      const dx = pl ? pl.dx : 0;
      const dy = pl ? pl.dy : d.size + 13;
      const anchor = pl ? pl.textAnchor : 'middle';
      const fontSize = pl ? pl.fontSize : d.hierarchy === 'core' ? 13.5 : d.hierarchy === 'subtopic' ? 11.5 : 10;
      const lines = pl ? pl.lines : [d.label];
      const lineHeight = pl ? pl.lineHeight : Math.round(fontSize * 1.18 * 10) / 10;

      const textGroup = el
        .append('g')
        .attr('class', 'node-label-group pointer-events-none select-none')
        .attr('transform', `translate(${dx}, ${dy})`);

      const textEl = textGroup
        .append('text')
        .attr('text-anchor', anchor)
        .attr('class', d.hierarchy === 'core' ? 'serif font-semibold' : 'serif font-medium')
        .attr('font-size', `${fontSize}px`)
        .attr('fill', '#162135')
        .attr('letter-spacing', '0.012em')
        .attr('paint-order', 'stroke')
        .attr('stroke', '#FAF8F2')
        .attr('stroke-width', d.hierarchy === 'core' ? '3.6px' : '3.2px')
        .attr('stroke-linejoin', 'round');

      if (lines.length <= 1) {
        textEl.text(lines[0] ?? d.label);
      } else {
        lines.forEach((lineStr, idx) => {
          textEl
            .append('tspan')
            .attr('x', 0)
            .attr('dy', idx === 0 ? '0' : `${lineHeight}px`)
            .text(lineStr);
        });
      }
    });

    // Initial camera positioning: fit entire celestial atlas cleanly into unobstructed viewport
    const targetMatched = initialTarget
      ? filteredNodes.find(
          (n) =>
            (initialTarget.entityId && n.id === initialTarget.entityId) ||
            (initialTarget.entityName &&
              n.label.toLowerCase() === initialTarget.entityName.trim().toLowerCase())
        )
      : null;

    if (targetMatched) {
      const px = nodePositionsRef.current.get(targetMatched.id)?.x ?? targetMatched.x;
      const py = nodePositionsRef.current.get(targetMatched.id)?.y ?? targetMatched.y;
      if (px !== undefined && py !== undefined) {
        const { centerX, centerY } = getUnobstructedViewportRef.current(width, height, true);
        const scale = 1.35;
        svg.call(
          zoom.transform,
          d3.zoomIdentity.translate(centerX - px * scale, centerY - py * scale).scale(scale)
        );
      }
    } else {
      const fitTransform = computeFitViewTransformRef.current(width, height);
      svg.call(zoom.transform, fitTransform);
    }

    syncCanvasVisibilityRef.current();

    // Temporary Elastic "Jiggle" Drag Interaction (§1, §2, §3, §4, §8)
    // Grabbing a node follows cursor smoothly.
    // Directly connected neighbors react with a subtle elastic jiggle (displacement ~22%).
    // Curved relationship links respond and bend naturally.
    // On release, all nodes and curves gently settle back to their exact resting positions.
    // Positions are NEVER persisted on drag end.
    let activeSettleTimer: d3.Timer | null = null;
    let activeDragData: {
      nodeId: string;
      origin: { x: number; y: number };
      startMouse: { x: number; y: number };
      neighborOrigins: Map<string, { x: number; y: number }>;
      secondHopOrigins: Map<string, { x: number; y: number }>;
      draggedNodeEl: d3.Selection<SVGGElement, any, any, any>;
      draggedLinksEl: d3.Selection<SVGPathElement, any, any, any>;
    } | null = null;

    const drag = d3
      .drag<SVGGElement, CelestialNode>()
      .subject((_event, d) => {
        const p = nodePositionsRef.current.get(d.id) || { x: d.x ?? 0, y: d.y ?? 0 };
        return { x: p.x, y: p.y, id: d.id };
      })
      .on('start', (event, d) => {
        // Stop any active settle timer immediately
        if (activeSettleTimer) {
          activeSettleTimer.stop();
          activeSettleTimer = null;
        }

        const origin = nodePositionsRef.current.get(d.id) || { x: d.x ?? 0, y: d.y ?? 0 };
        const neighbors = Array.from(neighborMap.get(d.id) || []);
        const neighborOrigins = new Map<string, { x: number; y: number }>();
        const secondHopOrigins = new Map<string, { x: number; y: number }>();

        // 1st-hop direct neighbors
        neighbors.forEach((nbrId) => {
          const p = nodePositionsRef.current.get(nbrId);
          if (p) neighborOrigins.set(nbrId, { x: p.x, y: p.y });

          // 2nd-hop neighbors shift very slightly
          const secondNbrs = neighborMap.get(nbrId);
          if (secondNbrs) {
            secondNbrs.forEach((sId) => {
              if (sId !== d.id && !neighborOrigins.has(sId) && !secondHopOrigins.has(sId)) {
                const sp = nodePositionsRef.current.get(sId);
                if (sp) secondHopOrigins.set(sId, { x: sp.x, y: sp.y });
              }
            });
          }
        });

        // Collect incident links connected to dragged node or neighbors
        const incidentList = incidentLinksMap.get(d.id) || [];
        const incidentSet = new Set(incidentList);

        const draggedNodeEl = nodeGroup.select<SVGGElement>(`.celestial-node[data-id="${d.id}"]`);
        draggedNodeEl.classed('is-dragging', true);

        const draggedLinksEl = link.filter((l: any) => incidentSet.has(l));
        draggedLinksEl
          .classed('is-drag-active', true)
          .attr('stroke', '#BD532B')
          .attr('stroke-opacity', 0.95)
          .attr('stroke-width', (l: any) => getLinkWidth(resolveTier(l), l.weight) + 0.85);

        activeDragData = {
          nodeId: d.id,
          origin: { ...origin },
          startMouse: { x: event.x, y: event.y },
          neighborOrigins,
          secondHopOrigins,
          draggedNodeEl,
          draggedLinksEl,
        };
      })
      .on('drag', (event, d) => {
        if (!activeDragData || activeDragData.nodeId !== d.id) return;
        const { origin, startMouse, neighborOrigins, secondHopOrigins, draggedNodeEl, draggedLinksEl } = activeDragData;

        // Smooth delta calculation relative to start
        const dx = event.x - startMouse.x;
        const dy = event.y - startMouse.y;
        const curX = origin.x + dx;
        const curY = origin.y + dy;

        // 1. Dragged node follows cursor smoothly without teleportation
        draggedNodeEl.attr('transform', `translate(${curX}, ${curY})`);

        // 2. Direct connected neighbors react with distance-weighted physical displacement
        const tempPositions = new Map<string, { x: number; y: number }>();
        tempPositions.set(d.id, { x: curX, y: curY });

        neighborOrigins.forEach((nOrig, nId) => {
          const dist = Math.hypot(nOrig.x - origin.x, nOrig.y - origin.y) + 1;
          const weight = Math.min(1.3, Math.max(0.35, 140 / (dist + 40)));
          const factor = 0.22 * weight;
          const nx = nOrig.x + dx * factor;
          const ny = nOrig.y + dy * factor;
          tempPositions.set(nId, { x: nx, y: ny });
          nodeGroup.select(`.celestial-node[data-id="${nId}"]`).attr('transform', `translate(${nx}, ${ny})`);
        });

        secondHopOrigins.forEach((sOrig, sId) => {
          const sDist = Math.hypot(sOrig.x - origin.x, sOrig.y - origin.y) + 1;
          const sWeight = Math.min(1.1, Math.max(0.2, 160 / (sDist + 60)));
          const sFactor = 0.05 * sWeight;
          const sx = sOrig.x + dx * sFactor;
          const sy = sOrig.y + dy * sFactor;
          tempPositions.set(sId, { x: sx, y: sy });
          nodeGroup.select(`.celestial-node[data-id="${sId}"]`).attr('transform', `translate(${sx}, ${sy})`);
        });

        // 3. Curved relationship links respond and bend naturally in real time
        draggedLinksEl.attr('d', (l: any) => linkConstellationPath(l, tempPositions));
      })
      .on('end', (_event, d) => {
        if (!activeDragData || activeDragData.nodeId !== d.id) return;
        const { origin, neighborOrigins, secondHopOrigins, draggedNodeEl, draggedLinksEl } = activeDragData;

        // Read current dragged and neighbor offsets for smooth return
        const currentTransformStr = draggedNodeEl.attr('transform') || '';
        const match = /translate\(([^,]+),\s*([^)]+)\)/.exec(currentTransformStr);
        const startCurX = match ? parseFloat(match[1]) : origin.x;
        const startCurY = match ? parseFloat(match[2]) : origin.y;

        const neighborStarts = new Map<string, { x: number; y: number }>();
        neighborOrigins.forEach((nOrig, nId) => {
          const nEl = nodeGroup.select(`.celestial-node[data-id="${nId}"]`);
          const nMatch = /translate\(([^,]+),\s*([^)]+)\)/.exec(nEl.attr('transform') || '');
          neighborStarts.set(nId, {
            x: nMatch ? parseFloat(nMatch[1]) : nOrig.x,
            y: nMatch ? parseFloat(nMatch[2]) : nOrig.y,
          });
        });

        const secondStarts = new Map<string, { x: number; y: number }>();
        secondHopOrigins.forEach((sOrig, sId) => {
          const sEl = nodeGroup.select(`.celestial-node[data-id="${sId}"]`);
          const sMatch = /translate\(([^,]+),\s*([^)]+)\)/.exec(sEl.attr('transform') || '');
          secondStarts.set(sId, {
            x: sMatch ? parseFloat(sMatch[1]) : sOrig.x,
            y: sMatch ? parseFloat(sMatch[2]) : sOrig.y,
          });
        });

        const isJsdom =
          typeof window !== 'undefined' &&
          typeof (window as any).SVGElement !== 'undefined' &&
          !(document.createElementNS('http://www.w3.org/2000/svg', 'g') as any).transform?.baseVal;

        const completeReturn = () => {
          draggedNodeEl.classed('is-dragging', false);
          draggedNodeEl.attr('transform', `translate(${origin.x}, ${origin.y})`);

          neighborOrigins.forEach((nOrig, nId) => {
            nodeGroup.select(`.celestial-node[data-id="${nId}"]`).attr('transform', `translate(${nOrig.x}, ${nOrig.y})`);
          });
          secondHopOrigins.forEach((sOrig, sId) => {
            nodeGroup.select(`.celestial-node[data-id="${sId}"]`).attr('transform', `translate(${sOrig.x}, ${sOrig.y})`);
          });

          // Restore resting link styles with respect to any active selection
          const currentSelectedId = selectedNodeRef.current?.id;
          const currentHoveredId = hoveredNodeRef.current?.id;
          const selectedNeighbors = new Set<string>();
          if (selectedNodeRef.current) {
            selectedNodeRef.current.connections.forEach((c) => selectedNeighbors.add(c.id));
          }
          const hoveredNeighbors = new Set<string>();
          if (hoveredNodeRef.current) {
            hoveredNodeRef.current.connections.forEach((c) => hoveredNeighbors.add(c.id));
          }

          draggedLinksEl
            .classed('is-drag-active', false)
            .attr('stroke', (l: any) => {
              const srcId = typeof l.source === 'string' ? l.source : l.source.id;
              const tgtId = typeof l.target === 'string' ? l.target : l.target.id;
              const isDirectSelectedEdge = currentSelectedId
                ? (srcId === currentSelectedId && selectedNeighbors.has(tgtId)) ||
                  (tgtId === currentSelectedId && selectedNeighbors.has(srcId))
                : false;
              if (isDirectSelectedEdge) return '#BD532B';
              const isDirectHoveredEdge = currentHoveredId
                ? (srcId === currentHoveredId && hoveredNeighbors.has(tgtId)) ||
                  (tgtId === currentHoveredId && hoveredNeighbors.has(srcId))
                : false;
              if (isDirectHoveredEdge) return '#D26E40';
              const tier = resolveTier(l);
              return getLinkStroke(tier);
            })
            .attr('stroke-opacity', (l: any) => {
              const srcId = typeof l.source === 'string' ? l.source : l.source.id;
              const tgtId = typeof l.target === 'string' ? l.target : l.target.id;
              const isDirectSelectedEdge = currentSelectedId
                ? (srcId === currentSelectedId && selectedNeighbors.has(tgtId)) ||
                  (tgtId === currentSelectedId && selectedNeighbors.has(srcId))
                : false;
              if (isDirectSelectedEdge) return 0.96;
              const isDirectHoveredEdge = currentHoveredId
                ? (srcId === currentHoveredId && hoveredNeighbors.has(tgtId)) ||
                  (tgtId === currentHoveredId && hoveredNeighbors.has(srcId))
                : false;
              if (isDirectHoveredEdge) return 0.88;
              const tier = resolveTier(l);
              if (currentSelectedId || currentHoveredId) {
                return getSubduedLinkOpacity(tier);
              }
              return getLinkOpacity(tier);
            })
            .attr('stroke-width', (l: any) => {
              const srcId = typeof l.source === 'string' ? l.source : l.source.id;
              const tgtId = typeof l.target === 'string' ? l.target : l.target.id;
              const isDirectSelectedEdge = currentSelectedId
                ? (srcId === currentSelectedId && selectedNeighbors.has(tgtId)) ||
                  (tgtId === currentSelectedId && selectedNeighbors.has(srcId))
                : false;
              if (isDirectSelectedEdge) return 2.4;
              const isDirectHoveredEdge = currentHoveredId
                ? (srcId === currentHoveredId && hoveredNeighbors.has(tgtId)) ||
                  (tgtId === currentHoveredId && hoveredNeighbors.has(srcId))
                : false;
              if (isDirectHoveredEdge) return 2.0;
              const tier = resolveTier(l);
              return getLinkWidth(tier, l.weight);
            })
            .attr('stroke-dasharray', (l: any) => {
              const srcId = typeof l.source === 'string' ? l.source : l.source.id;
              const tgtId = typeof l.target === 'string' ? l.target : l.target.id;
              const isDirectSelectedEdge = currentSelectedId
                ? (srcId === currentSelectedId && selectedNeighbors.has(tgtId)) ||
                  (tgtId === currentSelectedId && selectedNeighbors.has(srcId))
                : false;
              if (isDirectSelectedEdge) return 'none';
              const isDirectHoveredEdge = currentHoveredId
                ? (srcId === currentHoveredId && hoveredNeighbors.has(tgtId)) ||
                  (tgtId === currentHoveredId && hoveredNeighbors.has(srcId))
                : false;
              if (isDirectHoveredEdge) return 'none';
              const tier = resolveTier(l);
              return getLinkDashArray(tier);
            })
            .attr('d', (l: any) => linkConstellationPath(l));

          activeDragData = null;
        };

        if (isJsdom) {
          completeReturn();
        } else {
          // Smooth 350ms natural deceleration return animation: settles back to exact cached coordinates
          const duration = 350;
          activeSettleTimer = d3.timer((elapsed) => {
            const t = Math.min(1, elapsed / duration);
            const easeT = 1 - Math.pow(1 - t, 3.2);

            const animX = startCurX + (origin.x - startCurX) * easeT;
            const animY = startCurY + (origin.y - startCurY) * easeT;
            draggedNodeEl.attr('transform', `translate(${animX}, ${animY})`);

            const animPositions = new Map<string, { x: number; y: number }>();
            animPositions.set(d.id, { x: animX, y: animY });

            neighborOrigins.forEach((nOrig, nId) => {
              const nStart = neighborStarts.get(nId) || nOrig;
              const nx = nStart.x + (nOrig.x - nStart.x) * easeT;
              const ny = nStart.y + (nOrig.y - nStart.y) * easeT;
              animPositions.set(nId, { x: nx, y: ny });
              nodeGroup.select(`.celestial-node[data-id="${nId}"]`).attr('transform', `translate(${nx}, ${ny})`);
            });

            secondHopOrigins.forEach((sOrig, sId) => {
              const sStart = secondStarts.get(sId) || sOrig;
              const sx = sStart.x + (sOrig.x - sStart.x) * easeT;
              const sy = sStart.y + (sOrig.y - sStart.y) * easeT;
              animPositions.set(sId, { x: sx, y: sy });
              nodeGroup.select(`.celestial-node[data-id="${sId}"]`).attr('transform', `translate(${sx}, ${sy})`);
            });

            draggedLinksEl.attr('d', (l: any) => linkConstellationPath(l, animPositions));

            if (t >= 1) {
              if (activeSettleTimer) {
                activeSettleTimer.stop();
                activeSettleTimer = null;
              }
              completeReturn();
            }
          });
        }
      });

    node.call(drag);

    return () => {
      if (activeSettleTimer) {
        activeSettleTimer.stop();
        activeSettleTimer = null;
      }
    };
  }, [
    celestialNodes,
    celestialLinks,
    constellationRegions,
    labelPlacements,
    initialTarget,
    linkConstellationPath,
    renderCelestialGraticule,
    workspaceId,
  ]);

  // High-performance, non-destructive visibility sync for filters, constellations & cross-links
  useEffect(() => {
    void visibleLinks;
    syncCanvasVisibilityRef.current();
  }, [visibleNodeIds, visibleLinks, filterCrossLinks, selectedClusterId]);

  // ================= STABLE SELECTION & HOVER HIGHLIGHTING EFFECT =================
  // Updates visual attributes purely in DOM without restarting layout!
  useEffect(() => {
    if (!containerRef.current) return;
    const svg = d3.select(containerRef.current).select('svg');
    if (svg.empty()) return;

    const selectedId = selectedNode?.id;
    const hoveredId = hoveredNode?.id;

    const selectedNeighbors = new Set<string>();
    if (selectedNode) {
      selectedNode.connections.forEach((c) => selectedNeighbors.add(c.id));
    }

    const hoveredNeighbors = new Set<string>();
    if (hoveredNode) {
      hoveredNode.connections.forEach((c) => hoveredNeighbors.add(c.id));
    }

    // Update node styles & selection halo with hardware-accelerated CSS classes
    svg.selectAll<SVGGElement, CelestialNode>('.celestial-node').each(function (d) {
      const el = d3.select(this);
      const isSelected = d.id === selectedId;
      const isHovered = d.id === hoveredId;
      const isConnected = selectedNeighbors.has(d.id);

      // Only dim unrelated nodes when an explicit selection is active
      const isDimmed = selectedId ? !isSelected && !isConnected : false;

      el.classed('is-selected', isSelected)
        .classed('is-connected', isConnected)
        .classed('is-hovered', isHovered)
        .classed('is-dimmed', isDimmed)
        .style('opacity', isDimmed ? 0.42 : 1);

      // Halo treatment: full terracotta halo for selected node; warm subtle halo for hovered node
      const halo = el.select('.selection-halo');
      if (isSelected) {
        halo
          .style('opacity', 1)
          .attr('stroke', 'rgba(189, 83, 43, 0.95)')
          .attr('stroke-width', 1.4)
          .attr('stroke-dasharray', '3,3');
      } else if (isHovered) {
        halo
          .style('opacity', 0.55)
          .attr('stroke', 'rgba(210, 110, 64, 0.70)')
          .attr('stroke-width', 1.2)
          .attr('stroke-dasharray', '2,2');
      } else {
        halo.style('opacity', 0);
      }
    });

    const nodeLookup = new Map<string, CelestialNode>();
    celestialNodes.forEach((n) => nodeLookup.set(n.id, n));

    // Update link highlights with distinct visual hierarchy
    svg.selectAll<SVGPathElement, CelestialLink>('.celestial-link').each(function (d) {
      const el = d3.select(this);
      const { sId: srcId, tId: tgtId } = getLinkEndpointIds(d);

      const isDirectSelectedEdge = selectedId
        ? (srcId === selectedId && selectedNeighbors.has(tgtId)) ||
          (tgtId === selectedId && selectedNeighbors.has(srcId))
        : false;

      const isDirectHoveredEdge = hoveredId
        ? (srcId === hoveredId && hoveredNeighbors.has(tgtId)) ||
          (tgtId === hoveredId && hoveredNeighbors.has(srcId))
        : false;

      const sNode = nodeLookup.get(srcId);
      const tNode = nodeLookup.get(tgtId);
      const tier = d.tier || getEdgeTier(sNode, tNode);

      if (isDirectSelectedEdge) {
        el.classed('is-active-link', true)
          .attr('stroke', '#BD532B')
          .attr('stroke-opacity', 0.96)
          .attr('stroke-width', 2.4)
          .attr('stroke-dasharray', 'none');
      } else if (isDirectHoveredEdge) {
        el.classed('is-active-link', true)
          .attr('stroke', '#D26E40')
          .attr('stroke-opacity', 0.88)
          .attr('stroke-width', 2.0)
          .attr('stroke-dasharray', 'none');
      } else if (selectedId || hoveredId) {
        el.classed('is-active-link', false)
          .attr('stroke', getLinkStroke(tier))
          .attr('stroke-opacity', getSubduedLinkOpacity(tier))
          .attr('stroke-width', getLinkWidth(tier, d.weight) * 0.9)
          .attr('stroke-dasharray', getLinkDashArray(tier));
      } else {
        el.classed('is-active-link', false)
          .attr('stroke', getLinkStroke(tier))
          .attr('stroke-opacity', getLinkOpacity(tier))
          .attr('stroke-width', getLinkWidth(tier, d.weight))
          .attr('stroke-dasharray', getLinkDashArray(tier));
      }
    });

    // Synchronize priority labels & dynamic cross-cluster reveal for active focus
    syncCanvasVisibilityRef.current();
  }, [selectedNode, hoveredNode, celestialNodes]);

  // ================= DEBOUNCED SEARCH HIGHLIGHT EFFECT =================
  // Highlights search matches in graph without re-running simulation
  useEffect(() => {
    if (!containerRef.current) return;
    const svg = d3.select(containerRef.current).select('svg');
    if (svg.empty()) return;

    const query = debouncedSearchQuery.trim().toLowerCase();
    if (!query) {
      if (selectedNode) {
        svg.selectAll('.celestial-node').style('opacity', null);
      } else {
        svg.selectAll('.celestial-node').style('opacity', 1);
      }
      return;
    }

    svg.selectAll<SVGGElement, CelestialNode>('.celestial-node').each(function (d) {
      const match =
        d.label.toLowerCase().includes(query) || d.catalog.toLowerCase().includes(query);
      d3.select(this).style('opacity', match ? 1 : 0.22);
    });
  }, [debouncedSearchQuery, selectedNode]);

  // Zoom controls
  const handleZoom = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    svgRef.current.transition().duration(300).call(zoomBehaviorRef.current.scaleBy, factor);
  };

  // Search candidate ranking (Exact > Prefix > Word-prefix > Substring > Catalog) (§2)
  const searchCandidates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || visibleNodes.length === 0) return [];

    interface ScoredCandidate {
      node: CelestialNode;
      score: number;
      matchType: 'exact' | 'prefix' | 'word-prefix' | 'substring' | 'catalog';
    }

    const scored: ScoredCandidate[] = [];

    visibleNodes.forEach((n) => {
      const labelLower = n.label.toLowerCase();
      let score = 0;
      let matchType: ScoredCandidate['matchType'] = 'substring';

      if (labelLower === q) {
        score = 100;
        matchType = 'exact';
      } else if (labelLower.startsWith(q)) {
        score = 80;
        matchType = 'prefix';
      } else if (labelLower.split(/\s+/).some((w) => w.startsWith(q))) {
        score = 65;
        matchType = 'word-prefix';
      } else if (labelLower.includes(q)) {
        score = 50;
        matchType = 'substring';
      } else if (n.catalog.toLowerCase().includes(q)) {
        score = 35;
        matchType = 'catalog';
      }

      if (score > 0) {
        const bonus =
          (n.hierarchy === 'core' ? 6 : n.hierarchy === 'subtopic' ? 3 : 0) +
          Math.min(4, (n.degree || 0) * 0.4);
        scored.push({ node: n, score: score + bonus, matchType });
      }
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 6).map((s) => s.node);
  }, [searchQuery, visibleNodes]);

  // Search commit: center camera on target node WITHOUT recreating layout (§2)
  const handleSearchCommit = (targetNode?: CelestialNode) => {
    const target =
      targetNode ||
      searchCandidates[0] ||
      celestialNodes.find((n) =>
        n.label.toLowerCase().includes(searchQuery.trim().toLowerCase())
      );
    if (!target) return;
    setSelectedNode(target);
    setIsRightSidebarOpen(true);

    const pos = nodePositionsRef.current.get(target.id) || { x: target.x, y: target.y };
    if (svgRef.current && zoomBehaviorRef.current && pos.x !== undefined && pos.y !== undefined) {
      const width = containerRef.current?.clientWidth || window.innerWidth;
      const height = containerRef.current?.clientHeight || window.innerHeight;
      const { centerX, centerY } = getUnobstructedViewport(width, height, true);
      const scale = 1.35;
      svgRef.current
        .transition()
        .duration(600)
        .ease(d3.easeCubicOut)
        .call(
          zoomBehaviorRef.current.transform,
          d3.zoomIdentity
            .translate(centerX - pos.x * scale, centerY - pos.y * scale)
            .scale(scale)
        );
    }
  };

  // Miniature Orientation Map calculations (§1.E, §8)
  const miniMapData = useMemo(() => {
    const W = isMinimapExpanded ? 340 : 126;
    const H = isMinimapExpanded ? 210 : 74;

    const positions: Array<{
      id: string;
      x: number;
      y: number;
      clusterKey: string;
      hierarchy: string;
      isSelected: boolean;
    }> = [];

    visibleNodes.forEach((n) => {
      const x = n.x;
      const y = n.y;
      if (x !== undefined && y !== undefined && !isNaN(x) && !isNaN(y)) {
        positions.push({
          id: n.id,
          x,
          y,
          clusterKey: n.clusterKey,
          hierarchy: n.hierarchy,
          isSelected: selectedNode?.id === n.id,
        });
      }
    });

    if (positions.length === 0) {
      return { nodes: [], viewport: null, bounds: null, clusters: [], selectedPoint: null };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    positions.forEach((p) => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });

    const pad = 120;
    const graphMinX = minX - pad;
    const graphMaxX = maxX + pad;
    const graphMinY = minY - pad;
    const graphMaxY = maxY + pad;
    const spanX = Math.max(10, graphMaxX - graphMinX);
    const spanY = Math.max(10, graphMaxY - graphMinY);

    const mappedNodes = positions.map((p) => {
      const mx = ((p.x - graphMinX) / spanX) * W;
      const my = ((p.y - graphMinY) / spanY) * H;
      const color =
        p.hierarchy === 'core'
          ? '#BD532B'
          : p.hierarchy === 'subtopic'
          ? '#C08D38'
          : '#645A50';
      const baseR = p.hierarchy === 'core' ? 2.5 : p.hierarchy === 'subtopic' ? 1.8 : 1.2;
      const r = (p.isSelected ? baseR * 1.5 : baseR) * (isMinimapExpanded ? 1.4 : 1.0);
      const opacity = p.isSelected ? 1.0 : p.hierarchy === 'core' ? 0.95 : 0.75;
      return { id: p.id, mx, my, r, color, opacity };
    });

    // Viewport rect calculation
    const containerW = containerDimensions.width;
    const containerH = containerDimensions.height;
    const k = currentTransform.k || 1;
    const tx = currentTransform.x || 0;
    const ty = currentTransform.y || 0;

    const visibleLeft = (0 - tx) / k;
    const visibleTop = (0 - ty) / k;
    const visibleRight = (containerW - tx) / k;
    const visibleBottom = (containerH - ty) / k;

    const vx = Math.max(0, ((visibleLeft - graphMinX) / spanX) * W);
    const vy = Math.max(0, ((visibleTop - graphMinY) / spanY) * H);
    const vw = Math.min(W - vx, Math.max(8, ((visibleRight - visibleLeft) / spanX) * W));
    const vh = Math.min(H - vy, Math.max(6, ((visibleBottom - visibleTop) / spanY) * H));

    // Compute cluster centroids for expanded mode
    const clusterCentroids: Array<{ key: string; label: string; cx: number; cy: number }> = [];
    if (isMinimapExpanded) {
      const clusterPoints = new Map<string, Array<{ mx: number; my: number }>>();
      positions.forEach((p) => {
        const list = clusterPoints.get(p.clusterKey) || [];
        list.push({ mx: ((p.x - graphMinX) / spanX) * W, my: ((p.y - graphMinY) / spanY) * H });
        clusterPoints.set(p.clusterKey, list);
      });

      clusterPoints.forEach((pts, key) => {
        if (pts.length >= 2) {
          const avgX = pts.reduce((a, b) => a + b.mx, 0) / pts.length;
          const avgY = pts.reduce((a, b) => a + b.my, 0) / pts.length;
          const matched = clusters.find((c) => c.id === key || `cluster_${c.id}` === key);
          const matchedNode = celestialNodes.find((n) => n.clusterKey === key);
          const label = matchedNode?.clusterName || matched?.label || key.replace(/^comp_/, 'Sector ');
          clusterCentroids.push({ key, label, cx: avgX, cy: avgY });
        }
      });
    }

    const selectedPoint = mappedNodes.find((n) => n.id === selectedNode?.id) || null;

    return {
      nodes: mappedNodes,
      viewport: { x: vx, y: vy, w: vw, h: vh },
      bounds: { graphMinX, spanX, graphMinY, spanY },
      clusters: clusterCentroids,
      selectedPoint,
    };
  }, [
    visibleNodes,
    celestialNodes,
    selectedNode,
    currentTransform,
    isMinimapExpanded,
    clusters,
    containerDimensions,
  ]);

  const handleMiniMapClick = useCallback(
    (clickX: number, clickY: number, width: number, height: number) => {
      if (!miniMapData.bounds || !svgRef.current || !zoomBehaviorRef.current) return;
      const { graphMinX, spanX, graphMinY, spanY } = miniMapData.bounds;
      const targetGraphX = graphMinX + (clickX / width) * spanX;
      const targetGraphY = graphMinY + (clickY / height) * spanY;

      const containerW = containerDimensions.width;
      const containerH = containerDimensions.height;
      const { centerX, centerY } = getUnobstructedViewport(
        containerW,
        containerH,
        Boolean(selectedNode)
      );
      const k = currentTransform.k || 1;
      const tx = centerX - targetGraphX * k;
      const ty = centerY - targetGraphY * k;

      svgRef.current
        .transition()
        .duration(500)
        .ease(d3.easeCubicOut)
        .call(zoomBehaviorRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
    },
    [miniMapData.bounds, currentTransform, containerDimensions, getUnobstructedViewport, selectedNode]
  );

  return (
    <div
      className={`h-full w-full relative flex flex-col text-[13px] leading-relaxed select-none overflow-hidden ${
        isFullscreen ? 'focused-view' : ''
      }`}
    >
      {/* Center Floating Astronomical Coordinates HUD */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none">
        {selectedNode ? (
          <div className="bg-[#FAF8F2]/90 backdrop-blur-md border border-[var(--border-parchment)] shadow-xs rounded-full px-3.5 py-1 flex items-center gap-2.5 truncate">
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                selectedNode.hierarchy === "core"
                  ? "bg-[var(--accent-terracotta)] animate-pulse"
                  : selectedNode.hierarchy === "subtopic"
                  ? "bg-[var(--accent-brass)]"
                  : "bg-[var(--accent-midnight)]"
              }`}
            />
            <span className="serif text-xs font-semibold text-[var(--ink-primary)] leading-none truncate max-w-[170px]">
              {selectedNode.label}
            </span>
            <span className="w-px h-2.5 bg-[var(--border-parchment)] shrink-0" />
            <span className="mono text-[10px] text-[var(--ink-tertiary)] shrink-0">
              {selectedNode.coords}
            </span>
            <span className="mono text-[9px] text-[var(--accent-midnight)] bg-[var(--bg-panel-subtle)] px-1.5 py-0.5 rounded-full border border-[var(--border-parchment)] font-medium shrink-0">
              {selectedNode.catalog}
            </span>
          </div>
        ) : (
          <div className="text-[11px] text-[var(--ink-tertiary)] mono px-3 py-1 rounded-full bg-[#FAF8F2]/75 backdrop-blur-xs border border-[var(--border-parchment)]/60 shadow-2xs">
            Click a star to focus coordinates · Drag canvas to chart
          </div>
        )}
      </div>

      {/* ================= UPPER-RIGHT VERTICAL ACTION RAIL ================= */}
      <div
        id="observatory-action-rail"
        data-testid="observatory-action-rail"
        role="toolbar"
        aria-label="Observatory Actions"
        className={`absolute top-4 ${
          isRightSidebarOpen && selectedNode ? 'right-[420px]' : 'right-6'
        } z-30 pointer-events-auto flex flex-col items-center gap-1.5 bg-[#FAF8F2]/95 backdrop-blur-md border border-[var(--border-strong)] rounded-xl p-1.5 shadow-sm transition-all duration-300 select-none`}
      >
        {/* 1. Focus / Fullscreen Mode */}
        {onToggleFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            data-testid="observatory-focus-btn"
            className="w-8 h-8 rounded-lg bg-white hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] flex items-center justify-center shadow-2xs transition-all active:scale-95 cursor-pointer"
            title={isFullscreen ? "Exit Fullscreen Focus (Shift+F)" : "Enter Fullscreen Focus (Shift+F)"}
            aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen Focus"}
          >
            <i
              className={`ph-bold ${
                isFullscreen ? "ph-corners-in" : "ph-corners-out"
              } text-sm text-[var(--accent-terracotta)]`}
            />
          </button>
        )}

        {/* 2. Connect Two Entities */}
        <button
          type="button"
          onClick={() => setIsRelationshipEditorOpen(true)}
          data-testid="connect-entities-btn"
          className="w-8 h-8 rounded-lg bg-white hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] flex items-center justify-center shadow-2xs transition-all active:scale-95 cursor-pointer"
          title="Connect Two Entities (C)"
          aria-label="Connect Two Entities"
        >
          <i className="ph ph-arrows-split text-sm text-[var(--accent-terracotta)]" />
        </button>

        {/* 3. More options (⋮) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsMoreMenuOpen((prev) => !prev)}
            data-testid="observatory-overflow-btn"
            className={`w-8 h-8 rounded-lg border text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] flex items-center justify-center transition-all shadow-2xs active:scale-95 cursor-pointer ${
              isMoreMenuOpen
                ? 'bg-[var(--bg-panel-subtle)] border-[var(--border-strong)] text-[var(--ink-primary)]'
                : 'bg-white hover:bg-[var(--bg-panel-subtle)] border-[var(--border-parchment)]'
            }`}
            title="More Options"
            aria-label="More Graph Options"
          >
            <i className="ph-bold ph-dots-three-vertical text-sm" />
          </button>

          {/* Overflow Menu Dropdown */}
          {isMoreMenuOpen && (
            <div
              data-testid="observatory-overflow-menu"
              className="absolute right-0 mt-2 w-52 bg-[#FAF8F2]/98 backdrop-blur-md border border-[var(--border-strong)] rounded-xl shadow-lg p-1.5 z-50 text-xs animate-fade-in select-none"
            >
              {/* Add Entity */}
              <button
                type="button"
                onClick={() => {
                  setIsEntityEditorOpen(true);
                  setIsMoreMenuOpen(false);
                }}
                data-testid="add-entity-btn"
                className="w-full text-left px-2.5 py-1.5 hover:bg-[var(--bg-panel-subtle)] flex items-center justify-between text-[var(--ink-primary)] cursor-pointer rounded-lg transition-colors"
                title="Add Entity to Knowledge Sky (A)"
              >
                <div className="flex items-center gap-2">
                  <i className="ph ph-plus text-xs text-[var(--accent-brass)]" />
                  <span className="font-medium">Add Entity</span>
                </div>
                <span className="mono text-[10px] text-[var(--ink-tertiary)] bg-black/5 px-1.5 py-0.5 rounded">A</span>
              </button>

              {/* Saved Views */}
              <button
                type="button"
                onClick={() => {
                  setIsSavedViewsModalOpen(true);
                  setIsMoreMenuOpen(false);
                }}
                data-testid="saved-views-btn"
                className="w-full text-left px-2.5 py-1.5 hover:bg-[var(--bg-panel-subtle)] flex items-center gap-2 text-[var(--ink-primary)] cursor-pointer rounded-lg transition-colors"
                title="Saved Observatory Views"
              >
                <i className="ph ph-bookmarks text-xs text-[var(--accent-terracotta)]" />
                <span>Saved Views</span>
              </button>

              {/* Export View */}
              <button
                type="button"
                onClick={() => {
                  handleExportView();
                  setIsMoreMenuOpen(false);
                }}
                data-testid="export-view-btn"
                className="w-full text-left px-2.5 py-1.5 hover:bg-[var(--bg-panel-subtle)] flex items-center gap-2 text-[var(--ink-primary)] cursor-pointer rounded-lg transition-colors"
                title="Export Observatory SVG"
              >
                <i className="ph ph-download-simple text-xs text-[var(--accent-midnight)]" />
                <span>Export View (SVG)</span>
              </button>

              <div className="my-1 border-t border-[var(--border-parchment)]" />

              {/* Graph Settings Section */}
              <div className="px-2.5 py-1 text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-tertiary)]">
                Graph Settings
              </div>

              <button
                type="button"
                onClick={() => setShowAtlasPlate((p) => !p)}
                className="w-full text-left px-2.5 py-1.5 hover:bg-[var(--bg-panel-subtle)] flex items-center justify-between text-[var(--ink-primary)] cursor-pointer rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2">
                  <i className="ph ph-newspaper text-xs text-[var(--accent-midnight)]" />
                  <span>Atlas Plate</span>
                </div>
                {showAtlasPlate && <i className="ph-bold ph-check text-xs text-[var(--accent-terracotta)]" />}
              </button>

              <button
                type="button"
                onClick={() => setShowGraticule((p) => !p)}
                className="w-full text-left px-2.5 py-1.5 hover:bg-[var(--bg-panel-subtle)] flex items-center justify-between text-[var(--ink-primary)] cursor-pointer rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2">
                  <i className="ph ph-grid-four text-xs text-[var(--accent-brass)]" />
                  <span>Coordinates Grid</span>
                </div>
                {showGraticule && <i className="ph-bold ph-check text-xs text-[var(--accent-terracotta)]" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsSuggestionsOpen(true);
                  setIsMoreMenuOpen(false);
                }}
                className="w-full text-left px-2.5 py-1.5 hover:bg-[var(--bg-panel-subtle)] flex items-center gap-2 text-[var(--ink-primary)] cursor-pointer rounded-lg transition-colors"
              >
                <i className="ph ph-sparkle text-xs text-[var(--accent-terracotta)]" />
                <span>Link Suggestions</span>
              </button>

              <div className="my-1 border-t border-[var(--border-parchment)]" />

              {/* Untangle / Organize */}
              <button
                type="button"
                onClick={() => {
                  handleUntangle();
                  setIsMoreMenuOpen(false);
                }}
                className="w-full text-left px-2.5 py-1.5 hover:bg-[var(--bg-panel-subtle)] flex items-center justify-between text-[var(--ink-primary)] cursor-pointer rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2">
                  <i className="ph-bold ph-magic-wand text-xs text-[var(--accent-terracotta)]" />
                  <span>Untangle Layout</span>
                </div>
                <span className="mono text-[10px] text-[var(--ink-tertiary)] bg-black/5 px-1.5 py-0.5 rounded">U</span>
              </button>

              {/* Reset View */}
              <button
                type="button"
                onClick={() => {
                  handleFitView();
                  setIsMoreMenuOpen(false);
                }}
                data-testid="reset-view-menu-item"
                className="w-full text-left px-2.5 py-1.5 hover:bg-[var(--bg-panel-subtle)] flex items-center justify-between text-[var(--ink-primary)] cursor-pointer rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2">
                  <i className="ph-bold ph-frame-corners text-xs text-[var(--ink-secondary)]" />
                  <span>Reset View</span>
                </div>
                <span className="mono text-[10px] text-[var(--ink-tertiary)] bg-black/5 px-1.5 py-0.5 rounded">F</span>
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Archival paper grain texture */}
      <div className="paper-grain" />

      {/* Celestial Archive Background with authentic copperplate celestial atlas engraving */}
      <div className="celestial-archive-bg">
        <div
          className="engraved-atlas-plate"
          style={{
            backgroundImage: `url(${celestialAtlasPlate})`,
            display: showAtlasPlate ? 'block' : 'none',
          }}
        />
        <svg
          ref={graticuleRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-[1]"
          style={{ display: showGraticule ? 'block' : 'none' }}
        />
      </div>

      {/* D3 Observatory Knowledge Constellation Graph */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full z-0" />

      {/* Honest Target Resolution Notification Banner (§10) */}
      {targetResolutionNotice && (
        <div className="absolute top-18 left-1/2 -translate-x-1/2 z-40 pointer-events-auto max-w-lg w-full px-4 animate-fade-in">
          <div className="card-surface p-3 border border-[var(--border-terracotta)] bg-[#FAF8F2] shadow-lg rounded-xl flex items-center justify-between gap-3 text-xs text-[var(--ink-primary)]">
            <div className="flex items-center gap-2.5">
              <i className="ph ph-warning-circle text-[var(--accent-terracotta)] text-base shrink-0" />
              <span>{targetResolutionNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setTargetResolutionNotice(null)}
              className="p-1 rounded text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-panel-subtle)] transition-colors cursor-pointer"
              title="Dismiss notice"
            >
              <i className="ph ph-x text-xs" />
            </button>
          </div>
        </div>
      )}

      {/* Empty State when all concepts are hidden by active filters */}
      {!isLoading && celestialNodes.length > 0 && visibleNodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-15 pointer-events-auto bg-[#FAF8F2]/60 backdrop-blur-xs select-none">
          <div className="instrument-panel max-w-sm p-6 text-center flex flex-col items-center gap-3 bg-white/95 shadow-lg border border-[var(--border-parchment)] rounded-xl">
            <div className="w-12 h-12 rounded-full bg-[var(--bg-panel-subtle)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--accent-terracotta)] text-xl mb-1">
              <i className="ph ph-funnel-simple-x" />
            </div>
            <h3 className="serif text-xl font-semibold text-[var(--ink-primary)]">
              No Concepts Match Active Filters
            </h3>
            <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
              All concepts have been hidden by the active constellation filter settings.
            </p>
            <button
              type="button"
              onClick={() => {
                setFilterHubs(true);
                setFilterConcepts(true);
                setFilterCrossLinks(true);
                setSelectedClusterId(null);
              }}
              className="mt-1 px-4 py-1.5 rounded-full bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] text-xs font-medium transition-all shadow-2xs cursor-pointer active:scale-95"
            >
              Reset Filters
            </button>
          </div>
        </div>
      )}

      {/* Honest Empty State when Workspace Graph is Empty */}
      {!isLoading && celestialNodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-auto bg-[#FAF8F2]/60 backdrop-blur-xs">
          <div className="instrument-panel max-w-md p-6 text-center flex flex-col items-center gap-3 bg-white/95 shadow-lg">
            <div className="panel-bracket-tl" />
            <div className="panel-bracket-br" />
            <div className="w-12 h-12 rounded-full bg-[var(--bg-panel-subtle)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--accent-terracotta)] text-xl mb-1">
              <i className="ph ph-compass" />
            </div>
            <h3 className="serif text-xl font-semibold text-[var(--ink-primary)]">
              The Knowledge Sky is Uncharted
            </h3>
            <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
              No concepts or relationships have been extracted yet in this workspace. Ingest notes or
              trigger extraction in the Library to illuminate the celestial observatory.
            </p>
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={() => onNavigateToDestination?.('library')}
                className="px-4 py-2 bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] text-xs font-medium rounded-lg flex items-center gap-2 shadow-2xs cursor-pointer transition-colors"
              >
                <i className="ph ph-books text-xs" />
                <span>Go to Library</span>
              </button>
              <button
                type="button"
                onClick={() => setIsEntityEditorOpen(true)}
                className="px-4 py-2 border border-[var(--border-strong)] hover:bg-[var(--bg-panel-subtle)] text-xs font-medium rounded-lg text-[var(--ink-primary)] flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <i className="ph ph-plus text-xs" />
                <span>+ Add Entity</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Reopen Left Edge Tab */}
      {!isLeftSidebarOpen && (
        <div id="reopen-left-sidebar" className="absolute top-4 left-0 z-20 pointer-events-auto">
          <button
            type="button"
            onClick={() => setIsLeftSidebarOpen(true)}
            className="bg-[var(--bg-panel)]/95 hover:bg-white backdrop-blur-md border border-l-0 border-[var(--border-strong)] rounded-r-xl shadow-md py-2 px-3 flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)] transition-all active:scale-95 group cursor-pointer"
            title="Expand Constellations Panel"
          >
            <svg
              className="w-4 h-4 text-[var(--accent-midnight)] group-hover:scale-110 transition-transform"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M9 3v18" />
              <path d="m11 9 3 3-3 3" />
            </svg>
            <span className="serif-italic font-medium">Constellations</span>
          </button>
        </div>
      )}

      {/* Persistent Reopen Right Edge Tab */}
      {!isRightSidebarOpen && selectedNode && (
        <div id="reopen-right-sidebar" className="absolute top-4 right-0 z-20 pointer-events-auto">
          <button
            type="button"
            onClick={() => setIsRightSidebarOpen(true)}
            className="bg-[var(--bg-panel)]/95 hover:bg-white backdrop-blur-md border border-r-0 border-[var(--border-strong)] rounded-l-xl shadow-md py-2 px-3 flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)] transition-all active:scale-95 group cursor-pointer"
            title="Expand Knowledge Dossier"
          >
            <span className="serif-italic font-medium">Dossier</span>
            <svg
              className="w-4 h-4 text-[var(--accent-midnight)] group-hover:scale-110 transition-transform"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M15 3v18" />
              <path d="m14 9-3 3 3 3" />
            </svg>
          </button>
        </div>
      )}

      {/* ================= LEFT SIDEBAR (CONSTELLATIONS & FILTERS) ================= */}
      {isLeftSidebarOpen && (
        <aside
          id="left-sidebar"
          className="sidebar-transition absolute top-4 left-4 sm:left-6 w-[280px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-100px)] z-20 flex flex-col pointer-events-none"
        >
          <div className="instrument-panel flex-1 flex flex-col pointer-events-auto overflow-hidden">
            <div className="panel-bracket-tl" />
            <div className="panel-bracket-br" />

            {/* Header with PanelLeftClose icon */}
            <div className="px-4 py-3 border-b border-[var(--border-parchment)] bg-[var(--bg-panel-subtle)] flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.2em] font-medium text-[var(--ink-secondary)] flex items-center gap-2">
                <i className="ph ph-compass-tool text-xs text-[var(--accent-midnight)]" />
                <span>Hyades Constellations</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsLeftSidebarOpen(false)}
                  className="w-6 h-6 rounded flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white transition-colors cursor-pointer"
                  title="Collapse Constellations Panel"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="18" x="3" y="3" rx="2" />
                    <path d="M9 3v18" />
                    <path d="m14 9-3 3 3 3" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              {/* Real Clusters / Constellations */}
              {(() => {
                const sidebarConstellations =
                  clusters.length > 0
                    ? clusters.map((c) => ({
                        id: c.id,
                        key: `cluster_${c.id}`,
                        label: c.label,
                      }))
                    : resolvedClusters
                        .filter((rc) => !rc.isPeripheralPool)
                        .map((rc) => ({
                          id: rc.id,
                          key: rc.key,
                          label: rc.isDerived ? `${rc.displayTitle} Sector` : rc.label,
                        }));

                return (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] uppercase tracking-[0.18em] font-medium text-[var(--ink-secondary)]">
                        Constellations ({sidebarConstellations.length || celestialNodes.length})
                      </span>
                      {selectedClusterId && (
                        <button
                          type="button"
                          onClick={() => setSelectedClusterId(null)}
                          className="text-[10px] text-[var(--accent-terracotta)] hover:underline cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-1">
                      {sidebarConstellations.length > 0 ? (
                        sidebarConstellations.map((cl) => {
                          const starCount = celestialNodes.filter(
                            (n) =>
                              (n.clusterId === cl.id ||
                                n.clusterKey === cl.id ||
                                n.clusterKey === cl.key ||
                                n.clusterKey === `cluster_${cl.id}`) &&
                              isNodeVisible(n, filterHubs, filterConcepts, null)
                          ).length;
                          const isSelectedCluster = selectedClusterId === cl.id;
                          return (
                            <button
                              key={cl.id}
                              type="button"
                              onClick={() =>
                                setSelectedClusterId(isSelectedCluster ? null : cl.id)
                              }
                              className={`w-full text-left p-2 rounded-lg border transition-all flex items-center justify-between cursor-pointer ${
                                isSelectedCluster
                                  ? 'bg-[#F4EAE0]/75 border-[var(--accent-terracotta)]/60 shadow-2xs'
                                  : 'hover:bg-white/80 border-transparent hover:border-[var(--border-parchment)]'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate min-w-0 flex-1">
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${
                                    isSelectedCluster
                                      ? 'bg-[var(--accent-terracotta)]'
                                      : 'bg-[var(--accent-midnight)]'
                                  }`}
                                />
                                <span className="text-xs font-medium text-[var(--ink-primary)] truncate">
                                  {cl.label}
                                </span>
                              </div>
                              <span className="text-[10px] mono text-[var(--ink-tertiary)] shrink-0 ml-1.5">
                                {starCount} {starCount === 1 ? 'star' : 'stars'}
                              </span>
                            </button>
                          );
                        })
                      ) : (
                        celestialNodes.slice(0, 8).map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => setSelectedNode(n)}
                            className={`w-full text-left p-2 rounded-lg border transition-all flex items-center justify-between cursor-pointer ${
                              selectedNode?.id === n.id
                                ? 'bg-white border-[var(--accent-terracotta)] shadow-2xs'
                                : 'hover:bg-white/80 border-transparent hover:border-[var(--border-parchment)]'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  n.hierarchy === 'core'
                                    ? 'bg-[var(--accent-terracotta)]'
                                    : n.hierarchy === 'subtopic'
                                    ? 'bg-[var(--accent-brass)]'
                                    : 'bg-[var(--ink-secondary)]'
                                }`}
                              />
                              <span className="text-xs font-medium text-[var(--ink-primary)] truncate">
                                {n.label}
                              </span>
                            </div>
                            <span className="text-[10px] mono text-[var(--ink-tertiary)]">
                              {n.degree} links
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Constellation Filters */}
              <div className="pt-3 border-t border-[var(--border-parchment)]">
                <span className="text-[10px] uppercase tracking-[0.18em] font-medium text-[var(--ink-secondary)] mb-2 block">
                  Constellation Filters
                </span>

                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center justify-between py-1 cursor-pointer">
                    <span className="flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)]">
                      <svg width="12" height="12" viewBox="-8 -8 16 16" fill="var(--accent-terracotta)">
                        <path d="M 0 -8 L 2 -2 L 8 0 L 2 2 L 0 8 L -2 2 L -8 0 L -2 -2 Z" />
                      </svg>
                      Core Concepts
                    </span>
                    <input
                      type="checkbox"
                      checked={filterHubs}
                      onChange={(e) => setFilterHubs(e.target.checked)}
                      className="rounded accent-[var(--accent-midnight)] cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between py-1 cursor-pointer">
                    <span className="flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)]">
                      <svg width="10" height="10" viewBox="-5 -5 10 10" fill="var(--accent-brass)">
                        <path d="M 0 -4 Q 1 -1 4 0 Q 1 1 0 4 Q -1 1 -4 0 Q -1 -1 0 -4 Z" />
                      </svg>
                      Subtopics & Concepts
                    </span>
                    <input
                      type="checkbox"
                      checked={filterConcepts}
                      onChange={(e) => setFilterConcepts(e.target.checked)}
                      className="rounded accent-[var(--accent-midnight)] cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between py-1 cursor-pointer">
                    <span className="flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)]">
                      <svg
                        width="11"
                        height="11"
                        viewBox="-6 -6 12 12"
                        fill="none"
                        stroke="var(--ink-secondary)"
                        strokeWidth="1.25"
                      >
                        <path d="M 0 -4.5 L 4.5 0 L 0 4.5 L -4.5 0 Z" />
                      </svg>
                      Cross-Constellation Links
                    </span>
                    <input
                      type="checkbox"
                      data-testid="filter-cross-links-checkbox"
                      checked={filterCrossLinks}
                      onChange={(e) => setFilterCrossLinks(e.target.checked)}
                      className="rounded accent-[var(--accent-midnight)] cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* ================= VERTICAL GRAPH CONTROLS (APPROVED DESIGN) ================= */}
      <div
        id="graph-controls"
        className={`absolute bottom-6 z-20 pointer-events-auto flex flex-col items-center gap-1 bg-[var(--bg-panel)]/95 backdrop-blur-md border border-[var(--border-strong)] rounded-xl p-1 shadow-sm w-9 transition-all duration-300 ${
          isRightSidebarOpen && selectedNode ? 'right-4 lg:right-[420px]' : 'right-6'
        }`}
      >
        <button
          type="button"
          onClick={() => handleZoom(1.25)}
          data-testid="zoom-in-btn"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
          title="Zoom In (+)"
          aria-label="Zoom In"
        >
          <i className="ph-bold ph-plus text-xs" />
        </button>

        <button
          type="button"
          onClick={() => handleZoom(0.8)}
          data-testid="zoom-out-btn"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
          title="Zoom Out (-)"
          aria-label="Zoom Out"
        >
          <i className="ph-bold ph-minus text-xs" />
        </button>

        {/* Reset View / Fit to Content */}
        <button
          type="button"
          onClick={handleFitView}
          data-testid="fit-view-btn"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--accent-terracotta)] transition-colors cursor-pointer"
          title="Fit View to Content (F)"
          aria-label="Fit View to Content"
        >
          <i className="ph-bold ph-frame-corners text-xs" />
        </button>

        {/* Focus / Fullscreen Mode */}
        {onToggleFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            data-testid="fullscreen-btn"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--accent-terracotta)] transition-colors cursor-pointer"
            title={isFullscreen ? "Exit Fullscreen Focus (Shift+F)" : "Enter Fullscreen Focus (Shift+F)"}
            aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen Focus"}
          >
            <i
              className={`ph-bold ${
                isFullscreen ? "ph-corners-in" : "ph-corners-out"
              } text-xs text-[var(--accent-terracotta)]`}
            />
          </button>
        )}

        <div className="w-5 h-px bg-[var(--border-parchment)] my-0.5" />

        {/* Untangle / Organize Graph */}
        <button
          type="button"
          onClick={handleUntangle}
          data-testid="untangle-graph-btn"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--accent-terracotta)] transition-colors cursor-pointer"
          title="Untangle / Organize (U)"
          aria-label="Untangle Constellations"
        >
          <i className="ph-bold ph-magic-wand text-xs text-[var(--accent-terracotta)]" />
        </button>

        {/* Toggle Atlas Plate */}
        <button
          type="button"
          onClick={() => setShowAtlasPlate((prev) => !prev)}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
            showAtlasPlate
              ? 'text-[var(--accent-midnight)] bg-[var(--bg-panel-subtle)]'
              : 'text-[var(--ink-tertiary)] hover:text-[var(--ink-secondary)]'
          }`}
          title="Toggle Archival Atlas Plate"
          aria-label="Toggle Atlas Plate"
        >
          <i className="ph-bold ph-newspaper-clipping text-xs" />
        </button>

        {/* Toggle Coordinates Grid */}
        <button
          type="button"
          onClick={() => setShowGraticule((prev) => !prev)}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
            showGraticule
              ? 'text-[var(--accent-midnight)] bg-[var(--bg-panel-subtle)]'
              : 'text-[var(--ink-tertiary)] hover:text-[var(--ink-secondary)]'
          }`}
          title="Toggle Celestial Coordinates"
          aria-label="Toggle Coordinates Grid"
        >
          <i className="ph-bold ph-grid-four text-xs" />
        </button>
      </div>

      {/* ================= RIGHT KNOWLEDGE DOSSIER PANEL (EXTENDS UPWARD) ================= */}
      {isRightSidebarOpen && selectedNode && (
        <aside
          id="right-sidebar"
          className="sidebar-transition absolute top-4 right-4 sm:right-6 bottom-6 w-[390px] max-w-[calc(100vw-2rem)] z-20 flex flex-col pointer-events-none"
        >
          <div className="instrument-panel flex-1 flex flex-col pointer-events-auto overflow-hidden shadow-lg border border-[var(--border-strong)] bg-white/95">
            <div className="panel-bracket-tl" />
            <div className="panel-bracket-br" />

            {/* Panel Header */}
            <div className="p-6 border-b border-[var(--border-parchment)] bg-white relative">
              <button
                type="button"
                onClick={() => setIsRightSidebarOpen(false)}
                className="absolute top-5 right-5 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
                title="Collapse Knowledge Dossier"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M15 3v18" />
                  <path d="m10 9 3 3-3 3" />
                </svg>
              </button>

              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-panel-subtle)] text-[10px] text-[var(--ink-secondary)] font-semibold tracking-wider uppercase mono mb-3">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    selectedNode.hierarchy === 'core'
                      ? 'bg-[var(--accent-terracotta)]'
                      : selectedNode.hierarchy === 'subtopic'
                      ? 'bg-[var(--accent-brass)]'
                      : 'bg-[var(--accent-midnight)]'
                  }`}
                />
                <span>
                  {selectedNode.hierarchy === 'core'
                    ? 'Primary Core Concept'
                    : selectedNode.hierarchy === 'subtopic'
                    ? 'Subtopic Dossier'
                    : 'Concept Star Dossier'}
                </span>
              </div>

              {/* Node Title */}
              <h2 className="serif text-3xl font-semibold text-[var(--ink-primary)] tracking-tight leading-tight mb-2">
                {selectedNode.label}
              </h2>

              {/* Context & Classification */}
              <div className="flex items-center gap-3 text-xs text-[var(--ink-secondary)]">
                <span className="flex items-center gap-1.5">
                  <i className="ph ph-compass text-[var(--accent-terracotta)]" />{' '}
                  {selectedNode.hierarchy === 'core'
                    ? 'Central Core'
                    : selectedNode.hierarchy === 'subtopic'
                    ? 'Subtopic Node'
                    : 'Concept Star'}
                </span>
                <span className="w-1 h-1 rounded-full bg-[var(--border-strong)]" />
                <span className="mono text-[11px] text-[var(--accent-midnight)] font-medium">
                  {selectedNode.degree} Connections
                </span>
              </div>
            </div>

            {/* Scrollable Context & Connections */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              {/* Abstract */}
              <div>
                <p className="text-[13px] leading-relaxed text-[var(--ink-archival)]">
                  {selectedNode.desc}
                </p>
              </div>

              {/* Local Constellation Links */}
              <div>
                <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-1.5 mb-3">
                  <h3 className="serif-italic text-lg font-medium text-[var(--ink-primary)]">
                    Local Constellation
                  </h3>
                  <span className="text-[10px] mono text-[var(--ink-tertiary)]">
                    {selectedNode.connections.length} ACTIVE PATHWAYS
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {selectedNode.connections.length > 0 ? (
                    selectedNode.connections.map((conn, idx) => (
                      <div
                        key={`${conn.id}-${conn.type}-${idx}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          const target = celestialNodes.find((n) => n.id === conn.id);
                          if (target) setSelectedNode(target);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            const target = celestialNodes.find((n) => n.id === conn.id);
                            if (target) setSelectedNode(target);
                          }
                        }}
                        className="card-surface p-2.5 flex items-center justify-between cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)]"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-terracotta)]" />
                          <div>
                            <div className="text-xs font-medium text-[var(--ink-primary)] group-hover:underline">
                              {conn.name}
                            </div>
                            <div className="text-[10px] text-[var(--ink-tertiary)] mono">
                              {conn.type}
                            </div>
                          </div>
                        </div>
                        <span className="mono text-[10px] text-[var(--ink-secondary)]" title="Relationship weight">
                          {(parseFloat(conn.corr) * 100).toFixed(0)}% weight
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 rounded-lg bg-[var(--bg-panel-subtle)] text-xs text-[var(--ink-tertiary)] italic">
                      No direct relationships recorded yet for this concept.
                    </div>
                  )}
                </div>
              </div>

              {/* Knowledge Health / Degree metrics */}
              <div className="bg-[var(--bg-panel-subtle)] p-3 rounded-lg border border-[var(--border-parchment)] text-xs">
                <div className="text-[10px] uppercase tracking-[0.2em] font-medium text-[var(--ink-secondary)] mb-2">
                  Knowledge Metrics
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] mono">
                  <div>
                    <span className="text-[var(--ink-tertiary)]">Catalog:</span>{' '}
                    <span className="text-[var(--ink-primary)]">{selectedNode.catalog}</span>
                  </div>
                  <div>
                    <span className="text-[var(--ink-tertiary)]">Degree:</span>{' '}
                    <span className="text-[var(--ink-primary)]">{selectedNode.degree}</span>
                  </div>
                  <div>
                    <span className="text-[var(--ink-tertiary)]">Notes:</span>{' '}
                    <span className="text-[var(--ink-primary)]">{selectedNode.noteCount}</span>
                  </div>
                  <div>
                    <span className="text-[var(--ink-tertiary)]">Cluster:</span>{' '}
                    <span className="text-[var(--ink-primary)]">Sector {selectedNode.group}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-[var(--border-parchment)] bg-white flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (onNavigateToStella) {
                    onNavigateToStella({
                      prompt: `Explain how the concept "${selectedNode.label}" connects to other topics in my knowledge base and what key insights are associated with it.`,
                      entityIds: [selectedNode.id],
                      entityNames: [selectedNode.label],
                    });
                  } else {
                    onNavigateToDestination?.('stella');
                  }
                }}
                className="flex-1 bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] transition-colors py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
              >
                <i className="ph ph-sparkle text-[var(--accent-brass)]" />
                <span>Consult Stella on Concept</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateToDestination?.('library')}
                className="p-2 border border-[var(--border-strong)] rounded-lg text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-panel-subtle)] transition-colors cursor-pointer"
                title="View in Library"
              >
                <i className="ph ph-books text-sm" />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* ================= ASTRONOMICAL ORIENTATION AID (MINI CHART INSET) (§1.E, §8) ================= */}
      {celestialNodes.length > 0 && (
        <div
          id="celestial-orientation-inset"
          className={`absolute bottom-6 z-20 pointer-events-auto transition-all duration-300 ${
            isLeftSidebarOpen ? 'left-[304px]' : 'left-6'
          }`}
        >
          <div
            className={`instrument-panel bg-[#FAF8F2]/95 backdrop-blur-md border border-[var(--border-strong)] rounded-xl p-3 shadow-md flex flex-col gap-2 transition-all duration-300 ${
              isMinimapExpanded ? 'w-[364px]' : 'w-[146px]'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between text-[10px] mono uppercase tracking-[0.14em] text-[var(--ink-secondary)]">
              <span className="flex items-center gap-1.5 font-semibold">
                <i className="ph ph-compass text-[var(--accent-midnight)] text-xs" />
                {isMinimapExpanded ? 'Astronomical Sky Chart' : 'Chart Inset'}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-[var(--ink-tertiary)] mono">
                  {visibleNodes.length}★
                </span>
                <button
                  type="button"
                  onClick={() => setIsMinimapExpanded((prev) => !prev)}
                  className="p-1 rounded hover:bg-[var(--bg-panel-subtle)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
                  title={isMinimapExpanded ? 'Collapse chart inset' : 'Expand astronomical chart inset'}
                >
                  <i className={`ph ${isMinimapExpanded ? 'ph-arrows-in-simple' : 'ph-arrows-out-simple'} text-xs`} />
                </button>
              </div>
            </div>

            {isMinimapExpanded && (
              <div className="text-[10px] text-[var(--ink-tertiary)] flex items-center justify-between -mt-1 pb-1 border-b border-[var(--border-parchment)]">
                <span>Click region to pan camera</span>
                <span className="mono">Esc to close</span>
              </div>
            )}

            <svg
              className={`w-full rounded border border-[var(--border-parchment)] bg-[#F5F2E9]/70 cursor-crosshair transition-all duration-300 ${
                isMinimapExpanded ? 'h-[210px]' : 'h-[74px]'
              }`}
              viewBox={`0 0 ${isMinimapExpanded ? 340 : 126} ${isMinimapExpanded ? 210 : 74}`}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;
                handleMiniMapClick(
                  clickX,
                  clickY,
                  isMinimapExpanded ? 340 : 126,
                  isMinimapExpanded ? 210 : 74
                );
              }}
            >
              {/* Subtle astronomical grid graticules */}
              {isMinimapExpanded ? (
                <>
                  <circle cx="170" cy="105" r="95" fill="none" stroke="#4A3E3D" strokeOpacity="0.08" strokeDasharray="3,3" />
                  <circle cx="170" cy="105" r="55" fill="none" stroke="#4A3E3D" strokeOpacity="0.08" strokeDasharray="3,3" />
                  <line x1="170" y1="10" x2="170" y2="200" stroke="#4A3E3D" strokeOpacity="0.06" strokeDasharray="2,2" />
                  <line x1="15" y1="105" x2="325" y2="105" stroke="#4A3E3D" strokeOpacity="0.06" strokeDasharray="2,2" />
                </>
              ) : (
                <>
                  <circle cx="63" cy="37" r="30" fill="none" stroke="#4A3E3D" strokeOpacity="0.08" strokeDasharray="2,2" />
                  <circle cx="63" cy="37" r="16" fill="none" stroke="#4A3E3D" strokeOpacity="0.08" strokeDasharray="2,2" />
                </>
              )}

              {/* Cluster Labels in Expanded Mode */}
              {isMinimapExpanded &&
                miniMapData.clusters.map((c) => (
                  <text
                    key={c.key}
                    x={c.cx}
                    y={c.cy - 12}
                    textAnchor="middle"
                    fontFamily="Inter, sans-serif"
                    fontSize="9.5px"
                    fontWeight="600"
                    fill="var(--ink-secondary)"
                    opacity="0.85"
                    className="pointer-events-none uppercase tracking-wider"
                  >
                    {c.label.length > 18 ? c.label.slice(0, 16) + '...' : c.label}
                  </text>
                ))}

              {/* Plotted miniature nodes */}
              {miniMapData.nodes.map((n) => (
                <circle
                  key={n.id}
                  className="minimap-star-dot"
                  cx={n.mx}
                  cy={n.my}
                  r={n.r}
                  fill={n.color}
                  opacity={n.opacity}
                />
              ))}

              {/* Selected Entity Reticle Crosshairs */}
              {miniMapData.selectedPoint && (
                <g className="pointer-events-none">
                  <circle
                    cx={miniMapData.selectedPoint.mx}
                    cy={miniMapData.selectedPoint.my}
                    r={isMinimapExpanded ? 7 : 4.5}
                    fill="none"
                    stroke="#BD532B"
                    strokeWidth="1.2"
                  />
                  <line
                    x1={miniMapData.selectedPoint.mx - (isMinimapExpanded ? 11 : 7)}
                    y1={miniMapData.selectedPoint.my}
                    x2={miniMapData.selectedPoint.mx + (isMinimapExpanded ? 11 : 7)}
                    y2={miniMapData.selectedPoint.my}
                    stroke="#BD532B"
                    strokeWidth="1"
                  />
                  <line
                    x1={miniMapData.selectedPoint.mx}
                    y1={miniMapData.selectedPoint.my - (isMinimapExpanded ? 11 : 7)}
                    x2={miniMapData.selectedPoint.mx}
                    y2={miniMapData.selectedPoint.my + (isMinimapExpanded ? 11 : 7)}
                    stroke="#BD532B"
                    strokeWidth="1"
                  />
                </g>
              )}

              {/* Viewport Boundary Frame */}
              {miniMapData.viewport && (
                <rect
                  x={miniMapData.viewport.x}
                  y={miniMapData.viewport.y}
                  width={miniMapData.viewport.w}
                  height={miniMapData.viewport.h}
                  fill="rgba(189, 83, 43, 0.08)"
                  stroke="#BD532B"
                  strokeWidth={isMinimapExpanded ? '1.2' : '0.85'}
                  strokeDasharray="3,2"
                  rx="1"
                />
              )}
            </svg>
          </div>
        </div>
      )}

      {/* ================= BOTTOM SEARCH / FILTER BAR WITH PARTIAL MATCH CANDIDATES (§2) ================= */}
      <div
        id="search-bar-container"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto w-full max-w-md px-4"
      >
        <div className="relative">
          {/* Matching Candidates Popup */}
          {(isSearchFocused || searchQuery.trim().length > 0) && searchCandidates.length > 0 && (
            <div className="absolute bottom-full mb-2 left-0 right-0 bg-[#FAF8F2] border border-[var(--border-strong)] rounded-xl shadow-xl overflow-hidden z-30 animate-fade-in">
              <div className="px-3 py-1.5 border-b border-[var(--border-parchment)] bg-[var(--bg-panel-subtle)] text-[10px] mono text-[var(--ink-tertiary)] flex items-center justify-between">
                <span>{searchCandidates.length} candidate{searchCandidates.length > 1 ? 's' : ''} matched</span>
                <span>↑↓ navigate · ↵ select</span>
              </div>
              <div className="max-h-56 overflow-y-auto p-1 flex flex-col gap-0.5">
                {searchCandidates.map((candidate, idx) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onMouseDown={(e) => {
                      // onMouseDown fires before input onBlur
                      e.preventDefault();
                      handleSearchCommit(candidate);
                      setIsSearchFocused(false);
                    }}
                    onMouseEnter={() => setActiveCandidateIndex(idx)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                      activeCandidateIndex === idx
                        ? 'bg-[var(--accent-midnight)] text-[#FAF8F2]'
                        : 'hover:bg-white text-[var(--ink-primary)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          candidate.hierarchy === 'core'
                            ? 'bg-[var(--accent-terracotta)]'
                            : candidate.hierarchy === 'subtopic'
                            ? 'bg-[var(--accent-brass)]'
                            : 'bg-[var(--ink-tertiary)]'
                        }`}
                      />
                      <span className="serif text-xs font-medium truncate">
                        {candidate.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mono text-[10px] shrink-0 opacity-80">
                      <span>{candidate.catalog}</span>
                      <span>{candidate.degree} {candidate.degree === 1 ? 'link' : 'links'}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="instrument-panel bg-white/95 backdrop-blur-md px-3.5 py-2 shadow-lg border border-[var(--border-strong)] rounded-xl flex items-center gap-2.5">
            <i className="ph ph-magnifying-glass text-sm text-[var(--accent-midnight)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setActiveCandidateIndex(0);
              }}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => {
                // Delay so click on candidate registers
                setTimeout(() => setIsSearchFocused(false), 200);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (searchCandidates.length > 0) {
                    setActiveCandidateIndex((prev) => (prev + 1) % searchCandidates.length);
                  }
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (searchCandidates.length > 0) {
                    setActiveCandidateIndex((prev) => (prev - 1 + searchCandidates.length) % searchCandidates.length);
                  }
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (searchCandidates.length > 0 && searchCandidates[activeCandidateIndex]) {
                    handleSearchCommit(searchCandidates[activeCandidateIndex]);
                  } else {
                    handleSearchCommit();
                  }
                  setIsSearchFocused(false);
                  (e.currentTarget as HTMLInputElement).blur();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsSearchFocused(false);
                  setSearchQuery('');
                }
              }}
              placeholder="Search celestial constellation... (Type to explore, Enter to focus)"
              className="flex-1 bg-transparent border-none outline-none text-xs text-[var(--ink-primary)] placeholder:text-[var(--ink-tertiary)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setDebouncedSearchQuery('');
                }}
                className="text-xs text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)] cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Real Entity Editor Modal */}
      <EntityEditor
        workspaceId={workspaceId}
        isOpen={isEntityEditorOpen}
        onClose={() => setIsEntityEditorOpen(false)}
        onSave={() => {
          setIsEntityEditorOpen(false);
          fetchGraph();
        }}
      />

      {/* Real Relationship Editor Modal */}
      <RelationshipEditor
        workspaceId={workspaceId}
        isOpen={isRelationshipEditorOpen}
        availableEntities={celestialNodes.map((n) => ({ id: n.id, name: n.label }))}
        onClose={() => setIsRelationshipEditorOpen(false)}
        onSave={() => {
          setIsRelationshipEditorOpen(false);
          fetchGraph();
        }}
      />

      {/* Real Link Suggestion Panel */}
      <LinkSuggestionPanel
        workspaceId={workspaceId}
        isOpen={isSuggestionsOpen}
        onClose={() => setIsSuggestionsOpen(false)}
        onLinkCreated={() => fetchGraph()}
        onNavigateToNote={onNavigateToNote}
      />

      <SavedViewsModal
        isOpen={isSavedViewsModalOpen}
        onClose={() => setIsSavedViewsModalOpen(false)}
        workspaceId={workspaceId}
        currentState={{
          version: 1,
          zoom: currentTransform.k || 1.0,
          center: { x: currentTransform.x || 0.0, y: currentTransform.y || 0.0 },
          filters: {
            filterHubs,
            filterConcepts,
            filterCrossLinks,
            selectedClusterId,
          },
          focus_entity_ids: selectedNode ? [selectedNode.id] : [],
        }}
        onRestoreState={(restoredState, activeFocusIds) => {
          if (restoredState.filters) {
            if (typeof restoredState.filters.filterHubs === 'boolean') {
              setFilterHubs(restoredState.filters.filterHubs);
            }
            if (typeof restoredState.filters.filterConcepts === 'boolean') {
              setFilterConcepts(restoredState.filters.filterConcepts);
            }
            if (typeof restoredState.filters.filterCrossLinks === 'boolean') {
              setFilterCrossLinks(restoredState.filters.filterCrossLinks);
            }
            if (restoredState.filters.selectedClusterId !== undefined) {
              setSelectedClusterId(restoredState.filters.selectedClusterId as string | null);
            }
          }
          if (restoredState.zoom && restoredState.center && svgRef.current && zoomBehaviorRef.current) {
            svgRef.current.transition().duration(600).call(
              zoomBehaviorRef.current.transform,
              d3.zoomIdentity.translate(restoredState.center.x, restoredState.center.y).scale(restoredState.zoom)
            );
          }
          const focusId = activeFocusIds?.[0] || restoredState.focus_entity_ids?.[0];
          if (focusId && celestialNodes.length) {
            const target = celestialNodes.find((n: CelestialNode) => n.id === focusId);
            if (target) setSelectedNode(target);
          }
        }}
      />
    </div>
  );
};
