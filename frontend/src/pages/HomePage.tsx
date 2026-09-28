import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HealthStatus, HEALTH_DISPLAY_TEXT } from '@/hooks/useHealth';
import { getUsers } from '@/api/users';
import { getWorkspaces } from '@/api/workspaces';
import { User } from '@/types/users';
import { Workspace } from '@/types/workspaces';
import { ApiError } from '@/types/api';
import { UserCreateForm } from '@/components/UserCreateForm';
import { UserList } from '@/components/UserList';
import { WorkspaceCreateForm } from '@/components/WorkspaceCreateForm';
import { WorkspaceList } from '@/components/WorkspaceList';
import { NotesDashboard } from '@/pages/NotesDashboard';
import {
  Search,
  Home,
  Inbox,
  BarChart2,
  Users,
  Calendar,
  Settings,
  LogOut,
  Database,
  ChevronDown,
} from 'lucide-react';
import { StarField } from '@/components/StarField';
import { FlowHoverButton } from '@/components/ui/flow-hover-button';

type WorkflowPhase = 'users' | 'workspaces' | 'notes';

interface HomePageProps {
  healthStatus: HealthStatus;
  onRefreshHealth: () => void;
}

// Sidebar Navigation Item
interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  badge?: number;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}
const NavItem: React.FC<NavItemProps> = ({ icon, label, badge, active, disabled, onClick }) => (
  <button
    type="button"
    onClick={disabled ? undefined : onClick}
    className={[
      'sidebar-nav-item',
      active ? 'active' : '',
      disabled ? 'disabled' : '',
    ].join(' ')}
    title={disabled ? `${label} (coming soon)` : undefined}
    aria-current={active ? 'page' : undefined}
    aria-disabled={disabled}
  >
    {icon}
    <span style={{ flex: 1 }}>{label}</span>
    {badge !== undefined && <span className="sidebar-badge">{badge}</span>}
  </button>
);

// Sidebar Component
interface SidebarProps {
  phase: WorkflowPhase;
  selectedWorkspace: Workspace | null;
  selectedUser: User | null;
  healthStatus: HealthStatus;
  onRefreshHealth: () => void;
  onNavigate: (phase: WorkflowPhase) => void;
}

const AppSidebar: React.FC<SidebarProps> = ({
  phase,
  selectedWorkspace,
  healthStatus,
  onRefreshHealth,
  onNavigate,
}) => {
  const displayText = HEALTH_DISPLAY_TEXT[healthStatus];
  const wsInitial = selectedWorkspace?.name?.charAt(0).toUpperCase() ?? 'K';
  const wsName = selectedWorkspace?.name ?? 'Knowledge Atlas';

  return (
    <nav className="app-sidebar" aria-label="Main navigation">
      {/* Workspace Switcher */}
      <div
        className="sidebar-workspace-switcher"
        role="button"
        tabIndex={0}
        aria-label={`Current workspace: ${wsName}`}
        onClick={() => onNavigate('workspaces')}
        onKeyDown={(e) => e.key === 'Enter' && onNavigate('workspaces')}
      >
        <div className="sidebar-ws-avatar" aria-hidden="true">{wsInitial}</div>
        <div className="sidebar-ws-info">
          <div className="sidebar-ws-name">{wsName}</div>
          <div className="sidebar-ws-plan">Knowledge Atlas v0.4.1</div>
        </div>
        <ChevronDown size={14} className="sidebar-ws-chevron" aria-hidden="true" />
      </div>

      {/* Search */}
      <button type="button" className="sidebar-search-btn" aria-label="Search" onClick={() => {}}>
        <Search size={14} aria-hidden="true" />
        <span>Search</span>
      </button>

      {/* Primary Nav */}
      <div className="sidebar-nav">
        <NavItem
          icon={<Home size={15} aria-hidden="true" />}
          label="Home"
          active={phase === 'users'}
          onClick={() => onNavigate('users')}
        />
        <NavItem
          icon={<Inbox size={15} aria-hidden="true" />}
          label="Inbox"
          badge={12}
          disabled
        />
        <NavItem
          icon={<BarChart2 size={15} aria-hidden="true" />}
          label="Analytics"
          disabled
        />

        <div className="sidebar-section-label">Workspace</div>

        <NavItem
          icon={<Database size={15} aria-hidden="true" />}
          label="Knowledge Base"
          active={phase === 'notes'}
          onClick={() => selectedWorkspace && onNavigate('notes')}
          disabled={!selectedWorkspace}
        />
        <NavItem
          icon={<Users size={15} aria-hidden="true" />}
          label="Team"
          active={phase === 'users'}
          onClick={() => onNavigate('users')}
        />
        <NavItem
          icon={<Calendar size={15} aria-hidden="true" />}
          label="Workspaces"
          active={phase === 'workspaces'}
          onClick={() => onNavigate('workspaces')}
        />
      </div>

      {/* Footer: health + settings */}
      <div className="sidebar-footer">
        {/* Health status indicator */}
        <div className="health-status" aria-live="polite">
          <span
            className="health-indicator"
            style={{
              backgroundColor:
                healthStatus === 'connected'
                  ? 'var(--green)'
                  : healthStatus === 'loading'
                  ? 'var(--yellow)'
                  : 'var(--red)',
            }}
            aria-hidden="true"
          />
          <span data-testid="health-status" style={{ flex: 1, fontSize: '11px' }}>
            {displayText}
          </span>
          <button
            type="button"
            onClick={onRefreshHealth}
            className="secondary-button"
            style={{ padding: '3px 8px', fontSize: '10px', borderRadius: '4px' }}
          >
            ↻
          </button>
        </div>

        <NavItem icon={<Settings size={14} aria-hidden="true" />} label="Settings" disabled />
        <NavItem icon={<LogOut size={14} aria-hidden="true" />} label="Log out" disabled />
      </div>
    </nav>
  );
};

// Setup Screen (Phase 01 & 02)
interface SetupScreenProps {
  phase: 'users' | 'workspaces';
  selectedUser: User | null;
  selectedWorkspace: Workspace | null;
  users: User[];
  workspaces: Workspace[];
  loadingUsers: boolean;
  loadingWorkspaces: boolean;
  userError: ApiError | null;
  workspaceError: ApiError | null;
  onUserCreated: (user: User) => void;
  onWorkspaceCreated: (workspace: Workspace) => void;
  onUserSelect: (user: User) => void;
  onWorkspaceSelect: (workspace: Workspace) => void;
  onWorkspaceSelectAndOpen: (workspace: Workspace) => void;
  onRefreshUsers: () => void;
  onRefreshWorkspaces: () => void;
  onProceed: () => void;
  onBack: () => void;
}

const SetupScreen: React.FC<SetupScreenProps> = ({
  phase,
  selectedUser,
  selectedWorkspace,
  users,
  workspaces,
  loadingUsers,
  loadingWorkspaces,
  userError,
  workspaceError,
  onUserCreated,
  onWorkspaceCreated,
  onUserSelect,
  onWorkspaceSelectAndOpen,
  onRefreshUsers,
  onRefreshWorkspaces,
  onProceed,
  onBack,
}) => {
  const isUsersPhase = phase === 'users';

  return (
    <div className="setup-container animate-fade-in">
      {/* Breadcrumb */}
      <div className="setup-breadcrumb">
        <span>Knowledge Atlas</span>
        <span className="setup-breadcrumb-sep">/</span>
        <span className="setup-breadcrumb-current">
          {isUsersPhase ? 'User Management' : 'Workspace Management'}
        </span>
      </div>

      {/* Heading area */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '24px' }}>
        <div>
          <span className="panel-kicker">Phase 0{isUsersPhase ? '1' : '2'}</span>
          <h2 className="setup-heading" id={isUsersPhase ? 'user-management-title' : 'workspace-management-title'}>
            {isUsersPhase ? 'User Management' : 'Workspace Management'}
          </h2>
          <p className="setup-sub">
            {isUsersPhase
              ? 'Create a user or select an existing identity to own the workspace.'
              : selectedUser
              ? `Creating a workspace for ${selectedUser.display_name}.`
              : 'Select a workspace to open the knowledge base.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, paddingTop: '8px' }}>
          {!isUsersPhase && (
            <button type="button" className="btn-ghost-dark" onClick={onBack}>
              ← Users
            </button>
          )}
          {isUsersPhase && selectedUser && (
            <FlowHoverButton
              type="button"
              className="px-3.5 py-1.5 text-xs font-semibold"
              data-testid="continue-to-workspaces"
              onClick={onProceed}
            >
              Continue →
            </FlowHoverButton>
          )}
          {!isUsersPhase && selectedWorkspace && (
            <FlowHoverButton
              type="button"
              className="px-3.5 py-1.5 text-xs font-semibold"
              data-testid="continue-to-notes"
              onClick={onProceed}
            >
              Open Knowledge Base →
            </FlowHoverButton>
          )}
        </div>
      </div>

      {/* Selection notice */}
      {isUsersPhase && selectedUser && (
        <p className="selection-notice" role="status">
          Selected owner: <strong>{selectedUser.display_name}</strong>
        </p>
      )}
      {!isUsersPhase && selectedWorkspace && (
        <p className="selection-notice" role="status">
          Selected workspace: <strong>{selectedWorkspace.name}</strong>
        </p>
      )}

      {/* Panel content */}
      <div className="workflow-panel">
        {isUsersPhase ? (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 xl:gap-10">
            <div className="xl:col-span-5 xl:border-r xl:border-white/[0.08] xl:pr-8">
              <UserCreateForm onUserCreated={onUserCreated} />
            </div>
            <div className="xl:col-span-7 xl:pl-2">
              <UserList
                users={users}
                loading={loadingUsers}
                error={userError}
                onRefresh={onRefreshUsers}
                selectedUserId={selectedUser?.id}
                onUserSelect={onUserSelect}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 xl:gap-10">
            <div className="xl:col-span-5 xl:border-r xl:border-white/[0.08] xl:pr-8">
              {selectedUser && (
                <WorkspaceCreateForm
                  users={users}
                  selectedUser={selectedUser}
                  onWorkspaceCreated={onWorkspaceCreated}
                />
              )}
            </div>
            <div className="xl:col-span-7 xl:pl-2">
              <WorkspaceList
                workspaces={workspaces}
                loading={loadingWorkspaces}
                error={workspaceError}
                onRefresh={onRefreshWorkspaces}
                selectedWorkspaceId={selectedWorkspace?.id}
                onSelectWorkspace={(workspace) => {
                  onWorkspaceSelectAndOpen(workspace);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Root Component
export const HomePage: React.FC<HomePageProps> = ({
  healthStatus,
  onRefreshHealth,
}) => {
  const [phase, setPhase] = useState<WorkflowPhase>('users');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userError, setUserError] = useState<ApiError | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<ApiError | null>(null);
  const hasRequestedWorkspaces = useRef(false);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    setUserError(null);
    try {
      const response = await getUsers();
      setUsers(response.items);
    } catch (error) {
      setUserError(error as ApiError);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const fetchWorkspaces = useCallback(async () => {
    setLoadingWorkspaces(true);
    setWorkspaceError(null);
    try {
      const response = await getWorkspaces();
      setWorkspaces(response.items);
    } catch (error) {
      setWorkspaceError(error as ApiError);
    } finally {
      setLoadingWorkspaces(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    if (phase === 'workspaces' && !hasRequestedWorkspaces.current) {
      hasRequestedWorkspaces.current = true;
      fetchWorkspaces();
    }
  }, [fetchWorkspaces, phase]);

  const handleUserCreated = (user: User) => {
    setUsers((cur) => [...cur, user]);
    setSelectedUser(user);
  };

  const handleWorkspaceCreated = (workspace: Workspace) => {
    setWorkspaces((cur) => [...cur, workspace]);
    setSelectedWorkspace(workspace);
  };

  const handleNavigate = (target: WorkflowPhase) => {
    if (target === 'workspaces' && !hasRequestedWorkspaces.current) {
      hasRequestedWorkspaces.current = true;
      fetchWorkspaces();
    }
    setPhase(target);
  };

  // Select workspace and navigate to notes phase
  const handleSelectWorkspaceAndOpenNotes = (workspace: Workspace) => {
    setSelectedWorkspace(workspace);
    setPhase('notes');
  };

  // Render
  return (
    <div className="app-shell">
      <StarField />
      <AppSidebar
        phase={phase}
        selectedWorkspace={selectedWorkspace}
        selectedUser={selectedUser}
        healthStatus={healthStatus}
        onRefreshHealth={onRefreshHealth}
        onNavigate={handleNavigate}
      />

      <main className="app-main" aria-label="Main content">
        {phase === 'notes' && selectedWorkspace ? (
          <NotesDashboard
            workspaceId={selectedWorkspace.id}
            workspaceName={selectedWorkspace.name}
            userId={selectedUser?.id}
            onBack={() => setPhase('workspaces')}
          />
        ) : (
          <SetupScreen
            phase={phase === 'notes' ? 'workspaces' : phase}
            selectedUser={selectedUser}
            selectedWorkspace={selectedWorkspace}
            users={users}
            workspaces={workspaces}
            loadingUsers={loadingUsers}
            loadingWorkspaces={loadingWorkspaces}
            userError={userError}
            workspaceError={workspaceError}
            onUserCreated={handleUserCreated}
            onWorkspaceCreated={handleWorkspaceCreated}
            onUserSelect={setSelectedUser}
            onWorkspaceSelect={setSelectedWorkspace}
            onRefreshUsers={fetchUsers}
            onRefreshWorkspaces={fetchWorkspaces}
            onWorkspaceSelectAndOpen={handleSelectWorkspaceAndOpenNotes}
            onProceed={() => {
              if (phase === 'users') handleNavigate('workspaces');
              else if (selectedWorkspace) setPhase('notes');
            }}
            onBack={() => setPhase('users')}
          />
        )}
      </main>
    </div>
  );
};
