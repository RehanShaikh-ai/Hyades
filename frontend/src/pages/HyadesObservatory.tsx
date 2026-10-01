/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import celestialAtlasPlate from '@/assets/plates/celestial-atlas.jpg';

interface HyadesObservatoryProps {
  workspaceId?: string;
  onNavigateToDestination?: (dest: 'overview' | 'library' | 'observatory' | 'stella') => void;
  onNavigateToNote?: (noteId: string) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

interface CelestialNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  catalog?: string;
  group: number;
  type: 'hub' | 'concept' | 'entity';
  mag?: number;
  size: number;
  coords?: string;
  focus?: boolean;
  desc?: string;
  connections?: Array<{ id: string; name: string; type: string; corr: string }>;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface CelestialLink extends d3.SimulationLinkDatum<CelestialNode> {
  source: string | CelestialNode;
  target: string | CelestialNode;
  weight: number;
  type: 'primary' | 'bridge' | 'concept' | 'entity';
  n1?: number;
  n2?: number;
  t1?: number;
  t2?: number;
}

// Canonical approved Hyades celestial constellation data
const CANONICAL_GRAPH: { nodes: CelestialNode[]; links: CelestialLink[] } = {
  nodes: [
    // Major Stellar Hubs (Radiant Celestial Starbursts)
    {
      id: 'hub_rag',
      catalog: 'HYA-03',
      label: 'Retrieval Augmented Gen',
      group: 3,
      type: 'hub',
      mag: 0.9,
      size: 18,
      coords: 'RA 04ʰ 28ᵐ 17ˢ · DEC +15° 52′ 00″',
      focus: true,
      desc: 'A dual-process architectural paradigm connecting static parametric LLM weights with external dynamic vector memory. It indexes corpora into dense embeddings, resolves semantic proximity queries via approximate nearest-neighbor search, and injects retrieved context windows directly into generative inference.',
      connections: [
        { id: 'hub_vector_dbs', name: 'Vector Databases', type: 'Index Substrate', corr: '0.94' },
        { id: 'hub_semantic_search', name: 'Semantic Search', type: 'Epistemic Bridge', corr: '0.88' },
        { id: 'hub_memory', name: 'Memory Systems', type: 'Context Feed', corr: '0.82' },
        { id: 'concept_embeddings', name: 'Dense Embeddings', type: 'Vector Space', corr: '0.89' },
        { id: 'c_chunking', name: 'Chunking Strategies', type: 'Discretization', corr: '0.91' },
      ],
    },
    {
      id: 'hub_agents',
      catalog: 'HYA-01',
      label: 'AI Agents',
      group: 1,
      type: 'hub',
      mag: 1.1,
      size: 16,
      coords: 'RA 04ʰ 18ᵐ 22ˢ · DEC +19° 22′ 10″',
      desc: 'Autonomous computational loops combining planning, tool usage, environment observation, and recursive evaluation to achieve goal-directed tasks in dynamic problem domains.',
      connections: [
        { id: 'hub_rag', name: 'Retrieval Augmented Gen', type: 'Grounding Substrate', corr: '0.91' },
        { id: 'hub_memory', name: 'Memory Systems', type: 'Episodic Retain', corr: '0.86' },
        { id: 'c_react', name: 'ReAct Loops', type: 'Execution Engine', corr: '0.88' },
      ],
    },
    {
      id: 'hub_memory',
      catalog: 'HYA-02',
      label: 'Memory Systems',
      group: 2,
      type: 'hub',
      mag: 1.2,
      size: 16,
      coords: 'RA 04ʰ 35ᵐ 41ˢ · DEC +18° 10′ 40″',
      desc: 'Multi-tiered storage hierarchies differentiating working buffers, short-term reflection queues, episodic interaction logs, and long-term consolidation substrates.',
      connections: [
        { id: 'hub_agents', name: 'AI Agents', type: 'State Buffer', corr: '0.86' },
        { id: 'hub_rag', name: 'Retrieval Augmented Gen', type: 'Vector Context', corr: '0.82' },
        { id: 'c_episodic', name: 'Episodic Buffers', type: 'Trace Index', corr: '0.84' },
      ],
    },
    {
      id: 'hub_vector_dbs',
      catalog: 'HYA-04',
      label: 'Vector Databases',
      group: 4,
      type: 'hub',
      mag: 1.3,
      size: 16,
      coords: 'RA 04ʰ 22ᵐ 05ˢ · DEC +11° 14′ 30″',
      desc: 'Specialized persistent engines optimized for high-dimensional spatial indexing, approximate nearest neighbor (ANN) retrieval, graph traversal, and dense quantization.',
      connections: [
        { id: 'hub_rag', name: 'Retrieval Augmented Gen', type: 'Index Engine', corr: '0.94' },
        { id: 'hub_semantic_search', name: 'Semantic Search', type: 'Similarity Metric', corr: '0.89' },
        { id: 'c_hnsw', name: 'HNSW Graph Index', type: 'ANN Topology', corr: '0.93' },
      ],
    },
    {
      id: 'hub_semantic_search',
      catalog: 'HYA-05',
      label: 'Semantic Search',
      group: 5,
      type: 'hub',
      mag: 1.2,
      size: 15,
      coords: 'RA 04ʰ 31ᵐ 10ˢ · DEC +10° 45′ 15″',
      desc: 'Information retrieval paradigms indexing passages by semantic intent rather than lexical token identity, pairing dense representations with reciprocal rank fusion (RRF).',
      connections: [
        { id: 'hub_vector_dbs', name: 'Vector Databases', type: 'Vector Proximity', corr: '0.89' },
        { id: 'hub_rag', name: 'Retrieval Augmented Gen', type: 'Passage Selection', corr: '0.88' },
        { id: 'hub_kg', name: 'Knowledge Graphs', type: 'Hybrid Expansion', corr: '0.76' },
      ],
    },
    {
      id: 'hub_kg',
      catalog: 'HYA-06',
      label: 'Knowledge Graphs',
      group: 6,
      type: 'hub',
      mag: 1.4,
      size: 16,
      coords: 'RA 04ʰ 44ᵐ 50ˢ · DEC +13° 30′ 20″',
      desc: 'Explicit relational epistemic structures representing entities, predicates, and ontologies as interconnected nodes and typed edges. Enforces symbolic grounding, explainability, and multi-hop reasoning.',
      connections: [
        { id: 'hub_rag', name: 'Retrieval Augmented Gen', type: 'GraphRAG Synthesis', corr: '0.86' },
        { id: 'hub_memory', name: 'Memory Systems', type: 'Associative Entity Store', corr: '0.78' },
        { id: 'c_graphrag', name: 'GraphRAG Traversal', type: 'Sub-Graph Mining', corr: '0.92' },
      ],
    },
    // Epistemic Concepts
    { id: 'c_react', group: 1, type: 'concept', label: 'ReAct Loops', size: 9, catalog: 'HYA-101' },
    { id: 'c_tools', group: 1, type: 'concept', label: 'Tool Protocol', size: 9, catalog: 'HYA-102' },
    { id: 'c_coord', group: 1, type: 'concept', label: 'Swarm Coordination', size: 9, catalog: 'HYA-103' },
    { id: 'c_episodic', group: 2, type: 'concept', label: 'Episodic Buffers', size: 9, catalog: 'HYA-201' },
    { id: 'c_semantic_mem', group: 2, type: 'concept', label: 'Semantic Priming', size: 9, catalog: 'HYA-202' },
    { id: 'c_reflection', group: 2, type: 'concept', label: 'Working Memory', size: 9, catalog: 'HYA-203' },
    { id: 'c_chunking', group: 3, type: 'concept', label: 'Chunking Strategies', size: 10, catalog: 'HYA-301' },
    { id: 'c_rerank', group: 3, type: 'concept', label: 'Cross-Encoder Rerank', size: 9, catalog: 'HYA-302' },
    { id: 'c_context_win', group: 3, type: 'concept', label: 'Context Windows', size: 9, catalog: 'HYA-303' },
    { id: 'c_hybrid_pipe', group: 3, type: 'concept', label: 'Hybrid Retrieval', size: 10, catalog: 'HYA-304' },
    { id: 'concept_embeddings', group: 4, type: 'concept', label: 'Dense Embeddings', size: 10, catalog: 'HYA-401' },
    { id: 'c_hnsw', group: 4, type: 'concept', label: 'HNSW Graph Index', size: 9, catalog: 'HYA-402' },
    { id: 'c_cosine', group: 4, type: 'concept', label: 'Cosine Proximity', size: 8, catalog: 'HYA-403' },
    { id: 'c_quant', group: 4, type: 'concept', label: 'Scalar Quantization', size: 8, catalog: 'HYA-404' },
    { id: 'c_rrf', group: 5, type: 'concept', label: 'Reciprocal Rank Fusion', size: 9, catalog: 'HYA-501' },
    { id: 'c_bm25', group: 5, type: 'concept', label: 'BM25 Lexical', size: 8, catalog: 'HYA-502' },
    { id: 'c_graphrag', group: 6, type: 'concept', label: 'GraphRAG Traversal', size: 10, catalog: 'HYA-601' },
    { id: 'c_entity_link', group: 6, type: 'concept', label: 'Entity Resolution', size: 9, catalog: 'HYA-602' },
    { id: 'c_triplestore', group: 6, type: 'concept', label: 'Ontology Triples', size: 8, catalog: 'HYA-603' },
    // Literature / Leaves
    { id: 'doc_lewis', group: 3, type: 'entity', label: 'Lewis et al. 2020', size: 3.5 },
    { id: 'doc_karp', group: 3, type: 'entity', label: 'DPR (EMNLP 2020)', size: 3.2 },
    { id: 'doc_bge', group: 4, type: 'entity', label: 'BGE-M3 Vectors', size: 3.0 },
    { id: 'doc_hnsw_paper', group: 4, type: 'entity', label: 'Malkov 2018 (HNSW)', size: 3.5 },
    { id: 'doc_park_agents', group: 1, type: 'entity', label: 'Park Generative Agents', size: 3.5 },
    { id: 'doc_memgpt', group: 2, type: 'entity', label: 'MemGPT (Packer 2023)', size: 3.0 },
    { id: 'doc_microsoft_graphrag', group: 6, type: 'entity', label: 'MSFT GraphRAG Report', size: 3.5 },
    { id: 'doc_colbert', group: 5, type: 'entity', label: 'ColBERTv2 Architecture', size: 3.0 },
  ],
  links: [
    // Primary Constellation Arteries
    { source: 'hub_agents', target: 'hub_memory', weight: 3.8, type: 'primary', n1: -0.32, n2: -0.28, t1: 0.30, t2: 0.70 },
    { source: 'hub_agents', target: 'hub_rag', weight: 3.8, type: 'primary', n1: -0.24, n2: 0.18, t1: 0.28, t2: 0.72 },
    { source: 'hub_rag', target: 'hub_vector_dbs', weight: 4.5, type: 'primary', n1: 0.26, n2: 0.22, t1: 0.35, t2: 0.65 },
    { source: 'hub_rag', target: 'concept_embeddings', weight: 4.0, type: 'primary', n1: -0.14, n2: -0.10, t1: 0.38, t2: 0.62 },
    { source: 'hub_vector_dbs', target: 'hub_semantic_search', weight: 4.2, type: 'primary', n1: 0.28, n2: 0.24, t1: 0.32, t2: 0.68 },
    { source: 'hub_semantic_search', target: 'hub_kg', weight: 3.8, type: 'primary', n1: 0.22, n2: -0.16, t1: 0.26, t2: 0.74 },
    { source: 'hub_kg', target: 'hub_rag', weight: 4.0, type: 'primary', n1: -0.22, n2: -0.18, t1: 0.34, t2: 0.66 },
    { source: 'hub_memory', target: 'hub_kg', weight: 3.4, type: 'primary', n1: 0.26, n2: 0.22, t1: 0.30, t2: 0.70 },
    // Cross-Cluster Epistemic Bridges
    { source: 'c_rrf', target: 'c_hybrid_pipe', weight: 2.6, type: 'bridge', n1: -0.28, n2: 0.24, t1: 0.24, t2: 0.76 },
    { source: 'c_graphrag', target: 'c_hybrid_pipe', weight: 2.8, type: 'bridge', n1: 0.26, n2: -0.22, t1: 0.25, t2: 0.75 },
    { source: 'c_rerank', target: 'c_hybrid_pipe', weight: 2.2, type: 'bridge', n1: 0.20, n2: 0.08, t1: 0.20, t2: 0.65 },
    { source: 'concept_embeddings', target: 'c_hnsw', weight: 2.4, type: 'bridge', n1: 0.18, n2: 0.15, t1: 0.35, t2: 0.65 },
    // Intra-Cluster Filaments
    { source: 'hub_agents', target: 'c_react', weight: 2.0, type: 'concept', n1: -0.16, n2: -0.12 },
    { source: 'hub_agents', target: 'c_tools', weight: 2.2, type: 'concept', n1: 0.18, n2: -0.10 },
    { source: 'hub_agents', target: 'c_coord', weight: 2.0, type: 'concept', n1: -0.24, n2: -0.18 },
    { source: 'hub_memory', target: 'c_episodic', weight: 2.2, type: 'concept', n1: 0.16, n2: 0.12 },
    { source: 'hub_memory', target: 'c_semantic_mem', weight: 2.0, type: 'concept', n1: -0.18, n2: -0.14 },
    { source: 'hub_memory', target: 'c_reflection', weight: 1.8, type: 'concept', n1: 0.15, n2: 0.10 },
    { source: 'hub_rag', target: 'c_chunking', weight: 2.5, type: 'concept', n1: 0.12, n2: 0.08 },
    { source: 'hub_rag', target: 'c_rerank', weight: 2.2, type: 'concept', n1: -0.14, n2: 0.12 },
    { source: 'hub_rag', target: 'c_context_win', weight: 2.0, type: 'concept', n1: 0.16, n2: -0.10 },
    { source: 'hub_vector_dbs', target: 'c_hnsw', weight: 2.5, type: 'concept', n1: 0.14, n2: 0.10 },
    { source: 'hub_vector_dbs', target: 'c_cosine', weight: 1.8, type: 'concept', n1: -0.16, n2: -0.12 },
    { source: 'hub_vector_dbs', target: 'c_quant', weight: 1.6, type: 'concept', n1: 0.18, n2: 0.14 },
    { source: 'hub_semantic_search', target: 'c_rrf', weight: 2.4, type: 'concept', n1: -0.14, n2: -0.10 },
    { source: 'hub_semantic_search', target: 'c_bm25', weight: 2.0, type: 'concept', n1: 0.16, n2: 0.12 },
    { source: 'hub_kg', target: 'c_graphrag', weight: 3.0, type: 'concept', n1: -0.18, n2: -0.14 },
    { source: 'hub_kg', target: 'c_entity_link', weight: 2.2, type: 'concept', n1: 0.20, n2: 0.16 },
    { source: 'hub_kg', target: 'c_triplestore', weight: 2.2, type: 'concept', n1: -0.16, n2: 0.11 },
    // Literature Filaments
    { source: 'doc_lewis', target: 'hub_rag', weight: 1.0, type: 'entity', n1: 0.08, n2: 0.06 },
    { source: 'doc_karp', target: 'c_chunking', weight: 1.0, type: 'entity', n1: -0.08, n2: -0.06 },
    { source: 'doc_bge', target: 'concept_embeddings', weight: 1.0, type: 'entity', n1: 0.07, n2: 0.05 },
    { source: 'doc_hnsw_paper', target: 'c_hnsw', weight: 1.0, type: 'entity', n1: -0.09, n2: -0.07 },
    { source: 'doc_park_agents', target: 'hub_agents', weight: 1.0, type: 'entity', n1: 0.08, n2: 0.06 },
    { source: 'doc_memgpt', target: 'hub_memory', weight: 1.0, type: 'entity', n1: -0.07, n2: -0.05 },
    { source: 'doc_microsoft_graphrag', target: 'c_graphrag', weight: 1.0, type: 'entity', n1: 0.08, n2: 0.06 },
    { source: 'doc_colbert', target: 'hub_semantic_search', weight: 1.0, type: 'entity', n1: -0.08, n2: -0.06 },
  ],
};

export const HyadesObservatory: React.FC<HyadesObservatoryProps> = ({
  onNavigateToDestination,
  isFullscreen: externalFullscreen,
  onToggleFullscreen: externalToggleFullscreen,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const graticuleRef = useRef<SVGSVGElement>(null);
  const zoomBehaviorRef = useRef<any>(null);
  const svgRef = useRef<any>(null);

  const [internalFullscreen, setInternalFullscreen] = useState(false);
  const isFullscreen = externalFullscreen !== undefined ? externalFullscreen : internalFullscreen;
  const toggleFullscreen = externalToggleFullscreen || (() => setInternalFullscreen((prev) => !prev));

  // Toggles & UI state
  const [showAtlasPlate, setShowAtlasPlate] = useState(true);
  const [showGraticule, setShowGraticule] = useState(true);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);

  // Filters
  const [filterHubs, setFilterHubs] = useState(true);
  const [filterConcepts, setFilterConcepts] = useState(true);
  const [filterEntities, setFilterEntities] = useState(true);

  // Selected / Focused Node
  const [selectedNode, setSelectedNode] = useState<CelestialNode>(CANONICAL_GRAPH.nodes[0]);
  const [searchQuery, setSearchQuery] = useState('');

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

    const tx = dx / dist, ty = dy / dist;
    const nx = -ty, ny = tx;

    const n1 = d.n1 !== undefined ? d.n1 : 0.12;
    const n2 = d.n2 !== undefined ? d.n2 : 0.12;
    const t1 = d.t1 !== undefined ? d.t1 : 0.34;
    const t2 = d.t2 !== undefined ? d.t2 : 0.66;

    const cp1x = x1 + tx * (dist * t1) + nx * (dist * n1);
    const cp1y = y1 + ty * (dist * t1) + ny * (dist * n1);
    const cp2x = x1 + tx * (dist * t2) + nx * (dist * n2);
    const cp2y = y1 + ty * (dist * t2) + ny * (dist * n2);

    return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
  };

  // 5. Initialize D3 Force Simulation & Graph
  useEffect(() => {
    if (!containerRef.current) return;
    d3.select(containerRef.current).selectAll('*').remove();

    renderCelestialGraticule();
    window.addEventListener('resize', renderCelestialGraticule);

    const width = window.innerWidth;
    const height = window.innerHeight;
    const centerX = width * 0.44;
    const centerY = height * 0.48;

    const clusterAnchors: Record<number, { x: number; y: number }> = {
      1: { x: centerX - 250, y: centerY - 170 }, // AI Agents
      2: { x: centerX + 210, y: centerY - 190 }, // Memory
      3: { x: centerX, y: centerY },             // RAG Center
      4: { x: centerX - 230, y: centerY + 190 }, // Vector DBs
      5: { x: centerX + 40, y: centerY + 240 },  // Semantic Search
      6: { x: centerX + 280, y: centerY + 110 }, // Knowledge Graphs
    };

    // Deep copy data for simulation
    const nodes: CelestialNode[] = JSON.parse(JSON.stringify(CANONICAL_GRAPH.nodes));
    const links: CelestialLink[] = JSON.parse(JSON.stringify(CANONICAL_GRAPH.links));

    const svg = d3.select(containerRef.current)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', [0, 0, width, height]);

    svgRef.current = svg;

    const defs = svg.append('defs');

    // Luminous Terracotta Glow filter
    const glow = defs.append('filter')
      .attr('id', 'terracotta-glow')
      .attr('x', '-50%').attr('y', '-50%')
      .attr('width', '200%').attr('height', '200%');
    glow.append('feGaussianBlur').attr('stdDeviation', '2.5').attr('result', 'blur');
    glow.append('feComposite').attr('in', 'SourceGraphic').attr('in2', 'blur').attr('operator', 'over');

    const mainG = svg.append('g').attr('class', 'main-viewport');

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.35, 3.5])
      .on('zoom', (event) => {
        mainG.attr('transform', event.transform);
      });

    zoomBehaviorRef.current = zoom;
    svg.call(zoom);

    // Initial translation
    svg.call(zoom.transform, d3.zoomIdentity.translate(width * 0.03, height * 0.02).scale(0.98));

    // Force Simulation Setup
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance((d: any) => {
        if (d.type === 'primary') return 180;
        if (d.target?.type === 'entity') return 50;
        return 85;
      }))
      .force('charge', d3.forceManyBody().strength((d: any) => {
        if (d.type === 'hub') return -1350;
        if (d.type === 'concept') return -360;
        return -35;
      }))
      .force('collide', d3.forceCollide().radius((d: any) => d.size + 36))
      .force('x', d3.forceX((d: any) => clusterAnchors[d.group]?.x || centerX).strength(0.07))
      .force('y', d3.forceY((d: any) => clusterAnchors[d.group]?.y || centerY).strength(0.07));

    // Links Layer
    const linkGroup = mainG.append('g').attr('class', 'links-layer');
    const linkElements = linkGroup.selectAll('path')
      .data(links)
      .join('path')
      .attr('class', (d) => `constellation-link link-${d.type || 'concept'}`)
      .attr('fill', 'none')
      .attr('stroke', (d) => {
        if (d.type === 'primary') return '#162135';
        if (d.type === 'bridge') return '#BD532B';
        if (d.weight >= 2.0) return '#5E5648';
        return '#9E9789';
      })
      .attr('stroke-width', (d) => {
        if (d.type === 'primary') return 1.5;
        if (d.type === 'bridge') return 1.15;
        if (d.weight >= 2.0) return 0.95;
        return 0.65;
      })
      .attr('stroke-dasharray', (d) => {
        if (d.type === 'primary') return 'none';
        if (d.type === 'bridge') return '5,3';
        if (d.type === 'entity') return '2,2.5';
        return 'none';
      })
      .attr('stroke-linecap', 'round')
      .attr('opacity', (d) => {
        if (d.type === 'primary') return 0.80;
        if (d.type === 'bridge') return 0.65;
        if (d.type === 'entity') return 0.42;
        return 0.52;
      });

    // Nodes Layer
    const nodeGroup = mainG.append('g').attr('class', 'nodes-layer');
    const nodeElements = nodeGroup.selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', 'stellar-node')
      .attr('cursor', 'pointer')
      .call(d3.drag<any, any>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.2).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
      )
      .on('click', (_, d) => {
        setSelectedNode(d);
        setIsRightSidebarOpen((open) => (open ? open : true));
      });

    nodeElements.each(function (d) {
      const el = d3.select(this);

      if (d.type === 'hub') {
        const majorR = d.focus ? 21 : 18;
        const midR = d.focus ? 13 : 11;
        const innerR = d.focus ? 4.8 : 4.2;

        if (d.focus) {
          el.append('circle')
            .attr('r', 30)
            .attr('fill', 'rgba(189, 83, 43, 0.08)')
            .attr('stroke', 'rgba(189, 83, 43, 0.3)')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '4,4')
            .attr('class', 'pulse-halo');

          const tick = 6;
          el.append('line').attr('x1', 0).attr('y1', -30 - tick).attr('x2', 0).attr('y2', -30 + tick).attr('stroke', 'var(--accent-terracotta)').attr('stroke-width', 1.2);
          el.append('line').attr('x1', 0).attr('y1', 30 - tick).attr('x2', 0).attr('y2', 30 + tick).attr('stroke', 'var(--accent-terracotta)').attr('stroke-width', 1.2);
          el.append('line').attr('x1', -30 - tick).attr('y1', 0).attr('x2', -30 + tick).attr('y2', 0).attr('stroke', 'var(--accent-terracotta)').attr('stroke-width', 1.2);
          el.append('line').attr('x1', 30 - tick).attr('y1', 0).attr('x2', 30 + tick).attr('y2', 0).attr('stroke', 'var(--accent-terracotta)').attr('stroke-width', 1.2);
        }

        // Radiant 8-Point Starburst Body
        el.append('path')
          .attr('d', createStarburstPath(majorR, midR, innerR))
          .attr('fill', d.focus ? 'var(--accent-midnight)' : '#162135')
          .attr('stroke', d.focus ? 'var(--accent-terracotta)' : 'var(--accent-brass)')
          .attr('stroke-width', d.focus ? 1.6 : 1.2)
          .attr('filter', d.focus ? 'url(#terracotta-glow)' : 'none');

        // Central Luminous Nucleus Disc
        el.append('circle')
          .attr('r', 5.5)
          .attr('fill', '#FAF8F2')
          .attr('stroke', d.focus ? 'var(--accent-terracotta)' : 'var(--accent-midnight)')
          .attr('stroke-width', 0.9);

        // Center Radiant Jewel Pip
        el.append('circle')
          .attr('r', 2.2)
          .attr('fill', d.focus ? 'var(--accent-terracotta)' : 'var(--accent-brass)');

      } else if (d.type === 'concept') {
        el.append('circle')
          .attr('r', d.size * 1.35)
          .attr('fill', 'none')
          .attr('stroke', 'rgba(189, 83, 43, 0.22)')
          .attr('stroke-width', 0.7);

        el.append('path')
          .attr('d', createSymmetricalConceptStar(d.size))
          .attr('fill', 'var(--accent-terracotta)')
          .attr('stroke', '#FAF8F2')
          .attr('stroke-width', 0.9);

        el.append('circle')
          .attr('r', 1.4)
          .attr('fill', '#FAF8F2');

      } else {
        el.append('circle')
          .attr('r', d.size)
          .attr('fill', '#878074')
          .attr('stroke', '#FAF8F2')
          .attr('stroke-width', 0.75)
          .attr('opacity', 0.85);
      }
    });

    // Clean Labels with crisp ivory halos
    nodeElements.append('text')
      .attr('dy', (d) => (d.type === 'hub' ? d.size + 16 : d.type === 'concept' ? d.size + 13 : d.size + 8))
      .text((d) => d.label)
      .attr('text-anchor', 'middle')
      .attr('font-family', (d) => (d.type === 'hub' ? 'Newsreader, Georgia, serif' : 'Inter, sans-serif'))
      .attr('font-size', (d) => (d.type === 'hub' ? '13.5px' : d.type === 'concept' ? '11px' : '9px'))
      .attr('font-weight', (d) => (d.type === 'hub' ? '600' : d.type === 'concept' ? '500' : '400'))
      .attr('fill', (d) => (d.focus ? '#162135' : d.type === 'hub' ? '#1C1917' : '#575249'))
      .attr('paint-order', 'stroke')
      .attr('stroke', '#FAF8F2')
      .attr('stroke-width', 4.0)
      .attr('stroke-linejoin', 'round');

    // Simulation Tick Updates
    simulation.on('tick', () => {
      linkElements.attr('d', linkCubicPath);
      nodeElements.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
      window.removeEventListener('resize', renderCelestialGraticule);
    };
  }, [renderCelestialGraticule]);

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
      d3.zoomIdentity.translate(width * 0.03, height * 0.02).scale(0.98)
    );
  };

  return (
    <div className={`h-[calc(100vh-57px)] w-full relative text-[13px] leading-relaxed select-none overflow-hidden ${isFullscreen ? 'focused-view' : ''}`}>
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

      {/* Persistent Reopen Left Edge Tab */}
      {!isLeftSidebarOpen && (
        <div id="reopen-left-sidebar" className="fixed top-20 left-0 z-30 pointer-events-auto">
          <button
            type="button"
            onClick={() => setIsLeftSidebarOpen(true)}
            className="bg-[var(--bg-panel)]/95 hover:bg-white backdrop-blur-md border border-l-0 border-[var(--border-strong)] rounded-r-xl shadow-md py-2 px-3 flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)] transition-all active:scale-95 group"
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
            <span>Constellations</span>
          </button>
        </div>
      )}

      {/* Persistent Reopen Right Edge Tab */}
      {!isRightSidebarOpen && (
        <div id="reopen-right-sidebar" className="fixed top-20 right-0 z-30 pointer-events-auto">
          <button
            type="button"
            onClick={() => setIsRightSidebarOpen(true)}
            className="bg-[var(--bg-panel)]/95 hover:bg-white backdrop-blur-md border border-r-0 border-[var(--border-strong)] rounded-l-xl shadow-md py-2 px-3 flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)] transition-all active:scale-95 group"
            title="Expand Knowledge Details"
          >
            <span>Knowledge Details</span>
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

      {/* ================= TOP HUD: FOCUS COORDINATES ================= */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex items-center justify-center">
        <div className="bg-[var(--bg-panel)]/95 backdrop-blur-md border border-[var(--border-strong)] rounded-xl px-4 py-2 shadow-sm flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[var(--accent-terracotta)] animate-pulse" />
          <div className="flex flex-col">
            <span className="serif text-sm font-semibold text-[var(--ink-primary)] leading-tight">
              {selectedNode.label}
            </span>
            <span className="mono text-[10px] text-[var(--ink-tertiary)]">
              {selectedNode.coords || 'RA 04ʰ 28ᵐ 17ˢ · DEC +15° 52′ 00″'}
            </span>
          </div>
          <span className="mono text-[10px] text-[var(--accent-brass)] bg-white px-1.5 py-0.5 rounded border border-[var(--border-parchment)]">
            {selectedNode.catalog || 'HYA-03'}
          </span>
        </div>
      </div>

      {/* ================= LEFT SIDEBAR (CONSTELLATIONS & FILTERS) ================= */}
      {isLeftSidebarOpen && (
        <aside
          id="left-sidebar"
          className="sidebar-transition absolute top-5 left-6 w-[280px] max-h-[calc(100vh-140px)] z-10 flex flex-col pointer-events-none"
        >
          <div className="instrument-panel flex-1 flex flex-col pointer-events-auto overflow-hidden">
            <div className="panel-bracket-tl" />
            <div className="panel-bracket-br" />

            {/* Header */}
            <div className="px-4 py-3 border-b border-[var(--border-parchment)] bg-[var(--bg-panel-subtle)] flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.2em] font-medium text-[var(--ink-secondary)] flex items-center gap-2">
                <i className="ph ph-compass-tool text-xs text-[var(--accent-midnight)]" />
                <span>Hyades Constellations</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] mono text-[var(--ink-tertiary)]">4 SECTORS</span>
                <button
                  type="button"
                  onClick={() => setIsLeftSidebarOpen(false)}
                  className="w-6 h-6 rounded flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white transition-colors"
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
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
              {/* Constellations list */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-[0.18em] font-medium text-[var(--ink-secondary)]">
                    Constellations
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const found = CANONICAL_GRAPH.nodes.find((n) => n.id === 'hub_rag');
                      if (found) setSelectedNode(found);
                    }}
                    className="w-full text-left p-2.5 rounded-lg border border-[var(--ink-primary)] bg-white shadow-xs flex items-center justify-between group transition-all"
                  >
                    <div className="flex items-center gap-2.5">
                      <svg width="12" height="12" viewBox="-5 -5 10 10" fill="var(--accent-terracotta)">
                        <path d="M 0 -5 L 1.2 -1.2 L 5 0 L 1.2 1.2 L 0 5 L -1.2 1.2 L -5 0 L -1.2 -1.2 Z" />
                      </svg>
                      <div>
                        <div className="text-xs font-semibold text-[var(--ink-primary)] leading-tight">Retrieval & RAG</div>
                        <div className="text-[10px] text-[var(--ink-secondary)] mono">SECTOR II · 28 ATOMS</div>
                      </div>
                    </div>
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-terracotta)]" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const found = CANONICAL_GRAPH.nodes.find((n) => n.id === 'hub_agents');
                      if (found) setSelectedNode(found);
                    }}
                    className="w-full text-left p-2.5 rounded-lg border border-[var(--border-parchment)] bg-transparent hover:bg-white hover:border-[var(--border-strong)] transition-all flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2.5">
                      <svg width="12" height="12" viewBox="-5 -5 10 10" fill="var(--accent-midnight)">
                        <path d="M 0 -5 L 1.2 -1.2 L 5 0 L 1.2 1.2 L 0 5 L -1.2 1.2 L -5 0 L -1.2 -1.2 Z" />
                      </svg>
                      <div>
                        <div className="text-xs font-medium text-[var(--ink-secondary)] group-hover:text-[var(--ink-primary)] leading-tight">AI Agent Systems</div>
                        <div className="text-[10px] text-[var(--ink-tertiary)] mono">SECTOR I · 20 ATOMS</div>
                      </div>
                    </div>
                    <span className="text-[10px] text-[var(--ink-tertiary)] mono">0.86</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const found = CANONICAL_GRAPH.nodes.find((n) => n.id === 'hub_kg');
                      if (found) setSelectedNode(found);
                    }}
                    className="w-full text-left p-2.5 rounded-lg border border-[var(--border-parchment)] bg-transparent hover:bg-white hover:border-[var(--border-strong)] transition-all flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2.5">
                      <svg width="12" height="12" viewBox="-5 -5 10 10" fill="var(--accent-brass)">
                        <path d="M 0 -5 L 1.2 -1.2 L 5 0 L 1.2 1.2 L 0 5 L -1.2 1.2 L -5 0 L -1.2 -1.2 Z" />
                      </svg>
                      <div>
                        <div className="text-xs font-medium text-[var(--ink-secondary)] group-hover:text-[var(--ink-primary)] leading-tight">Knowledge Graphs</div>
                        <div className="text-[10px] text-[var(--ink-tertiary)] mono">SECTOR III · 18 ATOMS</div>
                      </div>
                    </div>
                    <span className="text-[10px] text-[var(--ink-tertiary)] mono">0.74</span>
                  </button>
                </div>
              </div>

              <div className="w-full h-px bg-[var(--border-parchment)]" />

              {/* Celestial Filters */}
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] font-medium text-[var(--ink-secondary)] mb-2">
                  Celestial Filters
                </div>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center justify-between py-1 cursor-pointer">
                    <span className="flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)]">
                      <svg width="12" height="12" viewBox="-6 -6 12 12" fill="var(--accent-midnight)">
                        <path d="M 0 -6 L 1.5 -1.5 L 6 0 L 1.5 1.5 L 0 6 L -1.5 1.5 L -6 0 L -1.5 -1.5 Z" />
                      </svg>
                      Major Starbursts
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

                  <label className="flex items-center justify-between py-1 cursor-pointer">
                    <span className="flex items-center gap-2 text-xs font-medium text-[var(--ink-secondary)]">
                      <i className="ph ph-file-text text-sm" />
                      Literature & Papers
                    </span>
                    <input
                      type="checkbox"
                      checked={filterEntities}
                      onChange={(e) => setFilterEntities(e.target.checked)}
                      className="rounded accent-[var(--accent-midnight)] cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* ================= VERTICAL GRAPH CONTROLS ================= */}
      <div
        id="graph-controls"
        className={`absolute bottom-6 z-20 pointer-events-auto flex flex-col items-center gap-1 bg-[var(--bg-panel)]/95 backdrop-blur-md border border-[var(--border-strong)] rounded-xl p-1 shadow-sm w-9 transition-all duration-300 ${
          isRightSidebarOpen ? 'right-[416px]' : 'right-6'
        }`}
      >
        <button
          type="button"
          onClick={() => handleZoom(1.25)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--ink-primary)] transition-colors"
          title="Zoom In (+)"
        >
          <i className="ph-bold ph-plus text-xs" />
        </button>

        <button
          type="button"
          onClick={() => handleZoom(0.8)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--ink-primary)] transition-colors"
          title="Zoom Out (–)"
        >
          <i className="ph-bold ph-minus text-xs" />
        </button>

        <div className="w-4 h-px bg-[var(--border-parchment)] mx-auto my-0.5" />

        <button
          type="button"
          onClick={handleRecenter}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--ink-primary)] transition-colors"
          title="Recenter Constellation"
        >
          <i className="ph-bold ph-crosshair text-xs" />
        </button>

        <button
          type="button"
          onClick={() => setShowAtlasPlate((prev) => !prev)}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
            showAtlasPlate ? 'text-[var(--accent-midnight)] bg-[var(--bg-panel-subtle)]' : 'text-[var(--ink-tertiary)]'
          }`}
          title="Toggle Archival Atlas Plate"
        >
          <i className="ph-bold ph-newspaper-clipping text-xs" />
        </button>

        <button
          type="button"
          onClick={() => setShowGraticule((prev) => !prev)}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
            showGraticule ? 'text-[var(--accent-midnight)] bg-[var(--bg-panel-subtle)]' : 'text-[var(--ink-tertiary)]'
          }`}
          title="Toggle Celestial Coordinates"
        >
          <i className="ph-bold ph-grid-four text-xs" />
        </button>

        <div className="w-4 h-px bg-[var(--border-parchment)] mx-auto my-0.5" />

        <button
          type="button"
          onClick={toggleFullscreen}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--ink-primary)] transition-colors"
          title={isFullscreen ? 'Exit Focus View' : 'Focus / Fullscreen View'}
        >
          <i className={`ph-bold ${isFullscreen ? 'ph-corners-in' : 'ph-corners-out'} text-xs text-[var(--accent-terracotta)]`} />
        </button>
      </div>

      {/* ================= RIGHT KNOWLEDGE DOSSIER PANEL ================= */}
      {isRightSidebarOpen && (
        <aside
          id="right-sidebar"
          className="sidebar-transition absolute top-5 right-6 bottom-6 w-[390px] z-10 flex flex-col pointer-events-none"
        >
          <div className="instrument-panel flex-1 flex flex-col pointer-events-auto overflow-hidden">
            <div className="panel-bracket-tl" />
            <div className="panel-bracket-br" />

            {/* Panel Header */}
            <div className="p-6 border-b border-[var(--border-parchment)] bg-white relative">
              <button
                type="button"
                onClick={() => setIsRightSidebarOpen(false)}
                className="absolute top-5 right-5 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--ink-primary)] transition-colors"
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
                <span>Knowledge Hub Dossier</span>
              </div>

              {/* Node Title */}
              <h2 className="serif text-3xl font-semibold text-[var(--ink-primary)] tracking-tight leading-tight mb-2">
                {selectedNode.label}
              </h2>

              {/* Context & Classification */}
              <div className="flex items-center gap-3 text-xs text-[var(--ink-secondary)]">
                <span className="flex items-center gap-1.5">
                  <i className="ph ph-compass" /> Central Knowledge Hub
                </span>
                <span className="w-1 h-1 rounded-full bg-[var(--border-strong)]" />
                <span className="mono text-[11px] text-[var(--accent-brass)]">Rank: 0.942</span>
              </div>
            </div>

            {/* Scrollable Scientific Context & Dossier */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              {/* Epistemic Abstract */}
              <div>
                <p className="text-[13px] leading-relaxed text-[var(--ink-archival)]">
                  {selectedNode.desc ||
                    'A dual-process architectural paradigm connecting static parametric LLM weights with external dynamic vector memory. It indexes corpora into dense embeddings, resolves semantic proximity queries via approximate nearest-neighbor search, and injects retrieved context windows directly into generative inference.'}
                </p>
              </div>

              {/* Local Constellation */}
              <div>
                <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-1.5 mb-3">
                  <h3 className="serif-italic text-lg font-medium text-[var(--ink-primary)]">Local Constellation</h3>
                  <span className="text-[10px] mono text-[var(--ink-tertiary)]">EPICENTER LINKS</span>
                </div>

                <div className="flex flex-col gap-2">
                  {(selectedNode.connections || [
                    { id: 'hub_rag', name: 'Retrieval Augmented Gen', type: 'Core Pathway', corr: '0.85' },
                    { id: 'hub_vector_dbs', name: 'Vector Databases', type: 'Index Store', corr: '0.79' },
                    { id: 'concept_embeddings', name: 'Dense Embeddings', type: 'Substrate', corr: '0.88' },
                  ]).map((conn) => (
                    <div
                      key={conn.id}
                      onClick={() => {
                        const target = CANONICAL_GRAPH.nodes.find((n) => n.id === conn.id);
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
                      <span className="mono text-[10px] text-[var(--ink-secondary)]">{conn.corr}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Related Sources */}
              <div>
                <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-1.5 mb-3">
                  <h3 className="serif-italic text-lg font-medium text-[var(--ink-primary)]">Related Sources</h3>
                  <span className="text-[10px] mono text-[var(--ink-tertiary)]">LITERATURE & CORPUS</span>
                </div>

                <div className="flex flex-col gap-2">
                  <div
                    onClick={() => onNavigateToDestination && onNavigateToDestination('library')}
                    className="card-surface p-3 flex items-start gap-3 cursor-pointer group"
                  >
                    <i className="ph ph-book-open text-base text-[var(--accent-terracotta)] mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-[var(--ink-primary)] leading-snug group-hover:underline">
                        Lewis et al. — Retrieval-Augmented Generation for Knowledge-Intensive NLP
                      </div>
                      <div className="text-[10px] text-[var(--ink-secondary)] mono mt-0.5">NeurIPS 2020 · 4,210 Citations</div>
                    </div>
                  </div>

                  <div
                    onClick={() => onNavigateToDestination && onNavigateToDestination('library')}
                    className="card-surface p-3 flex items-start gap-3 cursor-pointer group"
                  >
                    <i className="ph ph-article text-base text-[var(--accent-midnight)] mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-[var(--ink-primary)] leading-snug group-hover:underline">
                        Karpukhin et al. — Dense Passage Retrieval for Open-Domain Question Answering
                      </div>
                      <div className="text-[10px] text-[var(--ink-secondary)] mono mt-0.5">EMNLP 2020 · 2,890 Citations</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Epistemic Metrics */}
              <div className="bg-[var(--bg-panel-subtle)] p-3 rounded-lg border border-[var(--border-parchment)] text-xs">
                <div className="text-[10px] uppercase tracking-[0.2em] font-medium text-[var(--ink-secondary)] mb-2">
                  Epistemic Metrics
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] mono">
                  <div>
                    <span className="text-[var(--ink-tertiary)]">Degree Cent:</span>{' '}
                    <span className="text-[var(--ink-primary)]">0.942</span>
                  </div>
                  <div>
                    <span className="text-[var(--ink-tertiary)]">Clustering Coeff:</span>{' '}
                    <span className="text-[var(--ink-primary)]">0.781</span>
                  </div>
                  <div>
                    <span className="text-[var(--ink-tertiary)]">Eigenvector:</span>{' '}
                    <span className="text-[var(--ink-primary)]">0.9612</span>
                  </div>
                  <div>
                    <span className="text-[var(--ink-tertiary)]">Triad Faith:</span>{' '}
                    <span className="text-[var(--ink-primary)]">0.982</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-[var(--border-parchment)] bg-white flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigateToDestination && onNavigateToDestination('stella')}
                className="flex-1 bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] transition-colors py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-2 shadow-2xs"
              >
                <i className="ph ph-sparkle text-[var(--accent-brass)]" />
                <span>Consult Stella on Node</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateToDestination && onNavigateToDestination('library')}
                className="p-2 border border-[var(--border-strong)] rounded-lg text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-panel-subtle)] transition-colors"
                title="View in Library"
              >
                <i className="ph ph-books text-sm" />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* ================= BOTTOM SEARCH BAR ================= */}
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
            placeholder="Search celestial constellation..."
            className="flex-1 bg-transparent border-none outline-none text-xs text-[var(--ink-primary)] placeholder:text-[var(--ink-tertiary)]"
          />
          <kbd className="px-1.5 py-0.5 rounded border border-[var(--border-parchment)] bg-[var(--bg-panel-subtle)] text-[10px] mono text-[var(--ink-tertiary)]">
            /
          </kbd>
        </div>
      </div>
    </div>
  );
};
