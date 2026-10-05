import React, { useState } from 'react';
import { createUser } from '@/api/users';
import { User } from '@/types/users';
import { ApiError } from '@/types/api';
import { ErrorState } from './ErrorState';

interface UserCreateFormProps {
  onUserCreated?: (user: User) => void;
}

export const UserCreateForm: React.FC<UserCreateFormProps> = ({ onUserCreated }) => {
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | string | null>(null);
  const [successUser, setSuccessUser] = useState<User | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) {
      setError('Display name cannot be empty.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessUser(null);

    try {
      const created = await createUser({ display_name: trimmed });
      setSuccessUser(created);
      setDisplayName('');
      if (onUserCreated) {
        onUserCreated(created);
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
        Create New Identity
      </h3>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="user-display-name" className="text-xs font-medium text-[#1C1917]">
            Display Name
          </label>
          <input
            id="user-display-name"
            data-testid="user-display-name-input"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Ada Lovelace"
            disabled={loading}
            className="w-full px-3 py-2 bg-[#FAF8F2] border border-[#DCD6C8] rounded-lg text-xs text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:border-[#162135] focus:ring-1 focus:ring-[#162135] transition-colors"
          />
        </div>

        {error && <ErrorState error={error} />}

        {successUser && (
          <div 
            data-testid="user-create-success" 
            className="p-3 bg-[#EBF2EB] border border-[#A7CCA8] rounded-lg text-xs font-mono text-[#2D5A27]"
          >
            User created: <strong className="text-[#1B3E16]">{successUser.display_name}</strong> (ID: {successUser.id})
          </div>
        )}

        <div className="mt-3">
          <button
            type="submit"
            data-testid="user-create-submit"
            disabled={loading}
            className="w-full py-2 px-4 rounded-lg bg-[#162135] text-[#FAF8F2] hover:bg-[#233350] transition-colors text-xs font-medium disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Creating...' : 'Create Identity'}
          </button>
        </div>
      </form>
    </div>
  );
};
