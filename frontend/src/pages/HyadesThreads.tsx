import React, { useEffect, useState } from 'react';
import { Thread } from '../types/v0_4_2';
import { listThreads, createThread } from '../api/threads';

interface HyadesThreadsProps {
  workspaceId: string;
}

export const HyadesThreads: React.FC<HyadesThreadsProps> = ({ workspaceId }) => {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listThreads(workspaceId)
      .then(setThreads)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      const th = await createThread(workspaceId, { title, question });
      setThreads([th, ...threads]);
      setTitle('');
      setQuestion('');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-[#1F1E1C] mb-4">Threads Workspace</h1>
      <p className="text-sm text-[#5C5549] mb-6">Investigate questions, attach relevant knowledge, and log key discoveries.</p>

      <form onSubmit={handleCreate} className="mb-8 p-4 bg-[#F7F5EE] border border-[#DCD6C8] rounded-md space-y-3">
        <h2 className="text-sm font-medium text-[#1F1E1C]">Start New Investigation Thread</h2>
        <input
          type="text"
          placeholder="Thread title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-[#DCD6C8] rounded bg-white"
        />
        <textarea
          placeholder="Guiding question or hypothesis"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-[#DCD6C8] rounded bg-white h-20"
        />
        <button
          type="submit"
          className="px-4 py-1.5 text-sm bg-[#1F1E1C] text-white rounded hover:bg-[#33312B]"
        >
          Create Thread
        </button>
      </form>

      {loading ? (
        <div className="text-sm text-[#878074]">Loading threads...</div>
      ) : threads.length === 0 ? (
        <div className="text-sm text-[#878074]">No active threads.</div>
      ) : (
        <div className="space-y-4">
          {threads.map((th) => (
            <div key={th.id} className="p-4 border border-[#DCD6C8] rounded bg-white">
              <div className="flex justify-between items-start">
                <h3 className="font-medium text-[#1F1E1C]">{th.title}</h3>
                <span className="text-xs px-2 py-0.5 rounded bg-[#EFECE6] text-[#5C5549]">{th.status}</span>
              </div>
              {th.question && <p className="text-xs text-[#5C5549] mt-2 font-mono">Q: {th.question}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
