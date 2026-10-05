import React from 'react';
import { ApiError } from '@/types/api';
import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
  error: ApiError | string;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ error, className = '' }) => {
  const message = typeof error === 'string' ? error : error.error.message;
  const code = typeof error === 'string' ? undefined : error.error.code;

  return (
    <div data-testid="error-state" className={`p-3.5 bg-[#FBF0ED] border border-[#E8BFB5] text-[#93371E] rounded-xl flex items-start gap-2.5 ${className}`}>
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[#BD532B]" />
      <div>
        <span className="block text-xs font-medium">
          {code && <span className="font-bold mr-1">[{code}] </span>}
          {message}
        </span>
      </div>
    </div>
  );
};
