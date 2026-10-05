import React, { useState } from 'react';
import {
  GraphRelationship,
  GraphRelationshipCreate,
  GraphRelationshipUpdate,
} from '@/types/graph_relationship';
import { GraphEntity } from '@/types/graph_entity';
import { createRelationship, updateRelationship } from '@/api/relationships';
import { COMMON_RELATIONSHIP_TYPES } from '@/lib/graph_constants';
import { ApiError } from '@/types/api';
import { Modal } from '@/components/ui/Modal';
import { Loader2, AlertTriangle, Check, ArrowRight, X } from 'lucide-react';

export interface RelationshipEditorProps {
  workspaceId: string;
  relationship?: GraphRelationship | null; // null/undefined for create, populated for edit
  sourceEntity?: GraphEntity | null;
  availableEntities?: Array<{ id: string; name: string }>;
  isOpen: boolean;
  onClose: () => void;
  onSave: (relationship: GraphRelationship) => void;
}

export const RelationshipEditor: React.FC<RelationshipEditorProps> = ({
  workspaceId,
  relationship,
  sourceEntity,
  availableEntities = [],
  isOpen,
  onClose,
  onSave,
}) => {
  const isEditing = Boolean(relationship);
  const [sourceId, setSourceId] = useState<string>(
    relationship?.source_entity_id || sourceEntity?.id || ''
  );
  const [targetId, setTargetId] = useState<string>(
    relationship?.target_entity_id || ''
  );
  const [relationshipType, setRelationshipType] = useState<string>(
    relationship?.relationship_type || 'related_to'
  );
  const [description, setDescription] = useState<string>(
    relationship?.description || ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state on prop changes
  React.useEffect(() => {
    if (relationship) {
      setSourceId(relationship.source_entity_id);
      setTargetId(relationship.target_entity_id);
      setRelationshipType(relationship.relationship_type);
      setDescription(relationship.description || '');
    } else {
      setSourceId(sourceEntity?.id || (availableEntities[0]?.id || ''));
      setTargetId(
        availableEntities.find((e) => e.id !== (sourceEntity?.id || availableEntities[0]?.id))?.id || ''
      );
      setRelationshipType('related_to');
      setDescription('');
    }
    setError(null);
  }, [relationship, sourceEntity, availableEntities, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isEditing) {
      if (!sourceId || !targetId) {
        setError('Both source and target entities must be selected.');
        return;
      }
      if (sourceId === targetId) {
        setError('Self-relationships are not allowed. Source and target must be distinct entities.');
        return;
      }
    }

    const trimmedType = relationshipType.trim();
    if (!trimmedType) {
      setError('Relationship type cannot be empty.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (isEditing && relationship) {
        const payload: GraphRelationshipUpdate = {
          relationship_type: trimmedType,
          description: description.trim() || null,
        };
        const updated = await updateRelationship(relationship.id, payload);
        onSave(updated);
        onClose();
      } else {
        const payload: GraphRelationshipCreate = {
          source_entity_id: sourceId,
          target_entity_id: targetId,
          relationship_type: trimmedType,
          description: description.trim() || undefined,
        };
        const created = await createRelationship(workspaceId, payload);
        onSave(created);
        onClose();
      }
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr?.error?.code === 'CONFLICT') {
        setError(`A relationship with type "${trimmedType}" already exists between these two entities.`);
      } else {
        setError(apiErr?.error?.message || 'Failed to save relationship');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} width="sm">
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-parchment)] bg-white">
        <div>
          <span className="mono text-[10px] text-[var(--accent-terracotta)] uppercase tracking-wider font-semibold">
            Knowledge Scriptorium
          </span>
          <h3 className="serif text-base font-semibold text-[var(--ink-primary)]">
            {isEditing ? 'Edit Relationship' : 'Create Graph Relationship'}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)] p-1.5 rounded-lg hover:bg-[var(--bg-panel-subtle)] transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>
      <form onSubmit={handleSubmit} data-testid="relationship-editor-form" className="p-5 space-y-4 bg-[#FAF8F2]">
        {error && (
          <div
            data-testid="relationship-editor-error"
            className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2"
          >
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Source and Target Entities (Immutable in edit mode) */}
        {!isEditing ? (
          <div className="space-y-3 p-3.5 bg-white border border-[var(--border-parchment)] rounded-xl shadow-2xs">
            <div className="space-y-1">
              <label
                htmlFor="rel-source-select"
                className="text-[10px] font-semibold text-[var(--ink-secondary)] uppercase tracking-wider mono block"
              >
                Source Entity <span className="text-[var(--accent-terracotta)]">*</span>
              </label>
              <select
                id="rel-source-select"
                data-testid="rel-source-select"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="w-full bg-[#FAF8F2] border border-[var(--border-strong)] focus:border-[var(--accent-midnight)] focus:ring-1 focus:ring-[var(--accent-midnight)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--ink-primary)] focus:outline-none cursor-pointer"
              >
                <option value="" disabled>Select source entity</option>
                {availableEntities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-center text-[var(--ink-tertiary)] py-0.5">
              <ArrowRight size={14} className="text-[var(--accent-terracotta)]" />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="rel-target-select"
                className="text-[10px] font-semibold text-[var(--ink-secondary)] uppercase tracking-wider mono block"
              >
                Target Entity <span className="text-[var(--accent-terracotta)]">*</span>
              </label>
              <select
                id="rel-target-select"
                data-testid="rel-target-select"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full bg-[#FAF8F2] border border-[var(--border-strong)] focus:border-[var(--accent-midnight)] focus:ring-1 focus:ring-[var(--accent-midnight)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--ink-primary)] focus:outline-none cursor-pointer"
              >
                <option value="" disabled>Select target entity</option>
                {availableEntities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-white border border-[var(--border-parchment)] rounded-xl text-xs text-[var(--ink-secondary)]">
            <span className="font-semibold text-[var(--ink-primary)]">Note:</span> Source and target entities are immutable for an existing relationship.
          </div>
        )}

        {/* Relationship Type */}
        <div className="space-y-1.5">
          <label
            htmlFor="rel-type-input"
            className="text-[11px] font-semibold text-[var(--ink-secondary)] uppercase tracking-wider mono block"
          >
            Relationship Type <span className="text-[var(--accent-terracotta)]">*</span>
          </label>
          <input
            id="rel-type-input"
            data-testid="rel-type-input"
            type="text"
            required
            maxLength={100}
            value={relationshipType}
            onChange={(e) => setRelationshipType(e.target.value)}
            placeholder="e.g. prerequisite_of, part_of, contradicts"
            className="w-full bg-white border border-[var(--border-strong)] focus:border-[var(--accent-midnight)] focus:ring-1 focus:ring-[var(--accent-midnight)] rounded-xl px-3 py-2 text-xs text-[var(--ink-primary)] placeholder-[var(--ink-tertiary)] focus:outline-none mono transition-all"
          />

          {/* Quick presets */}
          <div className="flex flex-wrap gap-1 pt-1">
            {COMMON_RELATIONSHIP_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setRelationshipType(type)}
                className={`px-2 py-0.5 rounded text-[10px] mono border transition-colors cursor-pointer ${
                  relationshipType === type
                    ? 'bg-[var(--accent-midnight)] text-[#FAF8F2] border-[var(--accent-midnight)] font-medium shadow-2xs'
                    : 'bg-white border-[var(--border-strong)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-panel-subtle)]'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label
            htmlFor="rel-description-input"
            className="text-[11px] font-semibold text-[var(--ink-secondary)] uppercase tracking-wider mono block"
          >
            Description <span className="text-[var(--ink-tertiary)] text-[10px] lowercase font-normal">(optional)</span>
          </label>
          <textarea
            id="rel-description-input"
            data-testid="rel-description-input"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Explain the celestial or conceptual nature of this connection..."
            className="w-full bg-white border border-[var(--border-strong)] focus:border-[var(--accent-midnight)] focus:ring-1 focus:ring-[var(--accent-midnight)] rounded-xl px-3 py-2 text-xs text-[var(--ink-primary)] placeholder-[var(--ink-tertiary)] focus:outline-none transition-all resize-none leading-relaxed"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-parchment)]">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-strong)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            data-testid="relationship-submit-btn"
            disabled={isSubmitting || !relationshipType.trim()}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-[var(--accent-midnight)] hover:bg-[var(--accent-midnight-light)] text-[#FAF8F2] transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none shadow-sm cursor-pointer"
          >
            {isSubmitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            <span>{isEditing ? 'Save Changes' : 'Connect Entities'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
