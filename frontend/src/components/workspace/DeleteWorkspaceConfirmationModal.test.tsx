import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteWorkspaceConfirmationModal } from './DeleteWorkspaceConfirmationModal';
import { Workspace } from '@/types/workspaces';

const mockWorkspace: Workspace = {
  id: 'ws-del-1',
  name: 'Archival Research Lab',
  description: 'A test workspace',
  owner_id: 'user-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('DeleteWorkspaceConfirmationModal', () => {
  it('does not render when isOpen is false or workspace is null', () => {
    const { container } = render(
      <DeleteWorkspaceConfirmationModal
        isOpen={false}
        workspace={mockWorkspace}
        isDeleting={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps Delete Workspace button disabled until exact workspace name is typed', async () => {
    const onConfirm = vi.fn();
    render(
      <DeleteWorkspaceConfirmationModal
        isOpen={true}
        workspace={mockWorkspace}
        isDeleting={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    const deleteBtn = screen.getByTestId('confirm-delete-workspace-btn');
    expect(deleteBtn).toBeDisabled();

    const input = screen.getByTestId('confirm-workspace-name-input');
    await userEvent.type(input, 'Wrong Name');
    expect(deleteBtn).toBeDisabled();

    await userEvent.clear(input);
    await userEvent.type(input, 'Archival Research Lab');
    expect(deleteBtn).toBeEnabled();

    await userEvent.click(deleteBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel is clicked', async () => {
    const onCancel = vi.fn();
    render(
      <DeleteWorkspaceConfirmationModal
        isOpen={true}
        workspace={mockWorkspace}
        isDeleting={false}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );

    const cancelBtn = screen.getByTestId('cancel-delete-workspace-btn');
    await userEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('displays error message when error prop is provided', () => {
    render(
      <DeleteWorkspaceConfirmationModal
        isOpen={true}
        workspace={mockWorkspace}
        isDeleting={false}
        error="Only the workspace owner can delete this workspace."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('Only the workspace owner can delete this workspace.')).toBeInTheDocument();
  });
});

