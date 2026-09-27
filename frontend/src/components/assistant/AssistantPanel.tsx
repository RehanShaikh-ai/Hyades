import React, { useState, useEffect, useCallback } from 'react';
import { Conversation } from '@/types/conversation';
import { MessageCitation } from '@/types/message';
import { listConversations, createConversation } from '@/api/conversations';
import { ConversationList } from './ConversationList';
import { ConversationView } from './ConversationView';
import { Bot, Plus } from 'lucide-react';
import { FlowHoverButton } from '@/components/ui/flow-hover-button';
import { cn } from '@/lib/utils';

export interface AssistantPanelProps {
  workspaceId: string;
  onNavigateToNote?: (noteId: string) => void;
  onNavigateToSource?: (sourceId: string) => void;
  className?: string;
}

export const AssistantPanel: React.FC<AssistantPanelProps> = ({
  workspaceId,
  onNavigateToNote,
  onNavigateToSource,
  className,
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await listConversations(workspaceId);
      setConversations(res.items || []);
      if (res.items && res.items.length > 0 && !activeConversationId) {
        setActiveConversationId(res.items[0].id);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, activeConversationId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleNewConversation = async () => {
    try {
      const newConv = await createConversation(workspaceId);
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
    } catch {
      // Fallback: local optimistic state if offline
      const tempId = `temp-conv-${Date.now()}`;
      const tempConv: Conversation = {
        id: tempId,
        workspace_id: workspaceId,
        title: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setConversations((prev) => [tempConv, ...prev]);
      setActiveConversationId(tempId);
    }
  };

  const handleConversationRenamed = (updated: Conversation) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    );
  };

  const handleConversationDeleted = (deletedId: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== deletedId));
    if (activeConversationId === deletedId) {
      const remaining = conversations.filter((c) => c.id !== deletedId);
      setActiveConversationId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const handleSelectCitation = (citation: MessageCitation) => {
    if (citation.source_id && onNavigateToSource) {
      onNavigateToSource(citation.source_id);
    } else if (citation.note_id && onNavigateToNote) {
      onNavigateToNote(citation.note_id);
    }
  };

  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

  return (
    <div
      className={cn('assistant-panel flex h-full w-full overflow-hidden', className)}
      data-testid="assistant-panel"
    >
      {/* Sidebar: Conversation List */}
      <div className="w-64 min-w-[240px] h-full flex-shrink-0">
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={setActiveConversationId}
          onNewConversation={handleNewConversation}
          onConversationRenamed={handleConversationRenamed}
          onConversationDeleted={handleConversationDeleted}
          isLoading={isLoading}
        />
      </div>

      {/* Main Area: Conversation Thread + Assistant Input */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {activeConversationId ? (
          <ConversationView
            key={activeConversationId}
            conversationId={activeConversationId}
            conversation={activeConversation}
            workspaceId={workspaceId}
            onSelectCitation={handleSelectCitation}
            onConversationUpdated={handleConversationRenamed}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400/20 to-indigo-500/20 border border-sky-500/30 text-sky-400 flex items-center justify-center shadow-lg shadow-sky-500/10">
              <Bot size={28} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Persistent AI Assistant
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Create a new conversation to ask questions with source &amp; note citations.
              </p>
            </div>
            <FlowHoverButton
              type="button"
              onClick={handleNewConversation}
              className="px-4 py-2 text-xs font-semibold flex items-center gap-2"
              data-testid="start-first-conv-btn"
            >
              <Plus size={14} />
              <span>Start Conversation</span>
            </FlowHoverButton>
          </div>
        )}
      </div>
    </div>
  );
};
