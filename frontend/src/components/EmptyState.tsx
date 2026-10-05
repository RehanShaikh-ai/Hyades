import React from 'react';
import { Ghost } from 'lucide-react';

interface EmptyStateProps {
  message?: string;
  subMessage?: string;
  icon?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  message = 'No records found.',
  subMessage,
  icon,
  className = ''
}) => {
  return (
    <div data-testid="empty-state" className={`flex flex-col items-center justify-center p-8 text-center bg-[#FAF8F2] border border-[#DCD6C8] rounded-xl text-[#575249] ${className}`}>
      {icon ? (
        <div className="mb-3 text-[#878074]">{icon}</div>
      ) : (
        <Ghost size={28} className="mb-3 text-[#A8A29E]" />
      )}
      <p className="text-xs font-semibold text-[#1C1917]">{message}</p>
      {subMessage && (
        <p className="text-[11px] mt-1 text-[#878074] max-w-sm mx-auto">{subMessage}</p>
      )}
    </div>
  );
};
