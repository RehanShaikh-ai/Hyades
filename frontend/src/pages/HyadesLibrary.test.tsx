import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HyadesLibrary } from './HyadesLibrary';
import * as notesApi from '@/api/notes';
import * as sourcesApi from '@/api/sources';
import * as clustersApi from '@/api/clusters';

vi.mock('@/api/notes', () => ({
  listNotes: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}));

vi.mock('@/api/sources', () => ({
  listSources: vi.fn(),
  deleteSource: vi.fn(),
}));

vi.mock('@/api/clusters', () => ({
  listClusters: vi.fn(),
}));

vi.mock('@/api/graph_index', () => ({
  triggerExtraction: vi.fn(),
  triggerReindex: vi.fn(),
}));

vi.mock('@/api/jobs', () => ({
  getJobStatus: vi.fn(),
}));

const mockWorkspaceId = 'ws-test-lib';

describe('HyadesLibrary Layout and Independent Scrolling (§16, §17)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(notesApi.listNotes).mockResolvedValue({
      items: [
        {
          id: 'note-1',
          workspace_id: mockWorkspaceId,
          title: 'First Archival Folio',
          content: 'Manuscript notes regarding celestial maps.',
          tags: ['astronomy'],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'note-2',
          workspace_id: mockWorkspaceId,
          title: 'Second Observation Entry',
          content: 'Details on Hyades star catalog.',
          tags: ['catalog'],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      total: 2,
      page: 1,
      page_size: 50,
      total_pages: 1,
    } as any);

    vi.mocked(sourcesApi.listSources).mockResolvedValue({
      items: [
        {
          id: 'src-1',
          workspace_id: mockWorkspaceId,
          name: 'Ptolemy Almagest.pdf',
          type: 'pdf',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      total: 1,
    } as any);

    vi.mocked(clustersApi.listClusters).mockResolvedValue([] as any);
  });

  it('provides an independent scroll container for the center list within a stable viewport', async () => {
    const { container } = render(<HyadesLibrary workspaceId={mockWorkspaceId} />);

    await waitFor(() => {
      expect(screen.getByText('First Archival Folio')).toBeInTheDocument();
    });

    // Root page container is constrained to viewport without scrolling the whole page
    const pageContainer = container.firstChild as HTMLElement;
    expect(pageContainer.className).toContain('overflow-hidden');
    expect(pageContainer.className).toContain('h-[calc(100vh-57px)]');

    // Center list has its own independent scroll container
    const scrollContainer = screen.getByTestId('library-ledger-scroll-container');
    expect(scrollContainer).toBeInTheDocument();
    expect(scrollContainer.className).toContain('overflow-y-auto');
    expect(scrollContainer.className).toContain('flex-1');
  });

  it('closes Note Editor modal when Escape is pressed', async () => {
    render(<HyadesLibrary workspaceId={mockWorkspaceId} />);

    await waitFor(() => {
      expect(screen.getByText('First Archival Folio')).toBeInTheDocument();
    });

    // Click "Edit Note in Scriptorium" in the Right Dossier to open Note Editor
    const editBtn = screen.getByRole('button', { name: /Edit Note in Scriptorium/i });
    fireEvent.click(editBtn);

    // Modal is now open
    await waitFor(() => {
      expect(screen.getByText('Scriptorium Note Editor')).toBeInTheDocument();
    });

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    // Modal should be closed
    await waitFor(() => {
      expect(screen.queryByText('Scriptorium Note Editor')).not.toBeInTheDocument();
    });
  });

  it('contains Topic Shelves inside a bounded scroll container to prevent panel overflow', async () => {
    vi.mocked(clustersApi.listClusters).mockResolvedValue([
      { id: 'c1', label: 'Quantum Superposition & Qubits Architecture', member_count: 5, members: [] },
      { id: 'c2', label: 'Transformers', member_count: 8, members: [] },
      { id: 'c3', label: 'Vector Databases', member_count: 3, members: [] },
      { id: 'c4', label: 'Data Engineering', member_count: 4, members: [] },
      { id: 'c5', label: 'Machine Learning', member_count: 12, members: [] },
      { id: 'c6', label: 'Astronomy & Astrophysics', member_count: 7, members: [] },
      { id: 'c7', label: 'General Notes', member_count: 15, members: [] },
    ] as any);

    render(<HyadesLibrary workspaceId={mockWorkspaceId} />);

    await waitFor(() => {
      expect(screen.getByText(/Quantum Superposition & Qubits Architecture/i)).toBeInTheDocument();
    });

    const shelvesContainer = screen.getByTestId('library-topic-shelves-container');
    expect(shelvesContainer).toBeInTheDocument();
    expect(shelvesContainer.className).toContain('max-h-52');
    expect(shelvesContainer.className).toContain('overflow-y-auto');

    // Verify all topics are rendered within the scrollable container with counts
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });
});

