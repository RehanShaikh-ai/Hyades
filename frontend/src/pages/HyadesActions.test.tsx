import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HyadesActions } from './HyadesActions';
import * as actionsApi from '@/api/actions';
import { ActionDefinition, ActionResultEnvelope, ExecutionListResponse } from '@/types/actions';

vi.mock('@/api/actions');

describe('HyadesActions Master Page Integration (§3, §5, §6, §13)', () => {
  const mockActions: ActionDefinition[] = [
    {
      id: 'notes.summarize',
      name: 'Summarize Note',
      description: 'Condense note into executive summary',
      side_effect: 'read',
      input_schema: {
        type: 'object',
        properties: {
          note_id: { type: 'string', title: 'Note ID' },
        },
        required: ['note_id'],
      },
    },
    {
      id: 'notes.update',
      name: 'Update Note',
      description: 'Mutate note title or content',
      side_effect: 'write',
      input_schema: {
        type: 'object',
        properties: {
          note_id: { type: 'string', title: 'Note ID' },
          title: { type: 'string', title: 'Title' },
        },
        required: ['note_id'],
      },
    },
  ];

  const mockRunningEnvelope: ActionResultEnvelope = {
    execution_id: 'exec-running-01',
    action_id: 'notes.summarize',
    status: 'running',
    initiated_by: 'user',
    duration_ms: 120,
    current_stage: 'tokenizing',
    result: null,
    evidence: [],
    interpretation: null,
    proposals: [],
    committed_changes: [],
  };

  const mockSucceededEnvelope: ActionResultEnvelope = {
    execution_id: 'exec-running-01',
    action_id: 'notes.summarize',
    status: 'succeeded',
    initiated_by: 'user',
    duration_ms: 450,
    current_stage: 'completed',
    result: { status: 'done' },
    evidence: [
      {
        item_id: 'src-1',
        item_type: 'source',
        similarity_score: 0.95,
        excerpt: 'Stellar classification excerpt',
      },
    ],
    interpretation: 'Note summarization completed successfully.',
    proposals: [],
    committed_changes: [],
  };

  const mockHistoryResponse: ExecutionListResponse = {
    items: [mockSucceededEnvelope],
    total: 1,
    page: 1,
    page_size: 15,
    total_pages: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.mocked(actionsApi.getActionCatalogue).mockResolvedValue({
      actions: mockActions,
      total: 2,
    });
    vi.mocked(actionsApi.listExecutions).mockResolvedValue(mockHistoryResponse);
  });

  it('loads and renders the canonical action catalogue from GET /actions', async () => {
    render(<HyadesActions workspaceId="ws-test-1" />);

    expect(screen.getByTestId('a11y-announcements')).toBeDefined();

    await waitFor(() => {
      expect(actionsApi.getActionCatalogue).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByTestId('action-card-notes.summarize')).toBeDefined();
    expect(await screen.findByTestId('action-card-notes.update')).toBeDefined();
  });

  it('selects an action, opens input form, and submits an execution', async () => {
    vi.mocked(actionsApi.executeAction).mockResolvedValue(mockRunningEnvelope);
    vi.mocked(actionsApi.getExecution).mockResolvedValue(mockSucceededEnvelope);

    render(<HyadesActions workspaceId="ws-test-1" />);

    // Wait for actions to load
    const summarizeCard = await screen.findByTestId('action-card-notes.summarize');
    fireEvent.click(summarizeCard);

    // Form should appear
    expect(await screen.findByTestId('action-input-form')).toBeDefined();
    expect(screen.getByTestId('action-input-note_id')).toBeDefined();

    // Fill form
    fireEvent.change(screen.getByTestId('action-input-note_id'), {
      target: { value: 'note-stellar-01' },
    });

    // Submit form
    fireEvent.click(screen.getByTestId('execute-action-btn'));

    await waitFor(() => {
      expect(actionsApi.executeAction).toHaveBeenCalledWith(
        'notes.summarize',
        expect.objectContaining({
          mode: 'read',
          input: { note_id: 'note-stellar-01' },
        }),
        'ws-test-1'
      );
    });

    // Check that execution result view is displayed
    expect(await screen.findByTestId('execution-result-view')).toBeDefined();
  });

  it('restores persistent execution state from sessionStorage on mount (§3.C)', async () => {
    sessionStorage.setItem('hyades_v051_active_execution_id', 'exec-persisted-999');
    vi.mocked(actionsApi.getExecution).mockResolvedValue({
      ...mockSucceededEnvelope,
      execution_id: 'exec-persisted-999',
    });

    render(<HyadesActions workspaceId="ws-test-1" />);

    await waitFor(() => {
      expect(actionsApi.getExecution).toHaveBeenCalledWith('exec-persisted-999');
    });

    expect(await screen.findByTestId('execution-result-view')).toBeDefined();
    expect(screen.getByText('exec-persisted-999')).toBeDefined();
  });

  it('handles cancellation of active execution', async () => {
    vi.mocked(actionsApi.cancelExecution).mockResolvedValue({
      ...mockRunningEnvelope,
      status: 'cancelled',
      error_message: 'Execution aborted by user',
    });

    sessionStorage.setItem('hyades_v051_active_execution_id', 'exec-running-01');
    vi.mocked(actionsApi.getExecution).mockResolvedValue(mockRunningEnvelope);

    render(<HyadesActions workspaceId="ws-test-1" />);

    // Wait for active execution view
    expect(await screen.findByTestId('execution-result-view')).toBeDefined();

    const cancelBtn = await screen.findByTestId('cancel-execution-btn');
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(actionsApi.cancelExecution).toHaveBeenCalledWith('exec-running-01');
    });
  });

  it('navigates to execution history and displays paginated list', async () => {
    render(<HyadesActions workspaceId="ws-test-1" />);

    const historyTabBtn = await screen.findByTestId('view-history-tab');
    fireEvent.click(historyTabBtn);

    expect(await screen.findByTestId('execution-history')).toBeDefined();
    expect(await screen.findByTestId('history-row-exec-running-01')).toBeDefined();
  });
});
