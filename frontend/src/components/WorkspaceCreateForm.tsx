import React, { useState } from 'react';
import { createWorkspace } from '@/api/workspaces';
import { Workspace } from '@/types/workspaces';
import { User } from '@/types/users';
import { ApiError } from '@/types/api';
import { ErrorState } from './ErrorState';

interface WorkspaceCreateFormProps {
  users: User[];
  selectedUser?: User;
  onWorkspaceCreated?: (workspace: Workspace) => void;
}

export const WorkspaceCreateForm: React.FC<WorkspaceCreateFormProps> = ({
  users,
  selectedUser,
  onWorkspaceCreated,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [customOwnerId, setCustomOwnerId] = useState('');
  const [isManualOwner, setIsManualOwner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | string | null>(null);
  const [successWorkspace, setSuccessWorkspace] = useState<Workspace | null>(null);

  const selectedOwnerId = selectedUser?.id ?? (isManualOwner ? customOwnerId.trim() : (ownerId || (users[0]?.id ?? '')));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Workspace name cannot be empty.');
      return;
    }

    if (!selectedOwnerId) {
      setError('A valid workspace owner is required.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessWorkspace(null);

    try {
      const created = await createWorkspace({
        name: trimmedName,
        description: description.trim() || null,
        owner_id: selectedOwnerId,
      });
      setSuccessWorkspace(created);
      setName('');
      setDescription('');
      if (onWorkspaceCreated) {
        onWorkspaceCreated(created);
      }
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold text-[#878074] uppercase tracking-wider font-mono mb-4">
        Create Knowledge Workspace
      </h3>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="workspace-name" className="text-xs font-medium text-[#1C1917]">
            Workspace Name
          </label>
          <input
            id="workspace-name"
            data-testid="workspace-name-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Quantum Research Notes"
            disabled={loading}
            className="w-full px-3 py-2 bg-[#FAF8F2] border border-[#DCD6C8] rounded-lg text-xs text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:border-[#162135] focus:ring-1 focus:ring-[#162135] transition-colors"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="workspace-description" className="text-xs font-medium text-[#1C1917]">
            Description (optional)
          </label>
          <input
            id="workspace-description"
            data-testid="workspace-description-input"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Distributed team notes and references"
            disabled={loading}
            className="w-full px-3 py-2 bg-[#FAF8F2] border border-[#DCD6C8] rounded-lg text-xs text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:border-[#162135] focus:ring-1 focus:ring-[#162135] transition-colors"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="workspace-owner-select" className="text-xs font-medium text-[#1C1917]">
            Owner
          </label>
          {selectedUser ? (
            <div data-testid="selected-workspace-owner" className="px-3 py-2 bg-[#EFECE4] border border-[#DCD6C8] rounded-lg text-xs font-mono flex items-center justify-between gap-3">
              <span className="font-semibold text-[#1C1917]">{selectedUser.display_name}</span>
              <span className="text-[#878074] text-[11px] truncate max-w-[220px]">{selectedUser.id}</span>
            </div>
          ) : !isManualOwner && users.length > 0 ? (
            <div className="flex gap-2 items-center">
              <select
                id="workspace-owner-select"
                data-testid="workspace-owner-select"
                value={ownerId || users[0]?.id || ''}
                onChange={(e) => setOwnerId(e.target.value)}
                disabled={loading}
                className="flex-1 bg-[#FAF8F2] border border-[#DCD6C8] text-[#1C1917] px-3 py-2 rounded-lg outline-none font-mono text-xs focus:border-[#162135]"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id} className="bg-[#FAF8F2] text-[#1C1917]">
                    {u.display_name} ({u.id})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setIsManualOwner(true)}
                className="px-3 py-2 bg-[#EFECE4] hover:bg-[#E5E0D4] text-[#575249] border border-[#DCD6C8] rounded-lg text-xs font-mono whitespace-nowrap transition-colors cursor-pointer"
              >
                Manual UUID
              </button>
            </div>
          ) : (
            <div className="flex gap-2 items-center">
              <input
                id="workspace-owner-input"
                data-testid="workspace-owner-input"
                type="text"
                value={customOwnerId}
                onChange={(e) => setCustomOwnerId(e.target.value)}
                placeholder="Enter owner UUID (e.g. 123e4567-e89b...)"
                disabled={loading}
                className="flex-1 bg-[#FAF8F2] border border-[#DCD6C8] text-[#1C1917] px-3 py-2 rounded-lg font-mono text-xs outline-none focus:border-[#162135]"
              />
              {users.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsManualOwner(false)}
                  className="px-3 py-2 bg-[#EFECE4] hover:bg-[#E5E0D4] text-[#575249] border border-[#DCD6C8] rounded-lg text-xs font-mono whitespace-nowrap transition-colors cursor-pointer"
                >
                  Select User
                </button>
              )}
            </div>
          )}
        </div>

        {error && <ErrorState error={error} />}

        {successWorkspace && (
          <div 
            data-testid="workspace-create-success" 
            className="p-3 bg-[#EBF2EB] border border-[#A7CCA8] rounded-lg text-xs font-mono text-[#2D5A27]"
          >
            Workspace created: <strong className="text-[#1B3E16]">{successWorkspace.name}</strong> (ID: {successWorkspace.id})
          </div>
        )}

        <div className="mt-3">
          <button
            type="submit"
            data-testid="workspace-create-submit"
            disabled={loading}
            className="w-full py-2 px-4 rounded-lg bg-[#162135] text-[#FAF8F2] hover:bg-[#233350] transition-colors text-xs font-medium disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Creating...' : 'Create Workspace'}
          </button>
        </div>
      </form>
    </div>
  );
};
