import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { NoteEditor } from './NoteEditor';
import * as notesApi from '@/api/notes';
import * as tagsApi from '@/api/tags';

vi.mock('@/api/notes', () => ({
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}));

vi.mock('@/api/tags', () => ({
  addTag: vi.fn(),
  removeTag: vi.fn(),
}));

describe('NoteEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);
  });

  it('renders in create mode and saves a new note', async () => {
    vi.mocked(notesApi.createNote).mockResolvedValue({
      id: 'new-1',
      title: 'New Title',
      content: 'New Content',
      workspace_id: 'ws-1',
      created_by: '00000000-0000-0000-0000-000000000000',
      is_pinned: false,
      is_archived: false,
      tags: [],
      created_at: '',
      updated_at: ''
    });

    const handleSaved = vi.fn();
    render(<NoteEditor workspaceId="ws-1" onClose={vi.fn()} onSaved={handleSaved} onDeleted={vi.fn()} />);
    
    expect(screen.getByPlaceholderText('Note title')).toBeInTheDocument();
    
    await userEvent.type(screen.getByPlaceholderText('Note title'), 'New Title');
    await userEvent.type(screen.getByPlaceholderText(/Write your note here/i), 'New Content');
    
    await userEvent.click(screen.getByRole('button', { name: /Save/i }));
    
    await waitFor(() => {
      expect(notesApi.createNote).toHaveBeenCalledWith('ws-1', {
        title: 'New Title',
        content: 'New Content',
        created_by: '00000000-0000-0000-0000-000000000000'
      });
      expect(handleSaved).toHaveBeenCalled();
    });
  });

  it('asks for confirmation before closing if dirty', async () => {
    const handleClose = vi.fn();
    render(<NoteEditor workspaceId="ws-1" onClose={handleClose} onSaved={vi.fn()} onDeleted={vi.fn()} />);
    
    await userEvent.type(screen.getByPlaceholderText('Note title'), 'Dirty');
    
    const closeBtn = screen.getByLabelText('Close');
    await userEvent.click(closeBtn);
    
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('unsaved changes'));
    expect(handleClose).toHaveBeenCalled();
  });

  it('opens with empty state when no initialNote is provided (new note)', () => {
    render(<NoteEditor workspaceId="ws-1" onClose={vi.fn()} onSaved={vi.fn()} onDeleted={vi.fn()} />);

    const titleInput = screen.getByPlaceholderText('Note title') as HTMLInputElement;
    const bodyInput = screen.getByPlaceholderText(/Write your note here/i) as HTMLTextAreaElement;

    expect(titleInput.value).toBe('');
    expect(bodyInput.value).toBe('');
  });

  it('loads the correct data when initialNote changes via key remount', () => {
    const noteA = {
      id: 'a-1', workspace_id: 'ws-1', created_by: 'u1',
      title: 'Note A', content: 'Content A',
      is_pinned: false, is_archived: false, tags: [],
      created_at: '', updated_at: '',
    };
    const noteB = {
      id: 'b-2', workspace_id: 'ws-1', created_by: 'u1',
      title: 'Note B', content: 'Content B',
      is_pinned: true, is_archived: false, tags: [],
      created_at: '', updated_at: '',
    };

    const props = { workspaceId: 'ws-1', onClose: vi.fn(), onSaved: vi.fn(), onDeleted: vi.fn() };

    // Render Note A
    const { unmount } = render(<NoteEditor key={noteA.id} {...props} initialNote={noteA} />);
    expect((screen.getByPlaceholderText('Note title') as HTMLInputElement).value).toBe('Note A');

    // Simulate switching: unmount and render Note B with a different key
    unmount();
    render(<NoteEditor key={noteB.id} {...props} initialNote={noteB} />);
    expect((screen.getByPlaceholderText('Note title') as HTMLInputElement).value).toBe('Note B');
  });

  it('clears editor when switching from existing note to new note via key remount', () => {
    const existingNote = {
      id: 'existing-1', workspace_id: 'ws-1', created_by: 'u1',
      title: 'Existing Title', content: 'Existing Content',
      is_pinned: true, is_archived: false, tags: [],
      created_at: '', updated_at: '',
    };
    const props = { workspaceId: 'ws-1', onClose: vi.fn(), onSaved: vi.fn(), onDeleted: vi.fn() };

    // Render existing note
    const { unmount } = render(<NoteEditor key={existingNote.id} {...props} initialNote={existingNote} />);
    expect((screen.getByPlaceholderText('Note title') as HTMLInputElement).value).toBe('Existing Title');

    // Simulate "New Note": unmount and render without initialNote with a new key
    unmount();
    render(<NoteEditor key="new-1" {...props} />);
    expect((screen.getByPlaceholderText('Note title') as HTMLInputElement).value).toBe('');
    expect((screen.getByPlaceholderText(/Write your note here/i) as HTMLTextAreaElement).value).toBe('');
  });

  it('enables Save button when a tag is added to an existing note', async () => {
    const existingNote = {
      id: 'existing-1', workspace_id: 'ws-1', created_by: 'u1',
      title: 'Existing Title', content: 'Existing Content',
      is_pinned: false, is_archived: false, tags: [],
      created_at: '', updated_at: '',
    };
    vi.mocked(tagsApi.addTag).mockResolvedValue({
      id: 'tag-1', workspace_id: 'ws-1', name: 'react',
    });

    const props = { workspaceId: 'ws-1', onClose: vi.fn(), onSaved: vi.fn(), onDeleted: vi.fn() };
    render(<NoteEditor {...props} initialNote={existingNote} />);

    const saveButton = screen.getByRole('button', { name: /Save/i });
    expect(saveButton).toBeDisabled();

    const tagInput = screen.getByPlaceholderText('Add tag...');
    await userEvent.type(tagInput, 'react{enter}');

    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });
  });


  it('opens styled confirmation modal when delete is clicked and cancels safely', async () => {
    const existingNote = {
      id: 'note-del-1',
      workspace_id: 'ws-1',
      title: 'Note To Cancel Delete',
      content: 'Content',
      tags: [],
      created_by: 'user-1',
      is_pinned: false,
      is_archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const onDeleted = vi.fn();
    render(<NoteEditor workspaceId="ws-1" onClose={vi.fn()} onSaved={vi.fn()} onDeleted={onDeleted} initialNote={existingNote} />);

    const deleteBtn = screen.getByTitle('Delete note');
    await userEvent.click(deleteBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Delete Note' })).toBeInTheDocument();
    expect(screen.getByText('Note To Cancel Delete')).toBeInTheDocument();

    const cancelBtn = screen.getByTestId('cancel-delete-note-btn');
    await userEvent.click(cancelBtn);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('deletes note when confirmation is confirmed in modal', async () => {
    const existingNote = {
      id: 'note-del-2',
      workspace_id: 'ws-1',
      title: 'Note To Confirm Delete',
      content: 'Content',
      tags: [],
      created_by: 'user-1',
      is_pinned: false,
      is_archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const onDeleted = vi.fn();
    render(<NoteEditor workspaceId="ws-1" onClose={vi.fn()} onSaved={vi.fn()} onDeleted={onDeleted} initialNote={existingNote} />);

    const deleteBtn = screen.getByTitle('Delete note');
    await userEvent.click(deleteBtn);

    const confirmBtn = screen.getByTestId('confirm-delete-note-btn');
    await userEvent.click(confirmBtn);

    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalledWith('note-del-2');
    });
  });
  it('renders merged note indicator when note metadata has is_merged', () => {
    const mergedNote = {
      id: 'note-merged-1',
      workspace_id: 'ws-1',
      title: 'Merged Note',
      content: 'Consolidated content',
      tags: [],
      created_by: 'user-1',
      is_pinned: false,
      is_archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        is_merged: true,
        origin: 'merge',
        source_count: 2,
        merged_source_titles: ['Source Alpha', 'Source Beta'],
      },
    };
    render(<NoteEditor workspaceId="ws-1" onClose={vi.fn()} onSaved={vi.fn()} onDeleted={vi.fn()} initialNote={mergedNote} />);
    expect(screen.getByTestId('merged-note-indicator')).toBeInTheDocument();
    expect(screen.getByText('Merged')).toBeInTheDocument();
    expect(screen.getByText('from Source Alpha, Source Beta')).toBeInTheDocument();
  });
});
