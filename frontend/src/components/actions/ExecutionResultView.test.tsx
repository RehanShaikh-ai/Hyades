import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ExecutionResultView } from './ExecutionResultView';
import { ActionResultEnvelope } from '@/types/actions';

describe('ExecutionResultView Component (§3.C, §3.D, §3.E, §8, §9)', () => {
  const mockEnvelope: ActionResultEnvelope = {
    execution_id: 'exec-888-xyz',
    action_id: 'notes.summarize',
    status: 'succeeded',
    initiated_by: 'user',
    duration_ms: 345,
    current_stage: 'completed',
    result: {
      summary_word_count: 85,
      compression_ratio: 0.24,
    },
    interpretation: 'This is a **synthesized summary** of the celestial dynamics document. [[Alpha Centauri]] represents a triple star system.',
    evidence: [
      {
        item_id: 'src-101',
        item_type: 'source',
        chunk_id: 'chunk-55',
        source_id: 'src-astronomy-doc',
        similarity_score: 0.892, // MUST NOT BE LABELED CONFIDENCE
        excerpt: 'Alpha Centauri is a triple star system located in the southern constellation of Centaurus.',
        reference: 'Section 4.2 - Stellar Neighborhood',
        title: 'Celestial Systems Manual',
      },
    ],
    proposals: [
      {
        id: 'prop-1',
        execution_id: 'exec-888-xyz',
        action_id: 'notes.summarize',
        proposal_payload: {
          summary: 'Synthesized stellar mechanics',
        },
        affected_item_ids: ['note-777', 'note-888'],
        confirmation_token: 'conf-tok-abc-123',
        expires_at: '2026-12-31T23:59:59Z',
        status: 'pending',
      },
    ],
    committed_changes: [
      {
        change_set_id: 'cs-001',
        item_id: 'note-777',
        item_type: 'note',
        before_state: { title: 'Old Note Title' },
        after_state: { title: 'Updated Note Title' },
        committed_at: '2026-10-21T10:00:00Z',
        undo_supported: true,
        undo_status: 'available',
      },
    ],
  };

  it('renders all canonical envelope fields (§9)', () => {
    render(
      <ExecutionResultView
        envelope={mockEnvelope}
        onCancelExecution={vi.fn()}
      />
    );

    expect(screen.getByTestId('execution-id-badge')).toBeDefined();
    expect(screen.getByText('exec-888-xyz')).toBeDefined();
    expect(screen.getByText(/notes\.summarize/)).toBeDefined();
    expect(screen.getByText('345 ms')).toBeDefined();
    expect(screen.getByText('user')).toBeDefined();
  });

  it('strictly separates evidence from interpretation (§8.3, §3.D)', () => {
    render(
      <ExecutionResultView
        envelope={mockEnvelope}
        onCancelExecution={vi.fn()}
      />
    );

    // Tab 1: Interpretation should be visible initially
    expect(screen.getByTestId('tab-interpretation')).toBeDefined();
    expect(screen.getByTestId('interpretation-section')).toBeDefined();
    expect(screen.getByText(/Generated Interpretation & Synthesis/i)).toBeDefined();

    // Tab 2: Switch to Evidence
    const evidenceTab = screen.getByTestId('tab-evidence');
    fireEvent.click(evidenceTab);

    expect(screen.getByTestId('evidence-section')).toBeDefined();
    expect(screen.getByTestId('evidence-card-src-101')).toBeDefined();
    expect(screen.getByText(/chunk-55/)).toBeDefined();
    expect(screen.getByText(/src-astronomy-doc/)).toBeDefined();
    expect(screen.getByText(/Section 4.2 - Stellar Neighborhood/i)).toBeDefined();
  });

  it('NEVER labels similarity score as confidence (§8.2, §3.D)', () => {
    const { container } = render(
      <ExecutionResultView
        envelope={mockEnvelope}
        onCancelExecution={vi.fn()}
      />
    );

    // Switch to evidence tab
    fireEvent.click(screen.getByTestId('tab-evidence'));

    // Check evidence score display
    const scoreBadge = screen.getByTestId('evidence-similarity-score');
    expect(scoreBadge).toBeDefined();
    expect(scoreBadge.textContent).toContain('Similarity: 89.2%');

    // Assert that the word "confidence" or "Confidence" does NOT appear anywhere in the rendered markup
    const fullText = container.textContent || '';
    expect(fullText.toLowerCase()).not.toContain('confidence');
  });

  it('renders proposal review with affected IDs and confirmation token (§3.E, §6)', () => {
    const handleConfirm = vi.fn();
    const handleReject = vi.fn();

    render(
      <ExecutionResultView
        envelope={mockEnvelope}
        onConfirmProposal={handleConfirm}
        onRejectProposal={handleReject}
        onCancelExecution={vi.fn()}
      />
    );

    // Switch to proposals tab
    fireEvent.click(screen.getByTestId('tab-proposals'));

    expect(screen.getByTestId('proposal-card-prop-1')).toBeDefined();
    expect(screen.getByTestId('affected-items-list')).toBeDefined();
    expect(screen.getByText('note-777')).toBeDefined();
    expect(screen.getByText('note-888')).toBeDefined();
    expect(screen.getByText('conf-tok-abc-123')).toBeDefined();

    // Click commit proposal button
    const commitBtn = screen.getByTestId('confirm-proposal-btn-prop-1');
    fireEvent.click(commitBtn);
    expect(handleConfirm).toHaveBeenCalledWith(mockEnvelope.proposals[0], 'conf-tok-abc-123');

    // Click reject proposal button
    const rejectBtn = screen.getByTestId('reject-proposal-btn-prop-1');
    fireEvent.click(rejectBtn);
    expect(handleReject).toHaveBeenCalledWith(mockEnvelope.proposals[0]);
  });

  it('displays committed changes and supported undo controls (§3.E, §6.7)', () => {
    const handleUndo = vi.fn();

    render(
      <ExecutionResultView
        envelope={mockEnvelope}
        onUndoChange={handleUndo}
        onCancelExecution={vi.fn()}
      />
    );

    // Switch to proposals & changes tab
    fireEvent.click(screen.getByTestId('tab-proposals'));

    expect(screen.getByTestId('committed-changes-section')).toBeDefined();
    expect(screen.getByText(/Target Record: note-777/i)).toBeDefined();

    // Undo button should be present since undo_supported is true
    const undoBtn = screen.getByTestId('undo-change-btn-note-777');
    expect(undoBtn).toBeDefined();
    fireEvent.click(undoBtn);
    expect(handleUndo).toHaveBeenCalledWith('cs-001');
  });

  it('allows cancelling an active running execution (§3.C)', () => {
    const handleCancel = vi.fn();
    const runningEnvelope: ActionResultEnvelope = {
      ...mockEnvelope,
      status: 'running',
    };

    render(
      <ExecutionResultView
        envelope={runningEnvelope}
        onCancelExecution={handleCancel}
      />
    );

    const cancelBtn = screen.getByTestId('cancel-execution-btn');
    expect(cancelBtn).toBeDefined();
    fireEvent.click(cancelBtn);
    expect(handleCancel).toHaveBeenCalledWith('exec-888-xyz');
  });
});
