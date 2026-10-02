import React, { useState } from 'react';
import { GraphEntity, GraphEntityCreate, GraphEntityUpdate, ENTITY_TYPES, EntityType } from '@/types/graph_entity';
import { createEntity, updateEntity } from '@/api/entities';
import { ApiError } from '@/types/api';
import { getEntityTypeColor } from '@/lib/graph_constants';
import { Modal } from '@/components/ui/Modal';
import { Loader2, AlertTriangle, Check, X } from 'lucide-react';

export interface EntityEditorProps {
  workspaceId: string;
  entity?: GraphEntity | null; // null/undefined for create, populated for edit
  isOpen: boolean;
  onClose: () => void;
  onSave: (entity: GraphEntity) => void;
}

export const EntityEditor: React.FC<EntityEditorProps> = ({
  workspaceId,
  entity,
  isOpen,
  onClose,
  onSave,
}) => {
  const isEditing = Boolean(entity);
  const [name, setName] = useState(entity?.name || '');
  const [entityType, setEntityType] = useState<EntityType>(entity?.entity_type || 'concept');
  const [description, setDescription] = useState(entity?.description || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state when entity changes
  React.useEffect(() => {
    if (entity) {
      setName(entity.name);
      setEntityType(entity.entity_type);
      setDescription(entity.description || '');
    } else {
      setName('');
      setEntityType('concept');
      setDescription('');
    }
    setError(null);
  }, [entity, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Entity name cannot be empty.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (isEditing && entity) {
        const payload: GraphEntityUpdate = {
          name: trimmedName,
          entity_type: entityType,
          description: description.trim() || null,
        };
        const updated = await updateEntity(entity.id, payload);
        onSave(updated);
        onClose();
      } else {
        const payload: GraphEntityCreate = {
          name: trimmedName,
          entity_type: entityType,
          description: description.trim() || undefined,
        };
        const created = await createEntity(workspaceId, payload);
        onSave(created);
        onClose();
      }
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr?.error?.code === 'CONFLICT') {
        setError(`An entity named "${trimmedName}" already exists in this workspace.`);
      } else {
        setError(apiErr?.error?.message || 'Failed to save entity');
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
            {isEditing ? `Edit Entity: ${entity?.name}` : 'Create Graph Entity'}
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
      <form onSubmit={handleSubmit} data-testid="entity-editor-form" className="p-5 space-y-4 bg-[#FAF8F2]">
        {error && (
          <div
            data-testid="entity-editor-error"
            className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2"
          >
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Entity Name */}
        <div className="space-y-1.5">
          <label
            htmlFor="entity-name-input"
            className="text-[11px] font-semibold text-[var(--ink-secondary)] uppercase tracking-wider mono block"
          >
            Entity Name <span className="text-[var(--accent-terracotta)]">*</span>
          </label>
          <input
            id="entity-name-input"
            data-testid="entity-name-input"
            type="text"
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Gradient Descent, Transformer"
            className="w-full bg-white border border-[var(--border-strong)] focus:border-[var(--accent-midnight)] focus:ring-1 focus:ring-[var(--accent-midnight)] rounded-xl px-3 py-2 text-sm text-[var(--ink-primary)] placeholder-[var(--ink-tertiary)] focus:outline-none transition-all"
          />
        </div>

        {/* Entity Type */}
        <div className="space-y-1.5">
          <label
            htmlFor="entity-type-select"
            className="text-[11px] font-semibold text-[var(--ink-secondary)] uppercase tracking-wider mono block"
          >
            Entity Type <span className="text-[var(--accent-terracotta)]">*</span>
          </label>
          <select
            id="entity-type-select"
            data-testid="entity-type-select"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as EntityType)}
            className="w-full bg-white border border-[var(--border-strong)] focus:border-[var(--accent-midnight)] focus:ring-1 focus:ring-[var(--accent-midnight)] rounded-xl px-3 py-2 text-sm text-[var(--ink-primary)] focus:outline-none transition-all capitalize cursor-pointer"
          >
            {ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 pt-1 text-xs text-[var(--ink-tertiary)]">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: getEntityTypeColor(entityType) }}
            />
            <span>Visualized as {entityType} node in Observatory</span>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label
            htmlFor="entity-description-input"
            className="text-[11px] font-semibold text-[var(--ink-secondary)] uppercase tracking-wider mono block"
          >
            Description <span className="text-[var(--ink-tertiary)] text-[10px] lowercase font-normal">(optional)</span>
          </label>
          <textarea
            id="entity-description-input"
            data-testid="entity-description-input"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Concise summary or archival definition of this entity in Hyades..."
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
            data-testid="entity-submit-btn"
            disabled={isSubmitting || !name.trim()}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-[var(--accent-midnight)] hover:bg-[var(--accent-midnight-light)] text-[#FAF8F2] transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none shadow-sm cursor-pointer"
          >
            {isSubmitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            <span>{isEditing ? 'Save Changes' : 'Create Entity'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
