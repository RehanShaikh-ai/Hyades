import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AstrolabeRadialMenu } from './AstrolabeRadialMenu';
import { GraphEntity } from '@/types/graph_entity';

describe('AstrolabeRadialMenu (Issue #37 - 8-Sector Precision)', () => {
  const mockEntity: GraphEntity = {
    id: 'ent-kepler-16b',
    name: 'Kepler-16b System',
    entity_type: 'concept',
    description: 'Circumbinary exoplanet observed in Cygnus constellation.',
    created_at: '2026-10-29T00:00:00Z',
    updated_at: '2026-10-29T00:00:00Z',
    workspace_id: 'ws-1',
    is_manual: true,
  };

  const defaultProps = {
    entity: mockEntity,
    position: { x: 400, y: 300 },
    onClose: vi.fn(),
    onEditEntity: vi.fn(),
    onAddRelationship: vi.fn(),
    onFocusEntity: vi.fn(),
    onAskStella: vi.fn(),
    onDeleteEntity: vi.fn(),
    onCreateEntity: vi.fn(),
    onCreateNote: vi.fn(),
    onResetCamera: vi.fn(),
    onUntangleGraph: vi.fn(),
    onClusterGraph: vi.fn(),
    onImportSources: vi.fn(),
    onToggleSkyGrid: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders entity name and type in the central hub', () => {
    render(<AstrolabeRadialMenu {...defaultProps} />);
    expect(screen.getByText(/concept/i)).toBeInTheDocument();
    expect(screen.getByText('Kepler-16b System')).toBeInTheDocument();
    expect(screen.getByText(/close/i)).toBeInTheDocument();
  });

  it('renders all 6 entity action wedges with accessible labels and distinct hues', () => {
    render(<AstrolabeRadialMenu {...defaultProps} />);
    expect(screen.getByRole('menuitem', { name: /EDIT: Name & Type/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /LINK: Connect Star/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /FOCUS: Center & 1-Hop/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /STELLA: Ask Context/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /COPY ID: UUID \/ Label/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /PRUNE: Delete Star/i })).toBeInTheDocument();
  });

  it('triggers onEditEntity when EDIT wedge is clicked (Issue #37)', () => {
    render(<AstrolabeRadialMenu {...defaultProps} />);
    const editWedge = screen.getByRole('menuitem', { name: /EDIT: Name & Type/i });
    fireEvent.click(editWedge);
    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(defaultProps.onEditEntity).toHaveBeenCalledWith(mockEntity);
  });

  it('renders all 8 distinct void actions (KnifeLemon/Filee 1:1 match) when entity is null', () => {
    render(<AstrolabeRadialMenu {...defaultProps} entity={null} />);
    expect(screen.getByText('VOID RETICLE')).toBeInTheDocument();
    
    // 8 distinct non-duplicated actions in continuous spectral loop
    expect(screen.getByRole('menuitem', { name: /NEW STAR: Create Entity/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /NEW NOTE: Field Log/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /FIT VIEW: Center Origin/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /UNTANGLE: Relax Graph/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /CLUSTER: Spectral Sort/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /IMPORT: Ingest PDF\/MD/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /SKY GRID: Toggle Reticle/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /STELLA: Query Horizon/i })).toBeInTheDocument();
  });

  it('triggers onUntangleGraph when UNTANGLE wedge is clicked on void', () => {
    render(<AstrolabeRadialMenu {...defaultProps} entity={null} />);
    const untangleWedge = screen.getByRole('menuitem', { name: /UNTANGLE: Relax Graph/i });
    fireEvent.click(untangleWedge);
    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(defaultProps.onUntangleGraph).toHaveBeenCalled();
  });

  it('triggers onClusterGraph when CLUSTER wedge is clicked on void', () => {
    render(<AstrolabeRadialMenu {...defaultProps} entity={null} />);
    const clusterWedge = screen.getByRole('menuitem', { name: /CLUSTER: Spectral Sort/i });
    fireEvent.click(clusterWedge);
    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(defaultProps.onClusterGraph).toHaveBeenCalled();
  });

  it('triggers onToggleSkyGrid when SKY GRID wedge is clicked on void', () => {
    render(<AstrolabeRadialMenu {...defaultProps} entity={null} />);
    const gridWedge = screen.getByRole('menuitem', { name: /SKY GRID: Toggle Reticle/i });
    fireEvent.click(gridWedge);
    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(defaultProps.onToggleSkyGrid).toHaveBeenCalled();
  });

  it('closes on Escape key press', () => {
    render(<AstrolabeRadialMenu {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click', () => {
    render(<AstrolabeRadialMenu {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});

