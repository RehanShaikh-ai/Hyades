import React from 'react';
import { HyadesDestination } from './HyadesHeader';

interface WorkspaceShellProps {
  currentDestination: 'collections' | 'threads' | 'inbox';
  onNavigate: (dest: HyadesDestination) => void;
  workspaceName?: string;
  children: React.ReactNode;
}

export const WorkspaceShell: React.FC<WorkspaceShellProps> = ({
  children,
}) => {
  return (
    <div className="flex-1 flex min-h-0 w-full overflow-hidden bg-[var(--bg-base)]">
      {children}
    </div>
  );
};
