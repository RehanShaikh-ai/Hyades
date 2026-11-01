import { DeleteNoteConfirmationModal } from '@/components/library/DeleteNoteConfirmationModal';
import React, { useState, useEffect } from 'react';
import { Note } from '@/types/note';
import { Tag } from '@/types/tag';
import { createNote, updateNote, deleteNote, getNote } from '@/api/notes';
import { addTag, removeTag } from '@/api/tags';
import { Pin, Archive, Trash2, Save, X, Eye, Edit3, Tag as TagIcon, Loader2, Clock, RotateCcw, FileCode2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VersionHistoryPanel } from './versioning/VersionHistoryPanel';
import { DiffViewer } from './versioning/DiffViewer';
import { RestoreConfirmation } from './versioning/RestoreConfirmation';
import { NoteVersion } from '@/types/versions';
import { getNoteVersion } from '@/api/versions';
import { renderMarkdown } from '@/lib/markdown';

interface NoteEditorProps {
  workspaceId: string;
  userId?: string; 
  initialNote?: Note;
  onClose: () => void;
  onSaved: (note: Note) => void;
  onDeleted: (noteId: string) => void;
  className?: string;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({ 
  workspaceId, 
  userId = '00000000-0000-0000-0000-000000000000',
  initialNote, 
  onClose, 
  onSaved, 
  onDeleted,
  className 
}) => {
  const [currentNote, setCurrentNote] = useState<Note | null>(initialNote || null);
  const isEditing = !!currentNote;
  
  const [title, setTitle] = useState(initialNote?.title || '');
  const [content, setContent] = useState(initialNote?.content || '');
  const [isPinned, setIsPinned] = useState(initialNote?.is_pinned || false);
  const [isArchived, setIsArchived] = useState(initialNote?.is_archived || false);
  const [tags, setTags] = useState<Tag[]>(initialNote?.tags || []);
  
  const [isPreview, setIsPreview] = useState(false);
  const [tagInput, setTagInput] = useState('');
  
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [selectedVersion, setSelectedVersion] = useState<NoteVersion | null>(null);
  const [versionContent, setVersionContent] = useState<string>('');
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [latestCommitHash, setLatestCommitHash] = useState<string | null>(null);
  
  const initialTagIds = (currentNote?.tags || []).map(t => t.id).sort().join(',');
  const currentTagIds = tags.map(t => t.id).sort().join(',');
  const areTagsDirty = initialTagIds !== currentTagIds;

  const isDirty = 
    title !== (currentNote?.title || '') || 
    content !== (currentNote?.content || '') ||
    isPinned !== (currentNote?.is_pinned || false) ||
    isArchived !== (currentNote?.is_archived || false) ||
    areTagsDirty;

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleClose = () => {
    if (isDirty) {
      if (window.confirm("You have unsaved changes. Are you sure you want to discard them?")) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError(new Error("Title is required"));
      return;
    }
    
    setError(null);
    setIsSaving(true);
    
    try {
      let savedNote: Note;
      if (currentNote) {
        savedNote = await updateNote(currentNote.id, {
          title,
          content,
          is_pinned: isPinned,
          is_archived: isArchived
        });
      } else {
        savedNote = await createNote(workspaceId, {
          title,
          content,
          created_by: userId
        });
        
        if (isPinned || isArchived) {
           savedNote = await updateNote(savedNote.id, { is_pinned: isPinned, is_archived: isArchived });
        }
      }
      
      setCurrentNote(savedNote);
      setHistoryRefreshKey(k => k + 1);
      onSaved({ ...savedNote, tags });
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to save note"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!isEditing || !currentNote) return;
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!isEditing || !currentNote) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteNote(currentNote.id);
      setIsDeleteModalOpen(false);
      onDeleted(currentNote.id);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to delete note"));
      setIsDeleting(false);
    }
  };

  const handleAddTag = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const tagName = tagInput.trim().toLowerCase();
      
      if (!isEditing || !currentNote) {
        setError(new Error("Please save the note first before adding tags."));
        return;
      }

      try {
        const newTag = await addTag(currentNote.id, tagName);
        if (!tags.some(t => t.id === newTag.id)) {
            setTags([...tags, newTag]);
        }
        setTagInput('');
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to add tag"));
      }
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!isEditing || !currentNote) return;
    try {
      await removeTag(currentNote.id, tagId);
      setTags(tags.filter(t => t.id !== tagId));
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to remove tag"));
    }
  };

  const handleSelectVersion = async (version: NoteVersion, latestHash = "HEAD") => {
    setSelectedVersion(version);
    setLatestCommitHash(latestHash);
    setShowDiff(false);
    try {
      if (currentNote) {
        const res = await getNoteVersion(currentNote.id, version.id);
        setVersionContent(res.content || '');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRestoreConfirm = async () => {
    setShowRestoreConfirm(false);
    setIsHistoryOpen(false);
    setSelectedVersion(null);
    if (currentNote) {
      try {
        const refreshed = await getNote(currentNote.id);
        setCurrentNote(refreshed);
        setContent(refreshed.content || '');
        setTitle(refreshed.title);
        setHistoryRefreshKey(k => k + 1);
        onSaved(refreshed);
      } catch (err) {
        console.error("Failed to reload restored note", err);
      }
    }
  };

  return (
    <div className={cn("flex flex-col h-full bg-slate-950/80 rounded-2xl shadow-2xl border border-white/[0.08] backdrop-blur-2xl text-slate-100 overflow-hidden", className)}>
      <header className="flex items-center justify-between p-3.5 sm:p-4 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-md">
        <div className="flex items-center gap-1 sm:gap-2">
            <button 
                type="button"
                onClick={() => setIsPinned(!isPinned)}
                className={cn(
                    "p-2 rounded-lg transition-colors border text-xs font-medium flex items-center gap-1.5",
                    isPinned 
                        ? "bg-amber-400/15 text-amber-300 border-amber-400/30 shadow-[0_0_10px_rgba(251,191,36,0.15)]" 
                        : "border-transparent text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                )}
                title={isPinned ? "Unpin note" : "Pin note"}
            >
                <Pin size={16} className={isPinned ? "fill-current" : ""} />
            </button>
            <button 
                type="button"
                onClick={() => setIsArchived(!isArchived)}
                className={cn(
                    "p-2 rounded-lg transition-colors border text-xs font-medium flex items-center gap-1.5",
                    isArchived 
                        ? "bg-purple-400/15 text-purple-300 border-purple-400/30 shadow-[0_0_10px_rgba(192,132,252,0.15)]" 
                        : "border-transparent text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                )}
                title={isArchived ? "Unarchive note" : "Archive note"}
            >
                <Archive size={16} />
            </button>
            
            <div className="w-px h-5 bg-white/[0.08] mx-1 sm:mx-2" />
            
            <button
                type="button"
                onClick={() => setIsPreview(!isPreview)}
                className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border",
                    isPreview 
                        ? "bg-sky-500/15 text-sky-300 border-sky-500/30 shadow-[0_0_10px_rgba(56,189,248,0.15)]" 
                        : "border-transparent text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                )}
            >
                {isPreview ? <><Edit3 size={15} /> <span className="hidden sm:inline">Edit</span></> : <><Eye size={15} /> <span className="hidden sm:inline">Preview</span></>}
            </button>
            {isEditing && (
              <button
                  type="button"
                  onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                  className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border",
                      isHistoryOpen 
                          ? "bg-purple-500/15 text-purple-300 border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.15)]" 
                          : "border-transparent text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                  )}
              >
                  <Clock size={15} /> <span className="hidden sm:inline">History</span>
              </button>
            )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
            {isEditing && (
                <button 
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors border border-transparent hover:border-rose-500/20"
                    title="Delete note"
                >
                    {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
            )}
            <button 
                type="button"
                onClick={handleSave}
                disabled={isSaving || !isDirty}
                className={cn(
                    "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                    isDirty 
                        ? "bg-sky-500 hover:bg-sky-400 text-slate-950 border-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.35)] hover:-translate-y-0.5" 
                        : "bg-white/[0.02] text-slate-500 border-white/[0.06] cursor-not-allowed"
                )}
            >
                {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Save
            </button>
            <button 
                type="button"
                onClick={handleClose} 
                aria-label="Close" 
                className="p-2 text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] rounded-lg transition-colors ml-1"
            >
                <X size={18} />
            </button>
        </div>
      </header>

      {error && (
        <div className="m-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-lg text-xs font-medium">
            {error.message}
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-6 lg:p-8 flex flex-col">
        <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title"
            className="text-2xl lg:text-3xl font-bold text-slate-100 placeholder:text-slate-600 border-none outline-none bg-transparent mb-5 focus:ring-0 w-full tracking-tight"
            readOnly={isPreview}
        />
        
        {isPreview ? (
            <div 
                className="flex-1 overflow-y-auto markdown-content"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(content || '*Empty note*') }} 
            />
        ) : (
            <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your note here... (Markdown supported)"
                className="flex-1 resize-none border-none outline-none bg-transparent text-slate-200 placeholder:text-slate-600 focus:ring-0 leading-relaxed text-sm sm:text-base min-h-[300px]"
            />
        )}
      </main>

      {isHistoryOpen && initialNote && (
        <div className="flex border-t border-white/[0.06] bg-slate-950/60 backdrop-blur-md h-[400px]">
          <div className="flex-1 p-6 overflow-y-auto border-r border-white/[0.06]">
            {selectedVersion ? (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-sky-400">Viewing Version: {selectedVersion.commit_hash.substring(0, 7)}</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowDiff(!showDiff)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] text-slate-300 hover:bg-white/[0.1] border border-white/[0.08] flex items-center gap-1.5 transition-colors"
                    >
                      <FileCode2 size={14} />
                      {showDiff ? 'View Content' : 'View Diff'}
                    </button>
                    <button
                      onClick={() => setShowRestoreConfirm(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30 flex items-center gap-1.5"
                    >
                      <RotateCcw size={14} />
                      Restore This Version
                    </button>
                  </div>
                </div>
                
                {showDiff && latestCommitHash && currentNote ? (
                  <DiffViewer
                    noteId={currentNote.id}
                    fromHash={selectedVersion.commit_hash}
                    toHash={latestCommitHash}
                    className="flex-1"
                  />
                ) : (
                  <div 
                      className="flex-1 overflow-y-auto p-4 bg-slate-950/70 rounded-xl border border-white/[0.08] markdown-content"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(versionContent || '*Empty version*') }} 
                  />
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500">
                Select a version from the history panel to preview or restore it.
              </div>
            )}
          </div>
          <div className="w-[300px] shrink-0">
            {currentNote && (
              <VersionHistoryPanel
                noteId={currentNote.id}
                refreshTrigger={historyRefreshKey}
                currentVersionId={selectedVersion?.id}
                onSelectVersion={(v) => {
                   handleSelectVersion(v, "HEAD");
                }}
              />
            )}
          </div>
        </div>
      )}

      {showRestoreConfirm && currentNote && selectedVersion && (
        <RestoreConfirmation
          noteId={currentNote.id}
          version={selectedVersion}
          onConfirm={handleRestoreConfirm}
          onCancel={() => setShowRestoreConfirm(false)}
        />
      )}

      <footer className="p-3.5 border-t border-white/[0.06] bg-white/[0.02] backdrop-blur-md flex items-center gap-3 overflow-x-auto">
        <TagIcon size={15} className="text-slate-500 shrink-0" />
        <div className="flex items-center gap-2 flex-nowrap overflow-x-auto pb-1 sm:pb-0">
            {tags.map(tag => (
                <span key={tag.id} className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-mono font-medium tracking-wide bg-sky-500/10 border border-sky-500/25 text-sky-300 whitespace-nowrap lowercase">
                    {tag.name}
                    {isEditing && (
                        <button 
                            type="button"
                            onClick={() => handleRemoveTag(tag.id)} 
                            aria-label={`Remove tag ${tag.name}`} 
                            className="hover:text-rose-400 rounded-full hover:bg-rose-500/20 p-0.5 transition-colors"
                        >
                            <X size={11} strokeWidth={2.5} />
                        </button>
                    )}
                </span>
            ))}
            {isEditing && (
                <input 
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleAddTag}
                    placeholder="Add tag..."
                    className="text-xs font-mono bg-transparent border-none outline-none w-24 focus:ring-0 text-slate-300 placeholder:text-slate-600"
                />
            )}
            {!isEditing && tags.length === 0 && (
                <span className="text-xs font-mono text-slate-500">Save note to add tags</span>
            )}
        </div>
      </footer>

      <DeleteNoteConfirmationModal
        isOpen={isDeleteModalOpen}
        noteTitle={title || currentNote?.title || "Untitled Note"}
        isDeleting={isDeleting}
        error={error?.message}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!isDeleting) setIsDeleteModalOpen(false);
        }}
      />
    </div>
  );
};
