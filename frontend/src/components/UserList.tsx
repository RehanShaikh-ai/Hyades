import React from 'react';
import { User } from '@/types/users';
import { ApiError } from '@/types/api';
import { LoadingState } from './LoadingState';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { Check } from 'lucide-react';

interface UserListProps {
  users: User[];
  loading: boolean;
  error: ApiError | string | null;
  onRefresh?: () => void;
  selectedUserId?: string;
  onUserSelect?: (user: User) => void;
}

export const UserList: React.FC<UserListProps> = ({
  users,
  loading,
  error,
  onRefresh,
  selectedUserId,
  onUserSelect,
}) => {
  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-semibold text-[#878074] uppercase tracking-wider font-mono">
          Identities ({users.length})
        </h3>
        {onRefresh && (
          <button
            type="button"
            data-testid="refresh-users-button"
            onClick={onRefresh}
            className="px-2.5 py-1 text-xs font-mono text-[#575249] hover:text-[#1C1917] bg-[#EFECE4] hover:bg-[#E5E0D4] border border-[#DCD6C8] rounded-md transition-colors"
          >
            Refresh
          </button>
        )}
      </div>

      {loading && <LoadingState message="Loading users..." />}
      {error && <ErrorState error={error} />}

      {!loading && !error && users.length === 0 && (
        <EmptyState message="No users created yet." />
      )}

      {!loading && !error && users.length > 0 && (
        <ul data-testid="user-list" className="flex flex-col gap-2.5 list-none p-0 m-0">
          {users.map((user) => {
            const isSelected = selectedUserId === user.id;
            return (
              <li
                key={user.id}
                data-testid="user-item"
                className={`flex justify-between items-center p-3 rounded-xl border transition-all ${
                  isSelected 
                    ? 'bg-[#F2EFE7] border-[#162135] shadow-xs' 
                    : 'bg-[#FAF8F2] border-[#DCD6C8] hover:border-[#B5AFA4] hover:bg-white'
                }`}
              >
                <div className="flex flex-col gap-0.5 min-w-0 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="serif font-semibold text-[#1C1917] text-sm tracking-tight truncate">
                      {user.display_name}
                    </span>
                    {isSelected && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 bg-[#162135] text-[#FAF8F2] rounded-full">
                        <Check size={10} strokeWidth={2.5} /> Active
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-[#878074] font-mono truncate">{user.id}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] text-[#878074] font-mono hidden sm:inline">
                    {new Date(user.created_at).toLocaleDateString()}
                  </span>
                  {onUserSelect && (
                    <button
                      type="button"
                      onClick={() => onUserSelect(user)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border cursor-pointer ${
                        isSelected
                          ? 'bg-[#162135] text-[#FAF8F2] border-[#162135]'
                          : 'bg-[#EFECE4] hover:bg-[#E5E0D4] text-[#1C1917] border-[#DCD6C8]'
                      }`}
                      aria-pressed={isSelected}
                      data-testid={`select-user-${user.id}`}
                    >
                      {isSelected ? 'Selected' : 'Select'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
