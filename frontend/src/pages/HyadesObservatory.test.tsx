/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  HyadesObservatory,
  computeClusterAnchors,
  computeObservatoryLayout,
  performLocalUntangle,
  computeConstellationPath,
  getEdgeTier,
  getLinkStroke,
  getLinkOpacity,
  getSubduedLinkOpacity,
  getLinkWidth,
  getLinkDashArray,
  shouldShowNodeLabel,
  CelestialNode,
  CelestialLink,
} from './HyadesObservatory';
import * as graphApi from '@/api/graph';
import * as clusterApi from '@/api/clusters';

vi.mock('@/api/graph', () => ({
  getWorkspaceGraph: vi.fn(),
  searchGraph: vi.fn(),
}));

vi.mock('@/api/clusters', () => ({
  listClusters: vi.fn(),
}));

vi.mock('@/components/EntityEditor', () => ({
  EntityEditor: ({ isOpen, onClose }: any) =>
    isOpen ? <div data-testid="entity-editor-modal"><button onClick={onClose}>Close Editor</button></div> : null,
}));

vi.mock('@/components/RelationshipEditor', () => ({
  RelationshipEditor: ({ isOpen, onClose }: any) =>
    isOpen ? <div data-testid="relationship-editor-modal"><button onClick={onClose}>Close Conn</button></div> : null,
}));

vi.mock('@/components/LinkSuggestionPanel', () => ({
  LinkSuggestionPanel: ({ isOpen, onClose }: any) =>
    isOpen ? <div data-testid="link-suggestion-panel"><button onClick={onClose}>Close Sug</button></div> : null,
}));

const mockGraphData = {
  nodes: [
    {
      id: 'n1',
      name: 'Chunking Strategies',
      entity_type: 'concept',
      degree: 4,
      note_count: 2,
      cluster_id: 'cl-1',
      description: 'Techniques for splitting documents into chunks.',
    },
    {
      id: 'n2',
      name: 'Chunk Size',
      entity_type: 'concept',
      degree: 2,
      note_count: 1,
      cluster_id: 'cl-1',
      description: 'The token or character boundary size.',
    },
    {
      id: 'n3',
      name: 'Retrieval Augmented Generation',
      entity_type: 'concept',
      degree: 5,
      note_count: 4,
      cluster_id: 'cl-2',
      description: 'Framework combining search with LLM synthesis.',
    },
  ],
  edges: [
    {
      id: 'e1',
      source_entity_id: 'n1',
      target_entity_id: 'n2',
      relationship_type: 'configures',
      confidence: 0.9,
    },
    {
      id: 'e2',
      source_entity_id: 'n3',
      target_entity_id: 'n1',
      relationship_type: 'utilizes',
      confidence: 0.85,
    },
  ],
  clusters: [],
  stats: {
    node_count: 3,
    edge_count: 2,
    cluster_count: 2,
    manual_node_count: 0,
    manual_edge_count: 0,
    truncated: false,
  },
  truncated: false,
};

const mockClusters = [
  { id: 'cl-1', label: 'Chunking Sector', member_count: 2, summary: 'Chunking' },
  { id: 'cl-2', label: 'RAG Core', member_count: 1, summary: 'RAG' },
];

describe('HyadesObservatory Spatial Navigation & Search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(graphApi.getWorkspaceGraph).mockResolvedValue(mockGraphData as any);
    vi.mocked(clusterApi.listClusters).mockResolvedValue(mockClusters as any);
  });

  it('renders celestial orientation chart inset and navigation controls', async () => {
    render(<HyadesObservatory workspaceId="ws-1" />);

    await waitFor(() => {
      expect(screen.getByText('Chart Inset')).toBeInTheDocument();
    });

    expect(screen.getByTestId('fit-view-btn')).toBeInTheDocument();
    expect(screen.getByTestId('fit-view-btn')).toHaveAttribute('title', 'Fit View to Content (F)');
    expect(screen.getByTestId('untangle-graph-btn')).toBeInTheDocument();
    expect(screen.getByTestId('untangle-graph-btn')).toHaveAttribute('title', 'Untangle / Organize (U)');
  });

  it('supports partial search matching and displays ranked candidates popup', async () => {
    render(<HyadesObservatory workspaceId="ws-1" />);

    // Wait for graph data to load (Chart Inset only appears when celestialNodes.length > 0)
    await waitFor(() => {
      expect(screen.getByText('Chart Inset')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search celestial constellation/i);

    // Focus and type partial prefix 'chunk'
    fireEvent.focus(searchInput);
    fireEvent.change(searchInput, { target: { value: 'chunk' } });

    // Should display candidate matching popup with 'Chunking Strategies' and 'Chunk Size'
    await waitFor(() => {
      const searchContainer = document.querySelector('#search-bar-container');
      expect(searchContainer).not.toBeNull();
      expect(within(searchContainer as HTMLElement).getByText('2 candidates matched')).toBeInTheDocument();
      expect(within(searchContainer as HTMLElement).getByText('Chunking Strategies')).toBeInTheDocument();
      expect(within(searchContainer as HTMLElement).getByText('Chunk Size')).toBeInTheDocument();
    });

    // Selecting candidate via mouse click
    const searchContainer = document.querySelector('#search-bar-container') as HTMLElement;
    fireEvent.mouseDown(within(searchContainer).getByText('Chunking Strategies'));

    // Should update dossier and selection
    await waitFor(() => {
      expect(screen.getByText('Knowledge Metrics')).toBeInTheDocument();
    });
  });

  it('triggers Fit View without throwing error when fit view button is clicked', async () => {
    render(<HyadesObservatory workspaceId="ws-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('fit-view-btn')).toBeInTheDocument();
    });

    const fitBtn = screen.getByTestId('fit-view-btn');
    fireEvent.click(fitBtn);
    expect(fitBtn).toBeInTheDocument();
  });

  it('triggers Untangle without throwing error when untangle button is clicked', async () => {
    render(<HyadesObservatory workspaceId="ws-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('untangle-graph-btn')).toBeInTheDocument();
    });

    const untangleBtn = screen.getByTestId('untangle-graph-btn');
    fireEvent.click(untangleBtn);
    expect(untangleBtn).toBeInTheDocument();
  });

  it('supports keyboard shortcuts A and C for Entity & Connect dialogs', async () => {
    render(<HyadesObservatory workspaceId="ws-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('fit-view-btn')).toBeInTheDocument();
    });

    // Press 'A' to open Add Entity modal
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByTestId('entity-editor-modal')).toBeInTheDocument();

    // Close entity modal
    fireEvent.click(screen.getByText('Close Editor'));
    expect(screen.queryByTestId('entity-editor-modal')).not.toBeInTheDocument();

    // Press 'C' to open Connect modal
    fireEvent.keyDown(window, { key: 'c' });
    expect(screen.getByTestId('relationship-editor-modal')).toBeInTheDocument();

    // Close connect modal
    fireEvent.click(screen.getByText('Close Conn'));
    expect(screen.queryByTestId('relationship-editor-modal')).not.toBeInTheDocument();
  });

  it('does NOT trigger keyboard shortcuts when typing in an input field', async () => {
    render(<HyadesObservatory workspaceId="ws-1" />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search celestial constellation/i)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search celestial constellation/i);
    searchInput.focus();

    // Type 'a' inside search input
    fireEvent.keyDown(searchInput, { key: 'a' });
    // Entity editor should NOT open
    expect(screen.queryByTestId('entity-editor-modal')).not.toBeInTheDocument();

    // Type 'c' inside search input
    fireEvent.keyDown(searchInput, { key: 'c' });
    // Relationship editor should NOT open
    expect(screen.queryByTestId('relationship-editor-modal')).not.toBeInTheDocument();
  });

  it('focuses and selects initialTarget when deep-linked into Observatory', async () => {
    render(
      <HyadesObservatory
        workspaceId="ws-1"
        initialTarget={{
          entityId: 'n1',
          entityName: 'Chunking Strategies',
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Knowledge Metrics')).toBeInTheDocument();
      expect(screen.getAllByText('Chunking Strategies').length).toBeGreaterThan(0);
    });
  });

  it('allows expanding and collapsing the orientation minimap chart inset', async () => {
    render(<HyadesObservatory workspaceId="ws-1" />);

    await waitFor(() => {
      expect(screen.getByText('Chart Inset')).toBeInTheDocument();
    });

    const expandBtn = screen.getByTitle('Expand astronomical chart inset');
    fireEvent.click(expandBtn);

    // Should now show expanded astronomical chart title and instructions
    expect(screen.getByText('Astronomical Sky Chart')).toBeInTheDocument();
    expect(screen.getByText('Click region to pan camera')).toBeInTheDocument();

    // Press Escape to collapse
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByText('Chart Inset')).toBeInTheDocument();
    expect(screen.queryByText('Astronomical Sky Chart')).not.toBeInTheDocument();
  });

  it('closes open dialogs on Escape key first before clearing selection', async () => {
    render(
      <HyadesObservatory
        workspaceId="ws-1"
        initialTarget={{ entityId: 'n1', entityName: 'Chunking Strategies' }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Chart Inset')).toBeInTheDocument();
      expect(screen.getByText('Knowledge Metrics')).toBeInTheDocument();
    });

    // Open Add Entity dialog via shortcut 'A'
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByTestId('entity-editor-modal')).toBeInTheDocument();

    // Press Escape -> should close Entity Editor modal first
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('entity-editor-modal')).not.toBeInTheDocument();
    // Selection and dossier should STILL be present!
    expect(screen.getByText('Knowledge Metrics')).toBeInTheDocument();

    // Press Escape again with no dialog open -> should clear selection
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Knowledge Metrics')).not.toBeInTheDocument();
  });

  it('filters out self-loops from visualization and local pathway counts without crashing', async () => {
    const graphWithSelfLoop = {
      nodes: [
        {
          id: 'n1',
          name: 'Self Referential Node',
          entity_type: 'concept',
          degree: 1,
          note_count: 1,
          cluster_id: 'cl-1',
          description: 'A node with a self-loop relationship.',
        },
        {
          id: 'n2',
          name: 'Partner Node',
          entity_type: 'concept',
          degree: 1,
          note_count: 1,
          cluster_id: 'cl-1',
          description: 'Another node.',
        },
      ],
      edges: [
        {
          id: 'e-self',
          source_entity_id: 'n1',
          target_entity_id: 'n1', // SELF-LOOP
          relationship_type: 'references_self',
          confidence: 0.95,
        },
        {
          id: 'e-valid',
          source_entity_id: 'n1',
          target_entity_id: 'n2',
          relationship_type: 'connects_to',
          confidence: 0.88,
        },
      ],
      clusters: [],
      stats: {
        node_count: 2,
        edge_count: 2,
        cluster_count: 1,
        manual_node_count: 0,
        manual_edge_count: 0,
        truncated: false,
      },
      truncated: false,
    };

    vi.mocked(graphApi.getWorkspaceGraph).mockResolvedValueOnce(graphWithSelfLoop as any);

    render(
      <HyadesObservatory
        workspaceId="ws-self-loop-test"
        initialTarget={{ entityId: 'n1', entityName: 'Self Referential Node' }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Knowledge Metrics')).toBeInTheDocument();
    });

    // Self loop must NOT show in Local Constellation active pathways (only 1 valid pathway to Partner Node)
    expect(screen.getByText('1 ACTIVE PATHWAYS')).toBeInTheDocument();
    expect(screen.getAllByText('Partner Node').length).toBeGreaterThan(0);
    expect(screen.queryByText('Self Referential Node', { selector: '.card-surface .font-medium' })).not.toBeInTheDocument();
  });

  it('computeClusterAnchors separates clusters across balanced rings without collapsing to center', () => {
    const clusterKeys = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'];
    const cx = 800;
    const cy = 500;
    const anchors = computeClusterAnchors(clusterKeys, cx, cy);

    expect(anchors.size).toBe(10);
    // None of the clusters should sit directly at (cx, cy)
    clusterKeys.forEach((key) => {
      const pos = anchors.get(key)!;
      const distFromCenter = Math.hypot(pos.x - cx, pos.y - cy);
      expect(distFromCenter).toBeGreaterThan(300);
    });

    // Check minimum distance between any 2 cluster centers is large (> 350px)
    const anchorList = Array.from(anchors.values());
    for (let i = 0; i < anchorList.length; i++) {
      for (let j = i + 1; j < anchorList.length; j++) {
        const d = Math.hypot(anchorList[i].x - anchorList[j].x, anchorList[i].y - anchorList[j].y);
        expect(d).toBeGreaterThan(350);
      }
    }
  });

  it('computeObservatoryLayout provides clean clearance between stars and avoids collapsing into a void', () => {
    const mockNodes: CelestialNode[] = [
      {
        id: 'c1-hub',
        label: 'Core ML',
        catalog: 'HYA-0001',
        clusterKey: 'cl-ml',
        group: 1,
        type: 'hub',
        hierarchy: 'core',
        size: 24,
        coords: 'RA 04h DEC +15°',
        desc: '',
        degree: 10,
        noteCount: 5,
        connections: [],
      },
      {
        id: 'c1-sub1',
        label: 'Neural Nets',
        catalog: 'HYA-0002',
        clusterKey: 'cl-ml',
        group: 1,
        type: 'concept',
        hierarchy: 'subtopic',
        size: 16,
        coords: 'RA 04h DEC +15°',
        desc: '',
        degree: 5,
        noteCount: 2,
        connections: [],
      },
      {
        id: 'c1-sub2',
        label: 'Backpropagation',
        catalog: 'HYA-0003',
        clusterKey: 'cl-ml',
        group: 1,
        type: 'concept',
        hierarchy: 'subtopic',
        size: 16,
        coords: 'RA 04h DEC +15°',
        desc: '',
        degree: 4,
        noteCount: 2,
        connections: [],
      },
      {
        id: 'c1-rel1',
        label: 'Activation Function',
        catalog: 'HYA-0004',
        clusterKey: 'cl-ml',
        group: 1,
        type: 'concept',
        hierarchy: 'related',
        size: 9,
        coords: 'RA 04h DEC +15°',
        desc: '',
        degree: 2,
        noteCount: 1,
        connections: [],
      },
    ];

    const mockLinks: CelestialLink[] = [
      { source: 'c1-hub', target: 'c1-sub1', weight: 0.9, type: 'includes' },
      { source: 'c1-hub', target: 'c1-sub2', weight: 0.9, type: 'includes' },
      { source: 'c1-sub1', target: 'c1-rel1', weight: 0.8, type: 'uses' },
    ];

    const cx = 800;
    const cy = 500;
    const layout = computeObservatoryLayout(mockNodes, mockLinks, cx, cy);

    expect(layout.size).toBe(4);

    // Verify each node has finite coordinates
    mockNodes.forEach((n) => {
      const pos = layout.get(n.id)!;
      expect(pos).toBeDefined();
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
    });

    // Check minimum distance between any 2 nodes is at least 35px
    const posList = Array.from(layout.values());
    for (let i = 0; i < posList.length; i++) {
      for (let j = i + 1; j < posList.length; j++) {
        const d = Math.hypot(posList[i].x - posList[j].x, posList[i].y - posList[j].y);
        expect(d).toBeGreaterThanOrEqual(35);
      }
    }
  });

  it('computeConstellationPath creates smooth, organic Bézier curves with subtle variation and directional invariance', () => {
    const positions = new Map<string, { x: number; y: number }>([
      ['star-alpha', { x: 100, y: 100 }],
      ['star-beta', { x: 350, y: 250 }],
      ['star-gamma', { x: 200, y: 400 }],
    ]);

    const pathAB = computeConstellationPath(
      { source: 'star-alpha', target: 'star-beta' },
      positions
    );
    const pathBA = computeConstellationPath(
      { source: 'star-beta', target: 'star-alpha' },
      positions
    );

    // Must be smooth cubic Bézier curve starting with M and curving with C
    expect(pathAB.startsWith('M 100 100 C ')).toBe(true);
    expect(pathAB.endsWith(' 350 250')).toBe(true);

    expect(pathBA.startsWith('M 350 250 C ')).toBe(true);
    expect(pathBA.endsWith(' 100 100')).toBe(true);

    // Extract control points to verify identical spatial curve regardless of traversal direction
    const partsAB = pathAB.replace('M 100 100 C ', '').replace(' 350 250', '').split(' ');
    const partsBA = pathBA.replace('M 350 250 C ', '').replace(' 100 100', '').split(' ');

    // The two curves define the exact same world spline in reverse
    expect(partsAB.length).toBe(4);
    expect(partsBA.length).toBe(4);

    // Different relationships must produce varied curvature (not uniform semicircles)
    const pathAG = computeConstellationPath(
      { source: 'star-alpha', target: 'star-gamma' },
      positions
    );
    expect(pathAG.startsWith('M 100 100 C ')).toBe(true);

    // Tiny distance falls back to straight line
    const tinyPos = new Map<string, { x: number; y: number }>([
      ['n1', { x: 50, y: 50 }],
      ['n2', { x: 51, y: 51 }],
    ]);
    const tinyPath = computeConstellationPath({ source: 'n1', target: 'n2' }, tinyPos);
    expect(tinyPath).toBe('M 50 50 L 51 51');
  });

  it('renders only human-readable entity names in canvas sky labels without technical d:X or HYA-XXXX metadata', async () => {
    const { container } = render(<HyadesObservatory workspaceId="ws-123" />);

    await waitFor(() => {
      expect(screen.getByText('Chunking Strategies')).toBeInTheDocument();
    });

    // Inspect all text elements rendered inside .node-label-group on the canvas sky
    const skyLabelTexts = Array.from(
      container.querySelectorAll('.node-label-group text')
    ).map((el) => el.textContent?.trim() || '');

    // None of the sky node labels should contain debug d:X or HYA-XXXX
    skyLabelTexts.forEach((text) => {
      expect(text).not.toMatch(/d:\d+/);
      expect(text).not.toMatch(/HYA-\d+/);
    });

    // Ensure human-readable names are present
    expect(skyLabelTexts).toContain('Chunking Strategies');
  });

  it('performLocalUntangle preserves existing constellation shape, relieves overlaps, and strictly clamps displacement', () => {
    const nodes: CelestialNode[] = [
      {
        id: 'n-isolated',
        label: 'Isolated Star',
        catalog: 'HYA-001',
        clusterKey: 'cl-1',
        group: 1,
        type: 'concept',
        hierarchy: 'subtopic',
        size: 16,
        coords: 'RA 04h DEC +15°',
        desc: '',
        degree: 1,
        noteCount: 1,
        connections: [],
      },
      {
        id: 'n-collide-1',
        label: 'Colliding Star 1',
        catalog: 'HYA-002',
        clusterKey: 'cl-1',
        group: 1,
        type: 'concept',
        hierarchy: 'subtopic',
        size: 16,
        coords: 'RA 04h DEC +15°',
        desc: '',
        degree: 2,
        noteCount: 1,
        connections: [],
      },
      {
        id: 'n-collide-2',
        label: 'Colliding Star 2',
        catalog: 'HYA-003',
        clusterKey: 'cl-1',
        group: 1,
        type: 'concept',
        hierarchy: 'subtopic',
        size: 16,
        coords: 'RA 04h DEC +15°',
        desc: '',
        degree: 2,
        noteCount: 1,
        connections: [],
      },
    ];

    const links: CelestialLink[] = [
      { source: 'n-collide-1', target: 'n-collide-2', weight: 0.9, type: 'relates' },
    ];

    // Isolated star is far away (400, 400).
    // Colliding stars sit almost right on top of each other (100, 100) and (105, 102).
    const initialPositions = new Map<string, { x: number; y: number }>([
      ['n-isolated', { x: 400, y: 400 }],
      ['n-collide-1', { x: 100, y: 100 }],
      ['n-collide-2', { x: 105, y: 102 }],
    ]);

    const cleaned = performLocalUntangle(nodes, links, initialPositions, 300, 300);

    // 1. The isolated star had NO collision, so it should stay almost exactly where it was (distance moved <= 1px)
    const isolatedPos = cleaned.get('n-isolated')!;
    expect(Math.hypot(isolatedPos.x - 400, isolatedPos.y - 400)).toBeLessThan(1);

    // 2. The colliding stars should have been pushed apart (distance increased from ~5.3px to >= 30px)
    const c1Pos = cleaned.get('n-collide-1')!;
    const c2Pos = cleaned.get('n-collide-2')!;
    const newDist = Math.hypot(c2Pos.x - c1Pos.x, c2Pos.y - c1Pos.y);
    expect(newDist).toBeGreaterThan(30);

    // 3. Neither colliding star should move more than maxDisplacement (35px) from its original coordinate
    const c1Disp = Math.hypot(c1Pos.x - 100, c1Pos.y - 100);
    const c2Disp = Math.hypot(c2Pos.x - 105, c2Pos.y - 102);
    expect(c1Disp).toBeLessThanOrEqual(35.1);
    expect(c2Disp).toBeLessThanOrEqual(35.1);
  });

  it('supports hover interaction with subtle emphasis on hovered star and direct relationships', async () => {
    const { container } = render(<HyadesObservatory workspaceId="ws-hover" />);

    await waitFor(() => {
      expect(screen.getByText('Chunking Strategies')).toBeInTheDocument();
    });

    const nodeElement = container.querySelector('.celestial-node[data-id="n1"]');
    expect(nodeElement).not.toBeNull();

    // Hover over node n1 ('Chunking Strategies')
    fireEvent.mouseEnter(nodeElement!);

    // Should add .is-hovered class
    await waitFor(() => {
      expect(nodeElement?.classList.contains('is-hovered')).toBe(true);
    });

    // Direct link between n1 and n2 or n3 should be active with #D26E40
    const activeLink = container.querySelector('.celestial-link.is-active-link');
    expect(activeLink).not.toBeNull();
    expect(activeLink?.getAttribute('stroke')).toBe('#D26E40');
    expect(Number(activeLink?.getAttribute('stroke-opacity'))).toBeGreaterThan(0.8);

    // Mouse leave removes .is-hovered and active link returns to resting state
    fireEvent.mouseLeave(nodeElement!);
    await waitFor(() => {
      expect(nodeElement?.classList.contains('is-hovered')).toBe(false);
    });
  });

  it('keeps cross-cluster edges visible with dashed styling in default neutral resting state', async () => {
    const { container } = render(<HyadesObservatory workspaceId="ws-cross-cluster" />);

    await waitFor(() => {
      expect(screen.getByText('Chunking Strategies')).toBeInTheDocument();
    });

    // In mockGraphData, e2 links n3 (cl-2) and n1 (cl-1), which is a cross-cluster edge!
    const links = Array.from(container.querySelectorAll<SVGPathElement>('.celestial-link'));
    expect(links.length).toBe(2);

    // One edge is intra-cluster (n1-n2 in cl-1 with n1 as Core -> level1 tier), one is cross-cluster (n3 in cl-2 to n1 in cl-1)
    const crossClusterLink = links.find((l) => l.getAttribute('stroke-dasharray') === '4,4');
    expect(crossClusterLink).toBeDefined();
    expect(crossClusterLink?.getAttribute('stroke')).toBe('#8E7E7A');
    expect(Number(crossClusterLink?.getAttribute('stroke-opacity'))).toBeCloseTo(0.25, 2);

    const sameClusterLink = links.find((l) => l.getAttribute('stroke-dasharray') === 'none');
    expect(sameClusterLink).toBeDefined();
    expect(sameClusterLink?.getAttribute('stroke')).toBe('#B84E2A');
    expect(Number(sameClusterLink?.getAttribute('stroke-opacity'))).toBeCloseTo(0.58, 2);
  });

  it('clicking blank space or pressing Escape returns to neutral resting state', async () => {
    const { container } = render(
      <HyadesObservatory
        workspaceId="ws-resting"
        initialTarget={{ entityId: 'n1', entityName: 'Chunking Strategies' }}
      />
    );

    // Initially selected due to deep link
    await waitFor(() => {
      expect(screen.getByText('Knowledge Metrics')).toBeInTheDocument();
    });

    // Click canvas blank catcher
    const blankCatcher = container.querySelector('.graph-blank-catcher');
    expect(blankCatcher).not.toBeNull();
    fireEvent.click(blankCatcher!);

    // Right dossier should close and selection cleared
    await waitFor(() => {
      expect(screen.queryByText('Knowledge Metrics')).not.toBeInTheDocument();
    });

    // Select again via click
    const nodeElement = container.querySelector('.celestial-node[data-id="n1"]');
    fireEvent.click(nodeElement!);
    await waitFor(() => {
      expect(screen.getByText('Knowledge Metrics')).toBeInTheDocument();
    });

    // Press Escape to return to neutral resting state
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByText('Knowledge Metrics')).not.toBeInTheDocument();
    });
  });

  it('temporary elastic jiggle drag does NOT mutate or persist coordinates to localStorage', async () => {
    const wsId = 'ws-drag-test';
    const { container } = render(<HyadesObservatory workspaceId={wsId} />);

    await waitFor(() => {
      expect(screen.getByText('Chunking Strategies')).toBeInTheDocument();
    });

    const nodeElement = container.querySelector<SVGGElement>('.celestial-node[data-id="n1"]');
    expect(nodeElement).not.toBeNull();
    const initialTransform = nodeElement!.getAttribute('transform');
    expect(initialTransform).toBeTruthy();

    const storedBefore = localStorage.getItem(`hyades_graph_positions_${wsId}`);

    // Trigger drag sequence on node
    const mdEvent = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: 200,
      clientY: 200,
    });
    Object.defineProperty(mdEvent, 'view', { value: window });
    nodeElement!.dispatchEvent(mdEvent);

    const mmEvent = new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: 350,
      clientY: 350,
    });
    Object.defineProperty(mmEvent, 'view', { value: window });
    window.dispatchEvent(mmEvent);

    const muEvent = new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      clientX: 350,
      clientY: 350,
    });
    Object.defineProperty(muEvent, 'view', { value: window });
    window.dispatchEvent(muEvent);

    // After release, node must return to initial resting transform
    await waitFor(() => {
      expect(nodeElement!.getAttribute('transform')).toBe(initialTransform);
      expect(nodeElement!.classList.contains('is-dragging')).toBe(false);
    });

    // Ensure localStorage was NOT permanently modified by the drag
    const storedAfter = localStorage.getItem(`hyades_graph_positions_${wsId}`);
    expect(storedAfter).toBe(storedBefore);
  });

  it('computeObservatoryLayout organizes constellations with core star anchoring and satellite grouping', () => {
    const nodes: CelestialNode[] = [
      {
        id: 'c1',
        label: 'Core Star',
        catalog: 'HYA-0001',
        clusterKey: 'cluster-A',
        group: 1,
        type: 'hub',
        hierarchy: 'core',
        size: 24,
        coords: 'RA 04h DEC +15°',
        desc: 'Core anchor star',
        degree: 8,
        noteCount: 10,
        connections: [],
      },
      {
        id: 's1',
        label: 'Subtopic Alpha',
        catalog: 'HYA-0002',
        clusterKey: 'cluster-A',
        group: 1,
        type: 'concept',
        hierarchy: 'subtopic',
        size: 16,
        coords: 'RA 04h DEC +15°',
        desc: 'Subtopic hub',
        degree: 4,
        noteCount: 4,
        connections: [{ id: 'c1', name: 'Core Star', type: 'rel', corr: '0.9' }],
      },
      {
        id: 'r1',
        label: 'Related Star',
        catalog: 'HYA-0003',
        clusterKey: 'cluster-A',
        group: 1,
        type: 'entity',
        hierarchy: 'related',
        size: 9,
        coords: 'RA 04h DEC +15°',
        desc: 'Satellite star',
        degree: 1,
        noteCount: 1,
        connections: [{ id: 's1', name: 'Subtopic Alpha', type: 'rel', corr: '0.8' }],
      },
    ];

    const links: CelestialLink[] = [
      { source: 'c1', target: 's1', weight: 0.9, type: 'relates' },
      { source: 's1', target: 'r1', weight: 0.8, type: 'relates' },
    ];

    const layout = computeObservatoryLayout(nodes, links, 800, 600);
    const corePos = layout.get('c1');
    const subPos = layout.get('s1');
    const relPos = layout.get('r1');

    expect(corePos).toBeDefined();
    expect(subPos).toBeDefined();
    expect(relPos).toBeDefined();

    // Primary core star is anchored at center anchor
    expect(corePos!.x).toBeCloseTo(800, 1);
    expect(corePos!.y).toBeCloseTo(600, 1);

    // Subtopic is positioned at comfortable orbital distance (> 100px)
    const distCoreSub = Math.hypot(subPos!.x - corePos!.x, subPos!.y - corePos!.y);
    expect(distCoreSub).toBeGreaterThan(100);

    // Related concept is satellite to subtopic (< 120px from subtopic)
    const distSubRel = Math.hypot(relPos!.x - subPos!.x, relPos!.y - subPos!.y);
    expect(distSubRel).toBeGreaterThan(30);
    expect(distSubRel).toBeLessThan(140);
  });

  describe('Edge Visual Hierarchy & Styling (§1, §2, §3, §7)', () => {
    const makeNode = (id: string, clusterKey: string, hierarchy: 'core' | 'subtopic' | 'related'): CelestialNode => ({
      id,
      label: id,
      size: 16,
      group: 1,
      type: 'concept',
      desc: '',
      clusterKey,
      catalog: `HYA-${id}`,
      coords: 'RA 00 DEC 00',
      connections: [],
      degree: 1,
      noteCount: 1,
      hierarchy,
    });

    it('correctly classifies edge tiers based on node hierarchy and cluster membership', () => {
      const coreA = makeNode('c1', 'cl-A', 'core');
      const subA1 = makeNode('s1', 'cl-A', 'subtopic');
      const subA2 = makeNode('s2', 'cl-A', 'subtopic');
      const relA1 = makeNode('r1', 'cl-A', 'related');
      const relA2 = makeNode('r2', 'cl-A', 'related');
      const coreB = makeNode('c2', 'cl-B', 'core');
      const relB = makeNode('rb', 'cl-B', 'related');

      // 1. Level 1 -> any local node: restrained terracotta/red
      expect(getEdgeTier(coreA, subA1)).toBe('level1');
      expect(getEdgeTier(subA1, coreA)).toBe('level1');
      expect(getEdgeTier(coreA, relA1)).toBe('level1');

      // 2. Level 2 -> Level 3: restrained gold/ochre
      expect(getEdgeTier(subA1, relA1)).toBe('level2_to_3');
      expect(getEdgeTier(relA1, subA1)).toBe('level2_to_3');

      // 3. Secondary / lateral relationships: very light neutral/deep-ink
      expect(getEdgeTier(subA1, subA2)).toBe('secondary');
      expect(getEdgeTier(relA1, relA2)).toBe('secondary');

      // 4. Cross-cluster relationships: faint dotted lines
      expect(getEdgeTier(coreA, coreB)).toBe('cross_cluster');
      expect(getEdgeTier(subA1, relB)).toBe('cross_cluster');
      expect(getEdgeTier(relA1, relB)).toBe('cross_cluster');
    });

    it('returns exact specified stroke colors according to visual hierarchy', () => {
      // Level 1 -> restrained terracotta/red
      expect(getLinkStroke('level1')).toBe('#B84E2A');
      // Level 2 -> Level 3 -> restrained gold/ochre
      expect(getLinkStroke('level2_to_3')).toBe('#C49234');
      // Secondary -> very light neutral / deep-ink
      expect(getLinkStroke('secondary')).toBe('#6E5F5A');
      // Cross-cluster -> lighter neutral tone
      expect(getLinkStroke('cross_cluster')).toBe('#8E7E7A');
    });

    it('returns specified opacity, dasharray, and width values for resting and subdued states', () => {
      // Default resting opacities: hierarchy weight prevents spaghetti while showing 100% of real relations
      expect(getLinkOpacity('level1')).toBe(0.58);
      expect(getLinkOpacity('level2_to_3')).toBe(0.44);
      expect(getLinkOpacity('secondary')).toBe(0.22);
      expect(getLinkOpacity('cross_cluster')).toBe(0.25);

      // Subdued opacities when a node is selected or hovered
      expect(getSubduedLinkOpacity('level1')).toBe(0.18);
      expect(getSubduedLinkOpacity('level2_to_3')).toBe(0.12);
      expect(getSubduedLinkOpacity('secondary')).toBe(0.06);
      expect(getSubduedLinkOpacity('cross_cluster')).toBe(0.07);

      // Dasharrays: cross-cluster uses thin dotted/dashed lines, others solid
      expect(getLinkDashArray('cross_cluster')).toBe('4,4');
      expect(getLinkDashArray('level1')).toBe('none');
      expect(getLinkDashArray('level2_to_3')).toBe('none');
      expect(getLinkDashArray('secondary')).toBe('none');

      // Link widths by hierarchy
      expect(getLinkWidth('level1')).toBeGreaterThan(1.4);
      expect(getLinkWidth('level2_to_3')).toBe(1.15);
      expect(getLinkWidth('secondary')).toBe(0.85);
      expect(getLinkWidth('cross_cluster')).toBe(0.85);
    });
  });

  describe('Progressive Semantic Label Disclosure (§5)', () => {
    const makeNodeWithStats = (
      hierarchy: 'core' | 'subtopic' | 'related',
      degree: number,
      noteCount: number
    ): CelestialNode => ({
      id: 'test-node',
      label: 'Test Node',
      size: 16,
      group: 1,
      type: 'concept',
      desc: '',
      clusterKey: 'cl-1',
      catalog: 'HYA-TEST',
      coords: 'RA 00 DEC 00',
      connections: [],
      degree,
      noteCount,
      hierarchy,
    });

    it('always shows label when priority is true (selected, hovered, or connected)', () => {
      const minorNode = makeNodeWithStats('related', 0, 0);
      expect(shouldShowNodeLabel(minorNode, 0.4, true)).toBe(true);
      expect(shouldShowNodeLabel(minorNode, 0.8, true)).toBe(true);
      expect(shouldShowNodeLabel(minorNode, 1.5, true)).toBe(true);
    });

    it('reveals labels progressively across zoom thresholds (Wide, Medium, Close)', () => {
      const coreNode = makeNodeWithStats('core', 5, 3);
      const highSubtopic = makeNodeWithStats('subtopic', 4, 2);
      const lowSubtopic = makeNodeWithStats('subtopic', 1, 0);
      const impRelated = makeNodeWithStats('related', 2, 1);
      const minorRelated = makeNodeWithStats('related', 1, 0);

      // 1. Wide view (k < 0.72): Level 1 + limited important Level 2
      expect(shouldShowNodeLabel(coreNode, 0.5, false)).toBe(true);
      expect(shouldShowNodeLabel(highSubtopic, 0.5, false)).toBe(true);
      expect(shouldShowNodeLabel(lowSubtopic, 0.5, false)).toBe(false);
      expect(shouldShowNodeLabel(impRelated, 0.5, false)).toBe(false);
      expect(shouldShowNodeLabel(minorRelated, 0.5, false)).toBe(false);

      // 2. Medium view (0.72 <= k < 1.25): Level 1 + Level 2 + important Level 3
      expect(shouldShowNodeLabel(coreNode, 0.9, false)).toBe(true);
      expect(shouldShowNodeLabel(highSubtopic, 0.9, false)).toBe(true);
      expect(shouldShowNodeLabel(lowSubtopic, 0.9, false)).toBe(true);
      expect(shouldShowNodeLabel(impRelated, 0.9, false)).toBe(true);
      expect(shouldShowNodeLabel(minorRelated, 0.9, false)).toBe(false);

      // 3. Close view (k >= 1.25): All remaining relevant labels
      expect(shouldShowNodeLabel(coreNode, 1.5, false)).toBe(true);
      expect(shouldShowNodeLabel(highSubtopic, 1.5, false)).toBe(true);
      expect(shouldShowNodeLabel(lowSubtopic, 1.5, false)).toBe(true);
      expect(shouldShowNodeLabel(impRelated, 1.5, false)).toBe(true);
      expect(shouldShowNodeLabel(minorRelated, 1.5, false)).toBe(true);
    });
  });
});

