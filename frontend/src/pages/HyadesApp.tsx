import React, { useState, useEffect, useCallback } from 'react';
import { Workspace } from '@/types/workspaces';
import { User } from '@/types/users';
import { getWorkspaces } from '@/api/workspaces';
import { getUsers } from '@/api/users';
import { useHealth, HealthStatus } from '@/hooks/useHealth';

import { HyadesHeader, HyadesDestination } from '@/components/navigation/HyadesHeader';
import { HyadesOverview } from './HyadesOverview';
import { HyadesLibrary } from './HyadesLibrary';
import { HyadesObservatory } from './HyadesObservatory';
import { HyadesStella } from './HyadesStella';
import { HyadesGlobalSearchModal } from '@/components/search/HyadesGlobalSearchModal';
import { HyadesAccountModal } from '@/components/navigation/HyadesAccountModal';
import { ObservatoryTarget, StellaContext } from '@/types/navigation';
import { StellaSessionProvider } from '@/context/StellaSessionContext';

export interface HyadesAppProps {
  workspaceId?: string;
  workspaceName?: string;
  userId?: string;
  onBack?: () => void;
  healthStatus?: HealthStatus;
  onRefreshHealth?: () => void;
}

export type TabType = 'overview' | 'library' | 'observatory' | 'stella';

export const HyadesApp: React.FC<HyadesAppProps> = ({
  workspaceId: initialWorkspaceId,
  workspaceName: initialWorkspaceName,
  userId: initialUserId,
  onBack,
  healthStatus: propHealthStatus,
  onRefreshHealth: propRefreshHealth,
}) => {
  const [currentDestination, setCurrentDestination] = useState<HyadesDestination>('overview');
  const [observatoryTarget, setObservatoryTarget] = useState<ObservatoryTarget | null>(null);
  const [stellaContext, setStellaContext] = useState<StellaContext | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isFullscreenObservatory, setIsFullscreenObservatory] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | undefined>(undefined);
  const [environmentIndex, setEnvironmentIndex] = useState(0);

  const handleNavigateToObservatory = (target?: ObservatoryTarget) => {
    setObservatoryTarget(target || null);
    setCurrentDestination('observatory');
  };

  const handleNavigateToStella = (context?: StellaContext) => {
    setStellaContext(context || null);
    setCurrentDestination('stella');
  };

  // Health telemetry hook
  const internalHealth = useHealth(15000);
  const healthStatus = propHealthStatus ?? internalHealth.status;
  const checkHealth = propRefreshHealth ?? internalHealth.checkHealth;

  // Workspaces and Users State
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(() => {
    if (initialWorkspaceId) {
      return {
        id: initialWorkspaceId,
        name: initialWorkspaceName || 'Knowledge Workspace',
        description: null,
        owner_id: initialUserId || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
    return null;
  });
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Active workspace ID
  const effectiveWorkspaceId = selectedWorkspace?.id || initialWorkspaceId || (workspaces[0]?.id) || '';

  // Fetch workspaces & users on mount
  const refreshWorkspaces = useCallback(async () => {
    try {
      const res = await getWorkspaces();
      const items = res.items || [];
      setWorkspaces(items);

      if (items.length > 0) {
        if (initialWorkspaceId) {
          const match = items.find((w) => w.id === initialWorkspaceId);
          setSelectedWorkspace(match || items[0]);
        } else if (!selectedWorkspace) {
          const savedId = localStorage.getItem('hyades_active_workspace_id');
          const savedMatch = items.find((w) => w.id === savedId);
          setSelectedWorkspace(savedMatch || items[0]);
        }
      }
    } catch {
      // Gracefully maintain existing selection
    }
  }, [initialWorkspaceId, selectedWorkspace]);

  const refreshUsers = useCallback(async () => {
    try {
      const res = await getUsers();
      const items = res.items || [];
      setUsers(items);
      if (items.length > 0 && !selectedUser) {
        setSelectedUser(items[0]);
      }
    } catch {
      // Gracefully handle
    }
  }, [selectedUser]);

  useEffect(() => {
    refreshWorkspaces();
    refreshUsers();
  }, [refreshWorkspaces, refreshUsers]);


  // Handle workspace switch
  const handleSelectWorkspace = (ws: Workspace) => {
    setSelectedWorkspace(ws);
    try {
      localStorage.setItem('hyades_active_workspace_id', ws.id);
    } catch {
      // Ignore localStorage errors
    }
  };

  // Keyboard shortcut for Cmd+K search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNavigateToNote = (noteId: string) => {
    setActiveNoteId(noteId);
    setCurrentDestination('library');
  };


  const [libraryInitialAction, setLibraryInitialAction] = useState<'create-note' | null>(null);

  const handleCycleEnvironment = () => {
    setEnvironmentIndex((prev) => prev + 1);
  };

  const handleNewNote = () => {
    setLibraryInitialAction('create-note');
    setCurrentDestination('library');
  };

  return (
    <StellaSessionProvider>
      <div className="flex flex-col h-screen w-full overflow-hidden bg-[var(--bg-base)] text-[var(--ink-primary)] select-none">
      {/* Subtle paper grain texture */}
      <div className="paper-grain" />

      {/* Accessible landmark support */}
      {onBack && (
        <div className="sr-only">
          <button
            type="button"
            data-testid="back-to-workspaces"
            onClick={onBack}
            aria-label="Back to Workspaces"
          >
            Back
          </button>
        </div>
      )}

      {/* Top Application Shell Header (Hidden during Observatory or focused fullscreen graph mode) */}
      {!isFullscreenObservatory && currentDestination !== 'observatory' && (
        <HyadesHeader
          currentDestination={currentDestination}
          onNavigate={(dest) => setCurrentDestination(dest)}
          workspaces={workspaces}
          selectedWorkspace={selectedWorkspace}
          onSelectWorkspace={handleSelectWorkspace}
          onOpenAccountModal={() => setIsAccountModalOpen(true)}
          onOpenSearch={() => setIsSearchOpen(true)}
          onNewNote={handleNewNote}
          onCycleEnvironment={handleCycleEnvironment}
          healthStatus={healthStatus}
          onRefreshHealth={checkHealth}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-0 relative overflow-hidden" role="main">
        {currentDestination === 'overview' && (
          <HyadesOverview
            workspaceId={effectiveWorkspaceId}
            onNavigateToDestination={(dest) => setCurrentDestination(dest)}
            onNavigateToObservatory={handleNavigateToObservatory}
            onNavigateToStella={handleNavigateToStella}
            onNavigateToNote={handleNavigateToNote}
            onNewNote={handleNewNote}
            environmentIndex={environmentIndex}
          />
        )}

        {currentDestination === 'library' && (
          <HyadesLibrary
            workspaceId={effectiveWorkspaceId}
            userId={selectedUser?.id || initialUserId || selectedWorkspace?.owner_id || users[0]?.id}
            initialNoteId={activeNoteId}
            initialAction={libraryInitialAction}
            onClearInitialAction={() => setLibraryInitialAction(null)}
            onNavigateToObservatory={handleNavigateToObservatory}
            onNavigateToStella={handleNavigateToStella}
            environmentIndex={environmentIndex}
          />
        )}

        {currentDestination === 'observatory' && (
          <HyadesObservatory
            workspaceId={effectiveWorkspaceId}
            initialTarget={observatoryTarget}
            onNavigateToDestination={(dest) => setCurrentDestination(dest)}
            onNavigateToStella={handleNavigateToStella}
            onNavigateToNote={handleNavigateToNote}
            isFullscreen={isFullscreenObservatory}
            onToggleFullscreen={() => setIsFullscreenObservatory((prev) => !prev)}
            onOpenSearch={() => setIsSearchOpen(true)}
          />
        )}

        {currentDestination === 'stella' && (
          <HyadesStella
            workspaceId={effectiveWorkspaceId}
            initialContext={stellaContext}
            onNavigateToObservatory={handleNavigateToObservatory}
            onNavigateToLibrary={() => setCurrentDestination('library')}
            environmentIndex={environmentIndex}
          />
        )}
      </main>

      {/* Bottom-Left Profile & Account Trigger */}
      {!isFullscreenObservatory && (
        <div className="fixed bottom-4 left-4 z-40">
          <button
            type="button"
            onClick={() => setIsAccountModalOpen(true)}
            data-testid="profile-bottom-left-btn"
            title="Account & Setup"
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-[var(--bg-panel)]/95 hover:bg-white text-[var(--ink-primary)] border border-[var(--border-strong)] shadow-md transition-all active:scale-95 group backdrop-blur-md cursor-pointer"
          >
            <div className="w-6 h-6 rounded-full bg-[var(--accent-midnight)] text-[#FAF8F2] flex items-center justify-center font-serif text-[11px] font-semibold shadow-2xs">
              RS
            </div>
            <span className="serif text-xs font-semibold text-[var(--ink-primary)] max-w-[120px] truncate">
              {selectedWorkspace?.name ?? 'Hyades Workspace'}
            </span>
            <i className="ph ph-gear text-xs text-[var(--ink-tertiary)] group-hover:text-[var(--accent-midnight)] transition-colors" />
          </button>
        </div>
      )}

      {/* Global Search Palette Modal (Cmd+K) */}
      <HyadesGlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        workspaceId={effectiveWorkspaceId}
        onSelectNote={handleNavigateToNote}
        onNavigateToObservatory={handleNavigateToObservatory}
        onNavigateToStella={handleNavigateToStella}
      />

      {/* Account & Workspace Administration Modal */}
      <HyadesAccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        users={users}
        workspaces={workspaces}
        selectedUser={selectedUser}
        selectedWorkspace={selectedWorkspace}
        loadingUsers={false}
        loadingWorkspaces={false}
        userError={null}
        workspaceError={null}
        onUserCreated={(u) => {
          setUsers((prev) => [...prev, u]);
          setSelectedUser(u);
        }}
        onWorkspaceCreated={(w) => {
          setWorkspaces((prev) => [...prev, w]);
          setSelectedWorkspace(w);
        }}
        onSelectUser={setSelectedUser}
        onSelectWorkspace={handleSelectWorkspace}
        onRefreshUsers={refreshUsers}
        onRefreshWorkspaces={refreshWorkspaces}
      />
    </div>
    </StellaSessionProvider>
  );
};

export default HyadesApp;
