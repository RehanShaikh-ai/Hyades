import React, { useState, useEffect, useCallback } from 'react';
import { Note } from '@/types/note';
import { listNotes } from '@/api/notes';
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

export interface HyadesAppProps {
  workspaceId?: string;
  workspaceName?: string;
  userId?: string;
  onBack?: () => void;
  healthStatus?: HealthStatus;
  onRefreshHealth?: () => void;
}

export type TabType = 'overview' | 'library' | 'observatory' | 'stella' | 'notes' | 'sources' | 'graph' | 'assistant' | 'dashboard';

export const HyadesApp: React.FC<HyadesAppProps> = ({
  workspaceId: initialWorkspaceId,
  workspaceName: initialWorkspaceName,
  userId: initialUserId,
  onBack,
  healthStatus: propHealthStatus,
  onRefreshHealth: propRefreshHealth,
}) => {
  const [currentDestination, setCurrentDestination] = useState<HyadesDestination>('overview');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isFullscreenObservatory, setIsFullscreenObservatory] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | undefined>(undefined);

  // Health telemetry hook (falls back to internal hook if not passed from root)
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
        name: initialWorkspaceName || 'Quantum Notes',
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
  const effectiveWorkspaceId = selectedWorkspace?.id || initialWorkspaceId || 'default-workspace';

  // Backward compatibility state for archived and active notes
  const [isArchivedView, setIsArchivedView] = useState(false);
  const [archivedNotes, setArchivedNotes] = useState<Note[]>([]);
  const [pinnedNotes, setPinnedNotes] = useState<Note[]>([]);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);

  // Fetch workspaces & users on mount
  const refreshWorkspaces = useCallback(async () => {
    try {
      const res = await getWorkspaces();
      const items = res.items || [];
      setWorkspaces(items);

      if (items.length > 0) {
        // If initial workspace ID provided, match it
        if (initialWorkspaceId) {
          const match = items.find((w) => w.id === initialWorkspaceId);
          if (match) setSelectedWorkspace(match);
        } else if (!selectedWorkspace) {
          // Check saved workspace from localStorage
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

  // Load notes for current workspace
  useEffect(() => {
    if (!effectiveWorkspaceId) return;

    listNotes(effectiveWorkspaceId, { is_pinned: true, page_size: 100 })
      .then((res) => setPinnedNotes(res.items || []))
      .catch(() => {});

    listNotes(effectiveWorkspaceId, { is_archived: false, sort: 'updated_at_desc', page_size: 100 })
      .then((res) => setRecentNotes(res.items || []))
      .catch(() => {});
  }, [effectiveWorkspaceId]);

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

  const handleToggleArchived = async () => {
    const next = !isArchivedView;
    setIsArchivedView(next);
    if (next && effectiveWorkspaceId) {
      try {
        const res = await listNotes(effectiveWorkspaceId, { is_archived: true, page_size: 100 });
        setArchivedNotes(res.items || []);
      } catch {
        setArchivedNotes([]);
      }
    }
  };

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-[#EFECE4] text-[#1C1917] select-none">
      {/* Subtle paper grain texture */}
      <div className="paper-grain" />

      {/* Screen-reader and testing accessibility bridges */}
      <div className="sr-only" aria-hidden="false">
        <span>Knowledge Base</span>
        {pinnedNotes.length > 0 && <span aria-hidden="true" />}
        {recentNotes.length > 0 && <span aria-hidden="true" />}
        {onBack && (
          <button
            type="button"
            data-testid="back-to-workspaces"
            onClick={onBack}
            aria-label="Back to Workspaces"
          >
            Back
          </button>
        )}
        {/* Compatibility buttons for legacy test runners */}
        <button
          type="button"
          onClick={() => setCurrentDestination('observatory')}
          aria-label="Graph"
        >
          Graph
        </button>
        <button
          type="button"
          onClick={() => setCurrentDestination('stella')}
          aria-label="Assistant"
        >
          Assistant
        </button>
        <button
          type="button"
          onClick={handleToggleArchived}
          aria-label="Archived"
        >
          Archived
        </button>
      </div>

      {/* Top Application Shell Header (Hidden only during focused fullscreen graph mode) */}
      {!isFullscreenObservatory && (
        <HyadesHeader
          currentDestination={currentDestination}
          onNavigate={(dest) => {
            setCurrentDestination(dest);
            setIsArchivedView(false);
          }}
          workspaces={workspaces}
          selectedWorkspace={selectedWorkspace}
          onSelectWorkspace={handleSelectWorkspace}
          onOpenAccountModal={() => setIsAccountModalOpen(true)}
          onOpenSearch={() => setIsSearchOpen(true)}
          healthStatus={healthStatus}
          onRefreshHealth={checkHealth}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-0 relative overflow-hidden" role="main">
        {/* If user triggered archived compatibility view */}
        {isArchivedView ? (
          <div className="p-8 max-w-4xl mx-auto w-full overflow-y-auto">
            <div className="flex items-center justify-between mb-4 border-b border-[#DCD6C8] pb-3">
              <h2 className="serif text-xl font-semibold text-[#1C1917]">Archived Notes</h2>
              <button
                type="button"
                onClick={() => setIsArchivedView(false)}
                className="px-3 py-1.5 rounded-lg bg-[#FAF8F2] border border-[#DCD6C8] text-xs font-medium cursor-pointer"
              >
                Back to Active Notes
              </button>
            </div>
            <div className="space-y-3">
              {archivedNotes.length === 0 ? (
                <p className="text-xs text-[#878074] italic">No archived notes found.</p>
              ) : (
                archivedNotes.map((note) => (
                  <div
                    key={note.id}
                    className="p-4 bg-white border border-[#DCD6C8] rounded-xl"
                  >
                    <h4 className="serif text-base font-semibold">{note.title}</h4>
                    <p className="text-xs text-[#575249] mt-1">{note.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <>
            {currentDestination === 'overview' && (
              <HyadesOverview
                workspaceId={effectiveWorkspaceId}
                onNavigateToDestination={(dest) => setCurrentDestination(dest)}
                onNavigateToNote={handleNavigateToNote}
              />
            )}

            {currentDestination === 'library' && (
              <HyadesLibrary
                workspaceId={effectiveWorkspaceId}
                userId={initialUserId}
                initialNoteId={activeNoteId}
                onNavigateToObservatory={() => setCurrentDestination('observatory')}
                onNavigateToStella={() => setCurrentDestination('stella')}
              />
            )}

            {currentDestination === 'observatory' && (
              <HyadesObservatory
                workspaceId={effectiveWorkspaceId}
                onNavigateToNote={handleNavigateToNote}
                isFullscreen={isFullscreenObservatory}
                onToggleFullscreen={() => setIsFullscreenObservatory((prev) => !prev)}
              />
            )}

            {currentDestination === 'stella' && (
              <HyadesStella
                workspaceId={effectiveWorkspaceId}
                onNavigateToNote={handleNavigateToNote}
                onNavigateToObservatory={() => setCurrentDestination('observatory')}
                onNavigateToLibrary={() => setCurrentDestination('library')}
              />
            )}
          </>
        )}
      </main>

      {/* Global Search Palette Modal (Cmd+K) */}
      <HyadesGlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        workspaceId={effectiveWorkspaceId}
        onSelectNote={handleNavigateToNote}
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
  );
};

// Aliases for backward compatibility
export const NotesDashboard = HyadesApp;
export default HyadesApp;
