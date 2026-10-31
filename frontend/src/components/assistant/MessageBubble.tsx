import React from 'react';
import { Message, MessageCitation } from '@/types/message';
import { CitationList } from './CitationList';
import { StreamingIndicator } from './StreamingIndicator';
import { renderMarkdown } from '@/lib/markdown';
import { Bot, User as UserIcon, Clock, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  onSelectCitation?: (citation: MessageCitation) => void;
  className?: string;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isStreaming = false,
  onSelectCitation,
  className,
}) => {
  const isUser = message.role === 'user';
  const htmlContent = renderMarkdown(message.content);

  const formattedTime = message.created_at
    ? new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div
      className={cn(
        'message-bubble-container flex gap-3 w-full',
        isUser ? 'justify-end' : 'justify-start',
        className
      )}
      data-testid={`message-bubble-${message.id || message.role}`}
      data-role={message.role}
    >
      {/* Assistant avatar on the left */}
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-[var(--accent-midnight)] text-[var(--accent-brass)] flex items-center justify-center flex-shrink-0 shadow-2xs mt-1">
          <Bot size={17} />
        </div>
      )}

      {/* Message Card */}
      <div
        className={cn(
          'message-bubble rounded-2xl p-4 sm:p-5 max-w-[92%] sm:max-w-[85%] md:max-w-[80%] space-y-2 text-[13.5px] leading-relaxed',
          isUser
            ? 'user-bubble text-[var(--ink-primary)] rounded-tr-none'
            : 'stella-card text-[var(--ink-primary)] rounded-tl-none'
        )}
      >
        {/* Author header / meta */}
        <div className="flex items-center justify-between gap-3 text-[10px] text-[var(--ink-tertiary)] pb-1 border-b border-[var(--border-parchment)]">
          <span className="font-semibold uppercase tracking-wider text-[var(--ink-secondary)]">
            {isUser ? 'You' : 'Stella'}
          </span>
          <div className="flex items-center gap-2 font-mono">
            {message.provider && (
              <span className="flex items-center gap-1">
                <Cpu size={10} />
                {message.model || message.provider}
              </span>
            )}
            {message.latency_ms !== null && message.latency_ms !== undefined && (
              <span>{(message.latency_ms / 1000).toFixed(2)}s</span>
            )}
            {formattedTime && (
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {formattedTime}
              </span>
            )}
          </div>
        </div>

        {/* Message Content rendered safely with DOMPurify */}
        {message.content ? (
          <div
            className="markdown-body max-w-none break-words leading-relaxed text-[var(--ink-primary)]"
            data-testid="message-content"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        ) : isStreaming ? (
          <div className="py-1">
            <StreamingIndicator label="Retrieving context and formulating answer..." />
          </div>
        ) : null}

        {/* Streaming pulse when content is already arriving */}
        {isStreaming && message.content && (
          <div className="pt-2">
            <StreamingIndicator label="Generating response..." />
          </div>
        )}

        {/* Citations section below assistant message */}
        {!isUser && message.citations && message.citations.length > 0 && (
          <CitationList
            citations={message.citations}
            onSelectCitation={onSelectCitation}
          />
        )}
      </div>

      {/* User avatar on the right */}
      {isUser && (
        <div className="w-8 h-8 rounded-xl bg-[var(--bg-panel-subtle)] text-[var(--ink-secondary)] border border-[var(--border-strong)] flex items-center justify-center flex-shrink-0 mt-1">
          <UserIcon size={16} />
        </div>
      )}
    </div>
  );
};
