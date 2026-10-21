import React, { useState, useEffect } from 'react';
import {
  ActionDefinition,
  ExecuteActionRequest,
  ExecutionMode,
  JsonSchemaProperty,
} from '@/types/actions';

export interface ActionInputFormProps {
  action: ActionDefinition;
  workspaceId?: string;
  isSubmitting?: boolean;
  onSubmit: (request: ExecuteActionRequest) => void;
  onCancel?: () => void;
  initialValues?: Record<string, unknown>;
  initialMode?: ExecutionMode;
  confirmationToken?: string;
  initialConfirmationToken?: string;
  serverError?: string | null;
}

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'idem-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now();
}

/**
 * Determine valid and default execution mode based on action classification (§5.1, §6.2)
 * The client MUST NOT override an action's registered classification.
 */
export function getDefaultMode(action: ActionDefinition): ExecutionMode {
  switch (action.side_effect) {
    case 'read':
      return 'read';
    case 'propose':
    case 'destructive':
      return 'propose';
    case 'write':
      return 'commit';
    default:
      return 'read';
  }
}

export const ActionInputForm: React.FC<ActionInputFormProps> = ({
  action,
  workspaceId = '',
  isSubmitting = false,
  onSubmit,
  onCancel,
  initialValues,
  initialMode,
  confirmationToken: propToken,
  initialConfirmationToken,
  serverError,
}) => {
  const initialToken = propToken || initialConfirmationToken || '';
  const schema = action.input_schema || { type: 'object', properties: {}, required: [] };
  const properties = schema.properties || {};
  const requiredFields = schema.required || [];

  const [formValues, setFormValues] = useState<Record<string, unknown>>(() => {
    const defaults: Record<string, unknown> = {};
    Object.entries(properties).forEach(([key, prop]) => {
      if (initialValues && initialValues[key] !== undefined) {
        defaults[key] = initialValues[key];
      } else if (prop.default !== undefined) {
        defaults[key] = prop.default;
      } else if (key === 'workspace_id') {
        defaults[key] = workspaceId;
      } else if (prop.type === 'boolean') {
        defaults[key] = false;
      } else if (prop.type === 'array') {
        defaults[key] = [];
      } else {
        defaults[key] = '';
      }
    });
    return defaults;
  });

  const [mode, setMode] = useState<ExecutionMode>(() => initialMode || getDefaultMode(action));
  const [idempotencyKey, setIdempotencyKey] = useState<string>(generateIdempotencyKey);
  const [confirmationToken, setConfirmationToken] = useState<string>(initialToken || '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when selected action changes
  useEffect(() => {
    const defaults: Record<string, unknown> = {};
    Object.entries(properties).forEach(([key, prop]) => {
      if (initialValues && initialValues[key] !== undefined) {
        defaults[key] = initialValues[key];
      } else if (prop.default !== undefined) {
        defaults[key] = prop.default;
      } else if (key === 'workspace_id') {
        defaults[key] = workspaceId;
      } else if (prop.type === 'boolean') {
        defaults[key] = false;
      } else if (prop.type === 'array') {
        defaults[key] = [];
      } else {
        defaults[key] = '';
      }
    });
    setFormValues(defaults);
    setMode(initialMode || getDefaultMode(action));
    setIdempotencyKey(generateIdempotencyKey());
    setConfirmationToken(initialToken || '');
    setErrors({});
  }, [action.id, workspaceId]);

  const handleFieldChange = (field: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Validate required fields
    requiredFields.forEach((field) => {
      const val = formValues[field];
      if (val === undefined || val === null || val === '') {
        const fieldTitle = properties[field]?.title || field;
        newErrors[field] = `${fieldTitle} is required`;
      } else if (Array.isArray(val) && val.length === 0) {
        const fieldTitle = properties[field]?.title || field;
        newErrors[field] = `At least one item is required for ${fieldTitle}`;
      }
    });

    // Validate number and integer types
    Object.entries(properties).forEach(([field, prop]) => {
      const val = formValues[field];
      if (val !== undefined && val !== null && val !== '') {
        if (prop.type === 'integer' || prop.type === 'number') {
          const num = Number(val);
          if (isNaN(num)) {
            newErrors[field] = 'Must be a valid number';
          } else if (prop.type === 'integer' && !Number.isInteger(num)) {
            newErrors[field] = 'Must be a whole integer';
          } else if (prop.minimum !== undefined && num < prop.minimum) {
            newErrors[field] = `Must be at least ${prop.minimum}`;
          } else if (prop.maximum !== undefined && num > prop.maximum) {
            newErrors[field] = `Must be at most ${prop.maximum}`;
          }
        }
      }
    });

    // If mode is commit, token is required if confirming a proposal or destructive (§5.1, §6.2)
    if (mode === 'commit' && (action.side_effect === 'destructive' || Boolean(initialToken))) {
      if (!confirmationToken.trim()) {
        newErrors['confirmation_token'] = 'A confirmation token is required for commit mode';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    // Convert values to payload matching schema types
    const cleanedPayload: Record<string, unknown> = {};
    Object.entries(formValues).forEach(([key, val]) => {
      const prop = properties[key];
      if (val === '' && !requiredFields.includes(key)) {
        return;
      }
      if (prop?.type === 'integer') {
        cleanedPayload[key] = val !== '' ? parseInt(String(val), 10) : undefined;
      } else if (prop?.type === 'number') {
        cleanedPayload[key] = val !== '' ? parseFloat(String(val)) : undefined;
      } else {
        cleanedPayload[key] = val;
      }
    });

    onSubmit({
      mode,
      input: cleanedPayload,
      idempotency_key: idempotencyKey,
      confirmation_token: mode === 'commit' ? confirmationToken : undefined,
    });
  };

  const renderField = (field: string, prop: JsonSchemaProperty) => {
    const isRequired = requiredFields.includes(field);
    const value = formValues[field];
    const fieldError = errors[field];
    const fieldTitle = prop.title || field.replace(/_/g, ' ');

    if (prop.enum && prop.enum.length > 0) {
      return (
        <div key={field} className="space-y-1">
          <label
            htmlFor={`field-${field}`}
            className="block text-xs font-semibold text-[var(--ink-primary)] capitalize"
          >
            {fieldTitle} {isRequired && <span className="text-[var(--accent-terracotta)]">*</span>}
          </label>
          <select
            id={`field-${field}`}
            data-testid={`action-input-${field}`}
            value={String(value ?? '')}
            onChange={(e) => handleFieldChange(field, e.target.value)}
            className="w-full px-3 py-1.5 text-xs bg-white border border-[var(--border-parchment)] rounded-lg text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-midnight)]"
          >
            <option value="">Select an option...</option>
            {prop.enum.map((opt) => (
              <option key={String(opt)} value={String(opt)}>
                {String(opt)}
              </option>
            ))}
          </select>
          {prop.description && (
            <p className="text-[10px] text-[var(--ink-tertiary)]">{prop.description}</p>
          )}
          {fieldError && (
            <p data-testid={`field-error-${field}`} className="text-[11px] text-rose-600 font-medium">
              {fieldError}
            </p>
          )}
        </div>
      );
    }

    if (prop.type === 'boolean') {
      return (
        <div key={field} className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)]">
          <div>
            <label
              htmlFor={`field-${field}`}
              className="text-xs font-semibold text-[var(--ink-primary)] capitalize cursor-pointer"
            >
              {fieldTitle} {isRequired && <span className="text-[var(--accent-terracotta)]">*</span>}
            </label>
            {prop.description && (
              <p className="text-[10px] text-[var(--ink-tertiary)]">{prop.description}</p>
            )}
          </div>
          <input
            id={`field-${field}`}
            data-testid={`action-input-${field}`}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => handleFieldChange(field, e.target.checked)}
            className="w-4 h-4 rounded text-[var(--accent-midnight)] focus:ring-[var(--accent-midnight)] cursor-pointer"
          />
        </div>
      );
    }

    if (prop.type === 'array') {
      const rawString = Array.isArray(value) ? value.join(', ') : String(value ?? '');
      return (
        <div key={field} className="space-y-1">
          <label
            htmlFor={`field-${field}`}
            className="block text-xs font-semibold text-[var(--ink-primary)] capitalize"
          >
            {fieldTitle} {isRequired && <span className="text-[var(--accent-terracotta)]">*</span>}
          </label>
          <input
            id={`field-${field}`}
            data-testid={`action-input-${field}`}
            type="text"
            value={rawString}
            onChange={(e) => {
              const items = e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
              handleFieldChange(field, items);
            }}
            placeholder="Comma-separated items..."
            className="w-full px-3 py-1.5 text-xs bg-white border border-[var(--border-parchment)] rounded-lg text-[var(--ink-primary)] placeholder-[var(--ink-tertiary)] focus:outline-none focus:border-[var(--accent-midnight)]"
          />
          <p className="text-[10px] text-[var(--ink-tertiary)]">
            {prop.description ? `${prop.description} ` : ''}(Separate multiple values with commas)
          </p>
          {fieldError && (
            <p data-testid={`field-error-${field}`} className="text-[11px] text-rose-600 font-medium">
              {fieldError}
            </p>
          )}
        </div>
      );
    }

    const isTextarea =
      field.includes('content') ||
      field.includes('query') ||
      field.includes('text') ||
      field.includes('question') ||
      field.includes('prompt') ||
      field.includes('summary') ||
      (prop.description && prop.description.length > 60);

    return (
      <div key={field} className="space-y-1">
        <label
          htmlFor={`field-${field}`}
          className="block text-xs font-semibold text-[var(--ink-primary)] capitalize"
        >
          {fieldTitle} {isRequired && <span className="text-[var(--accent-terracotta)]">*</span>}
        </label>
        {isTextarea ? (
          <textarea
            id={`field-${field}`}
            data-testid={`action-input-${field}`}
            rows={3}
            value={String(value ?? '')}
            onChange={(e) => handleFieldChange(field, e.target.value)}
            placeholder={prop.description || `Enter ${fieldTitle}...`}
            className="w-full px-3 py-2 text-xs bg-white border border-[var(--border-parchment)] rounded-lg text-[var(--ink-primary)] placeholder-[var(--ink-tertiary)] focus:outline-none focus:border-[var(--accent-midnight)] resize-y"
          />
        ) : (
          <input
            id={`field-${field}`}
            data-testid={`action-input-${field}`}
            type={prop.type === 'integer' || prop.type === 'number' ? 'number' : 'text'}
            value={String(value ?? '')}
            onChange={(e) => handleFieldChange(field, e.target.value)}
            placeholder={prop.description || `Enter ${fieldTitle}...`}
            className="w-full px-3 py-1.5 text-xs bg-white border border-[var(--border-parchment)] rounded-lg text-[var(--ink-primary)] placeholder-[var(--ink-tertiary)] focus:outline-none focus:border-[var(--accent-midnight)]"
          />
        )}
        {prop.description && !isTextarea && (
          <p className="text-[10px] text-[var(--ink-tertiary)]">{prop.description}</p>
        )}
        {fieldError && (
          <p data-testid={`field-error-${field}`} className="text-[11px] text-rose-600 font-medium">
            {fieldError}
          </p>
        )}
      </div>
    );
  };

  const isDisabled = Boolean(action.disabled_reason);

  return (
    <form
      data-testid="action-input-form"
      onSubmit={handleSubmit}
      className="flex flex-col h-full bg-white p-5 rounded-2xl border border-[var(--border-parchment)] shadow-sm space-y-4"
    >
      {/* Action Header Info */}
      <div className="pb-3 border-b border-[var(--border-parchment)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="serif text-base font-semibold text-[var(--ink-primary)]">
              {action.name}
            </h3>
            <span className="mono text-[10px] bg-[var(--bg-panel-subtle)] text-[var(--ink-secondary)] px-2 py-0.5 rounded border border-[var(--border-parchment)]">
              {action.id}
            </span>
          </div>
          <span className="mono text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-[var(--ink-secondary)]">
            {action.side_effect}
          </span>
        </div>
        <p className="text-xs text-[var(--ink-secondary)] mt-1 leading-relaxed">
          {action.description}
        </p>

        {isDisabled && (
          <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
            <i className="ph ph-warning-circle text-sm shrink-0 mt-0.5" />
            <span><strong>Cannot Execute:</strong> {action.disabled_reason}</span>
          </div>
        )}
      </div>

      {serverError && (
        <div
          data-testid="action-form-error"
          className="mx-4 mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2"
        >
          <i className="ph ph-warning-circle text-base shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold block">Server Error</span>
            <p className="text-[11px] leading-relaxed">{serverError}</p>
          </div>
        </div>
      )}

      {Object.keys(errors).length > 0 && (
        <div
          data-testid="action-validation-errors"
          className="mx-4 mt-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1.5"
          role="alert"
        >
          <div className="flex items-center gap-1.5 font-semibold">
            <i className="ph ph-warning-circle text-sm" />
            <span>Please correct the following errors before submitting:</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-[11px] pl-1">
            {Object.entries(errors).map(([key, msg]) => (
              <li key={key}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Dynamic Schema Fields */}
      <div
        tabIndex={0}
        aria-label="Action input form fields"
        className="flex-1 overflow-y-auto space-y-3.5 pr-1 hyades-scroll focus:outline-none"
      >
        {Object.keys(properties).length === 0 ? (
          <div className="p-4 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-center text-xs text-[var(--ink-tertiary)] italic">
            This action requires no input parameters.
          </div>
        ) : (
          Object.entries(properties).map(([field, prop]) => renderField(field, prop))
        )}

        {/* Execution Mode & Safety Controls (§5.1, §6.2) */}
        <div className="pt-3 border-t border-[var(--border-parchment)] space-y-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] mono uppercase font-semibold text-[var(--ink-secondary)]">
              Execution Mode
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                data-testid="mode-select-read"
                disabled={action.side_effect !== 'read'}
                onClick={() => setMode('read')}
                className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                  mode === 'read'
                    ? 'bg-[var(--accent-midnight)] text-white border-[var(--accent-midnight)] shadow-2xs'
                    : 'bg-white border-[var(--border-parchment)] text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)]'
                }`}
              >
                Read
              </button>
              <button
                type="button"
                data-testid="mode-select-propose"
                disabled={action.side_effect === 'read'}
                onClick={() => setMode('propose')}
                className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                  mode === 'propose'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                    : 'bg-white border-[var(--border-parchment)] text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)]'
                }`}
              >
                Propose
              </button>
              <button
                type="button"
                data-testid="mode-select-commit"
                disabled={action.side_effect === 'read'}
                onClick={() => setMode('commit')}
                className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                  mode === 'commit'
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                    : 'bg-white border-[var(--border-parchment)] text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)]'
                }`}
              >
                Commit
              </button>
            </div>
          </div>

          {/* Confirmation Token input when committing a proposal */}
          {mode === 'commit' && action.side_effect !== 'read' && (
            <div className="space-y-1 p-3 rounded-xl bg-amber-50/70 border border-amber-200">
              <label
                htmlFor="confirmation-token"
                className="block text-xs font-semibold text-amber-950"
              >
                Server Confirmation Token <span className="text-[var(--accent-terracotta)]">*</span>
              </label>
              <input
                id="confirmation-token"
                data-testid="action-input-confirmation-token"
                type="text"
                value={confirmationToken}
                onChange={(e) => {
                  setConfirmationToken(e.target.value);
                  if (errors['confirmation_token']) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next['confirmation_token'];
                      return next;
                    });
                  }
                }}
                placeholder="Enter server-issued confirmation token..."
                className="w-full px-3 py-1.5 text-xs bg-white border border-amber-300 rounded-lg text-[var(--ink-primary)] font-mono placeholder-gray-400 focus:outline-none focus:border-amber-600"
              />
              <p className="text-[10px] text-amber-900 leading-tight">
                Two-phase safety: proposed mutations require the server-issued token to commit (§6.2).
              </p>
              {errors['confirmation_token'] && (
                <p data-testid="field-error-confirmation_token" className="text-[11px] text-rose-600 font-medium">
                  {errors['confirmation_token']}
                </p>
              )}
            </div>
          )}

          {/* Idempotency Key (§6.7) */}
          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-[11px]">
            <div className="min-w-0 flex-1 truncate">
              <span className="mono text-[10px] text-[var(--ink-tertiary)] uppercase font-semibold block">
                Idempotency Key
              </span>
              <span
                data-testid="action-idempotency-key"
                className="mono text-[10px] text-[var(--ink-secondary)] truncate block"
                title={idempotencyKey}
              >
                {idempotencyKey}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIdempotencyKey(generateIdempotencyKey())}
              disabled={isSubmitting}
              className="text-[10px] mono text-[var(--accent-midnight)] underline hover:text-[var(--accent-terracotta)] cursor-pointer disabled:opacity-50 shrink-0"
              title="Generate new idempotency key for logical execution"
            >
              New Key
            </button>
          </div>
        </div>
      </div>

      {/* Form Action Buttons */}
      <div className="pt-3 border-t border-[var(--border-parchment)] flex items-center justify-end gap-2 shrink-0">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-3.5 py-1.5 rounded-lg border border-[var(--border-strong)] bg-white text-xs font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-panel-subtle)] transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          data-testid="execute-action-btn"
          disabled={isSubmitting || isDisabled}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold text-white shadow-2xs transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
            action.side_effect === 'destructive'
              ? 'bg-rose-700 hover:bg-rose-800'
              : mode === 'commit'
              ? 'bg-emerald-700 hover:bg-emerald-800'
              : 'bg-[var(--accent-midnight)] hover:bg-[var(--accent-midnight-light)]'
          }`}
        >
          {isSubmitting ? (
            <>
              <i className="ph ph-spinner animate-spin text-sm" />
              <span>Executing...</span>
            </>
          ) : (
            <>
              <i className="ph ph-play text-sm" />
              <span>
                {action.side_effect === 'destructive'
                  ? 'Propose Deletion'
                  : mode === 'propose'
                  ? 'Propose Changes'
                  : mode === 'commit'
                  ? 'Commit Action'
                  : 'Execute Action'}
              </span>
            </>
          )}
        </button>
      </div>
    </form>
  );
};
