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
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 text-slate-950 flex items-center justify-center flex-shrink-0 shadow-lg shadow-sky-500/10 mt-1">
          <Bot size={17} />
        </div>
      )}

      {/* Message Card */}
      <div
        className={cn(
          'message-bubble rounded-2xl p-4.5 max-w-[88%] sm:max-w-[80%] md:max-w-[75%] space-y-2 text-xs leading-relaxed shadow-lg',
          isUser
            ? 'bg-gradient-to-br from-indigo-600/90 to-sky-600/90 text-white rounded-tr-none border border-sky-400/30'
            : 'bg-slate-900/90 text-slate-200 rounded-tl-none border border-slate-800 backdrop-blur-xl'
        )}
      >
        {/* Author header / meta */}
        <div className="flex items-center justify-between gap-3 text-[10px] opacity-75 pb-1 border-b border-white/[0.08]">
          <span className="font-semibold uppercase tracking-wider">
            {isUser ? 'You' : 'Atlas Assistant'}
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
            className={cn(
              'markdown-body prose prose-invert prose-xs max-w-none break-words leading-relaxed',
              isUser ? 'text-white' : 'text-slate-200'
            )}
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
        <div className="w-8 h-8 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 flex items-center justify-center flex-shrink-0 mt-1">
          <UserIcon size={16} />
        </div>
      )}
    </div>
  );
};
