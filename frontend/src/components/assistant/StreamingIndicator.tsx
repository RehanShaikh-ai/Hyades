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
        'streaming-indicator flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-panel-subtle)] border border-[var(--border-strong)] text-[var(--ink-secondary)] text-xs font-medium w-fit',
        className
      )}
      role="status"
      aria-live="polite"
      data-testid="streaming-indicator"
    >
      <Sparkles size={13} className="text-[var(--accent-terracotta)] stella-twinkle" />
      <span className="stella-breathe">{label}</span>
      <span className="flex gap-1 ml-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-terracotta)] stella-breathe" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-terracotta)] stella-breathe" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-terracotta)] stella-breathe" style={{ animationDelay: '300ms' }} />
      </span>
    </div>
  );
};
