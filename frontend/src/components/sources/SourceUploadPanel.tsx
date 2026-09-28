import React, { useState, useRef, useCallback } from 'react';
import { uploadSource } from '@/api/sources';
import { Source } from '@/types/source';
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FlowHoverButton } from '@/components/ui/flow-hover-button';

export interface SourceUploadPanelProps {
  workspaceId: string;
  onSourceUploaded?: (source: Source) => void;
  onClose?: () => void;
  className?: string;
}

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB per CONTRACT_v0.4.1 §15
const SUPPORTED_EXTENSIONS = ['.pdf', '.md', '.markdown', '.txt'];

export const SourceUploadPanel: React.FC<SourceUploadPanelProps> = ({
  workspaceId,
  onSourceUploaded,
  onClose,
  className,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadedSource, setUploadedSource] = useState<Source | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      return `Unsupported file format (${ext}). Supported types are PDF, Markdown (.md), and plain text (.txt).`;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return `File size (${sizeMB} MB) exceeds maximum allowed limit of 25 MB.`;
    }
    return null;
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    setError(null);
    setUploadedSource(null);
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  }, [validateFile]);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setError(null);
    setUploadProgress(20);

    try {
      setUploadProgress(50);
      const result = await uploadSource(workspaceId, selectedFile);
      setUploadProgress(100);
      setUploadedSource(result);
      onSourceUploaded?.(result);
    } catch (err: unknown) {
      const apiErr = err as { error?: { message?: string } } | Error;
      const msg =
        (apiErr as { error?: { message?: string } })?.error?.message ||
        (err instanceof Error ? err.message : 'Source upload failed');
      setError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const resetSelection = () => {
    setSelectedFile(null);
    setUploadedSource(null);
    setError(null);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div
      className={cn(
        'source-upload-panel bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-2xl backdrop-blur-xl',
        className
      )}
      data-testid="source-upload-panel"
    >
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/80">
        <div>
          <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <UploadCloud size={18} className="text-sky-400" />
            Upload Source Document
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Ingest PDF, Markdown, or plain text into workspace retrieval and graph.
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-md transition-colors"
            aria-label="Close upload panel"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain"
        className="hidden"
        data-testid="source-file-input"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
          }
        }}
      />

      {/* Upload Zone */}
      {!uploadedSource ? (
        <div className="space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-3',
              dragOver
                ? 'border-sky-400 bg-sky-500/10 scale-[1.01]'
                : selectedFile
                ? 'border-indigo-500/50 bg-slate-800/40'
                : 'border-slate-700/80 hover:border-slate-600 bg-slate-950/40 hover:bg-slate-900/40'
            )}
            data-testid="upload-dropzone"
            role="button"
            tabIndex={0}
            aria-label="Upload dropzone"
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          >
            <div className="w-12 h-12 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shadow-lg shadow-sky-500/5">
              <UploadCloud size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200">
                {selectedFile ? selectedFile.name : 'Click to select or drag & drop file'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                PDF, Markdown (.md), Plain Text (.txt) up to 25 MB
              </p>
            </div>
            {selectedFile && (
              <div className="flex items-center gap-2 text-xs text-sky-400 bg-sky-500/10 px-3 py-1 rounded-full border border-sky-500/20 font-mono">
                <FileText size={13} />
                <span>{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</span>
              </div>
            )}
          </div>

          {/* Validation or API error */}
          {error && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs"
              role="alert"
              data-testid="upload-error"
            >
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Progress bar */}
          {isUploading && (
            <div className="space-y-1.5" data-testid="upload-progress-container">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Uploading & enqueueing background pipeline...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-500 transition-all duration-300 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            {selectedFile && !isUploading && (
              <button
                type="button"
                onClick={resetSelection}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                Clear
              </button>
            )}
            <FlowHoverButton
              type="button"
              disabled={!selectedFile || isUploading}
              onClick={handleUpload}
              className="px-5 py-2 text-xs font-semibold"
              data-testid="upload-submit-btn"
            >
              {isUploading ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Uploading...
                </span>
              ) : (
                'Start Upload'
              )}
            </FlowHoverButton>
          </div>
        </div>
      ) : (
        /* Upload Success Confirmation */
        <div className="p-6 text-center space-y-4" data-testid="upload-success">
          <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-100">
              Source Uploaded Successfully
            </h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {uploadedSource.file_name || uploadedSource.original_path || 'Document'} is now queued for text extraction, chunking, and embedding.
            </p>
          </div>
          <div className="flex justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={resetSelection}
              className="px-4 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              Upload Another
            </button>
            {onClose && (
              <FlowHoverButton
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 text-xs font-semibold"
              >
                Done
              </FlowHoverButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
