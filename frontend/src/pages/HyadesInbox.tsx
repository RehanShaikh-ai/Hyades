import React, { useEffect, useState } from 'react';
import { InboxItem } from '../types/v0_4_2';
import { listInboxItems, acceptInboxItem, rejectInboxItem } from '../api/inbox';

interface HyadesInboxProps {
  workspaceId: string;
}

export const HyadesInbox: React.FC<HyadesInboxProps> = ({ workspaceId }) => {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listInboxItems(workspaceId)
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const handleAccept = async (id: string) => {
    try {
      await acceptInboxItem(workspaceId, id);
      setItems(items.map((item) => (item.id === id ? { ...item, status: 'accepted' } : item)));
    } catch (err) {
      console.error(err);
    }
  };

  const handleReject = async (id: string) => {
    if (!window.confirm('Are you sure you want to reject and permanently delete this source?')) return;
    try {
      await rejectInboxItem(workspaceId, id);
      setItems(items.filter((item) => item.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-[#1F1E1C] mb-4">Knowledge Inbox</h1>
      <p className="text-sm text-[#5C5549] mb-6">Review uploaded sources and detected concepts before adding them to permanent graph knowledge.</p>

      {loading ? (
        <div className="text-sm text-[#878074]">Loading inbox...</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-[#878074]">No items in inbox.</div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="p-4 border border-[#DCD6C8] rounded bg-white flex justify-between items-center">
              <div>
                <h3 className="font-medium text-[#1F1E1C]">{item.source_title || 'Uploaded Source'}</h3>
                <div className="text-xs text-[#878074] space-x-3 mt-1">
                  <span>Type: {item.source_type}</span>
                  <span>Status: {item.status}</span>
                  <span>Extraction: {item.extract_knowledge ? 'Enabled' : 'Disabled'}</span>
                </div>
              </div>
              {item.status === 'pending' && (
                <div className="space-x-2">
                  <button
                    onClick={() => handleAccept(item.id)}
                    className="px-3 py-1 text-xs bg-[#1F1E1C] text-white rounded hover:bg-[#33312B]"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleReject(item.id)}
                    className="px-3 py-1 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
