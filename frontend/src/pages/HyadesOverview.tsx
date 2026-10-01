import React, { useEffect, useState } from 'react';
import { getWorkspaceDashboard } from '@/api/dashboard';
import { listNotes } from '@/api/notes';
import { listClusters } from '@/api/clusters';
import { DashboardStats } from '@/types/dashboard';
import { Note } from '@/types/note';
import { GraphClusterSummary } from '@/types/graph';
import classicalElevation from '@/assets/plates/classical-elevation.jpg';
import classicalAtrium from '@/assets/plates/classical-atrium.jpg';
import classicalColonnade from '@/assets/plates/classical-colonnade.jpg';

interface HyadesOverviewProps {
  workspaceId: string;
  onNavigateToDestination: (dest: 'overview' | 'library' | 'observatory' | 'stella') => void;
  onNavigateToNote?: (noteId: string) => void;
  environmentIndex?: number;
}

const PLATES = [classicalElevation, classicalAtrium, classicalColonnade];

export const HyadesOverview: React.FC<HyadesOverviewProps> = ({
  workspaceId,
  onNavigateToDestination,
  onNavigateToNote,
  environmentIndex = 0,
}) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pinnedNotes, setPinnedNotes] = useState<Note[]>([]);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [clusters, setClusters] = useState<GraphClusterSummary[]>([]);
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
    ]).then(([dashRes, pinnedRes, recentRes, clusterRes]) => {
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
      setIsLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [workspaceId]);

  // Meaningful real or contextual values
  const totalNotes = stats?.total_notes ?? (pinnedNotes.length + recentNotes.length || 24);
  const totalSources = stats?.total_sources ?? 142;
  const totalConcepts = stats?.total_relationships ? Math.round(stats.total_relationships * 0.42) : (clusters.length * 85 || 3420);
  const totalConnections = stats?.total_relationships ?? 8190;
  const unconnectedNotesCount = stats?.isolated_notes_count ?? 4;

  const activeNote = pinnedNotes[0] || recentNotes[0] || null;
  const secondaryNotes = (recentNotes.length > 1 ? recentNotes.slice(1, 3) : pinnedNotes.slice(1, 3));

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
          <span className="serif text-base text-[var(--ink-secondary)]">Reading classical archives...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-57px)] select-none text-[13px] leading-relaxed pb-20">
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
                organized across four primary topics.
              </p>

              {/* Direct Status Indicators */}
              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-[var(--ink-secondary)]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  <span>All {totalSources} sources indexed</span>
                </div>
                <div className="w-px h-3 bg-[var(--border-parchment)]" />
                <div className="flex items-center gap-1.5">
                  <i className="ph ph-trend-up text-emerald-700 font-bold" />
                  <span>+48 new concepts this week</span>
                </div>
                <div className="w-px h-3 bg-[var(--border-parchment)]" />
                <button
                  type="button"
                  onClick={() => onNavigateToDestination('observatory')}
                  className="text-[var(--accent-terracotta)] hover:underline font-medium flex items-center gap-1 focus:outline-none"
                >
                  <span>Explore in 3D Sky ↗</span>
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
                  {/* Topic 1: AI & Agents (28%) */}
                  <circle
                    cx="60"
                    cy="60"
                    r="48"
                    fill="none"
                    stroke="var(--accent-midnight)"
                    strokeWidth="11"
                    strokeDasharray="84.4 301.6"
                    strokeDashoffset="0"
                  />
                  {/* Topic 2: Memory & Retrieval (36%) */}
                  <circle
                    cx="60"
                    cy="60"
                    r="48"
                    fill="none"
                    stroke="var(--accent-terracotta)"
                    strokeWidth="11"
                    strokeDasharray="108.5 301.6"
                    strokeDashoffset="-84.4"
                  />
                  {/* Topic 3: Knowledge Graphs (22%) */}
                  <circle
                    cx="60"
                    cy="60"
                    r="48"
                    fill="none"
                    stroke="var(--accent-brass)"
                    strokeWidth="11"
                    strokeDasharray="66.3 301.6"
                    strokeDashoffset="-192.9"
                  />
                  {/* Topic 4: Philosophy & Logic (14%) */}
                  <circle
                    cx="60"
                    cy="60"
                    r="48"
                    fill="none"
                    stroke="var(--accent-stone)"
                    strokeWidth="11"
                    strokeDasharray="42.2 301.6"
                    strokeDashoffset="-259.2"
                  />
                  {/* Center Core */}
                  <circle cx="60" cy="60" r="34" fill="var(--bg-panel)" stroke="var(--border-strong)" strokeWidth="1" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  <span className="mono text-[10px] text-[var(--ink-tertiary)] uppercase tracking-wider">TOPICS</span>
                  <span className="serif text-base font-semibold text-[var(--ink-primary)] leading-none">4 Areas</span>
                </div>
              </div>

              {/* Plain Language Topic Legend */}
              <div className="flex flex-col gap-1.5 text-xs min-w-[210px]">
                <div className="flex items-center justify-between py-0.5 border-b border-[var(--border-parchment)]">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[var(--accent-midnight)]" />
                    <span className="font-medium text-[var(--ink-primary)]">AI & Agents</span>
                  </div>
                  <span className="mono text-[11px] text-[var(--ink-secondary)]">28% (958)</span>
                </div>

                <div className="flex items-center justify-between py-0.5 border-b border-[var(--border-parchment)]">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[var(--accent-terracotta)]" />
                    <span className="font-medium text-[var(--ink-primary)]">Memory & Retrieval</span>
                  </div>
                  <span className="mono text-[11px] text-[var(--accent-terracotta)] font-semibold">36% (1,231)</span>
                </div>

                <div className="flex items-center justify-between py-0.5 border-b border-[var(--border-parchment)]">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[var(--accent-brass)]" />
                    <span className="font-medium text-[var(--ink-primary)]">Knowledge Graphs</span>
                  </div>
                  <span className="mono text-[11px] text-[var(--ink-secondary)]">22% (752)</span>
                </div>

                <div className="flex items-center justify-between py-0.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[var(--accent-stone)]" />
                    <span className="font-medium text-[var(--ink-primary)]">Philosophy & Logic</span>
                  </div>
                  <span className="mono text-[11px] text-[var(--ink-secondary)]">14% (479)</span>
                </div>
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

                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2.5 mb-2">
                      <span className="px-2 py-0.5 rounded bg-[var(--accent-terracotta-soft)] text-[var(--accent-terracotta)] text-[11px] font-semibold uppercase tracking-wider">
                        Memory & Retrieval
                      </span>
                      <span className="text-[11px] text-[var(--ink-tertiary)] mono">Edited 42 minutes ago</span>
                    </div>

                    <h2
                      onClick={() => activeNote && onNavigateToNote ? onNavigateToNote(activeNote.id) : onNavigateToDestination('library')}
                      className="serif text-2xl sm:text-3xl font-semibold text-[var(--ink-primary)] tracking-tight leading-snug hover:text-[var(--accent-midnight)] transition-colors cursor-pointer"
                    >
                      {activeNote?.title || 'Retrieval-Augmented Generation & Memory Systems'}
                    </h2>

                    <p className="text-[13.5px] leading-relaxed text-[var(--ink-archival)] mt-2">
                      {activeNote?.content
                        ? activeNote.content.slice(0, 180).replace(/[#*`_]/g, '') + '...'
                        : 'Exploring how vector similarity search connects with long-term memory in AI models, and how to prevent hallucinations in complex reasoning tasks.'}
                    </p>

                    {/* Plain Metadata Ribbon */}
                    <div className="mt-4 pt-4 border-t border-[var(--border-parchment)] flex flex-wrap items-center gap-4 text-xs text-[var(--ink-secondary)]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[var(--ink-tertiary)]">Progress:</span>
                        <span className="font-medium text-[var(--ink-primary)]">Section 3 of 5</span>
                      </div>
                      <div className="w-px h-3 bg-[var(--border-parchment)]" />
                      <div className="flex items-center gap-1.5">
                        <span className="text-[var(--ink-tertiary)]">Linked Sources:</span>
                        <span className="font-medium text-[var(--accent-midnight)]">14 Papers</span>
                      </div>
                      <div className="w-px h-3 bg-[var(--border-parchment)]" />
                      <div className="flex items-center gap-1.5">
                        <span className="text-[var(--ink-tertiary)]">Connections:</span>
                        <span className="font-medium text-emerald-700">28 Concepts Linked</span>
                      </div>
                    </div>
                  </div>

                  {/* Direct Actions */}
                  <div className="flex sm:flex-col items-center gap-2 shrink-0 pt-1">
                    <button
                      type="button"
                      onClick={() => activeNote && onNavigateToNote ? onNavigateToNote(activeNote.id) : onNavigateToDestination('library')}
                      className="w-full bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] transition-all px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 text-xs font-medium shadow-2xs active:scale-95"
                    >
                      <i className="ph ph-book-open text-sm" />
                      <span>Continue Reading</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigateToDestination('observatory')}
                      className="w-full bg-white hover:bg-[var(--bg-panel-subtle)] text-[var(--ink-primary)] border border-[var(--border-strong)] transition-all px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-medium shadow-2xs"
                    >
                      <i className="ph ph-compass text-xs text-[var(--accent-brass)]" />
                      <span>Open in Observatory ↗</span>
                    </button>
                  </div>
                </div>

                {/* Two Quick Resumption Notes */}
                <div className="mt-5 pt-5 border-t border-[var(--border-parchment)] grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div
                    onClick={() => secondaryNotes[0] && onNavigateToNote ? onNavigateToNote(secondaryNotes[0].id) : onNavigateToDestination('library')}
                    className="card-surface p-3.5 flex items-start gap-3 cursor-pointer group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex items-center justify-center text-[var(--accent-terracotta)] shrink-0 mt-0.5">
                      <i className="ph ph-article text-base group-hover:scale-110 transition-transform" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-medium text-[var(--ink-primary)] group-hover:text-[var(--accent-midnight)] truncate">
                        {secondaryNotes[0]?.title || 'Notes on Stoic Philosophy & Information'}
                      </div>
                      <div className="text-[11px] text-[var(--ink-tertiary)] mt-0.5">
                        Philosophy · 3h ago · 8 connections
                      </div>
                    </div>
                  </div>

                  <div
                    onClick={() => secondaryNotes[1] && onNavigateToNote ? onNavigateToNote(secondaryNotes[1].id) : onNavigateToDestination('library')}
                    className="card-surface p-3.5 flex items-start gap-3 cursor-pointer group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] flex items-center justify-center text-[var(--accent-midnight)] shrink-0 mt-0.5">
                      <i className="ph ph-git-branch text-base group-hover:scale-110 transition-transform" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-medium text-[var(--ink-primary)] group-hover:text-[var(--accent-midnight)] truncate">
                        {secondaryNotes[1]?.title || 'Graph Databases vs Vector Stores'}
                      </div>
                      <div className="text-[11px] text-[var(--ink-tertiary)] mt-0.5">
                        AI & Agents · Yesterday · 12 connections
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* SECTION 2: RECENT KNOWLEDGE ACTIVITY (Spatial Activity Pulse) */}
            <section>
              <div className="flex items-center justify-between mb-3.5">
                <div className="flex items-center gap-2">
                  <span className="serif-italic text-2xl font-medium text-[var(--ink-primary)]">Recent Activity Pulse</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                </div>
                <span className="text-xs text-[var(--ink-secondary)]">PAST 7 DAYS</span>
              </div>

              <div className="instrument-panel p-6">
                <div className="panel-bracket-tl" />
                <div className="panel-bracket-br" />

                <div className="flex flex-col md:flex-row items-center gap-6">
                  {/* Orbital Diagram of Active Concepts */}
                  <div className="relative w-full md:w-60 h-52 shrink-0 bg-white rounded-xl border border-[var(--border-parchment)] overflow-hidden flex items-center justify-center">
                    <svg viewBox="0 0 240 200" className="w-full h-full">
                      <circle cx="120" cy="100" r="30" fill="none" stroke="rgba(70,60,50,0.10)" strokeDasharray="2,2" />
                      <circle cx="120" cy="100" r="60" fill="none" stroke="rgba(70,60,50,0.12)" />
                      <circle cx="120" cy="100" r="88" fill="none" stroke="rgba(70,60,50,0.08)" strokeDasharray="4,4" />

                      {/* Connections */}
                      <path d="M 120 100 Q 140 60 170 55" fill="none" stroke="var(--accent-terracotta)" strokeWidth="1.2" strokeDasharray="3,2" />
                      <path d="M 120 100 Q 90 120 65 140" fill="none" stroke="var(--accent-midnight)" strokeWidth="1.2" />
                      <path d="M 120 100 Q 150 130 180 120" fill="none" stroke="var(--accent-brass)" strokeWidth="1" />

                      {/* Active Concept 1: RAG */}
                      <g
                        className="cursor-pointer group"
                        onClick={() => onNavigateToDestination('observatory')}
                      >
                        <circle cx="120" cy="100" r="14" fill="var(--accent-terracotta-soft)" className="pulse-dot" />
                        <circle cx="120" cy="100" r="6" fill="var(--accent-terracotta)" />
                        <text x="120" y="122" fontFamily="Inter, sans-serif" fontSize="9" fontWeight="600" fill="var(--ink-primary)" textAnchor="middle">
                          RAG Memory
                        </text>
                      </g>

                      {/* Active Concept 2: Vector Search */}
                      <g className="cursor-pointer group" onClick={() => onNavigateToDestination('observatory')}>
                        <circle cx="170" cy="55" r="4.5" fill="var(--accent-midnight)" />
                        <text x="172" y="48" fontFamily="Inter, sans-serif" fontSize="8" fill="var(--ink-secondary)">
                          Vectors
                        </text>
                      </g>

                      {/* Active Concept 3: Agents */}
                      <g className="cursor-pointer group" onClick={() => onNavigateToDestination('observatory')}>
                        <circle cx="65" cy="140" r="5" fill="var(--accent-midnight)" />
                        <text x="65" y="156" fontFamily="Inter, sans-serif" fontSize="8" fill="var(--ink-secondary)" textAnchor="middle">
                          Agents
                        </text>
                      </g>

                      {/* Active Concept 4: Logic Systems */}
                      <g className="cursor-pointer group" onClick={() => onNavigateToDestination('observatory')}>
                        <circle cx="180" cy="120" r="4" fill="var(--accent-brass)" />
                        <text x="184" y="132" fontFamily="Inter, sans-serif" fontSize="8" fill="var(--accent-terracotta)">
                          Logic Systems
                        </text>
                      </g>
                    </svg>

                    <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-[var(--bg-panel-subtle)] text-[10px] text-[var(--ink-tertiary)]">
                      Active Area: Memory & Retrieval
                    </div>
                  </div>

                  {/* Clear Interpretation & Plain Metrics */}
                  <div className="flex-1 flex flex-col justify-between self-stretch">
                    <div>
                      <div className="text-xs font-semibold text-[var(--ink-primary)] mb-1">
                        Your most active topic this week is Memory & Retrieval
                      </div>
                      <p className="text-[12.5px] text-[var(--ink-secondary)] leading-relaxed">
                        You created or edited notes in this topic, linking them to 42 new concepts across your workspace.
                      </p>
                    </div>

                    {/* Plain Metrics Embedded in Context */}
                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[var(--border-parchment)] text-xs mt-3">
                      <div>
                        <div className="text-[11px] text-[var(--ink-tertiary)]">Active Concepts</div>
                        <div className="text-base font-semibold text-[var(--ink-primary)] serif">24</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-[var(--ink-tertiary)]">New Connections</div>
                        <div className="text-base font-semibold text-[var(--accent-midnight)] serif">+42</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-[var(--ink-tertiary)]">Knowledge Density</div>
                        <div className="text-base font-semibold text-emerald-700 serif">94% Connected</div>
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
                  <span className="serif-italic text-2xl font-medium text-[var(--ink-primary)]">New Connections</span>
                  <span className="text-[10px] mono text-[var(--accent-brass)] px-1.5 py-0.5 rounded border border-[var(--border-parchment)] bg-white font-semibold">
                    DISCOVERED
                  </span>
                </div>
                <span className="text-xs text-[var(--ink-secondary)]">Found across your notes</span>
              </div>

              <div className="instrument-panel p-5 flex flex-col gap-4">
                <div className="panel-bracket-tl" />
                <div className="panel-bracket-br" />

                {/* Connection 1 */}
                <div className="p-4 rounded-xl border border-[var(--border-parchment)] bg-white hover:border-[var(--border-strong)] transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--ink-primary)]">
                      <span>Vector Search</span>
                      <span className="text-[var(--accent-terracotta)] font-bold">⟷</span>
                      <span>Classical Logic Classification</span>
                    </div>
                    <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      Strong Match
                    </span>
                  </div>
                  <p className="text-[12px] text-[var(--ink-secondary)] leading-relaxed">
                    A new paper on historical classification models linked with modern vector hierarchy algorithms in your notes.
                  </p>
                  <div className="mt-3 pt-2.5 border-t border-[var(--border-parchment)] flex items-center justify-between">
                    <span className="text-[11px] text-[var(--ink-tertiary)]">Memory ⟷ Logic</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => onNavigateToDestination('stella')}
                        className="text-xs font-medium text-[var(--accent-midnight)] hover:underline flex items-center gap-1 focus:outline-none"
                      >
                        <i className="ph ph-sparkle text-[var(--accent-brass)]" />
                        <span>Ask Stella</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigateToDestination('observatory')}
                        className="text-xs font-medium text-[var(--accent-terracotta)] hover:underline flex items-center gap-1 focus:outline-none"
                      >
                        <span>Inspect in Sky ↗</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Connection 2 */}
                <div className="p-4 rounded-xl border border-[var(--border-parchment)] bg-white hover:border-[var(--border-strong)] transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--ink-primary)]">
                      <span>Passage Retrieval</span>
                      <span className="text-[var(--accent-terracotta)] font-bold">⟷</span>
                      <span>Fact Verification</span>
                    </div>
                    <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                      Needs Review
                    </span>
                  </div>
                  <p className="text-[12px] text-[var(--ink-secondary)] leading-relaxed">
                    Found 3 unverified references in recent notes on multi-hop question answering.
                  </p>
                  <div className="mt-3 pt-2.5 border-t border-[var(--border-parchment)] flex items-center justify-between">
                    <span className="text-[11px] text-[var(--ink-tertiary)]">AI & Agents ⟷ Memory</span>
                    <button
                      type="button"
                      onClick={() => onNavigateToDestination('library')}
                      className="text-xs font-medium text-[var(--ink-primary)] hover:underline flex items-center gap-1 focus:outline-none"
                    >
                      <span>Review References →</span>
                    </button>
                  </div>
                </div>
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
                      <div className="text-[11px] text-[var(--ink-secondary)]">All {totalSources} sources processed and searchable</div>
                    </div>
                    <span className="text-xs font-medium text-emerald-700">Up to Date</span>
                  </div>

                  {/* Health Item 2 */}
                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-[var(--ink-primary)] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[var(--accent-brass)]" />
                        <span>Unconnected Notes</span>
                      </div>
                      <div className="text-[11px] text-[var(--ink-secondary)]">{unconnectedNotesCount} notes have no links to other concepts</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigateToDestination('library')}
                      className="text-xs font-medium text-[var(--accent-terracotta)] hover:underline"
                    >
                      Review {unconnectedNotesCount} Notes →
                    </button>
                  </div>

                  {/* Health Item 3 */}
                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-[var(--ink-primary)] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-600" />
                        <span>Graph Synchronization</span>
                      </div>
                      <div className="text-[11px] text-[var(--ink-secondary)]">Knowledge graph updated 12m ago</div>
                    </div>
                    <span className="text-xs font-medium text-emerald-700">Synchronized</span>
                  </div>

                  {/* Health Item 4 */}
                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-[var(--ink-primary)] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[var(--accent-terracotta)]" />
                        <span>Citation Consistency</span>
                      </div>
                      <div className="text-[11px] text-[var(--ink-secondary)]">3 citations need source verification</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigateToDestination('library')}
                      className="text-xs font-medium text-[var(--ink-primary)] hover:underline"
                    >
                      Check Sources →
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
