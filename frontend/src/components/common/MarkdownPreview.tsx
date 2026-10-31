import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

export interface ResolvedRecord {
  id: string;
  title: string;
  type?: string;
}

export interface MarkdownPreviewProps {
  content: string;
  className?: string;
  resolvedRecords?: ResolvedRecord[];
  onNavigateRecord?: (record: ResolvedRecord) => void;
  dataTestId?: string;
}

/**
 * Configure rehype-sanitize to allow internal wikilink: protocol and preserve safe markup.
 * CONTRACT §12, §14
 */
const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href || ['http', 'https', 'mailto']), 'wikilink'],
  },
  attributes: {
    ...defaultSchema.attributes,
    '*': [
      ...(defaultSchema.attributes?.['*'] || []),
      'className',
      'class',
      'dataTestId',
      'data-testid',
    ],
    a: [
      ...(defaultSchema.attributes?.a || []),
      'href',
      'target',
      'rel',
      'title',
      'className',
      'class',
      'data-testid',
    ],
    code: [
      ...(defaultSchema.attributes?.code || []),
      'className',
      'class',
    ],
    th: [...(defaultSchema.attributes?.th || []), 'align'],
    td: [...(defaultSchema.attributes?.td || []), 'align'],
  },
};

/**
 * Preprocess Obsidian-style [[wikilinks]] into [Display](wikilink:Target) markdown links.
 * Supports:
 * - [[Target]] -> [Target](wikilink:Target)
 * - [[Target|Display Text]] -> [Display Text](wikilink:Target)
 */
export function preprocessWikilinks(text: string): string {
  if (!text) return '';
  // Match [[target|alias]] or [[target]]
  const wikilinkRegex = /\[\[([^\]|\n\r]+)(?:\|([^\]\n\r]+))?\]\]/g;
  return text.replace(wikilinkRegex, (_, target, alias) => {
    const cleanTarget = target.trim();
    const cleanAlias = (alias || target).trim();
    return `[${cleanAlias}](#wikilink:${encodeURIComponent(cleanTarget)})`;
  });
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content,
  className = '',
  resolvedRecords = [],
  onNavigateRecord,
  dataTestId = 'markdown-preview',
}) => {
  const processedContent = useMemo(() => preprocessWikilinks(content), [content]);

  return (
    <div
      data-testid={dataTestId}
      className={`markdown-preview-root text-xs sm:text-[13px] leading-relaxed text-[var(--ink-archival)] space-y-3 ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={{
          h1: ({ children, ...props }) => (
            <h1 {...props} className="serif text-xl sm:text-2xl font-bold text-[var(--ink-primary)] mt-4 mb-2 tracking-tight">
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 {...props} className="serif text-lg sm:text-xl font-semibold text-[var(--ink-primary)] mt-3 mb-1.5 tracking-tight">
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 {...props} className="serif text-sm sm:text-base font-semibold text-[var(--ink-primary)] mt-2.5 mb-1">
              {children}
            </h3>
          ),
          h4: ({ children, ...props }) => (
            <h4 {...props} className="serif text-xs sm:text-sm font-semibold text-[var(--ink-primary)] mt-2 mb-1">
              {children}
            </h4>
          ),
          p: ({ children, ...props }) => (
            <p {...props} className="my-1.5 leading-relaxed text-[var(--ink-archival)]">
              {children}
            </p>
          ),
          ul: ({ children, ...props }) => (
            <ul {...props} className="list-disc pl-5 my-2 space-y-1">
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol {...props} className="list-decimal pl-5 my-2 space-y-1">
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li {...props} className="my-0.5 leading-relaxed">
              {children}
            </li>
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote
              {...props}
              className="border-l border-[var(--accent-terracotta)] pl-3.5 py-1 my-2.5 italic text-[var(--ink-secondary)]"
            >
              {children}
            </blockquote>
          ),
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto my-3 border border-[var(--border-parchment)] rounded-lg">
              <table {...props} className="w-full text-left border-collapse text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children, ...props }) => (
            <thead {...props} className="bg-[var(--bg-panel-subtle)] border-b border-[var(--border-parchment)] font-medium text-[var(--ink-primary)]">
              {children}
            </thead>
          ),
          th: ({ children, ...props }) => (
            <th {...props} className="px-3 py-2 font-semibold">
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td {...props} className="px-3 py-2 border-t border-[var(--border-parchment)] text-[var(--ink-secondary)]">
              {children}
            </td>
          ),
          code: ({ className: codeClassName, children, ...props }) => {
            const match = /language-(\w+)/.exec(codeClassName || '');
            const isInline = !match && typeof children === 'string' && !children.includes('\n');
            if (isInline) {
              return (
                <code
                  {...props}
                  className="mono text-[0.88em] bg-[var(--bg-panel-subtle)] px-1.5 py-0.5 rounded border border-[var(--border-parchment)] text-[var(--ink-primary)] font-medium"
                >
                  {children}
                </code>
              );
            }
            return (
              <pre className="mono text-xs bg-[#162135] text-[#FAF8F2] p-3.5 rounded-xl border border-[#2D3F5E] overflow-x-auto my-3">
                <code className={codeClassName} {...props}>
                  {children}
                </code>
              </pre>
            );
          },
          a: ({ href, children, ...props }) => {
            if (href?.startsWith('#wikilink:')) {
              const rawTarget = decodeURIComponent(href.replace('#wikilink:', ''));
              const targetLower = rawTarget.toLowerCase();
              const matched = resolvedRecords.find(
                (r) =>
                  r.id.toLowerCase() === targetLower ||
                  r.title.toLowerCase() === targetLower
              );

              if (matched) {
                return (
                  <a
                    {...props}
                    href={`#record-${matched.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigateRecord?.(matched);
                    }}
                    className="wikilink-resolved inline-flex items-center gap-1 font-medium text-[var(--accent-midnight)] underline hover:text-[var(--accent-terracotta)] transition-colors cursor-pointer"
                    data-testid={`wikilink-resolved-${matched.id}`}
                    title={`Jump to ${matched.title} (${matched.type || 'record'})`}
                  >
                    <span>{children}</span>
                    <span className="text-[10px] text-[var(--accent-brass)] font-mono">↗</span>
                  </a>
                );
              }

              // Unresolved wikilink: stays readable and intact without breaking the app
              return (
                <span
                  className="wikilink-unresolved inline-flex items-center px-1.5 py-0.5 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-[var(--ink-secondary)] text-[0.88em] font-mono select-text"
                  data-testid="wikilink-unresolved"
                  title={`Unresolved reference: ${rawTarget}`}
                >
                  [[{children}]]
                </span>
              );
            }

            return (
              <a
                {...props}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent-midnight)] underline hover:text-[var(--accent-terracotta)] transition-colors font-medium"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};
