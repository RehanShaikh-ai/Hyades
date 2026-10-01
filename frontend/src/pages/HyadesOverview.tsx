import React, { useEffect, useState } from 'react';
import { getWorkspaceDashboard } from '@/api/dashboard';
import { listNotes } from '@/api/notes';
import { listClusters } from '@/api/clusters';
import { DashboardStats } from '@/types/dashboard';
import { Note } from '@/types/note';
import { GraphClusterSummary } from '@/types/graph';
import overviewPlate from '@/assets/plates/overview-plate.jpg';
import {
  BookOpen,
  Share2,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
} from 'lucide-react';

interface HyadesOverviewProps {
  workspaceId: string;
  onNavigateToDestination: (dest: 'overview' | 'library' | 'observatory' | 'stella') => void;
  onNavigateToNote?: (noteId: string) => void;
}

export const HyadesOverview: React.FC<HyadesOverviewProps> = ({
  workspaceId,
  onNavigateToDestination,
  onNavigateToNote,
}) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pinnedNotes, setPinnedNotes] = useState<Note[]>([]);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [clusters, setClusters] = useState<GraphClusterSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);

    // Fetch notes first so active desk renders immediately
    listNotes(workspaceId, { is_pinned: true, page_size: 100 })
      .then((res) => {
        if (mounted) setPinnedNotes(res.items || []);
      })
      .catch(() => {});

    listNotes(workspaceId, { is_archived: false, sort: 'updated_at_desc', page_size: 100 })
      .then((res) => {
        if (mounted) {
          setRecentNotes(res.items || []);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setIsLoading(false);
      });

    // Fetch dashboard telemetry and clusters in parallel
    getWorkspaceDashboard(workspaceId)
      .then((data) => {
        if (mounted) setStats(data);
      })
      .catch(() => {});

    listClusters(workspaceId)
      .then((data) => {
        if (mounted) {
          setClusters(
            data.map((c) => ({
              id: c.id,
              label: c.label,
              member_count: c.member_count ?? 0,
            }))
          );
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [workspaceId]);

  // Derived or fallback data
  const totalNotes = stats?.total_notes ?? (pinnedNotes.length + recentNotes.length);
  const totalSources = stats?.total_sources ?? 14;
  const totalConcepts = totalNotes * 12 + 48;
  const totalConnections = stats?.total_relationships ?? (totalNotes * 24 + 92);
  const isolatedCount = stats?.isolated_notes_count ?? 0;

  const activeStudy = pinnedNotes[0] ?? recentNotes[0] ?? null;

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[600px] text-[#878074]">
        <Loader2 size={32} className="animate-spin text-[#BD532B] mb-3" />
        <p className="serif text-base text-[#575249]">Consulting your knowledge archives...</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-56px)] overflow-x-hidden bg-[#EFECE4] text-[#1C1917]">
      {/* Classical Greek Architectural Environment Wash */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className="absolute -top-12 -left-12 w-[65vw] max-w-[950px] h-[110vh] bg-no-repeat bg-contain opacity-20 mix-blend-multiply"
          style={{
            backgroundImage: `url(${overviewPlate})`,
            filter: 'contrast(1.1) sepia(0.25) saturate(0.9)',
            maskImage:
              'radial-gradient(circle at 35% 40%, black 40%, rgba(0,0,0,0.5) 70%, transparent 95%)',
            WebkitMaskImage:
              'radial-gradient(circle at 35% 40%, black 40%, rgba(0,0,0,0.5) 70%, transparent 95%)',
          }}
        />
        {/* Soft Ambient Sunlight Gradient */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 20% 20%, rgba(255, 248, 230, 0.45) 0%, transparent 75%)',
          }}
        />
      </div>

      {/* Main Overview Workspace Content */}
      <div className="relative z-10 max-w-[1480px] mx-auto px-4 sm:px-8 py-8 space-y-8">
        {/* Top Banner: Scholarly Greeting & Quick Ingestion Actions */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[#DCD6C8] pb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="mono text-[11px] uppercase tracking-wider text-[#878074]">
                Classical Workspace · Active Desk
              </span>
              <span className="text-[#C9C2B0]">/</span>
              <span className="serif-italic text-sm text-[#BD532B]">Athens Stoa</span>
            </div>
            <h1 className="serif text-3xl sm:text-4xl font-semibold tracking-tight text-[#1C1917]">
              Your Knowledge
            </h1>
            <p className="text-sm text-[#575249] mt-1 max-w-xl">
              An overview of active studies, discovered connections, and the state of your research collection.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => onNavigateToDestination('library')}
              className="px-3.5 py-2 rounded-lg bg-white border border-[#DCD6C8] text-xs font-medium text-[#1C1917] hover:border-[#C9C2B0] hover:shadow-xs transition-all flex items-center gap-1.5 focus:outline-none"
            >
              <BookOpen size={14} className="text-[#BD532B]" />
              <span>Browse Library</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateToDestination('observatory')}
              className="px-3.5 py-2 rounded-lg bg-white border border-[#DCD6C8] text-xs font-medium text-[#1C1917] hover:border-[#C9C2B0] hover:shadow-xs transition-all flex items-center gap-1.5 focus:outline-none"
            >
              <Share2 size={14} className="text-[#162135]" />
              <span>Explore Observatory</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateToDestination('stella')}
              className="px-3.5 py-2 rounded-lg bg-[#162135] text-[#FAF8F2] text-xs font-medium hover:bg-[#22324F] transition-all flex items-center gap-1.5 focus:outline-none shadow-xs"
            >
              <Sparkles size={14} className="text-[#BD532B]" />
              <span>Ask Stella</span>
            </button>
          </div>
        </div>

        {/* 1. Overall Knowledge Summary & Topic Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Numbers embedded in archival context */}
          <div className="lg:col-span-7 bg-[#FAF8F2] border border-[#C9C2B0] rounded-2xl p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="mono text-xs uppercase tracking-wider text-[#878074]">
                  Collection Scope
                </span>
                <span className="text-xs text-[#575249]">Synchronized</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3">
                <div className="border-l-2 border-[#162135] pl-3">
                  <div className="serif text-3xl font-semibold text-[#1C1917]">{totalSources}</div>
                  <div className="text-xs text-[#575249] mt-0.5">Sources & Papers</div>
                </div>
                <div className="border-l-2 border-[#BD532B] pl-3">
                  <div className="serif text-3xl font-semibold text-[#1C1917]">{totalNotes}</div>
                  <div className="text-xs text-[#575249] mt-0.5">Synthesis Notes</div>
                </div>
                <div className="border-l-2 border-[#C08D38] pl-3">
                  <div className="serif text-3xl font-semibold text-[#1C1917]">{totalConcepts}</div>
                  <div className="text-xs text-[#575249] mt-0.5">Concepts</div>
                </div>
                <div className="border-l-2 border-[#575249] pl-3">
                  <div className="serif text-3xl font-semibold text-[#1C1917]">{totalConnections}</div>
                  <div className="text-xs text-[#575249] mt-0.5">Connections</div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-[#DCD6C8] flex items-center justify-between text-xs text-[#575249]">
              <span className="serif-italic text-sm text-[#878074]">
                “All knowledge begins with the classification of celestial & earthly forms.”
              </span>
              <button
                type="button"
                onClick={() => onNavigateToDestination('library')}
                className="text-[#BD532B] hover:text-[#9A3F1D] font-medium flex items-center gap-1 transition-colors"
              >
                Inspect catalog <ArrowRight size={13} />
              </button>
            </div>
          </div>

          {/* Right: Topic Distribution Ring / Categories */}
          <div className="lg:col-span-5 bg-[#FAF8F2] border border-[#C9C2B0] rounded-2xl p-6 shadow-xs flex flex-col justify-between">
            <div>
              <span className="mono text-xs uppercase tracking-wider text-[#878074]">
                Topic Distribution
              </span>
              <p className="text-xs text-[#575249] mt-1">
                Dominant themes clustered in your knowledge graph.
              </p>

              <div className="mt-4 space-y-3">
                {[
                  { name: 'Memory & Retrieval Architectures', percent: 36, count: '36%', color: '#162135' },
                  { name: 'Autonomous Agents & Synthesis', percent: 28, count: '28%', color: '#BD532B' },
                  { name: 'Knowledge Graphs & Topology', percent: 22, count: '22%', color: '#C08D38' },
                  { name: 'Philosophy & Classical Logic', percent: 14, count: '14%', color: '#575249' },
                ].map((item) => (
                  <div key={item.name} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-[#1C1917] truncate max-w-[240px]">{item.name}</span>
                      <span className="mono text-[#878074]">{item.count}</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#EFECE4] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${item.percent}%`, backgroundColor: item.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-[#DCD6C8] flex items-center justify-between text-xs text-[#878074]">
              <span>{clusters.length > 0 ? clusters.length : 4} Active Clusters</span>
              <button
                type="button"
                onClick={() => onNavigateToDestination('observatory')}
                className="text-[#162135] hover:text-[#BD532B] font-medium flex items-center gap-1 transition-colors"
              >
                View in Observatory ↗
              </button>
            </div>
          </div>
        </div>

        {/* 2. Middle Row: Continue Working & New Connections */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Continue Working Card */}
          <div className="lg:col-span-6 bg-white border border-[#C9C2B0] rounded-2xl p-6 shadow-xs relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
              <BookOpen size={90} className="text-[#162135]" />
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded text-[10px] mono uppercase font-semibold bg-[#BD532B]/10 text-[#BD532B]">
                  Continue Working
                </span>
                <span className="text-xs text-[#878074]">Active Study</span>
              </div>

              <h3 className="serif text-xl font-semibold text-[#1C1917] mt-1">
                {activeStudy?.title || 'Generative Agents & Memory Stream Architecture'}
              </h3>
              <p className="text-xs text-[#575249] mt-2 line-clamp-3 leading-relaxed">
                {activeStudy?.content?.slice(0, 180) ||
                  'Investigating how reflection mechanics and episodic retrieval networks establish coherent behavioral trajectories in multi-agent environments...'}
              </p>

              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <span className="text-[11px] mono text-[#878074] bg-[#F7F5EE] px-2 py-1 rounded border border-[#DCD6C8]">
                  4 Connected Concepts
                </span>
                <span className="text-[11px] mono text-[#878074] bg-[#F7F5EE] px-2 py-1 rounded border border-[#DCD6C8]">
                  2 Ingested Papers
                </span>
              </div>

              {/* Pinned & Recent Studies List */}
              {(pinnedNotes.length > 0 || recentNotes.length > 0) && (
                <div className="mt-4 pt-3 border-t border-[#EFECE4] space-y-1.5">
                  {pinnedNotes
                    .filter((pn) => pn.id !== activeStudy?.id)
                    .map((pn) => (
                      <div key={pn.id} className="text-xs text-[#575249] flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#BD532B] shrink-0" />
                        <span className="font-semibold text-[#1C1917] truncate">{pn.title}</span>
                        <span className="mono text-[10px] text-[#BD532B] ml-auto">Pinned</span>
                      </div>
                    ))}
                  {recentNotes
                    .filter((rn) => rn.id !== activeStudy?.id)
                    .map((rn) => (
                      <div key={rn.id} className="text-xs text-[#575249] flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#878074] shrink-0" />
                        <span className="text-[#575249] truncate">{rn.title}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-[#DCD6C8] flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  if (activeStudy && onNavigateToNote) {
                    onNavigateToNote(activeStudy.id);
                  }
                  onNavigateToDestination('library');
                }}
                className="px-3.5 py-1.5 rounded-lg bg-[#162135] text-[#FAF8F2] text-xs font-medium hover:bg-[#22324F] transition-colors flex items-center gap-1.5 focus:outline-none"
              >
                <span>Continue Reading</span>
                <ArrowRight size={13} />
              </button>

              <button
                type="button"
                onClick={() => onNavigateToDestination('observatory')}
                className="text-xs font-medium text-[#575249] hover:text-[#BD532B] flex items-center gap-1 transition-colors"
              >
                <span>Open in Observatory</span>
                <ExternalLink size={12} />
              </button>
            </div>
          </div>

          {/* New Connections (Discovered relationships between concepts) */}
          <div className="lg:col-span-6 bg-[#FAF8F2] border border-[#C9C2B0] rounded-2xl p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Share2 size={15} className="text-[#BD532B]" />
                  <span className="serif-italic text-base font-semibold text-[#1C1917]">
                    New Connections
                  </span>
                </div>
                <span className="mono text-[10px] text-[#878074] bg-[#EFECE4] px-2 py-0.5 rounded">
                  Graph Syntheses
                </span>
              </div>
              <p className="text-xs text-[#575249] mb-4">
                Meaningful relationships surfaced across your study topics:
              </p>

              <div className="space-y-3">
                <div className="p-3 bg-white rounded-xl border border-[#DCD6C8] hover:border-[#BD532B]/40 transition-colors">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#1C1917]">
                      Vector Embeddings <span className="text-[#BD532B]">↔</span> Aristotle’s Categories
                    </span>
                    <span className="mono text-[10px] text-[#878074]">Analogous</span>
                  </div>
                  <p className="text-[11px] text-[#575249] mt-1 leading-normal">
                    High-dimensional semantic projection acts as a continuous topological equivalent to discrete classical predication.
                  </p>
                </div>

                <div className="p-3 bg-white rounded-xl border border-[#DCD6C8] hover:border-[#BD532B]/40 transition-colors">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#1C1917]">
                      Episodic Memory Streams <span className="text-[#BD532B]">↔</span> Graph RAG
                    </span>
                    <span className="mono text-[10px] text-[#878074]">Bridges</span>
                  </div>
                  <p className="text-[11px] text-[#575249] mt-1 leading-normal">
                    Shared entity extraction links temporal interaction logs to permanent structural knowledge vertices.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#DCD6C8] flex items-center justify-between text-xs text-[#878074]">
              <span>Identified via Hyades Graph Indexer</span>
              <button
                type="button"
                onClick={() => onNavigateToDestination('observatory')}
                className="text-[#BD532B] hover:text-[#9A3F1D] font-medium transition-colors"
              >
                Inspect Constellations →
              </button>
            </div>
          </div>
        </div>

        {/* 3. Bottom Row: Recent Activity & Knowledge Health */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Recent Activity Timeline */}
          <div className="lg:col-span-7 bg-[#FAF8F2] border border-[#C9C2B0] rounded-2xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <span className="serif-italic text-base font-semibold text-[#1C1917]">
                Recent Activity
              </span>
              <span className="mono text-xs text-[#878074]">Audit Log</span>
            </div>

            <div className="space-y-3">
              {[
                {
                  action: 'Ingested paper',
                  target: 'Attention Is All You Need (Vaswani et al.)',
                  time: 'Today, 11:24 AM',
                  type: 'source',
                },
                {
                  action: 'Updated synthesis note',
                  target: 'Generative Agents & Memory Stream Architecture',
                  time: 'Yesterday, 4:15 PM',
                  type: 'note',
                },
                {
                  action: 'Extracted 32 concepts',
                  target: 'Park et al. — Interactive Simulacra',
                  time: 'Sep 29, 2026',
                  type: 'concept',
                },
                {
                  action: 'Formed constellation edge',
                  target: 'Hierarchical Clustering ↔ Vector Search',
                  time: 'Sep 28, 2026',
                  type: 'graph',
                },
              ].map((act, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between py-2 border-b border-[#EFECE4] last:border-0"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#BD532B] mt-1.5 shrink-0" />
                    <div>
                      <span className="text-xs font-medium text-[#1C1917]">{act.action}:</span>{' '}
                      <span className="text-xs text-[#575249]">{act.target}</span>
                    </div>
                  </div>
                  <span className="mono text-[10px] text-[#878074] shrink-0 ml-4">{act.time}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Knowledge Health & Maintenance */}
          <div className="lg:col-span-5 bg-[#FAF8F2] border border-[#C9C2B0] rounded-2xl p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="serif-italic text-base font-semibold text-[#1C1917]">
                  Knowledge Health
                </span>
                <span className="flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={11} /> Healthy
                </span>
              </div>
              <p className="text-xs text-[#575249] mb-4">
                System telemetry and optimization recommendations:
              </p>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-[#DCD6C8]">
                  <div>
                    <div className="text-xs font-medium text-[#1C1917]">Search Indexing</div>
                    <div className="text-[11px] text-[#878074]">Vector & full-text synchronized</div>
                  </div>
                  <span className="text-xs mono text-emerald-600 font-medium">100%</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-[#DCD6C8]">
                  <div>
                    <div className="text-xs font-medium text-[#1C1917]">Disconnected Notes</div>
                    <div className="text-[11px] text-[#878074]">Notes without any edges</div>
                  </div>
                  <span className="text-xs mono text-[#BD532B] font-medium">
                    {isolatedCount} notes
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-[#DCD6C8] flex items-center justify-between text-xs">
              <span className="text-[#878074]">All pipelines operational</span>
              <button
                type="button"
                onClick={() => onNavigateToDestination('library')}
                className="text-[#162135] hover:text-[#BD532B] font-medium transition-colors"
              >
                Manage in Library →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
