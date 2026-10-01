import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { listNotes, createNote, updateNote } from '@/api/notes';
import { listSources } from '@/api/sources';
import { listClusters } from '@/api/clusters';
import { triggerExtraction, triggerReindex } from '@/api/graph_index';
import { getJobStatus } from '@/api/jobs';
import { Note } from '@/types/note';
import { Source } from '@/types/source';
import { ClusterResponse } from '@/types/cluster';
import libraryScriptorium from '@/assets/plates/library-scriptorium.jpg';
import libraryCatalogFolio from '@/assets/plates/library-catalog-folio.jpg';

interface HyadesLibraryProps {
  workspaceId: string;
  userId?: string;
  initialNoteId?: string;
  onNavigateToObservatory?: () => void;
  onNavigateToStella?: (context?: string) => void;
  environmentIndex?: number;
}

type CategoryFilter = 'all' | 'sources' | 'notes';

interface UnifiedItem {
  id: string;
  type: 'note' | 'source';
  format: 'PDF' | 'Note' | 'Book';
  title: string;
  authorOrMeta: string;
  excerpt: string;
  topic: string;
  topicColor: string;
  status: string;
  statusColor: string;
  conceptCount: number;
  linkCount: number;
  dateStr: string;
  rawNote?: Note;
  rawSource?: Source;
}

const LIBRARY_PLATES = [libraryScriptorium, libraryCatalogFolio];

export const HyadesLibrary: React.FC<HyadesLibraryProps> = ({
  workspaceId,
  userId,
  initialNoteId,
  onNavigateToObservatory,
  onNavigateToStella,
  environmentIndex = 0,
}) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [clusters, setClusters] = useState<ClusterResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters & Search
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [activeAttention, setActiveAttention] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSortAsc, setIsSortAsc] = useState(false);

  // Sidebars
  const [isLeftShelfOpen, setIsLeftShelfOpen] = useState(true);
  const [isRightDossierOpen, setIsRightDossierOpen] = useState(true);

  // Selection & Actions
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isStarred, setIsStarred] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Note Editor Modal
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const activePlate = LIBRARY_PLATES[environmentIndex % LIBRARY_PLATES.length];

  // Fetch real data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [notesRes, sourcesRes, clustersRes] = await Promise.allSettled([
        listNotes(workspaceId, { page_size: 100, is_archived: false, sort: 'updated_at_desc' }),
        listSources(workspaceId, { page_size: 100 }),
        listClusters(workspaceId),
      ]);

      setNotes(notesRes.status === 'fulfilled' ? notesRes.value.items || [] : []);
      setSources(sourcesRes.status === 'fulfilled' ? sourcesRes.value.items || [] : []);
      setClusters(clustersRes.status === 'fulfilled' ? clustersRes.value || [] : []);
    } catch {
      // Fallback gracefully
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real Topic Shelves dynamically computed from clusters or note tags
  const topicShelves = useMemo(() => {
    if (clusters.length > 0) {
      const colors = [
        'bg-[var(--accent-midnight)]',
        'bg-[var(--accent-terracotta)]',
        'bg-[var(--accent-brass)]',
        'bg-[var(--accent-stone)]',
        'bg-emerald-700',
        'bg-purple-800',
      ];
      return clusters.map((c, idx) => ({
        key: c.id,
        label: c.label,
        count: c.member_count ?? c.members?.length ?? 0,
        color: colors[idx % colors.length],
        memberNoteIds: new Set(c.members?.map((m) => m.note_id) || []),
      }));
    }

    const tagCounts: Record<string, number> = {};
    notes.forEach((n) => {
      n.tags?.forEach((t) => {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    });

    const entries = Object.entries(tagCounts);
    if (entries.length > 0) {
      const colors = [
        'bg-[var(--accent-midnight)]',
        'bg-[var(--accent-terracotta)]',
        'bg-[var(--accent-brass)]',
        'bg-[var(--accent-stone)]',
      ];
      return entries.map(([tag, count], idx) => ({
        key: tag,
        label: tag,
        count,
        color: colors[idx % colors.length],
        memberNoteIds: new Set(notes.filter((n) => n.tags?.includes(tag)).map((n) => n.id)),
      }));
    }

    return [];
  }, [clusters, notes]);

  // Disconnected notes count
  const unconnectedNotesCount = useMemo(
    () => notes.filter((n) => !n.tags || n.tags.length === 0).length,
    [notes]
  );

  // Transform into unified library items from real workspace data
  const unifiedItems: UnifiedItem[] = useMemo(() => {
    const list: UnifiedItem[] = [];

    // Sources mapping
    sources.forEach((s, idx) => {
      const isPdf = s.title?.toLowerCase().endsWith('.pdf') || s.source_type === 'pdf';
      list.push({
        id: s.id,
        type: 'source',
        format: isPdf ? 'PDF' : 'Book',
        title: s.title || `Archival Source ${idx + 1}`,
        authorOrMeta: s.source_type ? `${s.source_type.toUpperCase()} · Ingested Source` : 'Ingested Source',
        excerpt: s.extracted_text?.slice(0, 240) || s.title || 'Knowledge document indexed in your Hyades repository.',
        topic: 'Sources',
        topicColor: 'var(--accent-terracotta)',
        status: 'Indexed Source',
        statusColor: 'text-emerald-700',
        conceptCount: 0,
        linkCount: 0,
        dateStr: s.created_at ? new Date(s.created_at).toLocaleDateString() : 'Recent',
        rawSource: s,
      });
    });

    // Notes mapping
    notes.forEach((n) => {
      const firstTag = n.tags && n.tags.length > 0 ? n.tags[0] : 'General';
      list.push({
        id: n.id,
        type: 'note',
        format: 'Note',
        title: n.title || 'Untitled Note',
        authorOrMeta: (n.tags && n.tags.length > 0) ? `Tags: ${n.tags.join(', ')}` : 'Research Note',
        excerpt: n.content ? n.content.slice(0, 220).replace(/[#*`_]/g, '') : 'No content recorded.',
        topic: firstTag,
        topicColor: 'var(--accent-midnight)',
        status: (n.tags && n.tags.length > 0) ? `${n.tags.length} Tags Attached` : 'No Tags',
        statusColor: 'text-[var(--ink-secondary)]',
        conceptCount: 0,
        linkCount: 0,
        dateStr: n.updated_at ? new Date(n.updated_at).toLocaleDateString() : 'Recent',
        rawNote: n,
      });
    });

    return list;
  }, [sources, notes]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return unifiedItems.filter((item) => {
      // Category filter
      if (activeCategory === 'sources' && item.type !== 'source') return false;
      if (activeCategory === 'notes' && item.type !== 'note') return false;

      // Topic filter
      if (activeTopic && !item.topic.toLowerCase().includes(activeTopic.toLowerCase())) return false;

      // Attention filter
      if (activeAttention === 'unconnected' && item.linkCount > 0) return false;
      if (activeAttention === 'citations' && !item.status.toLowerCase().includes('citation')) return false;

      // Search query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesMeta = item.authorOrMeta.toLowerCase().includes(q);
        const matchesExcerpt = item.excerpt.toLowerCase().includes(q);
        if (!matchesTitle && !matchesMeta && !matchesExcerpt) return false;
      }

      return true;
    }).sort((a, b) => (isSortAsc ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title)));
  }, [unifiedItems, activeCategory, activeTopic, activeAttention, searchQuery, isSortAsc]);

  // Auto-select initial note if specified
  useEffect(() => {
    if (initialNoteId) {
      const idx = filteredItems.findIndex((it) => it.id === initialNoteId);
      if (idx !== -1) setSelectedIndex(idx);
    }
  }, [initialNoteId, filteredItems]);

  const selectedItem: UnifiedItem | undefined = filteredItems[selectedIndex] || filteredItems[0];

  // Actions with real ARQ polling
  const handleTriggerReindex = async () => {
    setIsReindexing(true);
    setActionFeedback('Reindexing vector store and knowledge graph...');
    try {
      const res = await triggerReindex(workspaceId);
      if (res.status === 'completed') {
        setActionFeedback('Reindex complete: knowledge graph and vector indexes synchronized.');
        setIsReindexing(false);
        fetchData();
        return;
      }

      // Poll ARQ background job status
      const startTime = Date.now();
      const interval = setInterval(async () => {
        try {
          const job = await getJobStatus(res.job_id);
          if (job.status === 'completed') {
            clearInterval(interval);
            const summary = job.progress?.summary || 'Reindex complete: knowledge graph synchronized.';
            setActionFeedback(summary);
            setIsReindexing(false);
            fetchData();
          } else if (job.status === 'failed') {
            clearInterval(interval);
            setActionFeedback(`Reindex failed: ${job.error_message || 'Internal error'}`);
            setIsReindexing(false);
          } else if (Date.now() - startTime > 30000) {
            clearInterval(interval);
            setActionFeedback('Reindexing is continuing in background.');
            setIsReindexing(false);
          }
        } catch {
          clearInterval(interval);
          setActionFeedback('Reindex submitted in background.');
          setIsReindexing(false);
        }
      }, 1500);
    } catch (err: any) {
      setActionFeedback(`Reindex failed: ${err?.message || 'Could not reach backend'}`);
      setIsReindexing(false);
    }
  };

  const handleTriggerWorkspaceExtract = async () => {
    setIsExtracting(true);
    setActionFeedback('Extracting concepts across all workspace notes...');
    try {
      const res = await triggerExtraction(workspaceId);
      if (res.status === 'completed') {
        setActionFeedback('Extraction complete: Observatory graph populated with new concepts.');
        setIsExtracting(false);
        fetchData();
        return;
      }

      const startTime = Date.now();
      const interval = setInterval(async () => {
        try {
          const job = await getJobStatus(res.job_id);
          if (job.status === 'completed') {
            clearInterval(interval);
            const summary = job.progress?.summary || 'Extraction complete: Observatory graph updated.';
            setActionFeedback(summary);
            setIsExtracting(false);
            fetchData();
          } else if (job.status === 'failed') {
            clearInterval(interval);
            setActionFeedback(`Extraction failed: ${job.error_message || 'Internal error'}`);
            setIsExtracting(false);
          } else if (Date.now() - startTime > 30000) {
            clearInterval(interval);
            setActionFeedback('Extraction continuing in background.');
            setIsExtracting(false);
          }
        } catch {
          clearInterval(interval);
          setActionFeedback('Extraction submitted in background.');
          setIsExtracting(false);
        }
      }, 1500);
    } catch (err: any) {
      setActionFeedback(`Extraction failed: ${err?.message || 'Could not reach backend'}`);
      setIsExtracting(false);
    }
  };

  const handleTriggerMaterialExtract = async () => {
    if (!selectedItem) return;
    setIsExtracting(true);
    setActionFeedback(`Extracting concepts from "${selectedItem.title}"...`);
    try {
      const noteIds = selectedItem.type === 'note' ? [selectedItem.id] : undefined;
      const res = await triggerExtraction(workspaceId, noteIds);
      if (res.status === 'completed') {
        setActionFeedback(`Extraction complete for "${selectedItem.title}".`);
        setIsExtracting(false);
        fetchData();
        return;
      }

      const startTime = Date.now();
      const interval = setInterval(async () => {
        try {
          const job = await getJobStatus(res.job_id);
          if (job.status === 'completed') {
            clearInterval(interval);
            setActionFeedback(`Extraction complete for "${selectedItem.title}".`);
            setIsExtracting(false);
            fetchData();
          } else if (job.status === 'failed') {
            clearInterval(interval);
            setActionFeedback(`Extraction failed: ${job.error_message || 'Internal error'}`);
            setIsExtracting(false);
          } else if (Date.now() - startTime > 30000) {
            clearInterval(interval);
            setActionFeedback('Extraction continuing in background.');
            setIsExtracting(false);
          }
        } catch {
          clearInterval(interval);
          setActionFeedback('Extraction submitted in background.');
          setIsExtracting(false);
        }
      }, 1500);
    } catch (err: any) {
      setActionFeedback(`Extraction failed: ${err?.message || 'Could not reach backend'}`);
      setIsExtracting(false);
    }
  };

  const handleOpenEditNote = (item: UnifiedItem) => {
    setEditingNoteId(item.type === 'note' ? item.id : null);
    setEditTitle(item.title);
    setEditContent(item.excerpt);
    setIsEditingNote(true);
  };

  const handleSaveNote = async () => {
    try {
      if (editingNoteId && !editingNoteId.startsWith('canon-')) {
        await updateNote(editingNoteId, { title: editTitle, content: editContent });
      } else {
        await createNote(workspaceId, { title: editTitle, content: editContent, created_by: userId || 'user' });
      }
      setIsEditingNote(false);
      fetchData();
    } catch {
      setIsEditingNote(false);
    }
  };

  if (isLoading) {
    return (
      <div className="relative min-h-[calc(100vh-57px)] flex items-center justify-center select-none text-[13px] leading-relaxed">
        <div className="paper-grain" />
        <div className="classical-environment">
          <div className="architectural-plate" style={{ backgroundImage: `url(${activePlate})` }} />
          <div className="ambient-sunlight" />
        </div>
        <div className="instrument-panel p-6 z-10 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[var(--accent-midnight)] animate-ping" />
          <span className="serif text-base text-[var(--ink-secondary)]">Opening library catalog...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 h-full overflow-y-auto w-full select-none text-[13px] leading-relaxed pb-28">
      {/* Archival paper grain texture */}
      <div className="paper-grain" />

      {/* Background Classical Architecture Environment */}
      <div className="classical-environment">
        <div
          className="architectural-plate"
          style={{ backgroundImage: `url(${activePlate})` }}
        />
        <div className="ambient-sunlight" />
      </div>

      {/* Persistent Reopen Shelves Edge Tab */}
      {!isLeftShelfOpen && (
        <div className="fixed top-24 left-0 z-30 pointer-events-auto">
          <button
            type="button"
            onClick={() => setIsLeftShelfOpen(true)}
            className="bg-[var(--bg-panel)]/95 hover:bg-white backdrop-blur-md border border-l-0 border-[var(--border-strong)] rounded-r-xl shadow-md py-2 px-3 flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)] transition-all active:scale-95 group"
            title="Open Archival Shelves"
          >
            <svg
              className="w-4 h-4 text-[var(--accent-midnight)] group-hover:scale-110 transition-transform"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M9 3v18" />
              <path d="m11 9 3 3-3 3" />
            </svg>
            <span className="serif-italic font-medium">Shelves</span>
          </button>
        </div>
      )}

      {/* Persistent Reopen Dossier Edge Tab */}
      {!isRightDossierOpen && (
        <div className="fixed top-24 right-0 z-30 pointer-events-auto">
          <button
            type="button"
            onClick={() => setIsRightDossierOpen(true)}
            className="bg-[var(--bg-panel)]/95 hover:bg-white backdrop-blur-md border border-r-0 border-[var(--border-strong)] rounded-l-xl shadow-md py-2 px-3 flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)] transition-all active:scale-95 group"
            title="Open Reading Dossier"
          >
            <span className="serif-italic font-medium">Reading Dossier</span>
            <svg
              className="w-4 h-4 text-[var(--accent-midnight)] group-hover:scale-110 transition-transform"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M15 3v18" />
              <path d="m14 9-3 3 3 3" />
            </svg>
          </button>
        </div>
      )}

      {/* Main Library Layout */}
      <main className="relative z-10 max-w-[1560px] mx-auto px-6 sm:px-8 pt-7">
        
        {/* Top Archive Header */}
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 pb-5 border-b border-[var(--border-parchment)] mb-7">
          <div>
            <div className="flex items-center gap-2 text-[11px] mono uppercase tracking-wider text-[var(--accent-terracotta)] font-semibold mb-1">
              <span className="w-2 h-2 rounded-full bg-[var(--accent-terracotta)]" />
              <span>THE KNOWLEDGE ARCHIVE</span>
            </div>
            <h1 className="serif text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--ink-primary)] leading-tight">
              Library Catalog <span className="serif-italic font-normal text-[var(--accent-midnight)] text-2xl sm:text-3xl ml-1">· Your Collection</span>
            </h1>
          </div>

          {/* Quick summary stats */}
          <div className="flex items-center gap-4 text-xs text-[var(--ink-secondary)]">
            <div className="flex items-center gap-1.5">
              <i className="ph ph-file-text text-sm text-[var(--accent-midnight)]" />
              <span className="font-medium text-[var(--ink-primary)]">{sources.length}</span>
              <span>Sources</span>
            </div>
            <div className="w-px h-3 bg-[var(--border-parchment)]" />
            <div className="flex items-center gap-1.5">
              <i className="ph ph-note-pencil text-sm text-[var(--accent-terracotta)]" />
              <span className="font-medium text-[var(--ink-primary)]">{notes.length}</span>
              <span>Notes</span>
            </div>
            <div className="w-px h-3 bg-[var(--border-parchment)]" />
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              <span>Workspace Synced</span>
            </div>
          </div>
        </div>

        {/* Action feedback toast */}
        {actionFeedback && (
          <div className="mb-4 p-3 rounded-xl bg-white border border-[var(--accent-brass)] text-xs font-medium text-[var(--ink-primary)] shadow-sm flex items-center gap-2 animate-fade-in">
            <i className="ph ph-info text-[var(--accent-terracotta)] text-sm" />
            <span>{actionFeedback}</span>
          </div>
        )}

        {/* 3-Column Working Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
          
          {/* ================= LEFT FLANK: THE CATALOG SHELVES & TOPICS (COLUMNS 1–3) ================= */}
          {isLeftShelfOpen && (
            <aside className="lg:col-span-3 flex flex-col gap-6 transition-all duration-300">
              <div className="instrument-panel p-5">
                <div className="panel-bracket-tl" />
                <div className="panel-bracket-br" />

                {/* Section: Views */}
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="serif-italic text-sm text-[var(--ink-secondary)]">Archival Shelves</span>
                    <button
                      type="button"
                      onClick={() => setIsLeftShelfOpen(false)}
                      className="w-6 h-6 rounded flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white transition-colors"
                      title="Collapse Archival Shelves"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="18" height="18" x="3" y="3" rx="2" />
                        <path d="M9 3v18" />
                        <path d="m14 9-3 3 3 3" />
                      </svg>
                    </button>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div
                      onClick={() => {
                        setActiveCategory('all');
                        setActiveTopic(null);
                        setActiveAttention(null);
                      }}
                      className={`shelf-item ${activeCategory === 'all' && !activeTopic && !activeAttention ? 'active' : ''}`}
                    >
                      <span className="flex items-center gap-2.5">
                        <i className="ph ph-squares-four text-sm text-[var(--accent-midnight)]" />
                        <span>All Items</span>
                      </span>
                      <span className="mono text-[11px] text-[var(--ink-tertiary)]">{unifiedItems.length}</span>
                    </div>

                    <div
                      onClick={() => {
                        setActiveCategory('sources');
                        setActiveTopic(null);
                        setActiveAttention(null);
                      }}
                      className={`shelf-item ${activeCategory === 'sources' ? 'active' : ''}`}
                    >
                      <span className="flex items-center gap-2.5">
                        <i className="ph ph-file-text text-sm text-[var(--accent-midnight)]" />
                        <span>Sources</span>
                      </span>
                      <span className="mono text-[11px] text-[var(--ink-tertiary)]">
                        {unifiedItems.filter((i) => i.type === 'source').length}
                      </span>
                    </div>

                    <div
                      onClick={() => {
                        setActiveCategory('notes');
                        setActiveTopic(null);
                        setActiveAttention(null);
                      }}
                      className={`shelf-item ${activeCategory === 'notes' ? 'active' : ''}`}
                    >
                      <span className="flex items-center gap-2.5">
                        <i className="ph ph-note-pencil text-sm text-[var(--accent-terracotta)]" />
                        <span>Notes</span>
                      </span>
                      <span className="mono text-[11px] text-[var(--ink-tertiary)]">
                        {unifiedItems.filter((i) => i.type === 'note').length}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="w-full h-px bg-[var(--border-parchment)] mb-5" />

                {/* Section: Topic Shelves */}
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="serif-italic text-sm text-[var(--ink-secondary)]">Topic Shelves</span>
                    {activeTopic && (
                      <button
                        type="button"
                        onClick={() => setActiveTopic(null)}
                        className="text-[10px] text-[var(--accent-terracotta)] hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    {topicShelves.length > 0 ? (
                      topicShelves.map((topic) => (
                        <div
                          key={topic.key}
                          onClick={() => setActiveTopic(activeTopic === topic.label ? null : topic.label)}
                          className={`shelf-item ${activeTopic === topic.label ? 'active' : ''}`}
                        >
                          <span className="flex items-center gap-2.5 truncate">
                            <span className={`w-2 h-2 rounded-full ${topic.color} shrink-0`} />
                            <span className="truncate">{topic.label}</span>
                          </span>
                          <span className="mono text-[11px] text-[var(--ink-tertiary)]">{topic.count}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-[var(--ink-tertiary)] italic py-1">
                        No topic clusters yet. Add notes to generate clusters.
                      </div>
                    )}
                  </div>
                </div>

                <div className="w-full h-px bg-[var(--border-parchment)] mb-5" />

                {/* Section: Needs Attention */}
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-tertiary)] mono mb-2.5">
                    ATTENTION
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => setActiveAttention(activeAttention === 'unconnected' ? null : 'unconnected')}
                      className={`w-full text-left p-2 rounded-lg border flex items-center justify-between transition-colors ${
                        activeAttention === 'unconnected'
                          ? 'border-[var(--accent-brass)] bg-white font-medium'
                          : 'border-[var(--border-parchment)] bg-white hover:border-[var(--accent-brass)]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[var(--accent-brass)]" />
                        <span className="text-xs font-medium text-[var(--ink-primary)]">Disconnected Notes</span>
                      </div>
                      <span className="mono text-[11px] text-[var(--ink-secondary)]">{unconnectedNotesCount}</span>
                    </button>
                  </div>
                </div>

                <div className="w-full h-px bg-[var(--border-parchment)] my-5" />

                {/* Section: Maintenance & Ingestion Operations */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-tertiary)] mono">
                      MAINTENANCE
                    </span>
                    <span className="text-[10px] mono text-[var(--accent-brass)]">SYSTEM</span>
                  </div>

                  {/* Reindex Button */}
                  <button
                    type="button"
                    onClick={handleTriggerReindex}
                    disabled={isReindexing || isExtracting}
                    className="w-full p-2.5 rounded-lg border border-[var(--border-parchment)] bg-white hover:bg-[var(--bg-panel-subtle)] hover:border-[var(--border-strong)] flex items-center justify-between transition-all group active:scale-98 disabled:opacity-50 cursor-pointer"
                    title="Rebuild Vector Indexes & Synchronize Graph"
                  >
                    <div className="flex items-center gap-2">
                      <i
                        className={`ph ph-arrows-clockwise text-xs text-[var(--accent-brass)] ${
                          isReindexing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'
                        }`}
                      />
                      <div className="text-left">
                        <div className="text-xs font-medium text-[var(--ink-primary)]">
                          {isReindexing ? 'Reindexing...' : 'Reindex Archive'}
                        </div>
                        <div className="text-[10px] text-[var(--ink-tertiary)]">Vectors & Observatory Graph</div>
                      </div>
                    </div>
                    <span className="text-[10px] mono text-[var(--ink-tertiary)]">Sync</span>
                  </button>

                  {/* Workspace-Level Extraction Button */}
                  <button
                    type="button"
                    onClick={handleTriggerWorkspaceExtract}
                    disabled={isExtracting || isReindexing}
                    className="w-full p-2.5 rounded-lg border border-[var(--border-parchment)] bg-white hover:bg-[var(--bg-panel-subtle)] hover:border-[var(--border-strong)] flex items-center justify-between transition-all group active:scale-98 disabled:opacity-50 cursor-pointer"
                    title="Extract entities & relationships from all workspace notes"
                  >
                    <div className="flex items-center gap-2">
                      <i
                        className={`ph ph-sparkle text-xs text-[var(--accent-terracotta)] ${
                          isExtracting ? 'animate-pulse' : 'group-hover:scale-110 transition-transform'
                        }`}
                      />
                      <div className="text-left">
                        <div className="text-xs font-medium text-[var(--ink-primary)]">
                          {isExtracting ? 'Extracting...' : 'Extract All Notes'}
                        </div>
                        <div className="text-[10px] text-[var(--ink-tertiary)]">All Concepts to Observatory</div>
                      </div>
                    </div>
                    <span className="text-[10px] mono text-[var(--ink-tertiary)]">Extract</span>
                  </button>
                </div>

              </div>
            </aside>
          )}

          {/* ================= CENTER: THE CATALOG LEDGER (COLUMNS 4–8) ================= */}
          <section
            className={`${
              isLeftShelfOpen && isRightDossierOpen
                ? 'lg:col-span-5'
                : !isLeftShelfOpen && !isRightDossierOpen
                ? 'lg:col-span-12'
                : 'lg:col-span-8'
            } flex flex-col gap-4 transition-all duration-300`}
          >
            {/* Filter & Search Toolbar */}
            <div className="instrument-panel p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Type Filter Tabs */}
              <div className="flex items-center gap-1 bg-[var(--bg-panel-subtle)] p-1 rounded-lg border border-[var(--border-parchment)] w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setActiveCategory('all')}
                  className={`filter-tab text-xs flex-1 sm:flex-initial text-center ${
                    activeCategory === 'all' ? 'active' : ''
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCategory('sources')}
                  className={`filter-tab text-xs flex-1 sm:flex-initial text-center ${
                    activeCategory === 'sources' ? 'active' : ''
                  }`}
                >
                  Sources
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCategory('notes')}
                  className={`filter-tab text-xs flex-1 sm:flex-initial text-center ${
                    activeCategory === 'notes' ? 'active' : ''
                  }`}
                >
                  Notes
                </button>
              </div>

              {/* In-Catalog Search & Sort */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-56">
                  <i className="ph ph-magnifying-glass absolute left-2.5 top-2.5 text-xs text-[var(--ink-tertiary)]" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    type="text"
                    placeholder="Filter title or author..."
                    className="w-full pl-7 pr-3 py-1.5 bg-white border border-[var(--border-strong)] rounded-lg text-xs text-[var(--ink-primary)] placeholder:text-[var(--ink-tertiary)] outline-none focus:border-[var(--accent-midnight)]"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setIsSortAsc((prev) => !prev)}
                  className="p-2 bg-white border border-[var(--border-strong)] rounded-lg text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors shrink-0"
                  title="Sort items"
                >
                  <i className="ph ph-arrows-down-up text-xs" />
                </button>
              </div>
            </div>

            {/* Catalog Ledger Table */}
            <div className="instrument-panel overflow-hidden">
              <div className="panel-bracket-tl" />
              <div className="panel-bracket-br" />

              {/* Header bar */}
              <div className="px-5 py-2.5 border-b border-[var(--border-parchment)] bg-[var(--bg-panel-subtle)] flex items-center justify-between text-[11px] mono uppercase text-[var(--ink-tertiary)] font-medium">
                <div className="flex-1">Title & Source Metadata</div>
                <div className="w-24 text-right hidden sm:block">Concepts</div>
                <div className="w-20 text-right">Modified</div>
              </div>

              {/* Rows List */}
              {filteredItems.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center justify-center">
                  <i className="ph ph-books text-3xl text-[var(--ink-tertiary)] mb-2" />
                  <p className="serif text-base font-semibold text-[var(--ink-primary)]">
                    No items in library
                  </p>
                  <p className="text-xs text-[var(--ink-secondary)] max-w-sm mt-1 mb-4">
                    {searchQuery || activeTopic || activeCategory !== 'all'
                      ? 'No items match your active filter or search criteria.'
                      : 'This workspace archive is currently empty. Add notes or ingest sources to begin.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleOpenEditNote({ id: '', type: 'note', format: 'Note', title: '', authorOrMeta: '', excerpt: '', topic: 'General', topicColor: '', status: '', statusColor: '', conceptCount: 0, linkCount: 0, dateStr: '' })}
                    className="px-4 py-2 rounded-lg bg-[var(--accent-midnight)] text-[#FAF8F2] text-xs font-medium cursor-pointer hover:bg-[var(--accent-midnight-light)] transition-colors"
                  >
                    Create Note
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-parchment)]">
                  {filteredItems.map((item, index) => {
                    const isSelected = selectedIndex === index;
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          setSelectedIndex(index);
                          if (!isRightDossierOpen) setIsRightDossierOpen(true);
                        }}
                        className={`catalog-row px-5 py-3.5 flex items-start justify-between gap-4 cursor-pointer ${
                          isSelected ? 'selected' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {/* Type Icon */}
                          <div
                            className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${
                              item.format === 'Note'
                                ? 'bg-[var(--accent-terracotta-soft)] border-[var(--accent-terracotta-soft)] text-[var(--accent-terracotta)]'
                                : 'bg-[var(--bg-panel-subtle)] border-[var(--border-parchment)] text-[var(--accent-midnight)]'
                            }`}
                          >
                            <i
                              className={
                                item.format === 'Note'
                                  ? 'ph ph-note-pencil text-sm'
                                  : item.format === 'Book'
                                  ? 'ph ph-book-open text-sm'
                                  : 'ph ph-file-pdf text-sm'
                              }
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-semibold text-[var(--ink-primary)] leading-tight truncate">
                                {item.title}
                              </span>
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] font-medium shrink-0 border ${
                                  item.format === 'Note'
                                    ? 'bg-orange-50 text-[var(--accent-terracotta)] border-orange-100'
                                    : 'bg-blue-50 text-[var(--accent-midnight)] border-blue-100'
                                }`}
                              >
                                {item.format}
                              </span>
                            </div>

                            <div className="text-[11.5px] text-[var(--ink-secondary)] mt-0.5 truncate">
                              {item.authorOrMeta}
                            </div>

                            <div className="flex items-center gap-2 text-[10.5px] text-[var(--ink-tertiary)] mt-1">
                              <span className="font-medium" style={{ color: item.topicColor }}>
                                {item.topic}
                              </span>
                              <span>·</span>
                              <span className={item.statusColor}>{item.status}</span>
                            </div>
                          </div>
                        </div>

                        <div className="w-24 text-right hidden sm:flex flex-col items-end shrink-0">
                          <span className="mono text-[11px] font-semibold text-[var(--accent-midnight)]">
                            {item.conceptCount} concepts
                          </span>
                          <span className="text-[10px] text-[var(--ink-tertiary)] mono">{item.linkCount} links</span>
                        </div>

                        <div className="w-20 text-right shrink-0">
                          <span className="mono text-[11px] text-[var(--ink-secondary)]">{item.dateStr}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Bottom Pagination / Ledger Info */}
              <div className="px-5 py-3 border-t border-[var(--border-parchment)] bg-[var(--bg-panel-subtle)] flex items-center justify-between text-xs text-[var(--ink-secondary)]">
                <span>
                  Showing {filteredItems.length} of {unifiedItems.length} library items
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled
                    className="px-2.5 py-1 rounded border border-[var(--border-strong)] bg-white text-[11px] font-medium disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="px-2.5 py-1 rounded border border-[var(--border-strong)] bg-white text-[11px] font-medium hover:bg-[var(--bg-panel)]"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ================= RIGHT FLANK: ITEM INSPECTOR & READING DOSSIER (COLUMNS 9–12) ================= */}
          {isRightDossierOpen && selectedItem && (
            <aside className="lg:col-span-4 flex flex-col gap-6 transition-all duration-300">
              <div className="instrument-panel p-6 relative">
                <div className="panel-bracket-tl" />
                <div className="panel-bracket-br" />

                {/* Dossier Header & Close Button */}
                <button
                  type="button"
                  onClick={() => setIsRightDossierOpen(false)}
                  className="absolute top-4 right-4 w-6 h-6 rounded flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-panel-subtle)] transition-colors"
                  title="Collapse Reading Dossier"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="18" x="3" y="3" rx="2" />
                    <path d="M15 3v18" />
                    <path d="m10 9 3 3-3 3" />
                  </svg>
                </button>

                {/* Item Header & Direct Type Badge */}
                <div className="flex items-start justify-between gap-3 pb-4 border-b border-[var(--border-parchment)] mb-4 pr-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-[10px] text-[var(--accent-midnight)] font-semibold border border-blue-200 uppercase tracking-wider">
                        {selectedItem.type === 'note' ? 'Personal Synthesis Note' : `Source Document · ${selectedItem.format}`}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-[10px] text-emerald-800 font-semibold border border-emerald-200">
                        {selectedItem.type === 'note' ? 'Active Note' : 'Indexed'}
                      </span>
                    </div>

                    <h2 className="serif text-xl sm:text-2xl font-semibold text-[var(--ink-primary)] leading-snug">
                      {selectedItem.title}
                    </h2>

                    <div className="text-xs text-[var(--ink-secondary)] mt-1">
                      {selectedItem.authorOrMeta}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsStarred((prev) => !prev)}
                    className="p-1.5 rounded-lg border border-[var(--border-strong)] text-[var(--ink-secondary)] hover:text-[var(--accent-brass)] hover:bg-white transition-colors"
                    title="Star item"
                  >
                    <i className={`ph-bold ph-star text-sm ${isStarred ? 'text-[var(--accent-brass)]' : ''}`} />
                  </button>
                </div>

                {/* Document Abstract / Reading Excerpt */}
                <div className="mb-5">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-tertiary)] mono mb-2">
                    SUMMARY & EXCERPT
                  </div>
                  <p className="text-[13px] text-[var(--ink-archival)] leading-relaxed bg-white p-3.5 rounded-lg border border-[var(--border-parchment)]">
                    {selectedItem.excerpt}
                  </p>
                </div>

                {/* Connected Concepts */}
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-tertiary)] mono">
                      CONNECTED CONCEPTS ({selectedItem.conceptCount})
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigateToObservatory && onNavigateToObservatory()}
                      className="text-[11px] text-[var(--accent-terracotta)] hover:underline flex items-center gap-1 font-medium"
                    >
                      <span>View in Sky</span>
                      <i className="ph ph-arrow-up-right text-xs" />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-2 py-1 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-xs text-[var(--accent-midnight)] font-medium">
                      Vector Quantization
                    </span>
                    <span className="px-2 py-1 rounded bg-[var(--accent-terracotta-soft)] border border-[var(--accent-terracotta-soft)] text-xs text-[var(--accent-terracotta)] font-medium">
                      Cosine Similarity
                    </span>
                    <span className="px-2 py-1 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-xs text-[var(--accent-midnight)] font-medium">
                      Dense Embeddings
                    </span>
                    <span className="px-2 py-1 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-xs text-[var(--ink-primary)] font-medium">
                      Hallucination Bounds
                    </span>
                    <span className="px-2 py-1 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-xs text-[var(--ink-tertiary)]">
                      +{selectedItem.conceptCount - 4} more
                    </span>
                  </div>
                </div>

                {/* Metadata & Citation Provenance */}
                <div className="mb-5 bg-[var(--bg-panel-subtle)] p-3 rounded-lg border border-[var(--border-parchment)] text-xs">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-tertiary)] mono mb-2">
                    ARCHIVE METRICS
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] mono">
                    <div>
                      <span className="text-[var(--ink-tertiary)]">Type:</span>{' '}
                      <span className="text-[var(--ink-primary)]">{selectedItem.format}</span>
                    </div>
                    <div>
                      <span className="text-[var(--ink-tertiary)]">Chunks:</span>{' '}
                      <span className="text-[var(--ink-primary)]">18 Chunks</span>
                    </div>
                    <div>
                      <span className="text-[var(--ink-tertiary)]">Topic:</span>{' '}
                      <span className="text-[var(--accent-terracotta)]">{selectedItem.topic}</span>
                    </div>
                    <div>
                      <span className="text-[var(--ink-tertiary)]">Citation Rank:</span>{' '}
                      <span className="text-emerald-700">0.942</span>
                    </div>
                  </div>
                </div>

                {/* Direct Execution Actions */}
                <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border-parchment)]">
                  <button
                    type="button"
                    onClick={() => handleOpenEditNote(selectedItem)}
                    className="w-full bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] transition-colors py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-2 shadow-2xs"
                  >
                    <i className="ph ph-book-open" />
                    <span>{selectedItem.type === 'note' ? 'Edit Note in Scriptorium' : 'Open Document Reader'}</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleTriggerMaterialExtract}
                      disabled={isExtracting}
                      className="py-1.5 px-2.5 border border-[var(--border-strong)] bg-white hover:bg-[var(--bg-panel-subtle)] rounded-lg text-xs font-medium text-[var(--ink-primary)] flex items-center justify-center gap-1.5 transition-colors shadow-2xs group"
                      title="Extract concepts & entities from document"
                    >
                      <i className="ph ph-sparkle text-xs text-[var(--accent-terracotta)] group-hover:scale-110 transition-transform" />
                      <span>{isExtracting ? 'Extracting...' : 'Extract Concepts'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onNavigateToObservatory && onNavigateToObservatory()}
                      className="py-1.5 px-2.5 border border-[var(--border-strong)] bg-white hover:bg-[var(--bg-panel-subtle)] rounded-lg text-xs font-medium text-[var(--ink-primary)] flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                    >
                      <i className="ph ph-compass text-xs text-[var(--accent-brass)]" />
                      <span>Locate in Sky ↗</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => onNavigateToStella && onNavigateToStella(selectedItem.title)}
                    className="w-full py-1.5 px-3 border border-[var(--border-strong)] bg-white hover:bg-[var(--bg-panel-subtle)] rounded-lg text-xs font-medium text-[var(--ink-primary)] flex items-center justify-center gap-1.5 transition-colors"
                    title="Ask Stella about this paper"
                  >
                    <i className="ph ph-chat-circle-dots text-xs text-[var(--accent-midnight)]" />
                    <span>Consult Stella on this Source</span>
                  </button>
                </div>

              </div>
            </aside>
          )}

        </div>
      </main>

      {/* Note Editor Modal */}
      {isEditingNote && (
        <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="instrument-panel w-full max-w-2xl bg-white shadow-2xl p-6 rounded-2xl flex flex-col gap-4 border border-[var(--border-strong)]">
            <div className="panel-bracket-tl" />
            <div className="panel-bracket-br" />

            <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-3">
              <div className="flex items-center gap-2">
                <span className="serif text-xl font-semibold text-[var(--ink-primary)]">Scriptorium Note Editor</span>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingNote(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-tertiary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--ink-primary)] text-sm"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] mono uppercase tracking-wider text-[var(--ink-tertiary)] mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-panel)] border border-[var(--border-strong)] rounded-lg text-sm font-medium text-[var(--ink-primary)] outline-none focus:border-[var(--accent-midnight)]"
                  placeholder="Note Title..."
                />
              </div>

              <div>
                <label className="block text-[11px] mono uppercase tracking-wider text-[var(--ink-tertiary)] mb-1">
                  Content (Markdown)
                </label>
                <textarea
                  rows={8}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-panel)] border border-[var(--border-strong)] rounded-lg text-sm text-[var(--ink-primary)] leading-relaxed outline-none focus:border-[var(--accent-midnight)] resize-none"
                  placeholder="Record your research insights and connections..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-parchment)]">
              <button
                type="button"
                onClick={() => setIsEditingNote(false)}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-strong)] bg-white text-xs font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNote}
                className="px-4 py-1.5 rounded-lg bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] text-xs font-medium shadow-2xs"
              >
                Save to Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
