import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  TransformDocumentPanel,
  TransformDocumentDraft,
  computeLCSDiff,
  countWords,
} from './TransformDocumentPanel';

describe('TransformDocumentPanel & Helpers', () => {
  describe('computeLCSDiff and countWords helpers', () => {
    it('computes correct word counts', () => {
      expect(countWords('')).toBe(0);
      expect(countWords('hello world')).toBe(2);
      expect(countWords('   The   OSI 7-Layer   Model   ')).toBe(4);
    });

    it('computes LCS diff correctly for additions, deletions, and neutrals', () => {
      const original = 'Line 1\nLine 2\nLine 3';
      const modified = 'Line 1\nLine 2 modified\nLine 3\nLine 4';
      const diff = computeLCSDiff(original, modified);

      expect(diff).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'neutral', text: 'Line 1' }),
          expect.objectContaining({ type: 'delete', text: 'Line 2' }),
          expect.objectContaining({ type: 'add', text: 'Line 2 modified' }),
          expect.objectContaining({ type: 'neutral', text: 'Line 3' }),
          expect.objectContaining({ type: 'add', text: 'Line 4' }),
        ])
      );
    });
  });

  describe('TransformDocumentPanel component', () => {
    const mockDraft: TransformDocumentDraft = {
      proposalId: 'prop-123',
      confirmationToken: 'tok-abc',
      operation: 'shorten',
      noteId: 'note-1',
      noteTitle: 'The OSI 7-Layer Reference Model and Modern Protocol Stacks',
      originalContent: '# The OSI 7-Layer Reference Model\n\nLong original paragraph with 556 words...',
      proposedContent: '# The OSI 7-Layer Reference Model\n\nA concise overview of the OSI model.\n\n## 1. Overview\n\nStructured summary.',
      draftContent: '# The OSI 7-Layer Reference Model\n\nA concise overview of the OSI model.\n\n## 1. Overview\n\nStructured summary.',
      originalWordCount: 556,
      proposedWordCount: 410,
      wordCountChangePercent: -26,
      messageId: 'msg-1',
      status: 'draft',
    };

    it('renders panel header, draft status badge, and live word count stats', () => {
      const onClose = vi.fn();
      const onApply = vi.fn();
      const onDiscard = vi.fn();
      const onToggleMaximize = vi.fn();

      render(
        <TransformDocumentPanel
          draft={mockDraft}
          onClose={onClose}
          onApply={onApply}
          onDiscard={onDiscard}
          onToggleMaximize={onToggleMaximize}
        />
      );

      expect(screen.getByTestId('transform-document-panel')).toBeInTheDocument();
      expect(screen.getByText('Transform Note · Shorten')).toBeInTheDocument();
      expect(screen.getByText('Draft · Not applied')).toBeInTheDocument();

      // Check stats line
      expect(screen.getByTestId('document-stat-line')).toBeInTheDocument();
      expect(screen.getByText(/Original:/)).toBeInTheDocument();
      expect(screen.getByText(/Proposed:/)).toBeInTheDocument();

      // Check maximize and close buttons
      fireEvent.click(screen.getByTestId('btn-maximize-document-panel'));
      expect(onToggleMaximize).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId('btn-close-document-panel'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('renders formatted markdown in Preview mode and toggles to Edit and Changes', () => {
      render(
        <TransformDocumentPanel
          draft={mockDraft}
          onClose={vi.fn()}
          onApply={vi.fn()}
          onDiscard={vi.fn()}
        />
      );

      // Default active tab is Preview
      expect(screen.getByTestId('document-preview-content')).toBeInTheDocument();
      expect(screen.getByText('The OSI 7-Layer Reference Model')).toBeInTheDocument();

      // Switch to Edit tab
      fireEvent.click(screen.getByTestId('tab-edit'));
      expect(screen.getByTestId('document-edit-content')).toBeInTheDocument();
      const textarea = screen.getByTestId('document-panel-textarea') as HTMLTextAreaElement;
      expect(textarea.value).toContain('The OSI 7-Layer Reference Model');

      // Switch to Changes tab
      fireEvent.click(screen.getByTestId('tab-changes'));
      expect(screen.getByTestId('document-changes-content')).toBeInTheDocument();
    });

    it('supports live editing in Edit mode and propagates draft changes', () => {
      const onDraftChange = vi.fn();

      render(
        <TransformDocumentPanel
          draft={mockDraft}
          onClose={vi.fn()}
          onApply={vi.fn()}
          onDiscard={vi.fn()}
          onDraftChange={onDraftChange}
        />
      );

      fireEvent.click(screen.getByTestId('tab-edit'));
      const textarea = screen.getByTestId('document-panel-textarea');

      fireEvent.change(textarea, {
        target: { value: '# Custom Modified Draft Title\n\nCustom content here.' },
      });

      expect(onDraftChange).toHaveBeenCalledWith(
        '# Custom Modified Draft Title\n\nCustom content here.'
      );
      expect(screen.getByText('• Modified from original AI proposal')).toBeInTheDocument();
    });

    it('requires confirmation before discarding manual edits', () => {
      const onDiscard = vi.fn();

      render(
        <TransformDocumentPanel
          draft={mockDraft}
          onClose={vi.fn()}
          onApply={vi.fn()}
          onDiscard={onDiscard}
        />
      );

      // Make a manual edit
      fireEvent.click(screen.getByTestId('tab-edit'));
      const textarea = screen.getByTestId('document-panel-textarea');
      fireEvent.change(textarea, { target: { value: 'Modified content...' } });

      // Click Discard
      fireEvent.click(screen.getByTestId('btn-discard-draft'));
      expect(onDiscard).not.toHaveBeenCalled();
      expect(screen.getByText('Discard edits?')).toBeInTheDocument();

      // Confirm discard
      fireEvent.click(screen.getByText('Yes'));
      expect(onDiscard).toHaveBeenCalledTimes(1);
    });

    it('calls onApply with the final content when clicking Apply to Note', async () => {
      const onApply = vi.fn().mockResolvedValue(undefined);

      render(
        <TransformDocumentPanel
          draft={mockDraft}
          onClose={vi.fn()}
          onApply={onApply}
          onDiscard={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTestId('tab-edit'));
      const textarea = screen.getByTestId('document-panel-textarea');
      fireEvent.change(textarea, {
        target: { value: '# Final Approved Content\n\nLooks great.' },
      });

      const applyBtn = screen.getByTestId('btn-apply-to-note');
      fireEvent.click(applyBtn);

      await waitFor(() => {
        expect(onApply).toHaveBeenCalledWith('# Final Approved Content\n\nLooks great.');
      });
    });
  });
});
