/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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

export interface CelestialNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  catalog: string;
  group: number;
  type: 'hub' | 'concept' | 'entity';
  hierarchy: 'core' | 'subtopic' | 'related';
  size: number;
  coords: string;
  desc: string;
  degree: number;
  noteCount: number;
  connections: Array<{ id: string; name: string; type: string; corr: string }>;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface CelestialLink extends d3.SimulationLinkDatum<CelestialNode> {
  source: string | CelestialNode;
  target: string | CelestialNode;
  weight: number;
  type: string;
}

function getStoredPositions(wsId: string): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  if (!wsId) return map;
  try {
    const raw = localStorage.getItem(`hyades_graph_positions_${wsId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const [id, pos] of Object.entries(parsed)) {
        if (pos && typeof (pos as any).x === 'number' && typeof (pos as any).y === 'number') {
          map.set(id, { x: (pos as any).x, y: (pos as any).y });
        }
      }
    }
  } catch {
    // Graceful fallback
  }
  return map;
}

function saveStoredPositions(wsId: string, map: Map<string, { x: number; y: number }>) {
  if (!wsId || map.size === 0) return;
  try {
    const obj: Record<string, { x: number; y: number }> = {};
    map.forEach((pos, id) => {
      obj[id] = { x: Math.round(pos.x * 10) / 10, y: Math.round(pos.y * 10) / 10 };
    });
    localStorage.setItem(`hyades_graph_positions_${wsId}`, JSON.stringify(obj));
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
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<d3.Selection<SVGSVGElement, unknown, null, undefined> | null>(null);
  const graticuleRef = useRef<SVGSVGElement>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const simulationRef = useRef<d3.Simulation<CelestialNode, CelestialLink> | null>(null);

  // Persistent node position cache to prevent layout resets and explosions
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

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

  // Dialogs / Panels
  const [isEntityEditorOpen, setIsEntityEditorOpen] = useState(false);
  const [isRelationshipEditorOpen, setIsRelationshipEditorOpen] = useState(false);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);

  // Filters
  const [filterHubs, setFilterHubs] = useState(true);
  const [filterConcepts, setFilterConcepts] = useState(true);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);

  // Focus node & search state
  const [selectedNode, setSelectedNode] = useState<CelestialNode | null>(null);
  const [targetResolutionNotice, setTargetResolutionNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

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

  // Transform backend entities & edges into Celestial nodes & links with authentic hierarchy
  const { celestialNodes, celestialLinks } = useMemo(() => {
    if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
      return { celestialNodes: [], celestialLinks: [] };
    }

    const nodesMap = new Map<string, GraphNodeResponse>();
    graphData.nodes.forEach((n) => nodesMap.set(n.id, n));

    // Calculate cluster index map
    const clusterMap: Record<string, number> = {};
    clusters.forEach((c, idx) => {
      clusterMap[c.id] = (idx % 6) + 1;
    });

    // 1. Determine graph hierarchy from degrees and connectivity
    let maxDegree = 1;
    graphData.nodes.forEach((n) => {
      const d = n.degree || 0;
      if (d > maxDegree) maxDegree = d;
    });

    // Build adjacency map for BFS depth calculation (§1)
    const adj = new Map<string, Set<string>>();
    graphData.nodes.forEach((n) => adj.set(n.id, new Set()));
    graphData.edges.forEach((e) => {
      adj.get(e.source_entity_id)?.add(e.target_entity_id);
      adj.get(e.target_entity_id)?.add(e.source_entity_id);
    });

    // 1. Sort nodes descending by degree to identify rare, dominant Core concepts
    const sortedByDegree = [...graphData.nodes].sort(
      (a, b) => (b.degree || 0) - (a.degree || 0)
    );

    const coreNodeIds = new Set<string>();
    if (sortedByDegree.length > 0 && (sortedByDegree[0].degree || 0) > 0) {
      coreNodeIds.add(sortedByDegree[0].id);
      // Secondary Core ONLY if graph is substantial and 2nd node is a distinct high-degree center
      if (
        sortedByDegree.length >= 6 &&
        (sortedByDegree[1]?.degree || 0) >= 3 &&
        (sortedByDegree[1]?.degree || 0) >= Math.floor(maxDegree * 0.8) &&
        sortedByDegree[1]?.cluster_id !== sortedByDegree[0]?.cluster_id
      ) {
        coreNodeIds.add(sortedByDegree[1].id);
      }
    }

    // 2. Breadth-First Search (BFS) to determine graph depth from Core concepts
    const depthMap = new Map<string, number>();
    const queue: string[] = [];
    coreNodeIds.forEach((id) => {
      depthMap.set(id, 0);
      queue.push(id);
    });

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const d = depthMap.get(curr)!;
      const neighbors = adj.get(curr) || new Set();
      neighbors.forEach((nbr) => {
        if (!depthMap.has(nbr)) {
          depthMap.set(nbr, d + 1);
          queue.push(nbr);
        }
      });
    }

    // 3. Subtopics: strictly depth === 1 from Core AND degree >= 2 (restrained secondary concepts)
    // All other nodes (depth >= 2, leaf nodes with degree 1, disconnected nodes) are 'related'
    const directToCore = sortedByDegree.filter(
      (n) => depthMap.get(n.id) === 1 && (n.degree || 0) >= 2
    );
    const subtopicNodeIds = new Set<string>(
      directToCore.slice(0, 5).map((n) => n.id)
    );

    // Initialize or load position cache from localStorage if needed (§4, §5)
    if (nodePositionsRef.current.size === 0 && workspaceId) {
      nodePositionsRef.current = getStoredPositions(workspaceId);
    }

    const nodes: CelestialNode[] = graphData.nodes.map((n) => {
      const { coords, catalog } = computeCelestialCoords(n.id);
      const deg = n.degree || 0;

      let hierarchy: 'core' | 'subtopic' | 'related' = 'related';
      if (coreNodeIds.has(n.id)) {
        hierarchy = 'core';
      } else if (subtopicNodeIds.has(n.id)) {
        hierarchy = 'subtopic';
      } else {
        hierarchy = 'related';
      }

      // Proportional visual scale: Core (24), Subtopic (16), Related (9)
      const size = hierarchy === 'core' ? 24 : hierarchy === 'subtopic' ? 16 : 9;

      // Find connections from edges
      const connections: Array<{ id: string; name: string; type: string; corr: string }> = [];
      graphData.edges.forEach((e) => {
        if (e.source_entity_id === n.id) {
          const target = nodesMap.get(e.target_entity_id);
          if (target) {
            connections.push({
              id: target.id,
              name: target.name,
              type: e.relationship_type,
              corr: e.confidence.toFixed(2),
            });
          }
        } else if (e.target_entity_id === n.id) {
          const source = nodesMap.get(e.source_entity_id);
          if (source) {
            connections.push({
              id: source.id,
              name: source.name,
              type: e.relationship_type,
              corr: e.confidence.toFixed(2),
            });
          }
        }
      });

      // Restore cached layout coordinates if available
      const cached = nodePositionsRef.current.get(n.id);

      return {
        id: n.id,
        label: n.name,
        catalog,
        coords,
        group: n.cluster_id && clusterMap[n.cluster_id] ? clusterMap[n.cluster_id] : 1,
        type: hierarchy === 'core' ? 'hub' : 'concept',
        hierarchy,
        size,
        degree: deg,
        noteCount: n.note_count || 0,
        desc:
          n.description ||
          `Extracted ${n.entity_type} concept with ${deg} active relationships in the Hyades knowledge sky.`,
        connections,
        x: cached ? cached.x : undefined,
        y: cached ? cached.y : undefined,
      };
    });

    const validNodeIds = new Set(nodes.map((n) => n.id));

    const links: CelestialLink[] = graphData.edges
      .filter((e) => validNodeIds.has(e.source_entity_id) && validNodeIds.has(e.target_entity_id))
      .map((e) => ({
        source: e.source_entity_id,
        target: e.target_entity_id,
        weight: e.confidence,
        type: e.relationship_type,
      }));

    return { celestialNodes: nodes, celestialLinks: links };
  }, [graphData, clusters, workspaceId]);

  const hasAutoSelectedRef = useRef(false);

  // Set default selected node ONCE on mount if none is selected and initialTarget is not set
  useEffect(() => {
    if (celestialNodes.length > 0 && !hasAutoSelectedRef.current) {
      hasAutoSelectedRef.current = true;
      if (!selectedNode && !initialTarget) {
        const sorted = [...celestialNodes].sort((a, b) => b.degree - a.degree);
        setSelectedNode(sorted[0]);
      }
    }
  }, [celestialNodes, selectedNode, initialTarget]);

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

      if (
        zoomBehaviorRef.current &&
        svgRef.current &&
        matched.x !== undefined &&
        matched.y !== undefined
      ) {
        const width = containerRef.current?.clientWidth || window.innerWidth;
        const height = containerRef.current?.clientHeight || window.innerHeight;
        const scale = 1.35;
        const x = width * 0.44 - matched.x * scale;
        const y = height * 0.48 - matched.y * scale;

        svgRef.current
          .transition()
          .duration(700)
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
  }, [initialTarget, celestialNodes, graphData]);

  // Escape key entity deselection (§3)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEntityEditorOpen || isRelationshipEditorOpen || isSuggestionsOpen) {
          return;
        }
        e.preventDefault();
        setSelectedNode(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEntityEditorOpen, isRelationshipEditorOpen, isSuggestionsOpen]);

  // Manual Untangle / Organize Graph Action (§2)
  const handleUntangle = useCallback(() => {
    if (!simulationRef.current || !containerRef.current) return;
    const width = containerRef.current.clientWidth || window.innerWidth;
    const height = containerRef.current.clientHeight || window.innerHeight;

    simulationRef.current
      .force('center', d3.forceCenter(width * 0.44, height * 0.48))
      .force('charge', d3.forceManyBody().strength(-460))
      .force(
        'collision',
        d3.forceCollide().radius((d: any) => (d.size || 14) * 2.8 + 12)
      )
      .alpha(0.35)
      .alphaDecay(0.035)
      .alphaTarget(0)
      .restart();
  }, []);

  // Render Celestial Graticule (Astronomical Atlas Lines)
  const renderCelestialGraticule = useCallback(() => {
    if (!graticuleRef.current) return;
    const svg = d3.select(graticuleRef.current);
    svg.selectAll('*').remove();

    const width = window.innerWidth;
    const height = window.innerHeight;
    const cx = width * 0.44;
    const cy = height * 0.48;

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
        .attr('stroke', i === 2 ? 'rgba(189, 83, 43, 0.25)' : 'rgba(70, 60, 50, 0.11)')
        .attr('stroke-width', i === 2 ? 1.1 : 0.7)
        .attr('stroke-dasharray', i % 2 === 0 ? '4,4' : 'none');

      g.append('text')
        .attr('x', cx + 8)
        .attr('y', cy - r + 12)
        .attr('fill', i === 2 ? 'rgba(189, 83, 43, 0.75)' : 'rgba(100, 90, 80, 0.4)')
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
        .attr('stroke', 'rgba(70, 60, 50, 0.07)')
        .attr('stroke-width', 0.6)
        .attr('stroke-dasharray', '2,6');

      const h = Math.round(deg / 15);
      g.append('text')
        .attr('x', cx + Math.cos(rad) * 530)
        .attr('y', cy + Math.sin(rad) * 530)
        .attr('fill', 'rgba(100, 90, 80, 0.38)')
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
      .attr('stroke', 'rgba(192, 141, 56, 0.22)')
      .attr('stroke-width', 1.2)
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

  // Cubic Constellation Link Path Generator
  const linkCubicPath = (d: any) => {
    const x1 = d.source.x,
      y1 = d.source.y;
    const x2 = d.target.x,
      y2 = d.target.y;
    const dx = x2 - x1,
      dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return `M ${x1} ${y1} L ${x2} ${y2}`;

    const curvature = Math.min(28, dist * 0.12);
    const mx = (x1 + x2) / 2 - (dy / dist) * curvature;
    const my = (y1 + y2) / 2 + (dx / dist) * curvature;
    return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
  };

  // ================= STABLE D3 FORCE SIMULATION INITIALIZER =================
  // Strictly calculated ONCE when graph data or structural filters change.
  // NEVER recreated or restarted when selectedNode or searchQuery changes!
  useEffect(() => {
    if (!containerRef.current || celestialNodes.length === 0) return;

    renderCelestialGraticule();

    d3.select(containerRef.current).selectAll('*').remove();

    const width = containerRef.current.clientWidth || window.innerWidth;
    const height = containerRef.current.clientHeight || window.innerHeight;

    // Filter nodes based on user toggle
    const filteredNodes: CelestialNode[] = celestialNodes.filter((n) => {
      if (!filterHubs && n.hierarchy === 'core') return false;
      if (!filterConcepts && n.hierarchy !== 'core') return false;
      if (selectedClusterId && n.catalog !== selectedClusterId) return false;
      return true;
    });

    const activeNodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredLinks: CelestialLink[] = celestialLinks.filter(
      (l) =>
        activeNodeIds.has(typeof l.source === 'string' ? l.source : (l.source as any).id) &&
        activeNodeIds.has(typeof l.target === 'string' ? l.target : (l.target as any).id)
    );

    const svg = d3
      .select(containerRef.current)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height])
      .attr('class', 'celestial-svg select-none cursor-grab active:cursor-grabbing');

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
      .scaleExtent([0.3, 3.5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);
    zoomBehaviorRef.current = zoom;

    // Center view
    svg.call(
      zoom.transform,
      d3.zoomIdentity.translate(width * 0.05, height * 0.03).scale(0.95)
    );

    // Background blank click catcher for entity deselection (§3)
    g.append('rect')
      .attr('class', 'graph-blank-catcher')
      .attr('x', -width * 4)
      .attr('y', -height * 4)
      .attr('width', width * 10)
      .attr('height', height * 10)
      .attr('fill', 'transparent')
      .style('pointer-events', 'all')
      .on('click', () => {
        setSelectedNode(null);
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
      }
    });

    // Check if nodes already have established positions (§4, §5)
    const hasEstablishedPositions =
      filteredNodes.length > 0 &&
      filteredNodes.filter((n) => n.x !== undefined && n.y !== undefined).length / filteredNodes.length >= 0.75;

    // Force Simulation with fast alphaDecay to stabilize and consume 0% idle CPU
    const simulation = d3
      .forceSimulation<CelestialNode>(filteredNodes)
      .force(
        'link',
        d3
          .forceLink<CelestialNode, CelestialLink>(filteredLinks)
          .id((d) => d.id)
          .distance((d) => 125 + (1 - (d.weight || 0.8)) * 95)
          .strength(0.3)
      )
      .force('charge', d3.forceManyBody().strength(-360))
      .force('center', d3.forceCenter(width * 0.44, height * 0.48))
      .force('collision', d3.forceCollide().radius((d: any) => (d.size || 14) * 2.2))
      .alphaDecay(0.04); // Cooldown fast (~70 ticks)

    if (hasEstablishedPositions) {
      // Re-use established layout positions directly without exploding/re-scattering! (§4, §6, §7)
      simulation.alpha(0);
    }

    simulationRef.current = simulation;

    // Links Layer
    const linkGroup = g.append('g').attr('class', 'links-layer');
    const link = linkGroup
      .selectAll<SVGPathElement, CelestialLink>('path')
      .data(filteredLinks)
      .enter()
      .append('path')
      .attr('class', 'celestial-link')
      .attr('fill', 'none')
      .attr('stroke', '#4A3E3D')
      .attr('stroke-opacity', 0.28)
      .attr('stroke-width', (d) => 0.8 + (d.weight || 0.8) * 1.2);

    // Link Labels Layer
    const linkLabel = linkGroup
      .selectAll('text')
      .data(filteredLinks)
      .enter()
      .append('text')
      .attr('class', 'link-label pointer-events-none select-none')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '8px')
      .attr('fill', 'rgba(100, 90, 80, 0.45)')
      .attr('text-anchor', 'middle')
      .text((d) => d.type || '');

    // Nodes Layer
    const nodeGroup = g.append('g').attr('class', 'nodes-layer');
    const node = nodeGroup
      .selectAll<SVGGElement, CelestialNode>('.celestial-node')
      .data(filteredNodes, (d) => d.id)
      .enter()
      .append('g')
      .attr('class', 'celestial-node cursor-pointer')
      .attr('data-id', (d) => d.id)
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedNode(d);
      });

    // If positions are established, position elements immediately without waiting for simulation
    if (hasEstablishedPositions) {
      link.attr('d', (d: any) => linkCubicPath(d));
      linkLabel
        .attr('x', (d: any) => ((d.source?.x ?? 0) + (d.target?.x ?? 0)) / 2)
        .attr('y', (d: any) => ((d.source?.y ?? 0) + (d.target?.y ?? 0)) / 2 - 3);
      node.attr('transform', (d) => `translate(${d.x || 0}, ${d.y || 0})`);
    }

    // Render Node Shapes according to approved astronomical hierarchy
    node.each(function (d) {
      const el = d3.select(this);

      // Selection Halo (toggle visibility via class without simulation recalculation)
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
          .attr('d', createSymmetricalConceptStar(9))
          .attr('fill', 'url(#related-concept-grad)')
          .attr('stroke', '#BD532B')
          .attr('stroke-width', 0.7);

        el.append('circle').attr('r', 1.8).attr('fill', '#FAF8F2');
      }

      // Elegant Astronomical Label
      const textGroup = el
        .append('g')
        .attr('class', 'node-label-group pointer-events-none select-none')
        .attr('transform', `translate(0, ${d.size + 13})`);

      textGroup
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('class', 'serif font-semibold')
        .attr(
          'font-size',
          d.hierarchy === 'core' ? '12.5px' : d.hierarchy === 'subtopic' ? '11px' : '10px'
        )
        .attr('fill', '#1A2130')
        .text(d.label);

      textGroup
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('y', 10.5)
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', '8px')
        .attr('fill', 'rgba(100, 90, 80, 0.65)')
        .text(`${d.catalog} · d:${d.degree}`);
    });

    // Drag behavior with cache updates
    const drag = d3
      .drag<SVGGElement, CelestialNode>()
      .on('start', (event) => {
        if (!event.active) simulation.alphaTarget(0.15).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      })
      .on('drag', (event) => {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      })
      .on('end', (event) => {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
        if (event.subject.x !== undefined && event.subject.y !== undefined) {
          nodePositionsRef.current.set(event.subject.id, {
            x: event.subject.x,
            y: event.subject.y,
          });
          saveStoredPositions(workspaceId, nodePositionsRef.current);
        }
      });

    node.call(drag);

    // Simulation Tick: Update positions and persist to coordinate cache
    simulation.on('tick', () => {
      link.attr('d', (d: any) => linkCubicPath(d));

      linkLabel
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2 - 3);

      node.attr('transform', (d) => `translate(${d.x || 0}, ${d.y || 0})`);

      filteredNodes.forEach((n) => {
        if (n.x !== undefined && n.y !== undefined) {
          nodePositionsRef.current.set(n.id, { x: n.x, y: n.y });
        }
      });
    });

    simulation.on('end', () => {
      filteredNodes.forEach((n) => {
        if (n.x !== undefined && n.y !== undefined) {
          nodePositionsRef.current.set(n.id, { x: n.x, y: n.y });
        }
      });
      saveStoredPositions(workspaceId, nodePositionsRef.current);
    });

    return () => {
      simulation.stop();
    };
  }, [
    celestialNodes,
    celestialLinks,
    filterHubs,
    filterConcepts,
    selectedClusterId,
    renderCelestialGraticule,
    workspaceId,
  ]);

  // ================= STABLE SELECTION & HIGHLIGHTING EFFECT =================
  // Updates visual attributes purely in DOM without restarting force simulation!
  useEffect(() => {
    if (!containerRef.current) return;
    const svg = d3.select(containerRef.current).select('svg');
    if (svg.empty()) return;

    const selectedId = selectedNode?.id;
    const connectedIds = new Set<string>();
    if (selectedNode) {
      selectedNode.connections.forEach((c) => connectedIds.add(c.id));
    }

    // Update node styles & selection halo
    svg.selectAll<SVGGElement, CelestialNode>('.celestial-node').each(function (d) {
      const el = d3.select(this);
      const isSelected = d.id === selectedId;
      const isConnected = connectedIds.has(d.id);
      const isDimmed = selectedId ? !isSelected && !isConnected : false;

      el.classed('is-selected', isSelected)
        .classed('is-connected', isConnected)
        .classed('is-dimmed', isDimmed)
        .transition()
        .duration(180)
        .style('opacity', isDimmed ? 0.32 : 1);

      el.select('.selection-halo')
        .transition()
        .duration(180)
        .style('opacity', isSelected ? 1 : 0);
    });

    // Update link highlights
    svg.selectAll<SVGPathElement, CelestialLink>('.celestial-link').each(function (d) {
      const el = d3.select(this);
      const srcId = typeof d.source === 'string' ? d.source : (d.source as any).id;
      const tgtId = typeof d.target === 'string' ? d.target : (d.target as any).id;
      const isConnected =
        (srcId === selectedId && connectedIds.has(tgtId)) ||
        (tgtId === selectedId && connectedIds.has(srcId));
      const isDimmed = selectedId ? !isConnected : false;

      el.classed('is-active-link', isConnected)
        .transition()
        .duration(180)
        .attr('stroke', isConnected ? '#BD532B' : '#4A3E3D')
        .attr('stroke-opacity', isConnected ? 0.85 : isDimmed ? 0.08 : 0.28)
        .attr('stroke-width', isConnected ? 2.0 : 0.8 + (d.weight || 0.8) * 1.2);
    });
  }, [selectedNode]);

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
      d3.select(this)
        .transition()
        .duration(150)
        .style('opacity', match ? 1 : 0.22);
    });
  }, [debouncedSearchQuery, selectedNode]);

  // Zoom controls
  const handleZoom = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    svgRef.current.transition().duration(300).call(zoomBehaviorRef.current.scaleBy, factor);
  };

  const handleRecenter = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    svgRef.current.transition().duration(500).call(
      zoomBehaviorRef.current.transform,
      d3.zoomIdentity.translate(width * 0.05, height * 0.03).scale(0.95)
    );
  };

  // Search commit: center camera on target node WITHOUT recreating simulation
  const handleSearchCommit = (targetNode?: CelestialNode) => {
    const target =
      targetNode ||
      celestialNodes.find((n) =>
        n.label.toLowerCase().includes(searchQuery.trim().toLowerCase())
      );
    if (!target) return;
    setSelectedNode(target);

    const pos = nodePositionsRef.current.get(target.id) || { x: target.x, y: target.y };
    if (svgRef.current && zoomBehaviorRef.current && pos.x !== undefined && pos.y !== undefined) {
      const width = window.innerWidth;
      const height = window.innerHeight;
      svgRef.current.transition().duration(600).call(
        zoomBehaviorRef.current.transform,
        d3.zoomIdentity
          .translate(width * 0.44 - pos.x * 1.35, height * 0.48 - pos.y * 1.35)
          .scale(1.35)
      );
    }
  };

  return (
    <div
      className={`h-screen w-full relative text-[13px] leading-relaxed select-none overflow-hidden ${
        isFullscreen ? 'focused-view' : ''
      }`}
    >
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

      {/* ================= FLOATING MINIMAL SEGMENTED TOP NAVIGATION (APPROVED DESIGN) ================= */}
      <header className="absolute top-4 left-6 right-6 z-30 flex items-center justify-between pointer-events-none select-none transition-all">
        {/* SEGMENT 1 (LEFT): Brand + Nav Links + Real Graph Actions */}
        <div className="flex items-center gap-2.5 bg-[#FAF8F2]/90 backdrop-blur-md border border-[var(--border-parchment)] shadow-sm rounded-full px-3.5 py-1.5 pointer-events-auto">
          {/* Logo & Identity */}
          <button
            type="button"
            onClick={() => onNavigateToDestination?.('overview')}
            className="flex items-center gap-2 group text-left focus:outline-none cursor-pointer"
            title="Hyades Overview"
          >
            <div className="w-6 h-6 rounded-full bg-[var(--accent-midnight)] text-[#FAF8F2] flex items-center justify-center shadow-xs border border-[#2D3F5E] group-hover:bg-[var(--accent-midnight-light)] transition-colors">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                className="transition-transform duration-700 group-hover:rotate-90"
              >
                <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2,2" strokeOpacity="0.4" />
                <circle cx="12" cy="12" r="5.5" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.7" />
                <path d="M 12 3.5 L 13.5 10.5 L 20.5 12 L 13.5 13.5 L 12 20.5 L 10.5 13.5 L 3.5 12 L 10.5 10.5 Z" fill="currentColor" />
                <circle cx="12" cy="12" r="1.5" fill="#FAF8F2" />
              </svg>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="serif text-base font-semibold tracking-tight text-[var(--ink-primary)] leading-none">
                Hyades
              </span>
              <span className="text-[9px] tracking-[0.2em] font-medium text-[var(--ink-secondary)] uppercase">
                Observatory
              </span>
            </div>
          </button>

          <div className="w-px h-3.5 bg-[var(--border-parchment)] mx-1" />

          {/* Navigation Links */}
          <nav aria-label="Main navigation" className="hidden md:flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigateToDestination?.('overview')}
              className="text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => onNavigateToDestination?.('library')}
              className="text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
            >
              Library
            </button>
            <button
              type="button"
              className="text-xs font-semibold text-[var(--accent-midnight)] flex items-center gap-1 cursor-pointer"
            >
              <span>Observatory</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-terracotta)]" />
            </button>
            <button
              type="button"
              onClick={() => onNavigateToDestination?.('stella')}
              className="text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
            >
              Stella
            </button>
          </nav>

          <div className="w-px h-3.5 bg-[var(--border-parchment)] mx-1" />

          {/* Real Actions: + Entity & Connect & More */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsEntityEditorOpen(true)}
              className="px-2.5 py-1 rounded-full bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] text-xs font-medium flex items-center gap-1 shadow-2xs transition-all active:scale-95 cursor-pointer"
              title="Add Entity to Knowledge Sky"
            >
              <i className="ph ph-plus text-xs text-[var(--accent-brass)]" />
              <span>+ Entity</span>
            </button>

            <button
              type="button"
              onClick={() => setIsRelationshipEditorOpen(true)}
              className="px-2.5 py-1 rounded-full bg-white hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-strong)] text-xs font-medium text-[var(--ink-primary)] flex items-center gap-1 shadow-2xs transition-all active:scale-95 cursor-pointer"
              title="Connect Two Entities"
            >
              <i className="ph ph-arrows-split text-xs text-[var(--accent-terracotta)]" />
              <span>Connect</span>
            </button>

            {/* Compact More Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMoreMenuOpen((prev) => !prev)}
                className="w-6 h-6 rounded-full bg-white hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-strong)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
                title="More Graph Actions"
              >
                <i className="ph-bold ph-dots-three-vertical text-xs" />
              </button>

              {isMoreMenuOpen && (
                <div className="absolute left-0 mt-2 w-48 bg-white border border-[var(--border-strong)] rounded-xl shadow-lg py-1.5 z-50 text-xs animate-fade-in">
                  <button
                    type="button"
                    onClick={() => {
                      handleUntangle();
                      setIsMoreMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-panel-subtle)] flex items-center gap-2 text-[var(--ink-primary)] cursor-pointer"
                  >
                    <i className="ph-bold ph-magic-wand text-xs text-[var(--accent-terracotta)]" />
                    <span>Untangle / Organize</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSuggestionsOpen(true);
                      setIsMoreMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-panel-subtle)] flex items-center gap-2 text-[var(--ink-primary)] cursor-pointer"
                  >
                    <i className="ph ph-sparkle text-xs text-[var(--accent-terracotta)]" />
                    <span>Link Suggestions</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAtlasPlate((p) => !p);
                      setIsMoreMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-panel-subtle)] flex items-center gap-2 text-[var(--ink-primary)] cursor-pointer"
                  >
                    <i className="ph ph-newspaper text-xs text-[var(--accent-midnight)]" />
                    <span>{showAtlasPlate ? 'Hide Atlas Plate' : 'Show Atlas Plate'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowGraticule((p) => !p);
                      setIsMoreMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-panel-subtle)] flex items-center gap-2 text-[var(--ink-primary)] cursor-pointer"
                  >
                    <i className="ph ph-grid-four text-xs text-[var(--accent-brass)]" />
                    <span>{showGraticule ? 'Hide Coordinates' : 'Show Coordinates'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SEGMENT 2 (CENTER): Compact Focused Coordinate HUD Capsule */}
        <div className="hidden lg:flex items-center pointer-events-auto">
          {selectedNode ? (
            <div className="bg-[#FAF8F2]/90 backdrop-blur-md border border-[var(--border-parchment)] shadow-sm rounded-full px-3.5 py-1.5 flex items-center gap-2.5">
              <div
                className={`w-2 h-2 rounded-full ${
                  selectedNode.hierarchy === 'core'
                    ? 'bg-[var(--accent-terracotta)] animate-pulse'
                    : selectedNode.hierarchy === 'subtopic'
                    ? 'bg-[var(--accent-brass)]'
                    : 'bg-[var(--accent-midnight)]'
                }`}
              />
              <span className="serif text-xs font-semibold text-[var(--ink-primary)] leading-none max-w-[170px] truncate">
                {selectedNode.label}
              </span>
              <span className="w-px h-2.5 bg-[var(--border-parchment)]" />
              <span className="mono text-[10px] text-[var(--ink-tertiary)]">
                {selectedNode.coords}
              </span>
              <span className="mono text-[9px] text-[var(--accent-midnight)] bg-white px-1.5 py-0.5 rounded-full border border-[var(--border-parchment)] font-medium">
                {selectedNode.catalog}
              </span>
            </div>
          ) : (
            <div className="bg-[#FAF8F2]/80 backdrop-blur-md border border-[var(--border-parchment)] rounded-full px-3 py-1 text-xs text-[var(--ink-tertiary)] mono">
              Click a star to focus coordinates
            </div>
          )}
        </div>

        {/* SEGMENT 3 (RIGHT): Search Trigger & Fullscreen Controls */}
        <div className="flex items-center gap-2 bg-[#FAF8F2]/90 backdrop-blur-md border border-[var(--border-parchment)] shadow-sm rounded-full px-2.5 py-1.5 pointer-events-auto">
          {onOpenSearch && (
            <button
              type="button"
              onClick={onOpenSearch}
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full hover:bg-white text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
              title="Global Search (⌘K)"
            >
              <i className="ph ph-magnifying-glass text-xs" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="mono text-[9.5px] text-[var(--ink-tertiary)] ml-0.5">⌘K</kbd>
            </button>
          )}

          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="w-6 h-6 rounded-full hover:bg-white text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] flex items-center justify-center transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen / Focused View'}
            >
              <i
                className={`ph-bold ${
                  isFullscreen ? 'ph-corners-in' : 'ph-corners-out'
                } text-xs text-[var(--accent-terracotta)]`}
              />
            </button>
          )}
        </div>
      </header>

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
              trigger extraction in the Library to illuminate the celestial atlas.
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
        <div id="reopen-left-sidebar" className="fixed top-18 left-0 z-30 pointer-events-auto">
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
        <div id="reopen-right-sidebar" className="fixed top-18 right-0 z-30 pointer-events-auto">
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
          className="sidebar-transition absolute top-18 left-6 w-[280px] max-h-[calc(100vh-140px)] z-10 flex flex-col pointer-events-none"
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
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-[0.18em] font-medium text-[var(--ink-secondary)]">
                    Constellations ({clusters.length || celestialNodes.length})
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

                <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {clusters.length > 0 ? (
                    clusters.map((cl) => (
                      <button
                        key={cl.id}
                        type="button"
                        onClick={() =>
                          setSelectedClusterId(selectedClusterId === cl.id ? null : cl.id)
                        }
                        className={`w-full text-left p-2 rounded-lg border transition-all flex items-center justify-between cursor-pointer ${
                          selectedClusterId === cl.id
                            ? 'bg-white border-[var(--accent-terracotta)] shadow-2xs'
                            : 'hover:bg-white/80 border-transparent hover:border-[var(--border-parchment)]'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-2 h-2 rounded-full bg-[var(--accent-midnight)]" />
                          <span className="text-xs font-medium text-[var(--ink-primary)] truncate">
                            {cl.label}
                          </span>
                        </div>
                        <span className="text-[10px] mono text-[var(--ink-tertiary)]">
                          {cl.member_count} stars
                        </span>
                      </button>
                    ))
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
          isRightSidebarOpen && selectedNode ? 'right-[416px]' : 'right-6'
        }`}
      >
        <button
          type="button"
          onClick={() => handleZoom(1.25)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
          title="Zoom In (+)"
        >
          <i className="ph-bold ph-plus text-xs" />
        </button>

        <button
          type="button"
          onClick={() => handleZoom(0.8)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
          title="Zoom Out (–)"
        >
          <i className="ph-bold ph-minus text-xs" />
        </button>

        <div className="w-4 h-px bg-[var(--border-parchment)] mx-auto my-0.5" />

        <button
          type="button"
          onClick={handleUntangle}
          data-testid="untangle-graph-btn"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--accent-terracotta)] transition-colors cursor-pointer"
          title="Untangle / Organize Graph"
        >
          <i className="ph-bold ph-magic-wand text-xs text-[var(--accent-terracotta)]" />
        </button>

        <button
          type="button"
          onClick={handleRecenter}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
          title="Recenter Constellation"
        >
          <i className="ph-bold ph-crosshair text-xs" />
        </button>

        <button
          type="button"
          onClick={() => setShowAtlasPlate((prev) => !prev)}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
            showAtlasPlate
              ? 'text-[var(--accent-midnight)] bg-[var(--bg-panel-subtle)]'
              : 'text-[var(--ink-tertiary)]'
          }`}
          title="Toggle Archival Atlas Plate"
        >
          <i className="ph-bold ph-newspaper-clipping text-xs" />
        </button>

        <button
          type="button"
          onClick={() => setShowGraticule((prev) => !prev)}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
            showGraticule
              ? 'text-[var(--accent-midnight)] bg-[var(--bg-panel-subtle)]'
              : 'text-[var(--ink-tertiary)]'
          }`}
          title="Toggle Celestial Coordinates"
        >
          <i className="ph-bold ph-grid-four text-xs" />
        </button>

        {onToggleFullscreen && (
          <>
            <div className="w-4 h-px bg-[var(--border-parchment)] mx-auto my-0.5" />
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit Focus View' : 'Focus / Fullscreen View'}
            >
              <i
                className={`ph-bold ${
                  isFullscreen ? 'ph-corners-in' : 'ph-corners-out'
                } text-xs text-[var(--accent-terracotta)]`}
              />
            </button>
          </>
        )}
      </div>

      {/* ================= RIGHT KNOWLEDGE DOSSIER PANEL (EXTENDS UPWARD) ================= */}
      {isRightSidebarOpen && selectedNode && (
        <aside
          id="right-sidebar"
          className="sidebar-transition absolute top-4 right-6 bottom-6 w-[390px] z-20 flex flex-col pointer-events-none"
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
                    selectedNode.connections.map((conn) => (
                      <div
                        key={conn.id}
                        onClick={() => {
                          const target = celestialNodes.find((n) => n.id === conn.id);
                          if (target) setSelectedNode(target);
                        }}
                        className="card-surface p-2.5 flex items-center justify-between cursor-pointer group"
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
                        <span className="mono text-[10px] text-[var(--ink-secondary)]">
                          {(parseFloat(conn.corr) * 100).toFixed(0)}%
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

      {/* ================= BOTTOM SEARCH / FILTER BAR (OPTIMIZED) ================= */}
      <div
        id="search-bar-container"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto w-full max-w-md px-4"
      >
        <div className="instrument-panel bg-white/95 backdrop-blur-md px-3.5 py-2 shadow-lg border border-[var(--border-strong)] rounded-xl flex items-center gap-2.5">
          <i className="ph ph-magnifying-glass text-sm text-[var(--accent-midnight)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearchCommit();
              }
            }}
            placeholder="Search celestial constellation... (Press Enter to focus)"
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
    </div>
  );
};
