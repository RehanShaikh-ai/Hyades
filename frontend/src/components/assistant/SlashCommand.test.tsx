import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlashCommandMenu } from './SlashCommandMenu';
import { InChatNotePreview } from './InChatNotePreview';
import { InChatSavedNoteCard } from './InChatSavedNoteCard';
import { SlashCommand, NoteDraftProposal } from '@/types/commands';

const mockCommands: SlashCommand[] = [
  {
    command: '/create-note',
    name: 'Create Note',
    description: 'Draft and save a new note on any topic with Stella preview',
    syntax: '/create-note <topic>',
    example: '/create-note industrial revolution',
  },
  {
    command: '/summarize',
    name: 'Summarize',
    description: 'Summarize an existing note, source, or thread',
    syntax: '/summarize <target>',
    example: '/summarize ptolemaic astronomy',
  },
  {
    command: '/link-notes',
    name: 'Link Notes',
    description: 'Find or create semantic connections between notes',
    syntax: '/link-notes <query>',
    example: '/link-notes thermodynamics',
  },
  {
    command: '/review-inbox',
    name: 'Review Inbox',
    description: 'Review pending inbox items from ingestion',
    syntax: '/review-inbox',
    example: '/review-inbox',
  },
  {
    command: '/search',
    name: 'Search',
    description: 'Search notes, sources, entities, or threads across the workspace',
    syntax: '/search <query>',
    example: '/search renaissance instruments',
  },
];

const mockDraft: NoteDraftProposal = {
  proposalId: 'prop-1234',
  confirmationToken: 'token-xyz',
  actionId: 'notes.create',
  title: 'The Industrial Revolution: Mechanization and Society',
  content: '### Overview\nThe Industrial Revolution fundamentally altered human labor.',
  wordCount: 312,
  status: 'preview',
  topic: 'industrial revolution',
};

describe('Stella Slash Commands & In-Chat Actions', () => {
  describe('SlashCommandMenu', () => {
    it('renders all commands when filter is empty', () => {
      const onSelect = vi.fn();
      const onHover = vi.fn();

      render(
        <SlashCommandMenu
          commands={mockCommands}
          filterQuery=""
          selectedIndex={0}
          onSelectCommand={onSelect}
          onHoverIndex={onHover}
        />
      );

      expect(screen.getByText('/create-note')).toBeInTheDocument();
      expect(screen.getByText('/summarize')).toBeInTheDocument();
      expect(screen.getByText('/link-notes')).toBeInTheDocument();
      expect(screen.getAllByText('/review-inbox').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('/search')).toBeInTheDocument();
    });

    it('filters commands by typed query', () => {
      const onSelect = vi.fn();
      const onHover = vi.fn();

      render(
        <SlashCommandMenu
          commands={mockCommands}
          filterQuery="create"
          selectedIndex={0}
          onSelectCommand={onSelect}
          onHoverIndex={onHover}
        />
      );

      expect(screen.getByText('/create-note')).toBeInTheDocument();
      expect(screen.queryByText('/summarize')).not.toBeInTheDocument();
    });

    it('calls onSelectCommand when an option is clicked', () => {
      const onSelect = vi.fn();
      const onHover = vi.fn();

      render(
        <SlashCommandMenu
          commands={mockCommands}
          filterQuery=""
          selectedIndex={0}
          onSelectCommand={onSelect}
          onHoverIndex={onHover}
        />
      );

      fireEvent.click(screen.getByText('/create-note'));
      expect(onSelect).toHaveBeenCalledWith(mockCommands[0]);
    });
  });

  describe('InChatNotePreview', () => {
    it('renders note preview with title, word count, not-yet-saved status, and actions', () => {
      const onSave = vi.fn();
      const onRegenerate = vi.fn();
      const onCancel = vi.fn();

      render(
        <InChatNotePreview
          draft={mockDraft}
          onSave={onSave}
          onRegenerate={onRegenerate}
          onCancel={onCancel}
        />
      );

      expect(screen.getByText('The Industrial Revolution: Mechanization and Society')).toBeInTheDocument();
      expect(screen.getByText(/Not yet saved/)).toBeInTheDocument();
      expect(screen.getByText(/~312 words/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Save to Notes/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Revise/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Regenerate/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    });

    it('supports inline revision mode and saving', () => {
      const onSave = vi.fn();
      const onRegenerate = vi.fn();
      const onCancel = vi.fn();

      render(
        <InChatNotePreview
          draft={mockDraft}
          onSave={onSave}
          onRegenerate={onRegenerate}
          onCancel={onCancel}
        />
      );

      // Click Revise
      fireEvent.click(screen.getByRole('button', { name: /Revise/i }));
      expect(screen.getByDisplayValue('The Industrial Revolution: Mechanization and Society')).toBeInTheDocument();

      // Click Done Editing
      fireEvent.click(screen.getByRole('button', { name: /Done Editing/i }));

      // Click Save to Notes
      fireEvent.click(screen.getByRole('button', { name: /Save to Notes/i }));
      expect(onSave).toHaveBeenCalled();
    });
  });

  describe('InChatSavedNoteCard', () => {
    it('renders saved note card with title, Open, View in Graph, and follow-up prompts', () => {
      const onOpen = vi.fn();
      const onViewGraph = vi.fn();
      const onAskFollowUp = vi.fn();

      const committedDraft: NoteDraftProposal = {
        ...mockDraft,
        status: 'committed',
        savedNoteId: 'note-uuid-999',
        savedAt: 'Just now',
      };

      render(
        <InChatSavedNoteCard
          draft={committedDraft}
          onOpenNote={onOpen}
          onViewInGraph={onViewGraph}
          onAskFollowUp={onAskFollowUp}
        />
      );

      expect(screen.getByText('The Industrial Revolution: Mechanization and Society')).toBeInTheDocument();
      expect(screen.getByText('312 words')).toBeInTheDocument();
      expect(screen.getByText('Just now')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Open/i }));
      expect(onOpen).toHaveBeenCalledWith('note-uuid-999');

      fireEvent.click(screen.getByRole('button', { name: /View in Graph/i }));
      expect(onViewGraph).toHaveBeenCalledWith('note-uuid-999', committedDraft.title);

      fireEvent.click(screen.getByRole('button', { name: /Find connections to other notes/i }));
      expect(onAskFollowUp).toHaveBeenCalledWith(expect.stringContaining('/link-notes'));
    });
  });
});
