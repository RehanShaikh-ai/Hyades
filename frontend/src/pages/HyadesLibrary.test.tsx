import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HyadesLibrary } from './HyadesLibrary';
import * as notesApi from '@/api/notes';
import * as sourcesApi from '@/api/sources';
import * as clustersApi from '@/api/clusters';
import * as usersApi from '@/api/users';

vi.mock('@/api/notes', () => ({
  listNotes: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}));

vi.mock('@/api/sources', () => ({
  listSources: vi.fn(),
  uploadSource: vi.fn(),
  deleteSource: vi.fn(),
}));

vi.mock('@/api/clusters', () => ({
  listClusters: vi.fn(),
}));

vi.mock('@/api/users', () => ({
  getUsers: vi.fn(),
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
    expect(shelvesContainer.className).toContain('overflow-y-auto');
    expect(shelvesContainer.className).toContain('flex-1');

    // Verify all topics are rendered within the scrollable container with counts
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('saves an existing note to the backend via updateNote and updates the UI', async () => {
    vi.mocked(notesApi.updateNote).mockResolvedValue({
      id: 'note-1',
      workspace_id: mockWorkspaceId,
      title: 'Updated Archival Folio',
      content: 'Expanded manuscript content.',
      tags: ['astronomy'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    render(<HyadesLibrary workspaceId={mockWorkspaceId} />);

    await waitFor(() => {
      expect(screen.getByText('First Archival Folio')).toBeInTheDocument();
    });

    // Select "First Archival Folio" row
    fireEvent.click(screen.getByText('First Archival Folio'));

    // Open Note Editor
    const editBtn = screen.getByRole('button', { name: /Edit Note in Scriptorium/i });
    fireEvent.click(editBtn);

    await waitFor(() => {
      expect(screen.getByText('Scriptorium Note Editor')).toBeInTheDocument();
    });

    const titleInput = screen.getByPlaceholderText('Note Title...');
    fireEvent.change(titleInput, { target: { value: 'Updated Archival Folio' } });

    const contentInput = screen.getByPlaceholderText('Record your research insights and connections...');
    fireEvent.change(contentInput, { target: { value: 'Expanded manuscript content.' } });

    const saveBtn = screen.getByRole('button', { name: /Save to Archive/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(notesApi.updateNote).toHaveBeenCalledWith('note-1', {
        title: 'Updated Archival Folio',
        content: 'Expanded manuscript content.',
      });
      expect(screen.queryByText('Scriptorium Note Editor')).not.toBeInTheDocument();
    });
  });

  it('creates a new note with a valid resolved user UUID via createNote', async () => {
    const validUserId = '11111111-2222-3333-4444-555555555555';
    vi.mocked(usersApi.getUsers).mockResolvedValue({
      items: [{ id: validUserId, email: 'test@example.com', name: 'Tester' }],
      total: 1,
    } as any);

    vi.mocked(notesApi.createNote).mockResolvedValue({
      id: 'new-note-1',
      workspace_id: mockWorkspaceId,
      title: 'Brand New Manuscript Note',
      content: 'First thoughts on star coordinates.',
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    render(<HyadesLibrary workspaceId={mockWorkspaceId} userId={validUserId} />);

    await waitFor(() => {
      expect(screen.getByText('First Archival Folio')).toBeInTheDocument();
    });

    // Click "New Note" from top header
    const newNoteBtn = screen.getByRole('button', { name: /New Note/i });
    fireEvent.click(newNoteBtn);

    await waitFor(() => {
      expect(screen.getByText('Scriptorium Note Editor')).toBeInTheDocument();
    });

    const titleInput = screen.getByPlaceholderText('Note Title...');
    fireEvent.change(titleInput, { target: { value: 'Brand New Manuscript Note' } });

    const contentInput = screen.getByPlaceholderText('Record your research insights and connections...');
    fireEvent.change(contentInput, { target: { value: 'First thoughts on star coordinates.' } });

    const saveBtn = screen.getByRole('button', { name: /Save to Archive/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(notesApi.createNote).toHaveBeenCalledWith(mockWorkspaceId, {
        title: 'Brand New Manuscript Note',
        content: 'First thoughts on star coordinates.',
        created_by: validUserId,
      });
      expect(screen.queryByText('Scriptorium Note Editor')).not.toBeInTheDocument();
    });
  });

  it('displays an error alert without closing Note Editor when save fails', async () => {
    vi.mocked(notesApi.updateNote).mockRejectedValue({
      error: { message: 'Database constraint violation' },
    });

    render(<HyadesLibrary workspaceId={mockWorkspaceId} />);

    await waitFor(() => {
      expect(screen.getByText('First Archival Folio')).toBeInTheDocument();
    });

    // Open Note Editor
    const editBtn = screen.getByRole('button', { name: /Edit Note in Scriptorium/i });
    fireEvent.click(editBtn);

    await waitFor(() => {
      expect(screen.getByText('Scriptorium Note Editor')).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /Save to Archive/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('Database constraint violation')).toBeInTheDocument();
      // Editor must still be open so user doesn't lose text
      expect(screen.getByText('Scriptorium Note Editor')).toBeInTheDocument();
    });
  });

  it('opens Source Import modal, uploads a valid file, and refreshes the library', async () => {
    vi.mocked(sourcesApi.uploadSource).mockResolvedValue({
      id: 'src-new-1',
      workspace_id: mockWorkspaceId,
      name: 'kepler_harmonics.pdf',
      type: 'pdf',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    render(<HyadesLibrary workspaceId={mockWorkspaceId} />);

    await waitFor(() => {
      expect(screen.getByText('First Archival Folio')).toBeInTheDocument();
    });

    // Click "Import Sources" button
    const importBtn = screen.getByRole('button', { name: /Import Sources/i });
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(screen.getByText('Import Source Document')).toBeInTheDocument();
    });

    // Select a file
    const file = new File(['stellar contents'], 'kepler_harmonics.pdf', { type: 'application/pdf' });
    const dropzone = screen.getByText(/Drag and drop source document here/i);
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('kepler_harmonics.pdf')).toBeInTheDocument();
    });

    // Click "Import to Archive"
    const submitBtn = screen.getByRole('button', { name: /Import to Archive/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(sourcesApi.uploadSource).toHaveBeenCalledWith(mockWorkspaceId, file);
      expect(screen.queryByText('Import Source Document')).not.toBeInTheDocument();
    });
  });

  it('closes Source Import modal on Escape key', async () => {
    render(<HyadesLibrary workspaceId={mockWorkspaceId} />);

    await waitFor(() => {
      expect(screen.getByText('First Archival Folio')).toBeInTheDocument();
    });

    const importBtn = screen.getByRole('button', { name: /Import Sources/i });
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(screen.getByText('Import Source Document')).toBeInTheDocument();
    });

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByText('Import Source Document')).not.toBeInTheDocument();
    });
  });
});

