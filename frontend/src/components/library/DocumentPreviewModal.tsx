import React, { useEffect } from 'react';
import { SourceDocumentPreview } from '@/api/sources';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  format?: string;
  previewData?: SourceDocumentPreview | null;
  rawMarkdownContent?: string | null;
  isLoading?: boolean;
  error?: string | null;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  isOpen,
  onClose,
  title,
  format,
  previewData,
  rawMarkdownContent,
  isLoading = false,
  error = null,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const contentToRender = previewData?.markdown_content || rawMarkdownContent || '';
  const displayFormat = previewData?.format?.toUpperCase() || format?.toUpperCase() || 'DOCUMENT';
  const isConverted = previewData?.is_converted;
  const converter = previewData?.converter;

  // Simple, safe Markdown paragraph/header renderer
  const renderFormattedMarkdown = (text: string) => {
    if (!text.trim()) {
      return (
        <div className="text-xs text-[var(--ink-tertiary)] italic py-8 text-center">
          Document is empty.
        </div>
      );
    }

    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBuffer: string[] = [];

    lines.forEach((line, index) => {
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          elements.push(
            <pre
              key={`code-${index}`}
              className="bg-[#162135] text-[#FAF8F2] p-4 rounded-xl text-xs font-mono overflow-x-auto my-3 border border-[#2D3F5E]"
            >
              <code>{codeBuffer.join('\n')}</code>
            </pre>
          );
          codeBuffer = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        return;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        return;
      }

      const trimmed = line.trim();
      if (!trimmed) {
        elements.push(<div key={`empty-${index}`} className="h-2" />);
      } else if (trimmed.startsWith('# ')) {
        elements.push(
          <h1 key={`h1-${index}`} className="serif text-2xl font-bold text-[var(--ink-primary)] mt-4 mb-2 tracking-tight">
            {trimmed.slice(2)}
          </h1>
        );
      } else if (trimmed.startsWith('## ')) {
        elements.push(
          <h2 key={`h2-${index}`} className="serif text-xl font-semibold text-[var(--ink-primary)] mt-3 mb-1.5 tracking-tight">
            {trimmed.slice(3)}
          </h2>
        );
      } else if (trimmed.startsWith('### ')) {
        elements.push(
          <h3 key={`h3-${index}`} className="serif text-base font-semibold text-[var(--ink-primary)] mt-2.5 mb-1">
            {trimmed.slice(4)}
          </h3>
        );
      } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        elements.push(
          <li key={`li-${index}`} className="ml-5 list-disc text-xs text-[var(--ink-archival)] leading-relaxed my-0.5">
            {trimmed.slice(2)}
          </li>
        );
      } else if (trimmed.startsWith('> ')) {
        elements.push(
          <blockquote
            key={`quote-${index}`}
            className="border-l-3 border-[var(--accent-terracotta)] bg-white/80 px-3.5 py-2 my-2 rounded-r-lg italic text-xs text-[var(--ink-secondary)] leading-relaxed shadow-2xs"
          >
            {trimmed.slice(2)}
          </blockquote>
        );
      } else {
        elements.push(
          <p key={`p-${index}`} className="text-xs text-[var(--ink-archival)] leading-relaxed my-1">
            {line}
          </p>
        );
      }
    });

    if (inCodeBlock && codeBuffer.length > 0) {
      elements.push(
        <pre
          key="code-final"
          className="bg-[#162135] text-[#FAF8F2] p-4 rounded-xl text-xs font-mono overflow-x-auto my-3 border border-[#2D3F5E]"
        >
          <code>{codeBuffer.join('\n')}</code>
        </pre>
      );
    }

    return elements;
  };

  return (
    <div
      data-testid="document-preview-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/45 backdrop-blur-xs dialog-backdrop animate-fade-in select-text"
      role="dialog"
      aria-modal="true"
      aria-labelledby="document-preview-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-content w-full max-w-3xl max-h-[90vh] bg-[#FAF8F2] border border-[#C9C2B0] rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all">
        {/* Modal Header */}
        <div className="px-5 sm:px-6 py-3.5 border-b border-[#DCD6C8] flex items-center justify-between bg-[#F7F5EE] select-none">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#162135] text-[#FAF8F2] flex items-center justify-center shadow-xs shrink-0">
              <i className="ph-bold ph-book-open text-base text-[#C05638]" />
            </div>
            <div className="min-w-0 truncate">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] mono font-semibold bg-[#EFECE4] text-[var(--accent-midnight)] border border-[#DCD6C8] uppercase tracking-wider">
                  {displayFormat}
                </span>
                {isConverted && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] mono text-[#C05638] bg-[#FDF2E9] border border-[#FADBD8] font-medium">
                    Converted to Markdown
                  </span>
                )}
                {previewData?.file_size_bytes && (
                  <span className="text-[10px] mono text-[var(--ink-tertiary)] hidden sm:inline">
                    {Math.round(previewData.file_size_bytes / 1024)} KB
                  </span>
                )}
              </div>
              <h3 id="document-preview-title" className="serif text-base sm:text-lg font-semibold text-[#1C1917] truncate leading-tight mt-0.5">
                {title}
              </h3>
            </div>
          </div>

          <button
            type="button"
            data-testid="close-preview-btn"
            onClick={onClose}
            className="p-1.5 text-[#878074] hover:text-[#1C1917] hover:bg-[#EFECE4] rounded-lg transition-colors cursor-pointer shrink-0"
            aria-label="Close document preview"
          >
            <i className="ph-bold ph-x text-lg" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto hyades-scroll p-6 sm:p-8 space-y-3 bg-[#FAF8F2]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <div className="w-8 h-8 rounded-full border-2 border-[var(--accent-terracotta)] border-t-transparent animate-spin" />
              <div className="text-xs text-[var(--ink-secondary)] font-medium">
                Generating document preview representation...
              </div>
            </div>
          ) : error ? (
            <div
              data-testid="preview-error-message"
              className="p-4 bg-[#FDF2E9] border border-[#FADBD8] rounded-xl text-xs space-y-2"
            >
              <div className="flex items-center gap-2 text-[#9A3412] font-semibold">
                <i className="ph-bold ph-warning-circle text-base" />
                <span>Document Preview Unavailable</span>
              </div>
              <p className="text-[#7C2D12] leading-relaxed">
                {error}
              </p>
              <p className="text-[11px] text-[#9A3412] opacity-80">
                Only Markdown, plain text, and supported structured documents (DOCX, EPUB, HTML, PDF) can be converted to readable previews. Original files are safely preserved.
              </p>
            </div>
          ) : (
            <article className="prose prose-stone max-w-none font-sans">
              {renderFormattedMarkdown(contentToRender)}
            </article>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-6 py-2.5 border-t border-[#DCD6C8] bg-[#F7F5EE] flex items-center justify-between text-xs text-[var(--ink-tertiary)] select-none">
          <div className="flex items-center gap-2 truncate">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
            <span className="truncate">Original file preserved in workspace vault without modifications.</span>
            {converter && (
              <span className="mono text-[10px] text-[var(--ink-tertiary)] hidden sm:inline">
                (Engine: {converter})
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1 rounded-lg bg-[#EFECE4] hover:bg-[#E5E0D5] text-xs font-semibold text-[#1C1917] border border-[#DCD6C8] transition-colors cursor-pointer shrink-0"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
};
