import React from 'react';
import { SourceProcessingStatus, SourceProcessingStage } from '@/types/source';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertCircle, Loader2, Clock } from 'lucide-react';

export interface SourceStatusBadgeProps {
  status: SourceProcessingStatus | string;
  stage?: SourceProcessingStage | string | null;
  className?: string;
  showIcon?: boolean;
}

export const SourceStatusBadge: React.FC<SourceStatusBadgeProps> = ({
  status,
  stage,
  className,
  showIcon = true,
}) => {
  const normalizedStatus = (status || 'PENDING').toUpperCase() as SourceProcessingStatus;

  const getStatusConfig = () => {
    switch (normalizedStatus) {
      case 'READY':
        return {
          label: 'Ready',
          icon: CheckCircle2,
          bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
          dot: 'bg-emerald-400',
        };
      case 'PROCESSING':
        return {
          label: stage ? `Processing (${stage})` : 'Processing',
          icon: Loader2,
          bg: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
          dot: 'bg-sky-400 animate-pulse',
          spin: true,
        };
      case 'FAILED':
        return {
          label: stage ? `Failed (${stage})` : 'Failed',
          icon: AlertCircle,
          bg: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
          dot: 'bg-rose-400',
        };
      case 'PENDING':
      default:
        return {
          label: 'Pending',
          icon: Clock,
          bg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
          dot: 'bg-amber-400',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border backdrop-blur-sm transition-colors',
        config.bg,
        className
      )}
      role="status"
      aria-label={`Source processing status: ${config.label}`}
      data-testid="source-status-badge"
      data-status={normalizedStatus}
    >
      {showIcon && (
        <Icon
          size={12}
          className={cn('flex-shrink-0', config.spin && 'animate-spin')}
          aria-hidden="true"
        />
      )}
      <span>{config.label}</span>
    </span>
  );
};
