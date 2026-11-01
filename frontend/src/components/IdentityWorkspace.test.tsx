import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserCreateForm } from './UserCreateForm';
import { UserList } from './UserList';
import { WorkspaceCreateForm } from './WorkspaceCreateForm';
import { WorkspaceList } from './WorkspaceList';
import { LoadingState } from './LoadingState';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import * as userApi from '@/api/users';
import * as workspaceApi from '@/api/workspaces';
import { User } from '@/types/users';
import { Workspace } from '@/types/workspaces';

describe('Workstream A Component Test Suite (§18, §22.2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockUsers: User[] = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      display_name: 'Ada Lovelace',
      created_at: '2026-09-17T12:00:00Z',
      updated_at: '2026-09-17T12:00:00Z',
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      display_name: 'Alan Turing',
      created_at: '2026-09-17T12:05:00Z',
      updated_at: '2026-09-17T12:05:00Z',
    },
  ];

  const mockWorkspaces: Workspace[] = [
    {
      id: '33333333-3333-3333-3333-333333333333',
      name: 'Algorithm Research',
      description: 'Foundational research notes',
      owner_id: '11111111-1111-1111-1111-111111111111',
      created_at: '2026-09-17T12:10:00Z',
      updated_at: '2026-09-17T12:10:00Z',
    },
  ];

  describe('LoadingState', () => {
    it('renders loading state with default message', () => {
      render(<LoadingState />);
      expect(screen.getByTestId('loading-state')).toBeInTheDocument();
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('renders loading state with custom message', () => {
      render(<LoadingState message="Fetching users..." />);
      expect(screen.getByText('Fetching users...')).toBeInTheDocument();
    });
  });

  describe('EmptyState', () => {
    it('renders empty state with default message', () => {
      render(<EmptyState />);
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText('No records found.')).toBeInTheDocument();
    });

    it('renders empty state with custom message', () => {
      render(<EmptyState message="No users created yet." />);
      expect(screen.getByText('No users created yet.')).toBeInTheDocument();
    });
  });

  describe('ErrorState', () => {
    it('renders string error', () => {
      render(<ErrorState error="Something went wrong" />);
      expect(screen.getByTestId('error-state')).toHaveTextContent('Something went wrong');
    });

    it('renders ApiError object with code and message', () => {
      render(
        <ErrorState
          error={{
            error: { code: 'VALIDATION_ERROR', message: 'Name too short' },
          }}
        />
      );
      expect(screen.getByTestId('error-state')).toHaveTextContent(
        '[VALIDATION_ERROR] Name too short'
      );
    });
  });

  describe('UserList', () => {
    it('renders empty state when users array is empty', () => {
      render(<UserList users={[]} loading={false} error={null} />);
      expect(screen.getByTestId('empty-state')).toHaveTextContent('No users created yet.');
    });

    it('renders loading state when loading is true', () => {
      render(<UserList users={[]} loading={true} error={null} />);
      expect(screen.getByTestId('loading-state')).toBeInTheDocument();
    });

    it('renders error state when error is provided', () => {
      render(
        <UserList
          users={[]}
          loading={false}
          error={{ error: { code: 'INTERNAL_SERVER_ERROR', message: 'DB down' } }}
        />
      );
      expect(screen.getByTestId('error-state')).toHaveTextContent('DB down');
    });

    it('renders user items when users are provided', () => {
      render(<UserList users={mockUsers} loading={false} error={null} />);
      const items = screen.getAllByTestId('user-item');
      expect(items).toHaveLength(2);
      expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
      expect(screen.getByText('Alan Turing')).toBeInTheDocument();
    });
  });

  describe('UserCreateForm', () => {
    it('renders form inputs and submit button', () => {
      render(<UserCreateForm />);
      expect(screen.getByLabelText(/Display Name/i)).toBeInTheDocument();
      expect(screen.getByTestId('user-create-submit')).toBeInTheDocument();
    });

    it('validates empty display name before submission', async () => {
      render(<UserCreateForm />);
      fireEvent.click(screen.getByTestId('user-create-submit'));
      expect(screen.getByTestId('error-state')).toHaveTextContent(
        'Display name cannot be empty.'
      );
    });

    it('handles successful user creation', async () => {
      const onUserCreated = vi.fn();
      const newUser: User = {
        id: '44444444-4444-4444-4444-444444444444',
        display_name: 'Grace Hopper',
        created_at: '2026-09-17T12:20:00Z',
        updated_at: '2026-09-17T12:20:00Z',
      };
      vi.spyOn(userApi, 'createUser').mockResolvedValueOnce(newUser);

      render(<UserCreateForm onUserCreated={onUserCreated} />);

      fireEvent.change(screen.getByTestId('user-display-name-input'), {
        target: { value: 'Grace Hopper' },
      });
      fireEvent.click(screen.getByTestId('user-create-submit'));

      await waitFor(() => {
        expect(screen.getByTestId('user-create-success')).toHaveTextContent(
          'User created: Grace Hopper'
        );
      });
      expect(onUserCreated).toHaveBeenCalledWith(newUser);
    });

    it('handles API error on creation failure', async () => {
      vi.spyOn(userApi, 'createUser').mockRejectedValueOnce({
        error: { code: 'VALIDATION_ERROR', message: 'Name already exists' },
      });

      render(<UserCreateForm />);

      fireEvent.change(screen.getByTestId('user-display-name-input'), {
        target: { value: 'Duplicate' },
      });
      fireEvent.click(screen.getByTestId('user-create-submit'));

      await waitFor(() => {
        expect(screen.getByTestId('error-state')).toHaveTextContent(
          '[VALIDATION_ERROR] Name already exists'
        );
      });
    });
  });

  describe('WorkspaceList', () => {
    it('renders empty state when workspaces array is empty', () => {
      render(<WorkspaceList workspaces={[]} loading={false} error={null} />);
      expect(screen.getByTestId('empty-state')).toHaveTextContent('No workspaces created yet.');
    });

    it('renders loading state when loading is true', () => {
      render(<WorkspaceList workspaces={[]} loading={true} error={null} />);
      expect(screen.getByTestId('loading-state')).toBeInTheDocument();
    });

    it('renders workspace items when workspaces are provided', () => {
      render(
        <WorkspaceList
          workspaces={mockWorkspaces}
          loading={false}
          error={null}
        />
      );
      const items = screen.getAllByTestId('workspace-item');
      expect(items).toHaveLength(1);
      expect(screen.getByText('Algorithm Research')).toBeInTheDocument();
      expect(screen.getByText('Foundational research notes')).toBeInTheDocument();
    });

    it('calls onDeleteWorkspace when delete button is clicked', () => {
      const onDeleteWorkspace = vi.fn();
      render(
        <WorkspaceList
          workspaces={mockWorkspaces}
          loading={false}
          error={null}
          onDeleteWorkspace={onDeleteWorkspace}
        />
      );
      const deleteBtn = screen.getByTestId(`delete-workspace-${mockWorkspaces[0].id}`);
      fireEvent.click(deleteBtn);
      expect(onDeleteWorkspace).toHaveBeenCalledWith(mockWorkspaces[0]);
    });
  });

  describe('WorkspaceCreateForm', () => {
    it('renders inputs and owner selection', () => {
      render(<WorkspaceCreateForm users={mockUsers} />);
      expect(screen.getByLabelText(/Workspace Name/i)).toBeInTheDocument();
      expect(screen.getByTestId('workspace-owner-select')).toBeInTheDocument();
      expect(screen.getByTestId('workspace-create-submit')).toBeInTheDocument();
    });

    it('validates empty workspace name', async () => {
      render(<WorkspaceCreateForm users={mockUsers} />);
      fireEvent.click(screen.getByTestId('workspace-create-submit'));
      expect(screen.getByTestId('error-state')).toHaveTextContent(
        'Workspace name cannot be empty.'
      );
    });

    it('handles successful workspace creation', async () => {
      const onWorkspaceCreated = vi.fn();
      const newWorkspace: Workspace = {
        id: '55555555-5555-5555-5555-555555555555',
        name: 'Quantum Lab',
        description: 'Quantum information project',
        owner_id: '11111111-1111-1111-1111-111111111111',
        created_at: '2026-09-17T12:30:00Z',
        updated_at: '2026-09-17T12:30:00Z',
      };
      vi.spyOn(workspaceApi, 'createWorkspace').mockResolvedValueOnce(newWorkspace);

      render(
        <WorkspaceCreateForm
          users={mockUsers}
          onWorkspaceCreated={onWorkspaceCreated}
        />
      );

      fireEvent.change(screen.getByTestId('workspace-name-input'), {
        target: { value: 'Quantum Lab' },
      });
      fireEvent.change(screen.getByTestId('workspace-description-input'), {
        target: { value: 'Quantum information project' },
      });
      fireEvent.click(screen.getByTestId('workspace-create-submit'));

      await waitFor(() => {
        expect(screen.getByTestId('workspace-create-success')).toHaveTextContent(
          'Workspace created: Quantum Lab'
        );
      });
      expect(onWorkspaceCreated).toHaveBeenCalledWith(newWorkspace);
    });

    it('handles USER_NOT_FOUND error from backend', async () => {
      vi.spyOn(workspaceApi, 'createWorkspace').mockRejectedValueOnce({
        error: { code: 'USER_NOT_FOUND', message: 'Owner user not found' },
      });

      render(<WorkspaceCreateForm users={mockUsers} />);

      fireEvent.change(screen.getByTestId('workspace-name-input'), {
        target: { value: 'Orphaned Workspace' },
      });
      fireEvent.click(screen.getByTestId('workspace-create-submit'));

      await waitFor(() => {
        expect(screen.getByTestId('error-state')).toHaveTextContent(
          '[USER_NOT_FOUND] Owner user not found'
        );
      });
    });
  });
});
