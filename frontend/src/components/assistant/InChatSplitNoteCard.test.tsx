import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InChatSplitNoteCard } from './InChatSplitNoteCard';

describe('InChatSplitNoteCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            content_mode: 'preserve',
            count_mode: 'auto',
            target_count: 4,
            proposed_parts: [
              {
                id: 'part-1',
                title: 'Vector Embeddings: Foundations',
                focus: 'High-dimensional embeddings and dot-product geometry',
                content: '# Vector Embeddings: Foundations\n\nHigh-dimensional embeddings...',
                preview: 'High-dimensional embeddings...',
                word_count: 340,
                source_sections: ['Foundations'],
              },
              {
                id: 'part-2',
                title: 'Vector Embeddings: ANN Algorithms',
                focus: 'Approximate nearest neighbor search and latency trade-offs',
                content: '# Vector Embeddings: ANN Algorithms\n\nHNSW graphs...',
                preview: 'HNSW graphs...',
                word_count: 452,
                source_sections: ['ANN'],
              },
            ],
            decomposition_advice: 'Partitioned note into 2 cohesive, modular notes.',
          }),
      })
    );
  });

  const mockConfigureData = {
    card_type: 'split_note_plan',
    stage: 'configure',
    workflow: 'split_note',
    original_note_id: 'note-vec-1',
    original_title: 'Vector Embeddings and Approximate Nearest Neighbor Search',
    source_note: {
      id: 'note-vec-1',
      title: 'Vector Embeddings and Approximate Nearest Neighbor Search',
      topic: 'Machine Learning',
      word_count: 792,
      section_count: 2,
      sections: ['Exact Nearest Neighbors', 'Approximate Nearest Neighbors'],
      content_preview: 'Dense vector embeddings represent unstructured text in high-dimensional continuous vector space...',
      content: '# Vector Embeddings...\n\n## Exact Nearest Neighbors\n...\n\n## Approximate Nearest Neighbors\n...',
    },
    content_mode: 'preserve',
    count_mode: 'auto',
    target_count: 4,
    proposed_parts: [
      {
        id: 'part-1',
        title: 'Vector Embeddings: Foundations',
        focus: 'Dense vector representations and embedding geometry',
        content: '# Vector Embeddings: Foundations\n\n_Split from: Vector Embeddings_\n\nDense vector representations map semantic meaning...',
        preview: 'Dense vector representations map semantic meaning into high-dimensional space...',
        word_count: 340,
        source_sections: ['Foundations'],
      },
      {
        id: 'part-2',
        title: 'Vector Embeddings: Search Mechanisms',
        focus: 'Approximate nearest neighbor algorithms and latency trade-offs',
        content: '# Vector Embeddings: Search Mechanisms\n\n_Split from: Vector Embeddings_\n\nHierarchical Navigable Small World (HNSW)...',
        preview: 'Hierarchical Navigable Small World (HNSW) and inverted file indexing...',
        word_count: 452,
        source_sections: ['Search Mechanisms'],
      },
    ],
  };

  it('renders Stage 1: Configure with all UI elements matching the reference image', () => {
    const onConfirm = vi.fn();
    render(
      <InChatSplitNoteCard
        proposal={{
          proposalId: 'prop-123',
          confirmationToken: 'tok-abc',
          command: '/split-note "Vector Embeddings and Approximate Nearest Neighbor Search"',
          data: mockConfigureData,
        }}
        onConfirm={onConfirm}
      />
    );

    // 1. Header elements
    expect(screen.getByText('Split Note')).toBeInTheDocument();
    expect(screen.getByText('Stella · Knowledge decomposition')).toBeInTheDocument();
    expect(screen.getByTestId('split-workflow-stepper')).toBeInTheDocument();
    expect(screen.getByText('Configure')).toBeInTheDocument();
    expect(screen.getByText('Analyze')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();

    // 2. Main title & subtitle
    expect(screen.getByText("Let's split your note.")).toBeInTheDocument();
    expect(
      screen.getByText(
        'Stella will analyze the entire note, identify related concepts and propose multiple independent notes.'
      )
    ).toBeInTheDocument();

    // 3. Source note card
    expect(screen.getByText('Source note')).toBeInTheDocument();
    expect(screen.getByText('Selected')).toBeInTheDocument();
    expect(screen.getByText('Vector Embeddings and Approximate Nearest Neighbor Search')).toBeInTheDocument();
    expect(screen.getByText(/Machine Learning · ~792 words · 2 main sections/i)).toBeInTheDocument();
    expect(screen.getByText('View details')).toBeInTheDocument();

    // 4. Content handling modes
    expect(screen.getByText('How should Stella handle your content?')).toBeInTheDocument();
    expect(screen.getByText('Preserve Original Content')).toBeInTheDocument();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(screen.getByText('Adapt for Standalone Notes')).toBeInTheDocument();

    // 5. Note count selection
    expect(screen.getByText('How many notes should Stella create?')).toBeInTheDocument();
    expect(screen.getByText('Automatic (Recommended)')).toBeInTheDocument();
    expect(screen.getByText('Let Stella decide')).toBeInTheDocument();
    expect(screen.getByText('Set a specific number')).toBeInTheDocument();
    expect(screen.getByText('Target number of notes')).toBeInTheDocument();

    // 6. Stepper & Slider
    expect(screen.getByRole('slider')).toBeInTheDocument();
    expect(screen.getByText('Choose between 2 and 15 notes.')).toBeInTheDocument();

    // 7. Original note protection shield notice
    expect(screen.getByText('Original note protection')).toBeInTheDocument();
    expect(
      screen.getByText(
        'The original note will remain untouched. Nothing enters your Library until you approve the proposals.'
      )
    ).toBeInTheDocument();

    // 8. Action button
    expect(screen.getByTestId('btn-analyze-split')).toHaveTextContent('Analyze and propose notes');
  });

  it('toggles source note details drawer when clicking View details', () => {
    render(
      <InChatSplitNoteCard
        proposal={{
          proposalId: 'prop-123',
          confirmationToken: 'tok-abc',
          data: mockConfigureData,
        }}
      />
    );

    const toggleBtn = screen.getByText('View details');
    fireEvent.click(toggleBtn);

    expect(screen.getByText('Hide details')).toBeInTheDocument();
    expect(screen.getByText('Detected sections:')).toBeInTheDocument();
    expect(screen.getByText('Exact Nearest Neighbors')).toBeInTheDocument();
    expect(screen.getByText('Approximate Nearest Neighbors')).toBeInTheDocument();
  });

  it('switches between content handling modes (Preserve vs Adapt)', () => {
    render(
      <InChatSplitNoteCard
        proposal={{
          proposalId: 'prop-123',
          data: mockConfigureData,
        }}
      />
    );

    const modePreserve = screen.getByTestId('mode-preserve');
    const modeAdapt = screen.getByTestId('mode-adapt');

    // Default is preserve
    expect(modePreserve).toHaveClass('border-emerald-500');

    // Click adapt
    fireEvent.click(modeAdapt);
    expect(modeAdapt).toHaveClass('border-emerald-500');

    // Click preserve back
    fireEvent.click(modePreserve);
    expect(modePreserve).toHaveClass('border-emerald-500');
  });

  it('switches between count modes and increments/decrements target count stepper', () => {
    render(
      <InChatSplitNoteCard
        proposal={{
          proposalId: 'prop-123',
          data: mockConfigureData,
        }}
      />
    );

    const countCustom = screen.getByTestId('count-custom');
    fireEvent.click(countCustom);
    expect(countCustom).toHaveClass('border-emerald-500');

    const plusBtn = screen.getByLabelText('Increase note count');
    const minusBtn = screen.getByLabelText('Decrease note count');

    // Initially 4
    expect(screen.getByTestId('target-count-display')).toHaveTextContent('4');

    // Click plus -> 5
    fireEvent.click(plusBtn);
    expect(screen.getByTestId('target-count-display')).toHaveTextContent('5');

    // Click minus twice -> 3
    fireEvent.click(minusBtn);
    fireEvent.click(minusBtn);
    expect(screen.getByTestId('target-count-display')).toHaveTextContent('3');
  });

  it('transitions from Configure to Analyze and Review stages', async () => {
    render(
      <InChatSplitNoteCard
        proposal={{
          proposalId: 'prop-123',
          confirmationToken: 'tok-abc',
          data: mockConfigureData,
        }}
      />
    );

    const analyzeBtn = screen.getByTestId('btn-analyze-split');
    fireEvent.click(analyzeBtn);

    // Immediately shows Analyze stage
    expect(screen.getByTestId('split-analyze-stage')).toBeInTheDocument();
    expect(screen.getByText('Analyzing Knowledge Boundaries...')).toBeInTheDocument();

    // Transitions to Review stage
    await waitFor(
      () => {
        expect(screen.getByTestId('split-review-stage')).toBeInTheDocument();
      },
      { timeout: 2000 }
    );

    expect(screen.getByText(/Proposed Notes/)).toBeInTheDocument();
    expect(screen.getByText(/Vector Embeddings: Foundations/)).toBeInTheDocument();
  });

  it('allows editing title, reordering, and approving notes in Review stage', async () => {
    const onConfirm = vi.fn();
    render(
      <InChatSplitNoteCard
        proposal={{
          proposalId: 'prop-123',
          confirmationToken: 'tok-abc',
          data: {
            ...mockConfigureData,
            stage: 'review',
          },
        }}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByTestId('split-review-stage')).toBeInTheDocument();

    // Verify title editing
    const editBtn = screen.getAllByTitle('Edit note title')[0];
    fireEvent.click(editBtn);

    const input = screen.getByDisplayValue('Vector Embeddings: Foundations');
    fireEvent.change(input, { target: { value: 'High-Dimensional Vectors' } });
    fireEvent.blur(input);

    expect(screen.getByText('High-Dimensional Vectors')).toBeInTheDocument();

    // Approve and create notes
    const approveBtn = screen.getByTestId('btn-approve-split');
    fireEvent.click(approveBtn);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const overrides = onConfirm.mock.calls[0][0];
    expect(overrides.proposed_parts).toBeDefined();
    expect(overrides.proposed_parts[0].title).toBe('High-Dimensional Vectors');
  });

  it('renders Stage 4: Done when proposal status is committed', () => {
    const onNavigateToItem = vi.fn();
    render(
      <InChatSplitNoteCard
        proposal={{
          proposalId: 'prop-123',
          status: 'committed',
          data: {
            ...mockConfigureData,
            status: 'split_committed',
            created_count: 2,
            created_notes: [
              { note_id: 'n-new-1', title: 'Part 1: Foundations', word_count: 340 },
              { note_id: 'n-new-2', title: 'Part 2: ANN Algorithms', word_count: 452 },
            ],
          },
        }}
        onNavigateToItem={onNavigateToItem}
      />
    );

    expect(screen.getByTestId('split-done-stage')).toBeInTheDocument();
    expect(screen.getByText(/Successfully created 2 independent notes!/)).toBeInTheDocument();
    expect(screen.getByText('Part 1: Foundations')).toBeInTheDocument();
    expect(screen.getByText('Part 2: ANN Algorithms')).toBeInTheDocument();

    const openBtns = screen.getAllByText('Open in Library');
    fireEvent.click(openBtns[0]);
    expect(onNavigateToItem).toHaveBeenCalledWith('n-new-1', 'note');

    // Reassurance that original note was preserved untouched
    expect(screen.getByText(/was preserved completely untouched in your Library/)).toBeInTheDocument();
  });

  it('renders interactive note selection card when invoked with select_note card_type', () => {
    const onRunCommand = vi.fn();
    render(
      <InChatSplitNoteCard
        result={{
          command: '/split-note',
          data: {
            card_type: 'select_note',
            workflow: 'split_note',
            notes: [
              { id: 'n1', title: 'Operating Systems Process Isolation', word_count: 840, topic: 'Systems' },
              { id: 'n2', title: 'Vector Embeddings and ANN', word_count: 792, topic: 'Machine Learning' },
            ],
          },
        }}
        onRunCommand={onRunCommand}
      />
    );

    expect(screen.getByTestId('split-select-note-card')).toBeInTheDocument();
    expect(screen.getByText('Choose a note to split')).toBeInTheDocument();
    expect(screen.getByText('Operating Systems Process Isolation')).toBeInTheDocument();
    expect(screen.getByText('Vector Embeddings and ANN')).toBeInTheDocument();

    // Select note and proceed
    fireEvent.click(screen.getByText('Vector Embeddings and ANN'));
    const proceedBtn = screen.getByText('Proceed to Configure');
    fireEvent.click(proceedBtn);

    expect(onRunCommand).toHaveBeenCalledWith('/split-note "Vector Embeddings and ANN"');
  });
});
