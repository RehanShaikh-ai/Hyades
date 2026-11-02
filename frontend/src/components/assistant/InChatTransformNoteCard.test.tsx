import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InChatTransformNoteCard } from './InChatTransformNoteCard';

describe('InChatTransformNoteCard', () => {
  it('renders /transform-note options 9-card interactive grid and usage pills', () => {
    const onRunCommand = vi.fn();
    const resultData = {
      command: '/transform-note options',
      actionId: 'notes.get',
      status: 'completed',
      message: 'Transform, improve, and develop your notes. Use one of the operations below:',
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
        usage_examples: [
          '/transform-note enrich "<note title>"',
          '/transform-note shorten "<note title>"',
          '/transform-note expand "<note title>"',
        ],
      },
    };

    render(<InChatTransformNoteCard result={resultData} onRunCommand={onRunCommand} />);

    expect(screen.getByTestId('transform-note-options-card')).toBeInTheDocument();
    expect(screen.getByText('/transform-note — Intelligent note operations')).toBeInTheDocument();

    // Verify all 9 tiles
    expect(screen.getByTestId('transform-option-enrich')).toBeInTheDocument();
    expect(screen.getByTestId('transform-option-shorten')).toBeInTheDocument();
    expect(screen.getByTestId('transform-option-expand')).toBeInTheDocument();
    expect(screen.getByTestId('transform-option-simplify')).toBeInTheDocument();
    expect(screen.getByTestId('transform-option-restructure')).toBeInTheDocument();
    expect(screen.getByTestId('transform-option-improve')).toBeInTheDocument();
    expect(screen.getByTestId('transform-option-connect')).toBeInTheDocument();
    expect(screen.getByTestId('transform-option-study')).toBeInTheDocument();
    expect(screen.getByTestId('transform-option-audit')).toBeInTheDocument();

    // Clicking an operation tile
    fireEvent.click(screen.getByTestId('transform-option-enrich'));
    expect(onRunCommand).toHaveBeenCalledWith('/transform-note enrich ');

    // Clicking usage pill
    fireEvent.click(screen.getByText('/transform-note shorten "<note title>"'));
    expect(onRunCommand).toHaveBeenCalledWith('/transform-note shorten "<note title>"');
  });

  it('renders Transform Note · Enrich proposal card matching reference specification', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const onPreviewArtifact = vi.fn();

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
        onPreviewArtifact={onPreviewArtifact}
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

    // Click Preview: Full Note
    fireEvent.click(screen.getByTestId('btn-preview-full-note'));
    expect(onPreviewArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Vector Embeddings and Approximate Nearest Neighbor Search',
        type: 'Note',
      })
    );

    // Click Preview: Changes Only
    fireEvent.click(screen.getByTestId('btn-preview-changes-only'));
    expect(onPreviewArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'Note Diff',
      })
    );

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
