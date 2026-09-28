import React, { useState } from 'react';
import { Source } from '@/types/source';
import { SourceStatusBadge } from './SourceStatusBadge';
import { retrySource, deleteSource, linkSourceToNote, unlinkSourceFromNote } from '@/api/sources';
import {
  FileText,
  Clock,
  Database,
  Layers,
  RotateCw,
  Trash2,
  Link2,
  X,
  AlertTriangle,
  FileCode,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import DOMPurify from 'dompurify';

export interface SourceDetailViewProps {
  source: Source;
  onClose?: () => void;
  onSourceUpdated?: (updated: Source) => void;
  onSourceDeleted?: (sourceId: string) => void;
  className?: string;
}

export const SourceDetailView: React.FC<SourceDetailViewProps> = ({
  source,
  onClose,
  onSourceUpdated,
  onSourceDeleted,
  className,
}) => {
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [noteIdInput, setNoteIdInput] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  const isFailed = source.processing_status?.toUpperCase() === 'FAILED';
  const fileSizeFormatted = source.file_size_bytes
    ? source.file_size_bytes > 1024 * 1024
      ? `${(source.file_size_bytes / (1024 * 1024)).toFixed(2)} MB`
      : `${(source.file_size_bytes / 1024).toFixed(1)} KB`
    : 'Unknown size';

  const handleRetry = async () => {
    if (!isFailed) return;
    setIsRetrying(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const updated = await retrySource(source.id);
      setActionSuccess('Source retry requested. Processing re-enqueued.');
      onSourceUpdated?.(updated);
    } catch (err: unknown) {
      const apiErr = err as { error?: { message?: string } } | Error;
      const msg =
        (apiErr as { error?: { message?: string } })?.error?.message ||
        (err instanceof Error ? err.message : 'Retry failed');
      setActionError(msg);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this source and its indexed chunks?')) {
      return;
    }
    setIsDeleting(true);
    setActionError(null);

    try {
      await deleteSource(source.id);
      onSourceDeleted?.(source.id);
      onClose?.();
    } catch (err: unknown) {
      const apiErr = err as { error?: { message?: string } } | Error;
      const msg =
        (apiErr as { error?: { message?: string } })?.error?.message ||
        (err instanceof Error ? err.message : 'Delete failed');
      setActionError(msg);
      setIsDeleting(false);
    }
  };

  const handleLinkNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteIdInput.trim()) return;

    setIsLinking(true);
    setActionError(null);
    try {
      await linkSourceToNote(source.id, noteIdInput.trim());
      setActionSuccess('Note successfully linked to source');
      const updatedLinks = [
        ...(source.linked_notes || []),
        { note_id: noteIdInput.trim(), title: `Note ${noteIdInput.slice(0, 8)}...` },
      ];
      onSourceUpdated?.({ ...source, linked_notes: updatedLinks });
      setNoteIdInput('');
    } catch (err: unknown) {
      const apiErr = err as { error?: { message?: string } } | Error;
      const msg =
        (apiErr as { error?: { message?: string } })?.error?.message ||
        (err instanceof Error ? err.message : 'Failed to link note');
      setActionError(msg);
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkNote = async (noteId: string) => {
    setActionError(null);
    try {
      await unlinkSourceFromNote(source.id, noteId);
      const updatedLinks = (source.linked_notes || []).filter((l) => l.note_id !== noteId);
      onSourceUpdated?.({ ...source, linked_notes: updatedLinks });
    } catch (err: unknown) {
      const apiErr = err as { error?: { message?: string } } | Error;
      const msg =
        (apiErr as { error?: { message?: string } })?.error?.message ||
        (err instanceof Error ? err.message : 'Failed to unlink note');
      setActionError(msg);
    }
  };

  // Stored-XSS protection per §12.3
  const sanitizedExtractedText = source.extracted_text
    ? DOMPurify.sanitize(source.extracted_text)
    : null;

  return (
    <div
      className={cn(
        'source-detail-view flex flex-col h-full bg-slate-950/80 backdrop-blur-xl border-l border-slate-800 text-slate-100 overflow-y-auto',
        className
      )}
      data-testid="source-detail-view"
    >
      {/* Header */}
      <div className="p-5 border-b border-slate-800/80 flex items-start justify-between gap-4 sticky top-0 bg-slate-950/90 z-10 backdrop-blur-md">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <SourceStatusBadge
              status={source.processing_status}
              stage={source.processing_stage}
            />
            {source.source_type && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-400 uppercase">
                {source.source_type}
              </span>
            )}
          </div>
          <h2
            className="text-base font-semibold text-slate-100 truncate"
            data-testid="source-title"
          >
            {source.title || source.file_name || source.original_path || 'Untitled Source'}
          </h2>
          <p className="text-xs text-slate-400 font-mono truncate mt-0.5">
            {source.original_path || source.source_identifier || source.id}
          </p>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
            aria-label="Close details"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-5 space-y-6 flex-1">
        {/* Action messages */}
        {actionError && (
          <div
            className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2"
            role="alert"
            data-testid="detail-action-error"
          >
            <AlertTriangle size={14} className="text-rose-400 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
        )}
        {actionSuccess && (
          <div
            className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2"
            role="status"
          >
            <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Failed stage alert */}
        {isFailed && (
          <div
            className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2"
            data-testid="source-error-panel"
          >
            <div className="flex items-center gap-2 text-rose-300 font-semibold text-xs">
              <AlertTriangle size={15} />
              <span>Processing Failed at Stage: {source.error_stage || source.processing_stage || 'Unknown'}</span>
            </div>
            {source.error_message && (
              <p className="text-xs text-rose-200/90 font-mono bg-rose-950/40 p-2.5 rounded-lg border border-rose-800/40 whitespace-pre-wrap break-words">
                {source.error_message}
              </p>
            )}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleRetry}
                disabled={isRetrying}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors disabled:opacity-50"
                data-testid="retry-source-btn"
              >
                <RotateCw size={13} className={cn(isRetrying && 'animate-spin')} />
                <span>{isRetrying ? 'Retrying...' : 'Retry Processing'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Pipeline & Metadata Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5 mb-1">
              <Layers size={13} className="text-sky-400" />
              <span>Chunks Created</span>
            </div>
            <div className="text-sm font-semibold font-mono text-slate-200">
              {source.chunk_count !== null && source.chunk_count !== undefined
                ? source.chunk_count
                : '—'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5 mb-1">
              <Database size={13} className="text-indigo-400" />
              <span>File Size</span>
            </div>
            <div className="text-sm font-semibold font-mono text-slate-200">
              {fileSizeFormatted}
            </div>
          </div>

          {source.page_count !== null && source.page_count !== undefined && (
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5 mb-1">
                <FileText size={13} className="text-teal-400" />
                <span>Page Count</span>
              </div>
              <div className="text-sm font-semibold font-mono text-slate-200">
                {source.page_count}
              </div>
            </div>
          )}

          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5 mb-1">
              <Clock size={13} className="text-amber-400" />
              <span>Current Stage</span>
            </div>
            <div className="text-sm font-semibold font-mono text-slate-200 capitalize">
              {source.processing_stage || '—'}
            </div>
          </div>
        </div>

        {/* Linked Notes Section */}
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Link2 size={14} className="text-sky-400" />
            Linked Notes
          </h4>

          {source.linked_notes && source.linked_notes.length > 0 ? (
            <div className="space-y-1.5">
              {source.linked_notes.map((link) => (
                <div
                  key={link.note_id}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-900/40 border border-slate-800/60 text-xs"
                >
                  <span className="text-slate-300 font-medium truncate">
                    {link.title || link.note_id}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUnlinkNote(link.note_id)}
                    className="text-slate-400 hover:text-rose-400 p-1 rounded"
                    aria-label={`Unlink note ${link.note_id}`}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">No notes linked to this source yet.</p>
          )}

          {/* Add link form */}
          <form onSubmit={handleLinkNote} className="flex gap-2">
            <input
              type="text"
              placeholder="Paste Note UUID..."
              value={noteIdInput}
              onChange={(e) => setNoteIdInput(e.target.value)}
              className="flex-1 bg-slate-900/80 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-500 font-mono"
            />
            <button
              type="submit"
              disabled={isLinking || !noteIdInput.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 transition-colors"
            >
              Link
            </button>
          </form>
        </div>

        {/* Extracted Text Preview */}
        <div className="space-y-2 pt-2">
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <FileCode size={14} className="text-sky-400" />
            Extracted Content Preview
          </h4>

          {sanitizedExtractedText ? (
            <div
              className="p-3.5 rounded-xl bg-slate-900/40 border border-slate-800/60 text-xs text-slate-300 max-h-60 overflow-y-auto font-mono whitespace-pre-wrap leading-relaxed"
              data-testid="source-extracted-content"
              dangerouslySetInnerHTML={{ __html: sanitizedExtractedText }}
            />
          ) : (
            <div className="p-4 rounded-xl bg-slate-900/30 border border-slate-800/50 text-xs text-slate-400 text-center">
              Extracted content will appear here once text extraction is complete.
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
            data-testid="delete-source-btn"
          >
            <Trash2 size={13} />
            <span>{isDeleting ? 'Deleting...' : 'Delete Source'}</span>
          </button>

          {/* Retry button for non-failed is disabled */}
          <button
            type="button"
            onClick={handleRetry}
            disabled={!isFailed || isRetrying}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              isFailed
                ? 'bg-sky-600 hover:bg-sky-500 text-white'
                : 'bg-slate-800/50 text-slate-400 cursor-not-allowed border border-slate-800'
            )}
            data-testid="footer-retry-btn"
            title={!isFailed ? 'Retry is only available for failed sources' : undefined}
          >
            <RotateCw size={13} className={cn(isRetrying && 'animate-spin')} />
            <span>Retry</span>
          </button>
        </div>
      </div>
    </div>
  );
};
