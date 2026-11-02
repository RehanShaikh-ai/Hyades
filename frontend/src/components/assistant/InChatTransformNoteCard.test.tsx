import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InChatTransformNoteCard } from './InChatTransformNoteCard';

describe('InChatTransformNoteCard', () => {
  it('requires explicit operation confirmation before advancing to note selection', () => {
    const onRunCommand = vi.fn();
    const resultData = {
      command: '/transform-note options',
      actionId: 'notes.get',
      status: 'completed',
      message: 'Transform, improve, and develop your notes. Choose an operation to continue:',
      data: {
        card_type: 'transform_options',
        title: '/transform-note — Intelligent note operations',
        operations: [
          { operation: 'enrich', title: 'enrich', description: 'Add missing, relevant knowledge with evidence' },
          { operation: 'shorten', title: 'shorten', description: 'Condense while preserving key ideas' },
          { operation: 'expand', title: 'expand', description: 'Develop ideas with more depth and examples' },
          { operation: 'simplify', title: 'simplify', description: 'Explain in clearer, simpler language' },
          { operation: 'restructure', title: 'restructure', description: 'Improve organization and flow' },
          { operation: 'improve', title: 'improve', description: 'Fix clarity, repetition, and style' },
          { operation: 'connect', title: 'connect', description: 'Find links to related notes and concepts' },
          { operation: 'study', title: 'study', description: 'Create summaries, questions, or flashcards' },
          { operation: 'audit', title: 'audit', description: 'Check claims, consistency, and uncertainty' },
        ],
        usage: '/transform-note <operation> "<note title>"',
        example: '/transform-note shorten "The OSI 7-Layer Reference Model..."',
      },
    };

    render(<InChatTransformNoteCard result={resultData} onRunCommand={onRunCommand} />);

    expect(screen.getByTestId('transform-note-options-card')).toBeInTheDocument();
    expect(screen.getByText('/transform-note — Intelligent note operations')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-progress-indicator')).toBeInTheDocument();

    // Verify tiles
    expect(screen.getByTestId('transform-option-enrich')).toBeInTheDocument();
    expect(screen.getByTestId('transform-option-shorten')).toBeInTheDocument();
    expect(screen.getByTestId('transform-option-expand')).toBeInTheDocument();

    // Clicking an operation tile selects it without advancing
    fireEvent.click(screen.getByTestId('transform-option-shorten'));
    expect(onRunCommand).not.toHaveBeenCalled();

    // Confirmation bar appears with selected details
    expect(screen.getByTestId('operation-confirmation-bar')).toBeInTheDocument();
    expect(screen.getByText(/Selected: shorten/)).toBeInTheDocument();

    // Clicking Confirm Operation button triggers command
    const confirmBtn = screen.getByTestId('btn-confirm-operation');
    expect(confirmBtn).toBeInTheDocument();
    fireEvent.click(confirmBtn);
    expect(onRunCommand).toHaveBeenCalledWith('/transform-note shorten');

    // Cancel clears selection
    fireEvent.click(screen.getByTestId('transform-option-enrich'));
    expect(screen.getByTestId('operation-confirmation-bar')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('btn-cancel-operation'));
    expect(screen.queryByTestId('operation-confirmation-bar')).not.toBeInTheDocument();
  });

  it('requires explicit note confirmation before starting execution', () => {
    const onRunCommand = vi.fn();
    const resultData = {
      command: '/transform-note shorten',
      actionId: 'notes.get',
      status: 'completed',
      message: 'Select a note to shorten',
      data: {
        card_type: 'select_note',
        operation: 'shorten',
        title: 'Select a note to shorten',
        prompt: 'Choose a note from your workspace.',
        notes: [
          {
            id: 'note-1',
            title: 'The OSI 7-Layer Reference Model and Modern Protocol Stacks',
            word_count: 556,
            updated_at_relative: 'Updated 3 days ago',
          },
          {
            id: 'note-2',
            title: 'Vector Embeddings and Approximate Nearest Neighbor Search',
            word_count: 1842,
            updated_at_relative: 'Updated 3 days ago',
          },
          {
            id: 'note-3',
            title: 'Conflict-Free Replicated Data Types (CRDTs) in Distributed Systems',
            word_count: 728,
            updated_at_relative: 'Updated 5 days ago',
          },
        ],
        total_notes: 3,
      },
    };

    render(<InChatTransformNoteCard result={resultData} onRunCommand={onRunCommand} />);

    expect(screen.getByTestId('transform-note-select-card')).toBeInTheDocument();
    expect(screen.getByText('Select a note to shorten')).toBeInTheDocument();
    expect(screen.getByText('Choose a note from your workspace.')).toBeInTheDocument();
    expect(screen.getByTestId('select-note-count-pill')).toHaveTextContent('3 notes');
    expect(screen.getByTestId('workflow-progress-indicator')).toBeInTheDocument();

    // Verify notes listed
    expect(
      screen.getByText('The OSI 7-Layer Reference Model and Modern Protocol Stacks')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Vector Embeddings and Approximate Nearest Neighbor Search')
    ).toBeInTheDocument();

    // Clicking a note selects it but does NOT execute immediately
    fireEvent.click(screen.getByTestId('select-note-item-note-1'));
    expect(onRunCommand).not.toHaveBeenCalled();

    // Note confirmation bar is shown
    expect(screen.getByTestId('note-confirmation-bar')).toBeInTheDocument();
    expect(screen.getByText(/1 note selected/)).toBeInTheDocument();

    // Back button returns to operation options
    const backBtn = screen.getByTestId('btn-back-to-operations');
    fireEvent.click(backBtn);
    expect(onRunCommand).toHaveBeenCalledWith('/transform-note');

    // Reselect note and confirm
    fireEvent.click(screen.getByTestId('select-note-item-note-1'));
    const confirmBtn = screen.getByTestId('btn-confirm-note');
    fireEvent.click(confirmBtn);
    expect(onRunCommand).toHaveBeenCalledWith(
      '/transform-note shorten "The OSI 7-Layer Reference Model and Modern Protocol Stacks"'
    );
  });

  it('renders dedicated proposal card with Document Panel launch button and summary deltas', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const onOpenDocumentPanel = vi.fn();

    const proposalData = {
      command: '/transform-note shorten "The OSI 7-Layer Reference Model and Modern Protocol Stacks"',
      commandName: 'Transform Note',
      actionId: 'notes.update',
      status: 'preview' as const,
      data: {
        operation: 'shorten',
        workflow: 'transform_note',
        title: 'The OSI 7-Layer Reference Model and Modern Protocol Stacks',
        summary: 'Prepared a shortened version of "The OSI 7-Layer Reference Model and Modern Protocol Stacks".',
        original_content: 'The Open Systems Interconnection (OSI) model, which was developed by ISO in 1984...',
        proposed_content: 'The OSI model (ISO, 1984) provides a standard framework...',
        original_word_count: 556,
        proposed_word_count: 410,
        word_count_change_percent: -26,
        word_count_change_str: '(-26%)',
        what_changed: [
          'Condensed verbose explanations and redundant details.',
          'Reorganized content for clearer flow.',
          'Preserved key concepts, definitions, and technical accuracy.',
        ],
        diff_lines: [
          '- The Open Systems Interconnection (OSI) model...',
          '+ The OSI model (ISO, 1984)...',
        ],
      },
    };

    render(
      <InChatTransformNoteCard
        proposal={proposalData}
        onConfirm={onConfirm}
        onCancel={onCancel}
        onOpenDocumentPanel={onOpenDocumentPanel}
      />
    );

    expect(screen.getByTestId('transform-note-proposal-card')).toBeInTheDocument();
    expect(screen.getByText('Transform Note · Shorten')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-progress-indicator')).toBeInTheDocument();

    // Live word count stat line
    expect(screen.getByText(/Original: 556 words → Proposed: 410 words \(-26%\)/)).toBeInTheDocument();

    // What changed bullet points
    expect(screen.getByText('What changed')).toBeInTheDocument();
    expect(screen.getByText('Condensed verbose explanations and redundant details.')).toBeInTheDocument();

    // Critical assertion: NO Workspace Evidence indicator
    expect(screen.queryByText('Workspace Evidence')).not.toBeInTheDocument();
    expect(screen.queryByText('Supporting Passage')).not.toBeInTheDocument();

    // Document Panel launch button
    const openPanelBtn = screen.getByTestId('btn-open-document-panel');
    expect(openPanelBtn).toBeInTheDocument();
    fireEvent.click(openPanelBtn);
    expect(onOpenDocumentPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'shorten',
        workflow: 'transform_note',
      })
    );

    // Apply Changes button
    fireEvent.click(screen.getByTestId('btn-apply-changes'));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'The OSI model (ISO, 1984) provides a standard framework...',
      })
    );
  });

  it('renders Transform Note · Enrich proposal card with citations and supporting evidence', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    const proposalData = {
      command: '/transform-note enrich "Vector Embeddings"',
      commandName: 'Transform Note',
      actionId: 'notes.update',
      status: 'preview' as const,
      data: {
        operation: 'enrich',
        workflow: 'enrich_note',
        title: 'Vector Embeddings and Approximate Nearest Neighbor Search',
        summary: 'Analyzed the note, identified knowledge gaps, and prepared 3 enrichment proposals with supporting evidence.',
        proposed_content: 'Full enriched content here...',
        enrichment_addition: '### Search Parameters\nHNSW M and ef parameters...',
        proposals: [
          {
            id: 'p-1',
            title: 'Search Parameters and Trade-offs',
            proposed_text: 'Explain key HNSW parameters (M, ef_construct, ef_search) and their impact on recall, latency, and memory.',
            source_title: 'HNSW: Efficient and Robust Approximate... §4.2',
            supporting_evidence: 'The construction parameter M controls the number of bidirectional links.',
            status: 'accepted' as const,
          },
          {
            id: 'p-2',
            title: 'Similarity Metrics and Normalization',
            proposed_text: 'Clarify common similarity metrics (cosine, dot product, L2) and the role of vector normalization.',
            source_title: 'Dense Retrieval for Open-Domain QA §3.1',
            supporting_evidence: 'Cosine distance on normalized vectors reduces to inner product.',
            status: 'accepted' as const,
          },
          {
            id: 'p-3',
            title: 'Limitations and Failure Modes',
            proposed_text: 'Add a brief section on known limitations (hubness, domain mismatch) and recall degradation under heavy quantization.',
            source_title: 'Practical Considerations for Vector Search §5',
            supporting_evidence: 'Hubness in high dimensions degrades query precision.',
            status: 'rejected' as const,
          },
        ],
      },
    };

    render(
      <InChatTransformNoteCard
        proposal={proposalData}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByTestId('transform-note-proposal-card')).toBeInTheDocument();
    expect(screen.getByText('Transform Note · Enrich')).toBeInTheDocument();
    expect(screen.getByText('Search Parameters and Trade-offs')).toBeInTheDocument();
    expect(screen.getByText('Similarity Metrics and Normalization')).toBeInTheDocument();
    expect(screen.getByText('Limitations and Failure Modes')).toBeInTheDocument();

    // 2 selected initially (p-1 and p-2)
    expect(screen.getByTestId('selected-count-label')).toHaveTextContent('2 selected');

    // Toggle 3rd proposal to select it
    fireEvent.click(screen.getByTestId('proposal-item-p-3'));
    expect(screen.getByTestId('selected-count-label')).toHaveTextContent('3 selected');

    // Click Apply Changes
    fireEvent.click(screen.getByTestId('btn-apply-changes'));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        selected_proposal_ids: expect.arrayContaining(['p-1', 'p-2', 'p-3']),
      })
    );
  });

  it('renders Transform Note · Audit findings list', () => {
    const resultData = {
      command: '/transform-note audit "Vector Embeddings"',
      actionId: 'notes.get',
      status: 'completed',
      data: {
        card_type: 'transform_audit',
        operation: 'audit',
        title: 'Vector Embeddings and Approximate Nearest Neighbor Search',
        findings: [
          {
            id: 'f-1',
            severity: 'warning',
            section: 'Core Claims & Evidence',
            claim: 'Guarantees logarithmic search latency across all index sizes.',
            critique: 'Logarithmic bound degrades when graph degree distribution becomes skewed.',
            recommendation: 'Specify indexing limits and mention graph maintenance costs.',
          },
          {
            id: 'f-2',
            severity: 'concern',
            section: 'Architectural Robustness',
            claim: 'No failure modes listed.',
            critique: 'Memory exhaustion can occur with high M values.',
            recommendation: 'Add trade-off section on memory overhead.',
          },
        ],
      },
    };

    render(<InChatTransformNoteCard result={resultData} />);

    expect(screen.getByTestId('transform-note-audit-card')).toBeInTheDocument();
    expect(screen.getByText('Core Claims & Evidence')).toBeInTheDocument();
    expect(screen.getByText('Architectural Robustness')).toBeInTheDocument();
    expect(screen.getByText('warning')).toBeInTheDocument();
    expect(screen.getByText('concern')).toBeInTheDocument();
  });
});
