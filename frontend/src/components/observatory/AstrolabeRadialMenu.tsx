import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { GraphEntity } from '@/types/graph_entity';
import {
  Edit3,
  Share2,
  Compass,
  Trash2,
  Copy,
  Focus,
  PlusCircle,
  FileText,
  RotateCcw,
  Network,
  Layers,
  UploadCloud,
  Grid,
  Sparkles,
  Check,
} from 'lucide-react';

export interface RadialAction {
  id: string;
  label: string;
  subtitle: string;
  color: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  onSelect: () => void;
  destructive?: boolean;
}

export interface AstrolabeRadialMenuProps {
  /** Target celestial entity if right-clicked on a star, or null if clicked on empty void */
  entity?: GraphEntity | null;
  /** Viewport spawn coordinates from the right-click mouse event */
  position: { x: number; y: number };
  /** Called when menu is dismissed via Escape, backdrop click, or action execution */
  onClose: () => void;
  /** Issue #37: Edit entity handler (opens EntityEditor in edit mode) */
  onEditEntity?: (entity: GraphEntity) => void;
  /** Add relationship vector with this entity as source */
  onAddRelationship?: (entity: GraphEntity) => void;
  /** Smoothly focus camera on this entity and highlight 1-hop neighborhood */
  onFocusEntity?: (entity: GraphEntity) => void;
  /** Carry entity context into conversational query */
  onAskStella?: (entity: GraphEntity | null) => void;
  /** Delete entity handler (triggers DELETE /api/v1/entities/{id}) */
  onDeleteEntity?: (entity: GraphEntity) => void;
  /** Void action: Create brand new entity */
  onCreateEntity?: (coords: { x: number; y: number }) => void;
  /** Void action: Create new field note anchored to coordinate */
  onCreateNote?: (coords: { x: number; y: number }) => void;
  /** Void action: Re-center camera */
  onResetCamera?: () => void;
  /** Void action: Untangle / relax graph layout */
  onUntangleGraph?: () => void;
  /** Void action: Partition by spectral cluster */
  onClusterGraph?: () => void;
  /** Void action: Import archive */
  onImportSources?: () => void;
  /** Void action: Toggle celestial sky grid */
  onToggleSkyGrid?: () => void;
}

const R_IN = 78;
const R_OUT = 212;
const MARGIN = 250; // Viewport clamping margin

/**
 * AstrolabeRadialMenu
 *
 * 8-sector annular donut context menu for the Hyades Observatory.
 * Organizes action wedges in a mathematically continuous 360-degree
 * optical spectral gradient (Terracotta -> Amber -> Brass -> Celadon
 * -> Cyan -> Cobalt -> Twilight -> Plum -> Terracotta).
 */
export const AstrolabeRadialMenu: React.FC<AstrolabeRadialMenuProps> = ({
  entity,
  position,
  onClose,
  onEditEntity,
  onAddRelationship,
  onFocusEntity,
  onAskStella,
  onDeleteEntity,
  onCreateEntity,
  onCreateNote,
  onResetCamera,
  onUntangleGraph,
  onClusterGraph,
  onImportSources,
  onToggleSkyGrid,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Keyboard navigation & Escape dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Copy ID / Label utility
  const handleCopyId = useCallback(async () => {
    if (!entity) return;
    try {
      await navigator.clipboard.writeText(entity.id);
      setCopiedNotification(true);
      setTimeout(() => {
        setCopiedNotification(false);
        onClose();
      }, 700);
    } catch {
      onClose();
    }
  }, [entity, onClose]);

  // Construct action items with 360° continuous spectral gradient loop
  const actions: RadialAction[] = useMemo(() => {
    if (entity) {
      // 6-Slice Hexagonal Loop: 16° -> 50° -> 145° -> 218° -> 252° -> 332° -> 16°
      return [
        {
          id: 'edit',
          label: 'EDIT',
          subtitle: 'Name & Type',
          color: '#BD532B', // 16° Terracotta (Red-Orange)
          icon: Edit3,
          onSelect: () => {
            onClose();
            onEditEntity?.(entity);
          },
        },
        {
          id: 'link',
          label: 'LINK',
          subtitle: 'Connect Star',
          color: '#8C731A', // 50° Olive Brass (Golden Brass)
          icon: Share2,
          onSelect: () => {
            onClose();
            onAddRelationship?.(entity);
          },
        },
        {
          id: 'copy',
          label: copiedNotification ? 'COPIED' : 'COPY ID',
          subtitle: 'UUID / Label',
          color: '#28754E', // 145° Jade Celadon (Green)
          icon: copiedNotification ? Check : Copy,
          onSelect: handleCopyId,
        },
        {
          id: 'focus',
          label: 'FOCUS',
          subtitle: 'Center & 1-Hop',
          color: '#1E50A2', // 218° Ultramarine (Cobalt Blue)
          icon: Focus,
          onSelect: () => {
            onClose();
            onFocusEntity?.(entity);
          },
        },
        {
          id: 'stella',
          label: 'STELLA',
          subtitle: 'Ask Context',
          color: '#483A7E', // 252° Twilight Indigo (Violet)
          icon: Compass,
          onSelect: () => {
            onClose();
            onAskStella?.(entity);
          },
        },
        {
          id: 'prune',
          label: 'PRUNE',
          subtitle: 'Delete Star',
          color: '#863259', // 332° Imperial Plum (Crimson Wine -> wraps to 16°)
          icon: Trash2,
          destructive: true,
          onSelect: () => {
            onClose();
            onDeleteEntity?.(entity);
          },
        },
      ];
    }

    // 8-Slice Annular Donut (KnifeLemon/Filee 1:1 Match)
    // Continuous 360° Spectral Gradient: 16° -> 35° -> 50° -> 145° -> 190° -> 218° -> 252° -> 332° -> 16°
    return [
      {
        id: 'new_star',
        label: 'NEW STAR',
        subtitle: 'Create Entity',
        color: '#BD532B', // 1. 16°  Cinnabar Terracotta (Red-Orange)
        icon: PlusCircle,
        onSelect: () => {
          onClose();
          onCreateEntity?.(position);
        },
      },
      {
        id: 'new_note',
        label: 'NEW NOTE',
        subtitle: 'Field Log',
        color: '#B86B15', // 2. 35°  Golden Amber Ochre (Orange-Yellow)
        icon: FileText,
        onSelect: () => {
          onClose();
          onCreateNote?.(position);
        },
      },
      {
        id: 'recenter',
        label: 'FIT VIEW',
        subtitle: 'Center Origin',
        color: '#8C731A', // 3. 50°  Burnished Olive Brass (Yellow-Gold)
        icon: RotateCcw,
        onSelect: () => {
          onClose();
          onResetCamera?.();
        },
      },
      {
        id: 'untangle',
        label: 'UNTANGLE',
        subtitle: 'Relax Graph',
        color: '#28754E', // 4. 145° Verdigris Jade Celadon (Green)
        icon: Network,
        onSelect: () => {
          onClose();
          onUntangleGraph?.();
        },
      },
      {
        id: 'import',
        label: 'IMPORT',
        subtitle: 'Ingest PDF/MD',
        color: '#1C7688', // 5. 190° Antwerp Oceanic Cyan (Cyan-Teal)
        icon: UploadCloud,
        onSelect: () => {
          onClose();
          onImportSources?.();
        },
      },
      {
        id: 'cluster',
        label: 'CLUSTER',
        subtitle: 'Spectral Sort',
        color: '#1E50A2', // 6. 218° Ultramarine Cobalt (Royal Blue)
        icon: Layers,
        onSelect: () => {
          onClose();
          onClusterGraph?.();
        },
      },
      {
        id: 'synthesize',
        label: 'STELLA',
        subtitle: 'Query Horizon',
        color: '#483A7E', // 7. 252° Astral Twilight Indigo (Violet-Indigo)
        icon: Sparkles,
        onSelect: () => {
          onClose();
          onAskStella?.(null);
        },
      },
      {
        id: 'sky_grid',
        label: 'SKY GRID',
        subtitle: 'Toggle Reticle',
        color: '#863259', // 8. 332° Imperial Murasaki Plum (Plum-Crimson -> wraps to Terracotta)
        icon: Grid,
        onSelect: () => {
          onClose();
          onToggleSkyGrid?.();
        },
      },
    ];
  }, [
    entity,
    copiedNotification,
    position,
    onClose,
    onEditEntity,
    onAddRelationship,
    onFocusEntity,
    onAskStella,
    onDeleteEntity,
    onCreateEntity,
    onCreateNote,
    onResetCamera,
    onUntangleGraph,
    onClusterGraph,
    onImportSources,
    onToggleSkyGrid,
    handleCopyId,
  ]);

  const cx = Math.max(MARGIN, Math.min(window.innerWidth - MARGIN, position.x));
  const cy = Math.max(MARGIN, Math.min(window.innerHeight - MARGIN, position.y));

  const N = actions.length;
  const sliceAngle = (2 * Math.PI) / N;

  const degreeTicks = useMemo(() => {
    const ticks = [];
    for (let deg = 0; deg < 360; deg += 5) {
      const rad = (deg * Math.PI) / 180;
      const r1 = 218;
      const r2 = deg % 30 === 0 ? 228 : deg % 10 === 0 ? 224 : 221;
      ticks.push({
        x1: r1 * Math.cos(rad),
        y1: r1 * Math.sin(rad),
        x2: r2 * Math.cos(rad),
        y2: r2 * Math.sin(rad),
        isMajor: deg % 90 === 0,
      });
    }
    return ticks;
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 select-none"
      role="dialog"
      aria-modal="true"
      aria-label={entity ? `Astrolabe actions for ${entity.name}` : 'Observatory void actions'}
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/15 backdrop-blur-[0.5px]" />

      <div
        className="absolute pointer-events-auto transform -translate-x-1/2 -translate-y-1/2"
        style={{ left: cx, top: cy, width: 480, height: 480 }}
        onClick={(e) => e.stopPropagation()}
      >
        <svg
          width="480"
          height="480"
          viewBox="-240 -240 480 480"
          className="overflow-visible"
          role="menu"
        >
          {/* Astrolabe Outer Brass Rims */}
          <circle
            cx="0"
            cy="0"
            r="218"
            fill="none"
            stroke="var(--hairline-color, #E5DEC9)"
            strokeWidth="1.4"
          />
          <circle
            cx="0"
            cy="0"
            r="225"
            fill="none"
            stroke="#8C731A"
            strokeWidth="0.9"
            opacity="0.6"
          />

          {/* Astrolabe Degree Ticks */}
          <g opacity="0.7">
            {degreeTicks.map((t, idx) => (
              <line
                key={`tick-${idx}`}
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke={t.isMajor ? '#8C731A' : 'var(--hairline-color, #E5DEC9)'}
                strokeWidth={t.isMajor ? 1.8 : 1}
              />
            ))}
          </g>

          {/* Annular Wedges */}
          <g>
            {actions.map((act, i) => {
              const centerAngle = -Math.PI / 2 + i * sliceAngle;
              // Seamless boundaries: constant uniform 2.5px hairline dividers
              const startAngle = centerAngle - sliceAngle / 2;
              const endAngle = centerAngle + sliceAngle / 2;

              const x1 = R_IN * Math.cos(startAngle);
              const y1 = R_IN * Math.sin(startAngle);
              const x2 = R_OUT * Math.cos(startAngle);
              const y2 = R_OUT * Math.sin(startAngle);
              const x3 = R_OUT * Math.cos(endAngle);
              const y3 = R_OUT * Math.sin(endAngle);
              const x4 = R_IN * Math.cos(endAngle);
              const y4 = R_IN * Math.sin(endAngle);

              const arcPath = `M ${x1} ${y1} L ${x2} ${y2} A ${R_OUT} ${R_OUT} 0 0 1 ${x3} ${y3} L ${x4} ${y4} A ${R_IN} ${R_IN} 0 0 0 ${x1} ${y1} Z`;

              const isHovered = hoveredIndex === i;
              const deltaX = isHovered ? Math.round(9 * Math.cos(centerAngle)) : 0;
              const deltaY = isHovered ? Math.round(9 * Math.sin(centerAngle)) : 0;

              const midR = (R_IN + R_OUT) / 2;
              const midX = midR * Math.cos(centerAngle);
              const midY = midR * Math.sin(centerAngle);

              const Icon = act.icon;

              return (
                <g
                  key={act.id}
                  role="menuitem"
                  tabIndex={0}
                  aria-label={`${act.label}: ${act.subtitle}`}
                  className="cursor-pointer transition-all duration-180 ease-out"
                  transform={`translate(${deltaX}, ${deltaY})`}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    act.onSelect();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      act.onSelect();
                    }
                  }}
                >
                  {/* Wedge Arc Surface with uniform hairline divider */}
                  <path
                    d={arcPath}
                    fill={isHovered ? act.color : 'var(--bg-surface-elevated, #F5EFE6)'}
                    stroke="var(--bg-paper, #FAF7F2)"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    className="transition-colors duration-140"
                    style={{
                      filter: isHovered ? 'drop-shadow(0 10px 24px rgba(0,0,0,0.26))' : 'none',
                    }}
                  />

                  {/* Icon & Typography */}
                  <g transform={`translate(${midX}, ${midY})`}>
                    {/* Uniform 32px Optical Lens Capsule */}
                    <g transform="translate(0, -28)">
                      <circle
                        cx="0"
                        cy="0"
                        r="16"
                        fill={isHovered ? 'rgba(255, 255, 255, 0.22)' : 'var(--bg-card, #FFFFFF)'}
                        stroke={isHovered ? 'rgba(255, 255, 255, 0.45)' : 'var(--hairline-color, #E5DEC9)'}
                        strokeWidth="1.2"
                        className="transition-colors duration-140"
                      />
                      <g transform="translate(-9, -9) scale(0.82)">
                        <Icon
                          size={22}
                          strokeWidth={1.8}
                          className={isHovered ? 'text-white' : 'text-[var(--ink-secondary,#6E675F)]'}
                        />
                      </g>
                    </g>

                    <text
                      x="0"
                      y="6"
                      textAnchor="middle"
                      className={`font-mono ${N === 8 ? 'text-[12px]' : 'text-[13px]'} font-bold tracking-wider transition-colors duration-140`}
                      fill={isHovered ? '#FFFFFF' : 'var(--ink-primary, #181614)'}
                    >
                      {act.label}
                    </text>
                    <text
                      x="0"
                      y="22"
                      textAnchor="middle"
                      className={`font-serif italic ${N === 8 ? 'text-[10.5px]' : 'text-[11.5px]'} transition-colors duration-140`}
                      fill={isHovered ? '#FAF7F2' : 'var(--ink-secondary, #6E675F)'}
                    >
                      {act.subtitle}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>

          {/* Central Hub Reticle (Dismiss & Target Summary) */}
          <g
            className="cursor-pointer"
            onClick={onClose}
            title="Click or press Esc to close"
          >
            <circle
              cx="0"
              cy="0"
              r="78"
              fill="var(--bg-card, #FFFFFF)"
              stroke="#8C731A"
              strokeWidth="1.8"
              className="shadow-2xl"
            />
            <circle
              cx="0"
              cy="0"
              r="72"
              fill="none"
              stroke="var(--hairline-color, #E5DEC9)"
              strokeWidth="1"
              strokeDasharray="2.5 2.5"
            />

            {entity ? (
              <>
                <text
                  x="0"
                  y="-32"
                  textAnchor="middle"
                  className="font-mono text-[10px] uppercase tracking-widest font-bold"
                  fill={
                    entity.entity_type === 'concept'
                      ? '#BD532B'
                      : entity.entity_type === 'observation'
                      ? '#8C731A'
                      : '#1E50A2'
                  }
                >
                  {(entity.entity_type || 'ENTITY').toUpperCase()}
                </text>
                <text
                  x="0"
                  y="-6"
                  textAnchor="middle"
                  className="font-serif font-bold text-[16px] tracking-wide"
                  fill="var(--ink-primary, #181614)"
                >
                  {entity.name.length > 18 ? `${entity.name.slice(0, 17)}…` : entity.name}
                </text>
                <text
                  x="0"
                  y="18"
                  textAnchor="middle"
                  className="font-mono text-[11px]"
                  fill="var(--ink-faint, #A69E94)"
                >
                  {entity.description ? 'Documented Star' : 'Empty Star'}
                </text>
              </>
            ) : (
              <>
                <text
                  x="0"
                  y="-26"
                  textAnchor="middle"
                  className="font-mono text-[10px] uppercase tracking-widest font-bold"
                  fill="var(--ink-secondary, #6E675F)"
                >
                  VOID RETICLE
                </text>
                <text
                  x="0"
                  y="-2"
                  textAnchor="middle"
                  className="font-serif font-bold text-[16px] tracking-wide"
                  fill="var(--ink-primary, #181614)"
                >
                  Observatory
                </text>
                <text
                  x="0"
                  y="20"
                  textAnchor="middle"
                  className="font-mono text-[11px]"
                  fill="var(--ink-faint, #A69E94)"
                >
                  ({Math.round(position.x)}, {Math.round(position.y)})
                </text>
              </>
            )}

            <text
              x="0"
              y="42"
              textAnchor="middle"
              className="font-mono text-[10px] uppercase tracking-wider font-medium"
              fill="var(--ink-secondary, #6E675F)"
            >
              Esc • Close
            </text>
          </g>
        </svg>
      </div>
    </div>,
    document.body
  );
};

