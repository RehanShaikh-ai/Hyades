import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Source } from '@/types/source';
import { listSources } from '@/api/sources';
import { SourceStatusBadge } from './SourceStatusBadge';
import { SourceUploadPanel } from './SourceUploadPanel';
import { SourceDetailView } from './SourceDetailView';
import {
  Layers,
  UploadCloud,
  Search,
  RotateCw,
  FileText,
  AlertCircle,
  Database,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FlowHoverButton } from '@/components/ui/flow-hover-button';
import { Modal } from '@/components/ui/Modal';

export interface SourceListProps {
  workspaceId: string;
  onSelectSource?: (source: Source) => void;
  className?: string;
}

type FilterTab = 'ALL' | 'READY' | 'PROCESSING' | 'PENDING' | 'FAILED';

export const SourceList: React.FC<SourceListProps> = ({
  workspaceId,
  onSelectSource,
  className,
}) => {
  const [sources, setSources] = useState<Source[]>([]);
  const [totalSources, setTotalSources] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal / Detail state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);

  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSources = useCallback(
    async (isBackgroundPoll = false) => {
      if (!isBackgroundPoll) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const statusFilter = activeTab !== 'ALL' ? activeTab : undefined;
        const res = await listSources(workspaceId, {
          page: currentPage,
          page_size: pageSize,
          processing_status: statusFilter,
        });

        setSources(res.items || []);
        setTotalSources(res.total || 0);

        // Update selected source if currently viewing
        if (selectedSource) {
          const updated = res.items?.find((s) => s.id === selectedSource.id);
          if (updated) setSelectedSource(updated);
        }
      } catch (err: unknown) {
        const apiErr = err as { error?: { message?: string } } | Error;
        const msg =
          (apiErr as { error?: { message?: string } })?.error?.message ||
          (err instanceof Error ? err.message : 'Failed to fetch sources');
        if (!isBackgroundPoll) {
          setError(msg);
        }
      } finally {
        if (!isBackgroundPoll) {
          setIsLoading(false);
        }
      }
    },
    [workspaceId, currentPage, pageSize, activeTab, selectedSource]
  );

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  // Polling requirement (§13.2): poll interval max 5s, stops on READY or FAILED
  useEffect(() => {
    const hasActiveProcessing = sources.some(
      (s) => s.processing_status === 'PENDING' || s.processing_status === 'PROCESSING'
    );

    if (hasActiveProcessing) {
      pollingTimerRef.current = setTimeout(() => {
        fetchSources(true);
      }, 3000);
    }

    return () => {
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
      }
    };
  }, [sources, fetchSources]);

  // Client-side search filtering
  const filteredSources = sources.filter((source) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const title = (source.title || source.file_name || source.original_path || '').toLowerCase();
    const originalPath = (source.original_path || '').toLowerCase();
    return title.includes(query) || originalPath.includes(query);
  });

  const handleSourceRowClick = (source: Source) => {
    setSelectedSource(source);
    onSelectSource?.(source);
  };

  const handleSourceUploaded = (newSource: Source) => {
    setSources((prev) => [newSource, ...prev]);
    setTotalSources((prev) => prev + 1);
    fetchSources();
  };

  const handleSourceDeleted = (deletedId: string) => {
    setSources((prev) => prev.filter((s) => s.id !== deletedId));
    setTotalSources((prev) => Math.max(0, prev - 1));
    if (selectedSource?.id === deletedId) {
      setSelectedSource(null);
    }
  };

  const handleSourceUpdated = (updated: Source) => {
    setSources((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setSelectedSource(updated);
  };

  return (
    <div
      className={cn('source-list flex h-full w-full overflow-hidden', className)}
      data-testid="source-list"
    >
      {/* Main Source List Content */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-slate-950/40">
        {/* Header toolbar */}
        <div className="p-6 pb-4 border-b border-slate-800/80 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <Layers className="text-sky-400" size={22} />
                Source Documents
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Upload and manage files that feed workspace semantic search and AI Assistant ({totalSources} total).
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => fetchSources()}
                className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                aria-label="Refresh sources"
                title="Refresh sources"
              >
                <RotateCw size={14} className={cn(isLoading && 'animate-spin')} />
              </button>
              <FlowHoverButton
                type="button"
                onClick={() => setIsUploadOpen(true)}
                className="px-4 py-2 text-xs font-semibold flex items-center gap-2"
                data-testid="open-upload-btn"
              >
                <UploadCloud size={15} />
                <span>Upload Source</span>
              </FlowHoverButton>
            </div>
          </div>

          {/* Search & Filter Tabs */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Status Tabs */}
            <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-900/80 border border-slate-800/80 overflow-x-auto text-xs">
              {(['ALL', 'READY', 'PROCESSING', 'PENDING', 'FAILED'] as FilterTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab);
                    setCurrentPage(1);
                  }}
                  className={cn(
                    'px-3 py-1 rounded-md font-medium transition-all',
                    activeTab === tab
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
                  )}
                  data-testid={`filter-tab-${tab.toLowerCase()}`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Search Bar */}
            <div className="relative min-w-[220px] sm:min-w-[280px]">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                placeholder="Search sources by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-500 transition-colors"
                data-testid="source-search-input"
              />
            </div>
          </div>
        </div>

        {/* List Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div
              className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-4 mb-4"
              role="alert"
              data-testid="source-list-error"
            >
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-rose-400 flex-shrink-0" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => fetchSources()}
                className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 rounded text-xs font-semibold"
              >
                Retry
              </button>
            </div>
          )}

          {isLoading && sources.length === 0 ? (
            /* Loading State */
            <div
              className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400"
              data-testid="source-list-loading"
            >
              <RotateCw size={24} className="animate-spin text-sky-400" />
              <p className="text-xs">Loading sources...</p>
            </div>
          ) : filteredSources.length === 0 ? (
            /* Empty State */
            <div
              className="flex flex-col items-center justify-center h-72 text-center p-8 rounded-2xl border border-dashed border-slate-800 bg-slate-900/20"
              data-testid="source-list-empty"
            >
              <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center mb-4">
                <FileText size={28} />
              </div>
              <h3 className="text-sm font-semibold text-slate-200">No sources found</h3>
              <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4">
                {searchQuery || activeTab !== 'ALL'
                  ? 'No documents match your filter criteria.'
                  : 'Upload PDF, Markdown, or plain text documents to enrich workspace intelligence.'}
              </p>
              {!searchQuery && activeTab === 'ALL' && (
                <FlowHoverButton
                  type="button"
                  onClick={() => setIsUploadOpen(true)}
                  className="px-4 py-2 text-xs font-semibold"
                >
                  Upload First Document
                </FlowHoverButton>
              )}
            </div>
          ) : (
            /* Sources Grid / Table */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="source-items-grid">
              {filteredSources.map((source) => {
                const isSelected = selectedSource?.id === source.id;
                const sizeText = source.file_size_bytes
                  ? source.file_size_bytes > 1024 * 1024
                    ? `${(source.file_size_bytes / (1024 * 1024)).toFixed(1)} MB`
                    : `${(source.file_size_bytes / 1024).toFixed(0)} KB`
                  : null;

                return (
                  <div
                    key={source.id}
                    onClick={() => handleSourceRowClick(source)}
                    className={cn(
                      'source-card p-4 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col justify-between gap-3 group relative',
                      isSelected
                        ? 'bg-sky-500/10 border-sky-500/40 shadow-[0_0_15px_rgba(56,189,248,0.12)]'
                        : 'bg-slate-900/60 hover:bg-slate-900/90 border-slate-800 hover:border-slate-700'
                    )}
                    role="button"
                    tabIndex={0}
                    aria-label={`Source: ${source.title || source.file_name || source.original_path}`}
                    data-testid={`source-card-${source.id}`}
                    onKeyDown={(e) => e.key === 'Enter' && handleSourceRowClick(source)}
                  >
                    {/* Top Row: Icon, Title, Status */}
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center flex-shrink-0">
                          <FileText size={16} />
                        </div>
                        <SourceStatusBadge
                          status={source.processing_status}
                          stage={source.processing_stage}
                        />
                      </div>

                      <div>
                        <h4 className="text-sm font-semibold text-slate-100 group-hover:text-sky-300 transition-colors truncate">
                          {source.title || source.file_name || source.original_path || 'Untitled'}
                        </h4>
                        <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                          {source.original_path || source.source_identifier || source.id}
                        </p>
                      </div>
                    </div>

                    {/* Bottom Metadata */}
                    <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span className="flex items-center gap-1">
                        <Database size={11} className="text-slate-400" />
                        {source.chunk_count !== null && source.chunk_count !== undefined
                          ? `${source.chunk_count} chunks`
                          : sizeText || '0 chunks'}
                      </span>
                      {source.page_count ? (
                        <span>{source.page_count} pages</span>
                      ) : (
                        <span>{source.source_type || 'file'}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Side Detail Panel (when a source is selected) */}
      {selectedSource && (
        <div className="w-96 min-w-[380px] h-full flex-shrink-0 z-10">
          <SourceDetailView
            source={selectedSource}
            onClose={() => setSelectedSource(null)}
            onSourceUpdated={handleSourceUpdated}
            onSourceDeleted={handleSourceDeleted}
          />
        </div>
      )}

      {/* Upload Modal */}
      {isUploadOpen && (
        <Modal
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          width="lg"
        >
          <SourceUploadPanel
            workspaceId={workspaceId}
            onSourceUploaded={handleSourceUploaded}
            onClose={() => setIsUploadOpen(false)}
          />
        </Modal>
      )}
    </div>
  );
};
