import * as d3 from 'd3';
import { GraphEdgeResponse, GraphNodeResponse } from '@/types/graph';

export interface CelestialNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  catalog: string;
  clusterKey: string;
  clusterName?: string;
  clusterId?: string;
  isPeripheralSingleton?: boolean;
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

export interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface ConstellationRegion {
  key: string;
  clusterId?: string;
  rawName: string;
  displayTitle: string;
  centroid: { x: number; y: number };
  halfW: number;
  halfH: number;
  bounds: BoundingBox;
  hullPath: string;
  titlePos: { x: number; y: number; width: number; height: number };
  nodeIds: string[];
  isPeripheralPool: boolean;
}

export interface NodeLabelPlacement {
  anchor: 'below' | 'above' | 'right' | 'left';
  dx: number;
  dy: number;
  textAnchor: 'middle' | 'start' | 'end';
  lines: string[];
  fontSize: number;
  lineHeight: number;
  width: number;
  height: number;
  bbox: BoundingBox;
}

export interface ResolvedClusterSummary {
  id: string;
  key: string;
  label: string;
  displayTitle: string;
  isDerived: boolean;
  isPeripheralPool: boolean;
}

export const POSITION_CACHE_VERSION = 'v7_celestial';

export function hashDeterministic(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getLinkEndpointIds(link: {
  source: string | { id: string };
  target: string | { id: string };
}): { sId: string; tId: string; pairKey: string } {
  const sId = typeof link.source === 'string' ? link.source : link.source.id;
  const tId = typeof link.target === 'string' ? link.target : link.target.id;
  const pairKey = sId <= tId ? `${sId}__${tId}` : `${tId}__${sId}`;
  return { sId, tId, pairKey };
}

/**
 * Computes a deterministic structural signature across nodes, their constellation
 * assignments, hierarchies, and undirected edge topology so stale cached layouts
 * (e.g. pre-clustering monolith positions) automatically invalidate when clusters
 * or relationships update, while remaining stable across rerenders and refreshes.
 */
export function computeLayoutSignature(
  nodes: Array<Pick<CelestialNode, 'id' | 'clusterKey' | 'hierarchy'>>,
  links: CelestialLink[]
): string {
  const nodeTokens = [...nodes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((n) => `${n.id}:${n.clusterKey}:${n.hierarchy}`)
    .join('|');
  const linkTokens = links
    .map((l) => getLinkEndpointIds(l).pairKey)
    .sort()
    .join('|');
  const h1 = hashDeterministic(nodeTokens).toString(36);
  const h2 = hashDeterministic(linkTokens).toString(36);
  return `${POSITION_CACHE_VERSION}_${nodes.length}_${links.length}_${h1}_${h2}`;
}

/**
 * Estimates rendered text width of an 18.5px Newsreader serif constellation header
 * accounting for narrow vs wide glyphs so brass star ornaments and cluster spacing match typography.
 */
export function estimateConstellationTitleTextWidth(title: string): number {
  let w = 0;
  for (const ch of title) {
    if ('iltjI.,:;!|\'" '.includes(ch)) w += 5.1;
    else if ('frt()-–—'.includes(ch)) w += 6.7;
    else if ('MWOQGCDHNUAVB'.includes(ch)) w += 12.6;
    else if (ch >= 'A' && ch <= 'Z') w += 10.6;
    else if ('mw'.includes(ch)) w += 13.0;
    else w += 8.9;
  }
  return Math.round(w);
}

/**
 * Formats a concise, editorial constellation header title from dynamic cluster names
 * without truncating mid-word or letting 60-char note titles collide across clusters.
 */
export function formatConstellationTitle(rawLabel: string, maxChars = 35): string {
  const cleaned = (rawLabel || 'Constellation').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) return cleaned;

  const candidate = cleaned.replace(/^(The|An|A)\s+/i, '');
  if (candidate.length <= maxChars) return candidate;

  // Prefer natural semantic clause breaks when the leading phrase is already descriptive
  const separators = [': ', ' — ', ' – ', ' - ', ' and ', ' & ', ', ', ' in ', ' for ', ' with '];
  for (const sep of separators) {
    const idx = candidate.toLowerCase().indexOf(sep.toLowerCase());
    if (idx >= 10 && idx <= maxChars) {
      return candidate.slice(0, idx).trim();
    }
  }

  const ofIdx = candidate.toLowerCase().indexOf(' of ');
  if (ofIdx >= 14 && ofIdx <= maxChars) {
    return candidate.slice(0, ofIdx).trim();
  }

  // Word-boundary truncation
  const words = candidate.split(' ');
  let acc = '';
  for (const w of words) {
    const next = acc ? `${acc} ${w}` : w;
    if (next.length > maxChars - 1) break;
    acc = next;
  }
  if (acc.length >= 8) {
    return `${acc}…`;
  }
  return `${candidate.slice(0, maxChars - 1).trimEnd()}…`;
}

/**
 * Wraps long multi-word sky labels onto at most 2 balanced lines.
 * Preserves a trailing space on line 1 when split across 2 <tspan> elements
 * so DOM textContent and exported SVG text remain space-separated.
 */
export function wrapSkyLabel(label: string, maxLineChars = 20, maxTotalChars = 42): string[] {
  const clean = (label || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [''];

  let working = clean;
  if (working.length > maxTotalChars) {
    const words = working.split(' ');
    let acc = '';
    for (const w of words) {
      const next = acc ? `${acc} ${w}` : w;
      if (next.length > maxTotalChars - 1) break;
      acc = next;
    }
    working = acc.length >= 12 ? `${acc}…` : `${working.slice(0, maxTotalChars - 1)}…`;
  }

  if (working.length <= maxLineChars || !working.includes(' ')) {
    return [working];
  }

  const words = working.split(' ');
  let bestSplit = 1;
  let bestDiff = Infinity;

  for (let i = 1; i < words.length; i++) {
    const l1 = words.slice(0, i).join(' ');
    const l2 = words.slice(i).join(' ');
    const diff = Math.abs(l1.length - l2.length) + (Math.max(l1.length, l2.length) > maxLineChars + 6 ? 12 : 0);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestSplit = i;
    }
  }

  const line1 = `${words.slice(0, bestSplit).join(' ')} `;
  const line2 = words.slice(bestSplit).join(' ');
  return [line1, line2];
}

export function estimateLabelMetrics(
  label: string,
  hierarchy: 'core' | 'subtopic' | 'related'
): { lines: string[]; fontSize: number; lineHeight: number; width: number; height: number } {
  const fontSize = hierarchy === 'core' ? 13.5 : hierarchy === 'subtopic' ? 11.5 : 10;
  const lineHeight = Math.round(fontSize * 1.18 * 10) / 10;
  const maxLineChars = 22;
  const lines = wrapSkyLabel(label, maxLineChars, 46);
  const maxChars = Math.max(...lines.map((l) => l.trim().length), 1);
  // Newsreader serif average character width ~0.55em + stroke halo padding
  const width = Math.max(28, Math.round(maxChars * fontSize * 0.56 + 10));
  const height = Math.round(lines.length * lineHeight + 4);
  return { lines, fontSize, lineHeight, width, height };
}

/**
 * Resolves constellation membership for all nodes using explicit backend clusters
 * (from both listClusters and graphData.clusters) and gracefully derives topic
 * constellations from connected components / community structure when cluster_id
 * metadata is absent, rather than collapsing unrelated topics into a single bucket.
 */
export function deriveObservatoryClusters(
  rawNodes: GraphNodeResponse[],
  validEdges: GraphEdgeResponse[],
  explicitClusters: Array<{ id: string; label: string }>
): {
  nodeClusterMap: Map<
    string,
    { key: string; name: string; clusterId?: string; isPeripheralSingleton?: boolean }
  >;
  resolvedClusters: ResolvedClusterSummary[];
} {
  const nodeClusterMap = new Map<
    string,
    { key: string; name: string; clusterId?: string; isPeripheralSingleton?: boolean }
  >();
  if (rawNodes.length === 0) {
    return { nodeClusterMap, resolvedClusters: [] };
  }

  const nodesById = new Map<string, GraphNodeResponse>();
  rawNodes.forEach((n) => nodesById.set(n.id, n));

  // Weighted adjacency for community & neighbor propagation
  const adj = new Map<string, Map<string, number>>();
  rawNodes.forEach((n) => adj.set(n.id, new Map()));
  validEdges.forEach((e) => {
    if (!nodesById.has(e.source_entity_id) || !nodesById.has(e.target_entity_id)) return;
    if (e.source_entity_id === e.target_entity_id) return;
    const w = typeof e.confidence === 'number' ? Math.max(0.1, e.confidence) : 0.85;
    const sMap = adj.get(e.source_entity_id)!;
    const tMap = adj.get(e.target_entity_id)!;
    sMap.set(e.target_entity_id, Math.max(sMap.get(e.target_entity_id) || 0, w));
    tMap.set(e.source_entity_id, Math.max(tMap.get(e.source_entity_id) || 0, w));
  });

  // 1. Register explicit cluster labels, plus synthesize labels for any cluster_id present on nodes
  const clusterLabelMap = new Map<string, string>();
  explicitClusters.forEach((c) => {
    if (c.id && c.label) {
      clusterLabelMap.set(c.id, c.label);
    }
  });

  const nodesByExplicitClusterId = new Map<string, GraphNodeResponse[]>();
  rawNodes.forEach((n) => {
    if (n.cluster_id) {
      const list = nodesByExplicitClusterId.get(n.cluster_id) || [];
      list.push(n);
      nodesByExplicitClusterId.set(n.cluster_id, list);
    }
  });

  nodesByExplicitClusterId.forEach((cNodes, cid) => {
    if (!clusterLabelMap.has(cid)) {
      const topHub = [...cNodes].sort((a, b) => {
        const dA = adj.get(a.id)?.size || 0;
        const dB = adj.get(b.id)?.size || 0;
        return dB * 10 + (b.note_count || 0) - (dA * 10 + (a.note_count || 0)) || a.id.localeCompare(b.id);
      })[0];
      clusterLabelMap.set(cid, topHub?.name || 'Constellation');
    }
  });

  // Assign nodes with explicit cluster_id
  const assignedClusterId = new Map<string, string>();
  rawNodes.forEach((n) => {
    if (n.cluster_id && clusterLabelMap.has(n.cluster_id)) {
      assignedClusterId.set(n.id, n.cluster_id);
    }
  });

  // 2. Propagate explicit clusters to directly connected unclustered nodes (up to 2 hops)
  for (let pass = 0; pass < 2; pass++) {
    const updates = new Map<string, string>();
    rawNodes.forEach((n) => {
      if (assignedClusterId.has(n.id)) return;
      const nbrs = adj.get(n.id);
      if (!nbrs || nbrs.size === 0) return;
      const scores = new Map<string, number>();
      nbrs.forEach((w, nbrId) => {
        const nbrCid = assignedClusterId.get(nbrId);
        if (nbrCid) {
          scores.set(nbrCid, (scores.get(nbrCid) || 0) + w);
        }
      });
      let bestCid: string | null = null;
      let bestScore = 0;
      scores.forEach((sc, cid) => {
        if (sc > bestScore || (sc === bestScore && bestCid && cid.localeCompare(bestCid) < 0)) {
          bestScore = sc;
          bestCid = cid;
        }
      });
      if (bestCid) {
        updates.set(n.id, bestCid);
      }
    });
    updates.forEach((cid, nid) => assignedClusterId.set(nid, cid));
    if (updates.size === 0) break;
  }

  assignedClusterId.forEach((cid, nid) => {
    nodeClusterMap.set(nid, {
      key: `cluster_${cid}`,
      name: clusterLabelMap.get(cid)!,
      clusterId: cid,
    });
  });

  // 3. Handle remaining unclustered nodes via connected components & community subdivision
  const unassignedIds = rawNodes.filter((n) => !nodeClusterMap.has(n.id)).map((n) => n.id);
  const unassignedSet = new Set(unassignedIds);
  const visited = new Set<string>();
  const singletons: string[] = [];

  const sortedUnassigned = [...unassignedIds].sort((a, b) => a.localeCompare(b));

  for (const startId of sortedUnassigned) {
    if (visited.has(startId)) continue;
    const comp: string[] = [];
    const queue = [startId];
    visited.add(startId);
    while (queue.length > 0) {
      const curr = queue.shift()!;
      comp.push(curr);
      const nbrs = adj.get(curr);
      if (nbrs) {
        Array.from(nbrs.keys())
          .sort()
          .forEach((nbrId) => {
            if (unassignedSet.has(nbrId) && !visited.has(nbrId)) {
              visited.add(nbrId);
              queue.push(nbrId);
            }
          });
      }
    }

    if (comp.length === 1 && (adj.get(comp[0])?.size || 0) === 0) {
      singletons.push(comp[0]);
      continue;
    }

    if (comp.length <= 18) {
      const topHubId = [...comp].sort((a, b) => {
        const nA = nodesById.get(a)!;
        const nB = nodesById.get(b)!;
        const dA = adj.get(a)?.size || 0;
        const dB = adj.get(b)?.size || 0;
        return dB * 10 + (nB.note_count || 0) - (dA * 10 + (nA.note_count || 0)) || a.localeCompare(b);
      })[0];
      const hubName = nodesById.get(topHubId)?.name || 'Constellation';
      const derivedKey = `derived_${topHubId}`;
      comp.forEach((nid) => {
        nodeClusterMap.set(nid, {
          key: derivedKey,
          name: hubName,
        });
      });
    } else {
      // Subdivide large unclustered monolith into coherent topic communities
      const subCommunities = partitionLargeComponent(comp, adj, nodesById);
      subCommunities.forEach((memberIds) => {
        const topHubId = [...memberIds].sort((a, b) => {
          const nA = nodesById.get(a)!;
          const nB = nodesById.get(b)!;
          const dA = adj.get(a)?.size || 0;
          const dB = adj.get(b)?.size || 0;
          return dB * 10 + (nB.note_count || 0) - (dA * 10 + (nA.note_count || 0)) || a.localeCompare(b);
        })[0];
        const hubName = nodesById.get(topHubId)?.name || 'Constellation';
        const derivedKey = `derived_${topHubId}`;
        memberIds.forEach((nid) => {
          nodeClusterMap.set(nid, {
            key: derivedKey,
            name: hubName,
          });
        });
      });
    }
  }

  // 4. Isolated unclustered singletons: keep calm peripheral pool without fake edges
  if (singletons.length > 0) {
    if (rawNodes.length === 1) {
      const onlyNode = nodesById.get(singletons[0])!;
      nodeClusterMap.set(singletons[0], {
        key: `derived_${onlyNode.id}`,
        name: onlyNode.name,
      });
    } else {
      singletons.forEach((nid) => {
        nodeClusterMap.set(nid, {
          key: 'cluster_uncharted_singletons',
          name: 'Uncharted Stars',
          isPeripheralSingleton: true,
        });
      });
    }
  }

  // 5. Build ordered resolved constellation summary list
  const seenKeys = new Map<string, ResolvedClusterSummary>();
  // Preserve explicit cluster ordering first
  explicitClusters.forEach((c) => {
    const key = `cluster_${c.id}`;
    const hasMembers = Array.from(nodeClusterMap.values()).some((v) => v.key === key);
    if (hasMembers && !seenKeys.has(key)) {
      seenKeys.set(key, {
        id: c.id,
        key,
        label: c.label,
        displayTitle: formatConstellationTitle(c.label),
        isDerived: false,
        isPeripheralPool: false,
      });
    }
  });

  nodeClusterMap.forEach((info) => {
    if (!seenKeys.has(info.key)) {
      seenKeys.set(info.key, {
        id: info.clusterId || info.key,
        key: info.key,
        label: info.name,
        displayTitle: formatConstellationTitle(info.name),
        isDerived: !info.clusterId,
        isPeripheralPool: Boolean(info.isPeripheralSingleton),
      });
    }
  });

  return {
    nodeClusterMap,
    resolvedClusters: Array.from(seenKeys.values()),
  };
}

function partitionLargeComponent(
  compIds: string[],
  adj: Map<string, Map<string, number>>,
  nodesById: Map<string, GraphNodeResponse>
): string[][] {
  const compSet = new Set(compIds);
  const targetK = Math.max(2, Math.min(12, Math.round(compIds.length / 8)));
  const ranked = [...compIds].sort((a, b) => {
    const dA = adj.get(a)?.size || 0;
    const dB = adj.get(b)?.size || 0;
    const ncA = nodesById.get(a)?.note_count || 0;
    const ncB = nodesById.get(b)?.note_count || 0;
    return dB * 10 + ncB - (dA * 10 + ncA) || a.localeCompare(b);
  });

  const seeds: string[] = [ranked[0]];
  const hopDistToSeeds = new Map<string, number>();
  compIds.forEach((id) => hopDistToSeeds.set(id, Infinity));

  const updateHopDistances = (newSeed: string) => {
    const q: Array<{ id: string; d: number }> = [{ id: newSeed, d: 0 }];
    hopDistToSeeds.set(newSeed, 0);
    while (q.length > 0) {
      const { id, d } = q.shift()!;
      const nbrs = adj.get(id);
      if (!nbrs) continue;
      nbrs.forEach((_w, nbrId) => {
        if (!compSet.has(nbrId)) return;
        if (d + 1 < (hopDistToSeeds.get(nbrId) ?? Infinity)) {
          hopDistToSeeds.set(nbrId, d + 1);
          q.push({ id: nbrId, d: d + 1 });
        }
      });
    }
  };

  updateHopDistances(seeds[0]);

  while (seeds.length < targetK) {
    let bestCandidate: string | null = null;
    let bestScore = -1;
    for (const candidate of ranked) {
      if (seeds.includes(candidate)) continue;
      const dist = hopDistToSeeds.get(candidate) ?? 0;
      if (dist < 2) continue;
      const deg = adj.get(candidate)?.size || 1;
      const score = Math.min(dist, 5) * 4 + Math.log2(deg + 1) * 3;
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }
    if (!bestCandidate) break;
    seeds.push(bestCandidate);
    updateHopDistances(bestCandidate);
  }

  // Initial Voronoi assignment to nearest seed
  const labelOf = new Map<string, string>();
  const seedSet = new Set(seeds);
  const bfsQueue: string[] = [];
  seeds.forEach((s) => {
    labelOf.set(s, s);
    bfsQueue.push(s);
  });

  while (bfsQueue.length > 0) {
    const curr = bfsQueue.shift()!;
    const currLabel = labelOf.get(curr)!;
    const nbrs = adj.get(curr);
    if (!nbrs) continue;
    Array.from(nbrs.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .forEach(([nbrId]) => {
        if (!compSet.has(nbrId) || labelOf.has(nbrId)) return;
        labelOf.set(nbrId, currLabel);
        bfsQueue.push(nbrId);
      });
  }

  // Synchronous weighted community refinement keeping seed hubs anchored
  for (let round = 0; round < 8; round++) {
    const nextLabels = new Map<string, string>(labelOf);
    const clusterCounts = new Map<string, number>();
    labelOf.forEach((lbl) => clusterCounts.set(lbl, (clusterCounts.get(lbl) || 0) + 1));

    for (const nid of ranked) {
      if (seedSet.has(nid)) continue;
      const nbrs = adj.get(nid);
      if (!nbrs || nbrs.size === 0) continue;
      const weights = new Map<string, number>();
      nbrs.forEach((w, nbrId) => {
        const lbl = labelOf.get(nbrId);
        if (!lbl) return;
        // Slight size penalty prevents one giant hub swallowing small topics
        const sizePenalty = 1 / Math.pow(clusterCounts.get(lbl) || 1, 0.15);
        weights.set(lbl, (weights.get(lbl) || 0) + w * sizePenalty);
      });
      let bestLbl = labelOf.get(nid)!;
      let bestW = -1;
      weights.forEach((w, lbl) => {
        if (w > bestW || (w === bestW && lbl.localeCompare(bestLbl) < 0)) {
          bestW = w;
          bestLbl = lbl;
        }
      });
      nextLabels.set(nid, bestLbl);
    }
    nextLabels.forEach((lbl, nid) => labelOf.set(nid, lbl));
  }

  const groups = new Map<string, string[]>();
  compIds.forEach((nid) => {
    const lbl = labelOf.get(nid) || seeds[0];
    const list = groups.get(lbl) || [];
    list.push(nid);
    groups.set(lbl, list);
  });
  return Array.from(groups.values());
}

/**
 * Standalone multi-ring cluster anchor helper (preserves unit-tested contract:
 * anchors > 300px from center and pairwise spacing > 350px for multi-cluster rings).
 */
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

  const sortedKeys = [...clusterKeys].sort((a, b) => {
    const sA = clusterSizes?.get(a) || 1;
    const sB = clusterSizes?.get(b) || 1;
    return sB - sA || a.localeCompare(b);
  });

  const goldenAngle = 2.3999632;
  const positions: Array<{ key: string; x: number; y: number; radius: number }> = [];

  sortedKeys.forEach((key, i) => {
    const seed = hashDeterministic(key);
    const size = clusterSizes?.get(key) || 6;
    const cBoundRadius = 140 + Math.sqrt(size) * 30;

    let rBase: number;
    if (n <= 4) {
      rBase = 380;
    } else if (n <= 8) {
      rBase = i < 3 ? 370 : 650;
    } else {
      rBase = i < 4 ? 370 : 720;
    }

    const rVar = ((seed % 50) - 25) * 0.8;
    const radius = Math.max(345, rBase + rVar);
    const angle = i * goldenAngle - Math.PI / 2;

    positions.push({
      key,
      x: centerX + Math.cos(angle) * radius * 1.12,
      y: centerY + Math.sin(angle) * radius * 0.92,
      radius: cBoundRadius,
    });
  });

  for (let it = 0; it < 55; it++) {
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const p1 = positions[i];
        const p2 = positions[j];
        let dx = p2.x - p1.x;
        let dy = p2.y - p1.y;
        let d = Math.hypot(dx, dy);
        const neededDist = Math.max(380, p1.radius + p2.radius + 95);
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
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const cdx = p.x - centerX;
      const cdy = p.y - centerY;
      const cd = Math.hypot(cdx, cdy);
      if (cd < 330 && cd > 0) {
        const scale = 330 / cd;
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

interface LocalClusterLayout {
  key: string;
  nodes: CelestialNode[];
  isPeripheralPool: boolean;
  localPositions: Map<string, { x: number; y: number }>;
  localMidX: number;
  localMidY: number;
  halfW: number;
  halfH: number;
}

function layoutSingleConstellationLocal(
  cKey: string,
  cNodes: CelestialNode[],
  internalLinks: CelestialLink[],
  isPeripheralPool: boolean
): LocalClusterLayout {
  const localPositions = new Map<string, { x: number; y: number }>();
  const sorted = [...cNodes].sort(
    (a, b) =>
      (b.degree || 0) * 10 +
      (b.noteCount || 0) * 3 -
      ((a.degree || 0) * 10 + (a.noteCount || 0) * 3) ||
      a.id.localeCompare(b.id)
  );

  if (sorted.length === 1) {
    localPositions.set(sorted[0].id, { x: 0, y: 0 });
    const lm = estimateLabelMetrics(sorted[0].label, sorted[0].hierarchy);
    return {
      key: cKey,
      nodes: sorted,
      isPeripheralPool,
      localPositions,
      localMidX: 0,
      localMidY: 0,
      halfW: Math.max(68, lm.width / 2 + 24),
      halfH: 58,
    };
  }

  // Quiet compact arrangement for isolated unclustered singletons
  if (isPeripheralPool) {
    const cols = Math.max(2, Math.ceil(Math.sqrt(sorted.length * 1.4)));
    sorted.forEach((n, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = (col - (cols - 1) / 2) * 92 + (row % 2 === 1 ? 24 : -12);
      const y = (row - (Math.ceil(sorted.length / cols) - 1) / 2) * 64;
      localPositions.set(n.id, { x, y });
    });
    return measureLocalCluster(cKey, sorted, isPeripheralPool, localPositions);
  }

  const cSeed = hashDeterministic(cKey);
  const baseAngle = ((cSeed % 360) * Math.PI) / 180;

  // Build weighted internal adjacency
  const localNodeIds = new Set(sorted.map((n) => n.id));
  const nodeById = new Map<string, CelestialNode>();
  sorted.forEach((n) => nodeById.set(n.id, n));

  const adj = new Map<string, Map<string, number>>();
  sorted.forEach((n) => adj.set(n.id, new Map()));
  internalLinks.forEach((l) => {
    const { sId, tId } = getLinkEndpointIds(l);
    if (!localNodeIds.has(sId) || !localNodeIds.has(tId) || sId === tId) return;
    const w = typeof l.weight === 'number' ? Math.max(0.15, Math.min(1, l.weight)) : 0.85;
    adj.get(sId)!.set(tId, Math.max(adj.get(sId)!.get(tId) || 0, w));
    adj.get(tId)!.set(sId, Math.max(adj.get(tId)!.get(sId) || 0, w));
  });

  // Primary Core star anchored at local (0, 0)
  const cores = sorted.filter((n) => n.hierarchy === 'core');
  const primaryCore = cores.length > 0 ? cores[0] : sorted[0];
  localPositions.set(primaryCore.id, { x: 0, y: 0 });

  // BFS tree rooted at primaryCore choosing strongest hierarchical parent
  const depthOf = new Map<string, number>([[primaryCore.id, 0]]);
  const parentOf = new Map<string, string>();
  const childrenOf = new Map<string, string[]>();
  sorted.forEach((n) => childrenOf.set(n.id, []));

  const bfsQueue: string[] = [primaryCore.id];
  while (bfsQueue.length > 0) {
    const curr = bfsQueue.shift()!;
    const currDepth = depthOf.get(curr)!;
    const nbrs = adj.get(curr)!;
    const orderedNbrs = Array.from(nbrs.entries()).sort((a, b) => {
      const nA = nodeById.get(a[0])!;
      const nB = nodeById.get(b[0])!;
      const rankA = nA.hierarchy === 'core' ? 3 : nA.hierarchy === 'subtopic' ? 2 : 1;
      const rankB = nB.hierarchy === 'core' ? 3 : nB.hierarchy === 'subtopic' ? 2 : 1;
      return rankB * 10 + b[1] * 5 + nB.degree - (rankA * 10 + a[1] * 5 + nA.degree) || a[0].localeCompare(b[0]);
    });

    for (const [nbrId] of orderedNbrs) {
      if (!depthOf.has(nbrId)) {
        depthOf.set(nbrId, currDepth + 1);
        parentOf.set(nbrId, curr);
        bfsQueue.push(nbrId);
      } else if (depthOf.get(nbrId) === currDepth + 1) {
        // Re-parent if curr is higher hierarchy or stronger weight than existing parent
        const prevParent = parentOf.get(nbrId)!;
        const prevNode = nodeById.get(prevParent)!;
        const currNode = nodeById.get(curr)!;
        const prevScore =
          (prevNode.hierarchy === 'subtopic' ? 2 : 1) + (adj.get(prevParent)?.get(nbrId) || 0.5);
        const currScore =
          (currNode.hierarchy === 'subtopic' ? 2 : 1) + (adj.get(curr)?.get(nbrId) || 0.5);
        if (currScore > prevScore + 0.05) {
          parentOf.set(nbrId, curr);
        }
      }
    }
  }

  // Attach any disconnected local sub-components within the same clusterKey as virtual branches of primaryCore
  const unreached = sorted.filter((n) => !depthOf.has(n.id));
  const unreachedSet = new Set(unreached.map((n) => n.id));
  const visitedUnreached = new Set<string>();

  for (const node of unreached) {
    if (visitedUnreached.has(node.id)) continue;
    const comp: CelestialNode[] = [];
    const q = [node.id];
    visitedUnreached.add(node.id);
    while (q.length > 0) {
      const cid = q.shift()!;
      comp.push(nodeById.get(cid)!);
      adj.get(cid)?.forEach((_w, nbrId) => {
        if (unreachedSet.has(nbrId) && !visitedUnreached.has(nbrId)) {
          visitedUnreached.add(nbrId);
          q.push(nbrId);
        }
      });
    }
    comp.sort((a, b) => (b.degree || 0) - (a.degree || 0) || a.id.localeCompare(b.id));
    const compRoot = comp[0];
    depthOf.set(compRoot.id, 1);
    parentOf.set(compRoot.id, primaryCore.id);
    for (let i = 1; i < comp.length; i++) {
      depthOf.set(comp[i].id, 2);
      parentOf.set(comp[i].id, compRoot.id);
    }
  }

  parentOf.forEach((pId, childId) => {
    childrenOf.get(pId)!.push(childId);
  });

  // Compute subtree sizes
  const subtreeSize = new Map<string, number>();
  const calcSubtree = (nid: string): number => {
    let total = 1;
    for (const ch of childrenOf.get(nid) || []) {
      total += calcSubtree(ch);
    }
    subtreeSize.set(nid, total);
    return total;
  };
  calcSubtree(primaryCore.id);

  // Order depth-1 branches around 360° so laterally linked branches sit adjacent
  const topBranches = [...(childrenOf.get(primaryCore.id) || [])];
  const branchRootOf = new Map<string, string>();
  const tagBranch = (nid: string, rootId: string) => {
    branchRootOf.set(nid, rootId);
    for (const ch of childrenOf.get(nid) || []) tagBranch(ch, rootId);
  };
  topBranches.forEach((b) => tagBranch(b, b));

  const branchAffinity = new Map<string, number>();
  internalLinks.forEach((l) => {
    const { sId, tId } = getLinkEndpointIds(l);
    const b1 = branchRootOf.get(sId);
    const b2 = branchRootOf.get(tId);
    if (b1 && b2 && b1 !== b2) {
      const k = b1 < b2 ? `${b1}__${b2}` : `${b2}__${b1}`;
      branchAffinity.set(k, (branchAffinity.get(k) || 0) + (l.weight || 0.8));
    }
  });

  const orderedBranches: string[] = [];
  if (topBranches.length > 0) {
    const rem = new Set(
      topBranches.sort(
        (a, b) => (subtreeSize.get(b) || 1) - (subtreeSize.get(a) || 1) || a.localeCompare(b)
      )
    );
    let curr = topBranches[0];
    orderedBranches.push(curr);
    rem.delete(curr);
    while (rem.size > 0) {
      let bestNext: string | null = null;
      let bestAff = -1;
      rem.forEach((cand) => {
        const k = curr < cand ? `${curr}__${cand}` : `${cand}__${curr}`;
        const aff = branchAffinity.get(k) || 0;
        if (aff > bestAff || (aff === bestAff && bestNext && cand.localeCompare(bestNext) < 0)) {
          bestAff = aff;
          bestNext = cand;
        }
      });
      curr = bestNext!;
      orderedBranches.push(curr);
      rem.delete(curr);
    }
  }

  // Place depth-1 branches across full 2*PI around primaryCore
  const branchWeights = orderedBranches.map((b) => Math.pow(subtreeSize.get(b) || 1, 0.72));
  const totalBranchWeight = branchWeights.reduce((acc, v) => acc + v, 0) || 1;

  let cursorAngle = baseAngle;
  const angleOf = new Map<string, number>([[primaryCore.id, baseAngle]]);

  orderedBranches.forEach((bId, idx) => {
    const wedge = (2 * Math.PI * branchWeights[idx]) / totalBranchWeight;
    const theta = cursorAngle + wedge * 0.5;
    cursorAngle += wedge;
    angleOf.set(bId, theta);

    const bNode = nodeById.get(bId)!;
    const edgeW = adj.get(primaryCore.id)?.get(bId);
    const isDisconnectedSub = edgeW === undefined;
    const wMod = 1.08 - 0.16 * (edgeW ?? 0.7);
    const seedJitter = ((hashDeterministic(bId) % 19) - 9) * 1.1;

    let r1: number;
    if (isDisconnectedSub) {
      r1 = 126 + seedJitter;
    } else if (bNode.hierarchy === 'subtopic' || bNode.hierarchy === 'core') {
      r1 = Math.max(112, 122 * wMod + seedJitter * 0.6);
    } else {
      // Stagger alternating depth-1 leaves slightly so adjacent labels never align horizontally
      r1 = Math.max(76, (88 + (idx % 2) * 18) * wMod + seedJitter * 0.5);
    }

    localPositions.set(bId, {
      x: Math.cos(theta) * r1,
      y: Math.sin(theta) * r1 * 0.9,
    });

    // Recursively place depth >= 2 descendants fanning outward from parent
    const placeDescendants = (parentId: string, parentAngle: number, availableWedge: number, depth: number) => {
      const kids = childrenOf.get(parentId) || [];
      if (kids.length === 0) return;
      const pPos = localPositions.get(parentId)!;
      const orderedKids = [...kids].sort(
        (a, b) => (subtreeSize.get(b) || 1) - (subtreeSize.get(a) || 1) || a.localeCompare(b)
      );

      const fanSpan = Math.min(
        Math.max(availableWedge * 0.92, Math.PI * 0.48),
        Math.PI * 1.1,
        0.48 * Math.max(1, orderedKids.length - 1)
      );

      orderedKids.forEach((kId, j) => {
        const normJ = orderedKids.length > 1 ? j / (orderedKids.length - 1) - 0.5 : 0;
        const childAngle = parentAngle + normJ * fanSpan;
        angleOf.set(kId, childAngle);
        const w = adj.get(parentId)?.get(kId) ?? 0.8;
        const distBase = depth === 2 ? 78 + (j % 2) * 12 : 68 + (j % 2) * 10;
        const rChild = distBase * (1.08 - 0.16 * w);

        localPositions.set(kId, {
          x: pPos.x + Math.cos(childAngle) * rChild,
          y: pPos.y + Math.sin(childAngle) * rChild * 0.92,
        });

        placeDescendants(kId, childAngle, fanSpan / Math.max(1, orderedKids.length), depth + 1);
      });
    };

    placeDescendants(bId, theta, wedge, 2);
  });

  // Precompute label half-widths for anisotropic collision avoidance
  const labelDims = new Map<string, { halfW: number; height: number; lines: number }>();
  sorted.forEach((n) => {
    const m = estimateLabelMetrics(n.label, n.hierarchy);
    labelDims.set(n.id, { halfW: m.width / 2, height: m.height, lines: m.lines.length });
  });

  const internalEdgesList: Array<{ u: string; v: string; w: number }> = [];
  internalLinks.forEach((l) => {
    const { sId, tId } = getLinkEndpointIds(l);
    if (localNodeIds.has(sId) && localNodeIds.has(tId) && sId !== tId) {
      const u = sId < tId ? sId : tId;
      const v = sId < tId ? tId : sId;
      internalEdgesList.push({
        u,
        v,
        w: typeof l.weight === 'number' ? Math.max(0.15, Math.min(1, l.weight)) : 0.85,
      });
    }
  });
  internalEdgesList.sort((a, b) => a.u.localeCompare(b.u) || a.v.localeCompare(b.v) || b.w - a.w);

  const maxClusterR = 120 + Math.sqrt(sorted.length) * 44;

  // Deterministic bounded force-relaxation inside constellation (primaryCore pinned at (0,0))
  for (let it = 0; it < 46; it++) {
    const alpha = 1 - it / 54;

    // 1. Relationship spring attraction (weighted so stronger edges stay closer)
    for (const edge of internalEdgesList) {
      const pU = localPositions.get(edge.u)!;
      const pV = localPositions.get(edge.v)!;
      const dx = pV.x - pU.x;
      const dy = pV.y - pU.y;
      const d = Math.hypot(dx, dy) || 1;

      const uNode = nodeById.get(edge.u)!;
      const vNode = nodeById.get(edge.v)!;
      const touchesCore = edge.u === primaryCore.id || edge.v === primaryCore.id;
      const touchesSub = uNode.hierarchy === 'subtopic' || vNode.hierarchy === 'subtopic';
      const baseIdeal = touchesCore ? (touchesSub ? 118 : 88) : 76;
      const ideal = baseIdeal * (1.12 - 0.22 * edge.w);

      const force = ((d - ideal) / d) * 0.14 * alpha;
      if (edge.u === primaryCore.id) {
        pV.x -= dx * force * 1.4;
        pV.y -= dy * force * 1.4;
      } else if (edge.v === primaryCore.id) {
        pU.x += dx * force * 1.4;
        pU.y += dy * force * 1.4;
      } else {
        pU.x += dx * force;
        pU.y += dy * force;
        pV.x -= dx * force;
        pV.y -= dy * force;
      }
    }

    // 2. Star glyph + label bounding-box repulsion
    for (let i = 0; i < sorted.length; i++) {
      const n1 = sorted[i];
      const p1 = localPositions.get(n1.id)!;
      const l1 = labelDims.get(n1.id)!;
      const pin1 = n1.id === primaryCore.id;

      for (let j = i + 1; j < sorted.length; j++) {
        const n2 = sorted[j];
        const p2 = localPositions.get(n2.id)!;
        const l2 = labelDims.get(n2.id)!;
        const pin2 = n2.id === primaryCore.id;

        let dx = p2.x - p1.x;
        let dy = p2.y - p1.y;
        let d = Math.hypot(dx, dy);
        if (d < 0.1) {
          dx = 1;
          dy = 0.3;
          d = Math.hypot(dx, dy);
        }

        const minRadial = n1.size + n2.size + 38;
        if (d < minRadial) {
          const push = ((minRadial - d) / d) * 0.42;
          if (pin1) {
            p2.x += dx * push * 1.8;
            p2.y += dy * push * 1.8;
          } else if (pin2) {
            p1.x -= dx * push * 1.8;
            p1.y -= dy * push * 1.8;
          } else {
            p1.x -= dx * push;
            p1.y -= dy * push;
            p2.x += dx * push;
            p2.y += dy * push;
          }
        }

        // Anisotropic horizontal label clearance when stars sit at similar Y
        const sepX = Math.min(138, l1.halfW + l2.halfW + 10);
        const sepY = 36 + (l1.lines > 1 || l2.lines > 1 ? 8 : 0);
        if (Math.abs(dx) < sepX && Math.abs(dy) < sepY) {
          const pushY = (sepY - Math.abs(dy)) * 0.18 * alpha * (dy >= 0 ? 1 : -1);
          const pushX = (sepX - Math.abs(dx)) * 0.08 * alpha * (dx >= 0 ? 1 : -1);
          if (pin1) {
            p2.y += pushY * 1.6;
            p2.x += pushX * 1.4;
          } else if (pin2) {
            p1.y -= pushY * 1.6;
            p1.x -= pushX * 1.4;
          } else {
            p1.y -= pushY;
            p2.y += pushY;
            p1.x -= pushX;
            p2.x += pushX;
          }
        }
      }
    }

    // 3. Node-to-edge segment clearance to avoid stars sitting directly on non-incident lines
    for (const edge of internalEdgesList) {
      const a = localPositions.get(edge.u)!;
      const b = localPositions.get(edge.v)!;
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const abLenSq = abx * abx + aby * aby;
      if (abLenSq < 16) continue;

      for (const n of sorted) {
        if (n.id === edge.u || n.id === edge.v || n.id === primaryCore.id) continue;
        const p = localPositions.get(n.id)!;
        const t = Math.max(0.12, Math.min(0.88, ((p.x - a.x) * abx + (p.y - a.y) * aby) / abLenSq));
        const projX = a.x + abx * t;
        const projY = a.y + aby * t;
        const rx = p.x - projX;
        const ry = p.y - projY;
        const dist = Math.hypot(rx, ry);
        const minEdgeClear = n.size + 18;
        if (dist < minEdgeClear) {
          const ux = dist > 0.1 ? rx / dist : -aby / Math.sqrt(abLenSq);
          const uy = dist > 0.1 ? ry / dist : abx / Math.sqrt(abLenSq);
          const push = (minEdgeClear - dist) * 0.3 * alpha;
          p.x += ux * push;
          p.y += uy * push;
        }
      }
    }

    // 4. Maintain core->subtopic orbital legibility and soft cluster radius containment
    for (const n of sorted) {
      if (n.id === primaryCore.id) {
        localPositions.set(n.id, { x: 0, y: 0 });
        continue;
      }
      const p = localPositions.get(n.id)!;
      const dCore = Math.hypot(p.x, p.y) || 1;

      if (n.hierarchy === 'subtopic' && parentOf.get(n.id) === primaryCore.id && dCore < 105) {
        const s = 105 / dCore;
        p.x *= s;
        p.y *= s;
      } else if (dCore > maxClusterR) {
        const s = maxClusterR / dCore;
        p.x *= s;
        p.y *= s;
      }

      const pId = parentOf.get(n.id);
      if (pId && pId !== primaryCore.id && (adj.get(n.id)?.size || 0) <= 2) {
        const parentPos = localPositions.get(pId)!;
        const dp = Math.hypot(p.x - parentPos.x, p.y - parentPos.y) || 1;
        if (dp > 126) {
          const s = 126 / dp;
          p.x = parentPos.x + (p.x - parentPos.x) * s;
          p.y = parentPos.y + (p.y - parentPos.y) * s;
        } else if (dp < 46) {
          const s = 46 / dp;
          p.x = parentPos.x + (p.x - parentPos.x) * s;
          p.y = parentPos.y + (p.y - parentPos.y) * s;
        }
      }
    }
  }

  return measureLocalCluster(cKey, sorted, isPeripheralPool, localPositions);
}

function measureLocalCluster(
  cKey: string,
  cNodes: CelestialNode[],
  isPeripheralPool: boolean,
  localPositions: Map<string, { x: number; y: number }>
): LocalClusterLayout {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  cNodes.forEach((n) => {
    const p = localPositions.get(n.id) || { x: 0, y: 0 };
    const lm = estimateLabelMetrics(n.label, n.hierarchy);
    const padX = Math.max(n.size + 28, lm.width * 0.48);
    const padTop = n.size + 24;
    const padBottom = n.size + lm.height + 18;
    if (p.x - padX < minX) minX = p.x - padX;
    if (p.x + padX > maxX) maxX = p.x + padX;
    if (p.y - padTop < minY) minY = p.y - padTop;
    if (p.y + padBottom > maxY) maxY = p.y + padBottom;
  });

  const rawTitle = cNodes[0]?.clusterName || cKey;
  const displayTitle = formatConstellationTitle(rawTitle);
  const titleHalfW = Math.round(estimateConstellationTitleTextWidth(displayTitle) / 2 + 26);

  // Extra top clearance for constellation title header above hull
  minY -= isPeripheralPool ? 10 : 30;

  const localMidX = (minX + maxX) / 2;
  const localMidY = (minY + maxY) / 2;
  const halfW = Math.max((maxX - minX) / 2, isPeripheralPool ? 60 : titleHalfW);
  const halfH = Math.max((maxY - minY) / 2, 62);

  return {
    key: cKey,
    nodes: cNodes,
    isPeripheralPool,
    localPositions,
    localMidX,
    localMidY,
    halfW,
    halfH,
  };
}

function orderRingByAffinity(
  keys: string[],
  affinity: Map<string, number>,
  centralKeys: string[]
): string[] {
  if (keys.length <= 2) return [...keys];
  const getAff = (a: string, b: string) => {
    const k = a < b ? `${a}__${b}` : `${b}__${a}`;
    return affinity.get(k) || 0;
  };

  const remaining = new Set(keys);
  // Start with cluster having strongest total cross-cluster affinity
  const start = [...keys].sort((a, b) => {
    const sumA = keys.reduce((s, o) => s + (o !== a ? getAff(a, o) : 0), 0);
    const sumB = keys.reduce((s, o) => s + (o !== b ? getAff(b, o) : 0), 0);
    return sumB - sumA || a.localeCompare(b);
  })[0];

  const ordered: string[] = [start];
  remaining.delete(start);

  while (remaining.size > 0) {
    const curr = ordered[ordered.length - 1];
    let best: string | null = null;
    let bestScore = -1;
    remaining.forEach((cand) => {
      const direct = getAff(curr, cand) * 10;
      const centralBonus = centralKeys.reduce((s, c) => s + getAff(cand, c), 0);
      const score = direct + centralBonus * 0.2;
      if (score > bestScore || (score === bestScore && best && cand.localeCompare(best) < 0)) {
        bestScore = score;
        best = cand;
      }
    });
    ordered.push(best!);
    remaining.delete(best!);
  }

  return ordered;
}

/**
 * Full constellation-aware, relationship-aware Observatory layout:
 * 1. Groups concepts by constellation membership.
 * 2. Computes internal relationship-driven asterism geometry per constellation.
 * 3. Measures exact constellation regions (stars + label dimensions + title headers).
 * 4. Packs constellations across a balanced celestial-atlas composition (central hub(s) +
 *    affinity-ordered surrounding ellipses) with strict bounding-box negative space.
 */
export function computeObservatoryLayout(
  nodes: CelestialNode[],
  links: CelestialLink[],
  centerX: number,
  centerY: number
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return result;

  const clusterGroups = new Map<string, CelestialNode[]>();
  nodes.forEach((n) => {
    const key = n.clusterKey || `grp_${n.group || 1}`;
    const list = clusterGroups.get(key) || [];
    list.push(n);
    clusterGroups.set(key, list);
  });

  const nodeClusterLookup = new Map<string, string>();
  nodes.forEach((n) => nodeClusterLookup.set(n.id, n.clusterKey || `grp_${n.group || 1}`));

  const internalLinksByCluster = new Map<string, CelestialLink[]>();
  const crossAffinity = new Map<string, number>();
  const crossWeightSumByCluster = new Map<string, number>();

  clusterGroups.forEach((_list, k) => {
    internalLinksByCluster.set(k, []);
    crossWeightSumByCluster.set(k, 0);
  });

  const sortedLinks = [...links].sort((a, b) => {
    const ea = getLinkEndpointIds(a);
    const eb = getLinkEndpointIds(b);
    const ka = ea.sId < ea.tId ? `${ea.sId}__${ea.tId}` : `${ea.tId}__${ea.sId}`;
    const kb = eb.sId < eb.tId ? `${eb.sId}__${eb.tId}` : `${eb.tId}__${eb.sId}`;
    return ka.localeCompare(kb) || (b.weight || 0) - (a.weight || 0);
  });

  sortedLinks.forEach((l) => {
    const { sId, tId } = getLinkEndpointIds(l);
    const c1 = nodeClusterLookup.get(sId);
    const c2 = nodeClusterLookup.get(tId);
    if (!c1 || !c2 || sId === tId) return;
    if (c1 === c2) {
      internalLinksByCluster.get(c1)!.push(l);
    } else {
      const w = typeof l.weight === 'number' ? Math.max(0.2, l.weight) : 0.85;
      const pk = c1 < c2 ? `${c1}__${c2}` : `${c2}__${c1}`;
      crossAffinity.set(pk, (crossAffinity.get(pk) || 0) + w);
      crossWeightSumByCluster.set(c1, (crossWeightSumByCluster.get(c1) || 0) + w);
      crossWeightSumByCluster.set(c2, (crossWeightSumByCluster.get(c2) || 0) + w);
    }
  });

  // Step 1: Local relationship-aware layout per constellation
  const localLayouts = new Map<string, LocalClusterLayout>();
  clusterGroups.forEach((cNodes, cKey) => {
    const isPeripheral = cNodes.every((n) => Boolean(n.isPeripheralSingleton));
    const local = layoutSingleConstellationLocal(
      cKey,
      cNodes,
      internalLinksByCluster.get(cKey) || [],
      isPeripheral
    );
    localLayouts.set(cKey, local);
  });

  // Single-constellation workspace: anchor primary core directly at (centerX, centerY)
  if (localLayouts.size === 1) {
    const only = Array.from(localLayouts.values())[0];
    only.localPositions.forEach((pos, id) => {
      result.set(id, {
        x: Math.round((centerX + pos.x) * 10) / 10,
        y: Math.round((centerY + pos.y) * 10) / 10,
      });
    });
    return result;
  }

  // Step 2: Rank constellations for celestial-atlas macro composition
  const allKeys = Array.from(localLayouts.keys());
  const mainKeys = allKeys
    .filter((k) => !localLayouts.get(k)!.isPeripheralPool)
    .sort((a, b) => {
      const lA = localLayouts.get(a)!;
      const lB = localLayouts.get(b)!;
      const scoreA = (crossWeightSumByCluster.get(a) || 0) * 4 + lA.nodes.length;
      const scoreB = (crossWeightSumByCluster.get(b) || 0) * 4 + lB.nodes.length;
      return scoreB - scoreA || a.localeCompare(b);
    });
  const peripheralKeys = allKeys.filter((k) => localLayouts.get(k)!.isPeripheralPool);

  // Visual center coordinates of each constellation region
  const regionCenters = new Map<string, { cx: number; cy: number }>();
  const aspectX = 1.42; // Matches 16:10 / unobstructed Observatory landscape viewport

  const mCount = mainKeys.length;
  if (mCount === 1) {
    regionCenters.set(mainKeys[0], { cx: centerX, cy: centerY });
  } else if (mCount === 2) {
    const l0 = localLayouts.get(mainKeys[0])!;
    const l1 = localLayouts.get(mainKeys[1])!;
    const sep = l0.halfW + l1.halfW + 90;
    regionCenters.set(mainKeys[0], { cx: centerX - sep * 0.55, cy: centerY - 22 });
    regionCenters.set(mainKeys[1], { cx: centerX + sep * 0.55, cy: centerY + 22 });
  } else if (mCount === 3) {
    const avgW = mainKeys.reduce((s, k) => s + localLayouts.get(k)!.halfW, 0) / 3;
    const avgH = mainKeys.reduce((s, k) => s + localLayouts.get(k)!.halfH, 0) / 3;
    const rx = avgW * 1.45 + 95;
    const ry = avgH * 1.3 + 80;
    const angles = [-Math.PI * 0.78, -Math.PI * 0.22, Math.PI * 0.5];
    mainKeys.forEach((k, i) => {
      regionCenters.set(k, {
        cx: centerX + Math.cos(angles[i]) * rx,
        cy: centerY + Math.sin(angles[i]) * ry,
      });
    });
  } else {
    // Celestial Atlas Composition: 1 central hub for 4..8 clusters, 2 central hubs for 9..15, concentric shells for 16+
    const centralCount = mCount >= 9 && mCount <= 15 ? 2 : 1;
    const centralKeys: string[] = [mainKeys[0]];

    if (centralCount === 2) {
      // Pick strongest cross-linked partner to mainKeys[0], or second most prominent constellation
      let partnerKey = mainKeys[1];
      let bestPartnerAff = -1;
      for (let i = 1; i < Math.min(mainKeys.length, 6); i++) {
        const cand = mainKeys[i];
        const pk = mainKeys[0] < cand ? `${mainKeys[0]}__${cand}` : `${cand}__${mainKeys[0]}`;
        const aff = crossAffinity.get(pk) || 0;
        if (aff > bestPartnerAff) {
          bestPartnerAff = aff;
          partnerKey = cand;
        }
      }
      centralKeys.push(partnerKey);
      const c0 = localLayouts.get(centralKeys[0])!;
      const c1 = localLayouts.get(centralKeys[1])!;
      const sep = (c0.halfW + c1.halfW + 96) * 0.52;
      regionCenters.set(centralKeys[0], { cx: centerX - sep, cy: centerY - 24 });
      regionCenters.set(centralKeys[1], { cx: centerX + sep, cy: centerY + 24 });
    } else {
      regionCenters.set(centralKeys[0], { cx: centerX, cy: centerY });
    }

    const centralSet = new Set(centralKeys);
    const ringPool = mainKeys.filter((k) => !centralSet.has(k));

    // Partition ringPool into shells (1 ring for <= 11 outer clusters, multi-shell for larger datasets)
    const shells: string[][] = [];
    if (ringPool.length <= 11) {
      shells.push(orderRingByAffinity(ringPool, crossAffinity, centralKeys));
    } else {
      let idx = 0;
      let cap = 7;
      while (idx < ringPool.length) {
        const slice = ringPool.slice(idx, idx + cap);
        shells.push(orderRingByAffinity(slice, crossAffinity, centralKeys));
        idx += cap;
        cap += 5;
      }
    }

    const centralExtentW =
      centralKeys.length === 2
        ? localLayouts.get(centralKeys[0])!.halfW + localLayouts.get(centralKeys[1])!.halfW + 95
        : localLayouts.get(centralKeys[0])!.halfW;
    const centralExtentH = Math.max(...centralKeys.map((k) => localLayouts.get(k)!.halfH));

    let prevRx = centralExtentW;
    let prevRy = centralExtentH;

    shells.forEach((shellKeys, sIdx) => {
      const count = shellKeys.length;
      const avgHalfW = shellKeys.reduce((s, k) => s + localLayouts.get(k)!.halfW, 0) / count;
      const avgHalfH = shellKeys.reduce((s, k) => s + localLayouts.get(k)!.halfH, 0) / count;

      // Perimeter needed so adjacent clusters on ellipse don't collide
      const minPerim = count * (Math.hypot(avgHalfW, avgHalfH) * 1.55 + 88);
      const rFromPerim = minPerim / (2 * Math.PI);

      const rx = Math.max(prevRx + avgHalfW + 105, rFromPerim * 1.18);
      const ry = Math.max(prevRy + avgHalfH + 92, rx / aspectX);

      const angleOffset = -Math.PI * 0.78 + sIdx * 0.28;
      shellKeys.forEach((k, i) => {
        const theta = angleOffset + (i / count) * 2 * Math.PI;
        regionCenters.set(k, {
          cx: centerX + Math.cos(theta) * rx,
          cy: centerY + Math.sin(theta) * ry,
        });
      });

      prevRx = rx + avgHalfW;
      prevRy = ry + avgHalfH;
    });
  }

  // Place peripheral singleton pool quietly at bottom-right outer edge if present
  peripheralKeys.forEach((pk, idx) => {
    let maxR = 260;
    regionCenters.forEach((c) => {
      const d = Math.hypot((c.cx - centerX) / aspectX, c.cy - centerY);
      if (d > maxR) maxR = d;
    });
    const ang = Math.PI * 0.24 + idx * 0.35;
    regionCenters.set(pk, {
      cx: centerX + Math.cos(ang) * (maxR + 180) * aspectX,
      cy: centerY + Math.sin(ang) * (maxR + 150),
    });
  });

  // Step 3: Exact Constellation Region Separation & Affinity Relaxation
  const orderedAllKeys = [...mainKeys, ...peripheralKeys];
  const interMarginX = 86;
  const interMarginY = 74;

  for (let it = 0; it < 75; it++) {
    const isFinalPass = it >= 58;

    // Pairwise elliptical/AABB separation guaranteeing clean negative space between constellations
    for (let i = 0; i < orderedAllKeys.length; i++) {
      const k1 = orderedAllKeys[i];
      const l1 = localLayouts.get(k1)!;
      const c1 = regionCenters.get(k1)!;

      for (let j = i + 1; j < orderedAllKeys.length; j++) {
        const k2 = orderedAllKeys[j];
        const l2 = localLayouts.get(k2)!;
        const c2 = regionCenters.get(k2)!;

        let dx = c2.cx - c1.cx;
        let dy = c2.cy - c1.cy;
        if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
          dx = 1;
          dy = 0.4;
        }

        const reqX = l1.halfW + l2.halfW + interMarginX;
        const reqY = l1.halfH + l2.halfH + interMarginY;
        const normD = Math.hypot(dx / reqX, dy / reqY);

        if (normD < 1.0) {
          const factor = ((1.0 - normD) / Math.max(0.05, normD)) * (isFinalPass ? 0.52 : 0.44);
          // Weight inversely by cluster size so large constellations stay steadier
          const w1 = l2.nodes.length / (l1.nodes.length + l2.nodes.length);
          const w2 = 1 - w1;
          c1.cx -= dx * factor * Math.max(0.35, w1);
          c1.cy -= dy * factor * Math.max(0.35, w1);
          c2.cx += dx * factor * Math.max(0.35, w2);
          c2.cy += dy * factor * Math.max(0.35, w2);
        } else if (!isFinalPass) {
          // Gentle cross-cluster affinity pull keeps linked constellations neighborly
          const pk = k1 < k2 ? `${k1}__${k2}` : `${k2}__${k1}`;
          const aff = crossAffinity.get(pk) || 0;
          if (aff > 0 && normD > 1.08) {
            const pull = Math.min(0.035, 0.015 * aff) * (normD - 1.06);
            c1.cx += dx * pull;
            c1.cy += dy * pull;
            c2.cx -= dx * pull;
            c2.cy -= dy * pull;
          }
        }
      }
    }

    // Gentle atlas cohesion toward (centerX, centerY) with landscape aspect balance
    if (!isFinalPass) {
      orderedAllKeys.forEach((k) => {
        if (localLayouts.get(k)!.isPeripheralPool) return;
        const c = regionCenters.get(k)!;
        c.cx += (centerX - c.cx) * 0.009;
        c.cy += (centerY - c.cy) * 0.013;
      });
    }
  }

  // Re-center overall atlas midpoint cleanly around (centerX, centerY)
  let atlasMinX = Infinity;
  let atlasMaxX = -Infinity;
  let atlasMinY = Infinity;
  let atlasMaxY = -Infinity;
  mainKeys.forEach((k) => {
    const c = regionCenters.get(k)!;
    const l = localLayouts.get(k)!;
    if (c.cx - l.halfW < atlasMinX) atlasMinX = c.cx - l.halfW;
    if (c.cx + l.halfW > atlasMaxX) atlasMaxX = c.cx + l.halfW;
    if (c.cy - l.halfH < atlasMinY) atlasMinY = c.cy - l.halfH;
    if (c.cy + l.halfH > atlasMaxY) atlasMaxY = c.cy + l.halfH;
  });
  const shiftX = Number.isFinite(atlasMinX) ? centerX - (atlasMinX + atlasMaxX) / 2 : 0;
  const shiftY = Number.isFinite(atlasMinY) ? centerY - (atlasMinY + atlasMaxY) / 2 : 0;

  // Step 4: Translate local node coordinates into world coordinates
  localLayouts.forEach((local, k) => {
    const center = regionCenters.get(k)!;
    const anchorX = center.cx + shiftX - local.localMidX;
    const anchorY = center.cy + shiftY - local.localMidY;

    local.localPositions.forEach((pos, id) => {
      result.set(id, {
        x: Math.round((anchorX + pos.x) * 10) / 10,
        y: Math.round((anchorY + pos.y) * 10) / 10,
      });
    });
  });

  return result;
}

/**
 * Computes organic celestial island contours and collision-free Constellation Title
 * coordinates for each visible constellation on the canvas.
 */
export function computeConstellationRegions(
  nodes: CelestialNode[],
  positions: Map<string, { x: number; y: number }>
): ConstellationRegion[] {
  const groups = new Map<string, CelestialNode[]>();
  nodes.forEach((n) => {
    const pos = positions.get(n.id) ?? (n.x !== undefined && n.y !== undefined ? { x: n.x, y: n.y } : null);
    if (!pos) return;
    const key = n.clusterKey || `grp_${n.group || 1}`;
    const list = groups.get(key) || [];
    list.push(n);
    groups.set(key, list);
  });

  const regions: ConstellationRegion[] = [];
  const lineGen = d3.line<[number, number]>().curve(d3.curveCatmullRomClosed.alpha(0.62));

  groups.forEach((cNodes, key) => {
    if (cNodes.length === 0) return;
    const isPeripheralPool = cNodes.every((n) => Boolean(n.isPeripheralSingleton));
    // Skip cloud contour if it's a single isolated unclustered star alongside other clusters
    if (isPeripheralPool && cNodes.length < 2 && groups.size > 1) return;

    const samplePoints: Array<[number, number]> = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let sumX = 0;
    let sumY = 0;

    cNodes.forEach((n) => {
      const p = positions.get(n.id) ?? { x: n.x ?? 0, y: n.y ?? 0 };
      sumX += p.x;
      sumY += p.y;
      const lm = estimateLabelMetrics(n.label, n.hierarchy);
      const rx = Math.max(n.size + 32, Math.min(72, lm.width * 0.45 + 14));
      const ryTop = n.size + 26;
      const ryBot = n.size + (n.hierarchy !== 'related' ? lm.height + 14 : 26);

      for (let a = 0; a < 10; a++) {
        const theta = (a / 10) * Math.PI * 2;
        const sinT = Math.sin(theta);
        const ry = sinT >= 0 ? ryBot : ryTop;
        const sx = p.x + Math.cos(theta) * rx;
        const sy = p.y + sinT * ry;
        samplePoints.push([sx, sy]);
        if (sx < minX) minX = sx;
        if (sx > maxX) maxX = sx;
        if (sy < minY) minY = sy;
        if (sy > maxY) maxY = sy;
      }
    });

    const cx = sumX / cNodes.length;
    const cy = sumY / cNodes.length;

    let hull = d3.polygonHull(samplePoints);
    if (!hull || hull.length < 3) {
      hull = [];
      for (let a = 0; a < 8; a++) {
        const theta = (a / 8) * Math.PI * 2;
        hull.push([cx + Math.cos(theta) * 52, cy + Math.sin(theta) * 42]);
      }
    }

    // Subdivide long straight hull edges slightly inward for organic celestial cloud lobes
    const sculpted: Array<[number, number]> = [];
    for (let i = 0; i < hull.length; i++) {
      const pA = hull[i];
      const pB = hull[(i + 1) % hull.length];
      sculpted.push(pA);
      const segLen = Math.hypot(pB[0] - pA[0], pB[1] - pA[1]);
      if (segLen > 125 && cNodes.length >= 3) {
        const mx = (pA[0] + pB[0]) / 2;
        const my = (pA[1] + pB[1]) / 2;
        const inX = mx + (cx - mx) * 0.06;
        const inY = my + (cy - my) * 0.06;
        sculpted.push([inX, inY]);
      }
    }

    const hullPath = isPeripheralPool ? '' : lineGen(sculpted) || '';
    const rawName = cNodes[0].clusterName || key;
    const displayTitle = formatConstellationTitle(rawName);
    const titleTextW = estimateConstellationTitleTextWidth(displayTitle);
    const titleWidth = Math.max(88, titleTextW + 44);
    const titleHeight = 24;
    const titleX = (minX + maxX) / 2;
    const titleY = minY - 12;

    regions.push({
      key,
      clusterId: cNodes[0].clusterId,
      rawName,
      displayTitle,
      centroid: { x: cx, y: cy },
      halfW: (maxX - minX) / 2,
      halfH: (maxY - minY) / 2,
      bounds: {
        minX: Math.min(minX, titleX - titleWidth / 2),
        maxX: Math.max(maxX, titleX + titleWidth / 2),
        minY: titleY - titleHeight / 2,
        maxY,
      },
      hullPath,
      titlePos: {
        x: titleX,
        y: titleY,
        width: titleWidth,
        height: titleHeight,
      },
      nodeIds: cNodes.map((n) => n.id),
      isPeripheralPool,
    });
  });

  return regions;
}

function boxesOverlapArea(a: BoundingBox, b: BoundingBox, pad = 0): number {
  const ox = Math.min(a.maxX + pad, b.maxX) - Math.max(a.minX - pad, b.minX);
  const oy = Math.min(a.maxY + pad, b.maxY) - Math.max(a.minY - pad, b.minY);
  if (ox <= 0 || oy <= 0) return 0;
  return ox * oy;
}

function segmentIntersectsBox(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  box: BoundingBox
): boolean {
  // Sample 3 interior points along chord for fast, accurate label-chord collision scoring
  for (const t of [0.28, 0.5, 0.72]) {
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    if (px >= box.minX - 3 && px <= box.maxX + 3 && py >= box.minY - 3 && py <= box.maxY + 3) {
      return true;
    }
  }
  return false;
}

/**
 * Multi-candidate (below / above / right / left) label placement accounting for
 * actual wrapped string dimensions, star glyphs, constellation titles, and edges.
 */
export function computeObservatoryLabelPlacements(
  nodes: CelestialNode[],
  links: CelestialLink[],
  positions: Map<string, { x: number; y: number }>,
  regions: ConstellationRegion[]
): Map<string, NodeLabelPlacement> {
  const placements = new Map<string, NodeLabelPlacement>();
  if (nodes.length === 0) return placements;

  const regionByCluster = new Map<string, ConstellationRegion>();
  regions.forEach((r) => regionByCluster.set(r.key, r));

  // Star glyph obstacle boxes
  const starBoxes: Array<{ id: string; box: BoundingBox }> = [];
  nodes.forEach((n) => {
    const p = positions.get(n.id) ?? { x: n.x ?? 0, y: n.y ?? 0 };
    const r = n.size + 5;
    starBoxes.push({
      id: n.id,
      box: { minX: p.x - r, maxX: p.x + r, minY: p.y - r, maxY: p.y + r },
    });
  });

  // Constellation title obstacle boxes
  const titleBoxes: BoundingBox[] = regions
    .filter((r) => !r.isPeripheralPool)
    .map((r) => ({
      minX: r.titlePos.x - r.titlePos.width / 2 - 6,
      maxX: r.titlePos.x + r.titlePos.width / 2 + 6,
      minY: r.titlePos.y - r.titlePos.height / 2 - 4,
      maxY: r.titlePos.y + r.titlePos.height / 2 + 4,
    }));

  // Intra-cluster edge segments for chord-crossing avoidance
  const nodeCluster = new Map<string, string>();
  nodes.forEach((n) => nodeCluster.set(n.id, n.clusterKey));
  const localSegments: Array<{ sId: string; tId: string; x1: number; y1: number; x2: number; y2: number }> = [];
  const sortedLinks = [...links].sort((a, b) => {
    const ea = getLinkEndpointIds(a);
    const eb = getLinkEndpointIds(b);
    const ka = ea.sId < ea.tId ? `${ea.sId}__${ea.tId}` : `${ea.tId}__${ea.sId}`;
    const kb = eb.sId < eb.tId ? `${eb.sId}__${eb.tId}` : `${eb.tId}__${eb.sId}`;
    return ka.localeCompare(kb) || (b.weight || 0) - (a.weight || 0);
  });

  sortedLinks.forEach((l) => {
    const { sId, tId } = getLinkEndpointIds(l);
    if (nodeCluster.get(sId) !== nodeCluster.get(tId)) return;
    const p1 = positions.get(sId);
    const p2 = positions.get(tId);
    if (p1 && p2) {
      localSegments.push({ sId, tId, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    }
  });

  // Prioritize Core > Subtopic > Related by connectivity
  const orderedNodes = [...nodes].sort((a, b) => {
    const tierA = a.hierarchy === 'core' ? 3 : a.hierarchy === 'subtopic' ? 2 : 1;
    const tierB = b.hierarchy === 'core' ? 3 : b.hierarchy === 'subtopic' ? 2 : 1;
    if (tierA !== tierB) return tierB - tierA;
    return (b.degree || 0) * 10 + (b.noteCount || 0) - ((a.degree || 0) * 10 + (a.noteCount || 0)) || a.id.localeCompare(b.id);
  });

  const placedLabelBoxes: Array<{ tier: number; box: BoundingBox }> = [];

  for (const d of orderedNodes) {
    const pos = positions.get(d.id) ?? { x: d.x ?? 0, y: d.y ?? 0 };
    const { lines, fontSize, lineHeight, width, height } = estimateLabelMetrics(d.label, d.hierarchy);
    const tierNum = d.hierarchy === 'core' ? 3 : d.hierarchy === 'subtopic' ? 2 : 1;
    const reg = regionByCluster.get(d.clusterKey);
    const outDx = reg ? pos.x - reg.centroid.x : 0;
    const outDy = reg ? pos.y - reg.centroid.y : 1;

    const candidates: Array<{
      anchor: 'below' | 'above' | 'right' | 'left';
      dx: number;
      dy: number;
      textAnchor: 'middle' | 'start' | 'end';
      bbox: BoundingBox;
      baseBias: number;
    }> = [
      {
        anchor: 'below',
        dx: 0,
        dy: d.size + 13,
        textAnchor: 'middle',
        bbox: {
          minX: pos.x - width / 2,
          maxX: pos.x + width / 2,
          minY: pos.y + d.size + 2,
          maxY: pos.y + d.size + 2 + height,
        },
        baseBias: outDy >= -10 ? 0 : 5,
      },
      {
        anchor: 'above',
        dx: 0,
        dy: -(d.size + 6 + (lines.length - 1) * lineHeight),
        textAnchor: 'middle',
        bbox: {
          minX: pos.x - width / 2,
          maxX: pos.x + width / 2,
          minY: pos.y - d.size - 4 - height,
          maxY: pos.y - d.size - 4,
        },
        baseBias: outDy < -15 ? 2 : 8,
      },
      {
        anchor: 'right',
        dx: d.size + 9,
        dy: 4 - ((lines.length - 1) * lineHeight) * 0.45,
        textAnchor: 'start',
        bbox: {
          minX: pos.x + d.size + 7,
          maxX: pos.x + d.size + 7 + width,
          minY: pos.y - height / 2,
          maxY: pos.y + height / 2,
        },
        baseBias: outDx > 15 ? 4 : 11,
      },
      {
        anchor: 'left',
        dx: -(d.size + 9),
        dy: 4 - ((lines.length - 1) * lineHeight) * 0.45,
        textAnchor: 'end',
        bbox: {
          minX: pos.x - d.size - 7 - width,
          maxX: pos.x - d.size - 7,
          minY: pos.y - height / 2,
          maxY: pos.y + height / 2,
        },
        baseBias: outDx < -15 ? 5 : 12,
      },
    ];

    let bestCand = candidates[0];
    let bestPenalty = Infinity;

    for (const cand of candidates) {
      let penalty = cand.baseBias;

      // Collisions with other stars
      for (const sb of starBoxes) {
        if (sb.id === d.id) continue;
        const area = boxesOverlapArea(cand.bbox, sb.box, 3);
        if (area > 0) penalty += 500 + area * 2.5;
      }

      // Collisions with constellation title headers
      for (const tb of titleBoxes) {
        const area = boxesOverlapArea(cand.bbox, tb, 4);
        if (area > 0) penalty += 700 + area * 3.0;
      }

      // Collisions with already-placed higher-priority labels
      for (const pl of placedLabelBoxes) {
        const area = boxesOverlapArea(cand.bbox, pl.box, 3);
        if (area > 0) {
          const weight = pl.tier >= 2 ? 2.2 : 0.8;
          penalty += (240 + area * 1.8) * weight;
        }
      }

      // Crossing internal relationship lines
      for (const seg of localSegments) {
        if (seg.sId !== d.id && seg.tId !== d.id) {
          if (segmentIntersectsBox(seg.x1, seg.y1, seg.x2, seg.y2, cand.bbox)) {
            penalty += 65;
          }
        } else if (segmentIntersectsBox(seg.x1, seg.y1, seg.x2, seg.y2, cand.bbox)) {
          penalty += 28;
        }
      }

      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestCand = cand;
      }
    }

    const chosen: NodeLabelPlacement = {
      anchor: bestCand.anchor,
      dx: Math.round(bestCand.dx * 10) / 10,
      dy: Math.round(bestCand.dy * 10) / 10,
      textAnchor: bestCand.textAnchor,
      lines,
      fontSize,
      lineHeight,
      width,
      height,
      bbox: bestCand.bbox,
    };

    placements.set(d.id, chosen);
    placedLabelBoxes.push({ tier: tierNum, box: bestCand.bbox });
  }

  return placements;
}

/**
 * Computes zoom-compensated scale factor for node labels so wide-overview text
 * stays legible without enlarging close-up labels.
 */
export function getNodeLabelZoomScale(k: number): number {
  const safeK = Math.max(0.2, k || 1);
  if (safeK >= 0.92) return 1.0;
  return Math.min(1.42, Math.pow(0.92 / safeK, 0.38));
}

export function getConstellationTitleZoomScale(k: number): number {
  const safeK = Math.max(0.2, k || 1);
  if (safeK >= 1.0) return Math.max(0.82, Math.pow(1 / safeK, 0.25));
  return Math.min(1.55, Math.pow(1 / safeK, 0.44));
}

/**
 * Determines which node labels should render at zoom `k` by combining progressive
 * semantic disclosure (`shouldShowNodeLabel`) with actual bounding-box overlap
 * culling so resting labels never pile on top of stars, constellation headers,
 * or higher-priority labels. Priority nodes (selected/hovered/connected) always show.
 */
export function computeVisibleLabelSet(
  nodes: CelestialNode[],
  positions: Map<string, { x: number; y: number }>,
  placements: Map<string, NodeLabelPlacement>,
  regions: ConstellationRegion[],
  k: number,
  priorityIds: Set<string>,
  visibleNodeIds: Set<string>
): Set<string> {
  const shown = new Set<string>();
  const labelScale = getNodeLabelZoomScale(k);
  const titleScale = getConstellationTitleZoomScale(k);

  const scaleLabelBox = (id: string, pl: NodeLabelPlacement): BoundingBox => {
    const pos = positions.get(id) ?? { x: 0, y: 0 };
    return {
      minX: pos.x + (pl.bbox.minX - pos.x) * labelScale,
      maxX: pos.x + (pl.bbox.maxX - pos.x) * labelScale,
      minY: pos.y + (pl.bbox.minY - pos.y) * labelScale,
      maxY: pos.y + (pl.bbox.maxY - pos.y) * labelScale,
    };
  };

  const occupied: BoundingBox[] = [];

  // Register visible constellation title boxes
  regions.forEach((r) => {
    if (r.isPeripheralPool) return;
    const hasVisibleMember = r.nodeIds.some((nid) => visibleNodeIds.has(nid));
    if (!hasVisibleMember) return;
    const hw = (r.titlePos.width * titleScale) / 2;
    const hh = (r.titlePos.height * titleScale) / 2;
    occupied.push({
      minX: r.titlePos.x - hw,
      maxX: r.titlePos.x + hw,
      minY: r.titlePos.y - hh,
      maxY: r.titlePos.y + hh,
    });
  });

  // 1. Always show priority nodes (selected, hovered, and direct neighbors)
  nodes.forEach((n) => {
    if (!visibleNodeIds.has(n.id)) return;
    if (priorityIds.has(n.id)) {
      shown.add(n.id);
      const pl = placements.get(n.id);
      if (pl) occupied.push(scaleLabelBox(n.id, pl));
    }
  });

  // 2. Evaluate non-priority nodes in hierarchy & degree order
  const ordered = nodes
    .filter((n) => visibleNodeIds.has(n.id) && !priorityIds.has(n.id))
    .sort((a, b) => {
      const tA = a.hierarchy === 'core' ? 3 : a.hierarchy === 'subtopic' ? 2 : 1;
      const tB = b.hierarchy === 'core' ? 3 : b.hierarchy === 'subtopic' ? 2 : 1;
      if (tA !== tB) return tB - tA;
      return (b.degree || 0) * 10 + (b.noteCount || 0) - ((a.degree || 0) * 10 + (a.noteCount || 0)) || a.id.localeCompare(b.id);
    });

  const starCores: Array<{ id: string; box: BoundingBox }> = nodes
    .filter((n) => visibleNodeIds.has(n.id))
    .map((n) => {
      const p = positions.get(n.id) ?? { x: n.x ?? 0, y: n.y ?? 0 };
      const r = Math.max(6, n.size * 0.75);
      return { id: n.id, box: { minX: p.x - r, maxX: p.x + r, minY: p.y - r, maxY: p.y + r } };
    });

  for (const d of ordered) {
    if (!shouldShowNodeLabel(d, k, false)) continue;
    const pl = placements.get(d.id);
    if (!pl) {
      shown.add(d.id);
      continue;
    }

    // At very close zoom (k >= 1.65), show all eligible labels
    if (k >= 1.65) {
      shown.add(d.id);
      continue;
    }

    const box = scaleLabelBox(d.id, pl);
    let collides = false;

    for (const occ of occupied) {
      if (boxesOverlapArea(box, occ, 2) > 0) {
        collides = true;
        break;
      }
    }

    if (!collides && d.hierarchy !== 'core') {
      for (const sc of starCores) {
        if (sc.id === d.id) continue;
        if (boxesOverlapArea(box, sc.box, 0) > 0) {
          collides = true;
          break;
        }
      }
    }

    if (!collides) {
      shown.add(d.id);
      occupied.push(box);
    }
  }

  return shown;
}

/**
 * Selects which cross-constellation links are displayed at the current zoom/focus state.
 * When cross-cluster density is moderate (<= 16), all cross-cluster links show by default.
 * When dense (> 16), shows the strongest primary bridge(s) per cluster pair at wide zoom
 * and reveals all secondary cross-cluster links upon zooming in (k >= 0.85) or hovering/selecting.
 */
export function selectVisibleCrossClusterLinkKeys(
  links: CelestialLink[],
  nodeLookup: Map<string, CelestialNode>,
  k: number,
  focusNodeIds: Set<string>,
  selectedClusterId: string | null,
  maxDefaultBridges = 16
): Set<string> {
  const allowed = new Set<string>();
  const crossLinks: Array<{ link: CelestialLink; pairKey: string; clusterPair: string; score: number }> = [];

  const sortedLinks = [...links].sort((a, b) => {
    const ea = getLinkEndpointIds(a);
    const eb = getLinkEndpointIds(b);
    const ka = ea.sId < ea.tId ? `${ea.sId}__${ea.tId}` : `${ea.tId}__${ea.sId}`;
    const kb = eb.sId < eb.tId ? `${eb.sId}__${eb.tId}` : `${eb.tId}__${eb.sId}`;
    return ka.localeCompare(kb) || (b.weight || 0) - (a.weight || 0);
  });

  sortedLinks.forEach((l) => {
    const { sId, tId, pairKey } = getLinkEndpointIds(l);
    const sNode = nodeLookup.get(sId);
    const tNode = nodeLookup.get(tId);
    const tier = l.tier || getEdgeTier(sNode, tNode);
    if (tier !== 'cross_cluster') return;

    const c1 = sNode?.clusterKey || '';
    const c2 = tNode?.clusterKey || '';
    const clusterPair = c1 <= c2 ? `${c1}__${c2}` : `${c2}__${c1}`;
    const tierBonus =
      (sNode?.hierarchy === 'core' ? 0.25 : sNode?.hierarchy === 'subtopic' ? 0.12 : 0) +
      (tNode?.hierarchy === 'core' ? 0.25 : tNode?.hierarchy === 'subtopic' ? 0.12 : 0);
    const score = (l.weight || 0.8) + tierBonus;
    crossLinks.push({ link: l, pairKey, clusterPair, score });

    if (
      k >= 0.85 ||
      focusNodeIds.has(sId) ||
      focusNodeIds.has(tId) ||
      Boolean(selectedClusterId)
    ) {
      allowed.add(pairKey);
    }
  });

  if (crossLinks.length <= maxDefaultBridges || k >= 0.85 || Boolean(selectedClusterId)) {
    crossLinks.forEach((item) => allowed.add(item.pairKey));
    return allowed;
  }

  // Group by unordered constellation pair and pick strongest bridge per pair first
  const byClusterPair = new Map<string, typeof crossLinks>();
  crossLinks.forEach((item) => {
    const list = byClusterPair.get(item.clusterPair) || [];
    list.push(item);
    byClusterPair.set(item.clusterPair, list);
  });

  byClusterPair.forEach((list) =>
    list.sort((a, b) => b.score - a.score || a.pairKey.localeCompare(b.pairKey))
  );

  const sortedGroups = Array.from(byClusterPair.values()).sort(
    (a, b) => b[0].score - a[0].score || a[0].pairKey.localeCompare(b[0].pairKey)
  );

  let budget = maxDefaultBridges;
  let depth = 0;
  while (budget > 0) {
    let addedInPass = false;
    for (const grp of sortedGroups) {
      if (depth < grp.length) {
        allowed.add(grp[depth].pairKey);
        budget--;
        addedInPass = true;
        if (budget <= 0) break;
      }
    }
    if (!addedInPass) break;
    depth++;
  }

  return allowed;
}

/**
 * Untangle is a LOCAL CLEANUP operation (§5).
 * Strictly preserves the overall constellation arrangement, cluster locations, and orientations.
 * Identifies local overlaps (distance < 68px) and label collisions,
 * and moves ONLY problematic nodes with tiny, damped radial pushes (clamped to max 35px).
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
    halfLabelW: estimateLabelMetrics(n.label, n.hierarchy).width / 2,
    pos: result.get(n.id)!,
    orig: originalPos.get(n.id)!,
  }));

  const minClearance = 68;
  const maxDisplacement = 35;

  for (let it = 0; it < 15; it++) {
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

        const labelSepX = Math.max(75, Math.min(125, nodeArray[i].halfLabelW + nodeArray[j].halfLabelW));
        if (Math.abs(dy) < 24 && Math.abs(dx) < labelSepX) {
          const pushY = (24 - Math.abs(dy)) * 0.25 * (dy >= 0 ? -1 : 1);
          p1.y += pushY;
          p2.y -= pushY;
        }
      }
    }

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
 * Generates an organic Bézier curve for constellation links.
 * Invariant to edge direction (A->B and B->A produce identical spatial curves).
 * When obstacleRegions are supplied for cross-cluster edges, deflects curves
 * around intermediate constellations through open negative whitespace.
 */
export function computeConstellationPath(
  d: {
    source: string | { id: string; x?: number; y?: number; clusterKey?: string };
    target: string | { id: string; x?: number; y?: number; clusterKey?: string };
    tier?: EdgeTier;
  },
  positions: Map<string, { x: number; y: number }>,
  posOverride?: Map<string, { x: number; y: number }>,
  obstacleRegions?: ConstellationRegion[],
  nodeClusterLookup?: Map<string, string>
): string {
  const sId = typeof d.source === 'object' ? d.source.id : d.source;
  const tId = typeof d.target === 'object' ? d.target.id : d.target;
  const sPos =
    posOverride?.get(sId) ??
    (typeof d.source === 'object' && d.source.x !== undefined && d.source.y !== undefined
      ? { x: d.source.x, y: d.source.y }
      : positions.get(sId));
  const tPos =
    posOverride?.get(tId) ??
    (typeof d.target === 'object' && d.target.x !== undefined && d.target.y !== undefined
      ? { x: d.target.x, y: d.target.y }
      : positions.get(tId));

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

  const ux = dx / dist;
  const uy = dy / dist;
  const nx = -uy;
  const ny = ux;

  const isCanonical = sId <= tId;
  const pairKey = isCanonical ? `${sId}:${tId}` : `${tId}:${sId}`;
  let hash = 0;
  for (let i = 0; i < pairKey.length; i++) {
    hash = ((hash << 5) - hash + pairKey.charCodeAt(i)) | 0;
  }
  const seed = Math.abs(hash);

  const sCluster =
    nodeClusterLookup?.get(sId) ?? (typeof d.source === 'object' ? d.source.clusterKey : undefined);
  const tCluster =
    nodeClusterLookup?.get(tId) ?? (typeof d.target === 'object' ? d.target.clusterKey : undefined);
  const isCrossCluster =
    d.tier === 'cross_cluster' || Boolean(sCluster && tCluster && sCluster !== tCluster);

  let bend: number;
  if (isCrossCluster && obstacleRegions && obstacleRegions.length > 0) {
    // Canonical chord frame so deflection is strictly invariant to edge direction
    const ax = isCanonical ? x1 : x2;
    const ay = isCanonical ? y1 : y2;
    const bx = isCanonical ? x2 : x1;
    const by = isCanonical ? y2 : y1;
    const cdx = bx - ax;
    const cdy = by - ay;
    const cnx = -cdy / dist;
    const cny = cdx / dist;

    let posSidePenalty = 0;
    let negSidePenalty = 0;
    let maxDeflectNeeded = 0;

    for (const reg of obstacleRegions) {
      if (reg.key === sCluster || reg.key === tCluster || reg.isPeripheralPool) continue;
      const rx = reg.centroid.x - ax;
      const ry = reg.centroid.y - ay;
      const along = (rx * cdx + ry * cdy) / (dist * dist);
      if (along < 0.1 || along > 0.9) continue;

      const perp = rx * cnx + ry * cny;
      const obsR = Math.max(reg.halfW, reg.halfH) * 0.85 + 32;
      if (Math.abs(perp) < obsR) {
        const intrusion = obsR - Math.abs(perp);
        if (perp >= 0) {
          posSidePenalty += intrusion;
        } else {
          negSidePenalty += intrusion;
        }
        if (intrusion + 36 > maxDeflectNeeded) {
          maxDeflectNeeded = intrusion + 36;
        }
      }
    }

    if (maxDeflectNeeded > 0) {
      const canonicalSign = posSidePenalty > negSidePenalty ? -1 : 1;
      const mag = Math.min(150, Math.max(38, maxDeflectNeeded));
      bend = mag * (isCanonical ? canonicalSign : -canonicalSign);
    } else {
      const baseCamber = Math.min(46, Math.max(14, dist * 0.1));
      const variation = 0.85 + ((seed % 31) / 100);
      const dir = seed % 2 === 0 ? 1 : -1;
      bend = baseCamber * variation * (isCanonical ? dir : -dir);
    }
  } else {
    const baseCamber = Math.min(26, Math.max(6, dist * 0.085));
    const variation = 0.75 + ((seed % 51) / 100);
    const dir = seed % 2 === 0 ? 1 : -1;
    const normalSign = isCanonical ? dir : -dir;
    bend = baseCamber * variation * normalSign;
  }

  const t1 = 0.3 + (((seed >> 2) % 9) / 100);
  const t2 = 0.64 + (((seed >> 5) % 9) / 100);

  const cx1 = x1 + dx * t1 + nx * bend * 0.9;
  const cy1 = y1 + dy * t1 + ny * bend * 0.9;
  const cx2 = x1 + dx * t2 + nx * bend * 0.9;
  const cy2 = y1 + dy * t2 + ny * bend * 0.9;

  return `M ${x1} ${y1} C ${cx1} ${cy1} ${cx2} ${cy2} ${x2} ${y2}`;
}

export function getEdgeTier(sNode?: CelestialNode, tNode?: CelestialNode): EdgeTier {
  if (!sNode || !tNode) return 'secondary';
  const isSameCluster = sNode.clusterKey === tNode.clusterKey;
  if (!isSameCluster) return 'cross_cluster';

  if (sNode.hierarchy === 'core' || tNode.hierarchy === 'core') {
    return 'level1';
  }
  if (
    (sNode.hierarchy === 'subtopic' && tNode.hierarchy === 'related') ||
    (tNode.hierarchy === 'subtopic' && sNode.hierarchy === 'related')
  ) {
    return 'level2_to_3';
  }
  return 'secondary';
}

export function getLinkStroke(tier: EdgeTier): string {
  switch (tier) {
    case 'level1':
      return '#B84E2A';
    case 'level2_to_3':
      return '#C49234';
    case 'secondary':
      return '#6E5F5A';
    case 'cross_cluster':
      return '#8E7E7A';
  }
}

export function getLinkOpacity(tier: EdgeTier): number {
  switch (tier) {
    case 'level1':
      return 0.58;
    case 'level2_to_3':
      return 0.44;
    case 'secondary':
      return 0.22;
    case 'cross_cluster':
      return 0.25;
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

export function shouldShowNodeLabel(
  d: CelestialNode,
  k: number,
  isPriority: boolean
): boolean {
  if (isPriority) return true;
  if (k < 0.72) {
    if (d.hierarchy === 'core') return true;
    if (d.hierarchy === 'subtopic' && ((d.degree || 0) >= 3 || (d.noteCount || 0) >= 2)) {
      return true;
    }
    return false;
  }
  if (k < 1.25) {
    if (d.hierarchy === 'core' || d.hierarchy === 'subtopic') return true;
    if ((d.degree || 0) >= 2 || (d.noteCount || 0) >= 1) return true;
    return false;
  }
  return true;
}
