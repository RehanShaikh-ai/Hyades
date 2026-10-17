import React, { useState, useEffect } from 'react';
import { InboxItem } from '@/types/inbox';
import {
  listInbox,
  getInboxItem,
  updateInboxItem,
  acceptInboxItem,
  rejectInboxItem,
  redetectInboxItem,
  uploadToInbox,
} from '@/api/inbox';
import { WorkspaceSidebarHeader } from '@/components/workspace/WorkspaceSidebarHeader';

interface HyadesInboxProps {
  workspaceId: string;
  onNavigate?: (dest: any) => void;
  workspaceName?: string;
}

export const HyadesInbox: React.FC<HyadesInboxProps> = ({
  workspaceId,
  onNavigate,
  workspaceName = 'Active Workspace',
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
  const [items, setItems] = useState<InboxItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);

  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  // Rejection confirmation modal state
  const [rejectingItem, setRejectingItem] = useState<InboxItem | null>(null);

  const loadInbox = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await listInbox(workspaceId, statusFilter === 'all' ? undefined : statusFilter);
      setItems(res.items);
      if (res.items.length > 0) {
        setSelectedItem((prev) => {
          if (!prev) {
            loadItemDetail(res.items[0].id);
            return res.items[0];
          }
          const matched = res.items.find((i) => i.id === prev.id);
          if (matched) {
            loadItemDetail(matched.id);
            return matched;
          }
          loadItemDetail(res.items[0].id);
          return res.items[0];
        });
      } else {
        setSelectedItem(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed loading inbox review items');
    } finally {
      setIsLoading(false);
    }
  };

  const loadItemDetail = async (id: string) => {
    try {
      const detail = await getInboxItem(id);
      setSelectedItem(detail);
      setEditedTitle(detail.source_title || '');
    } catch (e: any) {
      setError(e?.error?.message || (e instanceof Error ? e.message : 'Failed loading item detail'));
    }
  };

  useEffect(() => {
    if (workspaceId) {
      loadInbox();
    }
  }, [workspaceId, statusFilter]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await uploadToInbox(workspaceId, file);
      setSuccessMessage(`File "${file.name}" placed in Knowledge Inbox for review.`);
      await loadInbox();
    } catch (e: unknown) {
      const apiErr = e as { error?: { message?: string } } | Error;
      const msg =
        (apiErr as { error?: { message?: string } })?.error?.message ||
        (e instanceof Error ? e.message : 'Upload to Inbox failed');
      setError(msg);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleToggleExtractKnowledge = async (item: InboxItem) => {
    try {
      const updated = await updateInboxItem(item.id, {
        extract_knowledge: !item.extract_knowledge,
      });
      setSelectedItem(updated);
      await loadInbox();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed updating extraction setting');
    }
  };

  const handleSaveTitle = async () => {
    if (!selectedItem || !editedTitle.trim()) return;
    try {
      const updated = await updateInboxItem(selectedItem.id, {
        source_title: editedTitle.trim(),
      });
      setSelectedItem(updated);
      setIsEditingTitle(false);
      setSuccessMessage('Source title updated.');
      await loadInbox();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed updating source title');
    }
  };

  const handleAccept = async (item: InboxItem) => {
    if (isActionPending || item.status !== 'pending') return;
    setIsActionPending(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await acceptInboxItem(item.id);
      setSuccessMessage(`Item "${item.source_title}" accepted into Library catalog.`);
      await loadInbox();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed accepting item');
    } finally {
      setIsActionPending(false);
    }
  };

  const confirmReject = async () => {
    if (!rejectingItem || isActionPending || rejectingItem.status !== 'pending') return;
    setIsActionPending(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await rejectInboxItem(rejectingItem.id);
      setSuccessMessage(`Item "${rejectingItem.source_title}" permanently rejected and purged.`);
      setRejectingItem(null);
      await loadInbox();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed rejecting item');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleRedetect = async (item: InboxItem) => {
    if (isActionPending || item.status !== 'pending') return;
    setIsActionPending(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const updated = await redetectInboxItem(item.id);
      setSelectedItem(updated);
      setSuccessMessage('Concept re-detection completed.');
      await loadInbox();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed re-running concept detection');
    } finally {
      setIsActionPending(false);
    }
  };
  return (
    <div
      className="relative flex-1 h-[calc(100vh-57px)] flex flex-col md:flex-row overflow-x-hidden overflow-y-auto w-full select-none text-[13px] leading-relaxed bg-[var(--bg-base)] text-[var(--ink-primary)]"
      data-testid="hyades-inbox"
    >
      <div className="paper-grain" />
      <div className="classical-environment">
        <div className="ambient-sunlight" />
      </div>

      {/* Left Sidebar: Inbox List (Positioned on far left) */}
      <aside
        data-testid="workspace-sidebar"
        className={`flex-shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-[var(--border-parchment)] bg-[var(--bg-panel)]/95 backdrop-blur-sm z-10 transition-all duration-200 select-none ${
          isSidebarCollapsed ? 'w-14' : 'w-full md:w-80 lg:w-88'
        }`}
      >
        <WorkspaceSidebarHeader
          currentDestination="inbox"
          onNavigate={onNavigate}
          workspaceName={workspaceName}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />

        {!isSidebarCollapsed && (
          <>
            {/* Header */}
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
              <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
              <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
            </svg>
            <h2 className="serif text-lg font-medium text-[var(--ink-primary)] tracking-wide">
              Knowledge Inbox
            </h2>
          </div>
          <label className="cursor-pointer px-2.5 py-1 bg-[var(--accent-midnight)] hover:bg-[var(--accent-midnight)]/90 text-[#FAF8F2] text-xs font-medium rounded-lg shadow-sm transition-all flex items-center gap-1">
            <span>{isUploading ? 'Importing...' : '+ Import File'}</span>
            <input
              type="file"
              onChange={handleFileUpload}
              className="hidden"
              disabled={isUploading}
            />
          </label>
        </div>

        {/* Filter Bar */}
        <div className="px-3 py-2 border-b border-[var(--border-parchment)] flex items-center gap-1 text-[11px] font-mono">
          {(['pending', 'accepted', 'rejected', 'all'] as const).map((st) => (
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

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5 divide-y divide-transparent">
          {isLoading && items.length === 0 ? (
            <div className="p-6 text-center text-xs text-[var(--ink-tertiary)] flex flex-col items-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-[var(--accent-midnight)] border-t-transparent animate-spin" />
              <span className="serif-italic">Opening inbox queue...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-xs text-[var(--ink-tertiary)] serif-italic">
              No items in this inbox state. Upload a document to review prior to catalog ingestion.
            </div>
          ) : (
            items.map((item) => {
              const isSelected = selectedItem?.id === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => loadItemDetail(item.id)}
                  className={`group relative p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white shadow-sm border-[var(--border-strong)] ring-1 ring-[var(--accent-midnight)]/10'
                      : 'bg-transparent border-transparent hover:bg-white/60 hover:border-[var(--border-parchment)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3
                        className={`text-sm font-medium truncate ${
                          isSelected
                            ? 'text-[var(--accent-midnight)] font-semibold'
                            : 'text-[var(--ink-primary)]'
                        }`}
                      >
                        {item.source_title}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span
                          className={`mono text-[10px] uppercase font-semibold px-1.5 py-0.2 rounded border ${
                            item.status === 'accepted'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : item.status === 'rejected'
                              ? 'bg-red-50 text-red-800 border-red-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {item.status}
                        </span>
                        <span className="mono text-[10px] uppercase font-semibold px-1.5 py-0.2 rounded border bg-[var(--bg-panel)] text-[var(--ink-secondary)] border-[var(--border-parchment)]">
                          {item.detection_status}
                        </span>
                        {item.file_size_bytes && (
                          <span className="mono text-[10px] text-[var(--ink-tertiary)]">
                            {(item.file_size_bytes / 1024).toFixed(0)} KB
                          </span>
                        )}
                      </div>
                    </div>
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
      {/* Main Review Dossier */}
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

        {selectedItem ? (
          <div className="space-y-6 max-w-5xl w-full mx-auto">
            {/* Header Instrument Panel */}
            <div className="instrument-panel p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1.5 flex-1 min-w-[260px]">
                  <div className="flex items-center gap-2">
                    <span className="mono text-[10px] tracking-wider uppercase text-[var(--accent-terracotta)] font-semibold">
                      Inbox Document Review
                    </span>
                    <span className="text-[var(--border-strong)]">/</span>
                    <span
                      className={`mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded border ${
                        selectedItem.status === 'accepted'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : selectedItem.status === 'rejected'
                          ? 'bg-red-50 text-red-800 border-red-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {selectedItem.status}
                    </span>
                  </div>

                  {/* Title editor */}
                  {isEditingTitle ? (
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="text"
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        className="px-3 py-1.5 text-base serif font-medium bg-white border border-[var(--border-parchment)] rounded-lg text-[var(--ink-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-midnight)]"
                      />
                      <button
                        onClick={handleSaveTitle}
                        className="px-3 py-1.5 text-xs font-medium bg-[var(--accent-midnight)] text-[#FAF8F2] rounded-lg cursor-pointer"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setIsEditingTitle(false)}
                        className="px-2.5 py-1.5 text-xs text-[var(--ink-secondary)] hover:bg-white/60 rounded-lg cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-1 group">
                      <h1 className="serif text-2xl md:text-3xl font-medium text-[var(--ink-primary)]">
                        {selectedItem.source_title}
                      </h1>
                      <button
                        onClick={() => setIsEditingTitle(true)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-[var(--ink-tertiary)] hover:text-[var(--accent-midnight)] rounded transition-all cursor-pointer"
                        title="Edit title"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs text-[var(--ink-secondary)] pt-1">
                    <span>Format: <strong className="font-mono uppercase">{selectedItem.source_type || 'File'}</strong></span>
                    {selectedItem.file_size_bytes && (
                      <span>Size: <strong className="font-mono">{(selectedItem.file_size_bytes / 1024).toFixed(1)} KB</strong></span>
                    )}
                  </div>
                </div>

                {/* Primary Actions (Gated by status per CONTRACT & UI specifications) */}
                <div className="flex items-center gap-2.5">
                  {selectedItem.status === 'pending' ? (
                    <>
                      <button
                        type="button"
                        disabled={isActionPending}
                        onClick={() => handleAccept(selectedItem)}
                        className="px-4 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                        data-testid="inbox-accept-btn"
                      >
                        {isActionPending ? 'Accepting...' : 'Accept'}
                      </button>
                      <button
                        type="button"
                        disabled={isActionPending}
                        onClick={() => setRejectingItem(selectedItem)}
                        className="px-3.5 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 border border-red-200 rounded-lg transition-all cursor-pointer"
                        data-testid="inbox-reject-btn"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={isActionPending}
                        onClick={() => handleRedetect(selectedItem)}
                        className="px-3 py-2 text-xs text-[var(--ink-secondary)] hover:bg-white/80 border border-[var(--border-parchment)] rounded-lg transition-all cursor-pointer"
                        title="Re-run concept detection"
                        data-testid="inbox-redetect-btn"
                      >
                        Re-detect
                      </button>
                    </>
                  ) : selectedItem.status === 'accepted' ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-medium" data-testid="inbox-status-accepted-banner">
                      <span className="w-2 h-2 rounded-full bg-emerald-600" />
                      <span>Accepted into Library catalog</span>
                    </div>
                  ) : selectedItem.status === 'rejected' ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 text-red-800 border border-red-200 text-xs font-medium" data-testid="inbox-status-rejected-banner">
                      <span className="w-2 h-2 rounded-full bg-red-600" />
                      <span>Rejected and purged from catalog</span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Setting Toggle: Knowledge Extraction */}
              <div className="p-3 bg-[var(--bg-panel)] rounded-xl border border-[var(--border-parchment)] flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-[var(--ink-primary)]">
                    Knowledge Graph Extraction
                  </div>
                  <div className="text-[11px] text-[var(--ink-tertiary)]">
                    When accepted, extract semantic concepts and link into Observatory graph.
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedItem.extract_knowledge)}
                    onChange={() => handleToggleExtractKnowledge(selectedItem)}
                    className="rounded text-[var(--accent-midnight)] focus:ring-[var(--accent-midnight)] cursor-pointer"
                  />
                  <span className="text-xs font-medium text-[var(--ink-secondary)]">
                    {selectedItem.extract_knowledge ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              </div>
            </div>

            {/* Extracted Excerpt & Preview (§8.4, §12.3) */}
            {selectedItem.raw_metadata && Boolean(selectedItem.raw_metadata.excerpt || selectedItem.raw_metadata.extracted_text) && (
              <div className="instrument-panel p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-2">
                  <div className="flex items-center gap-2">
                    <span className="mono text-[10px] uppercase font-semibold text-[var(--accent-midnight)]">
                      Extracted Document Excerpt
                    </span>
                  </div>
                  {Boolean(selectedItem.raw_metadata.stage_timings) && (
                    <span className="mono text-[10px] text-[var(--ink-secondary)] font-medium">
                      Total: {(selectedItem.raw_metadata.stage_timings as any).total_processing_ms}ms (Extract: {(selectedItem.raw_metadata.stage_timings as any).extract_ms}ms, Embed: {(selectedItem.raw_metadata.stage_timings as any).embed_and_index_ms}ms)
                    </span>
                  )}
                </div>
                <div className="p-3.5 bg-[var(--bg-base)] rounded-lg border border-[var(--border-parchment)]">
                  <p className="serif text-sm leading-relaxed text-[var(--ink-primary)] italic">
                    &ldquo;{(selectedItem.raw_metadata.excerpt as string) || (selectedItem.raw_metadata.extracted_text as string)?.slice(0, 300)}&rdquo;
                  </p>
                </div>
              </div>
            )}

            {/* Dry-Run Detected Concepts Preview (§8.4, §12.3) */}
            <div className="instrument-panel p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-[var(--accent-midnight)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  <h3 className="serif text-base font-medium text-[var(--ink-primary)]">
                    Preview of Detected Concepts ({selectedItem.detected_entities?.length || 0})
                  </h3>
                </div>
                <span className="mono text-[10px] text-[var(--ink-tertiary)] uppercase font-semibold">
                  Read-Only Preview
                </span>
              </div>

              <p className="text-[11px] text-[var(--ink-tertiary)] leading-relaxed">
                Concepts surfaced by dry-run entity analysis. No graph records or vectors are committed until accepted.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {(!selectedItem.detected_entities || selectedItem.detected_entities.length === 0) ? (
                  <div className="col-span-full p-8 text-center text-xs text-[var(--ink-tertiary)] serif-italic border border-dashed border-[var(--border-parchment)] rounded-xl bg-white/40">
                    No concepts detected or detection pending. Click &quot;Re-detect&quot; above to re-run detection.
                  </div>
                ) : (
                  selectedItem.detected_entities.map((ent, idx) => (
                    <div
                      key={ent.name || idx}
                      className="p-3 bg-white rounded-xl border border-[var(--border-parchment)] shadow-2xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-[var(--ink-primary)] truncate">
                          {ent.name}
                        </span>
                        <span className="mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {ent.type || 'concept'}
                        </span>
                      </div>
                      {ent.description && (
                        <p className="text-[11px] text-[var(--ink-secondary)] line-clamp-2">
                          {ent.description}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-12 text-center">
            <div className="instrument-panel p-8 max-w-md space-y-3">
              <div className="w-10 h-10 rounded-full bg-[var(--accent-terracotta)]/10 text-[var(--accent-terracotta)] mx-auto flex items-center justify-center">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                  <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                </svg>
              </div>
              <h3 className="serif text-lg font-medium text-[var(--ink-primary)]">
                Select an Inbox Document
              </h3>
              <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                Review pending material from the left queue before admitting it into the permanent repository.
              </p>
            </div>
          </div>
        )}

        {/* Rejection Confirmation Modal (§12.5) */}
        {rejectingItem && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="instrument-panel p-6 max-w-md w-full bg-white shadow-xl space-y-4">
              <div className="flex items-center gap-2 text-red-700">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <h3 className="serif text-lg font-medium">Confirm Rejection</h3>
              </div>
              <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                Are you sure you want to reject <strong className="text-[var(--ink-primary)]">&quot;{rejectingItem.source_title}&quot;</strong>? This will permanently delete the source record, extracted preview chunks, vectors, and stored original file.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectingItem(null)}
                  className="px-3 py-1.5 text-xs text-[var(--ink-secondary)] hover:bg-stone-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmReject}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-red-700 hover:bg-red-800 text-white rounded-lg shadow-sm cursor-pointer"
                >
                  Permanently Reject
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
