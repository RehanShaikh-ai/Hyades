import React, { useState } from 'react';
import { Note } from '@/types/note';
import { Pin, Archive, GitMerge } from 'lucide-react';
import { RadialMenu } from './RadialMenu';

interface NoteCardProps {
  note: Note;
  onClick?: (note: Note) => void;
  onNoteUpdated?: (note: Note) => void;
  onNoteDeleted?: () => void;
  className?: string;
}

export const NoteCard: React.FC<NoteCardProps> = ({
  note,
  onClick,
  onNoteUpdated,
  onNoteDeleted,
  className,
}) => {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  const formattedDate = new Date(note.updated_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  const cardClass = [
    'note-card',
    note.is_pinned ? 'pinned' : '',
    note.is_archived ? 'archived' : '',
    className ?? '',
  ]
    .join(' ')
    .trim();

  return (
    <>
      <div
        onClick={() => onClick?.(note)}
        onContextMenu={handleContextMenu}
        role="article"
        aria-label={`Note: ${note.title}`}
        className={cardClass}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onClick?.(note);
        }}
      >
        {/* Status icons */}
        {(note.is_pinned || note.is_archived || note.metadata?.is_merged) && (
          <div className="note-card-icons">
            {note.metadata?.is_merged && (
              <span
                data-testid="note-card-merged-indicator"
                className="note-icon-merged"
                title={
                  note.metadata.source_count
                    ? `Created by merging ${note.metadata.source_count} notes`
                    : 'Created by merging notes'
                }
              >
                <GitMerge size={11} className="text-[#C85A32]" aria-label="Merged Note" />
              </span>
            )}
            {note.is_pinned && (
              <span className="note-icon-pin" title="Pinned">
                <Pin size={11} className="fill-current" aria-label="Pinned" />
              </span>
            )}
            {note.is_archived && (
              <span className="note-icon-archive" title="Archived">
                <Archive size={11} aria-label="Archived" />
              </span>
            )}
          </div>
        )}

        <h3 className="note-card-title">{note.title}</h3>

        {note.content && (
          <p className="note-card-preview">{note.content}</p>
        )}

        <div className="note-card-footer">
          <div className="note-card-tags">
            {note.tags.slice(0, 3).map((tag) => (
              <span key={tag.id} className="note-tag-pill">
                {tag.name}
              </span>
            ))}
            {note.tags.length > 3 && (
              <span className="note-tag-pill" style={{ opacity: 0.6 }}>
                +{note.tags.length - 3}
              </span>
            )}
          </div>
          <time dateTime={note.updated_at} className="note-card-date">
            {formattedDate}
          </time>
        </div>

        {/* Right-click hint — subtle, appears on hover */}
        <div
          style={{
            position: 'absolute',
            bottom: '10px',
            right: '14px',
            fontSize: '9px',
            fontFamily: 'Space Mono, monospace',
            color: 'var(--overlay0)',
            opacity: 0,
            transition: 'opacity 0.2s ease',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            pointerEvents: 'none',
          }}
          className="note-card-hint"
          aria-hidden="true"
        >
          right-click
        </div>
      </div>

      {menuPos && (
        <RadialMenu
          note={note}
          position={menuPos}
          onClose={() => setMenuPos(null)}
          onEdit={(n) => {
            setMenuPos(null);
            onClick?.(n);
          }}
          onNoteUpdated={(updated) => {
            setMenuPos(null);
            onNoteUpdated?.(updated);
          }}
          onNoteDeleted={() => {
            setMenuPos(null);
            onNoteDeleted?.();
          }}
        />
      )}
    </>
  );
};
