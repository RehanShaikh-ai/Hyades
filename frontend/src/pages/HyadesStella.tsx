import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { getRAGStatus } from '@/api/rag';
import { getWorkspaceGraph } from '@/api/graph';
import { renderMarkdown } from '@/lib/markdown';
import { GraphResponse, ObservatoryTarget } from '@/types/graph';
import { StellaContext } from '@/types/navigation';
import { RAGStatusResponse } from '@/types/rag';
import { useStellaSession } from '@/context/StellaSessionContext';
import { SlashCommand, CommandSuggestionItem } from '@/types/commands';
import { listStellaCommands, getCommandSuggestions } from '@/api/stella_commands';
import { SlashCommandMenu } from '@/components/assistant/SlashCommandMenu';
import { ArgumentSuggestionsMenu } from '@/components/assistant/ArgumentSuggestionsMenu';
import { InChatNotePreview } from '@/components/assistant/InChatNotePreview';
import { InChatSavedNoteCard } from '@/components/assistant/InChatSavedNoteCard';
import { InChatSummaryCard } from '@/components/assistant/InChatSummaryCard';
import { InChatSearchResultsCard } from '@/components/assistant/InChatSearchResultsCard';
import { InChatInboxReviewCard } from '@/components/assistant/InChatInboxReviewCard';
import { InChatAddToCollectionProposalCard } from '@/components/assistant/InChatAddToCollectionProposalCard';
import { InChatLinkSuggestionsCard } from '@/components/assistant/InChatLinkSuggestionsCard';
import { InChatActionProposalCard } from '@/components/assistant/InChatActionProposalCard';
import { InChatActionResultCard } from '@/components/assistant/InChatActionResultCard';
import { ArtifactPreviewDrawer, ArtifactPreviewData } from '@/components/assistant/ArtifactPreviewDrawer';
import { FileText } from 'lucide-react';
import stellaStudiolum from '@/assets/plates/stella-studiolum.jpg';

interface HyadesStellaProps {
  workspaceId: string;
  initialQuery?: string;
  initialContext?: StellaContext | null;
  onNavigateToObservatory?: (target?: ObservatoryTarget) => void;
  onNavigateToLibrary?: () => void;
  onNavigateToNote?: (noteId: string) => void;
  onNavigateToCollections?: () => void;
  onNavigateToThreads?: () => void;
  environmentIndex?: number;
}

export const HyadesStella: React.FC<HyadesStellaProps> = ({
  workspaceId,
  initialQuery,
  initialContext,
  onNavigateToObservatory,
  onNavigateToLibrary,
  onNavigateToNote,
  onNavigateToCollections,
  onNavigateToThreads,
}) => {
  const {
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
  } = useStellaSession();

  const [isInquiriesOpen, setIsInquiriesOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [activeArtifactPreview, setActiveArtifactPreview] = useState<ArtifactPreviewData | null>(null);

  // Workspace metadata & Scope
  const [selectedModel, setSelectedModel] = useState('auto');
  const [ragStatus, setRagStatus] = useState<RAGStatusResponse | null>(null);
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);

  const dialogueContainerRef = useRef<HTMLDivElement>(null);

  // Slash Command Autocomplete State
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([]);
  const [dismissedSlashMenu, setDismissedSlashMenu] = useState(false);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);

  useEffect(() => {
    if (!workspaceId) return;
    listStellaCommands(workspaceId).then((cmds) => setSlashCommands(cmds));
  }, [workspaceId]);

  useEffect(() => {
    if (!inputPrompt.startsWith('/')) {
      setDismissedSlashMenu(false);
      setSlashSelectedIndex(0);
    }
  }, [inputPrompt]);

  const showSlashMenu =
    inputPrompt.startsWith('/') && !inputPrompt.includes(' ') && !dismissedSlashMenu;
  const slashFilter = inputPrompt.startsWith('/') ? inputPrompt.slice(1) : '';

  const filteredSlashCommands = useMemo(() => {
    const q = slashFilter.toLowerCase();
    return slashCommands.filter(
      (c) =>
        c.availability !== 'internal' &&
        (c.command.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q))
    );
  }, [slashCommands, slashFilter]);

  // Keep selected index within valid filtered bounds when typing / filtering
  useEffect(() => {
    setSlashSelectedIndex((prev) => {
      if (filteredSlashCommands.length === 0) return 0;
      return Math.min(prev, filteredSlashCommands.length - 1);
    });
  }, [filteredSlashCommands.length]);

  const handleSelectSlashCommand = (cmd: SlashCommand) => {
    if (cmd.availability === 'coming_soon' || cmd.execution_type === 'placeholder') {
      setDismissedSlashMenu(true);
      setSlashSelectedIndex(0);
      sendMessage(workspaceId, cmd.command);
      return;
    }
    setInputPrompt(`${cmd.command} `);
    setDismissedSlashMenu(false);
    setSlashSelectedIndex(0);
  };

  const handleSelectExample = (example: string) => {
    const firstToken = example.trim().split(/\s+/)[0].toLowerCase();
    const matchedCmd = slashCommands.find((c) => c.command.toLowerCase() === firstToken);
    if (matchedCmd && (matchedCmd.availability === 'coming_soon' || matchedCmd.execution_type === 'placeholder')) {
      setDismissedSlashMenu(true);
      sendMessage(workspaceId, example);
      return;
    }
    setInputPrompt(example);
    setDismissedSlashMenu(true);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Declarative Resource Argument Suggestions (Callouts 5 & 7)
  // ─────────────────────────────────────────────────────────────────────────
  const [argumentSuggestions, setArgumentSuggestions] = useState<CommandSuggestionItem[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [suggestionsSelectedIndex, setSuggestionsSelectedIndex] = useState(0);
  const [dismissedSuggestions, setDismissedSuggestions] = useState(false);
  const suggestionsDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Find if current input starts with a known slash command followed by a space
  const activeCommandDef = useMemo(() => {
    const trimmed = inputPrompt.trimStart();
    if (!trimmed.startsWith('/')) return null;
    return (
      slashCommands.find(
        (c) => inputPrompt.startsWith(`${c.command} `) || inputPrompt === c.command
      ) || null
    );
  }, [inputPrompt, slashCommands]);

  // Determine active argument index and query from declarative command schema
  const parsedArgState = useMemo(() => {
    if (
      !activeCommandDef ||
      activeCommandDef.availability === 'coming_soon' ||
      activeCommandDef.execution_type === 'placeholder' ||
      !activeCommandDef.arguments ||
      activeCommandDef.arguments.length === 0
    ) {
      return null;
    }
    const rawAfterCmd = inputPrompt.slice(activeCommandDef.command.length);
    if (!rawAfterCmd.startsWith(' ')) {
      return null;
    }
    const afterCmd = rawAfterCmd.slice(1);

    // Tokenize arguments considering quotes
    const tokens: string[] = [];
    const tokenRegex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    let match;
    let lastIndex = 0;
    while ((match = tokenRegex.exec(afterCmd)) !== null) {
      tokens.push(match[1] ?? match[2] ?? match[0]);
      lastIndex = tokenRegex.lastIndex;
    }

    const hasTrailingSpace = afterCmd.endsWith(' ');
    let activeIndex = 0;
    let currentQuery = '';

    const isVariadicMerge = activeCommandDef.command === '/merge-notes';
    if (tokens.length === 0) {
      activeIndex = 0;
      currentQuery = '';
    } else if (
      hasTrailingSpace &&
      (tokens.length < activeCommandDef.arguments.length || isVariadicMerge)
    ) {
      activeIndex = tokens.length;
      currentQuery = '';
    } else {
      activeIndex = Math.max(0, tokens.length - 1);
      currentQuery = afterCmd.slice(lastIndex).trim() || tokens[activeIndex] || '';
    }

    if (activeIndex >= activeCommandDef.arguments.length && !isVariadicMerge) {
      return null;
    }

    const currentArgDef =
      activeCommandDef.arguments[activeIndex] ||
      activeCommandDef.arguments[activeCommandDef.arguments.length - 1];
    return {
      command: activeCommandDef.command,
      argIndex: activeIndex,
      argDef: currentArgDef,
      query: currentQuery,
      tokens,
    };
  }, [activeCommandDef, inputPrompt]);

  const showArgumentMenu =
    Boolean(parsedArgState && parsedArgState.argDef.arg_type === 'resource') &&
    !dismissedSuggestions;

  useEffect(() => {
    if (!parsedArgState) {
      setDismissedSuggestions(false);
      setSuggestionsSelectedIndex(0);
    }
  }, [parsedArgState]);

  useEffect(() => {
    if (
      !parsedArgState ||
      parsedArgState.argDef.arg_type !== 'resource' ||
      dismissedSuggestions
    ) {
      setArgumentSuggestions([]);
      return;
    }
    if (suggestionsDebounceRef.current) {
      clearTimeout(suggestionsDebounceRef.current);
    }
    setIsSuggestionsLoading(true);
    suggestionsDebounceRef.current = setTimeout(async () => {
      try {
        const items = await getCommandSuggestions(
          workspaceId,
          parsedArgState.command,
          parsedArgState.query,
          8,
          parsedArgState.argIndex
        );
        const priorSelected = new Set(
          parsedArgState.command === '/merge-notes'
            ? parsedArgState.tokens
                .slice(0, parsedArgState.argIndex)
                .map((t) => t.trim().toLowerCase())
            : []
        );
        const filteredItems =
          priorSelected.size > 0
            ? items.filter(
                (it) =>
                  !priorSelected.has(it.title.trim().toLowerCase()) &&
                  !priorSelected.has(it.id.trim().toLowerCase())
              )
            : items;
        setArgumentSuggestions(filteredItems);
        setSuggestionsSelectedIndex(0);
      } catch {
        setArgumentSuggestions([]);
      } finally {
        setIsSuggestionsLoading(false);
      }
    }, 150);

    return () => {
      if (suggestionsDebounceRef.current) {
        clearTimeout(suggestionsDebounceRef.current);
      }
    };
  }, [parsedArgState, workspaceId, dismissedSuggestions]);

  const handleSelectSuggestion = (item: CommandSuggestionItem) => {
    if (!parsedArgState || !activeCommandDef) return;
    const { command, argIndex, tokens } = parsedArgState;
    const title = item.title;

    if (argIndex === 0) {
      if (activeCommandDef.arguments && activeCommandDef.arguments.length > 1) {
        // Multi-argument command (e.g. /add-to-collection, /merge-notes)
        setInputPrompt(`${command} "${title}" `);
        setDismissedSuggestions(false);
      } else {
        // Single argument command (e.g. /summarize, /link-notes)
        setInputPrompt(`${command} "${title}"`);
        setDismissedSuggestions(true);
      }
    } else {
      // Second or subsequent argument (e.g. collection in /add-to-collection or additional notes in /merge-notes)
      const priorArgs = tokens
        .slice(0, argIndex)
        .map((t) => `"${t}"`)
        .join(' ');
      setInputPrompt(`${command} ${priorArgs} "${title}"`);
      setDismissedSuggestions(true);
    }
  };

  // Group conversations into Today, Yesterday, Earlier (Callout 1)
  const groupedConversations = useMemo(() => {
    const today: typeof conversations = [];
    const yesterday: typeof conversations = [];
    const earlier: typeof conversations = [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);

    for (const conv of conversations) {
      const dt = conv.updated_at ? new Date(conv.updated_at) : new Date(conv.created_at);
      if (dt >= startOfToday) {
        today.push(conv);
      } else if (dt >= startOfYesterday) {
        yesterday.push(conv);
      } else {
        earlier.push(conv);
      }
    }

    return { today, yesterday, earlier };
  }, [conversations]);


  // Handle Escape key to cancel delete confirmation dialog
  useEffect(() => {
    if (!deleteConfirmId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setDeleteConfirmId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [deleteConfirmId]);

  // Auto-scroll on new message
  useEffect(() => {
    if (dialogueContainerRef.current) {
      dialogueContainerRef.current.scrollTop = dialogueContainerRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  // Contextual Prompt & Carried Context Handler (§12, §13, §14)
  // Prefills the prompt and structured context for user review, but does NOT auto-submit.
  useEffect(() => {
    if (initialContext) {
      setActiveScope(initialContext);
      if (initialContext.prompt) {
        setInputPrompt(initialContext.prompt);
      }
    } else if (initialQuery) {
      setInputPrompt(initialQuery);
    }
  }, [initialContext, initialQuery, setActiveScope, setInputPrompt]);

  // Fetch workspace scope statistics & graph
  const fetchWorkspaceContext = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const [graphResp, statusData] = await Promise.all([
        getWorkspaceGraph(workspaceId).catch(() => null),
        getRAGStatus(workspaceId).catch(() => null),
      ]);
      if (graphResp) setGraphData(graphResp);
      if (statusData) {
        setRagStatus(statusData);
        if (statusData.current_model) {
          setSelectedModel(statusData.current_model);
        }
      }
    } catch {
      // Gracefully maintain state
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchWorkspaceContext();
  }, [fetchWorkspaceContext]);

  useEffect(() => {
    fetchConversations(workspaceId);
  }, [workspaceId, fetchConversations]);

  // Suggested inquiries derived from actual workspace entities
  const suggestedInquiries = useMemo(() => {
    if (!graphData || graphData.nodes.length === 0) {
      return [
        'What are the primary themes in my active notes?',
        'Which concepts are currently isolated without connections?',
      ];
    }
    const nodes = graphData.nodes;
    const suggestions: string[] = [];
    if (nodes[0]) {
      suggestions.push(`What does my knowledge base say about ${nodes[0].name}?`);
    }
    if (nodes[0] && nodes[1]) {
      suggestions.push(`How do ${nodes[0].name} and ${nodes[1].name} connect in my research?`);
    }
    if (nodes.length > 2) {
      suggestions.push(
        `Synthesize the relationships between ${nodes
          .slice(0, 3)
          .map((n) => n.name)
          .join(', ')}.`
      );
    }
    return suggestions;
  }, [graphData]);

  // Compute RESTRAINED and genuinely relevant Grounded Concepts for an assistant message
  // Strict rule: Only include concepts mentioned in the user query or assistant answer!
  const getRelevantGroundedConcepts = useCallback(
    (messageContent: string, priorUserQuery?: string): string[] => {
      if (!graphData || !graphData.nodes || graphData.nodes.length === 0) return [];
      const contentLower = messageContent.toLowerCase();
      const queryLower = (priorUserQuery || '').toLowerCase();

      const matched: string[] = [];
      for (const node of graphData.nodes) {
        const nameLower = node.name.toLowerCase();
        // Ignore single/two letter names to prevent false substring matches
        if (nameLower.length < 3) continue;
        if (contentLower.includes(nameLower) || queryLower.includes(nameLower)) {
          matched.push(node.name);
          if (matched.length >= 5) break; // Restrain to at most 5 relevant concepts
        }
      }
      return matched;
    },
    [graphData]
  );

  // New Chat action: Creates a fresh clean session without submitting anything
  const handleNewChat = useCallback(() => {
    newChat();
  }, [newChat]);

  // Delete Conversation action with CASCADE cleanup
  const handleDeleteConversation = useCallback(
    async (convId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await deleteConversationById(convId);
      setDeleteConfirmId(null);
    },
    [deleteConversationById]
  );

  // Send Message: Delegate to persistent session store (survives page switching)
  const handleSendMessage = useCallback(
    async (textToSend?: string) => {
      const userText = textToSend !== undefined ? textToSend : inputPrompt;
      await sendMessage(workspaceId, userText);
    },
    [inputPrompt, sendMessage, workspaceId]
  );

  // Active conversation title for the masthead
  const currentConversation = conversations.find((c) => c.id === activeConversationId);
  const activeTitle = currentConversation?.title || initialQuery || 'Knowledge Inquiry';

  return (
    <div className="relative flex flex-col h-[calc(100vh-57px)] overflow-hidden text-[13px] leading-relaxed">
      {/* Archival paper grain texture */}
      <div className="paper-grain" />

      {/* Background Intimate Study Desk Environment */}
      <div className="study-environment">
        <div
          className="study-plate"
          style={{ backgroundImage: `url(${stellaStudiolum})` }}
        />
        <div className="ambient-candlelamp" />
      </div>

      {/* Persistent Reopen Inquiries Edge Tab */}
      {!isInquiriesOpen && (
        <div className="fixed top-20 left-0 z-30 pointer-events-auto">
          <button
            type="button"
            onClick={() => setIsInquiriesOpen(true)}
            aria-label="Open Research Inquiries"
            className="bg-[var(--bg-panel)]/95 hover:bg-white backdrop-blur-md border border-l-0 border-[var(--border-strong)] rounded-r-xl shadow-md py-2 px-3 flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)] transition-all active:scale-95 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] cursor-pointer"
            title="Open Research Inquiries"
          >
            <i className="ph ph-chat-teardrop-text text-sm text-[var(--accent-midnight)] group-hover:scale-110 transition-transform" />
            <span className="serif-italic font-medium">Inquiries</span>
          </button>
        </div>
      )}

      {/* Persistent Reopen Evidence Edge Tab */}
      {!isEvidenceOpen && !activeArtifactPreview && (
        <div className="fixed top-20 right-0 z-30 pointer-events-auto">
          <button
            type="button"
            onClick={() => setIsEvidenceOpen(true)}
            aria-label="Open Sources in Context"
            className="bg-[var(--bg-panel)]/95 hover:bg-white backdrop-blur-md border border-r-0 border-[var(--border-strong)] rounded-l-xl shadow-md py-2 px-3 flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)] transition-all active:scale-95 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] cursor-pointer"
            title="Open Sources in Context"
          >
            <span className="serif-italic font-medium">Sources in Context</span>
            <i className="ph ph-book-bookmark text-sm text-[var(--accent-midnight)] group-hover:scale-110 transition-transform" />
          </button>
        </div>
      )}

      {/* ================= MAIN WORKSPACE: 3-COLUMN RESEARCH STUDY ================= */}
      <main className="relative z-10 flex-1 w-full max-w-[1720px] mx-auto px-4 py-3 md:px-8 md:py-5 flex gap-4 md:gap-6 overflow-hidden min-h-0">
        {/* ================= LEFT COLUMN: INQUIRY THREADS & CONTEXT (280px) ================= */}
        {isInquiriesOpen && (
          <aside className="fixed inset-y-16 left-0 z-20 w-[280px] sm:w-[320px] lg:static lg:w-[280px] lg:h-full shrink-0 flex flex-col gap-4 transition-all duration-300 shadow-2xl lg:shadow-none bg-[var(--bg-base)]/95 lg:bg-transparent backdrop-blur-md lg:backdrop-blur-none p-3 lg:p-0">
            {/* Header / New Chat Trigger */}
            <div className="instrument-panel p-3 flex flex-col gap-2.5">
              <div className="panel-bracket-tl" />
              <div className="panel-bracket-br" />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="ph ph-sparkle text-sm text-[var(--accent-midnight)]" />
                  <span className="serif-italic text-sm font-semibold text-[var(--ink-primary)]">
                    Stella Inquiries
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsInquiriesOpen(false)}
                  aria-label="Collapse Inquiries Panel"
                  className="w-6 h-6 rounded flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)]"
                  title="Collapse Inquiries Panel"
                >
                  <i className="ph ph-caret-left text-sm" />
                </button>
              </div>

              {/* + New Chat Button (Approved Hyades Styling) */}
              <button
                type="button"
                onClick={handleNewChat}
                className="w-full py-1.5 px-3 rounded-lg bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] text-xs font-medium flex items-center justify-center gap-2 shadow-2xs transition-all active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)]"
              >
                <i className="ph ph-plus text-xs text-[var(--accent-brass)]" />
                <span> New Chat</span>
              </button>
            </div>

            {/* Conversation Threads List */}
            <div className="instrument-panel p-3 flex-1 flex flex-col gap-2 min-h-0">
              <div className="panel-bracket-tl" />
              <div className="panel-bracket-br" />

              <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border-parchment)]">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-secondary)]">
                  Conversations ({conversations.length})
                </span>
                {isLoadingConversations && (
                  <i className="ph ph-spinner animate-spin text-xs text-[var(--accent-midnight)]" />
                )}
              </div>

              <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-1 scrollbar-thin">
                {conversations.length > 0 ? (
                  <>
                    {groupedConversations.today.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--ink-tertiary)] px-1 pt-1">
                          Today
                        </span>
                        {groupedConversations.today.map((conv) => {
                          const isActive = conv.id === activeConversationId;
                          const isDeleting = deleteConfirmId === conv.id;
                          const dt = conv.updated_at ? new Date(conv.updated_at) : new Date(conv.created_at);
                          const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                          return (
                            <div
                              key={conv.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                if (activeConversationId !== conv.id) {
                                  selectConversation(conv.id);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  if (activeConversationId !== conv.id) {
                                    selectConversation(conv.id);
                                  }
                                }
                              }}
                              className={`p-2 rounded-lg border transition-all flex items-center justify-between gap-2 cursor-pointer group relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] ${
                                isActive
                                  ? 'bg-white border-[var(--accent-terracotta)] shadow-2xs'
                                  : 'hover:bg-white/80 border-transparent hover:border-[var(--border-parchment)]'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <FileText
                                  size={13}
                                  className={`shrink-0 ${
                                    isActive ? 'text-[var(--accent-terracotta)]' : 'text-[var(--accent-midnight)] opacity-70'
                                  }`}
                                />
                                <span
                                  className={`text-xs font-medium truncate ${
                                    isActive
                                      ? 'text-[var(--ink-primary)] font-semibold'
                                      : 'text-[var(--ink-secondary)] group-hover:text-[var(--ink-primary)]'
                                  }`}
                                >
                                  {conv.title || 'Untitled Research'}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] font-mono text-[var(--ink-tertiary)]">
                                  {timeStr}
                                </span>
                                {isDeleting ? (
                                  <div className="flex items-center gap-1 z-10" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                                      className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-medium hover:bg-red-700 cursor-pointer"
                                      title="Confirm Delete"
                                    >
                                      Delete
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteConfirmId(null);
                                      }}
                                      className="px-1 py-0.5 rounded text-[9px] text-[var(--ink-secondary)] hover:bg-gray-200 cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteConfirmId(conv.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 text-[var(--ink-tertiary)] hover:text-red-600 p-0.5 transition-opacity cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)]"
                                    title="Delete conversation"
                                  >
                                    <i className="ph ph-trash text-xs" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {groupedConversations.yesterday.length > 0 && (
                      <div className="flex flex-col gap-1 pt-1">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--ink-tertiary)] px-1 pt-1">
                          Yesterday
                        </span>
                        {groupedConversations.yesterday.map((conv) => {
                          const isActive = conv.id === activeConversationId;
                          const isDeleting = deleteConfirmId === conv.id;
                          const dt = conv.updated_at ? new Date(conv.updated_at) : new Date(conv.created_at);
                          const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                          return (
                            <div
                              key={conv.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                if (activeConversationId !== conv.id) {
                                  selectConversation(conv.id);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  if (activeConversationId !== conv.id) {
                                    selectConversation(conv.id);
                                  }
                                }
                              }}
                              className={`p-2 rounded-lg border transition-all flex items-center justify-between gap-2 cursor-pointer group relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] ${
                                isActive
                                  ? 'bg-white border-[var(--accent-terracotta)] shadow-2xs'
                                  : 'hover:bg-white/80 border-transparent hover:border-[var(--border-parchment)]'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <FileText
                                  size={13}
                                  className={`shrink-0 ${
                                    isActive ? 'text-[var(--accent-terracotta)]' : 'text-[var(--accent-midnight)] opacity-70'
                                  }`}
                                />
                                <span
                                  className={`text-xs font-medium truncate ${
                                    isActive
                                      ? 'text-[var(--ink-primary)] font-semibold'
                                      : 'text-[var(--ink-secondary)] group-hover:text-[var(--ink-primary)]'
                                  }`}
                                >
                                  {conv.title || 'Untitled Research'}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] font-mono text-[var(--ink-tertiary)]">
                                  {timeStr}
                                </span>
                                {isDeleting ? (
                                  <div className="flex items-center gap-1 z-10" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                                      className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-medium hover:bg-red-700 cursor-pointer"
                                      title="Confirm Delete"
                                    >
                                      Delete
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteConfirmId(null);
                                      }}
                                      className="px-1 py-0.5 rounded text-[9px] text-[var(--ink-secondary)] hover:bg-gray-200 cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteConfirmId(conv.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 text-[var(--ink-tertiary)] hover:text-red-600 p-0.5 transition-opacity cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)]"
                                    title="Delete conversation"
                                  >
                                    <i className="ph ph-trash text-xs" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {groupedConversations.earlier.length > 0 && (
                      <div className="flex flex-col gap-1 pt-1">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--ink-tertiary)] px-1 pt-1">
                          Earlier
                        </span>
                        {groupedConversations.earlier.map((conv) => {
                          const isActive = conv.id === activeConversationId;
                          const isDeleting = deleteConfirmId === conv.id;
                          const dt = conv.updated_at ? new Date(conv.updated_at) : new Date(conv.created_at);
                          const dateStr = dt.toLocaleDateString([], { day: 'numeric', month: 'short' });

                          return (
                            <div
                              key={conv.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                if (activeConversationId !== conv.id) {
                                  selectConversation(conv.id);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  if (activeConversationId !== conv.id) {
                                    selectConversation(conv.id);
                                  }
                                }
                              }}
                              className={`p-2 rounded-lg border transition-all flex items-center justify-between gap-2 cursor-pointer group relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] ${
                                isActive
                                  ? 'bg-white border-[var(--accent-terracotta)] shadow-2xs'
                                  : 'hover:bg-white/80 border-transparent hover:border-[var(--border-parchment)]'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <FileText
                                  size={13}
                                  className={`shrink-0 ${
                                    isActive ? 'text-[var(--accent-terracotta)]' : 'text-[var(--accent-midnight)] opacity-70'
                                  }`}
                                />
                                <span
                                  className={`text-xs font-medium truncate ${
                                    isActive
                                      ? 'text-[var(--ink-primary)] font-semibold'
                                      : 'text-[var(--ink-secondary)] group-hover:text-[var(--ink-primary)]'
                                  }`}
                                >
                                  {conv.title || 'Untitled Research'}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] font-mono text-[var(--ink-tertiary)]">
                                  {dateStr}
                                </span>
                                {isDeleting ? (
                                  <div className="flex items-center gap-1 z-10" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                                      className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-medium hover:bg-red-700 cursor-pointer"
                                      title="Confirm Delete"
                                    >
                                      Delete
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteConfirmId(null);
                                      }}
                                      className="px-1 py-0.5 rounded text-[9px] text-[var(--ink-secondary)] hover:bg-gray-200 cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteConfirmId(conv.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 text-[var(--ink-tertiary)] hover:text-red-600 p-0.5 transition-opacity cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)]"
                                    title="Delete conversation"
                                  >
                                    <i className="ph ph-trash text-xs" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-3 text-center text-xs text-[var(--ink-tertiary)] italic">
                    No prior conversations recorded. Start an inquiry below.
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}

        {/* ================= CENTER: DIALOGUE CANVAS & ANCHORED COMPOSER ================= */}
        <section className="flex-1 flex flex-col min-w-0 h-full min-h-0 relative">
          {/* Conversation Scroll Canvas */}
          <div
            ref={dialogueContainerRef}
            className="flex-1 overflow-y-auto pr-2 pb-6 flex flex-col gap-6"
            id="dialogue-container"
          >
            {/* Dialogue Masthead */}
            <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-3 px-1">
              <div>
                <h1 className="serif text-xl sm:text-2xl font-semibold text-[var(--ink-primary)] tracking-tight">
                  {activeTitle}{' '}
                  <span className="serif-italic font-normal text-[var(--accent-midnight)] text-lg">
                    · Research Thread
                  </span>
                </h1>
              </div>
            </div>

            {/* Loading indicator for messages */}
            {isLoadingMessages && (
              <div className="p-6 text-center text-xs text-[var(--ink-tertiary)] flex items-center justify-center gap-2 italic">
                <i className="ph ph-spinner animate-spin text-sm text-[var(--accent-midnight)]" />
                Loading conversation messages...
              </div>
            )}

            {/* Messages list */}
            {messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              // Find prior user prompt for context matching
              const priorUserPrompt = isUser
                ? undefined
                : messages
                    .slice(0, index)
                    .reverse()
                    .find((m) => m.role === 'user')?.content;

              const relevantConcepts = !isUser
                ? getRelevantGroundedConcepts(
                    `${msg.content} ${msg.genericResult?.data?.scope_examined || ''} ${msg.genericResult?.data?.target_title || ''} ${msg.genericResult?.message || ''}`,
                    priorUserPrompt
                  )
                : [];

              return (
                <div
                  key={msg.id}
                  className={
                    isUser
                      ? 'message-enter flex flex-col items-end gap-1.5 self-end max-w-[85%]'
                      : 'message-enter flex flex-col gap-2 self-start w-full'
                  }
                >
                  {isUser ? (
                    <>
                      <div className="flex items-center gap-2 px-1 text-[11px] text-[var(--ink-tertiary)]">
                        <span className="font-medium text-[var(--ink-secondary)]">You</span>
                        <span>·</span>
                        <span>{msg.timestamp}</span>
                      </div>
                      <div className="user-bubble p-4 text-[13.5px] leading-relaxed text-[var(--ink-primary)]">
                        {msg.content}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 px-1 text-[11.5px] text-[var(--ink-secondary)]">
                        <div className={`w-5 h-5 rounded-full bg-[var(--accent-midnight)] text-[var(--accent-brass)] flex items-center justify-center text-[10px] shadow-2xs ${isStreaming && index === messages.length - 1 ? 'stella-twinkle' : ''}`}>
                          <i className="ph ph-sparkle" />
                        </div>
                        <span className="serif font-semibold text-[13px] text-[var(--accent-midnight)]">
                          Stella
                        </span>
                      </div>

                      <article className="stella-card p-6 md:p-7 text-[13.5px] leading-relaxed text-[var(--ink-primary)] flex flex-col gap-4">
                        {msg.error ? (
                          <div className="p-4 rounded-xl bg-red-50/80 border border-red-200 text-red-800 flex flex-col gap-2">
                            <div className="flex items-center gap-2 font-medium text-xs">
                              <i className="ph ph-warning-circle text-base text-red-600" />
                              <span>
                                {messages[index - 1]?.role === 'user' &&
                                messages[index - 1]?.content?.trim().startsWith('/')
                                  ? 'Command Execution Error'
                                  : 'Assistant Reasoning Error'}
                              </span>
                            </div>
                            <p className="text-xs text-red-700 leading-relaxed">{msg.error}</p>
                            <button
                              type="button"
                              onClick={() => {
                                const lastUser = [...messages]
                                  .reverse()
                                  .find((m) => m.role === 'user');
                                if (lastUser) handleSendMessage(lastUser.content);
                              }}
                              className="self-start mt-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium cursor-pointer transition-colors"
                            >
                              Retry Inquiry
                            </button>
                          </div>
                        ) : (
                          <>
                            {msg.content && (
                              <div
                                className="markdown-body serif text-[15px] leading-relaxed text-[var(--ink-primary)]"
                                dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                              />
                            )}

                            {/* In-Chat Note Action Card (Callout 3 & Callout 4) */}
                            {msg.noteDraft && (
                              msg.noteDraft.status === 'committed' ? (
                                <InChatSavedNoteCard
                                  draft={msg.noteDraft}
                                  onOpenNote={(id) => {
                                    if (onNavigateToNote) {
                                      onNavigateToNote(id);
                                    } else if (onNavigateToLibrary) {
                                      onNavigateToLibrary();
                                    }
                                  }}
                                  onViewInGraph={(id, title) =>
                                    onNavigateToObservatory &&
                                    onNavigateToObservatory({ noteId: id, entityName: title })
                                  }
                                  onAskFollowUp={(prompt) => handleSendMessage(prompt)}
                                />
                              ) : (
                                <InChatNotePreview
                                  draft={msg.noteDraft}
                                  isSaving={msg.noteDraft.status === 'committing'}
                                  onSave={(revisedTitle, revisedContent) =>
                                    saveNoteDraft(msg.id, revisedTitle, revisedContent)
                                  }
                                  onRegenerate={() => regenerateNoteDraft(msg.id)}
                                  onCancel={() => cancelNoteDraftAction(msg.id)}
                                  onPreviewArtifact={setActiveArtifactPreview}
                                />
                              )
                            )}

                            {/* In-Chat Structured Summary Card (Callout 4) */}
                            {msg.summaryCard && (
                              <InChatSummaryCard
                                summary={msg.summaryCard}
                                onOpenSource={(id) => {
                                  if (onNavigateToNote) {
                                    onNavigateToNote(id);
                                  } else if (onNavigateToLibrary) {
                                    onNavigateToLibrary();
                                  }
                                }}
                                onFindRelatedNotes={(title) =>
                                  handleSendMessage(`/link-notes ${title}`)
                                }
                              />
                            )}

                            {/* In-Chat Search Results Card */}
                            {msg.searchResults && (
                              <InChatSearchResultsCard
                                searchData={msg.searchResults}
                                onOpenItem={(id, itemType) => {
                                  if (itemType === 'note' && onNavigateToNote) {
                                    onNavigateToNote(id);
                                  } else if (onNavigateToLibrary) {
                                    onNavigateToLibrary();
                                  }
                                }}
                              />
                            )}

                            {/* In-Chat Inbox Review Card */}
                            {msg.inboxReview && (
                              <InChatInboxReviewCard
                                inboxData={msg.inboxReview}
                                onNavigateToLibrary={onNavigateToLibrary}
                                onReviewSource={() => {
                                  if (onNavigateToLibrary) onNavigateToLibrary();
                                }}
                              />
                            )}

                            {/* In-Chat Add-to-Collection Proposal Card (Two-phase commit) */}
                            {msg.addToCollectionProposal && (
                              <InChatAddToCollectionProposalCard
                                proposal={msg.addToCollectionProposal}
                                isCommitting={msg.addToCollectionProposal.status === 'committing'}
                                onConfirm={() => confirmAddToCollection(msg.id)}
                                onCancel={() => cancelAddToCollection(msg.id)}
                                onOpenCollection={() => {
                                  if (onNavigateToLibrary) onNavigateToLibrary();
                                }}
                              />
                            )}

                            {/* In-Chat Link Notes Candidate Suggestions Card */}
                            {msg.linkNotesResults && (
                              <InChatLinkSuggestionsCard
                                linkData={msg.linkNotesResults}
                                onOpenNote={(noteId) => {
                                  if (onNavigateToNote) onNavigateToNote(noteId);
                                  else if (onNavigateToLibrary) onNavigateToLibrary();
                                }}
                                onConnectNotes={(sourceId, targetId) => {
                                  connectNotesInSuggestion(msg.id, sourceId, targetId);
                                }}
                              />
                            )}

                            {/* In-Chat Generic Action Proposal Card (Two-phase CRUD operations) */}
                            {msg.genericProposal && (
                              <InChatActionProposalCard
                                proposal={msg.genericProposal}
                                isCommitting={msg.genericProposal.status === 'committing'}
                                onConfirm={(overrides) => confirmGenericProposal(msg.id, overrides)}
                                onCancel={() => cancelGenericProposal(msg.id)}
                                onPreviewArtifact={setActiveArtifactPreview}
                                onNavigateToItem={(id, itemType) => {
                                  if (itemType === 'note' && onNavigateToNote) {
                                    onNavigateToNote(id);
                                  } else if (itemType === 'collection' && onNavigateToCollections) {
                                    onNavigateToCollections();
                                  } else if (itemType === 'thread' && onNavigateToThreads) {
                                    onNavigateToThreads();
                                  } else if (onNavigateToLibrary) {
                                    onNavigateToLibrary();
                                  }
                                }}
                              />
                            )}

                            {/* In-Chat Generic Action Result Card (Completed operations) */}
                            {msg.genericResult && (
                              <InChatActionResultCard
                                result={msg.genericResult}
                                onNavigateToItem={(id, itemType) => {
                                  if (itemType === 'note' && onNavigateToNote) {
                                    onNavigateToNote(id);
                                  } else if (itemType === 'collection' && onNavigateToCollections) {
                                    onNavigateToCollections();
                                  } else if (itemType === 'thread' && onNavigateToThreads) {
                                    onNavigateToThreads();
                                  } else if (onNavigateToLibrary) {
                                    onNavigateToLibrary();
                                  }
                                }}
                                onRunCommand={(cmdText) => handleSendMessage(cmdText)}
                                onStageRecommendation={
                                  stageOrganizationRecommendation
                                    ? (configuredPayload) =>
                                        stageOrganizationRecommendation(msg.id, configuredPayload)
                                    : undefined
                                }
                              />
                            )}

                            {!msg.content && (
                              <div className="text-[var(--ink-secondary)] flex items-center gap-2.5 py-2">
                                <span className="relative flex h-2 w-2">
                                  <span className="pulse-dot absolute inline-flex h-full w-full rounded-full bg-[var(--accent-terracotta)] opacity-75" />
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent-terracotta)]" />
                                </span>
                                <span className="serif-italic text-[13.5px] text-[var(--ink-secondary)]">Synthesizing response from knowledge archive...</span>
                              </div>
                            )}
                          </>
                        )}

                        {/* Restrained Grounded Concepts and Citations footer */}
                        {((relevantConcepts && relevantConcepts.length > 0) ||
                          (msg.citations && msg.citations.length > 0)) && (
                          <div className="pt-3 border-t border-[var(--border-parchment)] flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              {relevantConcepts.length > 0 && (
                                <>
                                  <span className="text-[11px] mono uppercase text-[var(--ink-tertiary)] font-medium">
                                    Grounded In:
                                  </span>
                                  {relevantConcepts.map((c) => (
                                    <button
                                      key={c}
                                      type="button"
                                      onClick={() => onNavigateToObservatory && onNavigateToObservatory({ entityName: c })}
                                      className="concept-chip cursor-pointer"
                                      title={`View ${c} in Observatory`}
                                    >
                                      <svg width="8" height="8" viewBox="-5 -5 10 10" fill="currentColor">
                                        <path d="M 0 -5 L 1.2 -1.2 L 5 0 L 1.2 1.2 L 0 5 L -1.2 1.2 L -5 0 L -1.2 -1.2 Z" />
                                      </svg>
                                      {c}
                                    </button>
                                  ))}
                                </>
                              )}

                              {msg.citations && msg.citations.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveCitations(msg.citations || []);
                                    setIsEvidenceOpen(true);
                                  }}
                                  className="source-chip cursor-pointer"
                                >
                                  <i className="ph ph-file-text text-xs" />
                                  {msg.citations.length} Grounded Sources
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </article>
                    </>
                  )}
                </div>
              );
            })}

            {/* Suggested inquiries for empty thread */}
            {messages.length <= 1 && (
              <div className="p-4 rounded-xl border border-[var(--border-parchment)] bg-white/60 flex flex-col gap-2.5 max-w-xl mx-auto my-4">
                <span className="text-[10px] mono uppercase text-[var(--ink-tertiary)] font-semibold">
                  Suggested Research Inquiries
                </span>
                {suggestedInquiries.map((sq) => (
                  <button
                    key={sq}
                    type="button"
                    onClick={() => handleSendMessage(sq)}
                    className="text-left p-2.5 rounded-lg bg-white hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-[12.5px] text-[var(--ink-primary)] leading-snug transition-all cursor-pointer shadow-2xs"
                  >
                    <i className="ph ph-sparkle text-xs text-[var(--accent-terracotta)] mr-2 inline" />
                    {sq}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ================= COMPOSER: ANCHORED RESEARCH DESK INPUT ================= */}
          <div className="mt-auto pt-3 border-t border-[var(--border-parchment)] shrink-0">
            {/* Carried Context Banner (§12, §14) */}
            {activeScope && (
              <div className="mb-2 px-3 py-1.5 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex items-center justify-between text-xs text-[var(--ink-secondary)] animate-fade-in">
                <div className="flex items-center gap-2 truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-terracotta)] shrink-0" />
                  <span className="font-semibold text-[var(--ink-primary)] shrink-0">Carried Context:</span>
                  {activeScope.connectionSummary ? (
                    <span className="truncate">
                      Connection: <strong>{activeScope.connectionSummary.sourceEntityName}</strong> ⟷ <strong>{activeScope.connectionSummary.targetEntityName}</strong> ({activeScope.connectionSummary.relationshipType.replace(/_/g, ' ')})
                    </span>
                  ) : activeScope.noteTitle ? (
                    <span className="truncate">Note: <strong>{activeScope.noteTitle}</strong></span>
                  ) : activeScope.sourceTitle ? (
                    <span className="truncate">Source: <strong>{activeScope.sourceTitle}</strong></span>
                  ) : activeScope.entityNames ? (
                    <span className="truncate">Concepts: <strong>{activeScope.entityNames.join(', ')}</strong></span>
                  ) : (
                    <span>Structured Workspace Context</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveScope(null)}
                  aria-label="Clear carried context"
                  className="text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)] p-0.5 rounded transition-colors ml-2 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)]"
                  title="Clear carried context"
                >
                  <i className="ph ph-x text-xs" />
                </button>
              </div>
            )}

            <div className="instrument-panel p-2.5 shadow-md flex flex-col gap-2 bg-white/95">
              <div className="panel-bracket-tl" />
              <div className="panel-bracket-br" />

              <div className="relative">
                {showSlashMenu && (
                  <SlashCommandMenu
                    commands={slashCommands}
                    filterQuery={slashFilter}
                    selectedIndex={slashSelectedIndex}
                    onSelectCommand={handleSelectSlashCommand}
                    onSelectExample={handleSelectExample}
                    onHoverIndex={setSlashSelectedIndex}
                  />
                )}
                {showArgumentMenu && argumentSuggestions.length > 0 && (
                  <ArgumentSuggestionsMenu
                    command={parsedArgState?.command || ''}
                    query={parsedArgState?.query || ''}
                    suggestions={argumentSuggestions}
                    selectedIndex={suggestionsSelectedIndex}
                    isLoading={isSuggestionsLoading}
                    onSelectSuggestion={handleSelectSuggestion}
                    onHoverIndex={setSuggestionsSelectedIndex}
                  />
                )}
                <textarea
                  rows={2}
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (showArgumentMenu && argumentSuggestions.length > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setSuggestionsSelectedIndex((prev) => (prev + 1) % argumentSuggestions.length);
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setSuggestionsSelectedIndex((prev) =>
                          (prev - 1 + argumentSuggestions.length) % argumentSuggestions.length
                        );
                        return;
                      }
                      if (e.key === 'Enter' || e.key === 'Tab') {
                        e.preventDefault();
                        const chosen =
                          argumentSuggestions[suggestionsSelectedIndex] || argumentSuggestions[0];
                        if (chosen) {
                          handleSelectSuggestion(chosen);
                        }
                        return;
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setDismissedSuggestions(true);
                        return;
                      }
                    }

                    if (showSlashMenu && filteredSlashCommands.length > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setSlashSelectedIndex((prev) => (prev + 1) % filteredSlashCommands.length);
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setSlashSelectedIndex((prev) =>
                          (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length
                        );
                        return;
                      }
                      if (e.key === 'Enter' || e.key === 'Tab') {
                        e.preventDefault();
                        const chosen =
                          filteredSlashCommands[slashSelectedIndex] || filteredSlashCommands[0];
                        if (chosen) {
                          handleSelectSlashCommand(chosen);
                        }
                        return;
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setDismissedSlashMenu(true);
                        return;
                      }
                    }

                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Ask Stella about your notes, sources, or type '/' for commands... (Press Enter to send)"
                  className="w-full bg-transparent resize-none outline-none text-[13.5px] placeholder:text-[var(--ink-tertiary)] px-2 pt-1 leading-relaxed text-[var(--ink-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-midnight)] rounded-md"
                />
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-[var(--border-parchment)]">
                <div className="flex items-center gap-2">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="px-2 py-1 bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] rounded text-[11px] text-[var(--ink-secondary)] outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)]"
                  >
                    <option value="auto">Model: Auto ({ragStatus?.provider || 'Standard'})</option>
                    {ragStatus?.recommended_models?.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  {isStreaming && (
                    <button
                      type="button"
                      onClick={cancelGeneration}
                      className="px-3 py-1.5 rounded-lg bg-[var(--accent-terracotta)] text-[#FAF8F2] hover:bg-[#8F3819] text-xs font-medium flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-terracotta)]"
                      title="Stop inquiry generation (explicit cancel)"
                    >
                      <i className="ph-bold ph-stop text-xs" />
                      <span>Stop</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleSendMessage()}
                    disabled={!inputPrompt.trim() || isStreaming}
                    className="px-4 py-1.5 rounded-lg bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] text-xs font-medium flex items-center gap-1.5 shadow-2xs disabled:opacity-50 active:scale-95 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] group"
                  >
                    {isStreaming ? (
                      <>
                        <i className="ph ph-sparkle text-xs text-[var(--accent-brass)] stella-twinkle" />
                        <span className="stella-breathe">Synthesizing...</span>
                      </>
                    ) : (
                      <>
                        <span>Send Inquiry</span>
                        <i className="ph ph-arrow-up text-xs text-[var(--accent-brass)] nudge" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= RIGHT COLUMN: ARTIFACT PREVIEW OR SOURCES IN CONTEXT ================= */}
        {activeArtifactPreview ? (
          <ArtifactPreviewDrawer
            artifact={activeArtifactPreview}
            onClose={() => setActiveArtifactPreview(null)}
          />
        ) : (
          isEvidenceOpen && (
            <aside className="fixed inset-y-16 right-0 z-20 w-[280px] sm:w-[320px] lg:static lg:w-[320px] lg:h-full shrink-0 flex flex-col gap-4 transition-all duration-300 shadow-2xl lg:shadow-none bg-[var(--bg-base)]/95 lg:bg-transparent backdrop-blur-md lg:backdrop-blur-none p-3 lg:p-0">
              <div className="instrument-panel p-4 flex-1 flex flex-col gap-3 min-h-0">
                <div className="panel-bracket-tl" />
                <div className="panel-bracket-br" />

                <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-2.5">
                  <div className="flex items-center gap-2">
                    <i className="ph ph-book-bookmark text-sm text-[var(--accent-terracotta)]" />
                    <span className="serif-italic text-sm font-medium text-[var(--ink-secondary)]">
                      Sources in Context
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEvidenceOpen(false)}
                    aria-label="Close Sources Panel"
                    className="w-6 h-6 rounded flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)]"
                    title="Close Sources Panel"
                  >
                    <i className="ph ph-x text-sm" />
                  </button>
                </div>

                <div className="flex flex-col gap-3 overflow-y-auto flex-1 pr-1">
                  {activeCitations.length > 0 ? (
                    activeCitations.map((cite, idx) => {
                      const targetNoteId = (cite as any).note_id || (cite as any).source_id;
                      return (
                        <div
                          key={cite.chunk_id || idx}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (targetNoteId && onNavigateToNote) {
                              onNavigateToNote(targetNoteId);
                            } else if (onNavigateToLibrary) {
                              onNavigateToLibrary();
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              if (targetNoteId && onNavigateToNote) {
                                onNavigateToNote(targetNoteId);
                              } else if (onNavigateToLibrary) {
                                onNavigateToLibrary();
                              }
                            }
                          }}
                          className="card-surface p-3 flex flex-col gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-midnight)] group"
                          title={`Open "${cite.title}" in Library`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="mono text-[10px] font-semibold text-[var(--accent-midnight)] uppercase">
                              Source #{idx + 1}
                            </span>
                            <span className="mono text-[9.5px] text-[var(--accent-terracotta)]">
                              {(cite.score * 100).toFixed(0)}% Match
                            </span>
                          </div>
                          <div className="font-semibold text-xs text-[var(--ink-primary)] group-hover:text-[var(--accent-midnight)] flex items-center justify-between gap-1">
                            <span className="truncate">{cite.title}</span>
                            <i className="ph ph-arrow-up-right text-[11px] text-[var(--ink-tertiary)] group-hover:text-[var(--accent-terracotta)] shrink-0" />
                          </div>
                          <p className="text-[11.5px] text-[var(--ink-secondary)] leading-relaxed line-clamp-4">
                            &ldquo;{cite.excerpt}&rdquo;
                          </p>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-4 text-center text-xs text-[var(--ink-tertiary)] italic">
                      Submit an inquiry to inspect retrieved source passages and citations.
                    </div>
                  )}
                </div>
              </div>
            </aside>
          )
        )}
      </main>
    </div>
  );
};
