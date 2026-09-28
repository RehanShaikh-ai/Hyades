import React, { useState } from 'react';
import { Conversation } from '@/types/conversation';
import {
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  RotateCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { renameConversation, deleteConversation } from '@/api/conversations';

export interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId?: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  onConversationRenamed?: (updated: Conversation) => void;
  onConversationDeleted?: (deletedId: string) => void;
  isLoading?: boolean;
  className?: string;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onConversationRenamed,
  onConversationDeleted,
  isLoading = false,
  className,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const startRename = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title || 'Untitled Conversation');
  };

  const cancelRename = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingId(null);
    setEditTitle('');
  };

  const handleSaveRename = async (convId: string, e?: React.FormEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!editTitle.trim()) return;

    setIsSavingEdit(true);
    try {
      const updated = await renameConversation(convId, editTitle.trim());
      onConversationRenamed?.(updated);
      setEditingId(null);
    } catch {
      // Ignore or revert on failure
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this conversation?')) {
      return;
    }

    try {
      await deleteConversation(convId);
      onConversationDeleted?.(convId);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={cn(
        'conversation-list flex flex-col h-full bg-slate-950/70 border-r border-slate-800/80 select-none overflow-hidden',
        className
      )}
      data-testid="conversation-list"
    >
      {/* Header & New Chat Button */}
      <div className="p-3 border-b border-slate-800/80 space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <MessageSquare size={13} className="text-sky-400" />
            Conversations
          </span>
          {isLoading && <RotateCw size={12} className="animate-spin text-slate-400" />}
        </div>

        <button
          type="button"
          onClick={onNewConversation}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-sky-500/15 to-indigo-500/15 hover:from-sky-500/25 hover:to-indigo-500/25 border border-sky-500/30 text-sky-300 text-xs font-semibold shadow-sm transition-all duration-150 group cursor-pointer"
          data-testid="new-conversation-btn"
        >
          <Plus size={14} className="group-hover:rotate-90 transition-transform duration-200" />
          <span>New Conversation</span>
        </button>
      </div>

      {/* Conversations Scrollable List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-xs space-y-1">
            <p>No conversations yet.</p>
            <p className="text-[11px] text-slate-400">Start a chat to ask questions.</p>
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = activeConversationId === conv.id;
            const isEditing = editingId === conv.id;
            const displayTitle = conv.title || 'New Conversation';

            return (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={cn(
                  'conversation-item group flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs cursor-pointer transition-all duration-150 relative',
                  isActive
                    ? 'bg-sky-500/15 text-sky-200 border border-sky-500/30 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
                )}
                role="button"
                tabIndex={0}
                aria-current={isActive ? 'true' : undefined}
                data-testid={`conversation-item-${conv.id}`}
                onKeyDown={(e) => e.key === 'Enter' && onSelectConversation(conv.id)}
              >
                {isEditing ? (
                  <form
                    onSubmit={(e) => handleSaveRename(conv.id, e)}
                    className="flex items-center gap-1.5 flex-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      autoFocus
                      disabled={isSavingEdit}
                      className="flex-1 bg-slate-900 border border-sky-500 rounded px-1.5 py-0.5 text-xs text-slate-100 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isSavingEdit}
                      className="p-1 hover:text-emerald-400 text-slate-400"
                      aria-label="Save title"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={cancelRename}
                      className="p-1 hover:text-rose-400 text-slate-400"
                      aria-label="Cancel rename"
                    >
                      <X size={13} />
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <MessageSquare
                        size={14}
                        className={cn(
                          'flex-shrink-0',
                          isActive ? 'text-sky-400' : 'text-slate-400 group-hover:text-slate-300'
                        )}
                      />
                      <span className="truncate flex-1">{displayTitle}</span>
                    </div>

                    {/* Actions: Rename / Delete */}
                    <div className="hidden group-hover:flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={(e) => startRename(conv, e)}
                        className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                        aria-label="Rename conversation"
                        title="Rename"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(conv.id, e)}
                        className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                        aria-label="Delete conversation"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
