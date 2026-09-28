import React, { useState, useRef, useEffect } from 'react';
import { Send, Square, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AssistantInputProps {
  onSendMessage: (content: string) => void;
  onStopStreaming?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const MAX_CHARS = 4000;

export const AssistantInput: React.FC<AssistantInputProps> = ({
  onSendMessage,
  onStopStreaming,
  isStreaming = false,
  disabled = false,
  placeholder = 'Ask anything about your workspace notes and documents...',
  className,
}) => {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [content]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isStreaming || disabled) return;
    const trimmed = content.trim();
    if (!trimmed) return;

    onSendMessage(trimmed);
    setContent('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSend = Boolean(content.trim()) && !isStreaming && !disabled;

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'assistant-input-container bg-slate-900/90 border border-slate-800 rounded-2xl p-3 shadow-2xl backdrop-blur-xl transition-all focus-within:border-sky-500/50 focus-within:shadow-[0_0_20px_rgba(56,189,248,0.1)]',
        className
      )}
      data-testid="assistant-input-container"
    >
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            rows={1}
            value={content}
            onChange={(e) => {
              if (e.target.value.length <= MAX_CHARS) {
                setContent(e.target.value);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? 'Assistant is streaming response...' : placeholder}
            disabled={disabled}
            className="w-full bg-transparent text-slate-100 placeholder-slate-400 text-xs sm:text-sm resize-none focus:outline-none py-1.5 px-2 max-h-44 leading-relaxed font-sans"
            data-testid="assistant-query-input"
            aria-label="Assistant query input"
          />
        </div>

        {/* Action Button: Stop if streaming, else Send */}
        <div className="flex items-center gap-1.5 pb-1">
          {isStreaming ? (
            <button
              type="button"
              onClick={onStopStreaming}
              className="p-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition-colors flex items-center justify-center shadow-md shadow-rose-500/20"
              aria-label="Stop generation"
              title="Stop generation"
              data-testid="assistant-stop-btn"
            >
              <Square size={15} className="fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              className={cn(
                'p-2 rounded-xl text-slate-950 transition-all duration-200 flex items-center justify-center',
                canSend
                  ? 'bg-gradient-to-r from-sky-400 to-indigo-500 hover:scale-105 shadow-md shadow-sky-500/20 cursor-pointer'
                  : 'bg-slate-800 text-slate-400 cursor-not-allowed opacity-50'
              )}
              aria-label="Send message"
              title="Send message (Enter)"
              data-testid="assistant-send-btn"
            >
              <Send size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Footer Info / Character Counter */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 px-2 pt-1.5 border-t border-slate-800/60 mt-1">
        <span className="flex items-center gap-1 text-slate-400">
          <Sparkles size={11} className="text-sky-400" />
          RAG-augmented workspace intelligence
        </span>
        <span className={cn(content.length >= MAX_CHARS ? 'text-rose-400 font-bold' : 'text-slate-400')}>
          {content.length}/{MAX_CHARS}
        </span>
      </div>
    </form>
  );
};
