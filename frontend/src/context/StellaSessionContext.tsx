import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { Conversation } from '@/types/conversation';
import { Message, MessageCitation } from '@/types/message';
import { CitedSourceItem, LocalDisplayMessage } from '@/types/stella';
import { StellaContext } from '@/types/navigation';
import {
  listConversations,
  createConversation,
  deleteConversation,
} from '@/api/conversations';
import { listMessages } from '@/api/messages';
import { streamAssistantResponse } from '@/api/assistant';
import {
  createNoteDraft,
  commitNoteDraft,
  cancelNoteDraft,
  summarizeItem,
  executeStellaSearch,
  reviewStellaInbox,
  stageAddToCollection,
  commitAddToCollection,
  getStellaLinkNotes,
  connectStellaNoteLink,
  getCommandSuggestions,
  executeStellaCommand,
  PLACEHOLDER_COMMANDS,
} from '@/api/stella_commands';

export const WELCOME_MESSAGE: LocalDisplayMessage = {
  id: 'stella-welcome',
  role: 'assistant',
  content:
    '### Welcome to Stella\n\nI am your scholarly research assistant connected directly to your active workspace knowledge graph and archival sources.\n\nAsk me any inquiry to synthesize concepts, surface grounded citations, or explore relationships across your notes.',
  timestamp: 'Just now',
};

interface StellaSessionContextValue {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: LocalDisplayMessage[];
  isStreaming: boolean;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  activeCitations: CitedSourceItem[];
  setActiveCitations: React.Dispatch<React.SetStateAction<CitedSourceItem[]>>;
  isEvidenceOpen: boolean;
  activeScope: StellaContext | null;
  inputPrompt: string;
  setInputPrompt: React.Dispatch<React.SetStateAction<string>>;
  setActiveScope: React.Dispatch<React.SetStateAction<StellaContext | null>>;
  setIsEvidenceOpen: React.Dispatch<React.SetStateAction<boolean>>;
  fetchConversations: (workspaceId: string) => Promise<void>;
  selectConversation: (convId: string) => Promise<void>;
  sendMessage: (workspaceId: string, userText: string) => Promise<void>;
  cancelGeneration: () => void;
  newChat: () => void;
  deleteConversationById: (convId: string) => Promise<void>;
  saveNoteDraft: (msgId: string, revisedTitle?: string, revisedContent?: string) => Promise<void>;
  regenerateNoteDraft: (msgId: string) => Promise<void>;
  cancelNoteDraftAction: (msgId: string) => Promise<void>;
  confirmAddToCollection: (msgId: string) => Promise<void>;
  cancelAddToCollection: (msgId: string) => void;
  confirmGenericProposal: (msgId: string, overrides?: Record<string, any>) => Promise<void>;
  cancelGenericProposal: (msgId: string) => void;
  stageOrganizationRecommendation?: (
    msgId: string,
    recommendationPayload: Record<string, any>
  ) => Promise<void>;
  connectNotesInSuggestion: (msgId: string, sourceNoteId: string, targetNoteId: string) => Promise<void>;
}

const StellaSessionContext = createContext<StellaSessionContextValue | null>(null);

export const StellaSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // Messages in current conversation
  const [messages, setMessages] = useState<LocalDisplayMessage[]>([WELCOME_MESSAGE]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeCitations, setActiveCitations] = useState<CitedSourceItem[]>([]);
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);

  // Carried Context & Composer
  const [activeScope, setActiveScope] = useState<StellaContext | null>(null);
  const [inputPrompt, setInputPrompt] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const currentWorkspaceIdRef = useRef<string>('');
  const activeConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  // Load message history for a conversation
  const loadMessagesForConversation = useCallback(async (convId: string) => {
    setIsLoadingMessages(true);
    try {
      const rawRes = await listMessages(convId);
      const rawList: Message[] = Array.isArray(rawRes) ? rawRes : rawRes.items || [];
      if (rawList.length === 0) {
        setMessages([WELCOME_MESSAGE]);
        setActiveCitations([]);
        return;
      }

      const mapped: LocalDisplayMessage[] = [];
      for (let i = 0; i < rawList.length; i++) {
        const m = rawList[i];
        const cites: CitedSourceItem[] = (m.citations || []).map((c: MessageCitation) => ({
          chunk_id: c.chunk_id,
          note_id: c.note_id,
          source_id: c.source_id,
          title: c.source_title || c.note_title || c.title || 'Referenced Source',
          excerpt: c.excerpt || '',
          score: c.similarity_score || 0.8,
        }));

        let genericResult: any = undefined;
        let genericProposal: any = undefined;
        let summaryCard: any = undefined;
        let noteDraft: any = undefined;
        let addToCollectionProposal: any = undefined;
        let searchResults: any = undefined;
        let inboxReview: any = undefined;
        let linkNotesResults: any = undefined;
        let cleanContent = m.content || '';

        if (m.role === 'assistant') {
          // Check for embedded action result payload in HTML comments
          const actionMatch = /<!--hyades-action-result:([\s\S]*?)(?:-->|$)/.exec(cleanContent);
          if (actionMatch) {
            try {
              const parsed = JSON.parse(actionMatch[1]);
              cleanContent = cleanContent.replace(/<!--hyades-action-result:[\s\S]*?(?:-->|$)/, '').trim();
              const cardType = parsed.card_type || '';

              if (cardType === 'summary' || parsed.summaryCard || parsed.summary_title) {
                const sc = parsed.summaryCard || parsed;
                summaryCard = {
                  targetId: sc.targetId ?? sc.target_id ?? '',
                  targetTitle: sc.targetTitle ?? sc.target_title ?? 'Untitled',
                  targetType: sc.targetType ?? sc.target_type ?? 'note',
                  summaryTitle:
                    sc.summaryTitle ??
                    sc.summary_title ??
                    `Summary: ${sc.targetTitle ?? sc.target_title ?? 'Item'}`,
                  metaDescription: sc.metaDescription ?? sc.meta_description ?? '',
                  keyPoints: Array.isArray(sc.keyPoints ?? sc.key_points)
                    ? sc.keyPoints ?? sc.key_points
                    : [],
                  fullSummary: sc.fullSummary ?? sc.full_summary ?? '',
                  relatedNotesCount: sc.relatedNotesCount ?? sc.related_notes_count ?? 0,
                  sourceId: sc.sourceId ?? sc.source_id ?? null,
                };
              } else if (cardType === 'note_draft' || parsed.noteDraft) {
                const nd = parsed.noteDraft || parsed;
                const rawStatus = nd.status || parsed.status || 'proposed';
                noteDraft = {
                  proposalId: nd.proposalId ?? nd.proposal_id ?? parsed.proposal_id ?? '',
                  confirmationToken:
                    nd.confirmationToken ??
                    nd.confirmation_token ??
                    parsed.confirmation_token ??
                    '',
                  actionId: nd.actionId ?? nd.action_id ?? 'notes.create',
                  title: nd.title ?? 'Untitled Note',
                  content: nd.content ?? '',
                  wordCount: nd.wordCount ?? nd.word_count ?? 0,
                  status:
                    rawStatus === 'committed'
                      ? 'committed'
                      : rawStatus === 'cancelled'
                      ? 'cancelled'
                      : 'preview',
                  savedNoteId: nd.savedNoteId ?? nd.saved_note_id ?? nd.note_id,
                  savedAt: nd.savedAt ?? nd.saved_at ?? 'Recently',
                  topic: nd.topic ?? '',
                };
              } else if (cardType === 'add_to_collection' || parsed.addToCollectionProposal) {
                const ac = parsed.addToCollectionProposal || parsed;
                const rawStatus = ac.status || parsed.status || 'proposed';
                addToCollectionProposal = {
                  proposalId: ac.proposalId ?? ac.proposal_id ?? parsed.proposal_id ?? '',
                  confirmationToken:
                    ac.confirmationToken ??
                    ac.confirmation_token ??
                    parsed.confirmation_token ??
                    '',
                  actionId: ac.actionId ?? ac.action_id ?? 'collections.add_item',
                  itemId: ac.itemId ?? ac.item_id ?? '',
                  itemTitle: ac.itemTitle ?? ac.item_title ?? 'Item',
                  itemType: ac.itemType ?? ac.item_type ?? 'note',
                  collectionId: ac.collectionId ?? ac.collection_id ?? '',
                  collectionName: ac.collectionName ?? ac.collection_name ?? 'Collection',
                  status:
                    rawStatus === 'committed'
                      ? 'committed'
                      : rawStatus === 'cancelled'
                      ? 'cancelled'
                      : 'preview',
                };
              } else if (cardType === 'search_results' || parsed.searchResults) {
                const sr = parsed.searchResults || parsed;
                searchResults = {
                  query: sr.query ?? '',
                  total: sr.total ?? (Array.isArray(sr.items) ? sr.items.length : 0),
                  items: Array.isArray(sr.items) ? sr.items : [],
                };
              } else if (cardType === 'inbox_review' || parsed.inboxReview) {
                const ir = parsed.inboxReview || parsed;
                inboxReview = {
                  totalPending: ir.totalPending ?? ir.total_pending ?? 0,
                  items: Array.isArray(ir.items) ? ir.items : [],
                  summaryMessage: ir.summaryMessage ?? ir.summary_message ?? cleanContent,
                };
              } else if (cardType === 'link_notes' || parsed.linkNotesResults) {
                const ln = parsed.linkNotesResults || parsed;
                linkNotesResults = {
                  sourceNoteId: ln.sourceNoteId ?? ln.source_note_id ?? '',
                  sourceNoteTitle: ln.sourceNoteTitle ?? ln.source_note_title ?? '',
                  summary: ln.summary ?? cleanContent,
                  candidates: Array.isArray(ln.candidates) ? ln.candidates : [],
                };
              } else if (cardType === 'placeholder' || parsed.status === 'coming_soon') {
                // Informational placeholder message; no action result card needed
              } else if (
                parsed.status === 'proposed' ||
                parsed.status === 'committed' ||
                parsed.requires_confirmation ||
                parsed.proposal_id ||
                parsed.proposalId
              ) {
                const cmd = parsed.command || '';
                const cmdName = cmd.startsWith('/')
                  ? cmd
                      .slice(1)
                      .replace(/-/g, ' ')
                      .replace(/\b\w/g, (c: string) => c.toUpperCase())
                  : cmd;
                const propStatus =
                  parsed.status === 'committed'
                    ? 'committed'
                    : parsed.status === 'cancelled'
                    ? 'cancelled'
                    : 'preview';
                genericProposal = {
                  proposalId: parsed.proposal_id || parsed.proposalId || '',
                  confirmationToken:
                    parsed.confirmation_token || parsed.confirmationToken || '',
                  actionId: parsed.action_id || parsed.actionId || '',
                  command: cmd,
                  commandName: cmdName,
                  message: parsed.message || cleanContent,
                  status: propStatus,
                  data: parsed.data || {},
                  affectedItemIds:
                    parsed.affected_item_ids || parsed.affectedItemIds || [],
                };
              } else {
                genericResult = {
                  command: parsed.command || '',
                  actionId: parsed.action_id || parsed.actionId || '',
                  status: parsed.status || 'completed',
                  message: parsed.message || cleanContent,
                  data: parsed.data || {},
                };
              }
            } catch (err) {
              console.warn('Failed to parse hyades-action-result payload', err);
            }
          } else {
            // Resilient fallback for legacy /reconcile-duplicates messages without metadata tag
            const dupMatch = /Duplicate reconciliation check complete:\s*(\d+)\s*duplicate pairs? identified/i.exec(cleanContent);
            if (dupMatch) {
              const count = parseInt(dupMatch[1], 10);
              const prevUserMsg = mapped[mapped.length - 1];
              let scopeExamined = 'Entire Workspace';
              if (prevUserMsg && prevUserMsg.role === 'user') {
                const matchScope = /^\/reconcile-duplicates\s+["']?([^"']+)["']?/i.exec(prevUserMsg.content);
                if (matchScope && matchScope[1]) {
                  scopeExamined = matchScope[1];
                }
              }
              genericResult = {
                command: '/reconcile-duplicates',
                actionId: 'notes.compare',
                status: 'completed',
                message: cleanContent,
                data: {
                  duplicate_count: count,
                  pairs: [],
                  status: count === 0 ? 'reconciled' : 'duplicates_found',
                  scope_examined: scopeExamined,
                  notes_examined_count: 0,
                },
              };
            }
          }

          // If the previous user message was truncated (e.g. legacy "/reconcile-duplicates"), restore its argument from scope_examined
          if (genericResult?.data?.scope_examined && genericResult.data.scope_examined !== 'Entire Workspace') {
            const prevUserMsg = mapped[mapped.length - 1];
            if (prevUserMsg && prevUserMsg.role === 'user') {
              const cmd = genericResult.command || '';
              if (prevUserMsg.content.trim() === cmd) {
                const cleanScope = String(genericResult.data.scope_examined).replace(/^(Note|Collection|Topic):\s*/, '').trim();
                if (cleanScope && !/^Entire Workspace/i.test(cleanScope)) {
                  prevUserMsg.content = `${cmd} "${cleanScope}"`;
                }
              }
            }
          }
        }

        mapped.push({
          id: m.id,
          role: m.role,
          content: cleanContent,
          timestamp: m.created_at
            ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Recently',
          citations: cites,
          latencyMs: m.latency_ms || undefined,
          model: m.model || undefined,
          summaryCard,
          noteDraft,
          addToCollectionProposal,
          searchResults,
          inboxReview,
          linkNotesResults,
          genericResult,
          genericProposal,
        });
      }

      setMessages(mapped);

      const lastAssistant = [...mapped].reverse().find((msg) => msg.role === 'assistant' && msg.citations && msg.citations.length > 0);
      if (lastAssistant && lastAssistant.citations) {
        setActiveCitations(lastAssistant.citations);
      } else {
        setActiveCitations([]);
      }
    } catch {
      setMessages([
        {
          id: 'load-error',
          role: 'assistant',
          content: 'Failed to load conversation messages from the database.',
          timestamp: 'Just now',
          error: 'Could not retrieve message history for this conversation thread.',
        },
      ]);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  // Fetch conversations list with durable persistence
  const fetchConversations = useCallback(
    async (workspaceId: string) => {
      if (!workspaceId) return;
      currentWorkspaceIdRef.current = workspaceId;
      setIsLoadingConversations(true);
      try {
        const res = await listConversations(workspaceId);
        const items = res.items || [];
        setConversations((prev) => {
          const map = new Map<string, Conversation>();
          items.forEach((c) => map.set(c.id, c));
          prev.forEach((c) => {
            if (!map.has(c.id) && c.workspace_id === workspaceId) {
              map.set(c.id, c);
            }
          });
          return Array.from(map.values()).sort(
            (a, b) =>
              new Date(b.updated_at || b.created_at).getTime() -
              new Date(a.updated_at || a.created_at).getTime()
          );
        });

        let targetId = activeConversationIdRef.current;
        if (!targetId && typeof window !== 'undefined') {
          const stored = localStorage.getItem(`hyades_active_conversation_${workspaceId}`);
          if (stored && items.some((c) => c.id === stored)) {
            targetId = stored;
          }
        }
        if (!targetId && items.length > 0) {
          targetId = items[0].id;
        }

        if (targetId) {
          if (activeConversationIdRef.current !== targetId) {
            setActiveConversationId(targetId);
            activeConversationIdRef.current = targetId;
            if (typeof window !== 'undefined') {
              localStorage.setItem(`hyades_active_conversation_${workspaceId}`, targetId);
            }
            await loadMessagesForConversation(targetId);
          }
        } else if (!activeConversationIdRef.current) {
          setActiveConversationId(null);
          setMessages([WELCOME_MESSAGE]);
          setActiveCitations([]);
        }
      } catch {
        // Gracefully handle error
      } finally {
        setIsLoadingConversations(false);
      }
    },
    [loadMessagesForConversation]
  );

  // Select conversation (DOES NOT send anything or trigger LLM request)
  const selectConversation = useCallback(
    async (convId: string) => {
      if (activeConversationId === convId) return;
      setActiveConversationId(convId);
      if (typeof window !== 'undefined' && currentWorkspaceIdRef.current) {
        localStorage.setItem(`hyades_active_conversation_${currentWorkspaceIdRef.current}`, convId);
      }
      await loadMessagesForConversation(convId);
    },
    [activeConversationId, loadMessagesForConversation]
  );

  // Explicit cancellation
  const cancelGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  // New Chat action
  const newChat = useCallback(() => {
    cancelGeneration();
    setActiveConversationId(null);
    if (typeof window !== 'undefined' && currentWorkspaceIdRef.current) {
      localStorage.removeItem(`hyades_active_conversation_${currentWorkspaceIdRef.current}`);
    }
    setMessages([WELCOME_MESSAGE]);
    setActiveCitations([]);
    setInputPrompt('');
    setActiveScope(null);
  }, [cancelGeneration]);

  // Delete conversation with CASCADE cleanup
  const deleteConversationById = useCallback(
    async (convId: string) => {
      try {
        await deleteConversation(convId);
        setConversations((prev) => prev.filter((c) => c.id !== convId));

        if (activeConversationId === convId) {
          if (typeof window !== 'undefined' && currentWorkspaceIdRef.current) {
            localStorage.removeItem(`hyades_active_conversation_${currentWorkspaceIdRef.current}`);
          }
          const remaining = conversations.filter((c) => c.id !== convId);
          if (remaining.length > 0) {
            setActiveConversationId(remaining[0].id);
            await loadMessagesForConversation(remaining[0].id);
          } else {
            newChat();
          }
        }
      } catch {
        // Gracefully handle
      }
    },
    [activeConversationId, conversations, loadMessagesForConversation, newChat]
  );

  // Send message with streaming that SURVIVES page navigation
  const sendMessage = useCallback(
    async (workspaceId: string, userText: string) => {
      const text = userText.trim();
      if (!text || isStreaming || !workspaceId) return;

      setInputPrompt('');
      setIsStreaming(true);

      let targetConvId = activeConversationId;

      if (!targetConvId) {
        try {
          const convTitle = text.length > 45 ? `${text.slice(0, 45)}...` : text;
          const createdConv = await createConversation(workspaceId, { title: convTitle });
          targetConvId = createdConv.id;
          setActiveConversationId(createdConv.id);
          if (typeof window !== 'undefined') {
            localStorage.setItem(`hyades_active_conversation_${workspaceId}`, createdConv.id);
          }
          setConversations((prev) => [createdConv, ...prev]);
        } catch {
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: 'assistant',
              content: 'Failed to initialize a persistent conversation thread in this workspace.',
              timestamp: 'Just now',
              error: 'Unable to create conversation thread on server.',
            },
          ]);
          setIsStreaming(false);
          return;
        }
      }


    // ─────────────────────────────────────────────────────────────────────────
    // Placeholder / Coming Soon Slash Commands
    // ─────────────────────────────────────────────────────────────────────────
    if (text.startsWith('/')) {
      const firstCmd = text.split(/\s+/)[0].toLowerCase();
      if (PLACEHOLDER_COMMANDS.has(firstCmd)) {
        const userMsgId = `user-${Date.now()}`;
        const userDisplayMsg: LocalDisplayMessage = {
          id: userMsgId,
          role: 'user',
          content: text,
          timestamp: 'Just now',
        };

        const assistantMsgId = `assistant-${Date.now()}`;
        const initialAssistantMsg: LocalDisplayMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: 'Checking action availability...',
          timestamp: 'Just now',
        };

        setMessages((prev) => [...prev, userDisplayMsg, initialAssistantMsg]);

        try {
          const res = await executeStellaCommand(workspaceId, {
            command: firstCmd,
            conversation_id: targetConvId || undefined,
            prompt: text,
          });
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: res.message,
                  }
                : m
            )
          );
        } catch {
          const friendlyName = firstCmd
            .slice(1)
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: `${friendlyName} is under development and coming soon.`,
                  }
                : m
            )
          );
        } finally {
          setIsStreaming(false);
        }
        return;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Slash Command Execution: /create-note <topic>
    // ─────────────────────────────────────────────────────────────────────────
    if (text.startsWith('/create-note')) {
      const match = text.match(/^\/create-note(?:\s+(.*))?$/i);
      const rawTopic = match && match[1]?.trim() ? match[1].trim() : 'General Research';

      const userMsgId = `user-${Date.now()}`;
      const userDisplayMsg: LocalDisplayMessage = {
        id: userMsgId,
        role: 'user',
        content: text,
        timestamp: 'Just now',
      };

      const assistantMsgId = `assistant-${Date.now()}`;
      const initialAssistantMsg: LocalDisplayMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: `Synthesizing draft note for "${rawTopic}"...`,
        timestamp: 'Just now',
      };

      setMessages((prev) => [...prev, userDisplayMsg, initialAssistantMsg]);

      try {
        const draftRes = await createNoteDraft(
          workspaceId,
          rawTopic,
          targetConvId || undefined,
          text
        );
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: `I've drafted a comprehensive note on **${rawTopic}**. Here is a preview:`,
                  noteDraft: {
                    proposalId: draftRes.proposal_id,
                    confirmationToken: draftRes.confirmation_token,
                    actionId: draftRes.action_id,
                    title: draftRes.title,
                    content: draftRes.content,
                    wordCount: draftRes.word_count,
                    status: 'preview',
                    topic: rawTopic,
                  },
                }
              : m
          )
        );
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to generate note draft.';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: 'Could not generate note draft.', error: errorMsg }
              : m
          )
        );
      } finally {
        setIsStreaming(false);
      }
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Slash Command Execution: /summarize <target>
    // ─────────────────────────────────────────────────────────────────────────
    if (text.startsWith('/summarize')) {
      const match = text.match(/^\/summarize(?:\s+(.*))?$/i);
      const rawTarget = match && match[1]?.trim() ? match[1].trim() : '';
      const target = rawTarget.replace(/^["']|["']$/g, '');

      const userMsgId = `user-${Date.now()}`;
      const userDisplayMsg: LocalDisplayMessage = {
        id: userMsgId,
        role: 'user',
        content: text,
        timestamp: 'Just now',
      };

      const assistantMsgId = `assistant-${Date.now()}`;
      const initialAssistantMsg: LocalDisplayMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: target
          ? `Retrieving and summarizing **${target}** from active workspace resources...`
          : 'Please specify a target note, source, or item to summarize, e.g. `/summarize "Life of Umar ibn al-Khattab"`.',
        timestamp: 'Just now',
      };

      setMessages((prev) => [...prev, userDisplayMsg, initialAssistantMsg]);

      if (!target) {
        setIsStreaming(false);
        return;
      }

      try {
        const sumCard = await summarizeItem(
          workspaceId,
          target,
          targetConvId || undefined,
          text
        );
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: `Here is the structured summary of **${sumCard.targetTitle}**:`,
                  summaryCard: sumCard,
                }
              : m
          )
        );
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Item could not be summarized.';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: `Could not summarize "${target}".`, error: errMsg }
              : m
          )
        );
      } finally {
        setIsStreaming(false);
      }
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Slash Command Execution: /search <query> (Internal Agent Operation)
    // ─────────────────────────────────────────────────────────────────────────
    if (text.startsWith('/search')) {
      const rawQuery = text.replace(/^\/search\s*/i, '').trim();
      const query = rawQuery.replace(/^["']|["']$/g, '');

      const userMsgId = `user-${Date.now()}`;
      const userDisplayMsg: LocalDisplayMessage = {
        id: userMsgId,
        role: 'user',
        content: text,
        timestamp: 'Just now',
      };

      const assistantMsgId = `assistant-${Date.now()}`;
      const initialAssistantMsg: LocalDisplayMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: query
          ? `Searching workspace for **"${query}"**...`
          : 'Please provide a search query, e.g. `/search renaissance instruments`.',
        timestamp: 'Just now',
      };

      setMessages((prev) => [...prev, userDisplayMsg, initialAssistantMsg]);

      if (!query) {
        setIsStreaming(false);
        return;
      }

      try {
        const searchResults = await executeStellaSearch(
          workspaceId,
          query,
          10,
          targetConvId || undefined,
          text
        );
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: `Search completed across workspace for **"${query}"**:`,
                  searchResults,
                }
              : m
          )
        );
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Search failed.';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: 'Search failed.', error: errMsg }
              : m
          )
        );
      } finally {
        setIsStreaming(false);
      }
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Slash Command Execution: /add-to-collection <item> <collection> (Internal Agent Operation)
    // ─────────────────────────────────────────────────────────────────────────
    if (text.startsWith('/add-to-collection')) {
      const rawArgs = text.replace(/^\/add-to-collection\s*/i, '').trim();
      const userMsgId = `user-${Date.now()}`;
      const userDisplayMsg: LocalDisplayMessage = {
        id: userMsgId,
        role: 'user',
        content: text,
        timestamp: 'Just now',
      };

      const assistantMsgId = `assistant-${Date.now()}`;

      // Parse either quoted tokens or space separated tokens
      const argTokens: string[] = [];
      const tokenRegex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
      let tokenMatch;
      while ((tokenMatch = tokenRegex.exec(rawArgs)) !== null) {
        argTokens.push(tokenMatch[1] ?? tokenMatch[2] ?? tokenMatch[0]);
      }

      const itemArg = argTokens[0]?.trim();
      const collArg = argTokens[1]?.trim();

      if (!itemArg || !collArg) {
        const initialAssistantMsg: LocalDisplayMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content:
            'Please specify both the item and destination collection:\n\n' +
            '`/add-to-collection "<item>" "<collection>"`\n\n' +
            'Use the suggestion menu to select from eligible workspace resources.',
          timestamp: 'Just now',
        };
        setMessages((prev) => [...prev, userDisplayMsg, initialAssistantMsg]);
        setIsStreaming(false);
        return;
      }

      const initialAssistantMsg: LocalDisplayMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: `Preparing proposal to add **${itemArg}** to **${collArg}**...`,
        timestamp: 'Just now',
      };
      setMessages((prev) => [...prev, userDisplayMsg, initialAssistantMsg]);

      try {
        const [itemSuggestions, collSuggestions] = await Promise.all([
          getCommandSuggestions(workspaceId, '/add-to-collection', itemArg, 5, 0),
          getCommandSuggestions(workspaceId, '/add-to-collection', collArg, 5, 1),
        ]);

        const chosenItem =
          itemSuggestions.find(
            (it) => it.title.toLowerCase() === itemArg.toLowerCase() || it.id === itemArg
          ) || itemSuggestions[0];

        const chosenColl =
          collSuggestions.find(
            (c) => c.title.toLowerCase() === collArg.toLowerCase() || c.id === collArg
          ) || collSuggestions[0];

        if (!chosenItem) {
          throw new Error(`Could not find workspace item matching "${itemArg}".`);
        }
        if (!chosenColl) {
          throw new Error(`Could not find workspace collection matching "${collArg}".`);
        }

        const proposal = await stageAddToCollection(
          workspaceId,
          chosenItem.id,
          chosenItem.item_type || 'note',
          chosenColl.id,
          targetConvId || undefined,
          text
        );

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: `Staged proposal to add **${proposal.itemTitle}** to collection **${proposal.collectionName}**:`,
                  addToCollectionProposal: proposal,
                }
              : m
          )
        );
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Failed to stage collection proposal.';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: 'Could not create collection proposal.', error: errMsg }
              : m
          )
        );
      } finally {
        setIsStreaming(false);
      }
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Generic Slash Command Execution Engine (All CRUD Actions)
    // ─────────────────────────────────────────────────────────────────────────
    if (text.startsWith('/')) {
      const userMsgId = `user-${Date.now()}`;
      const userDisplayMsg: LocalDisplayMessage = {
        id: userMsgId,
        role: 'user',
        content: text,
        timestamp: 'Just now',
      };

      const assistantMsgId = `assistant-${Date.now()}`;
      const initialAssistantMsg: LocalDisplayMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: 'Executing workspace action...',
        timestamp: 'Just now',
      };

      setMessages((prev) => [...prev, userDisplayMsg, initialAssistantMsg]);

      // Tokenize args preserving quotes
      const argTokens: string[] = [];
      const tokenRegex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
      let tokenMatch;
      while ((tokenMatch = tokenRegex.exec(text)) !== null) {
        argTokens.push(tokenMatch[1] ?? tokenMatch[2] ?? tokenMatch[0]);
      }
      const command = argTokens[0]?.toLowerCase() || text.split(' ')[0].toLowerCase();
      const args = argTokens.slice(1);

      try {
        const res = await executeStellaCommand(workspaceId, {
          command,
          args,
          conversation_id: targetConvId || undefined,
          prompt: text,
        });

        if (res.status === 'coming_soon') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: res.message,
                  }
                : m
            )
          );
        } else if (res.requires_confirmation && res.proposal_id) {
          const commandName =
            command.slice(1).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content:
                      res.message ||
                      `I have prepared a proposal for **${commandName}**. Please confirm to execute.`,
                    genericProposal: {
                      proposalId: res.proposal_id!,
                      confirmationToken: res.confirmation_token || '',
                      actionId: res.action_id,
                      command,
                      commandName,
                      message: res.message,
                      status: 'preview',
                      data: res.data,
                      affectedItemIds: res.affected_item_ids,
                    },
                  }
                : m
            )
          );
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: res.message,
                    genericResult: {
                      command,
                      actionId: res.action_id,
                      message: res.message,
                      status: 'completed',
                      data: res.data,
                    },
                  }
                : m
            )
          );

          if (command === '/new-conversation' && res.data?.conversation_id) {
            await fetchConversations(workspaceId);
            await selectConversation(res.data.conversation_id);
          } else if (command === '/rename-conversation' && targetConvId) {
            await fetchConversations(workspaceId);
          } else if (command === '/delete-conversation' && targetConvId) {
            await deleteConversationById(targetConvId);
          }
        }
      } catch (err: unknown) {
        const apiErr = err as { error?: { message?: string } } | Error;
        const errMsg =
          (apiErr as { error?: { message?: string } })?.error?.message ||
          (err instanceof Error ? err.message : 'Command execution failed.');
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: `Failed to execute ${command}.`,
                  error: errMsg,
                }
              : m
          )
        );
      } finally {
        setIsStreaming(false);
      }
      return;
    }

    const promptToSend = text;

    const userMsgId = `user-${Date.now()}`;
    const userDisplayMsg: LocalDisplayMessage = {
      id: userMsgId,
      role: 'user',
      content: text,
      timestamp: 'Just now',
    };

    const assistantMsgId = `assistant-${Date.now()}`;
    const initialAssistantMsg: LocalDisplayMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: 'Just now',
    };

    setMessages((prev) => [...prev, userDisplayMsg, initialAssistantMsg]);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let accumulatedContent = '';
    const gatheredCitations: CitedSourceItem[] = [];

    try {
      await streamAssistantResponse(
        targetConvId,
        promptToSend,
        (event) => {
          if (event.type === 'chunk' && event.content) {
            accumulatedContent += event.content;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, content: accumulatedContent } : m
              )
            );
          } else if (event.type === 'done') {
            const cites: CitedSourceItem[] = (event.citations || []).map((c: MessageCitation) => ({
              chunk_id: c.chunk_id,
              note_id: c.note_id,
              source_id: c.source_id,
              title: c.source_title || c.note_title || c.title || 'Referenced Source',
              excerpt: c.excerpt || '',
              score: c.similarity_score || 0.8,
            }));

            gatheredCitations.push(...cites);
            setActiveCitations(cites);
            if (cites.length > 0) {
              setIsEvidenceOpen(true);
            }

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content:
                        accumulatedContent ||
                        'Stella retrieved knowledge citations, but no text response was synthesized.',
                      citations: cites,
                      latencyMs: event.latency_ms,
                      model: event.model || event.provider,
                    }
                  : m
              )
            );
          } else if (event.type === 'error') {
            throw new Error(event.message || 'Error occurred during streaming.');
          }
        },
        (err) => {
          throw err;
        },
        abortController.signal
      );
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: accumulatedContent
                    ? `${accumulatedContent}\n\n*[Inquiry generation stopped by user]*`
                    : '*[Inquiry generation stopped by user]*',
                }
              : m
          )
        );
      } else {
        const errorMsg =
          err instanceof Error
            ? err.message
            : 'Failed to communicate with the assistant reasoning service.';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: accumulatedContent || 'An error interrupted the scholarly inquiry response.',
                  error: errorMsg,
                }
              : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [activeConversationId, isStreaming]);

  // Save note proposal into persistent database record
  const saveNoteDraft = useCallback(
    async (msgId: string, revisedTitle?: string, revisedContent?: string) => {
      const msg = messages.find((m) => m.id === msgId);
      if (!msg || !msg.noteDraft || !currentWorkspaceIdRef.current) return;
      const draft = msg.noteDraft;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.noteDraft
            ? { ...m, noteDraft: { ...m.noteDraft, status: 'committing' } }
            : m
        )
      );

      try {
        const commitRes = await commitNoteDraft(
          currentWorkspaceIdRef.current,
          draft.proposalId,
          draft.confirmationToken,
          revisedTitle || draft.title,
          revisedContent !== undefined ? revisedContent : draft.content,
          activeConversationId || undefined
        );

        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId && m.noteDraft
              ? {
                  ...m,
                  noteDraft: {
                    ...m.noteDraft,
                    status: 'committed',
                    savedNoteId: commitRes.note_id,
                    title: commitRes.title,
                    content: revisedContent !== undefined ? revisedContent : m.noteDraft.content,
                    wordCount: commitRes.word_count,
                    savedAt: 'Just now',
                  },
                }
              : m
          )
        );
      } catch (err: unknown) {
        const errorMsg =
          err instanceof Error ? err.message : 'Failed to save note to knowledge base.';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId && m.noteDraft
              ? {
                  ...m,
                  noteDraft: { ...m.noteDraft, status: 'preview' },
                  error: errorMsg,
                }
              : m
          )
        );
      }
    },
    [activeConversationId, messages]
  );

  // Regenerate note draft with a fresh synthesis
  const regenerateNoteDraft = useCallback(
    async (msgId: string) => {
      const msg = messages.find((m) => m.id === msgId);
      if (!msg || !msg.noteDraft || !currentWorkspaceIdRef.current) return;
      const draft = msg.noteDraft;

      // Cancel old proposal asynchronously
      cancelNoteDraft(currentWorkspaceIdRef.current, draft.proposalId).catch(() => {});

      try {
        const draftRes = await createNoteDraft(
          currentWorkspaceIdRef.current,
          draft.topic,
          activeConversationId || undefined
        );

        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId && m.noteDraft
              ? {
                  ...m,
                  content: `I've regenerated the draft note on **${draft.topic}**. Here is a preview:`,
                  noteDraft: {
                    proposalId: draftRes.proposal_id,
                    confirmationToken: draftRes.confirmation_token,
                    actionId: draftRes.action_id,
                    title: draftRes.title,
                    content: draftRes.content,
                    wordCount: draftRes.word_count,
                    status: 'preview',
                    topic: draft.topic,
                  },
                }
              : m
          )
        );
      } catch (err: unknown) {
        const errorMsg =
          err instanceof Error ? err.message : 'Failed to regenerate note draft.';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, error: errorMsg }
              : m
          )
        );
      }
    },
    [activeConversationId, messages]
  );

  // Cancel / reject note draft proposal
  const cancelNoteDraftAction = useCallback(
    async (msgId: string) => {
      const msg = messages.find((m) => m.id === msgId);
      if (!msg || !msg.noteDraft || !currentWorkspaceIdRef.current) return;
      const draft = msg.noteDraft;

      cancelNoteDraft(currentWorkspaceIdRef.current, draft.proposalId).catch(() => {});

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.noteDraft
            ? {
                ...m,
                noteDraft: { ...m.noteDraft, status: 'cancelled' },
                content: `Draft creation for **${draft.topic}** was cancelled.`,
              }
            : m
        )
      );
    },
    [messages]
  );

  const confirmAddToCollection = useCallback(
    async (msgId: string) => {
      const msg = messages.find((m) => m.id === msgId);
      if (!msg || !msg.addToCollectionProposal) return;
      const proposal = msg.addToCollectionProposal;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.addToCollectionProposal
            ? {
                ...m,
                addToCollectionProposal: {
                  ...m.addToCollectionProposal,
                  status: 'committing' as const,
                },
              }
            : m
        )
      );

      try {
        await commitAddToCollection(
          currentWorkspaceIdRef.current,
          proposal.proposalId,
          proposal.confirmationToken,
          activeConversationId || undefined
        );
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId && m.addToCollectionProposal
              ? {
                  ...m,
                  content: `Successfully added **${proposal.itemTitle}** to collection **${proposal.collectionName}**!`,
                  addToCollectionProposal: {
                    ...m.addToCollectionProposal,
                    status: 'committed' as const,
                  },
                }
              : m
          )
        );
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Failed to commit collection addition.';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId && m.addToCollectionProposal
              ? {
                  ...m,
                  error: errMsg,
                  addToCollectionProposal: {
                    ...m.addToCollectionProposal,
                    status: 'preview' as const,
                  },
                }
              : m
          )
        );
      }
    },
    [activeConversationId, messages]
  );

  const cancelAddToCollection = useCallback(
    (msgId: string) => {
      const msg = messages.find((m) => m.id === msgId);
      if (msg?.addToCollectionProposal && currentWorkspaceIdRef.current) {
        cancelNoteDraft(
          currentWorkspaceIdRef.current,
          msg.addToCollectionProposal.proposalId
        ).catch(() => {});
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.addToCollectionProposal
            ? {
                ...m,
                content: `Cancelled adding **${m.addToCollectionProposal.itemTitle}** to collection.`,
                addToCollectionProposal: {
                  ...m.addToCollectionProposal,
                  status: 'cancelled' as const,
                },
              }
            : m
        )
      );
    },
    [messages]
  );

  const confirmGenericProposal = useCallback(
    async (msgId: string, overrides?: Record<string, any>) => {
      const msg = messages.find((m) => m.id === msgId);
      if (!msg || !msg.genericProposal || !currentWorkspaceIdRef.current) return;
      const proposal = msg.genericProposal;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.genericProposal
            ? {
                ...m,
                genericProposal: {
                  ...m.genericProposal,
                  status: 'committing' as const,
                },
              }
            : m
        )
      );

      try {
        const res = await executeStellaCommand(currentWorkspaceIdRef.current, {
          command: proposal.command,
          proposal_id: proposal.proposalId,
          confirmation_token: proposal.confirmationToken,
          parameters: overrides,
          conversation_id: activeConversationId || undefined,
        });

        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId && m.genericProposal
              ? {
                  ...m,
                  content: res.message || `Successfully committed **${proposal.commandName}**!`,
                  genericProposal: {
                    ...m.genericProposal,
                    status: 'committed' as const,
                    data: { ...(m.genericProposal.data || {}), ...(overrides || {}), ...(res.data || {}) },
                  },
                }
              : m
          )
        );

        if (proposal.command === '/delete-conversation' && activeConversationId) {
          await deleteConversationById(activeConversationId);
        } else if (
          proposal.command.includes('collection') ||
          proposal.command.includes('conversation') ||
          proposal.command === '/organize-knowledge'
        ) {
          await fetchConversations(currentWorkspaceIdRef.current);
        }
      } catch (err: unknown) {
        const apiErr = err as { error?: { message?: string } } | Error;
        const errMsg =
          (apiErr as { error?: { message?: string } })?.error?.message ||
          (err instanceof Error ? err.message : 'Failed to commit action proposal.');
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId && m.genericProposal
              ? {
                  ...m,
                  error: errMsg,
                  genericProposal: {
                    ...m.genericProposal,
                    status: 'preview' as const,
                  },
                }
              : m
          )
        );
      }
    },
    [activeConversationId, deleteConversationById, fetchConversations, messages]
  );

  const stageOrganizationRecommendation = useCallback(
    async (msgId: string, recommendationPayload: Record<string, any>) => {
      if (!currentWorkspaceIdRef.current) return;

      try {
        const res = await executeStellaCommand(currentWorkspaceIdRef.current, {
          command: '/organize-knowledge',
          parameters: { apply_recommendation: recommendationPayload },
          conversation_id: activeConversationId || undefined,
        });

        if (res.requires_confirmation && res.proposal_id) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? {
                    ...m,
                    genericProposal: {
                      proposalId: res.proposal_id!,
                      confirmationToken: res.confirmation_token || '',
                      actionId: res.action_id,
                      command: '/organize-knowledge',
                      commandName: 'Organize Knowledge',
                      message: res.message,
                      status: 'preview' as const,
                      data: res.data,
                      affectedItemIds: res.affected_item_ids,
                    },
                  }
                : m
            )
          );
        }
      } catch (err: unknown) {
        const apiErr = err as { error?: { message?: string } } | Error;
        const errMsg =
          (apiErr as { error?: { message?: string } })?.error?.message ||
          (err instanceof Error ? err.message : 'Failed to stage organization proposal.');
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, error: errMsg } : m))
        );
      }
    },
    [activeConversationId]
  );

  const cancelGenericProposal = useCallback(
    (msgId: string) => {
      const msg = messages.find((m) => m.id === msgId);
      if (msg?.genericProposal && currentWorkspaceIdRef.current) {
        cancelNoteDraft(currentWorkspaceIdRef.current, msg.genericProposal.proposalId).catch(
          () => {}
        );
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.genericProposal
            ? {
                ...m,
                content: `Cancelled ${m.genericProposal.commandName || m.genericProposal.command}.`,
                genericProposal: {
                  ...m.genericProposal,
                  status: 'cancelled' as const,
                },
              }
            : m
        )
      );
    },
    [messages]
  );

  const connectNotesInSuggestion = useCallback(
    async (msgId: string, sourceNoteId: string, targetNoteId: string) => {
      if (!currentWorkspaceIdRef.current) return;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.linkNotesResults
            ? {
                ...m,
                linkNotesResults: {
                  ...m.linkNotesResults,
                  candidates: m.linkNotesResults.candidates.map((c) =>
                    c.noteId === targetNoteId ? { ...c, connectionStatus: 'connecting' as const } : c
                  ),
                },
              }
            : m
        )
      );

      try {
        const res = await connectStellaNoteLink(
          currentWorkspaceIdRef.current,
          sourceNoteId,
          targetNoteId,
          activeConversationId || undefined
        );
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId && m.linkNotesResults
              ? {
                  ...m,
                  linkNotesResults: {
                    ...m.linkNotesResults,
                    summary: res.message || m.linkNotesResults.summary,
                    candidates: m.linkNotesResults.candidates.map((c) =>
                      c.noteId === targetNoteId
                        ? { ...c, alreadyLinked: true, connectionStatus: 'connected' as const }
                        : c
                    ),
                  },
                }
              : m
          )
        );
      } catch (err: unknown) {
        const apiErr = err as { error?: { message?: string } } | Error;
        const errMsg =
          (apiErr as { error?: { message?: string } })?.error?.message ||
          (err instanceof Error ? err.message : 'Failed to connect notes.');
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId && m.linkNotesResults
              ? {
                  ...m,
                  error: errMsg,
                  linkNotesResults: {
                    ...m.linkNotesResults,
                    candidates: m.linkNotesResults.candidates.map((c) =>
                      c.noteId === targetNoteId ? { ...c, connectionStatus: 'error' as const } : c
                    ),
                  },
                }
              : m
          )
        );
      }
    },
    [activeConversationId]
  );

  return (
    <StellaSessionContext.Provider
      value={{
        conversations,
        activeConversationId,
        messages,
        isStreaming,
        isLoadingConversations,
        isLoadingMessages,
        activeCitations,
        setActiveCitations,
        isEvidenceOpen,
        activeScope,
        inputPrompt,
        setInputPrompt,
        setActiveScope,
        setIsEvidenceOpen,
        fetchConversations,
        selectConversation,
        sendMessage,
        cancelGeneration,
        newChat,
        deleteConversationById,
        saveNoteDraft,
        regenerateNoteDraft,
        cancelNoteDraftAction,
        confirmAddToCollection,
        cancelAddToCollection,
        confirmGenericProposal,
        cancelGenericProposal,
        stageOrganizationRecommendation,
        connectNotesInSuggestion,
      }}
    >
      {children}
    </StellaSessionContext.Provider>
  );
};

export function useStellaSession() {
  const context = useContext(StellaSessionContext);
  if (!context) {
    throw new Error('useStellaSession must be used within a StellaSessionProvider');
  }
  return context;
}
