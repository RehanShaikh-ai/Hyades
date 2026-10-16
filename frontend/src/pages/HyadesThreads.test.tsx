
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HyadesThreads } from './HyadesThreads';
import * as threadsApi from '@/api/threads';

vi.mock('@/api/threads');

describe('HyadesThreads Component (§15.2)', () => {
  const mockThread = {
    id: 'th-1',
    workspace_id: 'ws-1',
    title: 'Dark Matter Investigation',
    guiding_question: 'What is the nature of sterile neutrinos?',
    status: 'active' as const,
    created_by: 'user-1',
    created_at: '2026-10-16T00:00:00Z',
    updated_at: '2026-10-16T00:00:00Z',
    questions: [
      {
        id: 'q-1',
        question: 'Are sterile neutrinos detectable at IceCube?',
        status: 'open' as const,
        created_at: '2026-10-16T00:00:00Z',
        updated_at: '2026-10-16T00:00:00Z',
      },
    ],
    discoveries: [
      {
        id: 'd-1',
        content: 'Recent cross-section limits exclude 1 eV mass range.',
        created_at: '2026-10-16T00:00:00Z',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(threadsApi.listThreads).mockResolvedValue({
      items: [mockThread],
      total: 1,
      page: 1,
      page_size: 20,
    });
    vi.mocked(threadsApi.getThread).mockResolvedValue(mockThread);
    vi.mocked(threadsApi.getThreadActivity).mockResolvedValue([
      {
        type: 'question',
        id: 'act-1',
        summary: 'Question posed: Are sterile neutrinos detectable?',
        timestamp: '2026-10-16T00:00:00Z',
      },
    ]);
  });

  it('renders research thread workspace with guiding question and timeline', async () => {
    render(<HyadesThreads workspaceId="ws-1" />);

    await waitFor(() => {
      expect(screen.getAllByText('Dark Matter Investigation').length).toBeGreaterThan(0);
      expect(screen.getAllByText(/What is the nature of sterile neutrinos/i).length).toBeGreaterThan(0);
      expect(screen.getByText('Are sterile neutrinos detectable at IceCube?')).toBeInTheDocument();
      expect(screen.getByText('Recent cross-section limits exclude 1 eV mass range.')).toBeInTheDocument();
    });
  });

  it('allows posing a new question in the thread', async () => {
    vi.mocked(threadsApi.addThreadQuestion).mockResolvedValue({
      id: 'q-2',
      question: 'What about keV sterile neutrinos?',
      status: 'open',
      created_at: '2026-10-16T00:00:00Z',
      updated_at: '2026-10-16T00:00:00Z',
    });

    render(<HyadesThreads workspaceId="ws-1" />);

    const input = await screen.findByPlaceholderText('Pose a new question...');
    fireEvent.change(input, { target: { value: 'What about keV sterile neutrinos?' } });

    const askBtn = screen.getByRole('button', { name: /Ask/i });
    fireEvent.click(askBtn);

    await waitFor(() => {
      expect(threadsApi.addThreadQuestion).toHaveBeenCalledWith('th-1', {
        question: 'What about keV sterile neutrinos?',
      });
    });
  });
});
