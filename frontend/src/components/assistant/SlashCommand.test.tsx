import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlashCommandMenu } from './SlashCommandMenu';
import { ArgumentSuggestionsMenu } from './ArgumentSuggestionsMenu';
import { InChatNotePreview } from './InChatNotePreview';
import { InChatSavedNoteCard } from './InChatSavedNoteCard';
import { InChatSearchResultsCard } from './InChatSearchResultsCard';
import { InChatInboxReviewCard } from './InChatInboxReviewCard';
import { InChatAddToCollectionProposalCard } from './InChatAddToCollectionProposalCard';
import { InChatLinkSuggestionsCard } from './InChatLinkSuggestionsCard';
import { InChatActionProposalCard } from './InChatActionProposalCard';
import { InChatActionResultCard } from './InChatActionResultCard';
import { SlashCommand, NoteDraftProposal } from '@/types/commands';
import {
  FALLBACK_COMMANDS,
  DETERMINISTIC_OPERATIONS,
  ALL_STELLA_OPERATIONS,
} from '@/api/stella_commands';

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

      expect(screen.getAllByText('/create-note').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('/summarize').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('/link-notes').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('/review-inbox').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('/search').length).toBeGreaterThanOrEqual(1);
    });

    it('filters commands by typed query and preserves selection', () => {
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

      expect(screen.getAllByText('/create-note').length).toBeGreaterThanOrEqual(1);
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

      fireEvent.click(screen.getAllByText('/create-note')[0]);
      expect(onSelect).toHaveBeenCalledWith(mockCommands[0]);
    });

    it('synchronizes mouse hover with onHoverIndex', () => {
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

      const items = screen.getAllByRole('option');
      expect(items.length).toBe(mockCommands.length);

      fireEvent.mouseEnter(items[2]);
      expect(onHover).toHaveBeenCalledWith(2);
    });

    it('scrolls container to keep selected element within visible viewport', () => {
      const onSelect = vi.fn();
      const onHover = vi.fn();

      const { rerender, container } = render(
        <SlashCommandMenu
          commands={mockCommands}
          filterQuery=""
          selectedIndex={0}
          onSelectCommand={onSelect}
          onHoverIndex={onHover}
        />
      );

      const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLDivElement;
      expect(scrollContainer).toBeDefined();

      // Mock clientHeight and scroll geometry
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 100, configurable: true });
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 0, writable: true, configurable: true });

      const options = screen.getAllByRole('option');
      options.forEach((opt, idx) => {
        Object.defineProperty(opt, 'offsetTop', { value: idx * 40, configurable: true });
        Object.defineProperty(opt, 'offsetHeight', { value: 40, configurable: true });
      });

      // Navigate to index 4 (offset 160, beyond viewport 100)
      rerender(
        <SlashCommandMenu
          commands={mockCommands}
          filterQuery=""
          selectedIndex={4}
          onSelectCommand={onSelect}
          onHoverIndex={onHover}
        />
      );

      // Container should have scrolled down to reveal item 4: 160 + 40 - 100 = 100
      expect(scrollContainer.scrollTop).toBeGreaterThan(0);
    });

    it('renders empty message when no commands match filter query', () => {
      const onSelect = vi.fn();
      const onHover = vi.fn();

      render(
        <SlashCommandMenu
          commands={mockCommands}
          filterQuery="nonexistentcommand"
          selectedIndex={0}
          onSelectCommand={onSelect}
          onHoverIndex={onHover}
        />
      );

      expect(screen.getByText(/No matching slash commands found/i)).toBeInTheDocument();
    });

    it('triggers example insertion when an example pill is clicked', () => {
      const onSelect = vi.fn();
      const onSelectExample = vi.fn();
      const onHover = vi.fn();

      const cmdWithExamples: SlashCommand = {
        ...mockCommands[0],
        examples: ['/create-note industrial revolution', '/create-note quantum computing'],
      };

      render(
        <SlashCommandMenu
          commands={[cmdWithExamples, ...mockCommands.slice(1)]}
          filterQuery=""
          selectedIndex={0}
          onSelectCommand={onSelect}
          onSelectExample={onSelectExample}
          onHoverIndex={onHover}
        />
      );

      const exampleBtn = screen.getByText('/create-note industrial revolution');
      expect(exampleBtn).toBeInTheDocument();

      fireEvent.click(exampleBtn);
      expect(onSelectExample).toHaveBeenCalledWith('/create-note industrial revolution');
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

      fireEvent.click(screen.getByRole('button', { name: /Find related notes|Find connections/i }));
      expect(onAskFollowUp).toHaveBeenCalledWith(expect.stringContaining('/link-notes'));
    });
  });

  describe('ArgumentSuggestionsMenu', () => {
    it('renders suggested resources with badges and handles click', () => {
      const onSelect = vi.fn();
      const onHover = vi.fn();
      const suggestions = [
        {
          id: 'note-1',
          item_type: 'note' as const,
          title: 'Islamic Golden Age Astronomy',
          subtitle: 'Updated 2 hours ago',
          badge: 'note',
        },
        {
          id: 'source-1',
          item_type: 'source' as const,
          title: 'Al-Biruni Manuscripts',
          subtitle: 'Imported PDF',
          badge: 'source',
        },
      ];

      render(
        <ArgumentSuggestionsMenu
          command="/summarize"
          query="islamic"
          suggestions={suggestions}
          selectedIndex={0}
          onSelectSuggestion={onSelect}
          onHoverIndex={onHover}
        />
      );

      expect(screen.getByText('Islamic Golden Age Astronomy')).toBeInTheDocument();
      expect(screen.getByText('Al-Biruni Manuscripts')).toBeInTheDocument();
      expect(screen.getByText('Updated 2 hours ago')).toBeInTheDocument();
      expect(screen.getByText('Imported PDF')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Islamic Golden Age Astronomy'));
      expect(onSelect).toHaveBeenCalledWith(suggestions[0]);
    });
  });

  describe('InChatSearchResultsCard', () => {
    it('renders multi-domain search results across notes, sources, entities, and collections', () => {
      const onOpenItem = vi.fn();
      const searchData = {
        query: 'astronomy',
        total: 2,
        items: [
          {
            id: 'res-1',
            item_type: 'note' as const,
            title: 'Ptolemaic Models',
            snippet: 'Geocentric models of the planetary orbits...',
            score: 0.94,
          },
          {
            id: 'res-2',
            item_type: 'collection' as const,
            title: 'Celestial Cartography',
            snippet: 'Curated collection of cosmological maps',
            score: 0.88,
          },
        ],
      };

      render(
        <InChatSearchResultsCard
          searchData={searchData}
          onOpenItem={onOpenItem}
        />
      );

      expect(screen.getByText(/Multi-Domain Search:/)).toBeInTheDocument();
      expect(screen.getByText('Ptolemaic Models')).toBeInTheDocument();
      expect(screen.getByText('Celestial Cartography')).toBeInTheDocument();
      expect(screen.getByText('94%')).toBeInTheDocument();
      expect(screen.getByText('88%')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Ptolemaic Models'));
      expect(onOpenItem).toHaveBeenCalledWith('res-1', 'note');
    });
  });

  describe('InChatInboxReviewCard', () => {
    it('renders real inbox ingestion items and triggers review navigation', () => {
      const onNavigateToLibrary = vi.fn();
      const inboxData = {
        totalPending: 3,
        summaryMessage: '3 pending items requiring review',
        items: [
          {
            id: 'item-1',
            source_id: 'src-1',
            source_title: 'Optical Treatises Raw Ingestion',
            source_type: 'pdf',
            status: 'pending',
            detection_status: 'completed',
            detected_count: 2,
            detected_entities: ['Optics', 'Refraction'],
            created_at: '2026-10-22T10:00:00Z',
          },
        ],
      };

      render(
        <InChatInboxReviewCard
          inboxData={inboxData}
          onNavigateToLibrary={onNavigateToLibrary}
        />
      );

      expect(screen.getByText('Workspace Ingestion Inbox')).toBeInTheDocument();
      expect(screen.getByText('Optical Treatises Raw Ingestion')).toBeInTheDocument();
      expect(screen.getByText(/2 concepts detected/)).toBeInTheDocument();
      expect(screen.getByText('3 pending items requiring review')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Open Ingestion Inbox/i }));
      expect(onNavigateToLibrary).toHaveBeenCalled();
    });
  });

  describe('InChatAddToCollectionProposalCard', () => {
    it('renders two-phase proposal and triggers confirm and cancel callbacks', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      const proposal = {
        proposalId: 'prop-add-1',
        confirmationToken: 'tok-abc',
        actionId: 'collections.add_item',
        itemId: 'note-123',
        itemType: 'note',
        itemTitle: 'Keplerian Ellipses',
        collectionId: 'col-456',
        collectionName: 'Astrophysics Foundations',
        status: 'preview' as const,
      };

      const { rerender } = render(
        <InChatAddToCollectionProposalCard
          proposal={proposal}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.getByText('Proposal: Add to Collection')).toBeInTheDocument();
      expect(screen.getByText('Keplerian Ellipses')).toBeInTheDocument();
      expect(screen.getByText('Astrophysics Foundations')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Confirm & Add/i }));
      expect(onConfirm).toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
      expect(onCancel).toHaveBeenCalled();

      // Test committed state
      rerender(
        <InChatAddToCollectionProposalCard
          proposal={{ ...proposal, status: 'committed' }}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );
      expect(screen.getByText('Committed')).toBeInTheDocument();
      expect(screen.getByText('Astrophysics Foundations')).toBeInTheDocument();
    });
  });

  describe('InChatLinkSuggestionsCard', () => {
    it('renders discovered related notes and allows navigation or connection', () => {
      const onOpenNote = vi.fn();
      const onConnect = vi.fn();
      const linkData = {
        sourceNoteId: 'src-1',
        sourceNoteTitle: 'Heliocentrism',
        summary: '2 related candidate notes found',
        candidates: [
          {
            noteId: 'tgt-1',
            title: 'Copernican Revolution',
            similarityScore: 0.91,
            excerpt: 'De revolutionibus orbium coelestium...',
            commonTags: ['Astronomy', 'History'],
          },
        ],
      };

      render(
        <InChatLinkSuggestionsCard
          linkData={linkData}
          onOpenNote={onOpenNote}
          onConnectNotes={onConnect}
        />
      );

      expect(screen.getByText('Related Connections: Heliocentrism')).toBeInTheDocument();
      expect(screen.getByText('Copernican Revolution')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Copernican Revolution'));
      expect(onOpenNote).toHaveBeenCalledWith('tgt-1');

      fireEvent.click(screen.getByRole('button', { name: /Connect/i }));
      expect(onConnect).toHaveBeenCalledWith('src-1', 'tgt-1');
    });
  });

  describe('Declarative Command Definitions & Schema Integrity', () => {
    it('contains the 19 user-facing commands and excludes internal agent actions (/add-to-collection, /search)', () => {
      expect(FALLBACK_COMMANDS.length).toBe(19);
      const commandNames = FALLBACK_COMMANDS.map((c) => c.command);
      const uniqueNames = new Set(commandNames);
      expect(uniqueNames.size).toBe(19);

      // Verify all prioritized agentic commands are present
      const requiredAgenticCommands = [
        '/create-note',
        '/create-source',
        '/enrich-note',
        '/merge-notes',
        '/split-note',
        '/link-notes',
        '/organize-knowledge',
        '/populate-collection',
        '/extract-entities',
        '/reconcile-duplicates',
        '/resolve-conflicts',
        '/process-inbox',
      ];
      for (const cmd of requiredAgenticCommands) {
        expect(commandNames).toContain(cmd);
      }

      // Verify retained user-facing commands
      const retainedCommands = [
        '/summarize',
        '/review-inbox',
        '/analyze',
        '/generate-flashcards',
        '/find-sources',
        '/ask-about',
        '/explore-graph',
      ];
      for (const cmd of retainedCommands) {
        expect(commandNames).toContain(cmd);
      }

      // Verify internal agent actions are NOT in user-facing FALLBACK_COMMANDS
      expect(commandNames).not.toContain('/add-to-collection');
      expect(commandNames).not.toContain('/search');
    });

    it('marks the 6 unfinished commands as coming_soon placeholders', () => {
      const placeholderNames = [
        '/link-notes',
        '/review-inbox',
        '/analyze',
        '/find-sources',
        '/ask-about',
        '/explore-graph',
      ];
      for (const cmdName of placeholderNames) {
        const cmd = FALLBACK_COMMANDS.find((c) => c.command === cmdName);
        expect(cmd).toBeDefined();
        expect(cmd?.availability).toBe('coming_soon');
        expect(cmd?.execution_type).toBe('placeholder');
      }
    });

    it('renders Coming soon badge for placeholder commands and filters out internal commands in SlashCommandMenu', () => {
      const onSelect = vi.fn();
      const onHover = vi.fn();

      render(
        <SlashCommandMenu
          commands={[
            ...FALLBACK_COMMANDS,
            ...DETERMINISTIC_OPERATIONS.filter(
              (c) => c.command === '/add-to-collection' || c.command === '/search'
            ),
          ]}
          filterQuery=""
          selectedIndex={0}
          onSelectCommand={onSelect}
          onHoverIndex={onHover}
        />
      );

      // Internal actions must not appear in SlashCommandMenu
      expect(screen.queryByText('/add-to-collection')).not.toBeInTheDocument();
      expect(screen.queryByText('/search')).not.toBeInTheDocument();

      // Placeholder actions appear with Coming soon badge
      expect(screen.getAllByText('/link-notes').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Coming soon/i).length).toBeGreaterThanOrEqual(6);
    });

    it('does not expose routine CRUD operations in user-facing slash commands', () => {
      const commandNames = FALLBACK_COMMANDS.map((c) => c.command);
      const internalCrudOperations = [
        '/add-to-collection',
        '/search',
        '/rename-note',
        '/duplicate-note',
        '/archive-note',
        '/restore-note',
        '/pin-note',
        '/unpin-note',
        '/create-collection',
        '/rename-collection',
        '/delete-collection',
        '/remove-from-collection',
        '/move-collection-item',
        '/rename-source',
        '/archive-source',
        '/delete-source',
        '/create-entity',
        '/update-entity',
        '/delete-entity',
        '/delete-relation',
        '/accept-inbox-item',
        '/dismiss-inbox-item',
        '/tag-note',
        '/untag-note',
        '/create-conversation',
        '/rename-conversation',
        '/delete-conversation',
      ];

      for (const op of internalCrudOperations) {
        expect(commandNames).not.toContain(op);
      }
    });

    it('preserves deterministic CRUD operations (including /add-to-collection and /search) for autonomous agent use', () => {
      expect(DETERMINISTIC_OPERATIONS.length).toBeGreaterThanOrEqual(26);
      expect(ALL_STELLA_OPERATIONS.length).toBe(
        FALLBACK_COMMANDS.length + DETERMINISTIC_OPERATIONS.length
      );

      const deterministicNames = DETERMINISTIC_OPERATIONS.map((c) => c.command);
      expect(deterministicNames).toContain('/add-to-collection');
      expect(deterministicNames).toContain('/search');
      expect(deterministicNames).toContain('/rename-note');
      expect(deterministicNames).toContain('/create-collection');
      expect(deterministicNames).toContain('/delete-source');
      expect(deterministicNames).toContain('/create-entity');
    });

    it('defines internal /search with free_text argument in DETERMINISTIC_OPERATIONS', () => {
      const searchCmd = DETERMINISTIC_OPERATIONS.find((c) => c.command === '/search');
      expect(searchCmd).toBeDefined();
      expect(searchCmd?.availability).toBe('internal');
      expect(searchCmd?.arguments).toBeDefined();
      expect(searchCmd?.arguments?.length).toBe(1);
      expect(searchCmd?.arguments?.[0].arg_type).toBe('free_text');
      expect(searchCmd?.arguments?.[0].resource_types).toEqual([]);
    });

    it('defines /review-inbox as a coming_soon placeholder in FALLBACK_COMMANDS', () => {
      const inboxCmd = FALLBACK_COMMANDS.find((c) => c.command === '/review-inbox');
      expect(inboxCmd).toBeDefined();
      expect(inboxCmd?.arguments?.length ?? 0).toBe(0);
      expect(inboxCmd?.execution_type).toBe('placeholder');
      expect(inboxCmd?.availability).toBe('coming_soon');
    });

    it('defines internal /add-to-collection with two-phase multi-argument resource selections in DETERMINISTIC_OPERATIONS', () => {
      const addCmd = DETERMINISTIC_OPERATIONS.find((c) => c.command === '/add-to-collection');
      expect(addCmd).toBeDefined();
      expect(addCmd?.availability).toBe('internal');
      expect(addCmd?.arguments?.length).toBe(2);

      // Arg 0: item to add (note, source, entity)
      expect(addCmd?.arguments?.[0].arg_type).toBe('resource');
      expect(addCmd?.arguments?.[0].resource_types).toEqual(['note', 'source', 'entity']);

      // Arg 1: destination collection (strictly collection)
      expect(addCmd?.arguments?.[1].arg_type).toBe('resource');
      expect(addCmd?.arguments?.[1].resource_types).toEqual(['collection']);

      expect(addCmd?.requires_confirmation).toBe(true);
      expect(addCmd?.action_id).toBe('collections.add_item');
    });

    it('defines /summarize supporting notes, sources, collections, and entities', () => {
      const sumCmd = FALLBACK_COMMANDS.find((c) => c.command === '/summarize');
      expect(sumCmd).toBeDefined();
      expect(sumCmd?.arguments?.length).toBe(1);
      expect(sumCmd?.arguments?.[0].arg_type).toBe('resource');
      expect(sumCmd?.arguments?.[0].resource_types).toEqual(['note', 'source', 'collection', 'entity']);
    });

    it('defines /link-notes as a coming_soon placeholder', () => {
      const linkCmd = FALLBACK_COMMANDS.find((c) => c.command === '/link-notes');
      expect(linkCmd).toBeDefined();
      expect(linkCmd?.execution_type).toBe('placeholder');
      expect(linkCmd?.availability).toBe('coming_soon');
    });

    it('defines /merge-notes with two note resource arguments and confirmation required (Bug 3)', () => {
      const mergeCmd = FALLBACK_COMMANDS.find((c) => c.command === '/merge-notes');
      expect(mergeCmd).toBeDefined();
      expect(mergeCmd?.requires_confirmation).toBe(true);
      expect(mergeCmd?.arguments?.length).toBe(2);
      expect(mergeCmd?.arguments?.[0].name).toBe('note_1');
      expect(mergeCmd?.arguments?.[0].resource_types).toEqual(['note']);
      expect(mergeCmd?.arguments?.[1].name).toBe('note_2');
      expect(mergeCmd?.arguments?.[1].resource_types).toEqual(['note']);
    });

    it('defines /enrich-note as a two-phase proposal action (Bug 2)', () => {
      const enrichCmd = FALLBACK_COMMANDS.find((c) => c.command === '/enrich-note');
      expect(enrichCmd).toBeDefined();
      expect(enrichCmd?.action_id).toBe('notes.update');
      expect(enrichCmd?.execution_type).toBe('proposal');
      expect(enrichCmd?.requires_confirmation).toBe(true);
    });
  });

  describe('Manual QA Regression Tests (Bugs 1-10 UI)', () => {
    it('Bug 5: InChatLinkSuggestionsCard displays Connected state and prevents duplicate connection clicks', () => {
      const onOpenNote = vi.fn();
      const onConnect = vi.fn();
      const linkData = {
        sourceNoteId: 'src-note-1',
        sourceNoteTitle: 'Vector Embeddings for Spatial Navigation',
        summary: '2 related candidate notes found',
        candidates: [
          {
            noteId: 'cand-1',
            title: 'Incremental Knowledge Gardening',
            similarityScore: 0.89,
            excerpt: 'Evergreen note maintenance...',
            commonTags: ['graph'],
            alreadyLinked: true,
            connectionStatus: 'connected' as const,
          },
          {
            noteId: 'cand-2',
            title: 'Bidirectional Linking Topologies',
            similarityScore: 0.82,
            excerpt: 'Graph traversal...',
            commonTags: ['graph'],
            alreadyLinked: false,
            connectionStatus: 'idle' as const,
          },
        ],
      };

      render(
        <InChatLinkSuggestionsCard
          linkData={linkData}
          onOpenNote={onOpenNote}
          onConnectNotes={onConnect}
        />
      );

      expect(screen.getByText(/1 Connected/i)).toBeInTheDocument();
      expect(screen.getAllByText('Connected').length).toBeGreaterThanOrEqual(1);

      const connectBtns = screen.getAllByRole('button', { name: /^Connect$/i });
      expect(connectBtns.length).toBe(1);
      fireEvent.click(connectBtns[0]);
      expect(onConnect).toHaveBeenCalledWith('src-note-1', 'cand-2');
    });

    it('Bug 4: InChatActionProposalCard distinguishes proposed split from committed split and provides Library navigation', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      const onNavigateToItem = vi.fn();

      const splitProposal = {
        proposalId: 'prop-split-1',
        confirmationToken: 'tok-split-1',
        command: '/split-note',
        commandName: 'Split Note',
        actionId: 'notes.create',
        message: 'Prepared modular split proposal for Islamic Golden Era',
        data: {
          original_title: 'Islamic Golden Era: Foundations, Dynamics, and Significance',
          proposed_parts: [
            {
              title: 'Islamic Golden Era — Foundations',
              focus: 'Historical Foundations',
              content: '### Foundations\nAbbasid scholarship in Baghdad.',
              word_count: 42,
            },
            {
              title: 'Islamic Golden Era — Dynamics',
              focus: 'Scientific Dynamics',
              content: '### Dynamics\nAdvances in optics and algebra.',
              word_count: 38,
            },
          ],
          status: 'awaiting_confirmation',
        },
        status: 'preview' as const,
      };

      const { rerender } = render(
        <InChatActionProposalCard
          proposal={splitProposal}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onNavigateToItem={onNavigateToItem}
        />
      );

      expect(screen.getByText('Awaiting Confirmation')).toBeInTheDocument();
      expect(screen.queryByText('Completed')).not.toBeInTheDocument();
      expect(screen.getByText(/Islamic Golden Era — Foundations/)).toBeInTheDocument();
      expect(screen.getByText(/Islamic Golden Era — Dynamics/)).toBeInTheDocument();

      // Re-render in committed state with created_notes
      rerender(
        <InChatActionProposalCard
          proposal={{
            ...splitProposal,
            status: 'committed',
            data: {
              ...splitProposal.data,
              created_notes: [
                { note_id: 'new-note-1', title: 'Islamic Golden Era — Foundations', word_count: 42 },
                { note_id: 'new-note-2', title: 'Islamic Golden Era — Dynamics', word_count: 38 },
              ],
            },
          }}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onNavigateToItem={onNavigateToItem}
        />
      );

      expect(screen.getByText('Committed')).toBeInTheDocument();
      expect(screen.getByText(/Created 2 Modular Notes in Library/i)).toBeInTheDocument();
      const openLinks = screen.getAllByText(/Open in Library/i);
      expect(openLinks.length).toBe(2);
      fireEvent.click(openLinks[0]);
      expect(onNavigateToItem).toHaveBeenCalledWith('new-note-1', 'note');
    });

    it('Bugs 6, 9, 10: InChatActionResultCard renders structured cards instead of raw JSON', () => {
      const onRunCommand = vi.fn();

      // Bug 6: /organize-knowledge
      const { rerender } = render(
        <InChatActionResultCard
          result={{
            command: '/organize-knowledge',
            actionId: 'knowledge.audit_processing',
            message: 'Prepared 1 organization recommendation',
            status: 'completed',
            data: {
              scope: 'Note & Related Context: Life of Umar ibn al-Khattab',
              total_notes: 3,
              total_collections: 1,
              status: 'recommendations_ready',
              suggested_clusters: [
                {
                  cluster_name: 'Caliphate Studies',
                  purpose: 'Consolidate governance and reform notes.',
                  recommended_notes: ['Life of Umar ibn al-Khattab'],
                  recommended_action: 'Create collection Caliphate Studies',
                },
              ],
            },
          }}
          onRunCommand={onRunCommand}
        />
      );

      expect(screen.getByText('Recommendations Ready')).toBeInTheDocument();
      expect(screen.getByText('Caliphate Studies')).toBeInTheDocument();
      expect(screen.getByText('Consolidate governance and reform notes.')).toBeInTheDocument();
      expect(screen.queryByText(/"suggested_clusters"/)).not.toBeInTheDocument();

      // Bug 9: /reconcile-duplicates
      rerender(
        <InChatActionResultCard
          result={{
            command: '/reconcile-duplicates',
            actionId: 'notes.compare',
            message: 'Examined 3 notes',
            status: 'completed',
            data: {
              scope_examined: 'Note: Life of Umar ibn al-Khattab',
              notes_examined_count: 3,
              duplicate_count: 1,
              status: 'duplicates_found',
              pairs: [
                {
                  original_id: 'u1',
                  original: 'Life of Umar ibn al-Khattab',
                  duplicate_id: 'u2',
                  duplicate: 'Umar ibn al-Khattab: Caliphate and Reforms',
                  similarity_score: 0.78,
                  reason: 'Near-duplicate overlap',
                },
              ],
            },
          }}
          onRunCommand={onRunCommand}
        />
      );

      expect(screen.getByText('1 Duplicate Pair(s)')).toBeInTheDocument();
      expect(screen.getByText('Umar ibn al-Khattab: Caliphate and Reforms')).toBeInTheDocument();
      const stageMergeBtn = screen.getByRole('button', { name: /Stage Merge Proposal/i });
      fireEvent.click(stageMergeBtn);
      expect(onRunCommand).toHaveBeenCalledWith(
        '/merge-notes "Life of Umar ibn al-Khattab" "Umar ibn al-Khattab: Caliphate and Reforms"'
      );

      // Bug 10: /resolve-conflicts
      rerender(
        <InChatActionResultCard
          result={{
            command: '/resolve-conflicts',
            actionId: 'notes.compare',
            message: 'Compared 2 workspace items on Jabir ibn Hayyan',
            status: 'completed',
            data: {
              topic: 'Jabir ibn Hayyan',
              sources_analyzed: ['Jabir Corpus', 'Debates on Jabir'],
              conflict_count: 1,
              status: 'conflicts_detected',
              consensus: 'Identified chronological discrepancy between 806 CE and 815 CE.',
              conflicts: [
                {
                  dimension: 'Chronological / Quantitative Discrepancy',
                  source_a_title: 'Jabir Corpus',
                  claim_a: 'Jabir died in 815 CE in Kufa.',
                  source_b_title: 'Debates on Jabir',
                  claim_b: 'Some historians argue Jabir died in 806 CE.',
                  resolution_suggestion: 'Document both primary traditions.',
                },
              ],
            },
          }}
        />
      );

      expect(screen.getByText('1 Conflict(s) Found')).toBeInTheDocument();
      expect(screen.getByText('Chronological / Quantitative Discrepancy')).toBeInTheDocument();
      expect(screen.getByText(/Jabir died in 815 CE in Kufa/i)).toBeInTheDocument();
      expect(screen.queryByText(/"sources_analyzed"/)).not.toBeInTheDocument();
    });

    it('visual reference: /reconcile-duplicates with 0 pairs renders Completed badge and DUPLICATE_COUNT PAIRS STATUS scalar box', () => {
      render(
        <InChatActionResultCard
          result={{
            command: '/reconcile-duplicates',
            actionId: 'notes.compare',
            message: 'Duplicate reconciliation check complete: 0 duplicate pairs identified.',
            status: 'completed',
            data: {
              duplicate_count: 0,
              pairs: [],
              status: 'reconciled',
              scope_examined: 'Note: Life of Umar ibn al-Khattab',
              notes_examined_count: 1,
            },
          }}
        />
      );

      expect(screen.getByText(/Command Executed:/i)).toBeInTheDocument();
      expect(screen.getByText('/reconcile-duplicates')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Duplicate reconciliation check complete: 0 duplicate pairs identified.')).toBeInTheDocument();
      expect(screen.getByText('DUPLICATE_COUNT:')).toBeInTheDocument();
      expect(screen.getByText('PAIRS:')).toBeInTheDocument();
      expect(screen.getByText('STATUS:')).toBeInTheDocument();
      expect(screen.getByText('reconciled')).toBeInTheDocument();
    });

    it('v0.5.1: /organize-knowledge renders 4 recommendation categories, seed banner, disambiguation, and empty state without raw JSON', () => {
      const onRunCommand = vi.fn();
      const onStageRecommendation = vi.fn();

      const { rerender } = render(
        <InChatActionResultCard
          result={{
            command: '/organize-knowledge',
            actionId: 'knowledge.audit_processing',
            message: 'Prepared 4 organization recommendations across Islamic history.',
            status: 'completed',
            data: {
              entry_mode: 'seed',
              scope: 'Seed Item & Related Context: Life of Umar ibn al-Khattab',
              status: 'recommendations_ready',
              seed_item: {
                id: 'note-umar-1',
                type: 'note',
                title: 'Life of Umar ibn al-Khattab',
              },
              examined_scope: {
                notes_examined: 6,
                sources_examined: 2,
                collections_examined: 1,
                threads_examined: 1,
                entities_examined: 4,
              },
              recommendations: [
                {
                  recommendation_id: 'rec-col-1',
                  recommendation_type: 'create_collection',
                  artifact_type: 'collection',
                  proposed_name: 'Islamic History — Early Caliphate',
                  purpose: 'Group foundational governance notes and sources into a dedicated collection.',
                  rationale: 'Found 2 related notes and 1 source without a shared collection.',
                  note_count: 2,
                  source_count: 1,
                  total_item_count: 3,
                  overlap_summary: '1 item already belongs to Historical Figures.',
                  candidate_items: [
                    {
                      id: 'note-umar-1',
                      item_type: 'note',
                      title: 'Life of Umar ibn al-Khattab',
                      excerpt: 'Second Rashidun Caliph and administrative reformer.',
                      existing_collections: ['Historical Figures'],
                      selected: true,
                    },
                    {
                      id: 'note-abu-bakr-2',
                      item_type: 'note',
                      title: 'Succession of Abu Bakr',
                      excerpt: 'Consolidation of the early polity in Medina.',
                      existing_collections: [],
                      selected: true,
                    },
                    {
                      id: 'src-tabari-3',
                      item_type: 'source',
                      title: 'Chronicle of al-Tabari Excerpt',
                      excerpt: 'Primary source chronicle on the diwan registry.',
                      existing_collections: [],
                      selected: true,
                    },
                  ],
                },
                {
                  recommendation_id: 'rec-thread-1',
                  recommendation_type: 'create_thread',
                  artifact_type: 'thread',
                  proposed_name: 'How did the diwan reform shape early Islamic governance?',
                  core_question: 'How did the diwan reform shape early Islamic governance?',
                  purpose: 'Synthesize administrative and fiscal reforms across notes and primary sources.',
                  rationale: 'Connects 2 notes and 1 source addressing fiscal governance.',
                  note_count: 2,
                  source_count: 1,
                  total_item_count: 3,
                  candidate_items: [
                    {
                      id: 'note-umar-1',
                      item_type: 'note',
                      title: 'Life of Umar ibn al-Khattab',
                      excerpt: 'Second Rashidun Caliph and administrative reformer.',
                      existing_collections: ['Historical Figures'],
                      selected: true,
                    },
                  ],
                },
                {
                  recommendation_id: 'rec-ent-1',
                  recommendation_type: 'create_entities_and_relationships',
                  artifact_type: 'entities',
                  proposed_name: 'Early Caliphate Knowledge Graph',
                  purpose: 'Formalize recurring people and institutions as graph entities.',
                  rationale: 'Detected 2 recurring entities across workspace material.',
                  total_item_count: 2,
                  candidate_entities: [
                    {
                      name: 'Umar ibn al-Khattab',
                      entity_type: 'PERSON',
                      description: 'Second Rashidun Caliph',
                      source_title: 'Life of Umar ibn al-Khattab',
                      selected: true,
                    },
                  ],
                  candidate_relationships: [
                    {
                      source_entity: 'Umar ibn al-Khattab',
                      target_entity: 'Diwan',
                      relationship_type: 'ESTABLISHED',
                      evidence: 'Established the diwanstipend registry.',
                      selected: true,
                    },
                  ],
                },
                {
                  recommendation_id: 'rec-ws-1',
                  recommendation_type: 'informational_workspace',
                  artifact_type: 'workspace',
                  executable: false,
                  proposed_name: 'Dedicated Workspace: Classical Historiography',
                  purpose: 'Informational recommendation on domain separation.',
                  rationale: 'Classical historiography material is distinct from your active engineering notes.',
                  affected_item_titles: ['Life of Umar ibn al-Khattab', 'Chronicle of al-Tabari Excerpt'],
                },
              ],
            },
          }}
          onRunCommand={onRunCommand}
          onStageRecommendation={onStageRecommendation}
        />
      );

      // Verify starting-point seed banner
      expect(screen.getByTestId('organize-seed-item-banner')).toBeInTheDocument();
      expect(screen.getAllByText('Life of Umar ibn al-Khattab').length).toBeGreaterThan(0);

      // Verify all 4 recommendation categories render with clear badges and titles
      expect(screen.getByText('Islamic History — Early Caliphate')).toBeInTheDocument();
      expect(screen.getByText('How did the diwan reform shape early Islamic governance?')).toBeInTheDocument();
      expect(screen.getByText('Early Caliphate Knowledge Graph')).toBeInTheDocument();
      expect(screen.getByText('Dedicated Workspace: Classical Historiography')).toBeInTheDocument();

      // Verify existing collection membership is surfaced in the preview
      expect(screen.getByText(/1 item already belongs to Historical Figures/i)).toBeInTheDocument();

      // Verify informational workspace card has Inspect Scope button and executable ones have Inspect & Configure
      expect(screen.getByRole('button', { name: /Inspect Scope/i })).toBeInTheDocument();
      const configureButtons = screen.getAllByRole('button', { name: /Inspect & Configure/i });
      expect(configureButtons.length).toBe(3); // collection, thread, entities

      // Test disambiguation state
      rerender(
        <InChatActionResultCard
          result={{
            command: '/organize-knowledge',
            actionId: 'knowledge.audit_processing',
            message: 'Multiple workspace items match Umar.',
            status: 'completed',
            data: {
              entry_mode: 'disambiguation_required',
              scope: 'Ambiguous query: Umar',
              status: 'disambiguation_required',
              is_ambiguous: true,
              disambiguation_options: [
                { id: 'n1', item_type: 'note', title: 'Life of Umar ibn al-Khattab', excerpt: 'Biography note' },
                { id: 's1', item_type: 'source', title: 'Umar Fiscal Edicts PDF', excerpt: 'Source document' },
              ],
              recommendations: [],
            },
          }}
          onRunCommand={onRunCommand}
        />
      );
      expect(screen.getByText(/Multiple Matching Items or Sub-Themes Detected/i)).toBeInTheDocument();
      expect(screen.getByText(/Umar Fiscal Edicts PDF/i)).toBeInTheDocument();

      // Test well-organized / adequate organization empty state
      rerender(
        <InChatActionResultCard
          result={{
            command: '/organize-knowledge',
            actionId: 'knowledge.audit_processing',
            message: 'Workspace organization is already clean and well-structured.',
            status: 'completed',
            data: {
              entry_mode: 'workspace_audit',
              scope: 'Workspace-Wide Organization Audit',
              organization_status: 'adequate_organization',
              recommendations: [],
            },
          }}
          onRunCommand={onRunCommand}
        />
      );
      expect(screen.getByTestId('organize-adequate-state')).toBeInTheDocument();
      expect(screen.getByText(/already well-organized across existing collections/i)).toBeInTheDocument();
    });

    it('v0.5.1: OrganizationConfigDialog supports inspecting, filtering, unchecking/rechecking, editing name, reviewing, and staging only selected items', async () => {
      const onStageRecommendation = vi.fn();

      render(
        <InChatActionResultCard
          result={{
            command: '/organize-knowledge',
            actionId: 'knowledge.audit_processing',
            message: 'Prepared 1 organization recommendation',
            status: 'completed',
            data: {
              entry_mode: 'topic',
              scope: 'Topic: Islamic history',
              status: 'recommendations_ready',
              recommendations: [
                {
                  recommendation_id: 'rec-col-islamic',
                  recommendation_type: 'create_collection',
                  artifact_type: 'collection',
                  proposed_name: 'Islamic History',
                  description: 'Notes and sources on early Islamic history.',
                  purpose: 'Group related notes and sources on Islamic history.',
                  rationale: '3 matching items lack a shared collection.',
                  note_count: 2,
                  source_count: 1,
                  total_item_count: 3,
                  candidate_items: [
                    {
                      item_id: 'note-1',
                      item_type: 'note',
                      title: 'Life of Umar ibn al-Khattab',
                      excerpt: 'Administrative reforms and diwan.',
                      existing_collections: ['Caliphs'],
                      selected: true,
                    },
                    {
                      item_id: 'note-2',
                      item_type: 'note',
                      title: 'Unrelated Grocery List Note',
                      excerpt: 'Apples and oranges.',
                      existing_collections: [],
                      selected: true,
                    },
                    {
                      item_id: 'src-1',
                      item_type: 'source',
                      title: 'Chronicle of al-Tabari',
                      excerpt: 'Primary historical chronicle.',
                      existing_collections: [],
                      selected: true,
                    },
                  ],
                },
              ],
            },
          }}
          onStageRecommendation={onStageRecommendation}
        />
      );

      // Click Inspect & Configure to open Stage 2 dialog
      fireEvent.click(screen.getByRole('button', { name: /Inspect & Configure/i }));

      expect(screen.getByTestId('organization-config-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('selection-counter')).toHaveTextContent('3 of 3 items selected');
      expect(screen.getAllByText('In: Caliphs').length).toBeGreaterThan(0);

      // Filter candidate list using search box and verify checkbox state is preserved
      const searchInput = screen.getByPlaceholderText(/Filter candidate items by title or type/i);
      fireEvent.change(searchInput, { target: { value: 'Grocery' } });
      expect(screen.getAllByRole('checkbox')).toHaveLength(1);
      const checkbox = screen.getByRole('checkbox', { name: /Include Unrelated Grocery List Note/i });
      expect(checkbox).toBeInTheDocument();

      // Uncheck the unrelated note
      fireEvent.click(checkbox);
      expect(screen.getByTestId('selection-counter')).toHaveTextContent('2 of 3 items selected');

      // Clear filter and verify 2 of 3 remain selected
      fireEvent.change(searchInput, { target: { value: '' } });
      expect(screen.getByTestId('selection-counter')).toHaveTextContent('2 of 3 items selected');

      // Test Deselect All prevents proceeding to Review Selection
      fireEvent.click(screen.getByRole('button', { name: 'Deselect All' }));
      expect(screen.getByTestId('selection-counter')).toHaveTextContent('0 of 3 items selected');
      const reviewBtn = screen.getByTestId('review-selection-btn');
      expect(reviewBtn).toBeDisabled();

      // Test Select All then uncheck 'Unrelated Grocery List Note' again
      fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
      expect(screen.getByTestId('selection-counter')).toHaveTextContent('3 of 3 items selected');

      fireEvent.click(screen.getByRole('checkbox', { name: /Include Unrelated Grocery List Note/i }));
      expect(screen.getByTestId('selection-counter')).toHaveTextContent('2 of 3 items selected');

      // Edit collection name
      const nameInput = screen.getByDisplayValue('Islamic History');
      fireEvent.change(nameInput, { target: { value: 'Early Islamic History & Chronicles' } });

      // Proceed to Stage 3: Review Selection
      fireEvent.click(screen.getByTestId('review-selection-btn'));
      expect(screen.getByTestId('organization-final-review')).toBeInTheDocument();
      expect(screen.getByText('Early Islamic History & Chronicles')).toBeInTheDocument();
      expect(screen.getByText(/2 selected · 1 excluded/i)).toBeInTheDocument();

      // Confirm staging
      fireEvent.click(screen.getByTestId('confirm-stage-proposal-btn'));
      expect(onStageRecommendation).toHaveBeenCalledTimes(1);
      const stagedPayload = onStageRecommendation.mock.calls[0][0];
      expect(stagedPayload.proposed_name).toBe('Early Islamic History & Chronicles');
      expect(stagedPayload.selected_items).toHaveLength(2);
      expect(stagedPayload.selected_items.map((i: any) => i.item_id)).toEqual(['note-1', 'src-1']);
    });

    it('v0.5.1: InChatActionProposalCard supports interactive candidate exclusion for /populate-collection and post-commit navigation links', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      const onNavigateToItem = vi.fn();

      const populateProposal = {
        proposalId: 'prop-pop-1',
        confirmationToken: 'tok-pop-1',
        command: '/populate-collection',
        commandName: 'Populate Collection',
        actionId: 'collections.add_item',
        message: 'Prepared 2 candidate items for collection Islamic History',
        data: {
          workflow: 'populate_collection',
          collection_id: 'col-islamic-1',
          collection_name: 'Islamic History',
          candidate_items: [
            {
              item_id: 'note-1',
              item_type: 'note',
              title: 'Life of Umar ibn al-Khattab',
              excerpt: 'Reforms of the second Caliph.',
              existing_collections: ['Biographies'],
              selected: true,
            },
            {
              item_id: 'src-1',
              item_type: 'source',
              title: 'Al-Tabari Volume 12',
              excerpt: 'Historical source text.',
              existing_collections: [],
              selected: true,
            },
          ],
          status: 'awaiting_confirmation',
        },
        status: 'preview' as const,
      };

      const { rerender } = render(
        <InChatActionProposalCard
          proposal={populateProposal}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onNavigateToItem={onNavigateToItem}
        />
      );

      expect(screen.getByTestId('proposal-selection-counter')).toHaveTextContent('2 of 2 items selected');
      expect(screen.getByText('In: Biographies')).toBeInTheDocument();

      // Uncheck the second item
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes).toHaveLength(2);
      fireEvent.click(checkboxes[1]);
      expect(screen.getByTestId('proposal-selection-counter')).toHaveTextContent('1 of 2 items selected');

      // Confirm and verify overrides only include the 1 checked item
      fireEvent.click(screen.getByRole('button', { name: /Confirm Changes/i }));
      expect(onConfirm).toHaveBeenCalledTimes(1);
      const overrideArg = onConfirm.mock.calls[0][0];
      expect(overrideArg.selected_items).toHaveLength(1);
      expect(overrideArg.selected_items[0].item_id).toBe('note-1');

      // Re-render in committed state and verify navigation buttons
      rerender(
        <InChatActionProposalCard
          proposal={{
            ...populateProposal,
            status: 'committed',
            data: {
              ...populateProposal.data,
              added_count: 1,
              added_items: [{ item_id: 'note-1', item_type: 'note', title: 'Life of Umar ibn al-Khattab' }],
              status: 'populated',
            },
          }}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onNavigateToItem={onNavigateToItem}
        />
      );

      expect(screen.getByText('Committed')).toBeInTheDocument();
      expect(screen.getByText(/1 item\(s\) included · Existing memberships preserved/i)).toBeInTheDocument();

      const openCollectionBtn = screen.getByRole('button', { name: /Open Collection/i });
      fireEvent.click(openCollectionBtn);
      expect(onNavigateToItem).toHaveBeenCalledWith('col-islamic-1', 'collection');
    });
  });
});
