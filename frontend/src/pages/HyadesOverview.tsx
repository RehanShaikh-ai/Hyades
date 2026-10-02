import React, { useEffect, useState, useMemo } from 'react';
import { getWorkspaceDashboard } from '@/api/dashboard';
import { listNotes } from '@/api/notes';
import { listClusters } from '@/api/clusters';
import { getWorkspaceGraph } from '@/api/graph';
import { DashboardStats } from '@/types/dashboard';
import { Note } from '@/types/note';
import { GraphClusterSummary, GraphResponse, ObservatoryTarget } from '@/types/graph';
import classicalElevation from '@/assets/plates/classical-elevation.jpg';
import classicalAtrium from '@/assets/plates/classical-atrium.jpg';
import classicalColonnade from '@/assets/plates/classical-colonnade.jpg';

interface HyadesOverviewProps {
  workspaceId: string;
  onNavigateToDestination: (dest: 'overview' | 'library' | 'observatory' | 'stella') => void;
  onNavigateToObservatory?: (target?: ObservatoryTarget) => void;
  onNavigateToNote?: (noteId: string) => void;
  environmentIndex?: number;
}

const PLATES = [classicalElevation, classicalAtrium, classicalColonnade];

export const HyadesOverview: React.FC<HyadesOverviewProps> = ({
  workspaceId,
  onNavigateToDestination,
  onNavigateToObservatory,
  onNavigateToNote,
  environmentIndex = 0,
}) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pinnedNotes, setPinnedNotes] = useState<Note[]>([]);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [clusters, setClusters] = useState<GraphClusterSummary[]>([]);
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const activePlate = PLATES[environmentIndex % PLATES.length];

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);

    Promise.allSettled([
      getWorkspaceDashboard(workspaceId),
      listNotes(workspaceId, { is_pinned: true, page_size: 10 }),
      listNotes(workspaceId, { is_archived: false, sort: 'updated_at_desc', page_size: 20 }),
      listClusters(workspaceId),
      getWorkspaceGraph(workspaceId),
    ]).then(([dashRes, pinnedRes, recentRes, clusterRes, graphRes]) => {
      if (!mounted) return;

      if (dashRes.status === 'fulfilled') setStats(dashRes.value);
      if (pinnedRes.status === 'fulfilled') setPinnedNotes(pinnedRes.value.items || []);
      if (recentRes.status === 'fulfilled') setRecentNotes(recentRes.value.items || []);
      if (clusterRes.status === 'fulfilled') {
        setClusters(
          clusterRes.value.map((c) => ({
            id: c.id,
            label: c.label,
            member_count: c.member_count ?? 0,
          }))
        );
      }
      if (graphRes.status === 'fulfilled') setGraphData(graphRes.value);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [workspaceId]);

  // Real workspace metrics directly from database & graph service
  const totalNotes = stats?.total_notes ?? (recentNotes.length || 0);
  const totalSources = stats?.total_sources ?? 0;
  const totalConcepts = graphData?.stats?.node_count ?? graphData?.nodes?.length ?? 0;
  const totalConnections = graphData?.stats?.edge_count ?? graphData?.edges?.length ?? (stats?.total_relationships ?? 0);
  const unconnectedNotesCount = stats?.isolated_notes_count ?? 0;

  const activeNote = pinnedNotes[0] || recentNotes[0] || null;
  const secondaryNotes = (recentNotes.length > 1 ? recentNotes.slice(1, 3) : pinnedNotes.slice(1, 3));

  // Node lookup map for edge rendering
  const nodeMap = useMemo(() => {
    const map = new Map<string, string>();
    graphData?.nodes?.forEach((n) => {
      map.set(n.id, n.name);
    });
    return map;
  }, [graphData]);

  // Real topic breakdown from clusters or tag distribution
  const topicDistribution = useMemo(() => {
    if (clusters.length > 0) {
      const totalMembers = clusters.reduce((acc, c) => acc + (c.member_count || 1), 0) || 1;
      const colors = [
        'var(--accent-midnight)',
        'var(--accent-terracotta)',
        'var(--accent-brass)',
        'var(--accent-stone)',
        '#2D5A27',
        '#6B21A8',
      ];
      return clusters.slice(0, 4).map((c, i) => {
        const count = c.member_count || 1;
        const pct = Math.round((count / totalMembers) * 100);
        return {
          id: c.id,
          label: c.label,
          count,
          percentage: pct,
          color: colors[i % colors.length],
        };
      });
    }

    if (stats?.tag_distribution && stats.tag_distribution.length > 0) {
      const totalTagged = stats.tag_distribution.reduce((acc, t) => acc + t.note_count, 0) || 1;
      const colors = ['var(--accent-midnight)', 'var(--accent-terracotta)', 'var(--accent-brass)', 'var(--accent-stone)'];
      return stats.tag_distribution.slice(0, 4).map((t, i) => {
        const pct = Math.round((t.note_count / totalTagged) * 100);
        return {
          id: t.tag,
          label: t.tag,
          count: t.note_count,
          percentage: pct,
          color: colors[i % colors.length],
        };
      });
    }

    return [];
  }, [clusters, stats]);

  if (isLoading) {
    return (
      <div className="relative min-h-[calc(100vh-57px)] flex items-center justify-center select-none text-[13px] leading-relaxed">
        <div className="paper-grain" />
        <div className="classical-environment">
          <div className="architectural-plate" style={{ backgroundImage: `url(${activePlate})` }} />
          <div className="ambient-sunlight" />
        </div>
        <div className="instrument-panel p-6 z-10 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[var(--accent-terracotta)] animate-ping" />
          <span className="serif text-base text-[var(--ink-secondary)]">Reading workspace archives...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 h-full overflow-y-auto w-full select-none text-[13px] leading-relaxed pb-28">
      {/* Paper grain */}
      <div className="paper-grain" />

      {/* Classical Architecture Environment Layer */}
      <div className="classical-environment">
        <div
          className="architectural-plate"
          style={{ backgroundImage: `url(${activePlate})` }}
        />
        <div className="ambient-sunlight" />
      </div>

      {/* Main Content */}
      <main className="relative z-10 max-w-[1460px] mx-auto px-6 sm:px-8 pt-8">
        
        {/* 1. OVERALL KNOWLEDGE SUMMARY (Clean, Visual, Direct) */}
        <div className="instrument-panel p-6 sm:p-7 mb-8 overflow-hidden">
          <div className="panel-bracket-tl" />
          <div className="panel-bracket-br" />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            {/* Left: Simple greeting & clear totals */}
            <div className="max-w-xl">
              <div className="flex items-center gap-2 text-[11px] mono uppercase tracking-wider text-[var(--accent-terracotta)] font-semibold mb-1">
                <span className="w-2 h-2 rounded-full bg-[var(--accent-terracotta)]" />
                <span>YOUR WORKSPACE</span>
              </div>

              <h1 className="serif text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--ink-primary)] leading-[1.18]">
                Your Knowledge
              </h1>

              <p className="text-sm text-[var(--ink-secondary)] mt-2 leading-relaxed">
                Welcome back. You have{' '}
                <strong className="text-[var(--ink-primary)] font-semibold">
                  {totalSources.toLocaleString()} sources
                </strong>
                ,{' '}
                <strong className="text-[var(--ink-primary)] font-semibold">
                  {totalNotes.toLocaleString()} notes
                </strong>
                ,{' '}
                <strong className="text-[var(--accent-midnight)] font-semibold">
                  {totalConcepts.toLocaleString()} concepts
                </strong>
                , and{' '}
                <strong className="text-[var(--accent-terracotta)] font-semibold">
                  {totalConnections.toLocaleString()} connections
                </strong>{' '}
                {topicDistribution.length > 0
                  ? `organized across ${topicDistribution.length} active topics.`
                  : 'indexed in your knowledge archive.'}
              </p>

              {/* Direct Status Indicators */}
              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-[var(--ink-secondary)]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  <span>
                    {totalSources > 0 ? `${totalSources} sources indexed` : `${totalNotes} notes in workspace`}
                  </span>
                </div>
                <div className="w-px h-3 bg-[var(--border-parchment)]" />
                <div className="flex items-center gap-1.5">
                  <i className="ph ph-trend-up text-emerald-700 font-bold" />
                  <span>{totalConcepts} concepts extracted</span>
                </div>
                <div className="w-px h-3 bg-[var(--border-parchment)]" />
                <button
                  type="button"
                  onClick={() => onNavigateToDestination('observatory')}
                  className="text-[var(--accent-terracotta)] hover:underline font-medium flex items-center gap-1 focus:outline-none"
                >
                  <span>Explore in Observatory ↗</span>
                </button>
              </div>
            </div>

            {/* Right: Topic Distribution Ring & Breakdown */}
            <div className="flex flex-col sm:flex-row items-center gap-6 lg:border-l lg:border-[var(--border-parchment)] lg:pl-8">
              {/* Topic Ring SVG */}
              <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
                <svg viewBox="0 0 120 120" className="w-full h-full transform -rotate-90">
                  {/* Background Ring */}
                  <circle cx="60" cy="60" r="48" fill="none" stroke="var(--border-parchment)" strokeWidth="11" />
                  {topicDistribution.map((t, idx) => {
                    const circum = 2 * Math.PI * 48; // ~301.6
                    const strokeLen = (t.percentage / 100) * circum;
                    let prevOffset = 0;
                    for (let j = 0; j < idx; j++) {
                      prevOffset += (topicDistribution[j].percentage / 100) * circum;
                    }
                    return (
                      <circle
                        key={t.id}
                        cx="60"
                        cy="60"
                        r="48"
                        fill="none"
                        stroke={t.color}
                        strokeWidth="11"
                        strokeDasharray={`${strokeLen} ${circum - strokeLen}`}
                        strokeDashoffset={`-${prevOffset}`}
                      />
                    );
                  })}
                  {/* Center Core */}
                  <circle cx="60" cy="60" r="34" fill="var(--bg-panel)" stroke="var(--border-strong)" strokeWidth="1" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  <span className="mono text-[10px] text-[var(--ink-tertiary)] uppercase tracking-wider">TOPICS</span>
                  <span className="serif text-base font-semibold text-[var(--ink-primary)] leading-none">
                    {topicDistribution.length || 0} Areas
                  </span>
                </div>
              </div>

              {/* Real Topic Legend */}
              <div className="flex flex-col gap-1.5 text-xs min-w-[210px]">
                {topicDistribution.length > 0 ? (
                  topicDistribution.map((t) => (
                    <div key={t.id} className="flex items-center justify-between py-0.5 border-b border-[var(--border-parchment)] last:border-b-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: t.color }} />
                        <span className="font-medium text-[var(--ink-primary)] truncate max-w-[130px]">{t.label}</span>
                      </div>
                      <span className="mono text-[11px] text-[var(--ink-secondary)]">
                        {t.percentage}% ({t.count})
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-[var(--ink-tertiary)] italic py-2">
                    No topic clusters yet. Add notes to populate topics.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 2-Column Working Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* ================= LEFT REGION (COLUMNS 1–7): CONTINUE WORKING & ACTIVITY ================= */}
          <div className="lg:col-span-7 flex flex-col gap-8">
                     {/* SECTION 1: CONTINUE WORKING (Current Study Desk) */}
            <section>
              <div className="flex items-center justify-between mb-3.5">
                <div className="flex items-center gap-2">
                  <span className="serif-italic text-2xl font-medium text-[var(--ink-primary)]">Continue Working</span>
                  <span className="text-[10px] mono text-[var(--accent-terracotta)] px-1.5 py-0.5 rounded border border-[var(--border-parchment)] bg-white font-semibold">
                    ACTIVE DESK
                  </span>
                </div>
                <span className="text-xs text-[var(--ink-secondary)]">LAST ACCESSED</span>
              </div>

              {/* Main Resumption Card */}
              <div className="instrument-panel p-6">
                <div className="panel-bracket-tl" />
                <div className="panel-bracket-br" />

                {activeNote ? (
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2.5 mb-2">
                        <span className="px-2 py-0.5 rounded bg-[var(--accent-terracotta-soft)] text-[var(--accent-terracotta)] text-[11px] font-semibold uppercase tracking-wider">
                          {activeNote.tags && activeNote.tags.length > 0
                            ? typeof activeNote.tags[0] === 'string'
                              ? activeNote.tags[0]
                              : activeNote.tags[0].name
                            : 'Workspace Note'}
                        </span>
                        <span className="text-[11px] text-[var(--ink-tertiary)] mono">
                          Updated {new Date(activeNote.updated_at).toLocaleDateString()}
                        </span>
                      </div>

                      <h2
                        onClick={() => onNavigateToNote ? onNavigateToNote(activeNote.id) : onNavigateToDestination('library')}
                        className="serif text-2xl sm:text-3xl font-semibold text-[var(--ink-primary)] tracking-tight leading-snug hover:text-[var(--accent-midnight)] transition-colors cursor-pointer"
                      >
                        {activeNote.title || 'Untitled Note'}
                      </h2>

                      <p className="text-[13.5px] leading-relaxed text-[var(--ink-archival)] mt-2">
                        {activeNote.content
                          ? activeNote.content.slice(0, 180).replace(/[#*`_]/g, '') + '...'
                          : 'Research notes and concepts stored in your active workspace.'}
                      </p>

                      {/* Plain Metadata Ribbon */}
                      <div className="mt-4 pt-4 border-t border-[var(--border-parchment)] flex flex-wrap items-center gap-4 text-xs text-[var(--ink-secondary)]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[var(--ink-tertiary)]">Tags:</span>
                          <span className="font-medium text-[var(--ink-primary)]">
                            {activeNote.tags && activeNote.tags.length > 0 ? activeNote.tags.join(', ') : 'None attached'}
                          </span>
                        </div>
                        <div className="w-px h-3 bg-[var(--border-parchment)]" />
                        <div className="flex items-center gap-1.5">
                          <span className="text-[var(--ink-tertiary)]">Workspace:</span>
                          <span className="font-medium text-[var(--accent-midnight)]">Active</span>
                        </div>
                      </div>
                    </div>

                    {/* Direct Actions */}
                    <div className="flex sm:flex-col items-center gap-2 shrink-0 pt-1">
                      <button
                        type="button"
                        onClick={() => onNavigateToNote ? onNavigateToNote(activeNote.id) : onNavigateToDestination('library')}
                        className="w-full bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] transition-all px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 text-xs font-medium shadow-2xs active:scale-95 cursor-pointer"
                      >
                        <i className="ph ph-book-open text-sm" />
                        <span>Continue Reading</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigateToDestination('observatory')}
                        className="w-full bg-white hover:bg-[var(--bg-panel-subtle)] text-[var(--ink-primary)] border border-[var(--border-strong)] transition-all px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-medium shadow-2xs cursor-pointer"
                      >
                        <i className="ph ph-compass text-xs text-[var(--accent-brass)]" />
                        <span>Open in Observatory ↗</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center">
                    <p className="serif text-lg text-[var(--ink-primary)] mb-1">Your study desk is clear.</p>
                    <p className="text-xs text-[var(--ink-secondary)] mb-4">No notes created yet in this workspace.</p>
                    <button
                      type="button"
                      onClick={() => onNavigateToDestination('library')}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-midnight)] text-[#FAF8F2] text-xs font-medium"
                    >
                      <i className="ph ph-plus text-sm" />
                      <span>Create First Note in Library</span>
                    </button>
                  </div>
                )}

                {/* Two Quick Resumption Notes */}
                {secondaryNotes.length > 0 && (
                  <div className="mt-5 pt-5 border-t border-[var(--border-parchment)] grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {secondaryNotes.map((sn) => (
                      <div
                        key={sn.id}
                        onClick={() => onNavigateToNote ? onNavigateToNote(sn.id) : onNavigateToDestination('library')}
                        className="card-surface p-3.5 flex items-start gap-3 cursor-pointer group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex items-center justify-center text-[var(--accent-midnight)] shrink-0 mt-0.5">
                          <i className="ph ph-article text-base group-hover:scale-110 transition-transform" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[12.5px] font-medium text-[var(--ink-primary)] group-hover:text-[var(--accent-midnight)] truncate">
                            {sn.title || 'Untitled Note'}
                          </div>
                          <div className="text-[11px] text-[var(--ink-tertiary)] mt-0.5">
                            {sn.tags && sn.tags.length > 0
                              ? typeof sn.tags[0] === 'string'
                                ? sn.tags[0]
                                : sn.tags[0].name
                              : 'Note'}{' '}
                            · {new Date(sn.updated_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* SECTION 2: RECENT KNOWLEDGE ACTIVITY (Spatial Activity Pulse) */}
            <section>
              <div className="flex items-center justify-between mb-3.5">
                <div className="flex items-center gap-2">
                  <span className="serif-italic text-2xl font-medium text-[var(--ink-primary)]">Knowledge Activity Pulse</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                </div>
                <span className="text-xs text-[var(--ink-secondary)]">ACTIVE SYSTEM</span>
              </div>

              <div className="instrument-panel p-6">
                <div className="panel-bracket-tl" />
                <div className="panel-bracket-br" />

                <div className="flex flex-col md:flex-row items-center gap-6">
                  {/* Orbital Diagram of Real Active Concepts */}
                  <div className="relative w-full md:w-60 h-52 shrink-0 bg-white rounded-xl border border-[var(--border-parchment)] overflow-hidden flex items-center justify-center">
                    <svg viewBox="0 0 240 200" className="w-full h-full">
                      <circle cx="120" cy="100" r="30" fill="none" stroke="rgba(70,60,50,0.10)" strokeDasharray="2,2" />
                      <circle cx="120" cy="100" r="60" fill="none" stroke="rgba(70,60,50,0.12)" />
                      <circle cx="120" cy="100" r="88" fill="none" stroke="rgba(70,60,50,0.08)" strokeDasharray="4,4" />

                      {/* Dynamic Connections */}
                      <path d="M 120 100 Q 140 60 170 55" fill="none" stroke="var(--accent-terracotta)" strokeWidth="1.2" strokeDasharray="3,2" />
                      <path d="M 120 100 Q 90 120 65 140" fill="none" stroke="var(--accent-midnight)" strokeWidth="1.2" />
                      <path d="M 120 100 Q 150 130 180 120" fill="none" stroke="var(--accent-brass)" strokeWidth="1" />

                      {/* Real Concept 1 */}
                      <g
                        className="cursor-pointer group"
                        onClick={() => {
                          const n = graphData?.nodes?.[0];
                          if (n && onNavigateToObservatory) {
                            onNavigateToObservatory({ entityId: n.id, entityName: n.name });
                          } else {
                            onNavigateToDestination('observatory');
                          }
                        }}
                      >
                        <circle cx="120" cy="100" r="14" fill="var(--accent-terracotta-soft)" className="pulse-dot" />
                        <circle cx="120" cy="100" r="6" fill="var(--accent-terracotta)" />
                        <text x="120" y="122" fontFamily="Inter, sans-serif" fontSize="9" fontWeight="600" fill="var(--ink-primary)" textAnchor="middle">
                          {graphData?.nodes?.[0]?.name ? graphData.nodes[0].name.slice(0, 16) : 'Knowledge Base'}
                        </text>
                      </g>

                      {/* Real Concept 2 */}
                      {graphData?.nodes?.[1] && (
                        <g
                          className="cursor-pointer group"
                          onClick={() => {
                            const n = graphData.nodes[1];
                            if (onNavigateToObservatory) {
                              onNavigateToObservatory({ entityId: n.id, entityName: n.name });
                            } else {
                              onNavigateToDestination('observatory');
                            }
                          }}
                        >
                          <circle cx="170" cy="55" r="4.5" fill="var(--accent-midnight)" />
                          <text x="172" y="48" fontFamily="Inter, sans-serif" fontSize="8" fill="var(--ink-secondary)">
                            {graphData.nodes[1].name.slice(0, 12)}
                          </text>
                        </g>
                      )}

                      {/* Real Concept 3 */}
                      {graphData?.nodes?.[2] && (
                        <g
                          className="cursor-pointer group"
                          onClick={() => {
                            const n = graphData.nodes[2];
                            if (onNavigateToObservatory) {
                              onNavigateToObservatory({ entityId: n.id, entityName: n.name });
                            } else {
                              onNavigateToDestination('observatory');
                            }
                          }}
                        >
                          <circle cx="65" cy="140" r="5" fill="var(--accent-midnight)" />
                          <text x="65" y="156" fontFamily="Inter, sans-serif" fontSize="8" fill="var(--ink-secondary)" textAnchor="middle">
                            {graphData.nodes[2].name.slice(0, 12)}
                          </text>
                        </g>
                      )}

                      {/* Real Concept 4 */}
                      {graphData?.nodes?.[3] && (
                        <g
                          className="cursor-pointer group"
                          onClick={() => {
                            const n = graphData.nodes[3];
                            if (onNavigateToObservatory) {
                              onNavigateToObservatory({ entityId: n.id, entityName: n.name });
                            } else {
                              onNavigateToDestination('observatory');
                            }
                          }}
                        >
                          <circle cx="180" cy="120" r="4" fill="var(--accent-brass)" />
                          <text x="184" y="132" fontFamily="Inter, sans-serif" fontSize="8" fill="var(--accent-terracotta)">
                            {graphData.nodes[3].name.slice(0, 12)}
                          </text>
                        </g>
                      )}
                    </svg>

                    <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-[var(--bg-panel-subtle)] text-[10px] text-[var(--ink-tertiary)]">
                      Top Area: {topicDistribution[0]?.label || 'Workspace'}
                    </div>
                  </div>

                  {/* Clear Interpretation & Plain Metrics */}
                  <div className="flex-1 flex flex-col justify-between self-stretch">
                    <div>
                      <div className="text-xs font-semibold text-[var(--ink-primary)] mb-1">
                        {topicDistribution[0]?.label
                          ? `Primary focus cluster is ${topicDistribution[0].label}`
                          : 'Workspace Knowledge Status'}
                      </div>
                      <p className="text-[12.5px] text-[var(--ink-secondary)] leading-relaxed">
                        {totalConcepts > 0
                          ? `Your workspace contains ${totalConcepts} concepts and ${totalConnections} relationships extracted across notes.`
                          : 'Extract concepts in Library to populate knowledge relationships and topological clusters.'}
                      </p>
                    </div>

                    {/* Plain Metrics Embedded in Context */}
                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[var(--border-parchment)] text-xs mt-3">
                      <div>
                        <div className="text-[11px] text-[var(--ink-tertiary)]">Active Concepts</div>
                        <div className="text-base font-semibold text-[var(--ink-primary)] serif">{totalConcepts}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-[var(--ink-tertiary)]">Connections</div>
                        <div className="text-base font-semibold text-[var(--accent-midnight)] serif">{totalConnections}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-[var(--ink-tertiary)]">Knowledge Density</div>
                        <div className="text-base font-semibold text-emerald-700 serif">
                          {totalNotes > 0 ? `${Math.round(((totalNotes - unconnectedNotesCount) / totalNotes) * 100)}% Linked` : '0% Linked'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

          </div>

          {/* ================= RIGHT REGION (COLUMNS 8–12): NEW CONNECTIONS & HEALTH ================= */}
          <div className="lg:col-span-5 flex flex-col gap-8">
            
            {/* SECTION 3: NEW CONNECTIONS (Meaningful Discovered Relationships) */}
            <section>
              <div className="flex items-center justify-between mb-3.5">
                <div className="flex items-center gap-2">
                  <span className="serif-italic text-2xl font-medium text-[var(--ink-primary)]">Discovered Connections</span>
                  <span className="text-[10px] mono text-[var(--accent-brass)] px-1.5 py-0.5 rounded border border-[var(--border-parchment)] bg-white font-semibold">
                    GRAPH
                  </span>
                </div>
                <span className="text-xs text-[var(--ink-secondary)]">From active workspace</span>
              </div>

              <div className="instrument-panel p-5 flex flex-col gap-4">
                <div className="panel-bracket-tl" />
                <div className="panel-bracket-br" />

                {graphData?.edges && graphData.edges.length > 0 ? (
                  graphData.edges.slice(0, 3).map((edge) => {
                    const sourceName = nodeMap.get(edge.source_entity_id) || 'Concept A';
                    const targetName = nodeMap.get(edge.target_entity_id) || 'Concept B';
                    const confidencePct = Math.round(edge.confidence * 100);

                    return (
                      <div key={edge.id} className="p-4 rounded-xl border border-[var(--border-parchment)] bg-white hover:border-[var(--border-strong)] transition-all">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--ink-primary)]">
                            <span className="truncate max-w-[120px]">{sourceName}</span>
                            <span className="text-[var(--accent-terracotta)] font-bold">⟷</span>
                            <span className="truncate max-w-[120px]">{targetName}</span>
                          </div>
                          <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            {confidencePct}% Match
                          </span>
                        </div>
                        <p className="text-[12px] text-[var(--ink-secondary)] leading-relaxed">
                          Relationship type: <strong className="text-[var(--ink-primary)]">{edge.relationship_type.replace(/_/g, ' ')}</strong>
                        </p>
                        <div className="mt-3 pt-2.5 border-t border-[var(--border-parchment)] flex items-center justify-between">
                          <span className="text-[11px] text-[var(--ink-tertiary)] mono">
                            Confidence: {edge.confidence.toFixed(2)}
                          </span>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => onNavigateToDestination('stella')}
                              className="text-xs font-medium text-[var(--accent-midnight)] hover:underline flex items-center gap-1 focus:outline-none cursor-pointer"
                            >
                              <i className="ph ph-sparkle text-[var(--accent-brass)]" />
                              <span>Ask Stella</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onNavigateToDestination('observatory')}
                              className="text-xs font-medium text-[var(--accent-terracotta)] hover:underline flex items-center gap-1 focus:outline-none cursor-pointer"
                            >
                              <span>Inspect in Observatory ↗</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-6 text-center">
                    <p className="text-xs text-[var(--ink-secondary)] mb-3">
                      No concept relationships discovered yet in this workspace.
                    </p>
                    <button
                      type="button"
                      onClick={() => onNavigateToDestination('library')}
                      className="text-xs font-medium text-[var(--accent-terracotta)] hover:underline"
                    >
                      Extract concepts in Library →
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* SECTION 4: KNOWLEDGE HEALTH (Helpful System Status) */}
            <section>
              <div className="flex items-center justify-between mb-3.5">
                <span className="serif-italic text-2xl font-medium text-[var(--ink-primary)]">Knowledge Health</span>
                <span className="text-[10px] mono text-[var(--ink-tertiary)]">STATUS</span>
              </div>

              <div className="instrument-panel p-5">
                <div className="panel-bracket-tl" />
                <div className="panel-bracket-br" />

                <div className="flex flex-col divide-y divide-[var(--border-parchment)]">
                  {/* Health Item 1 */}
                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-[var(--ink-primary)] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-600" />
                        <span>Search Indexing</span>
                      </div>
                      <div className="text-[11px] text-[var(--ink-secondary)]">
                        {totalNotes} notes, {totalSources} sources in workspace
                      </div>
                    </div>
                    <span className="text-xs font-medium text-emerald-700">
                      {totalNotes > 0 || totalSources > 0 ? 'Up to Date' : 'Ready'}
                    </span>
                  </div>

                  {/* Health Item 2 */}
                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-[var(--ink-primary)] flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${unconnectedNotesCount > 0 ? 'bg-[var(--accent-brass)]' : 'bg-emerald-600'}`} />
                        <span>Isolated Notes</span>
                      </div>
                      <div className="text-[11px] text-[var(--ink-secondary)]">
                        {unconnectedNotesCount} notes have no links to other concepts
                      </div>
                    </div>
                    {unconnectedNotesCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => onNavigateToDestination('library')}
                        className="text-xs font-medium text-[var(--accent-terracotta)] hover:underline cursor-pointer"
                      >
                        Review {unconnectedNotesCount} Notes →
                      </button>
                    ) : (
                      <span className="text-xs font-medium text-emerald-700">All Connected</span>
                    )}
                  </div>

                  {/* Health Item 3 */}
                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-[var(--ink-primary)] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-600" />
                        <span>Graph Synchronization</span>
                      </div>
                      <div className="text-[11px] text-[var(--ink-secondary)]">
                        {totalConcepts} concepts, {totalConnections} relationships
                      </div>
                    </div>
                    <span className="text-xs font-medium text-emerald-700">Synchronized</span>
                  </div>

                  {/* Health Item 4 */}
                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-[var(--ink-primary)] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[var(--accent-terracotta)]" />
                        <span>Concept Extraction</span>
                      </div>
                      <div className="text-[11px] text-[var(--ink-secondary)]">
                        {totalConcepts > 0 ? `${totalConcepts} entities active in graph` : 'Available for notes & sources'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigateToDestination('library')}
                      className="text-xs font-medium text-[var(--ink-primary)] hover:underline cursor-pointer"
                    >
                      Extract in Library →
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

      </main>
    </div>
  );
};
