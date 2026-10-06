import React, { useEffect, useState } from 'react';
import { Collection } from '../types/v0_4_2';
import { listCollections, createCollection } from '../api/collections';

interface HyadesCollectionsProps {
  workspaceId: string;
}

export const HyadesCollections: React.FC<HyadesCollectionsProps> = ({ workspaceId }) => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listCollections(workspaceId)
      .then(setCollections)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const col = await createCollection(workspaceId, { name, description });
      setCollections([col, ...collections]);
      setName('');
      setDescription('');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-[#1F1E1C] mb-4">Collections</h1>
      <p className="text-sm text-[#5C5549] mb-6">Organize related knowledge across Notes, Sources, Entities, and Conversations.</p>

      <form onSubmit={handleCreate} className="mb-8 p-4 bg-[#F7F5EE] border border-[#DCD6C8] rounded-md space-y-3">
        <h2 className="text-sm font-medium text-[#1F1E1C]">Create New Collection</h2>
        <input
          type="text"
          placeholder="Collection name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-[#DCD6C8] rounded bg-white"
        />
        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-[#DCD6C8] rounded bg-white h-20"
        />
        <button
          type="submit"
          className="px-4 py-1.5 text-sm bg-[#1F1E1C] text-white rounded hover:bg-[#33312B]"
        >
          Create Collection
        </button>
      </form>

      {loading ? (
        <div className="text-sm text-[#878074]">Loading collections...</div>
      ) : collections.length === 0 ? (
        <div className="text-sm text-[#878074]">No collections created yet.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {collections.map((col) => (
            <div key={col.id} className="p-4 border border-[#DCD6C8] rounded bg-white hover:border-[#1F1E1C]">
              <h3 className="font-medium text-[#1F1E1C]">{col.name}</h3>
              {col.description && <p className="text-xs text-[#5C5549] mt-1">{col.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
