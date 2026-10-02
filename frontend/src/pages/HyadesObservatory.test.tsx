import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HyadesObservatory } from './HyadesObservatory';
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
});
