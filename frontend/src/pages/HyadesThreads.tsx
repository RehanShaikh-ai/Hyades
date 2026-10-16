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
  addThreadQuestion,
  updateThreadQuestion,
  addThreadDiscovery,
  getThreadActivity,
} from '@/api/threads';

interface HyadesThreadsProps {
  workspaceId: string;
  onNavigateToObservatory?: () => void;
  onNavigateToStella?: () => void;
}

export const HyadesThreads: React.FC<HyadesThreadsProps> = ({ workspaceId }) => {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [questions, setQuestions] = useState<ThreadQuestion[]>([]);
  const [discoveries, setDiscoveries] = useState<ThreadDiscovery[]>([]);
  const [activities, setActivities] = useState<ThreadActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New thread form state
  const [newTitle, setNewTitle] = useState('');
  const [newGuiding, setNewGuiding] = useState('');

  // Add question state
  const [newQuestionText, setNewQuestionText] = useState('');

  // Add discovery state
  const [newDiscoveryText, setNewDiscoveryText] = useState('');

  const loadThreads = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await listThreads(workspaceId);
      setThreads(res.items);
      if (res.items.length > 0 && !selectedThread) {
        setSelectedThread(res.items[0]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed loading threads');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (workspaceId) {
      loadThreads();
    }
  }, [workspaceId]);

  const loadThreadDetails = async (threadId: string) => {
    try {
      const [threadRes, actRes] = await Promise.all([
        getThread(threadId),
        getThreadActivity(threadId),
      ]);
      setSelectedThread(threadRes);
      setQuestions(threadRes.questions || []);
      setDiscoveries(threadRes.discoveries || []);
      setActivities(actRes);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed loading thread details');
    }
  };

  useEffect(() => {
    if (selectedThread?.id) {
      loadThreadDetails(selectedThread.id);
    }
  }, [selectedThread?.id]);

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const created = await createThread({
        workspace_id: workspaceId,
        title: newTitle.trim(),
        guiding_question: newGuiding.trim() || null,
      });
      setNewTitle('');
      setNewGuiding('');
      await loadThreads();
      setSelectedThread(created);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed creating thread');
    }
  };

  const handleDeleteThread = async (id: string) => {
    if (!window.confirm('Delete this research thread?')) return;
    try {
      await deleteThread(id);
      setSelectedThread(null);
      await loadThreads();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed deleting thread');
    }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThread || !newQuestionText.trim()) return;
    try {
      await addThreadQuestion(selectedThread.id, { question: newQuestionText.trim() });
      setNewQuestionText('');
      await loadThreadDetails(selectedThread.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed adding question');
    }
  };

  const handleToggleQuestionStatus = async (q: ThreadQuestion) => {
    if (!selectedThread) return;
    const nextStatus = q.status === 'open' ? 'answered' : 'open';
    try {
      await updateThreadQuestion(selectedThread.id, q.id, { status: nextStatus });
      await loadThreadDetails(selectedThread.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed updating question');
    }
  };

  const handleAddDiscovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThread || !newDiscoveryText.trim()) return;
    try {
      await addThreadDiscovery(selectedThread.id, { content: newDiscoveryText.trim() });
      setNewDiscoveryText('');
      await loadThreadDetails(selectedThread.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed logging discovery');
    }
  };

  return (
    <div className="flex h-full w-full bg-slate-950 text-slate-100 overflow-hidden" data-testid="hyades-threads">
      {/* Sidebar: Threads list */}
      <div className="w-80 border-r border-slate-800 flex flex-col bg-slate-900/60 p-4 space-y-4">
        <h2 className="text-xl font-bold tracking-tight text-amber-200">Research Threads</h2>

        {/* Create Thread Form */}
        <form onSubmit={handleCreateThread} className="space-y-2 border-b border-slate-800 pb-4">
          <input
            type="text"
            placeholder="Thread title..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full px-3 py-1.5 text-sm bg-slate-950 border border-slate-800 rounded focus:outline-none focus:border-amber-400"
          />
          <input
            type="text"
            placeholder="Guiding question (optional)..."
            value={newGuiding}
            onChange={(e) => setNewGuiding(e.target.value)}
            className="w-full px-3 py-1.5 text-sm bg-slate-950 border border-slate-800 rounded focus:outline-none focus:border-amber-400"
          />
          <button
            type="submit"
            className="w-full py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded transition-colors"
          >
            Create Thread
          </button>
        </form>

        {/* Threads List */}
        <div className="flex-1 overflow-y-auto space-y-1">
          {threads.map((th) => (
            <div
              key={th.id}
              onClick={() => setSelectedThread(th)}
              className={`p-2.5 rounded cursor-pointer transition-colors flex items-center justify-between ${
                selectedThread?.id === th.id
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30'
                  : 'hover:bg-slate-800/60 text-slate-300'
              }`}
            >
              <div>
                <div className="font-medium text-sm">{th.title}</div>
                {th.guiding_question && (
                  <div className="text-xs text-slate-400 truncate italic">Q: {th.guiding_question}</div>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteThread(th.id);
                }}
                className="text-xs text-slate-500 hover:text-red-400 p-1"
                title="Delete thread"
              >
                ✕
              </button>
            </div>
          ))}
          {threads.length === 0 && !isLoading && (
            <div className="text-xs text-slate-500 italic p-2">No research threads yet.</div>
          )}
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
        {error && (
          <div className="p-3 bg-red-950/60 border border-red-500/50 text-red-200 text-sm rounded">
            {error}
          </div>
        )}

        {selectedThread ? (
          <>
            {/* Thread Header & Guiding Question Banner */}
            <div className="border-b border-slate-800 pb-4 space-y-2">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-amber-100">{selectedThread.title}</h1>
                <span className="text-xs px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded uppercase font-bold tracking-wider">
                  {selectedThread.status}
                </span>
              </div>
              {selectedThread.guiding_question && (
                <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded text-amber-200 text-sm">
                  <span className="font-semibold text-amber-400 mr-2">Guiding Question:</span>
                  {selectedThread.guiding_question}
                </div>
              )}
            </div>

            {/* Questions & Discoveries Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Questions Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-300">Open & Answered Questions</h3>
                  <span className="text-xs text-slate-500">{questions.length} total</span>
                </div>

                <form onSubmit={handleAddQuestion} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Pose a new question..."
                    value={newQuestionText}
                    onChange={(e) => setNewQuestionText(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 text-xs px-3 py-1.5 rounded focus:outline-none focus:border-amber-400 text-slate-200"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded text-amber-200"
                  >
                    Ask
                  </button>
                </form>

                <div className="space-y-2">
                  {questions.map((q) => (
                    <div
                      key={q.id}
                      onClick={() => handleToggleQuestionStatus(q)}
                      className={`p-2.5 rounded border text-xs cursor-pointer flex items-center justify-between transition-colors ${
                        q.status === 'answered'
                          ? 'bg-slate-950/60 border-slate-800/60 text-slate-400 line-through'
                          : 'bg-slate-900/60 border-slate-800 text-slate-200 hover:border-amber-500/40'
                      }`}
                    >
                      <span>{q.question}</span>
                      <span className="text-[10px] font-bold uppercase ml-2 text-amber-400/80">
                        {q.status}
                      </span>
                    </div>
                  ))}
                  {questions.length === 0 && (
                    <div className="text-xs text-slate-500 italic">No questions posed yet.</div>
                  )}
                </div>
              </div>

              {/* Discoveries Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-300">Logged Discoveries</h3>
                  <span className="text-xs text-slate-500">{discoveries.length} total</span>
                </div>

                <form onSubmit={handleAddDiscovery} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Log a key discovery..."
                    value={newDiscoveryText}
                    onChange={(e) => setNewDiscoveryText(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 text-xs px-3 py-1.5 rounded focus:outline-none focus:border-amber-400 text-slate-200"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-xs font-semibold rounded text-slate-950"
                  >
                    Log
                  </button>
                </form>

                <div className="space-y-2">
                  {discoveries.map((d) => (
                    <div
                      key={d.id}
                      className="p-2.5 bg-slate-900/60 border border-amber-500/20 rounded text-xs text-slate-200"
                    >
                      <div>{d.content}</div>
                      <div className="text-[10px] text-slate-500 mt-1">{new Date(d.created_at).toLocaleString()}</div>
                    </div>
                  ))}
                  {discoveries.length === 0 && (
                    <div className="text-xs text-slate-500 italic">No discoveries logged yet.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Activity Timeline */}
            <div className="border-t border-slate-800 pt-4 space-y-2">
              <h3 className="text-sm font-semibold text-slate-300">Activity Timeline</h3>
              <div className="space-y-1">
                {activities.map((a, idx) => (
                  <div key={idx} className="text-xs text-slate-400 flex items-center justify-between py-1 border-b border-slate-900">
                    <span className="capitalize text-slate-300">{a.summary}</span>
                    <span className="text-[10px] text-slate-500">{new Date(a.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
                {activities.length === 0 && (
                  <div className="text-xs text-slate-500 italic">No recent activity.</div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            Select or create a research thread to explore.
          </div>
        )}
      </div>
    </div>
  );
};
