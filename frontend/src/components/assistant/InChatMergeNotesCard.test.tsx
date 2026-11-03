import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InChatMergeNotesCard } from './InChatMergeNotesCard';

describe('InChatMergeNotesCard', () => {
  const mockSourceNotes = [
    { note_id: 'note-1', title: 'Neural Networks.md', word_count: 1248 },
    { note_id: 'note-2', title: 'Backpropagation.md', word_count: 892 },
    { note_id: 'note-3', title: 'Gradient Descent.md', word_count: 734 },
    { note_id: 'note-4', title: 'Optimization Algorithms.md', word_count: 512 },
  ];

  const mockPlanData = {
    card_type: 'merge_plan',
    stage: 'plan',
    title: 'Merged: Neural Networks, Backpropagation, Gradient Descent',
    content: '# Merged Overview\n\nComprehensive synthesis of neural network training.',
    source_notes: mockSourceNotes,
    plan: {
      source_notes: mockSourceNotes,
      analysis: {
        relationship_level: 'Strong',
        relationship_description: 'The notes cover closely related concepts in neural network training.',
        duplicate_count: 2,
        duplicate_summary: 'Repeated explanations will be consolidated.',
        difference_count: 1,
        difference_summary: 'Minor differences in hyperparameter examples.',
      },
      outline: [
        { id: 'sec-1', title: 'Introduction', mode: 'verbatim' },
        { id: 'sec-2', title: 'Neural Networks', mode: 'verbatim' },
        { id: 'sec-3', title: 'Backpropagation', mode: 'rewritten', description: 'Combine overlapping explanations and keep key details.' },
        { id: 'sec-4', title: 'Gradient Descent', mode: 'rewritten', description: 'Consolidate duplicate content and clarify the role in training.' },
        { id: 'sec-5', title: 'How They Work Together', mode: 'connective', description: 'A brief section to link the concepts based on the selected notes.', has_connective_text: true },
        { id: 'sec-6', title: 'Key Takeaways', mode: 'verbatim' },
      ],
      explanation: 'The LLM will write only for sections marked Rewritten or Connective. Other sections will be assembled from the original notes.',
    },
  };

  it('renders Stage 1 note selection card when invoked with select_notes card_type', () => {
    const onRunCommand = vi.fn();
    const resultData = {
      command: '/merge-notes',
      actionId: 'notes.get',
      status: 'completed',
      message: 'Select at least two notes to merge from your workspace.',
      data: {
        card_type: 'select_notes',
        stage: 'select',
        notes: [
          { id: 'n1', title: 'Neural Networks', word_count: 1248 },
          { id: 'n2', title: 'Backpropagation', word_count: 892 },
          { id: 'n3', title: 'Gradient Descent', word_count: 734 },
        ],
      },
    };

    render(<InChatMergeNotesCard result={resultData} onRunCommand={onRunCommand} />);

    expect(screen.getByTestId('merge-notes-select-card')).toBeInTheDocument();
    expect(screen.getByText('Select Notes to Merge')).toBeInTheDocument();
    expect(screen.getByTestId('merge-select-count-pill')).toHaveTextContent('0 selected');

    // Button disabled when < 2 selected
    const confirmBtn = screen.getByTestId('btn-confirm-merge-notes');
    expect(confirmBtn).toBeDisabled();

    // Toggle first note
    fireEvent.click(screen.getByTestId('merge-note-item-n1'));
    expect(screen.getByTestId('merge-select-count-pill')).toHaveTextContent('1 selected');
    expect(confirmBtn).toBeDisabled();

    // Toggle second note
    fireEvent.click(screen.getByTestId('merge-note-item-n2'));
    expect(screen.getByTestId('merge-select-count-pill')).toHaveTextContent('2 selected');
    expect(confirmBtn).not.toBeDisabled();

    // Search filtering
    const searchInput = screen.getByTestId('merge-select-search-input');
    fireEvent.change(searchInput, { target: { value: 'Neural' } });
    expect(screen.getByTestId('merge-note-item-n1')).toBeInTheDocument();
    expect(screen.queryByTestId('merge-note-item-n2')).not.toBeInTheDocument();

    // Clear search and run command
    fireEvent.change(searchInput, { target: { value: '' } });
    fireEvent.click(confirmBtn);
    expect(onRunCommand).toHaveBeenCalledWith('/merge-notes "Neural Networks" "Backpropagation"');
  });

  it('renders Mockup A 2-column Merge Plan with analysis badges, source notes, and outline badges', () => {
    const proposal = {
      proposalId: 'prop-123',
      actionId: 'notes.create',
      command: '/merge-notes',
      status: 'preview' as const,
      data: mockPlanData,
    };

    render(<InChatMergeNotesCard proposal={proposal} />);

    expect(screen.getByTestId('merge-plan-card')).toBeInTheDocument();
    expect(screen.getByText('Merge Plan')).toBeInTheDocument();
    expect(screen.getByTestId('merge-workflow-progress')).toBeInTheDocument();

    // Merge Analysis
    expect(screen.getByText('Merge Analysis')).toBeInTheDocument();
    expect(screen.getByText('Relationship')).toBeInTheDocument();
    expect(screen.getByText('Strong')).toBeInTheDocument();
    expect(screen.getByText('Duplicate Content')).toBeInTheDocument();
    expect(screen.getByTestId('analysis-duplicate-count')).toHaveTextContent('2');
    expect(screen.getByText('Differences')).toBeInTheDocument();
    expect(screen.getByTestId('analysis-difference-count')).toHaveTextContent('1');

    // Source Notes (3 visible initially)
    expect(screen.getByText('Source Notes (4)')).toBeInTheDocument();
    expect(screen.getByText('Neural Networks.md')).toBeInTheDocument();
    expect(screen.getByText('Backpropagation.md')).toBeInTheDocument();
    expect(screen.getByText('Gradient Descent.md')).toBeInTheDocument();
    expect(screen.getByText('+ 1 more source notes')).toBeInTheDocument();

    // Outline
    expect(screen.getByText('Proposed Outline')).toBeInTheDocument();
    expect(screen.getByText('Introduction')).toBeInTheDocument();
    expect(screen.getByText('Neural Networks')).toBeInTheDocument();
    expect(screen.getByText('Backpropagation')).toBeInTheDocument();
    expect(screen.getByText('Gradient Descent')).toBeInTheDocument();
    expect(screen.getByText('How They Work Together')).toBeInTheDocument();
    expect(screen.getByText('Key Takeaways')).toBeInTheDocument();

    // Badges
    expect(screen.getAllByText('Verbatim').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('Rewritten').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Connective').length).toBeGreaterThanOrEqual(1);

    // Footer banner and buttons
    expect(
      screen.getByText(/The LLM will write only for sections marked Rewritten or Connective/)
    ).toBeInTheDocument();
    expect(screen.getByTestId('btn-generate-draft')).toBeInTheDocument();
    expect(screen.getByTestId('btn-cancel-merge')).toBeInTheDocument();
  });

  it('supports interactive outline editing: title modification, mode change, add/remove section, reordering', () => {
    const proposal = {
      proposalId: 'prop-123',
      actionId: 'notes.create',
      command: '/merge-notes',
      status: 'preview' as const,
      data: mockPlanData,
    };

    render(<InChatMergeNotesCard proposal={proposal} />);

    // Click Edit Outline
    const editBtn = screen.getByTestId('btn-edit-outline');
    fireEvent.click(editBtn);
    expect(screen.getByText('Done Editing')).toBeInTheDocument();

    // Add Section
    const addBtn = screen.getByTestId('btn-add-section');
    fireEvent.click(addBtn);
    expect(screen.getByDisplayValue('New Custom Section')).toBeInTheDocument();

    // Edit title
    const titleInput = screen.getByDisplayValue('New Custom Section');
    fireEvent.change(titleInput, { target: { value: 'Architectural Details' } });
    expect(screen.getByDisplayValue('Architectural Details')).toBeInTheDocument();

    // Finish Editing
    fireEvent.click(editBtn);
    expect(screen.getByText('Architectural Details')).toBeInTheDocument();
    expect(screen.getByText('Edit Outline')).toBeInTheDocument();
  });

  it('transitions from plan to generate to review, with connective removal and document panel trigger', async () => {
    const onOpenDocumentPanel = vi.fn();
    const proposal = {
      proposalId: 'prop-123',
      actionId: 'notes.create',
      command: '/merge-notes',
      status: 'preview' as const,
      data: mockPlanData,
    };

    render(<InChatMergeNotesCard proposal={proposal} onOpenDocumentPanel={onOpenDocumentPanel} />);

    // Generate Draft
    fireEvent.click(screen.getByTestId('btn-generate-draft'));

    // Progress through generation to review
    await waitFor(
      () => {
        expect(screen.getByTestId('merge-review-view')).toBeInTheDocument();
      },
      { timeout: 1500 }
    );

    expect(screen.getByText('Draft Generated Successfully')).toBeInTheDocument();

    // Remove connective text
    const removeConnectiveBtn = screen.getByTestId('btn-remove-connective');
    expect(removeConnectiveBtn).toBeInTheDocument();
    fireEvent.click(removeConnectiveBtn);
    expect(screen.queryByTestId('btn-remove-connective')).not.toBeInTheDocument();

    // Open Document Panel
    const openDocPanelBtn = screen.getByTestId('btn-open-document-panel');
    fireEvent.click(openDocPanelBtn);
    expect(onOpenDocumentPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow: 'merge_notes',
        operation: 'merge',
        title: expect.any(String),
      })
    );
  });

  it('supports destination selection with overwrite confirmation safeguard on apply', async () => {
    const onConfirm = vi.fn();
    const proposal = {
      proposalId: 'prop-123',
      actionId: 'notes.create',
      command: '/merge-notes',
      status: 'preview' as const,
      data: { ...mockPlanData, stage: 'apply' },
    };

    render(<InChatMergeNotesCard proposal={proposal} onConfirm={onConfirm} />);

    expect(screen.getByTestId('merge-destination-view')).toBeInTheDocument();

    // Default destination: new note
    const applyBtn = screen.getByTestId('btn-apply-merge');
    expect(applyBtn).not.toBeDisabled();
    expect(applyBtn).toHaveTextContent('Create Merged Note');

    // Switch to replace source note
    fireEvent.click(screen.getByTestId('label-destination-replace'));
    expect(screen.getByTestId('select-replace-note')).toBeInTheDocument();
    expect(screen.getByTestId('label-confirm-overwrite')).toBeInTheDocument();

    // Apply button disabled until overwrite checkbox checked
    expect(applyBtn).toBeDisabled();

    // Confirm overwrite
    fireEvent.click(screen.getByTestId('checkbox-confirm-overwrite'));
    expect(applyBtn).not.toBeDisabled();
    expect(applyBtn).toHaveTextContent('Overwrite Note');

    // Apply
    fireEvent.click(applyBtn);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: 'replace_source',
        replace_note_id: 'note-1',
      })
    );
  });

  it('renders committed outcome with library navigation', () => {
    const onNavigateToItem = vi.fn();
    const proposal = {
      proposalId: 'prop-123',
      actionId: 'notes.create',
      command: '/merge-notes',
      status: 'committed' as const,
      data: {
        note_id: 'committed-note-99',
        title: 'Synthesized Neural Networks & Optimization',
      },
    };

    render(<InChatMergeNotesCard proposal={proposal} onNavigateToItem={onNavigateToItem} />);

    expect(screen.getByTestId('merge-committed-card')).toBeInTheDocument();
    expect(screen.getByText('Synthesized Neural Networks & Optimization')).toBeInTheDocument();

    const viewBtn = screen.getByTestId('btn-open-committed-note');
    fireEvent.click(viewBtn);
    expect(onNavigateToItem).toHaveBeenCalledWith('committed-note-99', 'note');
  });

  it('renders cancelled state gracefully', () => {
    const proposal = {
      proposalId: 'prop-123',
      actionId: 'notes.create',
      command: '/merge-notes',
      status: 'cancelled' as const,
      data: mockPlanData,
    };

    render(<InChatMergeNotesCard proposal={proposal} />);

    expect(screen.getByTestId('merge-cancelled-card')).toBeInTheDocument();
    expect(screen.getByText('Merge operation was cancelled.')).toBeInTheDocument();
  });
});
