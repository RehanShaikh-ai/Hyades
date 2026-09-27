import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotesDashboard } from './NotesDashboard';
import * as notesApi from '@/api/notes';

vi.mock('@/api/notes', () => ({
  listNotes: vi.fn(),
  searchNotes: vi.fn().mockResolvedValue({ items: [], total: 0, query: '' }),
}));

vi.mock('@/api/tags', () => ({
  listWorkspaceTags: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}));

vi.mock('@/api/graph', () => ({
  getWorkspaceGraph: vi.fn().mockResolvedValue({
    nodes: [
      { id: 'e1', name: 'Neural Networks', entity_type: 'concept', degree: 2, is_manual: false, note_count: 3 },
      { id: 'e2', name: 'Backpropagation', entity_type: 'concept', degree: 1, is_manual: false, note_count: 2 },
    ],
    edges: [
      { id: 'r1', source_entity_id: 'e1', target_entity_id: 'e2', relationship_type: 'uses', confidence: 0.95, is_manual: false },
    ],
    clusters: [],
    stats: { node_count: 2, edge_count: 1, cluster_count: 0, manual_node_count: 0, manual_edge_count: 0, truncated: false },
    truncated: false,
  }),
  searchGraph: vi.fn().mockResolvedValue({ entities: [], notes: [], total_matches: 0, query: '' }),
  getEntityNeighborhood: vi.fn().mockResolvedValue({
    nodes: [],
    edges: [],
    clusters: [],
    stats: { node_count: 0, edge_count: 0, cluster_count: 0, manual_node_count: 0, manual_edge_count: 0, truncated: false },
    truncated: false,
  }),
}));

vi.mock('@/api/clusters', () => ({
  listClusters: vi.fn().mockResolvedValue([]),
  getCluster: vi.fn().mockResolvedValue({ id: 'c1', name: 'ML', summary: 'ML cluster', member_count: 0, members: [] }),
}));

vi.mock('@/api/entities', () => ({
  listEntities: vi.fn().mockResolvedValue([]),
  getEntity: vi.fn().mockResolvedValue({ id: 'e1', name: 'Neural Networks', entity_type: 'concept', workspace_id: 'ws-1', created_at: '', updated_at: '' }),
  getEntityProvenance: vi.fn().mockResolvedValue({ entity_id: 'e1', sources: [] }),
}));

vi.mock('@/api/link_suggestions', () => ({
  getLinkSuggestions: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}));

const mockNote = {
  id: '1',
  workspace_id: 'ws-1',
  title: 'Test Note',
  content: 'Content',
  is_pinned: false,
  is_archived: false,
  tags: [],
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
  created_by: 'u1'
};

describe('NotesDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dashboard sections and fetches data', async () => {
    vi.mocked(notesApi.listNotes).mockImplementation(async (_, params) => {
      if (params?.is_pinned) {
        return { items: [{ ...mockNote, id: 'pinned-1', is_pinned: true, title: 'Pinned Note' }], total: 1, page: 1, page_size: 100 };
      }
      return { items: [{ ...mockNote, id: 'recent-1', title: 'Recent Note' }], total: 1, page: 1, page_size: 100 };
    });

    render(<NotesDashboard workspaceId="ws-1" />);

    // "Knowledge Base" text appears in the breadcrumb
    expect(screen.getByText('Knowledge Base')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Pinned Note')).toBeInTheDocument();
      expect(screen.getByText('Recent Note')).toBeInTheDocument();
    });
  });

  it('shows workspace name badge when workspaceName prop is provided', async () => {
    vi.mocked(notesApi.listNotes).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });

    render(<NotesDashboard workspaceId="ws-1" workspaceName="My Workspace" />);

    expect(screen.getByTestId('active-workspace-badge')).toHaveTextContent('My Workspace');
    await waitFor(() => {
      expect(notesApi.listNotes).toHaveBeenCalled();
    });
  });

  it('toggles archived view', async () => {
    vi.mocked(notesApi.listNotes).mockImplementation(async (_, params) => {
      if (params?.is_archived) {
        return { items: [{ ...mockNote, id: 'arch-1', title: 'Archived Note' }], total: 1, page: 1, page_size: 100 };
      }
      return { items: [], total: 0, page: 1, page_size: 100 };
    });

    render(<NotesDashboard workspaceId="ws-1" />);

    await waitFor(() => {
      expect(notesApi.listNotes).toHaveBeenCalled();
    });

    // Click archived toggle (button with text "Archived")
    const archiveBtn = screen.getByRole('button', { name: /Archived/i });
    fireEvent.click(archiveBtn);

    await waitFor(() => {
      expect(screen.getByText('Archived Notes')).toBeInTheDocument();
      expect(screen.getByText('Archived Note')).toBeInTheDocument();
    });
  });

  it('switches to graph tab and renders constellation graph, toolbar, and search bar', async () => {
    vi.mocked(notesApi.listNotes).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });

    render(<NotesDashboard workspaceId="ws-1" />);

    const graphTabBtn = screen.getByRole('button', { name: /^Graph$/i });
    fireEvent.click(graphTabBtn);

    expect(await screen.findByTestId('graph-edit-toolbar')).toBeInTheDocument();
    expect(await screen.findByTestId('graph-search-bar')).toBeInTheDocument();
  });

  it('navigates to Assistant tab when clicking Assistant button', async () => {
    vi.mocked(notesApi.listNotes).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });

    render(<NotesDashboard workspaceId="ws-1" />);

    const assistantTabBtn = screen.getByRole('button', { name: /Assistant/i });
    fireEvent.click(assistantTabBtn);

    expect(await screen.findByTestId('assistant-panel')).toBeInTheDocument();
  });

  it('toggles filters panel from graph toolbar', async () => {
    vi.mocked(notesApi.listNotes).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });

    render(<NotesDashboard workspaceId="ws-1" />);

    const graphTabBtn = screen.getByRole('button', { name: /^Graph$/i });
    fireEvent.click(graphTabBtn);

    const filterBtn = await screen.findByTestId('toolbar-toggle-filters-btn');
    fireEvent.click(filterBtn);

    expect(await screen.findByTestId('graph-filter-panel')).toBeInTheDocument();
  });
});

