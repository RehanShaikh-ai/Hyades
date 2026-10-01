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
      <div className="flex items-center justify-between p-4 border-b border-white/[0.08]">
        <h3 className="font-semibold text-sm text-slate-200">
          {isEditing ? `Edit Entity: ${entity?.name}` : 'Create Graph Entity'}
        </h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-white/[0.06] transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>
      <form onSubmit={handleSubmit} data-testid="entity-editor-form" className="p-4 space-y-4">
        {error && (
          <div
            data-testid="entity-editor-error"
            className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start gap-2"
          >
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Entity Name */}
        <div className="space-y-1.5">
          <label
            htmlFor="entity-name-input"
            className="text-xs font-medium text-slate-300 uppercase tracking-wider block"
          >
            Entity Name <span className="text-rose-400">*</span>
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
            className="w-full bg-white/[0.04] border border-white/[0.1] focus:border-sky-500/60 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-all"
          />
        </div>

        {/* Entity Type */}
        <div className="space-y-1.5">
          <label
            htmlFor="entity-type-select"
            className="text-xs font-medium text-slate-300 uppercase tracking-wider block"
          >
            Entity Type <span className="text-rose-400">*</span>
          </label>
          <select
            id="entity-type-select"
            data-testid="entity-type-select"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as EntityType)}
            className="w-full bg-slate-900 border border-white/[0.1] focus:border-sky-500/60 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none transition-all capitalize"
          >
            {ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 pt-1 text-xs text-slate-400">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: getEntityTypeColor(entityType) }}
            />
            <span>Visualized as {entityType} node</span>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label
            htmlFor="entity-description-input"
            className="text-xs font-medium text-slate-300 uppercase tracking-wider block"
          >
            Description <span className="text-slate-500 text-[10px] lowercase">(optional)</span>
          </label>
          <textarea
            id="entity-description-input"
            data-testid="entity-description-input"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Concise summary or definition of this entity in Hyades..."
            className="w-full bg-white/[0.04] border border-white/[0.1] focus:border-sky-500/60 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-all resize-none leading-relaxed"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            data-testid="entity-submit-btn"
            disabled={isSubmitting || !name.trim()}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-sky-500/20"
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
