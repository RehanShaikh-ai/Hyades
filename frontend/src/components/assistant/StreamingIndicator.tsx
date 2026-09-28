import React from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StreamingIndicatorProps {
  label?: string;
  className?: string;
}

export const StreamingIndicator: React.FC<StreamingIndicatorProps> = ({
  label = 'Assistant is thinking...',
  className,
}) => {
  return (
    <div
      className={cn(
        'streaming-indicator flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/25 text-sky-300 text-xs font-medium w-fit animate-pulse',
        className
      )}
      role="status"
      aria-live="polite"
      data-testid="streaming-indicator"
    >
      <Sparkles size={13} className="text-sky-400 animate-spin" style={{ animationDuration: '3s' }} />
      <span>{label}</span>
      <span className="flex gap-1 ml-1">
        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '300ms' }} />
      </span>
    </div>
  );
};
