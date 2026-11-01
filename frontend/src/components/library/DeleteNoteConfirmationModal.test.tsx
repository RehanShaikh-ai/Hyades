import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteNoteConfirmationModal } from './DeleteNoteConfirmationModal';

describe('DeleteNoteConfirmationModal', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <DeleteNoteConfirmationModal
        isOpen={false}
        noteTitle="Test Note"
        isDeleting={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders note title and consequence details when open', () => {
    render(
      <DeleteNoteConfirmationModal
        isOpen={true}
        noteTitle="Distributed Systems Notes"
        isDeleting={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Delete Note' })).toBeInTheDocument();
    expect(screen.getByText('Distributed Systems Notes')).toBeInTheDocument();
    expect(screen.getByText(/Vector search embeddings and graph index provenance will be purged/i)).toBeInTheDocument();
  });

  it('calls onCancel when cancel button is clicked', async () => {
    const onCancel = vi.fn();
    render(
      <DeleteNoteConfirmationModal
        isOpen={true}
        noteTitle="Test Note"
        isDeleting={false}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );

    const cancelBtn = screen.getByTestId('cancel-delete-note-btn');
    await userEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm when delete button is clicked', async () => {
    const onConfirm = vi.fn();
    render(
      <DeleteNoteConfirmationModal
        isOpen={true}
        noteTitle="Test Note"
        isDeleting={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    const confirmBtn = screen.getByTestId('confirm-delete-note-btn');
    await userEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows loading spinner and disables buttons during isDeleting', () => {
    render(
      <DeleteNoteConfirmationModal
        isOpen={true}
        noteTitle="Test Note"
        isDeleting={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('Deleting...')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-delete-note-btn')).toBeDisabled();
    expect(screen.getByTestId('cancel-delete-note-btn')).toBeDisabled();
  });

  it('displays error message when error prop is provided', () => {
    render(
      <DeleteNoteConfirmationModal
        isOpen={true}
        noteTitle="Test Note"
        isDeleting={false}
        error="Network error while deleting note"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('Network error while deleting note')).toBeInTheDocument();
  });
});

