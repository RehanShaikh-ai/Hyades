
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HyadesInbox } from './HyadesInbox';
import * as inboxApi from '@/api/inbox';

vi.mock('@/api/inbox');

describe('HyadesInbox Component (§15.4)', () => {
  const mockInboxItem = {
    id: 'inbox-1',
    workspace_id: 'ws-1',
    source_id: 'src-1',
    status: 'pending' as const,
    detection_status: 'completed' as const,
    detected_count: 2,
    detection_truncated: false,
    created_at: '2026-10-16T00:00:00Z',
    source_title: 'galaxy_survey.csv',
    source_type: 'csv',
    file_size_bytes: 4096,
    extract_knowledge: true,
    detected_entities: [
      { name: 'Andromeda', type: 'place', description: 'Spiral galaxy' },
      { name: 'Hubble Constant', type: 'concept', description: 'Expansion rate' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(inboxApi.listInbox).mockResolvedValue({
      items: [mockInboxItem],
      total: 1,
      page: 1,
      page_size: 20,
    });
    vi.mocked(inboxApi.getInboxItem).mockResolvedValue(mockInboxItem);
  });

  it('renders inbox items and dry-run detected concept preview', async () => {
    render(<HyadesInbox workspaceId="ws-1" />);

    await waitFor(() => {
      expect(screen.getAllByText('galaxy_survey.csv').length).toBeGreaterThan(0);
      expect(screen.getByText('Andromeda')).toBeInTheDocument();
      expect(screen.getByText('Hubble Constant')).toBeInTheDocument();
    });
  });

  it('allows accepting an inbox item to start extraction', async () => {
    vi.mocked(inboxApi.acceptInboxItem).mockResolvedValue({
      status: 'accepted',
      inbox_item_id: 'inbox-1',
      source_id: 'src-1',
      extraction_started: true,
    });

    render(<HyadesInbox workspaceId="ws-1" />);

    const acceptBtn = await screen.findByRole('button', { name: 'Accept' });
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(inboxApi.acceptInboxItem).toHaveBeenCalledWith('inbox-1');
    });
  });

  it('requires confirmation before permanently rejecting an item', async () => {
    render(<HyadesInbox workspaceId="ws-1" />);

    await waitFor(() => {
      expect(screen.getAllByText('galaxy_survey.csv').length).toBeGreaterThan(0);
    });

    const rejectBtn = screen.getByRole('button', { name: 'Reject' });
    fireEvent.click(rejectBtn);

    // Modal should appear
    await waitFor(() => {
      expect(screen.getByText(/Confirm Rejection/i)).toBeInTheDocument();
    });

    vi.mocked(inboxApi.rejectInboxItem).mockResolvedValue({
      status: 'rejected',
      deleted_source_id: 'src-1',
    });

    const confirmBtn = screen.getByRole('button', { name: /Permanently Reject/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(inboxApi.rejectInboxItem).toHaveBeenCalledWith('inbox-1');
    });
  });
});
