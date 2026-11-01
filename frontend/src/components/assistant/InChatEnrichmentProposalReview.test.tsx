import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InChatEnrichmentProposalReview, EnrichmentProposalItem } from './InChatEnrichmentProposalReview';

const mockProposals: EnrichmentProposalItem[] = [
  {
    id: 'prop-1',
    type: 'knowledge',
    title: 'Beryllium Tamper Physics',
    proposed_text: 'The core was surrounded by two hemispherical beryllium reflector shells.',
    target_section: 'Physical Mechanism',
    evidence_basis: 'workspace',
    supporting_evidence: 'Beryllium reflects leaking neutrons back into the subcritical plutonium mass.',
    source_id: 'src-123',
    source_title: 'Manhattan Project Technical Folio.pdf',
    source_type: 'source',
    rationale: 'Factual verification from workspace documentation.',
    status: 'accepted',
  },
  {
    id: 'prop-2',
    type: 'clarity',
    title: 'Slotin Criticality Accident',
    proposed_text: 'Clarifies that Louis Slotin manipulated the upper dome with a flathead screwdriver.',
    target_section: 'Historical Incidents',
    evidence_basis: 'model_knowledge',
    supporting_evidence: null,
    source_id: null,
    source_title: null,
    source_type: null,
    rationale: 'Addresses ambiguity in the timeline.',
    status: 'accepted',
  },
  {
    id: 'prop-3',
    type: 'connection',
    title: 'Keplerian Orbital Harmonics',
    proposed_text: 'Substantive mathematical analogy between inverse-square neutron diffusion and orbital mechanics.',
    target_section: 'Workspace Connections',
    evidence_basis: 'workspace',
    supporting_evidence: 'Both systems govern central flux distributions across radial boundaries.',
    source_id: 'note-kepler',
    source_title: 'Keplerian Orbital Harmonics',
    source_type: 'note',
    rationale: 'High-value mathematical conceptual connection.',
    status: 'accepted',
  },
];

describe('InChatEnrichmentProposalReview Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders top outcome banner, summary, and count metrics', () => {
    render(
      <InChatEnrichmentProposalReview
        details={{
          title: 'Demon Core: Overview and Core Concepts',
          outcome: 'partially_enriched',
          summary: 'Prepared 3 additions. 1 gap requires external archival sources.',
          proposals: mockProposals,
          unresolved_gaps: [
            {
              gap_id: 'gap-aftermath',
              description: 'Missing declassified military burial protocol',
              reason: 'No local documentation exists',
            },
          ],
          research_directions: ['Check Los Alamos National Laboratory archives.'],
        }}
      />
    );

    expect(screen.getByText('Partially Enriched')).toBeInTheDocument();
    expect(screen.getByText(/Prepared 3 additions/)).toBeInTheDocument();
    expect(screen.getByText('3 addition(s)')).toBeInTheDocument();
    expect(screen.getByText(/Missing declassified military burial protocol/)).toBeInTheDocument();
    expect(screen.getByText(/Check Los Alamos National Laboratory archives/)).toBeInTheDocument();
  });

  it('renders knowledge and clarity proposals with evidence basis and source link', () => {
    const onNavigate = vi.fn();
    render(
      <InChatEnrichmentProposalReview
        details={{
          title: 'Demon Core',
          outcome: 'enriched',
          proposals: mockProposals,
        }}
        onNavigateToItem={onNavigate}
      />
    );

    expect(screen.getByText('Proposed Knowledge & Clarity Additions (2)')).toBeInTheDocument();
    expect(screen.getByText('The core was surrounded by two hemispherical beryllium reflector shells.')).toBeInTheDocument();
    expect(screen.getAllByText('Workspace').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Model knowledge')).toBeInTheDocument();

    // Click source navigation link
    const sourceLink = screen.getByText('Manhattan Project Technical Folio.pdf');
    expect(sourceLink).toBeInTheDocument();
    fireEvent.click(sourceLink);
    expect(onNavigate).toHaveBeenCalledWith('src-123', 'source');
  });

  it('groups connections separately and provides a bulk toggle', () => {
    const onSelectionChange = vi.fn();
    render(
      <InChatEnrichmentProposalReview
        details={{
          title: 'Demon Core',
          outcome: 'enriched',
          proposals: mockProposals,
        }}
        onSelectionChange={onSelectionChange}
      />
    );

    expect(screen.getByText('Workspace Connections (1)')).toBeInTheDocument();
    const rejectAllBtn = screen.getByText('Reject All Connections');
    expect(rejectAllBtn).toBeInTheDocument();

    // Click reject all connections
    fireEvent.click(rejectAllBtn);
    expect(onSelectionChange).toHaveBeenCalled();
  });

  it('supports inline editing of proposed text', () => {
    const onSelectionChange = vi.fn();
    render(
      <InChatEnrichmentProposalReview
        details={{
          title: 'Demon Core',
          outcome: 'enriched',
          proposals: mockProposals,
        }}
        onSelectionChange={onSelectionChange}
      />
    );

    const editBtns = screen.getAllByTitle('Edit proposed text');
    fireEvent.click(editBtns[0]);

    const textarea = screen.getByDisplayValue(
      'The core was surrounded by two hemispherical beryllium reflector shells.'
    );
    expect(textarea).toBeInTheDocument();

    fireEvent.change(textarea, {
      target: {
        value: 'Revised text: Beryllium reflector halves manipulate prompt critical mass.',
      },
    });

    const saveBtn = screen.getByRole('button', { name: /Save Edit/i });
    fireEvent.click(saveBtn);

    expect(onSelectionChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        'prop-1': 'Revised text: Beryllium reflector halves manipulate prompt critical mass.',
      })
    );
  });

  it('invokes preview artifact callback with assembled note content', () => {
    const onPreview = vi.fn();
    render(
      <InChatEnrichmentProposalReview
        details={{
          title: 'Demon Core',
          original_content: 'Original brief introduction.',
          outcome: 'enriched',
          proposals: mockProposals,
        }}
        onPreviewArtifact={onPreview}
      />
    );

    const previewBtn = screen.getByRole('button', { name: /Preview Note/i });
    fireEvent.click(previewBtn);

    expect(onPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Enriched: Demon Core',
        subtitle: '3 Accepted Proposals',
      })
    );
  });
});
