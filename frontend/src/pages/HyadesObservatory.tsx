/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import celestialAtlasPlate from '@/assets/plates/celestial-atlas.jpg';
import { getWorkspaceGraph } from '@/api/graph';
import { listClusters } from '@/api/clusters';
import { EntityEditor } from '@/components/EntityEditor';
import { RelationshipEditor } from '@/components/RelationshipEditor';
import { LinkSuggestionPanel } from '@/components/LinkSuggestionPanel';
import { GraphResponse, GraphNodeResponse } from '@/types/graph';
import { ClusterResponse } from '@/types/cluster';

interface HyadesObservatoryProps {
  workspaceId: string;
  onNavigateToDestination?: (dest: 'overview' | 'library' | 'observatory' | 'stella') => void;
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
  onNavigateToDestination,
  onNavigateToNote,
  isFullscreen = false,
  onToggleFullscreen,
  onOpenSearch,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<d3.Selection<SVGSVGElement, unknown, null, undefined> | null>(null);
  const graticuleRef = useRef<SVGSVGElement>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

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

  // Focus node
  const [selectedNode, setSelectedNode] = useState<CelestialNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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

  // Transform backend entities & edges into Celestial nodes & links
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

    const nodes: CelestialNode[] = graphData.nodes.map((n) => {
      const { coords, catalog } = computeCelestialCoords(n.id);
      const isHub = n.degree >= 3;
      const size = isHub ? 16 + Math.min(8, n.degree) : 10 + Math.min(6, n.degree);

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

      return {
        id: n.id,
        label: n.name,
        catalog,
        coords,
        group: n.cluster_id && clusterMap[n.cluster_id] ? clusterMap[n.cluster_id] : 1,
        type: isHub ? 'hub' : 'concept',
        size,
        degree: n.degree,
        noteCount: n.note_count || 0,
        desc:
          n.description ||
          `Extracted ${n.entity_type} concept with ${n.degree} connections in your active research graph.`,
        connections,
      };
    });

    // Valid node IDs set
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
  }, [graphData, clusters]);

  // Set default selected node once graph loads
  useEffect(() => {
    if (celestialNodes.length > 0 && !selectedNode) {
      // Pick node with highest degree or first node
      const sorted = [...celestialNodes].sort((a, b) => b.degree - a.degree);
      setSelectedNode(sorted[0]);
    }
  }, [celestialNodes, selectedNode]);

  // 1. Render Celestial Graticule (Astronomical Atlas Lines)
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

  // 2. Astronomical Starburst Path Generator
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

  // 3. Symmetrical 4-Point Concept Star Generator
  const createSymmetricalConceptStar = (r: number) => {
    const p = r;
    const w = r * 0.28;
    return `M 0 ${-p} Q ${w} ${-w} ${p} 0 Q ${w} ${w} 0 ${p} Q ${-w} ${w} ${-p} 0 Q ${-w} ${-w} 0 ${-p} Z`;
  };

  // 4. Cubic Constellation Link Path Generator
  const linkCubicPath = (d: any) => {
    const x1 = d.source.x, y1 = d.source.y;
    const x2 = d.target.x, y2 = d.target.y;
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return `M ${x1} ${y1} L ${x2} ${y2}`;

    const curvature = Math.min(28, dist * 0.12);
    const mx = (x1 + x2) / 2 - (dy / dist) * curvature;
    const my = (y1 + y2) / 2 + (dx / dist) * curvature;
    return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
  };

  // D3 Knowledge Constellation Graph Initializer
  useEffect(() => {
    if (!containerRef.current || celestialNodes.length === 0) return;

    renderCelestialGraticule();

    d3.select(containerRef.current).selectAll('*').remove();

    const width = containerRef.current.clientWidth || window.innerWidth;
    const height = containerRef.current.clientHeight || window.innerHeight;

    // Filter nodes based on user toggle
    const filteredNodes: CelestialNode[] = JSON.parse(JSON.stringify(
      celestialNodes.filter((n) => {
        if (!filterHubs && n.type === 'hub') return false;
        if (!filterConcepts && n.type === 'concept') return false;
        if (selectedClusterId && n.catalog !== selectedClusterId) return false;
        return true;
      })
    ));

    const activeNodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredLinks: CelestialLink[] = JSON.parse(JSON.stringify(
      celestialLinks.filter(
        (l) => activeNodeIds.has(typeof l.source === 'string' ? l.source : l.source.id) &&
               activeNodeIds.has(typeof l.target === 'string' ? l.target : l.target.id)
      )
    ));

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

    // Deep Midnight Starburst Radial Gradient
    const hubGrad = defs
      .append('radialGradient')
      .attr('id', 'hub-radial-grad')
      .attr('cx', '50%')
      .attr('cy', '50%')
      .attr('r', '50%');
    hubGrad.append('stop').attr('offset', '0%').attr('stop-color', '#FAF8F2');
    hubGrad.append('stop').attr('offset', '45%').attr('stop-color', '#2D3F5E');
    hubGrad.append('stop').attr('offset', '100%').attr('stop-color', '#162135');

    // Terracotta Concept Star Radial Gradient
    const conceptGrad = defs
      .append('radialGradient')
      .attr('id', 'concept-radial-grad')
      .attr('cx', '50%')
      .attr('cy', '50%')
      .attr('r', '50%');
    conceptGrad.append('stop').attr('offset', '0%').attr('stop-color', '#FFF4ED');
    conceptGrad.append('stop').attr('offset', '50%').attr('stop-color', '#D9653B');
    conceptGrad.append('stop').attr('offset', '100%').attr('stop-color', '#BD532B');

    // Celestial Halo Filter
    const filter = defs.append('filter').attr('id', 'celestial-halo').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    filter.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'blur');
    filter.append('feMerge').selectAll('feMergeNode').data(['blur', 'SourceGraphic']).enter().append('feMergeNode').attr('in', (d) => d);

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

    // D3 Force Simulation
    const simulation = d3
      .forceSimulation<CelestialNode>(filteredNodes)
      .force(
        'link',
        d3
          .forceLink<CelestialNode, CelestialLink>(filteredLinks)
          .id((d) => d.id)
          .distance((d) => 120 + (1 - (d.weight || 0.8)) * 100)
          .strength(0.35)
      )
      .force('charge', d3.forceManyBody().strength(-450))
      .force('center', d3.forceCenter(width * 0.44, height * 0.48))
      .force('collision', d3.forceCollide().radius((d: any) => (d.size || 16) * 2.8));

    // Links Layer
    const linkGroup = g.append('g').attr('class', 'links-layer');
    const link = linkGroup
      .selectAll('path')
      .data(filteredLinks)
      .enter()
      .append('path')
      .attr('class', 'celestial-link')
      .attr('fill', 'none')
      .attr('stroke', '#4A3E3D')
      .attr('stroke-opacity', 0.28)
      .attr('stroke-width', (d) => 0.8 + (d.weight || 0.8) * 1.2)
      .attr('stroke-dasharray', 'none');

    // Link Labels Layer
    const linkLabel = linkGroup
      .selectAll('text')
      .data(filteredLinks)
      .enter()
      .append('text')
      .attr('class', 'link-label')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '8px')
      .attr('fill', 'rgba(100, 90, 80, 0.45)')
      .attr('text-anchor', 'middle')
      .text((d) => d.type || '');

    // Nodes Layer
    const nodeGroup = g.append('g').attr('class', 'nodes-layer');
    const node = nodeGroup
      .selectAll<SVGGElement, CelestialNode>('.celestial-node')
      .data(filteredNodes)
      .enter()
      .append('g')
      .attr('class', 'celestial-node cursor-pointer')
      .on('click', (_event, d) => {
        setSelectedNode(d);
      });

    // Node Visual Geometry: Radiant Starburst vs Concept Star
    node.each(function (d) {
      const el = d3.select(this);
      const isSelected = selectedNode?.id === d.id;

      // Selection Halo
      if (isSelected) {
        el.append('circle')
          .attr('r', d.size * 2.1)
          .attr('fill', 'none')
          .attr('stroke', 'rgba(189, 83, 43, 0.45)')
          .attr('stroke-width', 1.2)
          .attr('stroke-dasharray', '3,3');
      }

      if (d.type === 'hub') {
        // Celestial Starburst for Major Hubs
        el.append('path')
          .attr('d', createStarburstPath(d.size * 1.7, d.size * 1.05, d.size * 0.45))
          .attr('fill', 'url(#hub-radial-grad)')
          .attr('filter', 'url(#celestial-halo)')
          .attr('stroke', '#C08D38')
          .attr('stroke-width', 0.85);

        // Radiant Core Pip
        el.append('circle').attr('r', 3.2).attr('fill', '#FAF8F2').attr('stroke', '#162135').attr('stroke-width', 0.8);
      } else {
        // Symmetrical 4-point Concept Star
        el.append('path')
          .attr('d', createSymmetricalConceptStar(d.size * 1.2))
          .attr('fill', 'url(#concept-radial-grad)')
          .attr('stroke', '#BD532B')
          .attr('stroke-width', 0.7);

        el.append('circle').attr('r', 2.2).attr('fill', '#FAF8F2');
      }

      // Elegant Astronomical Label
      const textGroup = el.append('g').attr('class', 'node-label-group').attr('transform', `translate(0, ${d.size + 14})`);

      textGroup
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('class', 'serif font-semibold')
        .attr('font-size', d.type === 'hub' ? '12.5px' : '11px')
        .attr('fill', '#1A2130')
        .text(d.label);

      textGroup
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('y', 11)
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', '8px')
        .attr('fill', 'rgba(100, 90, 80, 0.65)')
        .text(`${d.catalog} · d:${d.degree}`);
    });

    // Drag behavior
    const drag = d3
      .drag<SVGGElement, CelestialNode>()
      .on('start', (event) => {
        if (!event.active) simulation.alphaTarget(0.2).restart();
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
      });

    node.call(drag);

    // Simulation Tick
    simulation.on('tick', () => {
      link.attr('d', (d: any) => linkCubicPath(d));

      linkLabel
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2 - 3);

      node.attr('transform', (d) => `translate(${d.x || 0}, ${d.y || 0})`);
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
    selectedNode?.id,
    renderCelestialGraticule,
  ]);

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

  // Search in graph
  const handleSearchSelect = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) return;
    const match = celestialNodes.find((n) =>
      n.label.toLowerCase().includes(query.toLowerCase())
    );
    if (match) {
      setSelectedNode(match);
      if (svgRef.current && zoomBehaviorRef.current && match.x !== undefined && match.y !== undefined) {
        const width = window.innerWidth;
        const height = window.innerHeight;
        svgRef.current.transition().duration(600).call(
          zoomBehaviorRef.current.transform,
          d3.zoomIdentity
            .translate(width / 2 - match.x * 1.5, height / 2 - match.y * 1.5)
            .scale(1.5)
        );
      }
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

      {/* ================= FLOATING MINIMAL TOP NAVIGATION (APPROVED DESIGN) ================= */}
      <header className="absolute top-0 left-0 right-0 z-30 h-12 px-6 flex items-center justify-between bg-[#FAF8F2]/80 backdrop-blur-md border-b border-[var(--border-parchment)] pointer-events-auto transition-all select-none">
        {/* LEFT: Hyades Logo + Destination Links + Graph Actions */}
        <div className="flex items-center gap-5">
          {/* Logo & Identity */}
          <button
            type="button"
            onClick={() => onNavigateToDestination?.('overview')}
            className="flex items-center gap-2 group text-left focus:outline-none cursor-pointer"
            title="Hyades Overview"
          >
            <div className="w-7 h-7 rounded-lg bg-[var(--accent-midnight)] text-[#FAF8F2] flex items-center justify-center shadow-xs border border-[#2D3F5E] group-hover:bg-[var(--accent-midnight-light)] transition-colors">
              <svg
                width="16"
                height="16"
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
              <span className="serif text-lg font-semibold tracking-tight text-[var(--ink-primary)] leading-none">
                Hyades
              </span>
              <div className="w-px h-2.5 bg-[var(--border-strong)]" />
              <span className="text-[9.5px] tracking-[0.2em] font-medium text-[var(--ink-secondary)] uppercase">
                Observatory
              </span>
            </div>
          </button>

          {/* Nav Destination Links */}
          <nav aria-label="Main navigation" className="hidden lg:flex items-center gap-4 ml-1">
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
              className="text-xs font-semibold text-[var(--accent-midnight)] flex items-center gap-1.5 cursor-pointer"
            >
              <span>Observatory</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-brass)]" />
            </button>
            <button
              type="button"
              onClick={() => onNavigateToDestination?.('stella')}
              className="text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
            >
              Stella
            </button>
          </nav>

          <div className="w-px h-4 bg-[var(--border-parchment)]" />

          {/* Actions: + Entity & Connect & More */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEntityEditorOpen(true)}
              className="px-2.5 py-1 rounded-md bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] text-xs font-medium flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
              title="Add Entity to Knowledge Sky"
            >
              <i className="ph ph-plus text-xs text-[var(--accent-brass)]" />
              <span>+ Entity</span>
            </button>

            <button
              type="button"
              onClick={() => setIsRelationshipEditorOpen(true)}
              className="px-2.5 py-1 rounded-md bg-white hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-strong)] text-xs font-medium text-[var(--ink-primary)] flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
              title="Connect Two Entities"
            >
              <i className="ph ph-arrows-split text-xs text-[var(--accent-terracotta)]" />
              <span>Connect</span>
            </button>

            {/* More Menu Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMoreMenuOpen((prev) => !prev)}
                className="w-7 h-7 rounded-md bg-white hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-strong)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
                title="More Graph Actions"
              >
                <i className="ph-bold ph-dots-three-vertical text-xs" />
              </button>

              {isMoreMenuOpen && (
                <div className="absolute left-0 mt-1 w-48 bg-white border border-[var(--border-strong)] rounded-lg shadow-lg py-1 z-50 text-xs">
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

        {/* CENTER: Compact Focused Coordinate HUD Bar */}
        <div className="flex items-center justify-center">
          {selectedNode ? (
            <div className="bg-white/95 border border-[var(--border-strong)] rounded-full px-3.5 py-1 shadow-2xs flex items-center gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-terracotta)] animate-pulse" />
              <span className="serif text-xs font-semibold text-[var(--ink-primary)] leading-none max-w-[180px] truncate">
                {selectedNode.label}
              </span>
              <span className="w-px h-2.5 bg-[var(--border-parchment)]" />
              <span className="mono text-[10px] text-[var(--ink-tertiary)] hidden sm:inline">
                {selectedNode.coords}
              </span>
              <span className="mono text-[9px] text-[var(--accent-brass)] bg-[var(--bg-panel-subtle)] px-1.5 py-0.5 rounded border border-[var(--border-parchment)] font-medium">
                {selectedNode.catalog}
              </span>
            </div>
          ) : (
            <div className="bg-white/80 border border-[var(--border-parchment)] rounded-full px-3 py-1 text-xs text-[var(--ink-tertiary)] mono">
              Click a star to focus coordinates
            </div>
          )}
        </div>

        {/* RIGHT: Search Trigger & View Utilities */}
        <div className="flex items-center gap-3">
          {onOpenSearch && (
            <button
              type="button"
              onClick={onOpenSearch}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-[var(--border-strong)] text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-panel-subtle)] transition-colors shadow-2xs cursor-pointer"
              title="Global Search (⌘K)"
            >
              <i className="ph ph-magnifying-glass text-xs" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="mono text-[10px] text-[var(--ink-tertiary)] ml-1">⌘K</kbd>
            </button>
          )}

          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="w-7 h-7 rounded-md bg-white border border-[var(--border-strong)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen / Focused View'}
            >
              <i className={`ph-bold ${isFullscreen ? 'ph-corners-in' : 'ph-corners-out'} text-xs text-[var(--accent-terracotta)]`} />
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
              No concepts or relationships have been extracted yet in this workspace. Ingest notes or trigger extraction in the Library to illuminate the celestial atlas.
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

      {/* Persistent Reopen Left Edge Tab (PanelLeftOpen style icon) */}
      {!isLeftSidebarOpen && (
        <div id="reopen-left-sidebar" className="fixed top-16 left-0 z-30 pointer-events-auto">
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

      {/* Persistent Reopen Right Edge Tab (PanelRightOpen style icon) */}
      {!isRightSidebarOpen && selectedNode && (
        <div id="reopen-right-sidebar" className="fixed top-16 right-0 z-30 pointer-events-auto">
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
          className="sidebar-transition absolute top-16 left-6 w-[280px] max-h-[calc(100vh-140px)] z-10 flex flex-col pointer-events-none"
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
                        onClick={() => setSelectedClusterId(selectedClusterId === cl.id ? null : cl.id)}
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
                    celestialNodes.slice(0, 6).map((n) => (
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
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-terracotta)]" />
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

              {/* Filters */}
              <div className="pt-3 border-t border-[var(--border-parchment)]">
                <span className="text-[10px] uppercase tracking-[0.18em] font-medium text-[var(--ink-secondary)] mb-2 block">
                  Constellation Filters
                </span>

                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center justify-between py-1 cursor-pointer">
                    <span className="flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)]">
                      <svg width="12" height="12" viewBox="-8 -8 16 16" fill="var(--accent-midnight)">
                        <path d="M 0 -8 L 2 -2 L 8 0 L 2 2 L 0 8 L -2 2 L -8 0 L -2 -2 Z" />
                      </svg>
                      Major Starbursts (Hubs)
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
                      <svg width="10" height="10" viewBox="-5 -5 10 10" fill="var(--accent-terracotta)">
                        <path d="M 0 -4 Q 1 -1 4 0 Q 1 1 0 4 Q -1 1 -4 0 Q -1 -1 0 -4 Z" />
                      </svg>
                      Concept Stars
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
            showAtlasPlate ? 'text-[var(--accent-midnight)] bg-[var(--bg-panel-subtle)]' : 'text-[var(--ink-tertiary)]'
          }`}
          title="Toggle Archival Atlas Plate"
        >
          <i className="ph-bold ph-newspaper-clipping text-xs" />
        </button>

        <button
          type="button"
          onClick={() => setShowGraticule((prev) => !prev)}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
            showGraticule ? 'text-[var(--accent-midnight)] bg-[var(--bg-panel-subtle)]' : 'text-[var(--ink-tertiary)]'
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
              <i className={`ph-bold ${isFullscreen ? 'ph-corners-in' : 'ph-corners-out'} text-xs text-[var(--accent-terracotta)]`} />
            </button>
          </>
        )}
      </div>

      {/* ================= RIGHT KNOWLEDGE DOSSIER PANEL ================= */}
      {isRightSidebarOpen && selectedNode && (
        <aside
          id="right-sidebar"
          className="sidebar-transition absolute top-16 right-6 bottom-6 w-[390px] z-10 flex flex-col pointer-events-none"
        >
          <div className="instrument-panel flex-1 flex flex-col pointer-events-auto overflow-hidden">
            <div className="panel-bracket-tl" />
            <div className="panel-bracket-br" />

            {/* Panel Header with PanelRightClose icon */}
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

              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded border border-[var(--border-strong)] bg-[var(--bg-panel-subtle)] text-[10px] text-[var(--ink-secondary)] font-semibold tracking-wider uppercase mono mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-terracotta)]" />
                <span>{selectedNode.type === 'hub' ? 'Knowledge Hub Dossier' : 'Concept Star Dossier'}</span>
              </div>

              {/* Node Title */}
              <h2 className="serif text-3xl font-semibold text-[var(--ink-primary)] tracking-tight leading-tight mb-2">
                {selectedNode.label}
              </h2>

              {/* Context & Classification */}
              <div className="flex items-center gap-3 text-xs text-[var(--ink-secondary)]">
                <span className="flex items-center gap-1.5">
                  <i className="ph ph-compass" /> {selectedNode.type === 'hub' ? 'Central Hub' : 'Concept'}
                </span>
                <span className="w-1 h-1 rounded-full bg-[var(--border-strong)]" />
                <span className="mono text-[11px] text-[var(--accent-brass)]">
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
                            <div className="text-[10px] text-[var(--ink-tertiary)] mono">{conn.type}</div>
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
                onClick={() => onNavigateToDestination?.('stella')}
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

      {/* ================= BOTTOM SEARCH / FILTER BAR ================= */}
      <div
        id="search-bar-container"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto w-full max-w-md px-4"
      >
        <div className="instrument-panel bg-white/95 backdrop-blur-md px-3.5 py-2 shadow-lg border border-[var(--border-strong)] rounded-xl flex items-center gap-2.5">
          <i className="ph ph-magnifying-glass text-sm text-[var(--accent-midnight)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchSelect(e.target.value)}
            placeholder="Search celestial constellation..."
            className="flex-1 bg-transparent border-none outline-none text-xs text-[var(--ink-primary)] placeholder:text-[var(--ink-tertiary)]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => handleSearchSelect('')}
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
