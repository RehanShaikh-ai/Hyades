import React, { useState, useEffect } from 'react';
import {
  Thread,
  ThreadQuestion,
  ThreadDiscovery,
  ThreadActivityItem,
} from '@/types/threads';
import {
  listThreads,
  createThread,
  deleteThread,
  getThread,
  updateThread,
  addThreadQuestion,
  updateThreadQuestion,
  deleteThreadQuestion,
  listThreadQuestions,
  addThreadDiscovery,
  deleteThreadDiscovery,
  listThreadDiscoveries,
  getThreadActivity,
  listThreadItems,
  addThreadItem,
  removeThreadItem,
} from '@/api/threads';
import { WorkspaceSidebarHeader } from '@/components/workspace/WorkspaceSidebarHeader';
import { KnowledgeAttachPicker } from '@/components/workspace/KnowledgeAttachPicker';

interface HyadesThreadsProps {
  workspaceId: string;
  onNavigate?: (dest: any) => void;
  workspaceName?: string;
  onNavigateToObservatory?: () => void;
  onNavigateToStella?: () => void;
}

export const HyadesThreads: React.FC<HyadesThreadsProps> = ({
  workspaceId,
  onNavigate,
  workspaceName = 'Active Workspace',
  onNavigateToObservatory: _onNavigateToObservatory,
  onNavigateToStella: _onNavigateToStella,
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('hyades_workspace_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('hyades_workspace_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [questions, setQuestions] = useState<ThreadQuestion[]>([]);
  const [discoveries, setDiscoveries] = useState<ThreadDiscovery[]>([]);
  const [activities, setActivities] = useState<ThreadActivityItem[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newGuiding, setNewGuiding] = useState('');
  const [isCreatingThread, setIsCreatingThread] = useState(false);

  const [newQuestionText, setNewQuestionText] = useState('');
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);

  const [newDiscoveryText, setNewDiscoveryText] = useState('');
  const [isAddingDiscovery, setIsAddingDiscovery] = useState(false);

  const loadThreads = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const filter = statusFilter === 'all' ? undefined : statusFilter;
      const res = await listThreads(workspaceId, filter);
      setThreads(res.items);
      if (res.items.length > 0) {
        setSelectedThread((prev) => {
          if (!prev) return res.items[0];
          const matched = res.items.find((t) => t.id === prev.id);
          return matched || res.items[0];
        });
      } else {
        setSelectedThread(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed loading research threads');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (workspaceId) {
      loadThreads();
    }
  }, [workspaceId, statusFilter]);

  const loadThreadDetails = async (threadId: string) => {
    try {
      const [threadRes, actRes] = await Promise.all([
        getThread(threadId),
        getThreadActivity(threadId).catch(() => []),
      ]);
      setSelectedThread(threadRes);
      setActivities(Array.isArray(actRes) ? actRes : (actRes as any)?.items || []);

      let qItems = threadRes?.questions || [];
      let dItems = threadRes?.discoveries || [];
      let mItems: any[] = [];

      try {
        const fetchedQ = await listThreadQuestions(threadId);
        if (Array.isArray(fetchedQ) && fetchedQ.length > 0) qItems = fetchedQ;
      } catch {}

      try {
        const fetchedD = await listThreadDiscoveries(threadId);
        if (Array.isArray(fetchedD) && fetchedD.length > 0) dItems = fetchedD;
      } catch {}

      try {
        const fetchedM = await listThreadItems(threadId);
        if (fetchedM && Array.isArray(fetchedM.items)) mItems = fetchedM.items;
      } catch {}

      setQuestions(qItems);
      setDiscoveries(dItems);
      setItems(mItems);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed loading thread details');
    }
  };

  useEffect(() => {
    if (selectedThread?.id) {
      loadThreadDetails(selectedThread.id);
    } else {
      setQuestions([]);
      setDiscoveries([]);
      setActivities([]);
      setItems([]);
    }
  }, [selectedThread?.id]);

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed) {
      setError('Thread title cannot be empty.');
      return;
    }

    setIsCreatingThread(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const created = await createThread({
        workspace_id: workspaceId,
        title: trimmed,
        guiding_question: newGuiding.trim() || null,
        question: newGuiding.trim() || null,
      });
      setNewTitle('');
      setNewGuiding('');
      setSuccessMessage(`Research thread "${created.title}" opened.`);
      await loadThreads();
      setSelectedThread(created);
    } catch (err: unknown) {
      const apiErr = err as { error?: { message?: string } } | Error;
      const msg =
        (apiErr as { error?: { message?: string } })?.error?.message ||
        (err instanceof Error ? err.message : 'Failed creating thread');
      setError(msg);
    } finally {
      setIsCreatingThread(false);
    }
  };

  const handleToggleArchive = async () => {
    if (!selectedThread) return;
    const nextStatus = selectedThread.status === 'active' ? 'archived' : 'active';
    try {
      await updateThread(selectedThread.id, { status: nextStatus });
      setSuccessMessage(`Thread marked as ${nextStatus}.`);
      await loadThreads();
      if (selectedThread) {
        setSelectedThread({ ...selectedThread, status: nextStatus });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed updating thread status');
    }
  };

  const handleDeleteThread = async (id: string, title: string) => {
    if (!window.confirm(`Permanently delete research thread "${title}"?`)) {
      return;
    }
    setError(null);
    setSuccessMessage(null);
    try {
      await deleteThread(id);
      setSuccessMessage(`Thread "${title}" removed.`);
      setSelectedThread(null);
      await loadThreads();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed deleting thread');
    }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newQuestionText.trim();
    if (!selectedThread || !trimmed) return;

    setIsAddingQuestion(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await addThreadQuestion(selectedThread.id, { question: trimmed });
      setNewQuestionText('');
      setSuccessMessage('Question posed to inquiry log.');
      await loadThreadDetails(selectedThread.id);
    } catch (err: unknown) {
      const apiErr = err as { error?: { message?: string } } | Error;
      const msg =
        (apiErr as { error?: { message?: string } })?.error?.message ||
        (err instanceof Error ? err.message : 'Failed adding question');
      setError(msg);
    } finally {
      setIsAddingQuestion(false);
    }
  };

  const handleToggleQuestionResolved = async (q: ThreadQuestion) => {
    if (!selectedThread) return;
    const isCurrentlyResolved = q.is_resolved || q.status === 'answered';
    const nextResolved = !isCurrentlyResolved;
    try {
      await updateThreadQuestion(selectedThread.id, q.id, {
        is_resolved: nextResolved,
        status: nextResolved ? 'answered' : 'open',
      });
      await loadThreadDetails(selectedThread.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed updating question status');
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!selectedThread) return;
    try {
      await deleteThreadQuestion(selectedThread.id, questionId);
      await loadThreadDetails(selectedThread.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed deleting question');
    }
  };

  const handleAddDiscovery = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newDiscoveryText.trim();
    if (!selectedThread || !trimmed) return;

    setIsAddingDiscovery(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await addThreadDiscovery(selectedThread.id, { content: trimmed });
      setNewDiscoveryText('');
      setSuccessMessage('Discovery logged.');
      await loadThreadDetails(selectedThread.id);
    } catch (err: unknown) {
      const apiErr = err as { error?: { message?: string } } | Error;
      const msg =
        (apiErr as { error?: { message?: string } })?.error?.message ||
        (err instanceof Error ? err.message : 'Failed logging discovery');
      setError(msg);
    } finally {
      setIsAddingDiscovery(false);
    }
  };

  const handleDeleteDiscovery = async (discoveryId: string) => {
    if (!selectedThread) return;
    try {
      await deleteThreadDiscovery(selectedThread.id, discoveryId);
      await loadThreadDetails(selectedThread.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed deleting discovery');
    }
  };


  const handleRemoveItem = async (itemType: string, itemId: string) => {
    if (!selectedThread) return;
    try {
      await removeThreadItem(selectedThread.id, itemType, itemId);
      setSuccessMessage('Detached item from thread.');
      await loadThreadDetails(selectedThread.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed detaching item');
    }
  };
  return (
    <div
      className="relative flex-1 h-[calc(100vh-57px)] flex flex-col md:flex-row overflow-x-hidden overflow-y-auto w-full select-none text-[13px] leading-relaxed bg-[var(--bg-base)] text-[var(--ink-primary)]"
      data-testid="hyades-threads"
    >
      <div className="paper-grain" />
      <div className="classical-environment">
        <div className="ambient-sunlight" />
      </div>

      {/* Left Sidebar: Threads Inquiries Shelf (Positioned on far left) */}
      <aside
        data-testid="workspace-sidebar"
        className={`flex-shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-[var(--border-parchment)] bg-[var(--bg-panel)]/95 backdrop-blur-sm z-10 transition-all duration-200 select-none ${
          isSidebarCollapsed ? 'w-14' : 'w-full md:w-80 lg:w-88'
        }`}
      >
        <WorkspaceSidebarHeader
          currentDestination="threads"
          onNavigate={onNavigate}
          workspaceName={workspaceName}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />

        {!isSidebarCollapsed && (
          <>
            <div className="p-4 border-b border-[var(--border-parchment)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-[var(--accent-terracotta)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <h2 className="serif text-lg font-medium text-[var(--ink-primary)] tracking-wide">
              Research Threads
            </h2>
          </div>
          <span className="mono text-xs px-2 py-0.5 rounded bg-white/80 border border-[var(--border-parchment)] text-[var(--ink-secondary)]">
            {threads.length}
          </span>
        </div>

        <div className="px-3 py-2 border-b border-[var(--border-parchment)] flex items-center gap-1 text-[11px] font-mono">
          {(['all', 'active', 'archived'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2 py-0.5 rounded capitalize transition-all cursor-pointer ${
                statusFilter === st
                  ? 'bg-[var(--accent-midnight)] text-[#FAF8F2] font-medium'
                  : 'text-[var(--ink-secondary)] hover:bg-white/60'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <form
          onSubmit={handleCreateThread}
          className="p-3.5 border-b border-[var(--border-parchment)] bg-white/40 space-y-2.5"
        >
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[var(--ink-tertiary)] font-mono mb-1">
              Thread Inquiry Title
            </label>
            <input
              type="text"
              placeholder="Thread title..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              disabled={isCreatingThread}
              className="w-full px-3 py-1.5 text-xs bg-white border border-[var(--border-parchment)] rounded-lg text-[var(--ink-primary)] placeholder-[var(--ink-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-midnight)] focus:border-[var(--accent-midnight)] transition-all"
            />
          </div>
          <div>
            <input
              type="text"
              placeholder="Guiding question (optional)..."
              value={newGuiding}
              onChange={(e) => setNewGuiding(e.target.value)}
              disabled={isCreatingThread}
              className="w-full px-3 py-1.5 text-xs bg-white border border-[var(--border-parchment)] rounded-lg text-[var(--ink-primary)] placeholder-[var(--ink-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-midnight)] focus:border-[var(--accent-midnight)] transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={isCreatingThread || !newTitle.trim()}
            className="w-full py-1.5 px-3 text-xs font-medium bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight)]/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {isCreatingThread ? 'Opening Thread...' : 'Create Thread'}
          </button>
        </form>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5 divide-y divide-transparent">
          {isLoading && threads.length === 0 ? (
            <div className="p-6 text-center text-xs text-[var(--ink-tertiary)] flex flex-col items-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-[var(--accent-midnight)] border-t-transparent animate-spin" />
              <span className="serif-italic">Tracing inquiries...</span>
            </div>
          ) : threads.length === 0 ? (
            <div className="p-6 text-center text-xs text-[var(--ink-tertiary)] serif-italic">
              No research threads found. Begin a new line of inquiry above.
            </div>
          ) : (
            threads.map((thread) => {
              const isSelected = selectedThread?.id === thread.id;
              const isArchived = thread.status === 'archived';
              return (
                <div
                  key={thread.id}
                  onClick={() => setSelectedThread(thread)}
                  className={`group relative p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white shadow-sm border-[var(--border-strong)] ring-1 ring-[var(--accent-midnight)]/10'
                      : 'bg-transparent border-transparent hover:bg-white/60 hover:border-[var(--border-parchment)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isArchived ? 'bg-[var(--ink-tertiary)]' : 'bg-emerald-600'
                          }`}
                        />
                        <h3
                          className={`text-sm font-medium truncate ${
                            isSelected
                              ? 'text-[var(--accent-midnight)] font-semibold'
                              : 'text-[var(--ink-primary)]'
                          }`}
                        >
                          {thread.title}
                        </h3>
                      </div>
                      {(thread.guiding_question || thread.question) && (
                        <p className="text-xs text-[var(--ink-secondary)] serif-italic truncate mt-0.5">
                          {thread.guiding_question || thread.question}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteThread(thread.id, thread.title);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-[var(--ink-tertiary)] hover:text-red-600 transition-all rounded hover:bg-red-50 cursor-pointer"
                      title="Delete thread"
                      aria-label={`Delete ${thread.title}`}
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                  {isSelected && (
                    <div className="absolute left-0 top-2 bottom-2 w-1 bg-[var(--accent-terracotta)] rounded-r" />
                  )}
                </div>
              );
            })
          )}
        </div>
          </>
        )}
      </aside>
      {/* Main Dossier */}
      <main className="flex-1 flex flex-col overflow-y-auto p-4 md:p-6 z-10 space-y-5">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-red-700">Notice:</span>
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-900 font-bold px-1.5 cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {successMessage && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-emerald-700">Recorded:</span>
              <span>{successMessage}</span>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-600 hover:text-emerald-900 font-bold px-1.5 cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {selectedThread ? (
          <div className="space-y-6 max-w-5xl w-full mx-auto">
            {/* Header Instrument Panel */}
            <div className="instrument-panel p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="mono text-[10px] tracking-wider uppercase text-[var(--accent-terracotta)] font-semibold">
                      Research Investigation
                    </span>
                    <span className="text-[var(--border-strong)]">/</span>
                    <span
                      className={`mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded border ${
                        selectedThread.status === 'active'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-stone-100 text-stone-700 border-stone-200'
                      }`}
                    >
                      {selectedThread.status}
                    </span>
                  </div>
                  <h1 className="serif text-2xl md:text-3xl font-medium text-[var(--ink-primary)]">
                    {selectedThread.title}
                  </h1>
                  {(selectedThread.guiding_question || selectedThread.question) && (
                    <div className="p-3 bg-[var(--bg-panel)] rounded-xl border border-[var(--border-parchment)] text-xs md:text-sm text-[var(--ink-primary)] serif-italic max-w-3xl mt-2 flex items-start gap-2">
                      <span className="text-[var(--accent-terracotta)] font-bold text-base leading-none">
                        “
                      </span>
                      <span>{selectedThread.guiding_question || selectedThread.question}</span>
                      <span className="text-[var(--accent-terracotta)] font-bold text-base leading-none">
                        ”
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleArchive}
                    className="px-3 py-1.5 text-xs border border-[var(--border-parchment)] hover:border-[var(--border-strong)] bg-white/80 rounded-lg text-[var(--ink-secondary)] transition-all cursor-pointer"
                  >
                    {selectedThread.status === 'active' ? 'Archive Thread' : 'Reactivate Thread'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteThread(selectedThread.id, selectedThread.title)}
                    className="px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 border border-red-200 rounded-lg transition-all cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>

            {/* Questions & Discoveries Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Questions Panel */}
              <div className="instrument-panel p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-3">
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-[var(--accent-midnight)]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <h3 className="serif text-base font-medium text-[var(--ink-primary)]">
                      Inquiry Questions ({questions.length})
                    </h3>
                  </div>
                </div>

                <form onSubmit={handleAddQuestion} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Pose a new question..."
                    value={newQuestionText}
                    onChange={(e) => setNewQuestionText(e.target.value)}
                    disabled={isAddingQuestion}
                    className="flex-1 px-3 py-1.5 text-xs bg-white border border-[var(--border-parchment)] rounded-lg text-[var(--ink-primary)] placeholder-[var(--ink-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-midnight)]"
                  />
                  <button
                    type="submit"
                    disabled={isAddingQuestion || !newQuestionText.trim()}
                    className="px-3 py-1.5 text-xs font-medium bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight)]/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all cursor-pointer"
                  >
                    {isAddingQuestion ? 'Asking...' : 'Ask'}
                  </button>
                </form>

                <div className="space-y-2">
                  {questions.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[var(--ink-tertiary)] serif-italic border border-dashed border-[var(--border-parchment)] rounded-xl bg-white/40">
                      No questions posed yet. Record inquiries that guide this investigation.
                    </div>
                  ) : (
                    questions.map((q) => {
                      const isResolved = q.is_resolved || q.status === 'answered';
                      return (
                        <div
                          key={q.id}
                          className="p-3 bg-white rounded-xl border border-[var(--border-parchment)] flex items-start justify-between gap-3 shadow-2xs group"
                        >
                          <div className="flex items-start gap-2.5 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={isResolved}
                              onChange={() => handleToggleQuestionResolved(q)}
                              className="mt-0.5 rounded text-[var(--accent-midnight)] cursor-pointer"
                              title={isResolved ? 'Mark as open' : 'Mark as answered'}
                            />
                            <div className="min-w-0">
                              <p
                                className={`text-xs ${
                                  isResolved
                                    ? 'line-through text-[var(--ink-tertiary)]'
                                    : 'text-[var(--ink-primary)] font-medium'
                                }`}
                              >
                                {q.text || q.question}
                              </p>
                              <span className="mono text-[10px] text-[var(--ink-tertiary)]">
                                {isResolved ? 'Resolved' : 'Open question'}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteQuestion(q.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-[var(--ink-tertiary)] hover:text-red-600 rounded transition-all cursor-pointer"
                            title="Delete question"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Discoveries Panel */}
              <div className="instrument-panel p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-3">
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-[var(--accent-terracotta)]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                    <h3 className="serif text-base font-medium text-[var(--ink-primary)]">
                      Discoveries & Findings ({discoveries.length})
                    </h3>
                  </div>
                </div>

                <form onSubmit={handleAddDiscovery} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Log a key insight or discovery..."
                    value={newDiscoveryText}
                    onChange={(e) => setNewDiscoveryText(e.target.value)}
                    disabled={isAddingDiscovery}
                    className="flex-1 px-3 py-1.5 text-xs bg-white border border-[var(--border-parchment)] rounded-lg text-[var(--ink-primary)] placeholder-[var(--ink-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-midnight)]"
                  />
                  <button
                    type="submit"
                    disabled={isAddingDiscovery || !newDiscoveryText.trim()}
                    className="px-3 py-1.5 text-xs font-medium bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight)]/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all cursor-pointer"
                  >
                    {isAddingDiscovery ? 'Logging...' : 'Log Discovery'}
                  </button>
                </form>

                <div className="space-y-2">
                  {discoveries.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[var(--ink-tertiary)] serif-italic border border-dashed border-[var(--border-parchment)] rounded-xl bg-white/40">
                      No discoveries recorded yet. Log breakthroughs and empirical findings.
                    </div>
                  ) : (
                    discoveries.map((d) => (
                      <div
                        key={d.id}
                        className="p-3 bg-white rounded-xl border border-[var(--border-parchment)] flex items-start justify-between gap-3 shadow-2xs group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-[var(--ink-primary)] leading-relaxed">
                            {d.content}
                          </p>
                          <span className="mono text-[10px] text-[var(--ink-tertiary)]">
                            {d.created_at ? new Date(d.created_at).toLocaleDateString() : 'Recorded'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteDiscovery(d.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-[var(--ink-tertiary)] hover:text-red-600 rounded transition-all cursor-pointer"
                          title="Delete discovery"
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Attached Knowledge & Activity Chronology */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Attached Knowledge */}
              <div className="instrument-panel p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-3">
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-[var(--accent-midnight)]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    <h3 className="serif text-base font-medium text-[var(--ink-primary)]">
                      Attached Knowledge ({items.length})
                    </h3>
                  </div>
                </div>

                {/* Knowledge Attachment Interface */}
                <KnowledgeAttachPicker
                  workspaceId={workspaceId}
                  attachedItemIds={selectedThread.items?.map((it) => it.item_id) || []}
                  onAttach={async (type, id, title) => {
                    await addThreadItem(selectedThread.id, {
                      item_type: type,
                      item_id: id,
                    });
                    setSuccessMessage(`Attached ${type} "${title || id}" to thread.`);
                    await loadThreadDetails(selectedThread.id);
                  }}
                />

                <div className="space-y-2">
                  {items.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[var(--ink-tertiary)] serif-italic border border-dashed border-[var(--border-parchment)] rounded-xl bg-white/40">
                      No knowledge items linked yet. Attach relevant notes or archival sources.
                    </div>
                  ) : (
                    items.map((it, idx) => (
                      <div
                        key={`${it.item_type || 'item'}-${it.item_id || idx}`}
                        className="p-2.5 bg-white rounded-lg border border-[var(--border-parchment)] flex items-center justify-between gap-2 shadow-2xs group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="mono text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded bg-[var(--bg-panel)] text-[var(--ink-secondary)] border border-[var(--border-parchment)]">
                            {it.item_type || 'item'}
                          </span>
                          <span className="text-xs text-[var(--ink-primary)] truncate font-medium">
                            {it.title || it.item_id}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(it.item_type, it.item_id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-[var(--ink-tertiary)] hover:text-red-600 rounded transition-all cursor-pointer"
                          title="Detach item"
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Activity Timeline */}
              <div className="instrument-panel p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-3">
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-[var(--accent-midnight)]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <h3 className="serif text-base font-medium text-[var(--ink-primary)]">
                      Activity Chronology ({activities.length})
                    </h3>
                  </div>
                </div>

                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {activities.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[var(--ink-tertiary)] serif-italic border border-dashed border-[var(--border-parchment)] rounded-xl bg-white/40">
                      No activity recorded in this thread timeline yet.
                    </div>
                  ) : (
                    activities.map((act, idx) => (
                      <div
                        key={act.id || idx}
                        className="p-2.5 bg-white rounded-lg border border-[var(--border-parchment)] shadow-2xs flex items-start gap-2.5"
                      >
                        <div className="w-2 h-2 rounded-full bg-[var(--accent-terracotta)] mt-1.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-[var(--ink-primary)] leading-snug">
                            {act.summary}
                          </p>
                          <span className="mono text-[10px] text-[var(--ink-tertiary)]">
                            {act.timestamp ? new Date(act.timestamp).toLocaleString() : 'Recent'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-12 text-center">
            <div className="instrument-panel p-8 max-w-md space-y-3">
              <div className="w-10 h-10 rounded-full bg-[var(--accent-terracotta)]/10 text-[var(--accent-terracotta)] mx-auto flex items-center justify-center">
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
              <h3 className="serif text-lg font-medium text-[var(--ink-primary)]">
                Select a Research Thread
              </h3>
              <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                Choose an ongoing research thread from the left inquiries shelf or start a new investigation.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
