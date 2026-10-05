import React, { useState } from 'react';
import { X } from 'lucide-react';
import { User } from '@/types/users';
import { Workspace } from '@/types/workspaces';
import { ApiError } from '@/types/api';
import { UserCreateForm } from '@/components/UserCreateForm';
import { UserList } from '@/components/UserList';
import { WorkspaceCreateForm } from '@/components/WorkspaceCreateForm';
import { WorkspaceList } from '@/components/WorkspaceList';

interface HyadesAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  workspaces: Workspace[];
  selectedUser: User | null;
  selectedWorkspace: Workspace | null;
  loadingUsers: boolean;
  loadingWorkspaces: boolean;
  userError: ApiError | null;
  workspaceError: ApiError | null;
  onUserCreated: (user: User) => void;
  onWorkspaceCreated: (workspace: Workspace) => void;
  onSelectUser: (user: User) => void;
  onSelectWorkspace: (workspace: Workspace) => void;
  onRefreshUsers: () => void;
  onRefreshWorkspaces: () => void;
}

export const HyadesAccountModal: React.FC<HyadesAccountModalProps> = ({
  isOpen,
  onClose,
  users,
  workspaces,
  selectedUser,
  selectedWorkspace,
  loadingUsers,
  loadingWorkspaces,
  userError,
  workspaceError,
  onUserCreated,
  onWorkspaceCreated,
  onSelectUser,
  onSelectWorkspace,
  onRefreshUsers,
  onRefreshWorkspaces,
}) => {
  const [activeTab, setActiveTab] = useState<'workspaces' | 'users'>('workspaces');

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-modal-title"
    >
      <div className="dialog-content w-full max-w-4xl bg-[#FAF8F2] border border-[#C9C2B0] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#DCD6C8] flex items-center justify-between bg-[#F7F5EE]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#162135] text-[#FAF8F2] flex items-center justify-center font-semibold text-xs">
              RS
            </div>
            <div>
              <h2 id="account-modal-title" className="serif text-lg font-semibold text-[#1C1917] leading-tight">
                Account & Workspace Setup
              </h2>
              <p className="text-xs text-[#878074]">
                Manage researcher identities and knowledge archives
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-[#EFECE4] p-0.5 rounded-lg border border-[#DCD6C8]">
              <button
                type="button"
                onClick={() => setActiveTab('workspaces')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === 'workspaces'
                    ? 'bg-[#FAF8F2] text-[#1C1917] shadow-xs'
                    : 'text-[#878074] hover:text-[#1C1917]'
                }`}
              >
                Workspaces ({workspaces.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('users')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === 'users'
                    ? 'bg-[#FAF8F2] text-[#1C1917] shadow-xs'
                    : 'text-[#878074] hover:text-[#1C1917]'
                }`}
              >
                Identities ({users.length})
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[#878074] hover:text-[#1C1917] hover:bg-[#EFECE4] rounded-lg transition-colors ml-2 focus:outline-none"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto hyades-scroll p-6">
          {activeTab === 'workspaces' ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="serif text-base font-semibold text-[#1C1917]">
                    Knowledge Workspaces
                  </h3>
                  <p className="text-xs text-[#575249]">
                    Select an existing knowledge base to switch your active context, or create a new archive.
                  </p>
                </div>
                {selectedUser && (
                  <span className="text-xs mono text-[#575249] bg-[#EFECE4] px-2.5 py-1 rounded-md border border-[#DCD6C8]">
                    Owner: <strong data-testid="selected-workspace-owner">{selectedUser.display_name}</strong>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-5 bg-white p-4 rounded-xl border border-[#DCD6C8]">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#878074] mb-3">
                    Create New Workspace
                  </h4>
                  {selectedUser ? (
                    <WorkspaceCreateForm
                      users={users}
                      selectedUser={selectedUser}
                      onWorkspaceCreated={onWorkspaceCreated}
                    />
                  ) : (
                    <p className="text-xs text-[#878074] italic">
                      Please select an identity first in the Identities tab.
                    </p>
                  )}
                </div>

                <div className="md:col-span-7 bg-white p-4 rounded-xl border border-[#DCD6C8]">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#878074] mb-3">
                    Available Archives
                  </h4>
                  <WorkspaceList
                    workspaces={workspaces}
                    loading={loadingWorkspaces}
                    error={workspaceError}
                    onRefresh={onRefreshWorkspaces}
                    selectedWorkspaceId={selectedWorkspace?.id}
                    onSelectWorkspace={(ws) => {
                      onSelectWorkspace(ws);
                      onClose();
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="serif text-base font-semibold text-[#1C1917]">
                  User Identities
                </h3>
                <p className="text-xs text-[#575249]">
                  Each workspace is anchored to a researcher identity for attribution and provenance.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-5 bg-white p-4 rounded-xl border border-[#DCD6C8]">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#878074] mb-3">
                    Register Identity
                  </h4>
                  <UserCreateForm onUserCreated={onUserCreated} />
                </div>

                <div className="md:col-span-7 bg-white p-4 rounded-xl border border-[#DCD6C8]">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#878074] mb-3">
                    Identities Directory
                  </h4>
                  <UserList
                    users={users}
                    loading={loadingUsers}
                    error={userError}
                    onRefresh={onRefreshUsers}
                    selectedUserId={selectedUser?.id}
                    onUserSelect={(u) => {
                      onSelectUser(u);
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-[#DCD6C8] bg-[#F7F5EE] flex items-center justify-between text-xs text-[#878074]">
          <span className="mono">HYADES · v0.4.1</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#162135] text-[#FAF8F2] font-medium hover:bg-[#22324F] transition-colors focus:outline-none"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
