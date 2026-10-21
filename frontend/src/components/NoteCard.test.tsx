import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { NoteCard } from './NoteCard';
import { Note } from '@/types/note';

const mockNote: Note = {
  id: 'note-1',
  workspace_id: 'ws-1',
  created_by: 'user-1',
  title: 'Test Note Title',
  content: 'This is a test note content that spans multiple lines.',
  is_pinned: false,
  is_archived: false,
  tags: [
    { id: 'tag-1', workspace_id: 'ws-1', name: 'react' },
    { id: 'tag-2', workspace_id: 'ws-1', name: 'typescript' }
  ],
  created_at: '2023-01-01T12:00:00Z',
  updated_at: '2023-01-02T12:00:00Z',
};

describe('NoteCard', () => {
  it('renders correctly with basic metadata', () => {
    render(<NoteCard note={mockNote} />);
    
    expect(screen.getByText('Test Note Title')).toBeInTheDocument();
    expect(screen.getByText('This is a test note content that spans multiple lines.')).toBeInTheDocument();
    expect(screen.getByText('react')).toBeInTheDocument();
    expect(screen.getByText('typescript')).toBeInTheDocument();
    
    // Check formatted date presence (Jan 2, 2023 or 2 Jan 2023 depending on locale)
    expect(screen.getByText(/(Jan 2, 2023|2 Jan 2023)/i)).toBeInTheDocument();

  });

  it('shows pinned indicator when pinned', () => {
    const pinnedNote = { ...mockNote, is_pinned: true };
    render(<NoteCard note={pinnedNote} />);
    expect(screen.getByTitle('Pinned')).toBeInTheDocument();
  });

  it('shows archived indicator when archived', () => {
    const archivedNote = { ...mockNote, is_archived: true };
    render(<NoteCard note={archivedNote} />);
    expect(screen.getByTitle('Archived')).toBeInTheDocument();
  });

  it('handles click events', async () => {
    const handleClick = vi.fn();
    render(<NoteCard note={mockNote} onClick={handleClick} />);
    
    await userEvent.click(screen.getByRole('article'));
    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith(mockNote);
  });

  it('limits tags display and shows overflow count', () => {
    const manyTagsNote = {
      ...mockNote,
      tags: [
        { id: 't1', workspace_id: 'ws-1', name: 't1' },
        { id: 't2', workspace_id: 'ws-1', name: 't2' },
        { id: 't3', workspace_id: 'ws-1', name: 't3' },
        { id: 't4', workspace_id: 'ws-1', name: 't4' },
      ]
    };
    render(<NoteCard note={manyTagsNote} />);
    
    expect(screen.getByText('t1')).toBeInTheDocument();
    expect(screen.getByText('t3')).toBeInTheDocument();
    expect(screen.queryByText('t4')).not.toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
  });
});
