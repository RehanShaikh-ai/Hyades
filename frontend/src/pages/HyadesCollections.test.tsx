
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HyadesCollections } from './HyadesCollections';
import * as collectionsApi from '@/api/collections';

vi.mock('@/api/collections');

describe('HyadesCollections Component (§15.1)', () => {
  const mockCollections = [
    {
      id: 'coll-1',
      workspace_id: 'ws-1',
      name: 'Cosmology Collection',
      description: 'Study of early universe',
      icon: 'star',
      created_by: 'user-1',
      created_at: '2026-10-16T00:00:00Z',
      updated_at: '2026-10-16T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(collectionsApi.listCollections).mockResolvedValue({
      items: mockCollections,
      total: 1,
      page: 1,
      page_size: 20,
    });
    vi.mocked(collectionsApi.listKnowledgeItems).mockResolvedValue({
      items: [
        {
          item_type: 'note',
          item_id: 'note-101',
          title: 'Big Bang Overview',
          added_at: '2026-10-16T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      page_size: 50,
    });
    vi.mocked(collectionsApi.getCollectionStats).mockResolvedValue({
      collection_id: 'coll-1',
      total_items: 1,
      by_type: { note: 1 },
    });
    vi.mocked(collectionsApi.getCollectionRelated).mockResolvedValue({
      collection_id: 'coll-1',
      related_entities: [
        {
          id: 'ent-1',
          name: 'Cosmic Microwave Background',
          entity_type: 'concept',
          via_item_id: 'note-101',
          via_item_type: 'note',
          via_item_title: 'Big Bang Overview',
        },
      ],
      total_related: 1,
    });
  });

  it('renders collections list and active collection details', async () => {
    render(<HyadesCollections workspaceId="ws-1" />);

    await waitFor(() => {
      expect(screen.getAllByText('Cosmology Collection').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Study of early universe').length).toBeGreaterThan(0);
      expect(screen.getByText('Big Bang Overview')).toBeInTheDocument();
      expect(screen.getByText('Cosmic Microwave Background')).toBeInTheDocument();
    });
  });

  it('allows creating a new collection', async () => {
    vi.mocked(collectionsApi.createCollection).mockResolvedValue({
      id: 'coll-2',
      workspace_id: 'ws-1',
      name: 'Galaxies',
      description: null,
      icon: null,
      created_by: 'user-1',
      created_at: '2026-10-16T00:00:00Z',
      updated_at: '2026-10-16T00:00:00Z',
    });

    render(<HyadesCollections workspaceId="ws-1" />);

    const input = screen.getByPlaceholderText('Collection name...');
    fireEvent.change(input, { target: { value: 'Galaxies' } });

    const createBtn = screen.getByRole('button', { name: /Create Collection/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(collectionsApi.createCollection).toHaveBeenCalledWith({
        workspace_id: 'ws-1',
        name: 'Galaxies',
        description: null,
      });
    });
  });
});
