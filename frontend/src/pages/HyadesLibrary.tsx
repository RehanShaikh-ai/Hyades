import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { listNotes } from '@/api/notes';
import { listSources } from '@/api/sources';
import { triggerExtraction, triggerReindex } from '@/api/graph_index';
import { Note } from '@/types/note';
import { Source } from '@/types/source';
import { NoteEditor } from '@/components/NoteEditor';
import { NoteLinks } from '@/components/NoteLinks';
import { ImportWizard } from '@/components/ImportWizard';
import { Modal } from '@/components/ui/Modal';
import libraryPlate from '@/assets/plates/library-plate.jpg';
import {
  BookOpen,
  FileText,
  Layers,
  Sparkles,
  Search,
  Plus,
  UploadCloud,
  ChevronRight,
  Archive,
  RefreshCw,
  Share2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Loader2,
} from 'lucide-react';

interface HyadesLibraryProps {
  workspaceId: string;
  userId?: string;
  initialNoteId?: string;
  onNavigateToObservatory?: () => void;
  onNavigateToStella?: () => void;
}

type FilterType = 'all' | 'sources' | 'notes';

interface UnifiedItem {
  id: string;
  type: 'note' | 'source';
  title: string;
  excerpt: string;
  tags: string[];
  updatedAt: string;
  rawNote?: Note;
  rawSource?: Source;
}

export const HyadesLibrary: React.FC<HyadesLibraryProps> = ({
  workspaceId,
  userId,
  initialNoteId,
  onNavigateToObservatory,
  onNavigateToStella,
}) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<UnifiedItem | null>(null);

  // Note editing state
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isCreatingNote, setIsCreatingNote] = useState(false);

  // Sidebars collapse state
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);

  // Modals & Operations
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [notesRes, sourcesRes] = await Promise.allSettled([
        listNotes(workspaceId, { page_size: 100, is_archived: false, sort: 'updated_at_desc' }),
        listSources(workspaceId, { page_size: 100 }),
      ]);

      const loadedNotes = notesRes.status === 'fulfilled' ? notesRes.value.items || [] : [];
      const loadedSources = sourcesRes.status === 'fulfilled' ? sourcesRes.value.items || [] : [];

      setNotes(loadedNotes);
      setSources(loadedSources);

      // Auto-select initial note or first item if none selected
      if (initialNoteId) {
        const found = loadedNotes.find((n) => n.id === initialNoteId);
        if (found) {
          setSelectedItem({
            id: found.id,
            type: 'note',
            title: found.title,
            excerpt: found.content?.slice(0, 160) || '',
            tags: (found.tags || []).map((t) => (typeof t === 'string' ? t : (t as { name?: string }).name || '')),
            updatedAt: found.updated_at,
            rawNote: found,
          });
          setIsEditingNote(true);
        }
      }
    } catch (err) {
      console.error('Failed to load library data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, initialNoteId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Unified items
  const unifiedItems: UnifiedItem[] = useMemo(() => {
    const list: UnifiedItem[] = [];

    notes.forEach((n) => {
      list.push({
        id: n.id,
        type: 'note',
        title: n.title || 'Untitled Note',
        excerpt: n.content?.slice(0, 140) || '',
        tags: (n.tags || []).map((t) => (typeof t === 'string' ? t : (t as { name?: string }).name || '')),
        updatedAt: n.updated_at,
        rawNote: n,
      });
    });

    sources.forEach((s) => {
      list.push({
        id: s.id,
        type: 'source',
        title: s.title || s.file_name || 'Ingested Document',
        excerpt: s.extracted_text?.slice(0, 140) || s.error_message || s.file_name || 'Ingested Document',
        tags: [],
        updatedAt: s.updated_at || s.created_at || new Date().toISOString(),
        rawSource: s,
      });
    });

    return list.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [notes, sources]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return unifiedItems.filter((item) => {
      if (filterType === 'sources' && item.type !== 'source') return false;
      if (filterType === 'notes' && item.type !== 'note') return false;
      if (selectedTag && !item.tags.includes(selectedTag)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          item.excerpt.toLowerCase().includes(q) ||
          item.tags.some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [unifiedItems, filterType, selectedTag, searchQuery]);

  // Select first item if current selection not set
  useEffect(() => {
    if (!selectedItem && filteredItems.length > 0 && !isCreatingNote) {
      setSelectedItem(filteredItems[0]);
    }
  }, [filteredItems, selectedItem, isCreatingNote]);

  // Contextual Extract action
  const handleExtract = async () => {
    setIsExtracting(true);
    setOperationMessage('Extracting concepts and entities...');
    try {
      await triggerExtraction(workspaceId);
      setOperationMessage('Extraction job queued successfully.');
      setTimeout(() => setOperationMessage(null), 3500);
      fetchData();
    } catch (err) {
      console.error('Failed to trigger extraction:', err);
      setOperationMessage('Failed to trigger extraction.');
      setTimeout(() => setOperationMessage(null), 3500);
    } finally {
      setIsExtracting(false);
    }
  };

  // Maintenance Reindex action
  const handleReindex = async () => {
    setIsReindexing(true);
    setOperationMessage('Triggering full archive reindex...');
    try {
      await triggerReindex(workspaceId);
      setOperationMessage('Full reindexing initiated.');
      setTimeout(() => setOperationMessage(null), 3500);
    } catch (err) {
      console.error('Failed to trigger reindex:', err);
      setOperationMessage('Failed to trigger reindex.');
      setTimeout(() => setOperationMessage(null), 3500);
    } finally {
      setIsReindexing(false);
    }
  };

  // Note editor callbacks
  const handleStartCreateNote = () => {
    setIsCreatingNote(true);
    setIsEditingNote(true);
    setIsRightSidebarOpen(true);
  };

  const handleNoteSaved = (savedNote: Note) => {
    setIsCreatingNote(false);
    fetchData();
    setSelectedItem({
      id: savedNote.id,
      type: 'note',
      title: savedNote.title,
      excerpt: savedNote.content?.slice(0, 140) || '',
      tags: (savedNote.tags || []).map((t) => (typeof t === 'string' ? t : (t as { name?: string }).name || '')),
      updatedAt: savedNote.updated_at,
      rawNote: savedNote,
    });
  };

  const handleNoteDeleted = () => {
    setIsCreatingNote(false);
    setIsEditingNote(false);
    setSelectedItem(null);
    fetchData();
  };

  return (
    <div className="relative h-[calc(100vh-56px)] flex overflow-hidden bg-[#EFECE4] text-[#1C1917]">
      {/* Background Archival Scriptorium Wash */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className="absolute -top-10 -right-10 w-[55vw] max-w-[800px] h-[105vh] bg-no-repeat bg-contain opacity-15 mix-blend-multiply"
          style={{
            backgroundImage: `url(${libraryPlate})`,
            filter: 'contrast(1.1) sepia(0.3) saturate(0.85)',
            maskImage:
              'radial-gradient(circle at 60% 40%, black 40%, rgba(0,0,0,0.4) 70%, transparent 95%)',
            WebkitMaskImage:
              'radial-gradient(circle at 60% 40%, black 40%, rgba(0,0,0,0.4) 70%, transparent 95%)',
          }}
        />
      </div>

      {/* Operation Toast Notification */}
      {operationMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-[#162135] text-[#FAF8F2] px-4 py-2 rounded-xl shadow-xl text-xs font-medium flex items-center gap-2 animate-fade-in border border-[#C9C2B0]">
          <Loader2 size={13} className="animate-spin text-[#BD532B]" />
          <span>{operationMessage}</span>
        </div>
      )}

      {/* ── 1. LEFT COLUMN: Shelves & Collections ──────────────── */}
      {isLeftSidebarOpen ? (
        <aside className="w-64 bg-[#FAF8F2]/95 border-r border-[#DCD6C8] flex flex-col justify-between relative z-10 shrink-0 backdrop-blur-md transition-all">
          <div>
            {/* Shelf Header */}
            <div className="px-4 py-3.5 border-b border-[#DCD6C8] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen size={16} className="text-[#BD532B]" />
                <span className="serif text-sm font-semibold text-[#1C1917]">
                  Shelves & Archives
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsLeftSidebarOpen(false)}
                className="p-1 text-[#878074] hover:text-[#1C1917] rounded-md hover:bg-[#EFECE4] transition-colors focus:outline-none"
                title="Collapse Shelves"
              >
                <PanelLeftClose size={15} />
              </button>
            </div>

            {/* Core Views */}
            <div className="p-3 space-y-1">
              <div className="px-2 py-1 text-[10px] mono uppercase tracking-wider text-[#878074]">
                Collection
              </div>
              <button
                type="button"
                onClick={() => {
                  setFilterType('all');
                  setSelectedTag(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filterType === 'all' && !selectedTag
                    ? 'bg-[#EFECE4] text-[#1C1917] font-semibold'
                    : 'text-[#575249] hover:bg-[#EFECE4]/60'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Archive size={13} />
                  <span>All Catalog Items</span>
                </span>
                <span className="mono text-[11px] text-[#878074]">{unifiedItems.length}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFilterType('sources');
                  setSelectedTag(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filterType === 'sources'
                    ? 'bg-[#EFECE4] text-[#1C1917] font-semibold'
                    : 'text-[#575249] hover:bg-[#EFECE4]/60'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Layers size={13} className="text-[#162135]" />
                  <span>Sources & Papers</span>
                </span>
                <span className="mono text-[11px] text-[#878074]">{sources.length}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFilterType('notes');
                  setSelectedTag(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filterType === 'notes'
                    ? 'bg-[#EFECE4] text-[#1C1917] font-semibold'
                    : 'text-[#575249] hover:bg-[#EFECE4]/60'
                }`}
              >
                <span className="flex items-center gap-2">
                  <FileText size={13} className="text-[#BD532B]" />
                  <span>Synthesis Notes</span>
                </span>
                <span className="mono text-[11px] text-[#878074]">{notes.length}</span>
              </button>
            </div>

            {/* Topic Shelves */}
            <div className="p-3 border-t border-[#DCD6C8] space-y-1">
              <div className="px-2 py-1 text-[10px] mono uppercase tracking-wider text-[#878074]">
                Topic Shelves
              </div>
              {['Memory', 'Agents', 'Graphs', 'Logic'].map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => {
                    setSelectedTag(topic.toLowerCase());
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1 rounded-lg text-xs transition-colors ${
                    selectedTag === topic.toLowerCase()
                      ? 'bg-[#BD532B]/10 text-[#BD532B] font-medium'
                      : 'text-[#575249] hover:bg-[#EFECE4]/60'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#BD532B]" />
                    <span>{topic}</span>
                  </span>
                  <span className="mono text-[10px] text-[#878074]">Shelf</span>
                </button>
              ))}
            </div>
          </div>

          {/* Maintenance & System Operation: Reindex Archive */}
          <div className="p-3 border-t border-[#DCD6C8] bg-[#F7F5EE]/80 space-y-2">
            <div className="px-1 text-[10px] mono uppercase tracking-wider text-[#878074]">
              Archive Maintenance
            </div>
            <button
              type="button"
              onClick={handleReindex}
              disabled={isReindexing}
              className="w-full px-3 py-2 rounded-lg bg-white border border-[#DCD6C8] hover:border-[#C9C2B0] hover:shadow-xs text-xs font-medium text-[#1C1917] flex items-center justify-center gap-2 transition-all disabled:opacity-60 focus:outline-none"
              title="Full Graph Reindex Operation"
            >
              <RefreshCw size={12} className={isReindexing ? 'animate-spin text-[#BD532B]' : 'text-[#878074]'} />
              <span>{isReindexing ? 'Reindexing...' : 'Reindex Archive'}</span>
            </button>
            <div className="text-[10px] text-[#878074] px-1 flex justify-between">
              <span>Vector Engine</span>
              <span className="mono text-emerald-600 font-medium">Ready</span>
            </div>
          </div>
        </aside>
      ) : (
        /* Collapsed Reopen Tab for Left Shelf */
        <button
          type="button"
          onClick={() => setIsLeftSidebarOpen(true)}
          className="absolute top-4 left-3 z-30 p-2 bg-[#FAF8F2] border border-[#C9C2B0] rounded-lg shadow-md text-[#575249] hover:text-[#1C1917] hover:bg-[#EFECE4] transition-all focus:outline-none"
          title="Open Shelves & Archives"
        >
          <PanelLeftOpen size={16} />
        </button>
      )}

      {/* ── 2. CENTER COLUMN: Catalog Ledger ────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#F7F5EE]/60 relative z-10 border-r border-[#DCD6C8]">
        {/* Ledger Toolbar */}
        <div className="px-6 py-3.5 border-b border-[#DCD6C8] bg-[#FAF8F2]/90 flex flex-wrap items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#878074]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents, notes, concepts..."
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#DCD6C8] rounded-lg text-xs text-[#1C1917] placeholder:text-[#878074] focus:outline-none focus:border-[#BD532B]"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-white border border-[#DCD6C8] hover:border-[#C9C2B0] text-xs font-medium text-[#1C1917] flex items-center gap-1.5 transition-colors focus:outline-none shadow-xs"
            >
              <UploadCloud size={13} className="text-[#162135]" />
              <span>Import Sources</span>
            </button>
            <button
              type="button"
              onClick={handleStartCreateNote}
              className="px-3.5 py-1.5 rounded-lg bg-[#162135] text-[#FAF8F2] hover:bg-[#22324F] text-xs font-medium flex items-center gap-1.5 transition-colors focus:outline-none shadow-xs"
            >
              <Plus size={13} className="text-[#BD532B]" />
              <span>New Note</span>
            </button>
          </div>
        </div>

        {/* Catalog Item Count & Active Filter Indicator */}
        <div className="px-6 py-2 border-b border-[#DCD6C8] bg-[#FAF8F2]/50 flex items-center justify-between text-xs text-[#878074]">
          <div className="flex items-center gap-2">
            <span className="serif-italic text-sm text-[#1C1917]">
              {filterType === 'sources'
                ? 'Sources & Papers'
                : filterType === 'notes'
                ? 'Synthesis Notes'
                : 'All Archival Folios'}
            </span>
            <span className="mono text-[11px]">({filteredItems.length} items)</span>
            {selectedTag && (
              <span className="px-2 py-0.5 rounded-full bg-[#BD532B]/10 text-[#BD532B] font-medium text-[11px] flex items-center gap-1">
                tag: {selectedTag}
                <button
                  type="button"
                  onClick={() => setSelectedTag(null)}
                  className="hover:text-black font-bold"
                >
                  ×
                </button>
              </span>
            )}
          </div>
          <span className="mono text-[10px]">SORT: RECENT</span>
        </div>

        {/* Catalog List */}
        <div className="flex-1 overflow-y-auto hyades-scroll p-4 sm:p-6 space-y-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#878074]">
              <Loader2 size={24} className="animate-spin text-[#BD532B] mb-2" />
              <p className="serif text-sm">Loading archive catalog...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-16 px-4 bg-white/50 border border-dashed border-[#DCD6C8] rounded-xl max-w-md mx-auto">
              <BookOpen size={32} className="mx-auto text-[#C9C2B0] mb-2" />
              <h3 className="serif text-base font-semibold text-[#1C1917]">No items found</h3>
              <p className="text-xs text-[#575249] mt-1">
                No sources or notes match your query. Import a paper or create your first study note.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(true)}
                  className="px-3 py-1.5 bg-white border border-[#DCD6C8] rounded-lg text-xs font-medium text-[#1C1917]"
                >
                  Import Sources
                </button>
                <button
                  type="button"
                  onClick={handleStartCreateNote}
                  className="px-3 py-1.5 bg-[#162135] text-white rounded-lg text-xs font-medium"
                >
                  Create Note
                </button>
              </div>
            </div>
          ) : (
            filteredItems.map((item) => {
              const isSelected = selectedItem?.id === item.id;
              const isSource = item.type === 'source';

              return (
                <div
                  key={`${item.type}-${item.id}`}
                  onClick={() => {
                    setSelectedItem(item);
                    setIsEditingNote(item.type === 'note');
                    setIsCreatingNote(false);
                    setIsRightSidebarOpen(true);
                  }}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white border-[#BD532B] shadow-md ring-1 ring-[#BD532B]/20'
                      : 'bg-[#FAF8F2] border-[#DCD6C8] hover:bg-white hover:border-[#C9C2B0]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          isSource ? 'bg-[#162135] text-[#FAF8F2]' : 'bg-[#BD532B] text-white'
                        }`}
                      >
                        {isSource ? <Layers size={14} /> : <FileText size={14} />}
                      </div>

                      <div>
                        <h4 className="serif text-base font-semibold text-[#1C1917] leading-snug">
                          {item.title}
                        </h4>
                        <p className="text-xs text-[#575249] line-clamp-2 mt-1 leading-relaxed">
                          {item.excerpt || 'No description provided.'}
                        </p>

                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                          <span className="mono text-[10px] text-[#878074]">
                            {new Date(item.updatedAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                          {item.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 rounded text-[10px] bg-[#EFECE4] text-[#575249] border border-[#DCD6C8]"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <ChevronRight
                      size={16}
                      className={`shrink-0 transition-transform ${
                        isSelected ? 'text-[#BD532B] translate-x-0.5' : 'text-[#C9C2B0]'
                      }`}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* ── 3. RIGHT COLUMN: Reading Dossier & Inspector ───────── */}
      {isRightSidebarOpen ? (
        <aside className="w-[420px] bg-[#FAF8F2] border-l border-[#DCD6C8] flex flex-col justify-between relative z-10 shrink-0 backdrop-blur-md transition-all">
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-[#DCD6C8] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="serif text-sm font-semibold text-[#1C1917]">
                {isCreatingNote
                  ? 'New Synthesis Note'
                  : isEditingNote
                  ? 'Note Inspector'
                  : 'Reading Dossier'}
              </span>
              <span className="mono text-[10px] text-[#878074]">
                {selectedItem ? `· ${selectedItem.type.toUpperCase()}` : ''}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsRightSidebarOpen(false)}
              className="p-1 text-[#878074] hover:text-[#1C1917] rounded-md hover:bg-[#EFECE4] transition-colors focus:outline-none"
              title="Collapse Inspector"
            >
              <PanelRightClose size={15} />
            </button>
          </div>

          {/* Dossier Content */}
          <div className="flex-1 overflow-y-auto hyades-scroll p-5 space-y-5">
            {isCreatingNote ? (
              <NoteEditor
                workspaceId={workspaceId}
                userId={userId}
                onClose={() => setIsCreatingNote(false)}
                onSaved={handleNoteSaved}
                onDeleted={() => {
                  setIsCreatingNote(false);
                  fetchData();
                }}
                className="h-full min-h-[480px]"
              />
            ) : selectedItem?.type === 'note' && selectedItem.rawNote ? (
              <div className="space-y-4">
                <NoteEditor
                  key={selectedItem.rawNote.id}
                  workspaceId={workspaceId}
                  userId={userId}
                  initialNote={selectedItem.rawNote}
                  onClose={() => setIsEditingNote(false)}
                  onSaved={handleNoteSaved}
                  onDeleted={handleNoteDeleted}
                  className="h-full min-h-[480px]"
                />
                <NoteLinks
                  workspaceId={workspaceId}
                  noteId={selectedItem.rawNote.id}
                  onNavigateToNote={(id) => {
                    const found = notes.find((n) => n.id === id);
                    if (found) {
                      setSelectedItem({
                        id: found.id,
                        type: 'note',
                        title: found.title,
                        excerpt: found.content?.slice(0, 140) || '',
                        tags: (found.tags || []).map((t) => (typeof t === 'string' ? t : (t as { name?: string }).name || '')),
                        updatedAt: found.updated_at,
                        rawNote: found,
                      });
                    }
                  }}
                />
              </div>
            ) : selectedItem?.type === 'source' && selectedItem.rawSource ? (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-[10px] mono uppercase font-semibold bg-[#162135]/10 text-[#162135]">
                      Ingested Literature
                    </span>
                    <span className="mono text-[10px] text-[#878074]">
                      {selectedItem.rawSource.source_type || 'document'}
                    </span>
                  </div>
                  <h3 className="serif text-xl font-semibold text-[#1C1917] leading-snug">
                    {selectedItem.title}
                  </h3>
                </div>

                {/* Contextual Action: Extract Concepts & Entities */}
                <div className="p-4 bg-white rounded-xl border border-[#DCD6C8] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#1C1917]">
                      Knowledge Graph Extraction
                    </span>
                    <span className="text-[10px] mono text-emerald-600 font-medium">Ready</span>
                  </div>
                  <p className="text-xs text-[#575249] leading-relaxed">
                    Extract entities, astronomical concepts, and relation edges from this document into the Observatory knowledge map.
                  </p>
                  <button
                    type="button"
                    onClick={handleExtract}
                    disabled={isExtracting}
                    className="w-full py-2 px-3 rounded-lg bg-[#162135] text-[#FAF8F2] hover:bg-[#22324F] text-xs font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-60 focus:outline-none shadow-xs"
                  >
                    <Sparkles size={13} className={isExtracting ? 'animate-spin text-[#BD532B]' : 'text-[#BD532B]'} />
                    <span>{isExtracting ? 'Extracting...' : 'Extract Concepts & Entities'}</span>
                  </button>
                </div>

                {/* Abstract / Summary */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#878074]">
                    Document Summary
                  </h4>
                  <p className="text-xs text-[#433D35] leading-relaxed bg-white p-3 rounded-xl border border-[#DCD6C8]">
                    {selectedItem.excerpt || 'No extracted text summary available for this file.'}
                  </p>
                </div>

                {/* Actions & Bridges */}
                <div className="pt-2 border-t border-[#DCD6C8] flex flex-col gap-2">
                  {onNavigateToObservatory && (
                    <button
                      type="button"
                      onClick={onNavigateToObservatory}
                      className="w-full py-2 px-3 rounded-lg bg-white border border-[#DCD6C8] hover:border-[#C9C2B0] text-xs font-medium text-[#1C1917] flex items-center justify-center gap-2 transition-colors focus:outline-none"
                    >
                      <Share2 size={13} className="text-[#162135]" />
                      <span>Locate in Observatory Graph ↗</span>
                    </button>
                  )}
                  {onNavigateToStella && (
                    <button
                      type="button"
                      onClick={onNavigateToStella}
                      className="w-full py-2 px-3 rounded-lg bg-white border border-[#DCD6C8] hover:border-[#C9C2B0] text-xs font-medium text-[#1C1917] flex items-center justify-center gap-2 transition-colors focus:outline-none"
                    >
                      <Sparkles size={13} className="text-[#BD532B]" />
                      <span>Discuss with Stella</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-[#878074]">
                <FileText size={28} className="mx-auto mb-2 text-[#C9C2B0]" />
                <p className="text-xs">Select an archival item from the catalog ledger.</p>
              </div>
            )}
          </div>
        </aside>
      ) : (
        /* Collapsed Reopen Tab for Right Dossier */
        <button
          type="button"
          onClick={() => setIsRightSidebarOpen(true)}
          className="absolute top-4 right-3 z-30 p-2 bg-[#FAF8F2] border border-[#C9C2B0] rounded-lg shadow-md text-[#575249] hover:text-[#1C1917] hover:bg-[#EFECE4] transition-all focus:outline-none"
          title="Open Reading Dossier"
        >
          <PanelRightOpen size={16} />
        </button>
      )}

      {/* Import Modal */}
      <Modal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)}>
        <ImportWizard
          workspaceId={workspaceId}
          userId={userId || ''}
          onImportComplete={() => {
            setIsImportModalOpen(false);
            fetchData();
          }}
          onClose={() => setIsImportModalOpen(false)}
        />
      </Modal>
    </div>
  );
};
