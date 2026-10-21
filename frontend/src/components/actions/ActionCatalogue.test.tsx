import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ActionCatalogue } from './ActionCatalogue';
import { ActionDefinition } from '@/types/actions';

describe('ActionCatalogue Component (§3.A, §7)', () => {
  const mockActions: ActionDefinition[] = [
    {
      id: 'notes.summarize',
      name: 'Summarize Note',
      description: 'Generate concise executive summary of note content',
      side_effect: 'read',
      input_schema: {
        type: 'object',
        properties: {
          note_id: { type: 'string', description: 'ID of the note' },
        },
        required: ['note_id'],
      },
    },
    {
      id: 'notes.update',
      name: 'Update Note Content',
      description: 'Mutate note title or body',
      side_effect: 'write',
      input_schema: {
        type: 'object',
        properties: {
          note_id: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['note_id'],
      },
    },
    {
      id: 'notes.delete',
      name: 'Delete Note Permanently',
      description: 'Permanently remove note and cascade links',
      side_effect: 'destructive',
      input_schema: {
        type: 'object',
        properties: {
          note_id: { type: 'string' },
        },
        required: ['note_id'],
      },
      disabled_reason: 'Workspace write permissions suspended during archival review',
    },
    {
      id: 'sources.ingest',
      name: 'Ingest Source Document',
      description: 'Extract and tokenize raw document source',
      side_effect: 'propose',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string' },
        },
      },
    },
    {
      id: 'graph.reindex',
      name: 'Recompute Graph Centrality',
      description: 'Rebuild global graph topological indices',
      side_effect: 'write',
      input_schema: { type: 'object' },
    },
  ];

  it('renders loading state when isLoading is true', () => {
    render(
      <ActionCatalogue
        actions={[]}
        selectedAction={null}
        onSelectAction={vi.fn()}
        isLoading={true}
      />
    );
    expect(screen.getByText(/Loading action catalogue from registry.../i)).toBeDefined();
  });

  it('renders error state with retry button when error is provided', () => {
    const handleRefresh = vi.fn();
    render(
      <ActionCatalogue
        actions={[]}
        selectedAction={null}
        onSelectAction={vi.fn()}
        isLoading={false}
        error="Failed to connect to backend catalogue registry"
        onRefresh={handleRefresh}
      />
    );
    expect(screen.getByTestId('catalogue-error-state')).toBeDefined();
    expect(screen.getByText(/Failed to connect to backend catalogue registry/i)).toBeDefined();

    fireEvent.click(screen.getByText('Retry'));
    expect(handleRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders all actions and displays classification badges', () => {
    render(
      <ActionCatalogue
        actions={mockActions}
        selectedAction={null}
        onSelectAction={vi.fn()}
      />
    );

    expect(screen.getByTestId('action-card-notes.summarize')).toBeDefined();
    expect(screen.getByTestId('action-card-notes.update')).toBeDefined();
    expect(screen.getByTestId('action-card-notes.delete')).toBeDefined();
    expect(screen.getByTestId('action-card-sources.ingest')).toBeDefined();
    expect(screen.getByTestId('action-card-graph.reindex')).toBeDefined();

    expect(screen.getByText('notes.summarize')).toBeDefined();
    expect(screen.getByText('notes.update')).toBeDefined();
  });

  it('renders disabled actions with explicit reason callout rather than silently removing them (§3.A)', () => {
    render(
      <ActionCatalogue
        actions={mockActions}
        selectedAction={null}
        onSelectAction={vi.fn()}
      />
    );

    const deleteCard = screen.getByTestId('action-card-notes.delete');
    expect(deleteCard).toBeDefined();

    // Must show disabled reason
    expect(screen.getByTestId('action-disabled-reason-notes.delete')).toBeDefined();
    expect(screen.getByText(/Workspace write permissions suspended during archival review/i)).toBeDefined();
  });

  it('filters actions by search query', () => {
    render(
      <ActionCatalogue
        actions={mockActions}
        selectedAction={null}
        onSelectAction={vi.fn()}
      />
    );

    const searchInput = screen.getByTestId('action-search-input');
    fireEvent.change(searchInput, { target: { value: 'topological' } });

    expect(screen.getByTestId('action-card-graph.reindex')).toBeDefined();
    expect(screen.queryByTestId('action-card-notes.summarize')).toBeNull();
  });

  it('filters actions by domain tag', () => {
    render(
      <ActionCatalogue
        actions={mockActions}
        selectedAction={null}
        onSelectAction={vi.fn()}
      />
    );

    const sourcesFilterBtn = screen.getByTestId('domain-filter-sources');
    fireEvent.click(sourcesFilterBtn);

    expect(screen.getByTestId('action-card-sources.ingest')).toBeDefined();
    expect(screen.queryByTestId('action-card-notes.summarize')).toBeNull();
    expect(screen.queryByTestId('action-card-graph.reindex')).toBeNull();
  });

  it('triggers onSelectAction callback when an action is clicked', () => {
    const handleSelect = vi.fn();
    render(
      <ActionCatalogue
        actions={mockActions}
        selectedAction={null}
        onSelectAction={handleSelect}
      />
    );

    fireEvent.click(screen.getByTestId('action-card-notes.summarize'));
    expect(handleSelect).toHaveBeenCalledWith(mockActions[0]);
  });

  it('renders complete set of 37 contract-defined action IDs without errors when supplied (§7)', () => {
    const contract37Ids = [
      'notes.create', 'notes.get', 'notes.update', 'notes.delete', 'notes.list', 'notes.search', 'notes.summarize', 'notes.extract_entities',
      'sources.create', 'sources.get', 'sources.update', 'sources.delete', 'sources.list', 'sources.search', 'sources.ingest', 'sources.extract_chunks',
      'entities.create', 'entities.get', 'entities.update', 'entities.delete', 'entities.list', 'entities.search', 'entities.merge',
      'relationships.create', 'relationships.get', 'relationships.update', 'relationships.delete', 'relationships.list',
      'tags.create', 'tags.get', 'tags.update', 'tags.delete', 'tags.list', 'tags.attach', 'tags.detach',
      'graph.reindex', 'inbox.process'
    ];

    const actions37: ActionDefinition[] = contract37Ids.map((id) => ({
      id,
      name: id.replace('.', ' ').toUpperCase(),
      description: `Contract action for ${id}`,
      side_effect: id.includes('delete') ? 'destructive' : id.includes('create') ? 'write' : 'read',
      input_schema: { type: 'object' },
    }));

    render(
      <ActionCatalogue
        actions={actions37}
        selectedAction={null}
        onSelectAction={vi.fn()}
      />
    );

    expect(screen.getByText(/Canonical Manual Actions \(37 of 37\)/i)).toBeDefined();
    contract37Ids.forEach((id) => {
      expect(screen.getByTestId(`action-card-${id}`)).toBeDefined();
    });
  });
});
