/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import celestialAtlasPlate from '@/assets/plates/celestial-atlas.jpg';
import { getWorkspaceGraph } from '@/api/graph';
import { listClusters } from '@/api/clusters';
import { EntityEditor } from '@/components/EntityEditor';
import { RelationshipEditor } from '@/components/RelationshipEditor';
import { LinkSuggestionPanel } from '@/components/LinkSuggestionPanel';
import { GraphResponse, GraphNodeResponse, ObservatoryTarget } from '@/types/graph';
import { StellaContext } from '@/types/navigation';
import { ClusterResponse } from '@/types/cluster';

interface HyadesObservatoryProps {
  workspaceId: string;
  initialTarget?: ObservatoryTarget | null;
  onNavigateToDestination?: (dest: 'overview' | 'library' | 'observatory' | 'stella') => void;
  onNavigateToStella?: (context: StellaContext) => void;
  onNavigateToNote?: (noteId: string) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onOpenSearch?: () => void;
}

export interface CelestialNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  catalog: string;
  clusterKey: string;
  clusterName?: string;
  clusterId?: string;
  group: number;
  type: 'hub' | 'concept' | 'entity';
  hierarchy: 'core' | 'subtopic' | 'related';
  size: number;
  coords: string;
  desc: string;
  degree: number;
  noteCount: number;
  connections: Array<{ id: string; name: string; type: string; corr: string }>;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export type EdgeTier = 'level1' | 'level2_to_3' | 'secondary' | 'cross_cluster';

export interface CelestialLink extends d3.SimulationLinkDatum<CelestialNode> {
  source: string | CelestialNode;
  target: string | CelestialNode;
  weight: number;
  type: string;
  types?: string[];
  tier?: EdgeTier;
}

export const POSITION_CACHE_VERSION = 'v6_celestial';

function getStoredPositions(wsId: string): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  if (!wsId) return map;
  try {
    // Purge old tangled cache from previous buggy simulation runs
    localStorage.removeItem(`hyades_graph_positions_${wsId}`);
    localStorage.removeItem(`hyades_graph_positions_v5_celestial_${wsId}`);

    const raw = localStorage.getItem(`hyades_graph_positions_${POSITION_CACHE_VERSION}_${wsId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const [id, pos] of Object.entries(parsed)) {
        if (pos && typeof (pos as any).x === 'number' && typeof (pos as any).y === 'number') {
          map.set(id, { x: (pos as any).x, y: (pos as any).y });
        }
      }
    }
  } catch {
    // Graceful fallback
  }
  return map;
}

function saveStoredPositions(wsId: string, map: Map<string, { x: number; y: number }>) {
  if (!wsId || map.size === 0) return;
  try {
    const obj: Record<string, { x: number; y: number }> = {};
    map.forEach((pos, id) => {
      obj[id] = { x: Math.round(pos.x * 10) / 10, y: Math.round(pos.y * 10) / 10 };
    });
    const serialized = JSON.stringify(obj);
    localStorage.setItem(`hyades_graph_positions_${POSITION_CACHE_VERSION}_${wsId}`, serialized);
    localStorage.setItem(`hyades_graph_positions_${wsId}`, serialized);
  } catch {
    // Quota or private mode fallback
  }
}

function computeCelestialCoords(id: string): { coords: string; catalog: string } {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const absHash = Math.abs(hash);
  const raHours = String(4 + (absHash % 2)).padStart(2, '0');
  const raMinutes = String(10 + (absHash % 45)).padStart(2, '0');
  const raSeconds = String(absHash % 60).padStart(2, '0');
  const decDeg = String(10 + (absHash % 16)).padStart(2, '0');
  const decMin = String(absHash % 60).padStart(2, '0');
  const catalog = `HYA-${id.replace(/-/g, '').slice(0, 4).toUpperCase()}`;
  return {
    coords: `RA ${raHours}ʰ ${raMinutes}ᵐ ${raSeconds}ˢ · DEC +${decDeg}° ${decMin}′`,
    catalog,
  };
}

export function computeClusterAnchors(
  clusterKeys: string[],
  centerX: number,
  centerY: number,
  clusterSizes?: Map<string, number>
): Map<string, { x: number; y: number }> {
  const anchors = new Map<string, { x: number; y: number }>();
  const n = clusterKeys.length;
  if (n === 0) return anchors;
  if (n === 1) {
    anchors.set(clusterKeys[0], { x: centerX, y: centerY });
    return anchors;
  }

  const hashStr = (str: string) => {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  };

  // Sort clusters descending by size so prominent constellations get prime placement
  const sortedKeys = [...clusterKeys].sort((a, b) => {
    const sA = clusterSizes?.get(a) || 1;
    const sB = clusterSizes?.get(b) || 1;
    return sB - sA;
  });

  const goldenAngle = 2.3999632; // ~137.5 degrees, celestial golden spiral distribution
  const positions: Array<{ key: string; x: number; y: number; radius: number }> = [];

  sortedKeys.forEach((key, i) => {
    const seed = hashStr(key);
    const size = clusterSizes?.get(key) || 6;
    // Bounding radius for this constellation based on number of stars
    const cBoundRadius = 160 + Math.sqrt(size) * 36;

    // Multi-tier celestial radial distribution: ensures constellations have generous spacing
    let rBase: number;
    if (n <= 3) {
      rBase = 480;
    } else if (n <= 7) {
      rBase = i < 3 ? 480 : 760;
    } else {
      const tier = i % 3;
      rBase = tier === 0 ? 480 : tier === 1 ? 800 : 1140;
    }

    const rVar = ((seed % 80) - 40) * 1.0;
    const radius = Math.max(420, rBase + rVar);

    const angleJitter = (((seed % 41) - 20) / 180) * Math.PI * 0.25;
    const angle = i * goldenAngle + angleJitter - Math.PI / 2;

    const ax = centerX + Math.cos(angle) * radius;
    const ay = centerY + Math.sin(angle) * (radius * 0.90);

    positions.push({ key, x: ax, y: ay, radius: cBoundRadius });
  });

  // Generous relaxation pass: guarantees clusters maintain ample clearance proportional to their sizes
  for (let it = 0; it < 45; it++) {
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const p1 = positions[i];
        const p2 = positions[j];
        let dx = p2.x - p1.x;
        let dy = p2.y - p1.y;
        let d = Math.hypot(dx, dy);
        const neededDist = p1.radius + p2.radius + 120;
        if (d < neededDist) {
          if (d === 0) {
            dx = 1;
            dy = 0;
            d = 1;
          }
          const push = ((neededDist - d) / d) * 0.45;
          p1.x -= dx * push;
          p1.y -= dy * push;
          p2.x += dx * push;
          p2.y += dy * push;
        }
      }
    }
    // Repulsion from center to prevent any cluster from collapsing inside minimum celestial radius (>= 400px)
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const cdx = p.x - centerX;
      const cdy = p.y - centerY;
      const cd = Math.hypot(cdx, cdy);
      if (cd < 400 && cd > 0) {
        const scale = 400 / cd;
        p.x = centerX + cdx * scale;
        p.y = centerY + cdy * scale;
      }
    }
  }

  positions.forEach((p) => {
    anchors.set(p.key, {
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
    });
  });

  return anchors;
}

export function computeObservatoryLayout(
  nodes: CelestialNode[],
  links: CelestialLink[],
  centerX: number,
  centerY: number
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return result;

  // 1. Group nodes by clusterKey
  const clusterGroups = new Map<string, CelestialNode[]>();
  nodes.forEach((n) => {
    const key = n.clusterKey || `grp_${n.group || 1}`;
    const list = clusterGroups.get(key) || [];
    list.push(n);
    clusterGroups.set(key, list);
  });

  const sortedClusters = Array.from(clusterGroups.entries()).sort(
    (a, b) => b[1].length - a[1].length
  );
  const clusterKeys = sortedClusters.map(([k]) => k);
  const clusterSizes = new Map<string, number>();
  sortedClusters.forEach(([k, cNodes]) => clusterSizes.set(k, cNodes.length));

  const clusterAnchors = computeClusterAnchors(clusterKeys, centerX, centerY, clusterSizes);

  // Build adjacency
  const adj = new Map<string, Set<string>>();
  nodes.forEach((n) => adj.set(n.id, new Set()));
  links.forEach((l) => {
    const sId = typeof l.source === 'string' ? l.source : (l.source as any).id;
    const tId = typeof l.target === 'string' ? l.target : (l.target as any).id;
    if (sId && tId && sId !== tId) {
      adj.get(sId)?.add(tId);
      adj.get(tId)?.add(sId);
    }
  });

  const hashStr = (str: string) => {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  };

  // 2. Lay out each cluster as an organic constellation inspired by celestial atlas geometry (§6)
  sortedClusters.forEach(([cKey, cNodes]) => {
    const anchor = clusterAnchors.get(cKey) || { x: centerX, y: centerY };
    const cSeed = hashStr(cKey);

    const sorted = [...cNodes].sort(
      (a, b) =>
        (b.degree || 0) * 10 +
        (b.noteCount || 0) -
        ((a.degree || 0) * 10 + (a.noteCount || 0))
    );

    if (sorted.length === 1) {
      result.set(sorted[0].id, { x: anchor.x, y: anchor.y });
      return;
    }

    const cores = sorted.filter((n) => n.hierarchy === 'core');
    const subtopics = sorted.filter((n) => n.hierarchy === 'subtopic');

    // If no core stars, promote highest degree node to anchor the constellation
    const effectiveCores = cores.length > 0 ? cores : [sorted[0]];
    const effectiveSubtopics =
      subtopics.length > 0
        ? subtopics
        : sorted.slice(
            effectiveCores.length,
            Math.min(
              sorted.length,
              effectiveCores.length + Math.max(2, Math.min(10, Math.ceil(sorted.length * 0.22)))
            )
          );
    const effectiveRelated = sorted.filter(
      (n) => !effectiveCores.some((c) => c.id === n.id) && !effectiveSubtopics.some((s) => s.id === n.id)
    );

    const baseAngle = ((cSeed % 360) * Math.PI) / 180;
    const aspectY = 0.88 + ((cSeed % 22) / 100);

    // A. Central Core Star(s)
    const parentPositions = new Map<string, { x: number; y: number }>();
    result.set(effectiveCores[0].id, { x: anchor.x, y: anchor.y });
    parentPositions.set(effectiveCores[0].id, { x: anchor.x, y: anchor.y });

    for (let i = 1; i < effectiveCores.length; i++) {
      const offset = (i % 2 === 1 ? 1 : -1) * (120 + i * 40);
      const secAngle = baseAngle + (i * 0.55);
      const cx = anchor.x + Math.cos(secAngle) * offset;
      const cy = anchor.y + Math.sin(secAngle) * (offset * aspectY);
      result.set(effectiveCores[i].id, { x: cx, y: cy });
      parentPositions.set(effectiveCores[i].id, { x: cx, y: cy });
    }

    // B. Subtopics (Major Hubs): arranged along loose orbital branches with generous spacing
    const nSubs = effectiveSubtopics.length;
    const arcSpan = Math.PI * (1.30 + ((cSeed % 35) / 100)); // 1.3pi to 1.65pi open arc

    effectiveSubtopics.forEach((sub, i) => {
      const subSeed = hashStr(sub.id);
      const normT = nSubs > 1 ? i / (nSubs - 1) : 0.5;
      const angleJitter = (((subSeed % 31) - 15) / 180) * Math.PI;
      const ang = baseAngle + normT * arcSpan + angleJitter;

      // Generous orbital reach (180px to 340px)
      const reachBase = 180 + Math.min(140, nSubs * 16);
      const reachVar = ((subSeed % 55) - 25) * 1.2;
      const reach = Math.max(160, reachBase + reachVar);

      const sx = anchor.x + Math.cos(ang) * reach;
      const sy = anchor.y + Math.sin(ang) * (reach * aspectY);

      result.set(sub.id, { x: sx, y: sy });
      parentPositions.set(sub.id, { x: sx, y: sy });
    });

    // C. Related Stars (Satellites): group by parent hub and distribute in outward petal fans
    const hubSatellites = new Map<string, CelestialNode[]>();
    effectiveSubtopics.forEach((s) => hubSatellites.set(s.id, []));
    hubSatellites.set(effectiveCores[0].id, []);

    effectiveRelated.forEach((rel) => {
      const nbrs = adj.get(rel.id);
      let assignedHubId: string | null = null;
      if (nbrs && nbrs.size > 0) {
        for (const sub of effectiveSubtopics) {
          if (nbrs.has(sub.id)) {
            assignedHubId = sub.id;
            break;
          }
        }
      }
      if (!assignedHubId) {
        if (effectiveSubtopics.length > 0) {
          let minCount = Infinity;
          for (const sub of effectiveSubtopics) {
            const count = hubSatellites.get(sub.id)?.length || 0;
            if (count < minCount) {
              minCount = count;
              assignedHubId = sub.id;
            }
          }
        } else {
          assignedHubId = effectiveCores[0].id;
        }
      }
      const list = hubSatellites.get(assignedHubId!) || [];
      list.push(rel);
      hubSatellites.set(assignedHubId!, list);
    });

    // Place satellites fanning outward into clear celestial space around each hub
    effectiveSubtopics.forEach((sub) => {
      const satellites = hubSatellites.get(sub.id) || [];
      if (satellites.length === 0) return;

      const subPos = parentPositions.get(sub.id)!;
      const outDx = subPos.x - anchor.x;
      const outDy = subPos.y - anchor.y;
      const baseOutAngle = Math.atan2(outDy, outDx);
      const m = satellites.length;

      const fanSpan = Math.min(Math.PI * 0.85, 0.45 * Math.max(1, m - 1));

      satellites.forEach((sat, j) => {
        const normJ = m > 1 ? (j / (m - 1)) - 0.5 : 0;
        let satAngle = baseOutAngle + normJ * fanSpan;
        let satRadius: number;

        if (m <= 4) {
          satRadius = 85 + (j % 2) * 20;
        } else {
          const shell = j % 2 === 0 ? 1 : 2;
          satRadius = shell === 1 ? 85 : 135;
          if (shell === 2) satAngle += 0.22;
        }

        const rx = subPos.x + Math.cos(satAngle) * satRadius;
        const ry = subPos.y + Math.sin(satAngle) * (satRadius * 0.92);
        result.set(sat.id, { x: rx, y: ry });
      });
    });

    // Place satellites assigned directly to the Core in open orbital sectors
    const coreSatellites = hubSatellites.get(effectiveCores[0].id) || [];
    const coreM = coreSatellites.length;
    coreSatellites.forEach((sat, j) => {
      const satSeed = hashStr(sat.id);
      const normJ = coreM > 1 ? j / coreM : 0;
      const satAngle = baseAngle + arcSpan + 0.4 + normJ * (Math.PI * 2 - arcSpan - 0.8);
      const satDist = 110 + ((satSeed % 35) * 1.2);

      const rx = anchor.x + Math.cos(satAngle) * satDist;
      const ry = anchor.y + Math.sin(satAngle) * (satDist * aspectY);
      result.set(sat.id, { x: rx, y: ry });
    });
  });

  // 3. Fast relaxation across ALL nodes ensuring guaranteed minimum clearance (>= 70px) and label clearance
  const minClearance = 70;
  const nodeArray = nodes.map((n) => ({
    id: n.id,
    clusterKey: n.clusterKey || `grp_${n.group || 1}`,
    pos: result.get(n.id) || { x: centerX, y: centerY },
  }));

  for (let it = 0; it < 35; it++) {
    for (let i = 0; i < nodeArray.length; i++) {
      const p1 = nodeArray[i].pos;
      for (let j = i + 1; j < nodeArray.length; j++) {
        const p2 = nodeArray[j].pos;
        let dx = p2.x - p1.x;
        let dy = p2.y - p1.y;
        let d = Math.hypot(dx, dy);
        if (d < minClearance) {
          if (d === 0) {
            dx = 1;
            dy = 0;
            d = 1;
          }
          const push = ((minClearance - d) / d) * 0.40;
          p1.x -= dx * push;
          p1.y -= dy * push;
          p2.x += dx * push;
          p2.y += dy * push;
        }

        // Horizontal label collision relief
        if (Math.abs(dy) < 22 && Math.abs(dx) < 80) {
          const pushY = (22 - Math.abs(dy)) * 0.25 * (dy >= 0 ? -1 : 1);
          const pushX = (80 - Math.abs(dx)) * 0.12 * (dx >= 0 ? -1 : 1);
          p1.y += pushY;
          p2.y -= pushY;
          p1.x += pushX;
          p2.x -= pushX;
        }
      }
    }
  }

  nodeArray.forEach((n) => {
    result.set(n.id, {
      x: Math.round(n.pos.x * 10) / 10,
      y: Math.round(n.pos.y * 10) / 10,
    });
  });

  return result;
}

/**
 * Untangle is a LOCAL CLEANUP operation (§5).
 * Strictly preserves the overall constellation arrangement, cluster locations, and orientations.
 * Identifies local overlaps (distance < 68px) and label collisions (|dy| < 24px, |dx| < 75px),
 * and moves ONLY problematic nodes with tiny, damped radial pushes (clamped to max 35px).
 * Does NOT rotate clusters. Does NOT redistribute nodes. Does NOT create radial patterns.
 * Non-colliding nodes move 0 pixels.
 */
export function performLocalUntangle(
  nodes: CelestialNode[],
  _links: CelestialLink[],
  currentPositions: Map<string, { x: number; y: number }>,
  centerX: number,
  centerY: number
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  const originalPos = new Map<string, { x: number; y: number }>();

  // Copy current positions as the baseline (never discard user positions)
  nodes.forEach((n) => {
    const p = currentPositions.get(n.id) || {
      x: n.x ?? centerX,
      y: n.y ?? centerY,
    };
    result.set(n.id, { x: p.x, y: p.y });
    originalPos.set(n.id, { x: p.x, y: p.y });
  });

  const nodeArray = nodes.map((n) => ({
    id: n.id,
    clusterKey: n.clusterKey || `grp_${n.group || 1}`,
    pos: result.get(n.id)!,
    orig: originalPos.get(n.id)!,
  }));

  const minClearance = 68; // Minimum comfortable distance between stars
  const maxDisplacement = 35; // Gentle displacement: strictly preserves constellation landmarks while relieving collisions

  // 15 gentle local relaxation steps
  for (let it = 0; it < 15; it++) {
    // 1. Star-star overlap relief (pure radial push away from colliding partner)
    for (let i = 0; i < nodeArray.length; i++) {
      const p1 = nodeArray[i].pos;
      for (let j = i + 1; j < nodeArray.length; j++) {
        const p2 = nodeArray[j].pos;
        let dx = p2.x - p1.x;
        let dy = p2.y - p1.y;
        let d = Math.hypot(dx, dy);

        if (d < minClearance) {
          if (d === 0) {
            dx = 1;
            dy = 0;
            d = 1;
          }
          const push = ((minClearance - d) / d) * 0.35;
          p1.x -= dx * push;
          p1.y -= dy * push;
          p2.x += dx * push;
          p2.y += dy * push;
        }

        // 2. Label collision relief (labels extend horizontally below nodes)
        if (Math.abs(dy) < 24 && Math.abs(dx) < 75) {
          const pushY = (24 - Math.abs(dy)) * 0.25 * (dy >= 0 ? -1 : 1);
          p1.y += pushY;
          p2.y -= pushY;
        }
      }
    }

    // 2. Clamping: strictly enforce maxDisplacement (35px) from original position
    // Guarantees the constellation arrangement and landmarks remain completely recognizable!
    for (let i = 0; i < nodeArray.length; i++) {
      const p = nodeArray[i].pos;
      const o = nodeArray[i].orig;
      const distFromOrig = Math.hypot(p.x - o.x, p.y - o.y);
      if (distFromOrig > maxDisplacement) {
        const scale = maxDisplacement / distFromOrig;
        p.x = o.x + (p.x - o.x) * scale;
        p.y = o.y + (p.y - o.y) * scale;
      }
    }
  }

  nodeArray.forEach((n) => {
    result.set(n.id, {
      x: Math.round(n.pos.x * 10) / 10,
      y: Math.round(n.pos.y * 10) / 10,
    });
  });

  return result;
}

/**
 * Generates an organic, subtle Bézier curve for constellation links (§3).
 * Invariant to edge direction (A->B and B->A produce identical spatial curves).
 * Curvature is varied deterministically per relationship pair to distinguish
 * nearby edges without forming uniform semicircles or eye-loop bubbles.
 */
export function computeConstellationPath(
  d: any,
  positions: Map<string, { x: number; y: number }>,
  posOverride?: Map<string, { x: number; y: number }>
): string {
  const sId = typeof d.source === 'object' ? d.source.id : d.source;
  const tId = typeof d.target === 'object' ? d.target.id : d.target;
  const sPos =
    posOverride?.get(sId) ??
    (typeof d.source === 'object' && d.source.x !== undefined ? d.source : positions.get(sId));
  const tPos =
    posOverride?.get(tId) ??
    (typeof d.target === 'object' && d.target.x !== undefined ? d.target : positions.get(tId));
  const x1 = sPos?.x ?? 0;
  const y1 = sPos?.y ?? 0;
  const x2 = tPos?.x ?? 0;
  const y2 = tPos?.y ?? 0;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);

  if (dist < 4) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  // Normal vector perpendicular to the line chord
  const ux = dx / dist;
  const uy = dy / dist;
  const nx = -uy;
  const ny = ux;

  // Canonical node ordering ensures curve is invariant to edge direction
  const isCanonical = sId <= tId;
  const pairKey = isCanonical ? `${sId}:${tId}` : `${tId}:${sId}`;
  let hash = 0;
  for (let i = 0; i < pairKey.length; i++) {
    hash = ((hash << 5) - hash + pairKey.charCodeAt(i)) | 0;
  }
  const seed = Math.abs(hash);

  // Subtle, organic camber (6px to 26px max, avoiding uniform or exaggerated semicircles)
  const baseCamber = Math.min(26, Math.max(6, dist * 0.085));
  // Natural variation in curvature between different constellations (0.75x to 1.25x)
  const variation = 0.75 + ((seed % 51) / 100);
  // Alternating deterministic bow direction
  const dir = seed % 2 === 0 ? 1 : -1;
  const normalSign = isCanonical ? dir : -dir;
  const bend = baseCamber * variation * normalSign;

  // Organic Bézier with subtle variation in control point positions
  const t1 = 0.30 + (((seed >> 2) % 9) / 100); // 0.30 to 0.38
  const t2 = 0.64 + (((seed >> 5) % 9) / 100); // 0.64 to 0.72

  const cx1 = x1 + dx * t1 + nx * bend * 0.9;
  const cy1 = y1 + dy * t1 + ny * bend * 0.9;
  const cx2 = x1 + dx * t2 + nx * bend * 0.9;
  const cy2 = y1 + dy * t2 + ny * bend * 0.9;

  return `M ${x1} ${y1} C ${cx1} ${cy1} ${cx2} ${cy2} ${x2} ${y2}`;
}

/**
 * Classifies a relationship edge into the 4-tier visual hierarchy (§1, §2, §3, §7):
 * - 'level1': Level 1 (Core) -> any local node (restrained terracotta/red, most prominent)
 * - 'level2_to_3': Level 2 (Subtopic) -> Level 3 (Related) (restrained gold/ochre, visible but quieter)
 * - 'secondary': Same-level or lateral local relationships (light neutral deep-ink)
 * - 'cross_cluster': Distant inter-cluster connections (faint dotted lines)
 */
export function getEdgeTier(
  sNode?: CelestialNode,
  tNode?: CelestialNode
): EdgeTier {
  if (!sNode || !tNode) return 'secondary';
  const isSameCluster = sNode.clusterKey === tNode.clusterKey;
  if (!isSameCluster) return 'cross_cluster';

  // Same cluster:
  // Level 1 (Core) -> any node:
  if (sNode.hierarchy === 'core' || tNode.hierarchy === 'core') {
    return 'level1';
  }
  // Level 2 (Subtopic) -> Level 3 (Related):
  if (
    (sNode.hierarchy === 'subtopic' && tNode.hierarchy === 'related') ||
    (tNode.hierarchy === 'subtopic' && sNode.hierarchy === 'related')
  ) {
    return 'level2_to_3';
  }
  // Secondary / lateral relationships:
  return 'secondary';
}

export function getLinkStroke(tier: EdgeTier): string {
  switch (tier) {
    case 'level1':
      return '#B84E2A'; // Restrained celestial terracotta/red for Level 1 -> any node
    case 'level2_to_3':
      return '#C49234'; // Restrained gold/ochre for Level 2 -> Level 3
    case 'secondary':
      return '#6E5F5A'; // Very light neutral / deep ink for secondary lateral
    case 'cross_cluster':
      return '#8E7E7A'; // Lighter neutral tone for cross-cluster
  }
}

export function getLinkOpacity(tier: EdgeTier): number {
  switch (tier) {
    case 'level1':
      return 0.58; // Most visible
    case 'level2_to_3':
      return 0.44; // Clearly visible but quieter
    case 'secondary':
      return 0.22; // Lighter secondary
    case 'cross_cluster':
      return 0.25; // Faint, visible dotted line
  }
}

export function getLinkWidth(tier: EdgeTier, weight?: number): number {
  switch (tier) {
    case 'level1':
      return 1.45 + (weight || 0.8) * 0.35;
    case 'level2_to_3':
      return 1.15;
    case 'secondary':
      return 0.85;
    case 'cross_cluster':
      return 0.85;
  }
}

export function getLinkDashArray(tier: EdgeTier): string {
  return tier === 'cross_cluster' ? '4,4' : 'none';
}

export function getSubduedLinkOpacity(tier: EdgeTier): number {
  switch (tier) {
    case 'level1':
      return 0.18;
    case 'level2_to_3':
      return 0.12;
    case 'secondary':
      return 0.06;
    case 'cross_cluster':
      return 0.07;
  }
}

/**
 * Progressive semantic label disclosure (§5):
 * Wide view: Level 1 labels + top important Level 2 labels
 * Medium view: Level 1 + Level 2 labels + important Level 3 labels
 * Close view: Remaining relevant labels
 * Hover / Selection / Connected: Always visible
 */
export function shouldShowNodeLabel(
  d: CelestialNode,
  k: number,
  isPriority: boolean
): boolean {
  if (isPriority) return true;
  // Wide view (k < 0.72):
  // Level 1 labels + a limited number of important Level 2 labels (degree >= 3 or noteCount >= 2)
  if (k < 0.72) {
    if (d.hierarchy === 'core') return true;
    if (d.hierarchy === 'subtopic' && ((d.degree || 0) >= 3 || (d.noteCount || 0) >= 2)) {
      return true;
    }
    return false;
  }
  // Medium view (0.72 <= k < 1.25):
  // Level 1 + Level 2 labels + important Level 3 labels (degree >= 2 or noteCount >= 1)
  if (k < 1.25) {
    if (d.hierarchy === 'core' || d.hierarchy === 'subtopic') return true;
    if ((d.degree || 0) >= 2 || (d.noteCount || 0) >= 1) return true;
    return false;
  }
  // Close view (k >= 1.25):
  // Remaining relevant labels
  return true;
}


export const HyadesObservatory: React.FC<HyadesObservatoryProps> = ({
  workspaceId,
  initialTarget,
  onNavigateToDestination,
  onNavigateToStella,
  onNavigateToNote,
  isFullscreen = false,
  onToggleFullscreen,
  onOpenSearch,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<d3.Selection<SVGSVGElement, unknown, null, undefined> | null>(null);
  const graticuleRef = useRef<SVGSVGElement>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // Persistent node position cache to prevent layout resets and explosions
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Reactive container dimensions for pure rendering and accurate minimap calculations
  const [containerDimensions, setContainerDimensions] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1600,
    height: typeof window !== 'undefined' ? window.innerHeight : 1000,
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth || window.innerWidth;
        const h = containerRef.current.clientHeight || window.innerHeight;
        setContainerDimensions({ width: w, height: h });
      }
    };
    updateSize();
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Constellation Link Curved Path Generator (§3)
  const linkConstellationPath = (
    d: any,
    posOverride?: Map<string, { x: number; y: number }>
  ) => computeConstellationPath(d, nodePositionsRef.current, posOverride);

  // Real backend graph state
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);
  const [clusters, setClusters] = useState<ClusterResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // UI state
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [showAtlasPlate, setShowAtlasPlate] = useState(true);
  const [showGraticule, setShowGraticule] = useState(true);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isMinimapExpanded, setIsMinimapExpanded] = useState(false);

  // Dialogs / Panels
  const [isEntityEditorOpen, setIsEntityEditorOpen] = useState(false);
  const [isRelationshipEditorOpen, setIsRelationshipEditorOpen] = useState(false);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);

  // Filters
  const [filterHubs, setFilterHubs] = useState(true);
  const [filterConcepts, setFilterConcepts] = useState(true);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);

  // Focus node, hover & search state
  const [selectedNode, setSelectedNode] = useState<CelestialNode | null>(null);
  const selectedNodeRef = useRef<CelestialNode | null>(null);
  useEffect(() => {
    selectedNodeRef.current = selectedNode;
  }, [selectedNode]);

  const [hoveredNode, setHoveredNode] = useState<CelestialNode | null>(null);
  const hoveredNodeRef = useRef<CelestialNode | null>(null);
  useEffect(() => {
    hoveredNodeRef.current = hoveredNode;
  }, [hoveredNode]);

  const [targetResolutionNotice, setTargetResolutionNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeCandidateIndex, setActiveCandidateIndex] = useState(0);

  // Current camera zoom transform for semantic zoom & orientation inset
  const [currentTransform, setCurrentTransform] = useState<d3.ZoomTransform>(d3.zoomIdentity);

  // Debounce search input to avoid any keystroke overhead
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch real workspace graph & clusters
  const fetchGraph = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    try {
      const [resGraph, resClusters] = await Promise.all([
        getWorkspaceGraph(workspaceId),
        listClusters(workspaceId).catch(() => []),
      ]);
      setGraphData(resGraph);
      setClusters(resClusters);
    } catch {
      // Gracefully handle
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // Transform backend entities & edges into Celestial nodes & links with authentic hierarchy
  const { celestialNodes, celestialLinks } = useMemo(() => {
    if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
      return { celestialNodes: [], celestialLinks: [] };
    }

    const nodesMap = new Map<string, GraphNodeResponse>();
    graphData.nodes.forEach((n) => nodesMap.set(n.id, n));

    // Calculate cluster index map
    const clusterMap: Record<string, number> = {};
    const clusterLabelMap = new Map<string, string>();
    clusters.forEach((c, idx) => {
      clusterMap[c.id] = (idx % 6) + 1;
      clusterLabelMap.set(c.id, c.label);
    });

    // 1. Filter out self-loops strictly from visualization and layout (§2)
    // Underlying database relationships are NOT touched.
    const validEdges = (graphData.edges || []).filter(
      (e) =>
        e.source_entity_id &&
        e.target_entity_id &&
        e.source_entity_id !== e.target_entity_id
    );

    // 2. Build adjacency map & compute degrees based strictly on non-self edges
    const adj = new Map<string, Set<string>>();
    graphData.nodes.forEach((n) => adj.set(n.id, new Set()));
    validEdges.forEach((e) => {
      adj.get(e.source_entity_id)?.add(e.target_entity_id);
      adj.get(e.target_entity_id)?.add(e.source_entity_id);
    });

    // 3. Cluster identification:
    // Respect real backend clusters directly. For unclustered nodes (cluster_id is null/missing),
    // assign them to the majority cluster of their connected neighbors, or "minor_stars" if isolated.
    const nodeClusterMap = new Map<string, { key: string; name: string; clusterId?: string }>();
    graphData.nodes.forEach((n) => {
      if (n.cluster_id && clusterLabelMap.has(n.cluster_id)) {
        nodeClusterMap.set(n.id, {
          key: `cluster_${n.cluster_id}`,
          name: clusterLabelMap.get(n.cluster_id)!,
          clusterId: n.cluster_id,
        });
      } else {
        const nbrs = adj.get(n.id);
        let majorityClusterId: string | null = null;
        if (nbrs && nbrs.size > 0) {
          const counts = new Map<string, number>();
          nbrs.forEach((nbrId) => {
            const nbrNode = nodesMap.get(nbrId);
            if (nbrNode?.cluster_id && clusterLabelMap.has(nbrNode.cluster_id)) {
              counts.set(nbrNode.cluster_id, (counts.get(nbrNode.cluster_id) || 0) + 1);
            }
          });
          let maxCount = 0;
          counts.forEach((cnt, cid) => {
            if (cnt > maxCount) {
              maxCount = cnt;
              majorityClusterId = cid;
            }
          });
        }
        if (majorityClusterId && clusterLabelMap.has(majorityClusterId)) {
          nodeClusterMap.set(n.id, {
            key: `cluster_${majorityClusterId}`,
            name: clusterLabelMap.get(majorityClusterId)!,
            clusterId: majorityClusterId,
          });
        } else {
          nodeClusterMap.set(n.id, {
            key: 'cluster_minor_stars',
            name: 'Minor Stars',
          });
        }
      }
    });

    // 4. Group nodes by cluster to establish authentic 3-tier star hierarchy (§3, §4)
    // Level 1: Core concepts (larger terracotta starburst, size 24) - Top 1-2 hubs per cluster (~5%)
    // Level 2: Subtopics (medium gold starburst, size 16) - Secondary hubs with degree >= 2 (~15%)
    // Level 3: Related/field stars (small terracotta stars, size 9) - Remaining nodes (~80%)
    const clusterNodesMap = new Map<string, GraphNodeResponse[]>();
    graphData.nodes.forEach((n) => {
      const cInfo = nodeClusterMap.get(n.id)!;
      const list = clusterNodesMap.get(cInfo.key) || [];
      list.push(n);
      clusterNodesMap.set(cInfo.key, list);
    });

    const coreNodeIds = new Set<string>();
    const subtopicNodeIds = new Set<string>();

    clusterNodesMap.forEach((cNodes) => {
      if (cNodes.length === 0) return;
      const sorted = [...cNodes].sort((a, b) => {
        const degA = adj.get(a.id)?.size || 0;
        const degB = adj.get(b.id)?.size || 0;
        return degB * 10 + (b.note_count || 0) - (degA * 10 + (a.note_count || 0));
      });

      // Level 1 Core: primary hub of the constellation
      coreNodeIds.add(sorted[0].id);
      // Secondary Core if cluster is large and second hub is distinct
      if (sorted.length >= 15 && (adj.get(sorted[1].id)?.size || 0) >= 4) {
        coreNodeIds.add(sorted[1].id);
      }

      // Level 2 Subtopics: next highest degree, up to 18% of cluster (max 5)
      const maxSubs = Math.max(1, Math.min(5, Math.floor(cNodes.length * 0.18)));
      const subCandidates = sorted.filter(
        (n) => !coreNodeIds.has(n.id) && (adj.get(n.id)?.size || 0) >= 2
      );
      subCandidates.slice(0, maxSubs).forEach((n) => subtopicNodeIds.add(n.id));
    });

    // Fallback if no core was selected
    if (coreNodeIds.size === 0 && graphData.nodes.length > 0) {
      const nodesByDegree = [...graphData.nodes].sort(
        (a, b) => (adj.get(b.id)?.size || 0) - (adj.get(a.id)?.size || 0)
      );
      coreNodeIds.add(nodesByDegree[0].id);
    }

    // 5. Load position cache from localStorage (§5)
    const storedPositions = workspaceId ? getStoredPositions(workspaceId) : new Map<string, { x: number; y: number }>();

    const nodes: CelestialNode[] = graphData.nodes.map((n) => {
      const { coords, catalog } = computeCelestialCoords(n.id);
      const deg = adj.get(n.id)?.size || 0;
      const cInfo = nodeClusterMap.get(n.id)!;

      let hierarchy: 'core' | 'subtopic' | 'related' = 'related';
      if (coreNodeIds.has(n.id)) {
        hierarchy = 'core';
      } else if (subtopicNodeIds.has(n.id)) {
        hierarchy = 'subtopic';
      } else {
        hierarchy = 'related';
      }

      // Proportional visual scale: Core (24), Subtopic (16), Related (9)
      const size = hierarchy === 'core' ? 24 : hierarchy === 'subtopic' ? 16 : 9;

      // Find connections from valid non-self edges only
      const connections: Array<{ id: string; name: string; type: string; corr: string }> = [];
      validEdges.forEach((e) => {
        if (e.source_entity_id === n.id) {
          const target = nodesMap.get(e.target_entity_id);
          if (target) {
            connections.push({
              id: target.id,
              name: target.name,
              type: e.relationship_type,
              corr: e.confidence.toFixed(2),
            });
          }
        } else if (e.target_entity_id === n.id) {
          const source = nodesMap.get(e.source_entity_id);
          if (source) {
            connections.push({
              id: source.id,
              name: source.name,
              type: e.relationship_type,
              corr: e.confidence.toFixed(2),
            });
          }
        }
      });

      const cached = storedPositions.get(n.id);
      const groupNum =
        cInfo.clusterId && clusterMap[cInfo.clusterId]
          ? clusterMap[cInfo.clusterId]
          : 1;

      return {
        id: n.id,
        label: n.name,
        catalog,
        clusterKey: cInfo.key,
        clusterName: cInfo.name,
        clusterId: cInfo.clusterId,
        coords,
        group: groupNum,
        type: hierarchy === 'core' ? 'hub' : 'concept',
        hierarchy,
        size,
        degree: deg,
        noteCount: n.note_count || 0,
        desc:
          n.description ||
          `Extracted ${n.entity_type} concept with ${deg} active relationships in the Hyades knowledge sky.`,
        connections,
        x: cached ? cached.x : undefined,
        y: cached ? cached.y : undefined,
      };
    });

    const validNodeIds = new Set(nodes.map((n) => n.id));

    // 6. Consolidate parallel/bidirectional links between unique pairs into single celestial links
    // Drastically reduces visual spaghetti and completely prevents overlapping line duplicates
    const linkMap = new Map<string, CelestialLink>();
    validEdges.forEach((e) => {
      if (!validNodeIds.has(e.source_entity_id) || !validNodeIds.has(e.target_entity_id)) return;
      const pairKey =
        e.source_entity_id < e.target_entity_id
          ? `${e.source_entity_id}__${e.target_entity_id}`
          : `${e.target_entity_id}__${e.source_entity_id}`;
      const existing = linkMap.get(pairKey);
      if (!existing) {
        linkMap.set(pairKey, {
          source: e.source_entity_id,
          target: e.target_entity_id,
          weight: e.confidence,
          type: e.relationship_type || '',
          types: e.relationship_type ? [e.relationship_type] : [],
        });
      } else {
        existing.weight = Math.max(existing.weight, e.confidence);
        if (e.relationship_type && !existing.types?.includes(e.relationship_type)) {
          existing.types?.push(e.relationship_type);
          existing.type = existing.types?.join(', ') || existing.type;
        }
      }
    });

    const links: CelestialLink[] = Array.from(linkMap.values());

    // 7. Compute edge tier for every relationship (§1, §2, §3, §7)
    // Preserves all real relationships without hiding or deleting cross-cluster connections
    const nodeLookup = new Map<string, CelestialNode>();
    nodes.forEach((n) => nodeLookup.set(n.id, n));

    links.forEach((l) => {
      const sId = typeof l.source === 'string' ? l.source : (l.source as any).id;
      const tId = typeof l.target === 'string' ? l.target : (l.target as any).id;
      l.tier = getEdgeTier(nodeLookup.get(sId), nodeLookup.get(tId));
    });

    // 8. Ensure every node has established layout coordinates immediately (§4, §5)
    // If cache is empty or has missing positions, compute layout once and cache it.
    const missingCount = nodes.filter((n) => !storedPositions.has(n.id)).length;
    if (missingCount > 0 || storedPositions.size === 0) {
      const width = containerDimensions.width;
      const height = containerDimensions.height;
      const computedPositions = computeObservatoryLayout(
        nodes,
        links,
        width * 0.44,
        height * 0.48
      );
      computedPositions.forEach((pos, id) => {
        storedPositions.set(id, pos);
      });
      saveStoredPositions(workspaceId, storedPositions);
    }

    // Apply coordinates to nodes
    nodes.forEach((n) => {
      const pos = storedPositions.get(n.id);
      if (pos) {
        n.x = pos.x;
        n.y = pos.y;
      }
    });

    return { celestialNodes: nodes, celestialLinks: links };
  }, [graphData, clusters, workspaceId, containerDimensions]);

  // Keep nodePositionsRef synchronized with stored coordinates
  useEffect(() => {
    if (workspaceId) {
      const stored = getStoredPositions(workspaceId);
      stored.forEach((pos, id) => {
        nodePositionsRef.current.set(id, pos);
      });
    }
  }, [workspaceId, celestialNodes.length]);


  // Deep Link Navigation Target Handler (§9, §10, §16)
  useEffect(() => {
    if (!initialTarget || celestialNodes.length === 0) return;

    let matched: CelestialNode | undefined;
    if (initialTarget.entityId) {
      matched = celestialNodes.find((n) => n.id === initialTarget.entityId);
    }
    if (!matched && initialTarget.relationshipId && graphData?.edges) {
      const edge = graphData.edges.find((e) => e.id === initialTarget.relationshipId);
      if (edge) {
        matched = celestialNodes.find(
          (n) => n.id === edge.source_entity_id || n.id === edge.target_entity_id
        );
      }
    }
    if (!matched && initialTarget.entityName) {
      const q = initialTarget.entityName.trim().toLowerCase();
      matched = celestialNodes.find(
        (n) => n.label.toLowerCase() === q || n.label.toLowerCase().includes(q)
      );
    }
    if (!matched && (initialTarget.noteId || initialTarget.sourceId)) {
      const targetId = initialTarget.noteId || initialTarget.sourceId;
      matched = celestialNodes.find(
        (n) => n.id === targetId || n.connections.some((c) => c.id === targetId)
      );
    }

    if (matched) {
      setTargetResolutionNotice(null);
      setSelectedNode(matched);
      setIsRightSidebarOpen(true);

      const targetX = nodePositionsRef.current.get(matched.id)?.x ?? matched.x;
      const targetY = nodePositionsRef.current.get(matched.id)?.y ?? matched.y;

      if (
        zoomBehaviorRef.current &&
        svgRef.current &&
        targetX !== undefined &&
        targetY !== undefined
      ) {
        const width = containerRef.current?.clientWidth || window.innerWidth;
        const height = containerRef.current?.clientHeight || window.innerHeight;
        const scale = 1.35;
        const x = width * 0.44 - targetX * scale;
        const y = height * 0.48 - targetY * scale;

        svgRef.current
          .transition()
          .duration(700)
          .ease(d3.easeCubicOut)
          .call(
            zoomBehaviorRef.current.transform,
            d3.zoomIdentity.translate(x, y).scale(scale)
          );
      }
    } else {
      setSelectedNode(null);
      const targetDesc = initialTarget.entityName || initialTarget.entityId || initialTarget.noteId || initialTarget.sourceId || 'requested item';
      setTargetResolutionNotice(`Target "${targetDesc}" could not be located in the visible knowledge graph.`);
    }
  }, [initialTarget, celestialNodes, graphData]);

  // Fit-to-content Reset / Fit View (§1.A)
  // Calculates actual bounding box of visible nodes with generous padding and centers in usable viewport.
  const handleFitView = useCallback(() => {
    if (!svgRef.current || !zoomBehaviorRef.current || !containerRef.current) return;
    const width = containerRef.current.clientWidth || window.innerWidth;
    const height = containerRef.current.clientHeight || window.innerHeight;

    const visibleNodes = celestialNodes.filter((n) => {
      if (!filterHubs && n.hierarchy === 'core') return false;
      if (!filterConcepts && n.hierarchy !== 'core') return false;
      if (
        selectedClusterId &&
        n.clusterId !== selectedClusterId &&
        n.clusterKey !== selectedClusterId
      ) {
        return false;
      }
      return true;
    });

    const positions: Array<{ x: number; y: number }> = [];
    visibleNodes.forEach((n) => {
      const cached = nodePositionsRef.current.get(n.id);
      const x = cached?.x ?? n.x;
      const y = cached?.y ?? n.y;
      if (x !== undefined && y !== undefined && !isNaN(x) && !isNaN(y)) {
        positions.push({ x, y });
      }
    });

    if (positions.length === 0) {
      svgRef.current
        .transition()
        .duration(600)
        .ease(d3.easeCubicOut)
        .call(
          zoomBehaviorRef.current.transform,
          d3.zoomIdentity.translate(width * 0.44, height * 0.48).scale(1.0)
        );
      return;
    }

    if (positions.length === 1) {
      const p = positions[0];
      const scale = 1.35;
      const tx = width * 0.44 - p.x * scale;
      const ty = height * 0.48 - p.y * scale;
      svgRef.current
        .transition()
        .duration(600)
        .ease(d3.easeCubicOut)
        .call(
          zoomBehaviorRef.current.transform,
          d3.zoomIdentity.translate(tx, ty).scale(scale)
        );
      return;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    positions.forEach((p) => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });

    const padding = 120;
    const boxWidth = Math.max(100, maxX - minX + padding * 2);
    const boxHeight = Math.max(100, maxY - minY + padding * 2);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    const usableWidth = width * 0.82;
    const usableHeight = height * 0.82;
    const scaleX = usableWidth / boxWidth;
    const scaleY = usableHeight / boxHeight;
    const fitScale = Math.min(1.4, Math.max(0.38, Math.min(scaleX, scaleY)));

    const tx = width * 0.44 - midX * fitScale;
    const ty = height * 0.48 - midY * fitScale;

    svgRef.current
      .transition()
      .duration(650)
      .ease(d3.easeCubicOut)
      .call(
        zoomBehaviorRef.current.transform,
        d3.zoomIdentity.translate(tx, ty).scale(fitScale)
      );
  }, [celestialNodes, filterHubs, filterConcepts, selectedClusterId]);

  // Manual Untangle / Local Cleanup Action (§2)
  // Preserves existing constellation shape, identifies overlaps/label collisions,
  // and moves only problematic nodes with clamped displacement (max 35px).
  const handleUntangle = useCallback(() => {
    if (!containerRef.current || celestialNodes.length === 0) return;
    const width = containerRef.current.clientWidth || window.innerWidth;
    const height = containerRef.current.clientHeight || window.innerHeight;
    const centerX = width * 0.44;
    const centerY = height * 0.48;

    // 1. Calculate bounded local cleanup preserving existing node positions
    const newPositions = performLocalUntangle(
      celestialNodes,
      celestialLinks,
      nodePositionsRef.current,
      centerX,
      centerY
    );

    // 2. Update persistent coordinate cache & nodes
    newPositions.forEach((pos, id) => {
      nodePositionsRef.current.set(id, pos);
    });
    celestialNodes.forEach((n) => {
      const pos = newPositions.get(n.id);
      if (pos) {
        n.x = pos.x;
        n.y = pos.y;
      }
    });
    saveStoredPositions(workspaceId, nodePositionsRef.current);

    // 3. Smoothly animate DOM elements to their cleaned celestial coordinates
    if (svgRef.current) {
      const isJsdom =
        typeof window !== 'undefined' &&
        typeof (window as any).SVGElement !== 'undefined' &&
        !(document.createElementNS('http://www.w3.org/2000/svg', 'g') as any).transform?.baseVal;

      if (isJsdom) {
        svgRef.current
          .selectAll('.celestial-node')
          .attr('transform', (d: any) => {
            const pos = newPositions.get(d.id) || { x: d.x, y: d.y };
            return `translate(${pos.x || 0}, ${pos.y || 0})`;
          });

        svgRef.current
          .selectAll('.celestial-link')
          .attr('d', (d: any) => linkConstellationPath(d, newPositions));
      } else {
        svgRef.current
          .selectAll('.celestial-node')
          .transition()
          .duration(500)
          .ease(d3.easeCubicOut)
          .attr('transform', (d: any) => {
            const pos = newPositions.get(d.id) || { x: d.x, y: d.y };
            return `translate(${pos.x || 0}, ${pos.y || 0})`;
          });

        svgRef.current
          .selectAll('.celestial-link')
          .transition()
          .duration(500)
          .ease(d3.easeCubicOut)
          .attr('d', (d: any) => linkConstellationPath(d, newPositions));
      }
    }
  }, [celestialNodes, celestialLinks, workspaceId]);

  // Keyboard Shortcuts System across Hyades Observatory (§7, §12)
  // Global: Esc closes open dialogs first; if none open, deselects node or cancels search.
  // Observatory: A (+Entity), C (Connect), F (Fit View), Shift+F (Fullscreen), U (Untangle)
  // Protected: NEVER trigger while typing in inputs, textareas, or search boxes!
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const tagName = activeEl?.tagName?.toLowerCase();
      const isInput =
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        Boolean(activeEl?.isContentEditable);

      if (e.key === 'Escape') {
        if (isEntityEditorOpen) {
          setIsEntityEditorOpen(false);
          return;
        }
        if (isRelationshipEditorOpen) {
          setIsRelationshipEditorOpen(false);
          return;
        }
        if (isSuggestionsOpen) {
          setIsSuggestionsOpen(false);
          return;
        }
        if (isMoreMenuOpen) {
          setIsMoreMenuOpen(false);
          return;
        }
        if (isMinimapExpanded) {
          setIsMinimapExpanded(false);
          return;
        }
        if (searchQuery || isSearchFocused) {
          setSearchQuery('');
          setIsSearchFocused(false);
          return;
        }
        if (isInput) return;
        if (selectedNode || hoveredNode) {
          e.preventDefault();
          setSelectedNode(null);
          setHoveredNode(null);
        }
        return;
      }

      // Never trigger letter shortcuts while the user is typing in forms or inputs!
      if (isInput) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        setIsEntityEditorOpen(true);
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        setIsRelationshipEditorOpen(true);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (e.shiftKey) {
          onToggleFullscreen?.();
        } else {
          handleFitView();
        }
      } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        handleUntangle();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isEntityEditorOpen,
    isRelationshipEditorOpen,
    isSuggestionsOpen,
    isMoreMenuOpen,
    isMinimapExpanded,
    searchQuery,
    isSearchFocused,
    selectedNode,
    hoveredNode,
    handleFitView,
    handleUntangle,
    onToggleFullscreen,
  ]);

  // Render Celestial Graticule (Astronomical Atlas Lines)
  const renderCelestialGraticule = useCallback(() => {
    if (!graticuleRef.current) return;
    const svg = d3.select(graticuleRef.current);
    svg.selectAll('*').remove();

    const width = window.innerWidth;
    const height = window.innerHeight;
    const cx = width * 0.44;
    const cy = height * 0.48;

    const g = svg.append('g').attr('class', 'graticule-group');

    // Declination Circles
    const radii = [130, 250, 370, 510, 670, 850];
    const declinationLabels = ['+25°', '+20°', '+15° (Hyades)', '+10°', '+05°', '0° Aequator'];

    radii.forEach((r, i) => {
      g.append('circle')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', r)
        .attr('fill', 'none')
        .attr('stroke', i === 2 ? 'rgba(189, 83, 43, 0.25)' : 'rgba(70, 60, 50, 0.11)')
        .attr('stroke-width', i === 2 ? 1.1 : 0.7)
        .attr('stroke-dasharray', i % 2 === 0 ? '4,4' : 'none');

      g.append('text')
        .attr('x', cx + 8)
        .attr('y', cy - r + 12)
        .attr('fill', i === 2 ? 'rgba(189, 83, 43, 0.75)' : 'rgba(100, 90, 80, 0.4)')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', '9px')
        .text(declinationLabels[i]);
    });

    // Right Ascension Radial Rays
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = (deg * Math.PI) / 180;
      const x2 = cx + Math.cos(rad) * 900;
      const y2 = cy + Math.sin(rad) * 900;

      g.append('line')
        .attr('x1', cx)
        .attr('y1', cy)
        .attr('x2', x2)
        .attr('y2', y2)
        .attr('stroke', 'rgba(70, 60, 50, 0.07)')
        .attr('stroke-width', 0.6)
        .attr('stroke-dasharray', '2,6');

      const h = Math.round(deg / 15);
      g.append('text')
        .attr('x', cx + Math.cos(rad) * 530)
        .attr('y', cy + Math.sin(rad) * 530)
        .attr('fill', 'rgba(100, 90, 80, 0.38)')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', '8.5px')
        .attr('text-anchor', 'middle')
        .text(`${h.toString().padStart(2, '0')}ʰ`);
    }

    // Ecliptic Curve
    const eclipticPath = `M ${cx - 700} ${cy + 220} Q ${cx} ${cy - 160} ${cx + 700} ${cy - 80}`;
    g.append('path')
      .attr('d', eclipticPath)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(192, 141, 56, 0.22)')
      .attr('stroke-width', 1.2)
      .attr('stroke-dasharray', '6,4');
  }, []);

  // Astronomical 8-Point Starburst Path Generator
  const createStarburstPath = (outerR: number, midR: number, innerR: number) => {
    let path = '';
    const points = 8;
    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const r = i % 2 === 0 ? (i % 4 === 0 ? outerR : midR) : innerR;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      path += i === 0 ? `M ${x} ${y} ` : `L ${x} ${y} `;
    }
    path += 'Z';
    return path;
  };

  // Symmetrical 4-Point Concept Star Generator
  const createSymmetricalConceptStar = (r: number) => {
    const p = r;
    const w = r * 0.28;
    return `M 0 ${-p} Q ${w} ${-w} ${p} 0 Q ${w} ${w} 0 ${p} Q ${-w} ${w} ${-p} 0 Q ${-w} ${-w} 0 ${-p} Z`;
  };

  // ================= STABLE D3 FORCE SIMULATION INITIALIZER =================
  // Strictly calculated ONCE when graph data or structural filters change.
  // NEVER recreated or restarted when selectedNode or searchQuery changes!
  useEffect(() => {
    if (!containerRef.current || celestialNodes.length === 0) return;

    renderCelestialGraticule();

    d3.select(containerRef.current).selectAll('*').remove();

    const width = containerRef.current.clientWidth || window.innerWidth;
    const height = containerRef.current.clientHeight || window.innerHeight;

    // Filter nodes based on user toggle
    const filteredNodes: CelestialNode[] = celestialNodes.filter((n) => {
      if (!filterHubs && n.hierarchy === 'core') return false;
      if (!filterConcepts && n.hierarchy !== 'core') return false;
      if (selectedClusterId && n.catalog !== selectedClusterId) return false;
      return true;
    });

    const activeNodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredLinks: CelestialLink[] = celestialLinks.filter(
      (l) =>
        activeNodeIds.has(typeof l.source === 'string' ? l.source : (l.source as any).id) &&
        activeNodeIds.has(typeof l.target === 'string' ? l.target : (l.target as any).id)
    );

    const svg = d3
      .select(containerRef.current)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height])
      .attr('class', 'celestial-svg select-none cursor-grab active:cursor-grabbing');

    svgRef.current = svg;

    // SVG Defs: Astrolabe Gradients & Glow Filters
    const defs = svg.append('defs');

    // 1. Core Primary Concept Radiant Gradient (Terracotta / Red starburst)
    const coreGrad = defs
      .append('radialGradient')
      .attr('id', 'core-starburst-grad')
      .attr('cx', '50%')
      .attr('cy', '50%')
      .attr('r', '50%');
    coreGrad.append('stop').attr('offset', '0%').attr('stop-color', '#FFF2EB');
    coreGrad.append('stop').attr('offset', '45%').attr('stop-color', '#E0693E');
    coreGrad.append('stop').attr('offset', '100%').attr('stop-color', '#BD532B');

    // 2. Subtopic Starburst Gradient (Medium Yellow / Gold starburst)
    const subtopicGrad = defs
      .append('radialGradient')
      .attr('id', 'subtopic-starburst-grad')
      .attr('cx', '50%')
      .attr('cy', '50%')
      .attr('r', '50%');
    subtopicGrad.append('stop').attr('offset', '0%').attr('stop-color', '#FFFDF0');
    subtopicGrad.append('stop').attr('offset', '45%').attr('stop-color', '#E8B854');
    subtopicGrad.append('stop').attr('offset', '100%').attr('stop-color', '#C08D38');

    // 3. Related Sub-subtopic Gradient (Smaller Terracotta / Orange star)
    const relatedGrad = defs
      .append('radialGradient')
      .attr('id', 'related-concept-grad')
      .attr('cx', '50%')
      .attr('cy', '50%')
      .attr('r', '50%');
    relatedGrad.append('stop').attr('offset', '0%').attr('stop-color', '#FFF4ED');
    relatedGrad.append('stop').attr('offset', '55%').attr('stop-color', '#D9653B');
    relatedGrad.append('stop').attr('offset', '100%').attr('stop-color', '#BD532B');

    // Celestial Halo Filter
    const filter = defs
      .append('filter')
      .attr('id', 'celestial-halo')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    filter.append('feGaussianBlur').attr('stdDeviation', '3.5').attr('result', 'blur');
    filter
      .append('feMerge')
      .selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic'])
      .enter()
      .append('feMergeNode')
      .attr('in', (d) => d);

    // Root Group with Zoom & Pan
    const g = svg.append('g').attr('class', 'observatory-viewport');

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3.5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        setCurrentTransform(event.transform);

        const k = event.transform.k;
        const currentSelectedId = selectedNodeRef.current?.id;
        const currentHoveredId = hoveredNodeRef.current?.id;
        const currentConnectedIds = new Set<string>();
        if (selectedNodeRef.current) {
          selectedNodeRef.current.connections.forEach((c) => currentConnectedIds.add(c.id));
        }
        if (hoveredNodeRef.current) {
          hoveredNodeRef.current.connections.forEach((c) => currentConnectedIds.add(c.id));
        }

        // Progressive semantic label disclosure (§5)
        g.selectAll<SVGGElement, CelestialNode>('.celestial-node').each(function (d) {
          const isSelected = d.id === currentSelectedId;
          const isHovered = d.id === currentHoveredId;
          const isConnected = currentConnectedIds.has(d.id);
          const labelGroup = d3.select(this).select('.node-label-group');

          const show = shouldShowNodeLabel(d, k, isSelected || isHovered || isConnected);
          labelGroup.style('display', show ? 'block' : 'none');
        });
      });

    svg.call(zoom);
    zoomBehaviorRef.current = zoom;

    // Check if nodes already have established positions (§4, §5)
    const hasEstablishedPositions =
      filteredNodes.length > 0 &&
      filteredNodes.filter((n) => n.x !== undefined && n.y !== undefined).length / filteredNodes.length >= 0.75;

    // Initial camera positioning:
    // If initialTarget exists, let target centering handle camera (§4, §6).
    // Otherwise, if positions exist, fit to actual content bounds (§1.A).
    const targetMatched = initialTarget
      ? filteredNodes.find(
          (n) =>
            (initialTarget.entityId && n.id === initialTarget.entityId) ||
            (initialTarget.entityName &&
              n.label.toLowerCase() === initialTarget.entityName.trim().toLowerCase())
        )
      : null;

    if (targetMatched) {
      const px = nodePositionsRef.current.get(targetMatched.id)?.x ?? targetMatched.x;
      const py = nodePositionsRef.current.get(targetMatched.id)?.y ?? targetMatched.y;
      if (px !== undefined && py !== undefined) {
        const scale = 1.35;
        svg.call(
          zoom.transform,
          d3.zoomIdentity.translate(width * 0.44 - px * scale, height * 0.48 - py * scale).scale(scale)
        );
      }
    } else if (hasEstablishedPositions) {
      setTimeout(() => {
        handleFitView();
      }, 60);
    } else {
      svg.call(
        zoom.transform,
        d3.zoomIdentity.translate(width * 0.05, height * 0.03).scale(0.95)
      );
    }

    // Background blank click catcher for entity deselection (§3)
    g.append('rect')
      .attr('class', 'graph-blank-catcher')
      .attr('x', -width * 4)
      .attr('y', -height * 4)
      .attr('width', width * 10)
      .attr('height', height * 10)
      .attr('fill', 'transparent')
      .style('pointer-events', 'all')
      .on('click', () => {
        setSelectedNode(null);
        setHoveredNode(null);
      });

    svg.on('click', (event) => {
      const target = event.target as HTMLElement | SVGElement;
      if (
        target === svg.node() ||
        target.classList?.contains('graph-blank-catcher') ||
        target.classList?.contains('observatory-viewport') ||
        target.classList?.contains('graticule-group')
      ) {
        setSelectedNode(null);
        setHoveredNode(null);
      }
    });

    // Fast node lookup for link and cluster queries
    const nodeLookup = new Map<string, CelestialNode>();
    filteredNodes.forEach((n) => nodeLookup.set(n.id, n));

    // Fast adjacency and incident link index for real-time neighborhood response (§2, §3)
    const neighborMap = new Map<string, Set<string>>();
    const incidentLinksMap = new Map<string, CelestialLink[]>();
    filteredNodes.forEach((n) => {
      neighborMap.set(n.id, new Set());
      incidentLinksMap.set(n.id, []);
    });
    filteredLinks.forEach((l) => {
      const sId = typeof l.source === 'string' ? l.source : (l.source as any).id;
      const tId = typeof l.target === 'string' ? l.target : (l.target as any).id;
      if (sId && tId && sId !== tId) {
        neighborMap.get(sId)?.add(tId);
        neighborMap.get(tId)?.add(sId);
        incidentLinksMap.get(sId)?.push(l);
        incidentLinksMap.get(tId)?.push(l);
      }
    });

    // Helper to resolve edge tier for link rendering (§1, §2, §3, §7)
    const resolveTier = (d: CelestialLink): EdgeTier => {
      const sId = typeof d.source === 'string' ? d.source : (d.source as any).id;
      const tId = typeof d.target === 'string' ? d.target : (d.target as any).id;
      return d.tier || getEdgeTier(nodeLookup.get(sId), nodeLookup.get(tId));
    };

    // Links Layer
    const linkGroup = g.append('g').attr('class', 'links-layer');
    const link = linkGroup
      .selectAll<SVGPathElement, CelestialLink>('path')
      .data(filteredLinks)
      .enter()
      .append('path')
      .attr('class', 'celestial-link')
      .attr('fill', 'none')
      .attr('stroke', (d) => getLinkStroke(resolveTier(d)))
      .attr('stroke-opacity', (d) => getLinkOpacity(resolveTier(d)))
      .attr('stroke-width', (d) => getLinkWidth(resolveTier(d), d.weight))
      .attr('stroke-dasharray', (d) => getLinkDashArray(resolveTier(d)));

    // Nodes Layer
    const nodeGroup = g.append('g').attr('class', 'nodes-layer');
    const node = nodeGroup
      .selectAll<SVGGElement, CelestialNode>('.celestial-node')
      .data(filteredNodes, (d) => d.id)
      .enter()
      .append('g')
      .attr('class', 'celestial-node cursor-pointer')
      .attr('data-id', (d) => d.id)
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedNode(d);
        setIsRightSidebarOpen(true);
        // Smoothly center viewport on clicked entity (§1.D)
        if (svgRef.current && zoomBehaviorRef.current && d.x !== undefined && d.y !== undefined) {
          const w = containerRef.current?.clientWidth || window.innerWidth;
          const h = containerRef.current?.clientHeight || window.innerHeight;
          const scale = 1.35;
          const tx = w * 0.44 - d.x * scale;
          const ty = h * 0.48 - d.y * scale;
          svgRef.current
            .transition()
            .duration(550)
            .ease(d3.easeCubicOut)
            .call(
              zoomBehaviorRef.current.transform,
              d3.zoomIdentity.translate(tx, ty).scale(scale)
            );
        }
      })
      .on('mouseenter', function (_event, d) {
        setHoveredNode(d);
        d3.select(this).select('.node-label-group').style('display', 'block');
      })
      .on('mouseleave', function (_event, d) {
        setHoveredNode(null);
        const svgNode = svgRef.current?.node();
        const k = svgNode ? d3.zoomTransform(svgNode).k : 1;
        const currentSelectedId = selectedNodeRef.current?.id;
        const isSelected = d.id === currentSelectedId;
        const isConnected = selectedNodeRef.current?.connections.some((c) => c.id === d.id);
        if (isSelected || isConnected) return;

        const labelGroup = d3.select(this).select('.node-label-group');
        labelGroup.style('display', shouldShowNodeLabel(d, k, false) ? 'block' : 'none');
      });

    // Statically position all nodes and curved constellation links directly from established coordinates (§3, §4)
    link.attr('d', (d: any) => linkConstellationPath(d));
    node.attr('transform', (d) => {
      const pos = nodePositionsRef.current.get(d.id) || { x: d.x ?? 0, y: d.y ?? 0 };
      return `translate(${pos.x}, ${pos.y})`;
    });

    // Render Node Shapes according to approved astronomical hierarchy
    node.each(function (d) {
      const el = d3.select(this);

      // Forgiving Invisible Interaction Hitbox (§3)
      // Generous hit target radius so clicking is effortless without enlarging visual star
      el.append('circle')
        .attr('class', 'star-hitbox')
        .attr('r', Math.max(26, d.size + 14))
        .attr('fill', 'transparent')
        .style('cursor', 'pointer');

      // Selection Halo (toggle visibility via class without simulation recalculation)
      el.append('circle')
        .attr('class', 'selection-halo pointer-events-none')
        .attr('r', d.size * 2.0)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(189, 83, 43, 0.55)')
        .attr('stroke-width', 1.2)
        .attr('stroke-dasharray', '3,3')
        .style('opacity', 0);

      if (d.hierarchy === 'core') {
        // Large Red/Terracotta Starburst for Core Concepts
        el.append('path')
          .attr('d', createStarburstPath(24, 15, 6))
          .attr('fill', 'url(#core-starburst-grad)')
          .attr('filter', 'url(#celestial-halo)')
          .attr('stroke', '#8F3819')
          .attr('stroke-width', 1.1);

        el.append('circle')
          .attr('r', 3.5)
          .attr('fill', '#FAF8F2')
          .attr('stroke', '#BD532B')
          .attr('stroke-width', 0.9);
      } else if (d.hierarchy === 'subtopic') {
        // Medium Yellow/Gold Starburst for Subtopics
        el.append('path')
          .attr('d', createStarburstPath(16, 10, 4.5))
          .attr('fill', 'url(#subtopic-starburst-grad)')
          .attr('filter', 'url(#celestial-halo)')
          .attr('stroke', '#8F6418')
          .attr('stroke-width', 0.9);

        el.append('circle')
          .attr('r', 2.5)
          .attr('fill', '#FAF8F2')
          .attr('stroke', '#C08D38')
          .attr('stroke-width', 0.8);
      } else {
        // Smaller Terracotta/Orange Concept Star for Related/Lower concepts (§4, §7)
        // Maintains recognizable terracotta color, crisp geometry, and clear definition across all zoom levels
        el.append('path')
          .attr('d', createSymmetricalConceptStar(10))
          .attr('fill', 'url(#related-concept-grad)')
          .attr('stroke', '#BD532B')
          .attr('stroke-width', 1.0);

        el.append('circle').attr('r', 2.0).attr('fill', '#FAF8F2');
      }

      // Clean, elegant astronomical label showing ONLY the concept name (§1, §2)
      const textGroup = el
        .append('g')
        .attr('class', 'node-label-group pointer-events-none select-none')
        .attr('transform', `translate(0, ${d.size + 11})`)
        .style('display', shouldShowNodeLabel(d, currentTransform?.k ?? 1, false) ? 'block' : 'none');

      textGroup
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('class', 'serif font-medium')
        .attr(
          'font-size',
          d.hierarchy === 'core' ? '12.5px' : d.hierarchy === 'subtopic' ? '11px' : '9.5px'
        )
        .attr('fill', '#1A2130')
        .attr('letter-spacing', '0.015em')
        .attr('paint-order', 'stroke')
        .attr('stroke', '#FAF8F2')
        .attr('stroke-width', '3px')
        .attr('stroke-linejoin', 'round')
        .text(d.label);
    });

    // Temporary Elastic "Jiggle" Drag Interaction (§1, §2, §3, §4, §8)
    // Grabbing a node follows cursor smoothly.
    // Directly connected neighbors react with a subtle elastic jiggle (displacement ~22%).
    // Curved relationship links respond and bend naturally.
    // On release, all nodes and curves gently settle back to their exact resting positions.
    // Positions are NEVER persisted on drag end.
    let activeSettleTimer: d3.Timer | null = null;
    let activeDragData: {
      nodeId: string;
      origin: { x: number; y: number };
      startMouse: { x: number; y: number };
      neighborOrigins: Map<string, { x: number; y: number }>;
      secondHopOrigins: Map<string, { x: number; y: number }>;
      draggedNodeEl: d3.Selection<SVGGElement, any, any, any>;
      draggedLinksEl: d3.Selection<SVGPathElement, any, any, any>;
    } | null = null;

    const drag = d3
      .drag<SVGGElement, CelestialNode>()
      .subject((_event, d) => {
        const p = nodePositionsRef.current.get(d.id) || { x: d.x ?? 0, y: d.y ?? 0 };
        return { x: p.x, y: p.y, id: d.id };
      })
      .on('start', (event, d) => {
        // Stop any active settle timer immediately
        if (activeSettleTimer) {
          activeSettleTimer.stop();
          activeSettleTimer = null;
        }

        const origin = nodePositionsRef.current.get(d.id) || { x: d.x ?? 0, y: d.y ?? 0 };
        const neighbors = Array.from(neighborMap.get(d.id) || []);
        const neighborOrigins = new Map<string, { x: number; y: number }>();
        const secondHopOrigins = new Map<string, { x: number; y: number }>();

        // 1st-hop direct neighbors
        neighbors.forEach((nbrId) => {
          const p = nodePositionsRef.current.get(nbrId);
          if (p) neighborOrigins.set(nbrId, { x: p.x, y: p.y });

          // 2nd-hop neighbors shift very slightly
          const secondNbrs = neighborMap.get(nbrId);
          if (secondNbrs) {
            secondNbrs.forEach((sId) => {
              if (sId !== d.id && !neighborOrigins.has(sId) && !secondHopOrigins.has(sId)) {
                const sp = nodePositionsRef.current.get(sId);
                if (sp) secondHopOrigins.set(sId, { x: sp.x, y: sp.y });
              }
            });
          }
        });

        // Collect incident links connected to dragged node or neighbors
        const incidentList = incidentLinksMap.get(d.id) || [];
        const incidentSet = new Set(incidentList);

        const draggedNodeEl = nodeGroup.select<SVGGElement>(`.celestial-node[data-id="${d.id}"]`);
        draggedNodeEl.classed('is-dragging', true);

        const draggedLinksEl = link.filter((l: any) => incidentSet.has(l));
        draggedLinksEl
          .classed('is-drag-active', true)
          .attr('stroke', '#BD532B')
          .attr('stroke-opacity', 0.95)
          .attr('stroke-width', (l: any) => getLinkWidth(resolveTier(l), l.weight) + 0.85);

        activeDragData = {
          nodeId: d.id,
          origin: { ...origin },
          startMouse: { x: event.x, y: event.y },
          neighborOrigins,
          secondHopOrigins,
          draggedNodeEl,
          draggedLinksEl,
        };
      })
      .on('drag', (event, d) => {
        if (!activeDragData || activeDragData.nodeId !== d.id) return;
        const { origin, startMouse, neighborOrigins, secondHopOrigins, draggedNodeEl, draggedLinksEl } = activeDragData;

        // Smooth delta calculation relative to start
        const dx = event.x - startMouse.x;
        const dy = event.y - startMouse.y;
        const curX = origin.x + dx;
        const curY = origin.y + dy;

        // 1. Dragged node follows cursor smoothly without teleportation
        draggedNodeEl.attr('transform', `translate(${curX}, ${curY})`);

        // 2. Direct connected neighbors react with soft elastic displacement (22%)
        const elasticFactor = 0.22;
        const secondHopFactor = 0.05;
        const tempPositions = new Map<string, { x: number; y: number }>();
        tempPositions.set(d.id, { x: curX, y: curY });

        neighborOrigins.forEach((nOrig, nId) => {
          const nx = nOrig.x + dx * elasticFactor;
          const ny = nOrig.y + dy * elasticFactor;
          tempPositions.set(nId, { x: nx, y: ny });
          nodeGroup.select(`.celestial-node[data-id="${nId}"]`).attr('transform', `translate(${nx}, ${ny})`);
        });

        secondHopOrigins.forEach((sOrig, sId) => {
          const sx = sOrig.x + dx * secondHopFactor;
          const sy = sOrig.y + dy * secondHopFactor;
          tempPositions.set(sId, { x: sx, y: sy });
          nodeGroup.select(`.celestial-node[data-id="${sId}"]`).attr('transform', `translate(${sx}, ${sy})`);
        });

        // 3. Curved relationship links respond and bend naturally in real time
        draggedLinksEl.attr('d', (l: any) => computeConstellationPath(l, nodePositionsRef.current, tempPositions));
      })
      .on('end', (_event, d) => {
        if (!activeDragData || activeDragData.nodeId !== d.id) return;
        const { origin, neighborOrigins, secondHopOrigins, draggedNodeEl, draggedLinksEl } = activeDragData;

        // Read current dragged and neighbor offsets for smooth return
        const currentTransformStr = draggedNodeEl.attr('transform') || '';
        const match = /translate\(([^,]+),\s*([^)]+)\)/.exec(currentTransformStr);
        const startCurX = match ? parseFloat(match[1]) : origin.x;
        const startCurY = match ? parseFloat(match[2]) : origin.y;

        const neighborStarts = new Map<string, { x: number; y: number }>();
        neighborOrigins.forEach((nOrig, nId) => {
          const nEl = nodeGroup.select(`.celestial-node[data-id="${nId}"]`);
          const nMatch = /translate\(([^,]+),\s*([^)]+)\)/.exec(nEl.attr('transform') || '');
          neighborStarts.set(nId, {
            x: nMatch ? parseFloat(nMatch[1]) : nOrig.x,
            y: nMatch ? parseFloat(nMatch[2]) : nOrig.y,
          });
        });

        const secondStarts = new Map<string, { x: number; y: number }>();
        secondHopOrigins.forEach((sOrig, sId) => {
          const sEl = nodeGroup.select(`.celestial-node[data-id="${sId}"]`);
          const sMatch = /translate\(([^,]+),\s*([^)]+)\)/.exec(sEl.attr('transform') || '');
          secondStarts.set(sId, {
            x: sMatch ? parseFloat(sMatch[1]) : sOrig.x,
            y: sMatch ? parseFloat(sMatch[2]) : sOrig.y,
          });
        });

        const isJsdom =
          typeof window !== 'undefined' &&
          typeof (window as any).SVGElement !== 'undefined' &&
          !(document.createElementNS('http://www.w3.org/2000/svg', 'g') as any).transform?.baseVal;

        const completeReturn = () => {
          draggedNodeEl.classed('is-dragging', false);
          draggedNodeEl.attr('transform', `translate(${origin.x}, ${origin.y})`);

          neighborOrigins.forEach((nOrig, nId) => {
            nodeGroup.select(`.celestial-node[data-id="${nId}"]`).attr('transform', `translate(${nOrig.x}, ${nOrig.y})`);
          });
          secondHopOrigins.forEach((sOrig, sId) => {
            nodeGroup.select(`.celestial-node[data-id="${sId}"]`).attr('transform', `translate(${sOrig.x}, ${sOrig.y})`);
          });

          // Restore resting link styles with respect to any active selection
          const currentSelectedId = selectedNodeRef.current?.id;
          const currentHoveredId = hoveredNodeRef.current?.id;
          const selectedNeighbors = new Set<string>();
          if (selectedNodeRef.current) {
            selectedNodeRef.current.connections.forEach((c) => selectedNeighbors.add(c.id));
          }
          const hoveredNeighbors = new Set<string>();
          if (hoveredNodeRef.current) {
            hoveredNodeRef.current.connections.forEach((c) => hoveredNeighbors.add(c.id));
          }

          draggedLinksEl
            .classed('is-drag-active', false)
            .attr('stroke', (l: any) => {
              const srcId = typeof l.source === 'string' ? l.source : l.source.id;
              const tgtId = typeof l.target === 'string' ? l.target : l.target.id;
              const isDirectSelectedEdge = currentSelectedId
                ? (srcId === currentSelectedId && selectedNeighbors.has(tgtId)) ||
                  (tgtId === currentSelectedId && selectedNeighbors.has(srcId))
                : false;
              if (isDirectSelectedEdge) return '#BD532B';
              const isDirectHoveredEdge = currentHoveredId
                ? (srcId === currentHoveredId && hoveredNeighbors.has(tgtId)) ||
                  (tgtId === currentHoveredId && hoveredNeighbors.has(srcId))
                : false;
              if (isDirectHoveredEdge) return '#D26E40';
              const tier = resolveTier(l);
              return getLinkStroke(tier);
            })
            .attr('stroke-opacity', (l: any) => {
              const srcId = typeof l.source === 'string' ? l.source : l.source.id;
              const tgtId = typeof l.target === 'string' ? l.target : l.target.id;
              const isDirectSelectedEdge = currentSelectedId
                ? (srcId === currentSelectedId && selectedNeighbors.has(tgtId)) ||
                  (tgtId === currentSelectedId && selectedNeighbors.has(srcId))
                : false;
              if (isDirectSelectedEdge) return 0.96;
              const isDirectHoveredEdge = currentHoveredId
                ? (srcId === currentHoveredId && hoveredNeighbors.has(tgtId)) ||
                  (tgtId === currentHoveredId && hoveredNeighbors.has(srcId))
                : false;
              if (isDirectHoveredEdge) return 0.88;
              const tier = resolveTier(l);
              if (currentSelectedId || currentHoveredId) {
                return getSubduedLinkOpacity(tier);
              }
              return getLinkOpacity(tier);
            })
            .attr('stroke-width', (l: any) => {
              const srcId = typeof l.source === 'string' ? l.source : l.source.id;
              const tgtId = typeof l.target === 'string' ? l.target : l.target.id;
              const isDirectSelectedEdge = currentSelectedId
                ? (srcId === currentSelectedId && selectedNeighbors.has(tgtId)) ||
                  (tgtId === currentSelectedId && selectedNeighbors.has(srcId))
                : false;
              if (isDirectSelectedEdge) return 2.4;
              const isDirectHoveredEdge = currentHoveredId
                ? (srcId === currentHoveredId && hoveredNeighbors.has(tgtId)) ||
                  (tgtId === currentHoveredId && hoveredNeighbors.has(srcId))
                : false;
              if (isDirectHoveredEdge) return 2.0;
              const tier = resolveTier(l);
              return getLinkWidth(tier, l.weight);
            })
            .attr('stroke-dasharray', (l: any) => {
              const srcId = typeof l.source === 'string' ? l.source : l.source.id;
              const tgtId = typeof l.target === 'string' ? l.target : l.target.id;
              const isDirectSelectedEdge = currentSelectedId
                ? (srcId === currentSelectedId && selectedNeighbors.has(tgtId)) ||
                  (tgtId === currentSelectedId && selectedNeighbors.has(srcId))
                : false;
              if (isDirectSelectedEdge) return 'none';
              const isDirectHoveredEdge = currentHoveredId
                ? (srcId === currentHoveredId && hoveredNeighbors.has(tgtId)) ||
                  (tgtId === currentHoveredId && hoveredNeighbors.has(srcId))
                : false;
              if (isDirectHoveredEdge) return 'none';
              const tier = resolveTier(l);
              return getLinkDashArray(tier);
            })
            .attr('d', (l: any) => linkConstellationPath(l));

          activeDragData = null;
        };

        if (isJsdom) {
          completeReturn();
        } else {
          // Smooth 420ms cubic-out return animation: everything settles back to exact cached coordinates
          const duration = 420;
          activeSettleTimer = d3.timer((elapsed) => {
            const t = Math.min(1, elapsed / duration);
            const easeT = d3.easeCubicOut(t);

            const animX = startCurX + (origin.x - startCurX) * easeT;
            const animY = startCurY + (origin.y - startCurY) * easeT;
            draggedNodeEl.attr('transform', `translate(${animX}, ${animY})`);

            const animPositions = new Map<string, { x: number; y: number }>();
            animPositions.set(d.id, { x: animX, y: animY });

            neighborOrigins.forEach((nOrig, nId) => {
              const nStart = neighborStarts.get(nId) || nOrig;
              const nx = nStart.x + (nOrig.x - nStart.x) * easeT;
              const ny = nStart.y + (nOrig.y - nStart.y) * easeT;
              animPositions.set(nId, { x: nx, y: ny });
              nodeGroup.select(`.celestial-node[data-id="${nId}"]`).attr('transform', `translate(${nx}, ${ny})`);
            });

            secondHopOrigins.forEach((sOrig, sId) => {
              const sStart = secondStarts.get(sId) || sOrig;
              const sx = sStart.x + (sOrig.x - sStart.x) * easeT;
              const sy = sStart.y + (sOrig.y - sStart.y) * easeT;
              animPositions.set(sId, { x: sx, y: sy });
              nodeGroup.select(`.celestial-node[data-id="${sId}"]`).attr('transform', `translate(${sx}, ${sy})`);
            });

            draggedLinksEl.attr('d', (l: any) => computeConstellationPath(l, nodePositionsRef.current, animPositions));

            if (t >= 1) {
              if (activeSettleTimer) {
                activeSettleTimer.stop();
                activeSettleTimer = null;
              }
              completeReturn();
            }
          });
        }
      });

    node.call(drag);

    return () => {
      if (activeSettleTimer) {
        activeSettleTimer.stop();
        activeSettleTimer = null;
      }
    };
  }, [
    celestialNodes,
    celestialLinks,
    filterHubs,
    filterConcepts,
    selectedClusterId,
    renderCelestialGraticule,
    workspaceId,
  ]);

  // ================= STABLE SELECTION & HOVER HIGHLIGHTING EFFECT =================
  // Updates visual attributes purely in DOM without restarting force simulation!
  useEffect(() => {
    if (!containerRef.current) return;
    const svg = d3.select(containerRef.current).select('svg');
    if (svg.empty()) return;

    const selectedId = selectedNode?.id;
    const hoveredId = hoveredNode?.id;

    const selectedNeighbors = new Set<string>();
    if (selectedNode) {
      selectedNode.connections.forEach((c) => selectedNeighbors.add(c.id));
    }

    const hoveredNeighbors = new Set<string>();
    if (hoveredNode) {
      hoveredNode.connections.forEach((c) => hoveredNeighbors.add(c.id));
    }

    // Update node styles & selection halo with hardware-accelerated CSS classes
    svg.selectAll<SVGGElement, CelestialNode>('.celestial-node').each(function (d) {
      const el = d3.select(this);
      const isSelected = d.id === selectedId;
      const isHovered = d.id === hoveredId;
      const isConnected = selectedNeighbors.has(d.id);
      const isHoverConnected = hoveredNeighbors.has(d.id);

      // Only dim unrelated nodes when an explicit selection is active
      const isDimmed = selectedId ? !isSelected && !isConnected : false;

      el.classed('is-selected', isSelected)
        .classed('is-connected', isConnected)
        .classed('is-hovered', isHovered)
        .classed('is-dimmed', isDimmed)
        .style('opacity', isDimmed ? 0.42 : 1);

      // Halo treatment: full terracotta halo for selected node; warm subtle halo for hovered node
      const halo = el.select('.selection-halo');
      if (isSelected) {
        halo
          .style('opacity', 1)
          .attr('stroke', 'rgba(189, 83, 43, 0.95)')
          .attr('stroke-width', 1.4)
          .attr('stroke-dasharray', '3,3');
      } else if (isHovered) {
        halo
          .style('opacity', 0.55)
          .attr('stroke', 'rgba(210, 110, 64, 0.70)')
          .attr('stroke-width', 1.2)
          .attr('stroke-dasharray', '2,2');
      } else {
        halo.style('opacity', 0);
      }

      // Also ensure hovered node and its neighbors show their labels
      if (isHovered || isHoverConnected) {
        el.select('.node-label-group').style('display', 'block');
      }
    });

    const nodeLookup = new Map<string, CelestialNode>();
    celestialNodes.forEach((n) => nodeLookup.set(n.id, n));

    // Update link highlights with distinct visual hierarchy
    svg.selectAll<SVGPathElement, CelestialLink>('.celestial-link').each(function (d) {
      const el = d3.select(this);
      const srcId = typeof d.source === 'string' ? d.source : (d.source as any).id;
      const tgtId = typeof d.target === 'string' ? d.target : (d.target as any).id;

      const isDirectSelectedEdge = selectedId
        ? (srcId === selectedId && selectedNeighbors.has(tgtId)) ||
          (tgtId === selectedId && selectedNeighbors.has(srcId))
        : false;

      const isDirectHoveredEdge = hoveredId
        ? (srcId === hoveredId && hoveredNeighbors.has(tgtId)) ||
          (tgtId === hoveredId && hoveredNeighbors.has(srcId))
        : false;

      const sNode = nodeLookup.get(srcId);
      const tNode = nodeLookup.get(tgtId);
      const tier = d.tier || getEdgeTier(sNode, tNode);

      if (isDirectSelectedEdge) {
        // SELECTED NODE EDGES: temporarily stronger/highlighted (§3, §5)
        el.classed('is-active-link', true)
          .attr('stroke', '#BD532B')
          .attr('stroke-opacity', 0.96)
          .attr('stroke-width', 2.4)
          .attr('stroke-dasharray', 'none');
      } else if (isDirectHoveredEdge) {
        // HOVERED NODE EDGES: subtle warm emphasis (§3)
        el.classed('is-active-link', true)
          .attr('stroke', '#D26E40')
          .attr('stroke-opacity', 0.88)
          .attr('stroke-width', 2.0)
          .attr('stroke-dasharray', 'none');
      } else if (selectedId || hoveredId) {
        // A node is selected or hovered: keep unrelated edges subdued based on tier (§3)
        el.classed('is-active-link', false)
          .attr('stroke', getLinkStroke(tier))
          .attr('stroke-opacity', getSubduedLinkOpacity(tier))
          .attr('stroke-width', getLinkWidth(tier, d.weight) * 0.9)
          .attr('stroke-dasharray', getLinkDashArray(tier));
      } else {
        // DEFAULT NEUTRAL RESTING STATE (§1, §2, §3, §7):
        // 1. Level 1 relationships -> restrained terracotta/red, most visible
        // 2. Level 2 -> Level 3 -> restrained gold/ochre, clearly visible but quieter
        // 3. same-level / secondary relationships -> very light neutral/deep-ink
        // 4. cross-cluster relationships -> faint dotted lines, lower opacity, slightly lighter tone
        el.classed('is-active-link', false)
          .attr('stroke', getLinkStroke(tier))
          .attr('stroke-opacity', getLinkOpacity(tier))
          .attr('stroke-width', getLinkWidth(tier, d.weight))
          .attr('stroke-dasharray', getLinkDashArray(tier));
      }
    });
  }, [selectedNode, hoveredNode, celestialNodes]);

  // ================= DEBOUNCED SEARCH HIGHLIGHT EFFECT =================
  // Highlights search matches in graph without re-running simulation
  useEffect(() => {
    if (!containerRef.current) return;
    const svg = d3.select(containerRef.current).select('svg');
    if (svg.empty()) return;

    const query = debouncedSearchQuery.trim().toLowerCase();
    if (!query) {
      if (selectedNode) {
        svg.selectAll('.celestial-node').style('opacity', null);
      } else {
        svg.selectAll('.celestial-node').style('opacity', 1);
      }
      return;
    }

    svg.selectAll<SVGGElement, CelestialNode>('.celestial-node').each(function (d) {
      const match =
        d.label.toLowerCase().includes(query) || d.catalog.toLowerCase().includes(query);
      d3.select(this).style('opacity', match ? 1 : 0.22);
    });
  }, [debouncedSearchQuery, selectedNode]);

  // Zoom controls
  const handleZoom = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    svgRef.current.transition().duration(300).call(zoomBehaviorRef.current.scaleBy, factor);
  };

  // Search candidate ranking (Exact > Prefix > Word-prefix > Substring > Catalog) (§2)
  const searchCandidates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || celestialNodes.length === 0) return [];

    interface ScoredCandidate {
      node: CelestialNode;
      score: number;
      matchType: 'exact' | 'prefix' | 'word-prefix' | 'substring' | 'catalog';
    }

    const scored: ScoredCandidate[] = [];

    celestialNodes.forEach((n) => {
      const labelLower = n.label.toLowerCase();
      let score = 0;
      let matchType: ScoredCandidate['matchType'] = 'substring';

      if (labelLower === q) {
        score = 100;
        matchType = 'exact';
      } else if (labelLower.startsWith(q)) {
        score = 80;
        matchType = 'prefix';
      } else if (labelLower.split(/\s+/).some((w) => w.startsWith(q))) {
        score = 65;
        matchType = 'word-prefix';
      } else if (labelLower.includes(q)) {
        score = 50;
        matchType = 'substring';
      } else if (n.catalog.toLowerCase().includes(q)) {
        score = 35;
        matchType = 'catalog';
      }

      if (score > 0) {
        // Hierarchy and degree bonus for ranking
        const bonus =
          (n.hierarchy === 'core' ? 6 : n.hierarchy === 'subtopic' ? 3 : 0) +
          Math.min(4, (n.degree || 0) * 0.4);
        scored.push({ node: n, score: score + bonus, matchType });
      }
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 6).map((s) => s.node);
  }, [searchQuery, celestialNodes]);

  // Search commit: center camera on target node WITHOUT recreating simulation (§2)
  const handleSearchCommit = (targetNode?: CelestialNode) => {
    const target =
      targetNode ||
      searchCandidates[0] ||
      celestialNodes.find((n) =>
        n.label.toLowerCase().includes(searchQuery.trim().toLowerCase())
      );
    if (!target) return;
    setSelectedNode(target);
    setIsRightSidebarOpen(true);

    const pos = nodePositionsRef.current.get(target.id) || { x: target.x, y: target.y };
    if (svgRef.current && zoomBehaviorRef.current && pos.x !== undefined && pos.y !== undefined) {
      const width = containerRef.current?.clientWidth || window.innerWidth;
      const height = containerRef.current?.clientHeight || window.innerHeight;
      const scale = 1.35;
      svgRef.current
        .transition()
        .duration(600)
        .ease(d3.easeCubicOut)
        .call(
          zoomBehaviorRef.current.transform,
          d3.zoomIdentity
            .translate(width * 0.44 - pos.x * scale, height * 0.48 - pos.y * scale)
            .scale(scale)
        );
    }
  };

  // Miniature Orientation Map calculations (§1.E, §8)
  const miniMapData = useMemo(() => {
    const W = isMinimapExpanded ? 340 : 126;
    const H = isMinimapExpanded ? 210 : 74;

    const positions: Array<{
      id: string;
      x: number;
      y: number;
      clusterKey: string;
      hierarchy: string;
      isSelected: boolean;
    }> = [];

    celestialNodes.forEach((n) => {
      const x = n.x;
      const y = n.y;
      if (x !== undefined && y !== undefined && !isNaN(x) && !isNaN(y)) {
        positions.push({
          id: n.id,
          x,
          y,
          clusterKey: n.clusterKey,
          hierarchy: n.hierarchy,
          isSelected: selectedNode?.id === n.id,
        });
      }
    });

    if (positions.length === 0) {
      return { nodes: [], viewport: null, bounds: null, clusters: [], selectedPoint: null };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    positions.forEach((p) => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });

    const pad = 120;
    const graphMinX = minX - pad;
    const graphMaxX = maxX + pad;
    const graphMinY = minY - pad;
    const graphMaxY = maxY + pad;
    const spanX = Math.max(10, graphMaxX - graphMinX);
    const spanY = Math.max(10, graphMaxY - graphMinY);

    const mappedNodes = positions.map((p) => {
      const mx = ((p.x - graphMinX) / spanX) * W;
      const my = ((p.y - graphMinY) / spanY) * H;
      const color =
        p.hierarchy === 'core'
          ? '#BD532B'
          : p.hierarchy === 'subtopic'
          ? '#C08D38'
          : '#645A50';
      const baseR = p.hierarchy === 'core' ? 2.5 : p.hierarchy === 'subtopic' ? 1.8 : 1.2;
      const r = (p.isSelected ? baseR * 1.5 : baseR) * (isMinimapExpanded ? 1.4 : 1.0);
      const opacity = p.isSelected ? 1.0 : p.hierarchy === 'core' ? 0.95 : 0.75;
      return { id: p.id, mx, my, r, color, opacity };
    });

    // Viewport rect calculation
    const containerW = containerDimensions.width;
    const containerH = containerDimensions.height;
    const k = currentTransform.k || 1;
    const tx = currentTransform.x || 0;
    const ty = currentTransform.y || 0;

    const visibleLeft = (0 - tx) / k;
    const visibleTop = (0 - ty) / k;
    const visibleRight = (containerW - tx) / k;
    const visibleBottom = (containerH - ty) / k;

    const vx = Math.max(0, ((visibleLeft - graphMinX) / spanX) * W);
    const vy = Math.max(0, ((visibleTop - graphMinY) / spanY) * H);
    const vw = Math.min(W - vx, Math.max(8, ((visibleRight - visibleLeft) / spanX) * W));
    const vh = Math.min(H - vy, Math.max(6, ((visibleBottom - visibleTop) / spanY) * H));

    // Compute cluster centroids for expanded mode
    const clusterCentroids: Array<{ key: string; label: string; cx: number; cy: number }> = [];
    if (isMinimapExpanded) {
      const clusterPoints = new Map<string, Array<{ mx: number; my: number }>>();
      positions.forEach((p) => {
        const list = clusterPoints.get(p.clusterKey) || [];
        list.push({ mx: ((p.x - graphMinX) / spanX) * W, my: ((p.y - graphMinY) / spanY) * H });
        clusterPoints.set(p.clusterKey, list);
      });

      clusterPoints.forEach((pts, key) => {
        if (pts.length >= 2) {
          const avgX = pts.reduce((a, b) => a + b.mx, 0) / pts.length;
          const avgY = pts.reduce((a, b) => a + b.my, 0) / pts.length;
          const matched = clusters.find((c) => c.id === key);
          const matchedNode = celestialNodes.find((n) => n.clusterKey === key);
          const label = matchedNode?.clusterName || matched?.label || key.replace(/^comp_/, 'Sector ');
          clusterCentroids.push({ key, label, cx: avgX, cy: avgY });
        }
      });
    }

    const selectedPoint = mappedNodes.find((n) => n.id === selectedNode?.id) || null;

    return {
      nodes: mappedNodes,
      viewport: { x: vx, y: vy, w: vw, h: vh },
      bounds: { graphMinX, spanX, graphMinY, spanY },
      clusters: clusterCentroids,
      selectedPoint,
    };
  }, [celestialNodes, selectedNode, currentTransform, isMinimapExpanded, clusters, containerDimensions]);

  const handleMiniMapClick = useCallback(
    (clickX: number, clickY: number, width: number, height: number) => {
      if (!miniMapData.bounds || !svgRef.current || !zoomBehaviorRef.current) return;
      const { graphMinX, spanX, graphMinY, spanY } = miniMapData.bounds;
      const targetGraphX = graphMinX + (clickX / width) * spanX;
      const targetGraphY = graphMinY + (clickY / height) * spanY;

      const containerW = containerDimensions.width;
      const containerH = containerDimensions.height;
      const k = currentTransform.k || 1;
      const tx = containerW * 0.44 - targetGraphX * k;
      const ty = containerH * 0.48 - targetGraphY * k;

      svgRef.current
        .transition()
        .duration(500)
        .ease(d3.easeCubicOut)
        .call(zoomBehaviorRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
    },
    [miniMapData.bounds, currentTransform, containerDimensions]
  );

  return (
    <div
      className={`h-screen w-full relative text-[13px] leading-relaxed select-none overflow-hidden ${
        isFullscreen ? 'focused-view' : ''
      }`}
    >
      {/* Archival paper grain texture */}
      <div className="paper-grain" />

      {/* Celestial Archive Background with authentic copperplate celestial atlas engraving */}
      <div className="celestial-archive-bg">
        <div
          className="engraved-atlas-plate"
          style={{
            backgroundImage: `url(${celestialAtlasPlate})`,
            display: showAtlasPlate ? 'block' : 'none',
          }}
        />
        <svg
          ref={graticuleRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-[1]"
          style={{ display: showGraticule ? 'block' : 'none' }}
        />
      </div>

      {/* D3 Observatory Knowledge Constellation Graph */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full z-0" />

      {/* Honest Target Resolution Notification Banner (§10) */}
      {targetResolutionNotice && (
        <div className="absolute top-18 left-1/2 -translate-x-1/2 z-40 pointer-events-auto max-w-lg w-full px-4 animate-fade-in">
          <div className="card-surface p-3 border border-[var(--border-terracotta)] bg-[#FAF8F2] shadow-lg rounded-xl flex items-center justify-between gap-3 text-xs text-[var(--ink-primary)]">
            <div className="flex items-center gap-2.5">
              <i className="ph ph-warning-circle text-[var(--accent-terracotta)] text-base shrink-0" />
              <span>{targetResolutionNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setTargetResolutionNotice(null)}
              className="p-1 rounded text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-panel-subtle)] transition-colors cursor-pointer"
              title="Dismiss notice"
            >
              <i className="ph ph-x text-xs" />
            </button>
          </div>
        </div>
      )}

      {/* ================= FLOATING MINIMAL SEGMENTED TOP NAVIGATION (APPROVED DESIGN) ================= */}
      <header className="absolute top-4 left-6 right-6 z-30 flex items-center justify-between pointer-events-none select-none transition-all">
        {/* SEGMENT 1 (LEFT): Brand + Nav Links + Real Graph Actions */}
        <div className="flex items-center gap-2.5 bg-[#FAF8F2]/90 backdrop-blur-md border border-[var(--border-parchment)] shadow-sm rounded-full px-3.5 py-1.5 pointer-events-auto">
          {/* Logo & Identity */}
          <button
            type="button"
            onClick={() => onNavigateToDestination?.('overview')}
            className="flex items-center gap-2 group text-left focus:outline-none cursor-pointer"
            title="Hyades Overview"
          >
            <div className="w-6 h-6 rounded-full bg-[var(--accent-midnight)] text-[#FAF8F2] flex items-center justify-center shadow-xs border border-[#2D3F5E] group-hover:bg-[var(--accent-midnight-light)] transition-colors">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                className="transition-transform duration-700 group-hover:rotate-90"
              >
                <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2,2" strokeOpacity="0.4" />
                <circle cx="12" cy="12" r="5.5" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.7" />
                <path d="M 12 3.5 L 13.5 10.5 L 20.5 12 L 13.5 13.5 L 12 20.5 L 10.5 13.5 L 3.5 12 L 10.5 10.5 Z" fill="currentColor" />
                <circle cx="12" cy="12" r="1.5" fill="#FAF8F2" />
              </svg>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="serif text-base font-semibold tracking-tight text-[var(--ink-primary)] leading-none">
                Hyades
              </span>
              <span className="text-[9px] tracking-[0.2em] font-medium text-[var(--ink-secondary)] uppercase">
                Observatory
              </span>
            </div>
          </button>

          <div className="w-px h-3.5 bg-[var(--border-parchment)] mx-1" />

          {/* Navigation Links */}
          <nav aria-label="Main navigation" className="hidden md:flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigateToDestination?.('overview')}
              className="text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => onNavigateToDestination?.('library')}
              className="text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
            >
              Library
            </button>
            <button
              type="button"
              className="text-xs font-semibold text-[var(--accent-midnight)] flex items-center gap-1 cursor-pointer"
            >
              <span>Observatory</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-terracotta)]" />
            </button>
            <button
              type="button"
              onClick={() => onNavigateToDestination?.('stella')}
              className="text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
            >
              Stella
            </button>
          </nav>

          <div className="w-px h-3.5 bg-[var(--border-parchment)] mx-1" />

          {/* Real Actions: + Entity & Connect & More */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsEntityEditorOpen(true)}
              className="px-2.5 py-1 rounded-full bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] text-xs font-medium flex items-center gap-1 shadow-2xs transition-all active:scale-95 cursor-pointer"
              title="Add Entity to Knowledge Sky (A)"
            >
              <i className="ph ph-plus text-xs text-[var(--accent-brass)]" />
              <span>+ Entity</span>
            </button>

            <button
              type="button"
              onClick={() => setIsRelationshipEditorOpen(true)}
              className="px-2.5 py-1 rounded-full bg-white hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-strong)] text-xs font-medium text-[var(--ink-primary)] flex items-center gap-1 shadow-2xs transition-all active:scale-95 cursor-pointer"
              title="Connect Two Entities (C)"
            >
              <i className="ph ph-arrows-split text-xs text-[var(--accent-terracotta)]" />
              <span>Connect</span>
            </button>

            {/* Compact More Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMoreMenuOpen((prev) => !prev)}
                className="w-6 h-6 rounded-full bg-white hover:bg-[var(--bg-panel-subtle)] border border-[var(--border-strong)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
                title="More Graph Actions"
              >
                <i className="ph-bold ph-dots-three-vertical text-xs" />
              </button>

              {isMoreMenuOpen && (
                <div className="absolute left-0 mt-2 w-48 bg-white border border-[var(--border-strong)] rounded-xl shadow-lg py-1.5 z-50 text-xs animate-fade-in">
                  <button
                    type="button"
                    onClick={() => {
                      handleUntangle();
                      setIsMoreMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-panel-subtle)] flex items-center gap-2 text-[var(--ink-primary)] cursor-pointer"
                  >
                    <i className="ph-bold ph-magic-wand text-xs text-[var(--accent-terracotta)]" />
                    <span>Untangle / Organize (U)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSuggestionsOpen(true);
                      setIsMoreMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-panel-subtle)] flex items-center gap-2 text-[var(--ink-primary)] cursor-pointer"
                  >
                    <i className="ph ph-sparkle text-xs text-[var(--accent-terracotta)]" />
                    <span>Link Suggestions</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAtlasPlate((p) => !p);
                      setIsMoreMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-panel-subtle)] flex items-center gap-2 text-[var(--ink-primary)] cursor-pointer"
                  >
                    <i className="ph ph-newspaper text-xs text-[var(--accent-midnight)]" />
                    <span>{showAtlasPlate ? 'Hide Atlas Plate' : 'Show Atlas Plate'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowGraticule((p) => !p);
                      setIsMoreMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-panel-subtle)] flex items-center gap-2 text-[var(--ink-primary)] cursor-pointer"
                  >
                    <i className="ph ph-grid-four text-xs text-[var(--accent-brass)]" />
                    <span>{showGraticule ? 'Hide Coordinates' : 'Show Coordinates'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SEGMENT 2 (CENTER): Compact Focused Coordinate HUD Capsule */}
        <div className="hidden lg:flex items-center pointer-events-auto">
          {selectedNode ? (
            <div className="bg-[#FAF8F2]/90 backdrop-blur-md border border-[var(--border-parchment)] shadow-sm rounded-full px-3.5 py-1.5 flex items-center gap-2.5">
              <div
                className={`w-2 h-2 rounded-full ${
                  selectedNode.hierarchy === 'core'
                    ? 'bg-[var(--accent-terracotta)] animate-pulse'
                    : selectedNode.hierarchy === 'subtopic'
                    ? 'bg-[var(--accent-brass)]'
                    : 'bg-[var(--accent-midnight)]'
                }`}
              />
              <span className="serif text-xs font-semibold text-[var(--ink-primary)] leading-none max-w-[170px] truncate">
                {selectedNode.label}
              </span>
              <span className="w-px h-2.5 bg-[var(--border-parchment)]" />
              <span className="mono text-[10px] text-[var(--ink-tertiary)]">
                {selectedNode.coords}
              </span>
              <span className="mono text-[9px] text-[var(--accent-midnight)] bg-white px-1.5 py-0.5 rounded-full border border-[var(--border-parchment)] font-medium">
                {selectedNode.catalog}
              </span>
            </div>
          ) : (
            <div className="bg-[#FAF8F2]/80 backdrop-blur-md border border-[var(--border-parchment)] rounded-full px-3 py-1 text-xs text-[var(--ink-tertiary)] mono">
              Click a star to focus coordinates
            </div>
          )}
        </div>

        {/* SEGMENT 3 (RIGHT): Search Trigger & Fullscreen Controls */}
        <div className="flex items-center gap-2 bg-[#FAF8F2]/90 backdrop-blur-md border border-[var(--border-parchment)] shadow-sm rounded-full px-2.5 py-1.5 pointer-events-auto">
          {onOpenSearch && (
            <button
              type="button"
              onClick={onOpenSearch}
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full hover:bg-white text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
              title="Global Search (⌘K)"
            >
              <i className="ph ph-magnifying-glass text-xs" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="mono text-[9.5px] text-[var(--ink-tertiary)] ml-0.5">⌘K</kbd>
            </button>
          )}

          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="w-6 h-6 rounded-full hover:bg-white text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] flex items-center justify-center transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen / Focused View'}
            >
              <i
                className={`ph-bold ${
                  isFullscreen ? 'ph-corners-in' : 'ph-corners-out'
                } text-xs text-[var(--accent-terracotta)]`}
              />
            </button>
          )}
        </div>
      </header>

      {/* Honest Empty State when Workspace Graph is Empty */}
      {!isLoading && celestialNodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-auto bg-[#FAF8F2]/60 backdrop-blur-xs">
          <div className="instrument-panel max-w-md p-6 text-center flex flex-col items-center gap-3 bg-white/95 shadow-lg">
            <div className="panel-bracket-tl" />
            <div className="panel-bracket-br" />
            <div className="w-12 h-12 rounded-full bg-[var(--bg-panel-subtle)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--accent-terracotta)] text-xl mb-1">
              <i className="ph ph-compass" />
            </div>
            <h3 className="serif text-xl font-semibold text-[var(--ink-primary)]">
              The Knowledge Sky is Uncharted
            </h3>
            <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
              No concepts or relationships have been extracted yet in this workspace. Ingest notes or
              trigger extraction in the Library to illuminate the celestial atlas.
            </p>
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={() => onNavigateToDestination?.('library')}
                className="px-4 py-2 bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] text-xs font-medium rounded-lg flex items-center gap-2 shadow-2xs cursor-pointer transition-colors"
              >
                <i className="ph ph-books text-xs" />
                <span>Go to Library</span>
              </button>
              <button
                type="button"
                onClick={() => setIsEntityEditorOpen(true)}
                className="px-4 py-2 border border-[var(--border-strong)] hover:bg-[var(--bg-panel-subtle)] text-xs font-medium rounded-lg text-[var(--ink-primary)] flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <i className="ph ph-plus text-xs" />
                <span>+ Add Entity</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Reopen Left Edge Tab */}
      {!isLeftSidebarOpen && (
        <div id="reopen-left-sidebar" className="fixed top-18 left-0 z-30 pointer-events-auto">
          <button
            type="button"
            onClick={() => setIsLeftSidebarOpen(true)}
            className="bg-[var(--bg-panel)]/95 hover:bg-white backdrop-blur-md border border-l-0 border-[var(--border-strong)] rounded-r-xl shadow-md py-2 px-3 flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)] transition-all active:scale-95 group cursor-pointer"
            title="Expand Constellations Panel"
          >
            <svg
              className="w-4 h-4 text-[var(--accent-midnight)] group-hover:scale-110 transition-transform"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M9 3v18" />
              <path d="m11 9 3 3-3 3" />
            </svg>
            <span className="serif-italic font-medium">Constellations</span>
          </button>
        </div>
      )}

      {/* Persistent Reopen Right Edge Tab */}
      {!isRightSidebarOpen && selectedNode && (
        <div id="reopen-right-sidebar" className="fixed top-18 right-0 z-30 pointer-events-auto">
          <button
            type="button"
            onClick={() => setIsRightSidebarOpen(true)}
            className="bg-[var(--bg-panel)]/95 hover:bg-white backdrop-blur-md border border-r-0 border-[var(--border-strong)] rounded-l-xl shadow-md py-2 px-3 flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)] transition-all active:scale-95 group cursor-pointer"
            title="Expand Knowledge Dossier"
          >
            <span className="serif-italic font-medium">Dossier</span>
            <svg
              className="w-4 h-4 text-[var(--accent-midnight)] group-hover:scale-110 transition-transform"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M15 3v18" />
              <path d="m14 9-3 3 3 3" />
            </svg>
          </button>
        </div>
      )}

      {/* ================= LEFT SIDEBAR (CONSTELLATIONS & FILTERS) ================= */}
      {isLeftSidebarOpen && (
        <aside
          id="left-sidebar"
          className="sidebar-transition absolute top-18 left-6 w-[280px] max-h-[calc(100vh-140px)] z-10 flex flex-col pointer-events-none"
        >
          <div className="instrument-panel flex-1 flex flex-col pointer-events-auto overflow-hidden">
            <div className="panel-bracket-tl" />
            <div className="panel-bracket-br" />

            {/* Header with PanelLeftClose icon */}
            <div className="px-4 py-3 border-b border-[var(--border-parchment)] bg-[var(--bg-panel-subtle)] flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.2em] font-medium text-[var(--ink-secondary)] flex items-center gap-2">
                <i className="ph ph-compass-tool text-xs text-[var(--accent-midnight)]" />
                <span>Hyades Constellations</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsLeftSidebarOpen(false)}
                  className="w-6 h-6 rounded flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white transition-colors cursor-pointer"
                  title="Collapse Constellations Panel"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="18" x="3" y="3" rx="2" />
                    <path d="M9 3v18" />
                    <path d="m14 9-3 3 3 3" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              {/* Real Clusters / Constellations */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-[0.18em] font-medium text-[var(--ink-secondary)]">
                    Constellations ({clusters.length || celestialNodes.length})
                  </span>
                  {selectedClusterId && (
                    <button
                      type="button"
                      onClick={() => setSelectedClusterId(null)}
                      className="text-[10px] text-[var(--accent-terracotta)] hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {clusters.length > 0 ? (
                    clusters.map((cl) => {
                      const starCount = celestialNodes.filter(
                        (n) => n.clusterId === cl.id || n.clusterKey === cl.id
                      ).length;
                      return (
                        <button
                          key={cl.id}
                          type="button"
                          onClick={() =>
                            setSelectedClusterId(selectedClusterId === cl.id ? null : cl.id)
                          }
                          className={`w-full text-left p-2 rounded-lg border transition-all flex items-center justify-between cursor-pointer ${
                            selectedClusterId === cl.id
                              ? 'bg-white border-[var(--accent-terracotta)] shadow-2xs'
                              : 'hover:bg-white/80 border-transparent hover:border-[var(--border-parchment)]'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate min-w-0 flex-1">
                            <span className="w-2 h-2 rounded-full bg-[var(--accent-midnight)] shrink-0" />
                            <span className="text-xs font-medium text-[var(--ink-primary)] truncate">
                              {cl.label}
                            </span>
                          </div>
                          <span className="text-[10px] mono text-[var(--ink-tertiary)] shrink-0 ml-1.5">
                            {starCount} {starCount === 1 ? 'star' : 'stars'}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    celestialNodes.slice(0, 8).map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => setSelectedNode(n)}
                        className={`w-full text-left p-2 rounded-lg border transition-all flex items-center justify-between cursor-pointer ${
                          selectedNode?.id === n.id
                            ? 'bg-white border-[var(--accent-terracotta)] shadow-2xs'
                            : 'hover:bg-white/80 border-transparent hover:border-[var(--border-parchment)]'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              n.hierarchy === 'core'
                                ? 'bg-[var(--accent-terracotta)]'
                                : n.hierarchy === 'subtopic'
                                ? 'bg-[var(--accent-brass)]'
                                : 'bg-[var(--ink-secondary)]'
                            }`}
                          />
                          <span className="text-xs font-medium text-[var(--ink-primary)] truncate">
                            {n.label}
                          </span>
                        </div>
                        <span className="text-[10px] mono text-[var(--ink-tertiary)]">
                          {n.degree} links
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Constellation Filters */}
              <div className="pt-3 border-t border-[var(--border-parchment)]">
                <span className="text-[10px] uppercase tracking-[0.18em] font-medium text-[var(--ink-secondary)] mb-2 block">
                  Constellation Filters
                </span>

                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center justify-between py-1 cursor-pointer">
                    <span className="flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)]">
                      <svg width="12" height="12" viewBox="-8 -8 16 16" fill="var(--accent-terracotta)">
                        <path d="M 0 -8 L 2 -2 L 8 0 L 2 2 L 0 8 L -2 2 L -8 0 L -2 -2 Z" />
                      </svg>
                      Core Concepts
                    </span>
                    <input
                      type="checkbox"
                      checked={filterHubs}
                      onChange={(e) => setFilterHubs(e.target.checked)}
                      className="rounded accent-[var(--accent-midnight)] cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between py-1 cursor-pointer">
                    <span className="flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)]">
                      <svg width="10" height="10" viewBox="-5 -5 10 10" fill="var(--accent-brass)">
                        <path d="M 0 -4 Q 1 -1 4 0 Q 1 1 0 4 Q -1 1 -4 0 Q -1 -1 0 -4 Z" />
                      </svg>
                      Subtopics & Concepts
                    </span>
                    <input
                      type="checkbox"
                      checked={filterConcepts}
                      onChange={(e) => setFilterConcepts(e.target.checked)}
                      className="rounded accent-[var(--accent-midnight)] cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* ================= VERTICAL GRAPH CONTROLS (APPROVED DESIGN) ================= */}
      <div
        id="graph-controls"
        className={`absolute bottom-6 z-20 pointer-events-auto flex flex-col items-center gap-1 bg-[var(--bg-panel)]/95 backdrop-blur-md border border-[var(--border-strong)] rounded-xl p-1 shadow-sm w-9 transition-all duration-300 ${
          isRightSidebarOpen && selectedNode ? 'right-[416px]' : 'right-6'
        }`}
      >
        <button
          type="button"
          onClick={() => handleZoom(1.25)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
          title="Zoom In (+)"
        >
          <i className="ph-bold ph-plus text-xs" />
        </button>

        <button
          type="button"
          onClick={() => handleZoom(0.8)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
          title="Zoom Out (–)"
        >
          <i className="ph-bold ph-minus text-xs" />
        </button>

        <div className="w-4 h-px bg-[var(--border-parchment)] mx-auto my-0.5" />

        <button
          type="button"
          onClick={handleUntangle}
          data-testid="untangle-graph-btn"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--accent-terracotta)] transition-colors cursor-pointer"
          title="Untangle / Organize (U)"
        >
          <i className="ph-bold ph-magic-wand text-xs text-[var(--accent-terracotta)]" />
        </button>

        <button
          type="button"
          onClick={handleFitView}
          data-testid="fit-view-btn"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
          title="Fit View to Content (F)"
        >
          <i className="ph-bold ph-corners-out text-xs" />
        </button>

        <button
          type="button"
          onClick={() => setShowAtlasPlate((prev) => !prev)}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
            showAtlasPlate
              ? 'text-[var(--accent-midnight)] bg-[var(--bg-panel-subtle)]'
              : 'text-[var(--ink-tertiary)]'
          }`}
          title="Toggle Archival Atlas Plate"
        >
          <i className="ph-bold ph-newspaper-clipping text-xs" />
        </button>

        <button
          type="button"
          onClick={() => setShowGraticule((prev) => !prev)}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
            showGraticule
              ? 'text-[var(--accent-midnight)] bg-[var(--bg-panel-subtle)]'
              : 'text-[var(--ink-tertiary)]'
          }`}
          title="Toggle Celestial Coordinates"
        >
          <i className="ph-bold ph-grid-four text-xs" />
        </button>

        {onToggleFullscreen && (
          <>
            <div className="w-4 h-px bg-[var(--border-parchment)] mx-auto my-0.5" />
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit Focus View' : 'Focus / Fullscreen View'}
            >
              <i
                className={`ph-bold ${
                  isFullscreen ? 'ph-corners-in' : 'ph-corners-out'
                } text-xs text-[var(--accent-terracotta)]`}
              />
            </button>
          </>
        )}
      </div>

      {/* ================= RIGHT KNOWLEDGE DOSSIER PANEL (EXTENDS UPWARD) ================= */}
      {isRightSidebarOpen && selectedNode && (
        <aside
          id="right-sidebar"
          className="sidebar-transition absolute top-4 right-6 bottom-6 w-[390px] z-20 flex flex-col pointer-events-none"
        >
          <div className="instrument-panel flex-1 flex flex-col pointer-events-auto overflow-hidden shadow-lg border border-[var(--border-strong)] bg-white/95">
            <div className="panel-bracket-tl" />
            <div className="panel-bracket-br" />

            {/* Panel Header */}
            <div className="p-6 border-b border-[var(--border-parchment)] bg-white relative">
              <button
                type="button"
                onClick={() => setIsRightSidebarOpen(false)}
                className="absolute top-5 right-5 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
                title="Collapse Knowledge Dossier"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M15 3v18" />
                  <path d="m10 9 3 3-3 3" />
                </svg>
              </button>

              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-panel-subtle)] text-[10px] text-[var(--ink-secondary)] font-semibold tracking-wider uppercase mono mb-3">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    selectedNode.hierarchy === 'core'
                      ? 'bg-[var(--accent-terracotta)]'
                      : selectedNode.hierarchy === 'subtopic'
                      ? 'bg-[var(--accent-brass)]'
                      : 'bg-[var(--accent-midnight)]'
                  }`}
                />
                <span>
                  {selectedNode.hierarchy === 'core'
                    ? 'Primary Core Concept'
                    : selectedNode.hierarchy === 'subtopic'
                    ? 'Subtopic Dossier'
                    : 'Concept Star Dossier'}
                </span>
              </div>

              {/* Node Title */}
              <h2 className="serif text-3xl font-semibold text-[var(--ink-primary)] tracking-tight leading-tight mb-2">
                {selectedNode.label}
              </h2>

              {/* Context & Classification */}
              <div className="flex items-center gap-3 text-xs text-[var(--ink-secondary)]">
                <span className="flex items-center gap-1.5">
                  <i className="ph ph-compass text-[var(--accent-terracotta)]" />{' '}
                  {selectedNode.hierarchy === 'core'
                    ? 'Central Core'
                    : selectedNode.hierarchy === 'subtopic'
                    ? 'Subtopic Node'
                    : 'Concept Star'}
                </span>
                <span className="w-1 h-1 rounded-full bg-[var(--border-strong)]" />
                <span className="mono text-[11px] text-[var(--accent-midnight)] font-medium">
                  {selectedNode.degree} Connections
                </span>
              </div>
            </div>

            {/* Scrollable Context & Connections */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              {/* Abstract */}
              <div>
                <p className="text-[13px] leading-relaxed text-[var(--ink-archival)]">
                  {selectedNode.desc}
                </p>
              </div>

              {/* Local Constellation Links */}
              <div>
                <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-1.5 mb-3">
                  <h3 className="serif-italic text-lg font-medium text-[var(--ink-primary)]">
                    Local Constellation
                  </h3>
                  <span className="text-[10px] mono text-[var(--ink-tertiary)]">
                    {selectedNode.connections.length} ACTIVE PATHWAYS
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {selectedNode.connections.length > 0 ? (
                    selectedNode.connections.map((conn) => (
                      <div
                        key={conn.id}
                        onClick={() => {
                          const target = celestialNodes.find((n) => n.id === conn.id);
                          if (target) setSelectedNode(target);
                        }}
                        className="card-surface p-2.5 flex items-center justify-between cursor-pointer group"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-terracotta)]" />
                          <div>
                            <div className="text-xs font-medium text-[var(--ink-primary)] group-hover:underline">
                              {conn.name}
                            </div>
                            <div className="text-[10px] text-[var(--ink-tertiary)] mono">
                              {conn.type}
                            </div>
                          </div>
                        </div>
                        <span className="mono text-[10px] text-[var(--ink-secondary)]">
                          {(parseFloat(conn.corr) * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 rounded-lg bg-[var(--bg-panel-subtle)] text-xs text-[var(--ink-tertiary)] italic">
                      No direct relationships recorded yet for this concept.
                    </div>
                  )}
                </div>
              </div>

              {/* Knowledge Health / Degree metrics */}
              <div className="bg-[var(--bg-panel-subtle)] p-3 rounded-lg border border-[var(--border-parchment)] text-xs">
                <div className="text-[10px] uppercase tracking-[0.2em] font-medium text-[var(--ink-secondary)] mb-2">
                  Knowledge Metrics
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] mono">
                  <div>
                    <span className="text-[var(--ink-tertiary)]">Catalog:</span>{' '}
                    <span className="text-[var(--ink-primary)]">{selectedNode.catalog}</span>
                  </div>
                  <div>
                    <span className="text-[var(--ink-tertiary)]">Degree:</span>{' '}
                    <span className="text-[var(--ink-primary)]">{selectedNode.degree}</span>
                  </div>
                  <div>
                    <span className="text-[var(--ink-tertiary)]">Notes:</span>{' '}
                    <span className="text-[var(--ink-primary)]">{selectedNode.noteCount}</span>
                  </div>
                  <div>
                    <span className="text-[var(--ink-tertiary)]">Cluster:</span>{' '}
                    <span className="text-[var(--ink-primary)]">Sector {selectedNode.group}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-[var(--border-parchment)] bg-white flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (onNavigateToStella) {
                    onNavigateToStella({
                      prompt: `Explain how the concept "${selectedNode.label}" connects to other topics in my knowledge base and what key insights are associated with it.`,
                      entityIds: [selectedNode.id],
                      entityNames: [selectedNode.label],
                    });
                  } else {
                    onNavigateToDestination?.('stella');
                  }
                }}
                className="flex-1 bg-[var(--accent-midnight)] text-[#FAF8F2] hover:bg-[var(--accent-midnight-light)] transition-colors py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
              >
                <i className="ph ph-sparkle text-[var(--accent-brass)]" />
                <span>Consult Stella on Concept</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateToDestination?.('library')}
                className="p-2 border border-[var(--border-strong)] rounded-lg text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-panel-subtle)] transition-colors cursor-pointer"
                title="View in Library"
              >
                <i className="ph ph-books text-sm" />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* ================= ASTRONOMICAL ORIENTATION AID (MINI CHART INSET) (§1.E, §8) ================= */}
      {celestialNodes.length > 0 && (
        <div
          id="celestial-orientation-inset"
          className={`absolute bottom-6 z-20 pointer-events-auto transition-all duration-300 ${
            isLeftSidebarOpen ? 'left-[304px]' : 'left-6'
          }`}
        >
          <div
            className={`instrument-panel bg-[#FAF8F2]/95 backdrop-blur-md border border-[var(--border-strong)] rounded-xl p-3 shadow-md flex flex-col gap-2 transition-all duration-300 ${
              isMinimapExpanded ? 'w-[364px]' : 'w-[146px]'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between text-[10px] mono uppercase tracking-[0.14em] text-[var(--ink-secondary)]">
              <span className="flex items-center gap-1.5 font-semibold">
                <i className="ph ph-compass text-[var(--accent-midnight)] text-xs" />
                {isMinimapExpanded ? 'Astronomical Sky Chart' : 'Chart Inset'}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-[var(--ink-tertiary)] mono">
                  {celestialNodes.length}★
                </span>
                <button
                  type="button"
                  onClick={() => setIsMinimapExpanded((prev) => !prev)}
                  className="p-1 rounded hover:bg-[var(--bg-panel-subtle)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
                  title={isMinimapExpanded ? 'Collapse chart inset' : 'Expand astronomical chart inset'}
                >
                  <i className={`ph ${isMinimapExpanded ? 'ph-arrows-in-simple' : 'ph-arrows-out-simple'} text-xs`} />
                </button>
              </div>
            </div>

            {isMinimapExpanded && (
              <div className="text-[10px] text-[var(--ink-tertiary)] flex items-center justify-between -mt-1 pb-1 border-b border-[var(--border-parchment)]">
                <span>Click region to pan camera</span>
                <span className="mono">Esc to close</span>
              </div>
            )}

            <svg
              className={`w-full rounded border border-[var(--border-parchment)] bg-[#F5F2E9]/70 cursor-crosshair transition-all duration-300 ${
                isMinimapExpanded ? 'h-[210px]' : 'h-[74px]'
              }`}
              viewBox={`0 0 ${isMinimapExpanded ? 340 : 126} ${isMinimapExpanded ? 210 : 74}`}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;
                handleMiniMapClick(
                  clickX,
                  clickY,
                  isMinimapExpanded ? 340 : 126,
                  isMinimapExpanded ? 210 : 74
                );
              }}
            >
              {/* Subtle astronomical grid graticules */}
              {isMinimapExpanded ? (
                <>
                  <circle cx="170" cy="105" r="95" fill="none" stroke="#4A3E3D" strokeOpacity="0.08" strokeDasharray="3,3" />
                  <circle cx="170" cy="105" r="55" fill="none" stroke="#4A3E3D" strokeOpacity="0.08" strokeDasharray="3,3" />
                  <line x1="170" y1="10" x2="170" y2="200" stroke="#4A3E3D" strokeOpacity="0.06" strokeDasharray="2,2" />
                  <line x1="15" y1="105" x2="325" y2="105" stroke="#4A3E3D" strokeOpacity="0.06" strokeDasharray="2,2" />
                </>
              ) : (
                <>
                  <circle cx="63" cy="37" r="30" fill="none" stroke="#4A3E3D" strokeOpacity="0.08" strokeDasharray="2,2" />
                  <circle cx="63" cy="37" r="16" fill="none" stroke="#4A3E3D" strokeOpacity="0.08" strokeDasharray="2,2" />
                </>
              )}

              {/* Cluster Labels in Expanded Mode */}
              {isMinimapExpanded &&
                miniMapData.clusters.map((c) => (
                  <text
                    key={c.key}
                    x={c.cx}
                    y={c.cy - 12}
                    textAnchor="middle"
                    fontFamily="Inter, sans-serif"
                    fontSize="9.5px"
                    fontWeight="600"
                    fill="var(--ink-secondary)"
                    opacity="0.85"
                    className="pointer-events-none uppercase tracking-wider"
                  >
                    {c.label.length > 18 ? c.label.slice(0, 16) + '...' : c.label}
                  </text>
                ))}

              {/* Plotted miniature nodes */}
              {miniMapData.nodes.map((n) => (
                <circle
                  key={n.id}
                  cx={n.mx}
                  cy={n.my}
                  r={n.r}
                  fill={n.color}
                  opacity={n.opacity}
                />
              ))}

              {/* Selected Entity Reticle Crosshairs */}
              {miniMapData.selectedPoint && (
                <g className="pointer-events-none">
                  <circle
                    cx={miniMapData.selectedPoint.mx}
                    cy={miniMapData.selectedPoint.my}
                    r={isMinimapExpanded ? 7 : 4.5}
                    fill="none"
                    stroke="#BD532B"
                    strokeWidth="1.2"
                  />
                  <line
                    x1={miniMapData.selectedPoint.mx - (isMinimapExpanded ? 11 : 7)}
                    y1={miniMapData.selectedPoint.my}
                    x2={miniMapData.selectedPoint.mx + (isMinimapExpanded ? 11 : 7)}
                    y2={miniMapData.selectedPoint.my}
                    stroke="#BD532B"
                    strokeWidth="1"
                  />
                  <line
                    x1={miniMapData.selectedPoint.mx}
                    y1={miniMapData.selectedPoint.my - (isMinimapExpanded ? 11 : 7)}
                    x2={miniMapData.selectedPoint.mx}
                    y2={miniMapData.selectedPoint.my + (isMinimapExpanded ? 11 : 7)}
                    stroke="#BD532B"
                    strokeWidth="1"
                  />
                </g>
              )}

              {/* Viewport Boundary Frame */}
              {miniMapData.viewport && (
                <rect
                  x={miniMapData.viewport.x}
                  y={miniMapData.viewport.y}
                  width={miniMapData.viewport.w}
                  height={miniMapData.viewport.h}
                  fill="rgba(189, 83, 43, 0.08)"
                  stroke="#BD532B"
                  strokeWidth={isMinimapExpanded ? '1.2' : '0.85'}
                  strokeDasharray="3,2"
                  rx="1"
                />
              )}
            </svg>
          </div>
        </div>
      )}

      {/* ================= BOTTOM SEARCH / FILTER BAR WITH PARTIAL MATCH CANDIDATES (§2) ================= */}
      <div
        id="search-bar-container"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto w-full max-w-md px-4"
      >
        <div className="relative">
          {/* Matching Candidates Popup */}
          {(isSearchFocused || searchQuery.trim().length > 0) && searchCandidates.length > 0 && (
            <div className="absolute bottom-full mb-2 left-0 right-0 bg-[#FAF8F2] border border-[var(--border-strong)] rounded-xl shadow-xl overflow-hidden z-30 animate-fade-in">
              <div className="px-3 py-1.5 border-b border-[var(--border-parchment)] bg-[var(--bg-panel-subtle)] text-[10px] mono text-[var(--ink-tertiary)] flex items-center justify-between">
                <span>{searchCandidates.length} candidate{searchCandidates.length > 1 ? 's' : ''} matched</span>
                <span>↑↓ navigate · ↵ select</span>
              </div>
              <div className="max-h-56 overflow-y-auto p-1 flex flex-col gap-0.5">
                {searchCandidates.map((candidate, idx) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onMouseDown={(e) => {
                      // onMouseDown fires before input onBlur
                      e.preventDefault();
                      handleSearchCommit(candidate);
                      setIsSearchFocused(false);
                    }}
                    onMouseEnter={() => setActiveCandidateIndex(idx)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                      activeCandidateIndex === idx
                        ? 'bg-[var(--accent-midnight)] text-[#FAF8F2]'
                        : 'hover:bg-white text-[var(--ink-primary)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          candidate.hierarchy === 'core'
                            ? 'bg-[var(--accent-terracotta)]'
                            : candidate.hierarchy === 'subtopic'
                            ? 'bg-[var(--accent-brass)]'
                            : 'bg-[var(--ink-tertiary)]'
                        }`}
                      />
                      <span className="serif text-xs font-medium truncate">
                        {candidate.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mono text-[10px] shrink-0 opacity-80">
                      <span>{candidate.catalog}</span>
                      <span>{candidate.degree} {candidate.degree === 1 ? 'link' : 'links'}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="instrument-panel bg-white/95 backdrop-blur-md px-3.5 py-2 shadow-lg border border-[var(--border-strong)] rounded-xl flex items-center gap-2.5">
            <i className="ph ph-magnifying-glass text-sm text-[var(--accent-midnight)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setActiveCandidateIndex(0);
              }}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => {
                // Delay so click on candidate registers
                setTimeout(() => setIsSearchFocused(false), 200);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (searchCandidates.length > 0) {
                    setActiveCandidateIndex((prev) => (prev + 1) % searchCandidates.length);
                  }
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (searchCandidates.length > 0) {
                    setActiveCandidateIndex((prev) => (prev - 1 + searchCandidates.length) % searchCandidates.length);
                  }
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (searchCandidates.length > 0 && searchCandidates[activeCandidateIndex]) {
                    handleSearchCommit(searchCandidates[activeCandidateIndex]);
                    setIsSearchFocused(false);
                  } else {
                    handleSearchCommit();
                    setIsSearchFocused(false);
                  }
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsSearchFocused(false);
                  setSearchQuery('');
                }
              }}
              placeholder="Search celestial constellation... (Type to explore, Enter to focus)"
              className="flex-1 bg-transparent border-none outline-none text-xs text-[var(--ink-primary)] placeholder:text-[var(--ink-tertiary)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setDebouncedSearchQuery('');
                }}
                className="text-xs text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)] cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Real Entity Editor Modal */}
      <EntityEditor
        workspaceId={workspaceId}
        isOpen={isEntityEditorOpen}
        onClose={() => setIsEntityEditorOpen(false)}
        onSave={() => {
          setIsEntityEditorOpen(false);
          fetchGraph();
        }}
      />

      {/* Real Relationship Editor Modal */}
      <RelationshipEditor
        workspaceId={workspaceId}
        isOpen={isRelationshipEditorOpen}
        availableEntities={celestialNodes.map((n) => ({ id: n.id, name: n.label }))}
        onClose={() => setIsRelationshipEditorOpen(false)}
        onSave={() => {
          setIsRelationshipEditorOpen(false);
          fetchGraph();
        }}
      />

      {/* Real Link Suggestion Panel */}
      <LinkSuggestionPanel
        workspaceId={workspaceId}
        isOpen={isSuggestionsOpen}
        onClose={() => setIsSuggestionsOpen(false)}
        onLinkCreated={() => fetchGraph()}
        onNavigateToNote={onNavigateToNote}
      />
    </div>
  );
};
