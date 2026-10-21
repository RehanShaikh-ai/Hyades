import React, { useState, useMemo } from 'react';
import { ActionDefinition, ActionClassification } from '@/types/actions';

export interface ActionCatalogueProps {
  actions: ActionDefinition[];
  selectedActionId?: string | null;
  selectedAction?: ActionDefinition | null;
  onSelectAction: (action: ActionDefinition) => void;
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

const DOMAIN_LABELS: Record<string, string> = {
  all: 'All Domains',
  knowledge: 'Knowledge',
  notes: 'Notes',
  sources: 'Sources',
  entities: 'Entities',
  graph: 'Graph',
  collections: 'Collections',
  threads: 'Threads',
  inbox: 'Inbox',
};

const CLASSIFICATION_CONFIG: Record<
  ActionClassification,
  { label: string; bg: string; text: string; border: string; icon: string }
> = {
  read: {
    label: 'Read',
    bg: 'bg-slate-100',
    text: 'text-slate-800',
    border: 'border-slate-300',
    icon: 'ph-eye',
  },
  propose: {
    label: 'Propose',
    bg: 'bg-amber-50',
    text: 'text-amber-900',
    border: 'border-amber-300',
    icon: 'ph-git-pull-request',
  },
  write: {
    label: 'Write',
    bg: 'bg-emerald-50',
    text: 'text-emerald-900',
    border: 'border-emerald-300',
    icon: 'ph-pencil-simple',
  },
  destructive: {
    label: 'Destructive',
    bg: 'bg-rose-50',
    text: 'text-rose-900',
    border: 'border-rose-300',
    icon: 'ph-warning',
  },
};

export const ActionCatalogue: React.FC<ActionCatalogueProps> = ({
  actions,
  selectedActionId: propActionId,
  selectedAction,
  onSelectAction,
  isLoading = false,
  error = null,
  onRefresh,
}) => {
  const activeSelectedId = propActionId ?? selectedAction?.id ?? null;
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [selectedClassification, setSelectedClassification] = useState<string>('all');

  // Extract unique domains from actions
  const availableDomains = useMemo(() => {
    const set = new Set<string>();
    actions.forEach((a) => {
      const prefix = a.id.split('.')[0];
      if (prefix) set.add(prefix);
    });
    return Array.from(set).sort();
  }, [actions]);

  // Filter actions
  const filteredActions = useMemo(() => {
    return actions.filter((action) => {
      const domain = action.id.split('.')[0];
      if (selectedDomain !== 'all' && domain !== selectedDomain) return false;
      if (
        selectedClassification !== 'all' &&
        action.side_effect !== selectedClassification
      )
        return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        action.id.toLowerCase().includes(q) ||
        action.name.toLowerCase().includes(q) ||
        action.description.toLowerCase().includes(q)
      );
    });
  }, [actions, selectedDomain, selectedClassification, searchQuery]);

  return (
    <div
      data-testid="action-catalogue"
      className="flex flex-col h-full min-h-0 bg-[var(--bg-panel)] border-r border-[var(--border-parchment)] overflow-hidden"
    >
      {/* Header & Search */}
      <div className="p-4 border-b border-[var(--border-parchment)] space-y-3 shrink-0 bg-white/60">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="serif text-lg font-semibold text-[var(--ink-primary)]">
              Action Catalogue
            </h2>
            <p className="text-[11px] text-[var(--ink-secondary)]">
              Canonical Manual Actions ({filteredActions.length} of {actions.length})
            </p>
          </div>
          {onRefresh && (
            <button
              type="button"
              data-testid="refresh-catalogue-btn"
              onClick={onRefresh}
              aria-label="Refresh action catalogue"
              disabled={isLoading}
              className="p-1.5 rounded-lg border border-[var(--border-parchment)] bg-white hover:bg-[var(--bg-panel-subtle)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh actions from backend registry"
            >
              <i className={`ph ph-arrows-clockwise text-sm ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>

        {/* Search input */}
        <div className="relative">
          <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-tertiary)]" />
          <input
            type="text"
            data-testid="action-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search actions by name, verb, or description..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] rounded-lg text-[var(--ink-primary)] placeholder-[var(--ink-tertiary)] focus:outline-none focus:border-[var(--accent-midnight)] focus:bg-white transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)] cursor-pointer"
              aria-label="Clear search query"
            >
              ✕
            </button>
          )}
        </div>

        {/* Domain Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 hyades-scroll">
          <button
            type="button"
            data-testid="domain-filter-all"
            onClick={() => setSelectedDomain('all')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors shrink-0 cursor-pointer ${
              selectedDomain === 'all'
                ? 'bg-[var(--accent-midnight)] text-[#FAF8F2] shadow-2xs'
                : 'bg-white border border-[var(--border-parchment)] text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)]'
            }`}
          >
            All
          </button>
          {availableDomains.map((dom) => (
            <button
              key={dom}
              type="button"
              data-testid={`domain-filter-${dom}`}
              onClick={() => setSelectedDomain(dom)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition-colors shrink-0 cursor-pointer ${
                selectedDomain === dom
                  ? 'bg-[var(--accent-midnight)] text-[#FAF8F2] shadow-2xs'
                  : 'bg-white border border-[var(--border-parchment)] text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)]'
              }`}
            >
              {DOMAIN_LABELS[dom] || dom}
            </button>
          ))}
        </div>

        {/* Classification Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 hyades-scroll">
          <span className="text-[10px] mono uppercase text-[var(--ink-tertiary)] mr-1">
            Mode:
          </span>
          <button
            type="button"
            onClick={() => setSelectedClassification('all')}
            className={`px-2 py-0.5 rounded text-[10px] mono font-medium transition-colors shrink-0 cursor-pointer ${
              selectedClassification === 'all'
                ? 'bg-[var(--accent-brass)] text-white'
                : 'bg-white border border-[var(--border-parchment)] text-[var(--ink-tertiary)]'
            }`}
          >
            All
          </button>
          {(['read', 'propose', 'write', 'destructive'] as ActionClassification[]).map((cls) => {
            const conf = CLASSIFICATION_CONFIG[cls];
            return (
              <button
                key={cls}
                type="button"
                data-testid={`classification-filter-${cls}`}
                onClick={() => setSelectedClassification(cls)}
                className={`px-2 py-0.5 rounded text-[10px] mono font-medium transition-colors shrink-0 cursor-pointer flex items-center gap-1 ${
                  selectedClassification === cls
                    ? 'bg-[var(--accent-midnight)] text-[#FAF8F2]'
                    : `${conf.bg} ${conf.text} border ${conf.border}`
                }`}
              >
                <i className={`ph ${conf.icon} text-[10px]`} />
                <span>{conf.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Catalogue List Content */}
      <div
        data-testid="action-list-container"
        tabIndex={0}
        className="flex-1 overflow-y-auto divide-y divide-[var(--border-parchment)] p-2 space-y-1.5 focus:outline-none"
        role="list"
        aria-label="Available Actions List"
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <div className="w-7 h-7 rounded-full border-2 border-[var(--accent-terracotta)] border-t-transparent animate-spin" />
            <span className="text-xs text-[var(--ink-secondary)]">Loading action catalogue from registry...</span>
          </div>
        ) : error ? (
          <div
            data-testid="catalogue-error-state"
            className="p-4 m-2 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-2"
          >
            <div className="flex items-center gap-2 font-semibold">
              <i className="ph ph-warning-circle text-base" />
              <span>Failed to Load Action Catalogue</span>
            </div>
            <p className="text-[11px] leading-relaxed">{error}</p>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="px-3 py-1 rounded-md bg-white border border-rose-300 text-rose-900 font-medium hover:bg-rose-100 transition-colors cursor-pointer"
              >
                Retry
              </button>
            )}
          </div>
        ) : filteredActions.length === 0 ? (
          <div
            data-testid="catalogue-empty-state"
            className="p-8 text-center flex flex-col items-center justify-center space-y-2"
          >
            <i className="ph ph-tray text-3xl text-[var(--ink-tertiary)]" />
            <p className="serif text-sm font-semibold text-[var(--ink-primary)]">
              No actions match criteria
            </p>
            <p className="text-xs text-[var(--ink-secondary)] max-w-xs">
              Try adjusting your domain filters or search query to see available actions.
            </p>
            {(selectedDomain !== 'all' || selectedClassification !== 'all' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedDomain('all');
                  setSelectedClassification('all');
                  setSearchQuery('');
                }}
                className="mt-2 px-3 py-1 text-xs font-medium rounded-lg border border-[var(--border-strong)] bg-white text-[var(--ink-primary)] hover:bg-[var(--bg-panel-subtle)] transition-colors cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          filteredActions.map((action) => {
            const isSelected = activeSelectedId === action.id;
            const isDisabled = Boolean(action.disabled_reason);
            const classConfig = CLASSIFICATION_CONFIG[action.side_effect] || CLASSIFICATION_CONFIG.read;

            return (
              <div
                key={action.id}
                role="listitem"
                data-testid={`action-card-${action.id}`}
                onClick={() => onSelectAction(action)}
                className={`p-3 rounded-xl border transition-all cursor-pointer select-none group ${
                  isSelected
                    ? 'bg-white border-[var(--accent-midnight)] shadow-sm ring-1 ring-[var(--accent-midnight)]'
                    : 'bg-white/80 border-[var(--border-parchment)] hover:bg-white hover:border-[var(--border-strong)]'
                } ${isDisabled ? 'opacity-75' : ''}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="serif text-sm font-semibold text-[var(--ink-primary)] group-hover:text-[var(--accent-midnight)] transition-colors">
                        {action.name}
                      </span>
                      <span className="mono text-[10px] text-[var(--ink-tertiary)] bg-[var(--bg-panel-subtle)] px-1.5 py-0.5 rounded border border-[var(--border-parchment)]">
                        {action.id}
                      </span>
                    </div>
                  </div>

                  {/* Side-effect classification badge (§3.1, §3.3) */}
                  <span
                    data-testid={`action-badge-${action.id}`}
                    className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-mono font-medium border flex items-center gap-1 ${classConfig.bg} ${classConfig.text} ${classConfig.border}`}
                    title={`Classification: ${classConfig.label}`}
                  >
                    <i className={`ph ${classConfig.icon} text-[10px]`} />
                    <span>{classConfig.label}</span>
                  </span>
                </div>

                <p className="text-xs text-[var(--ink-secondary)] leading-relaxed line-clamp-2 mb-2">
                  {action.description}
                </p>

                {/* Disabled reason callout if disabled (§5.2) */}
                {isDisabled && (
                  <div
                    data-testid={`action-disabled-reason-${action.id}`}
                    className="p-2 rounded-lg bg-amber-50/80 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-1.5 mb-2"
                  >
                    <i className="ph ph-warning-circle text-xs shrink-0 mt-0.5" />
                    <span><strong>Disabled:</strong> {action.disabled_reason}</span>
                  </div>
                )}

                {/* Footer metadata */}
                <div className="flex items-center justify-between text-[10px] text-[var(--ink-tertiary)] mono pt-1 border-t border-[var(--border-parchment)]/60">
                  <span>
                    Inputs: {action.input_schema?.properties ? Object.keys(action.input_schema.properties).length : 0}
                  </span>
                  {action.timeout_class && (
                    <span className="capitalize">Timeout: {action.timeout_class}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
