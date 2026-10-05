import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading...',
  className = ''
}) => {
  return (
    <div data-testid="loading-state" className={`flex flex-col items-center justify-center p-8 text-[#575249] ${className}`}>
      <Loader2 size={22} className="animate-spin text-[#162135] mb-2.5" />
      <span className="text-xs font-medium text-[#878074]">{message}</span>
    </div>
  );
};
