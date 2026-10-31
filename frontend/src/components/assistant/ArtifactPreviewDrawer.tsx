import React from 'react';
import { Eye, X } from 'lucide-react';
import { renderMarkdown } from '@/lib/markdown';

export interface ArtifactPreviewData {
  title: string;
  content: string;
  type: string;
  subtitle?: string;
}

interface ArtifactPreviewDrawerProps {
  artifact: ArtifactPreviewData;
  onClose: () => void;
}

export const ArtifactPreviewDrawer: React.FC<ArtifactPreviewDrawerProps> = ({
  artifact,
  onClose,
}) => {
  return (
    <aside
      className="fixed inset-y-16 right-0 z-30 w-[320px] sm:w-[440px] lg:static lg:w-[480px] xl:w-[520px] lg:h-full shrink-0 flex flex-col gap-4 transition-all duration-300 shadow-2xl lg:shadow-none bg-[var(--bg-base)]/95 lg:bg-transparent backdrop-blur-md lg:backdrop-blur-none p-3 lg:p-0"
      data-testid="artifact-preview-drawer"
    >
      <div className="instrument-panel p-4 flex-1 flex flex-col gap-3 min-h-0 bg-white/95 border border-[var(--border-parchment)] shadow-sm rounded-xl">
        <div className="panel-bracket-tl" />
        <div className="panel-bracket-br" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-2.5">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <Eye size={16} className="text-[var(--accent-midnight)] shrink-0" />
            <span
              className="font-serif font-bold text-sm text-[var(--ink-primary)] truncate"
              title={artifact.title}
            >
              Preview: {artifact.title}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Preview"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] transition-colors cursor-pointer shrink-0"
            title="Close Preview"
          >
            <X size={14} />
          </button>
        </div>

        {/* Badge / Type Subtitle */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#EFECE6] border border-[#DDD8CF] text-[11px] font-mono text-[var(--accent-midnight)] font-medium">
            {artifact.type} {artifact.subtitle ? `· ${artifact.subtitle}` : ''}
          </span>
        </div>

        {/* Scrollable Rendered Markdown Content */}
        <div className="flex-1 overflow-y-auto pr-1">
          <div
            className="markdown-body serif text-[14.5px] leading-relaxed text-[var(--ink-primary)]"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(artifact.content) }}
          />
        </div>

        {/* Footer with Close button */}
        <div className="pt-2 border-t border-[var(--border-parchment)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-[var(--border-parchment)] hover:bg-[var(--bg-panel-subtle)] bg-white text-xs text-[var(--ink-primary)] font-medium transition-colors cursor-pointer shadow-2xs"
          >
            Close
          </button>
        </div>
      </div>
    </aside>
  );
};

