import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HyadesApp } from './HyadesApp';
import { getUsers } from '@/api/users';
import { getWorkspaces } from '@/api/workspaces';
import * as notesApi from '@/api/notes';
import { User } from '@/types/users';
import { Workspace } from '@/types/workspaces';

vi.mock('@/api/users', () => ({ getUsers: vi.fn() }));
vi.mock('@/api/workspaces', () => ({ getWorkspaces: vi.fn() }));
vi.mock('@/api/dashboard', () => ({
  getWorkspaceDashboard: vi.fn().mockResolvedValue({
    total_notes: 12,
    notes_created_last_7_days: 3,
    total_relationships: 8,
    total_tags: 4,
    total_sources: 2,
    import_status_summary: { completed: 2, processing: 0, failed: 0 },
    recent_activity: [],
    recent_notes: [],
  }),
}));
vi.mock('@/api/notes', () => ({
  listNotes: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 }),
  searchNotes: vi.fn().mockResolvedValue({ items: [], total: 0, query: '' }),
}));
vi.mock('@/api/tags', () => ({
  listWorkspaceTags: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}));
vi.mock('@/api/graph', () => ({
  getWorkspaceGraph: vi.fn().mockResolvedValue({
    nodes: [],
    edges: [],
    clusters: [],
    stats: { node_count: 0, edge_count: 0, cluster_count: 0, manual_node_count: 0, manual_edge_count: 0, truncated: false },
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
  getEntity: vi.fn().mockResolvedValue({ id: 'e1', name: 'Concept', entity_type: 'concept', workspace_id: 'ws-1', created_at: '', updated_at: '' }),
  getEntityProvenance: vi.fn().mockResolvedValue({ entity_id: 'e1', sources: [] }),
}));
vi.mock('@/api/link_suggestions', () => ({
  getLinkSuggestions: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}));
vi.mock('@/api/conversations', () => ({
  listConversations: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  createConversation: vi.fn(),
}));

const mockUser: User = {
  id: '11111111-1111-1111-1111-111111111111',
  display_name: 'Ada Lovelace',
  created_at: '2026-09-17T12:00:00Z',
  updated_at: '2026-09-17T12:00:00Z',
};

const mockWorkspace: Workspace = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Quantum Notes',
  description: 'Research workspace',
  owner_id: mockUser.id,
  created_at: '2026-09-17T12:00:00Z',
  updated_at: '2026-09-17T12:00:00Z',
};

describe('HyadesApp Canonical UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsers).mockResolvedValue({ items: [mockUser], total: 1 });
    vi.mocked(getWorkspaces).mockResolvedValue({ items: [mockWorkspace], total: 1 });
    vi.mocked(notesApi.listNotes).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });
  });

  it('renders backend health states accurately in header telemetry', async () => {
    const { rerender } = render(<HyadesApp healthStatus="loading" onRefreshHealth={vi.fn()} />);
    expect(screen.getByTestId('health-status')).toHaveTextContent('Backend: Loading');

    rerender(<HyadesApp healthStatus="connected" onRefreshHealth={vi.fn()} />);
    expect(screen.getByTestId('health-status')).toHaveTextContent('Backend: Connected');

    rerender(<HyadesApp healthStatus="error" onRefreshHealth={vi.fn()} />);
    expect(screen.getByTestId('health-status')).toHaveTextContent('Backend: Unavailable');
  });

  it('renders primary Hyades destinations and navigates between them', async () => {
    render(<HyadesApp workspaceId={mockWorkspace.id} workspaceName={mockWorkspace.name} />);

    expect(screen.getByText(/hyades/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Overview$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Library$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Observatory$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Stella$/i })).toBeInTheDocument();

    // Default destination is Overview: shows "Your Knowledge" section heading
    expect(await screen.findByText('Your Knowledge')).toBeInTheDocument();

    // Navigate to Library
    fireEvent.click(screen.getByRole('button', { name: /^Library$/i }));
    expect(await screen.findByText('Topic Shelves')).toBeInTheDocument();

    // Navigate to Stella
    fireEvent.click(screen.getByRole('button', { name: /^Stella$/i }));
    expect(await screen.findByText('Stella Study')).toBeInTheDocument();
  });

  it('opens account administration modal via profile button', async () => {
    render(<HyadesApp workspaceId={mockWorkspace.id} workspaceName={mockWorkspace.name} />);

    const profileBtn = screen.getByTitle('Account & Setup');
    expect(profileBtn).toBeInTheDocument();
    fireEvent.click(profileBtn);

    expect(await screen.findByText('Account & Workspace Setup')).toBeInTheDocument();
  });

  it('opens global search modal via search button', async () => {
    render(<HyadesApp workspaceId={mockWorkspace.id} workspaceName={mockWorkspace.name} />);

    const searchBtn = screen.getByTitle('Global Search (⌘K)');
    fireEvent.click(searchBtn);

    expect(await screen.findByPlaceholderText('Search Hyades...')).toBeInTheDocument();
  });
});
