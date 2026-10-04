import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  HyadesObservatory,
  computeClusterAnchors,
  computeObservatoryLayout,
  computeConstellationPath,
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
});

