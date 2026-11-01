import { describe, expect, it } from 'vitest';
import {
  BoundingBox,
  CelestialLink,
  CelestialNode,
  ConstellationRegion,
  computeConstellationPath,
  computeConstellationRegions,
  computeLayoutSignature,
  computeObservatoryLabelPlacements,
  computeObservatoryLayout,
  computeVisibleLabelSet,
  deriveObservatoryClusters,
  formatConstellationTitle,
  getNodeLabelZoomScale,
  selectVisibleCrossClusterLinkKeys,
  wrapSkyLabel,
} from './observatory_layout';
import { GraphEdgeResponse, GraphNodeResponse } from '@/types/graph';

function makeCelestialNode(
  id: string,
  label: string,
  clusterKey: string,
  hierarchy: 'core' | 'subtopic' | 'related',
  degree = 2,
  extra: Partial<CelestialNode> = {}
): CelestialNode {
  return {
    id,
    label,
    catalog: `HYA-${id.slice(0, 4).toUpperCase()}`,
    clusterKey,
    clusterName: extra.clusterName || clusterKey,
    group: 1,
    type: hierarchy === 'core' ? 'hub' : 'concept',
    hierarchy,
    size: hierarchy === 'core' ? 24 : hierarchy === 'subtopic' ? 16 : 9,
    coords: 'RA 04h DEC +15°',
    desc: '',
    degree,
    noteCount: hierarchy === 'core' ? 4 : 1,
    connections: [],
    ...extra,
  };
}

function boxesIntersect(a: BoundingBox, b: BoundingBox, margin = 0): boolean {
  return (
    a.minX + margin < b.maxX &&
    a.maxX - margin > b.minX &&
    a.minY + margin < b.maxY &&
    a.maxY - margin > b.minY
  );
}

describe('observatory_layout — Constellation-Aware Spatial Layout & Collision Handling', () => {
  it('produces deterministic coordinates across repeated runs and input permutations', () => {
    const nodes: CelestialNode[] = [
      makeCelestialNode('os-core', 'Operating Systems', 'cl-os', 'core', 5),
      makeCelestialNode('os-vm', 'Virtual Memory', 'cl-os', 'subtopic', 3),
      makeCelestialNode('os-iso', 'Process Isolation', 'cl-os', 'subtopic', 3),
      makeCelestialNode('os-mmu', 'Memory Management Unit', 'cl-os', 'related', 1),
      makeCelestialNode('ds-core', 'Distributed Systems', 'cl-ds', 'core', 4),
      makeCelestialNode('ds-crdt', 'Conflict-Free Replicated Data Types', 'cl-ds', 'subtopic', 3),
      makeCelestialNode('ds-sync', 'State Synchronization', 'cl-ds', 'related', 1),
    ];
    const links: CelestialLink[] = [
      { source: 'os-core', target: 'os-vm', weight: 0.92, type: 'manages' },
      { source: 'os-core', target: 'os-iso', weight: 0.88, type: 'enforces' },
      { source: 'os-vm', target: 'os-mmu', weight: 0.85, type: 'uses' },
      { source: 'ds-core', target: 'ds-crdt', weight: 0.9, type: 'implements' },
      { source: 'ds-crdt', target: 'ds-sync', weight: 0.82, type: 'enables' },
      { source: 'os-core', target: 'ds-core', weight: 0.75, type: 'supports', tier: 'cross_cluster' },
    ];

    const run1 = computeObservatoryLayout(nodes, links, 800, 500);
    const run2 = computeObservatoryLayout([...nodes].reverse(), [...links].reverse(), 800, 500);

    expect(run1.size).toBe(nodes.length);
    nodes.forEach((n) => {
      expect(run2.get(n.id)).toEqual(run1.get(n.id));
    });
  });

  it('separates 12 constellations (~93 nodes) into distinct non-overlapping regions with a populated central atlas zone', () => {
    const clusterCounts = [10, 10, 9, 9, 8, 8, 8, 7, 7, 6, 5, 4]; // 91 clustered + 2 isolated = 93 nodes
    const nodes: CelestialNode[] = [];
    const links: CelestialLink[] = [];

    clusterCounts.forEach((count, cIdx) => {
      const cKey = `cluster_topic_${cIdx + 1}`;
      const cName = `Constellation Topic ${cIdx + 1} Architecture`;
      const coreId = `c${cIdx}_n0`;
      nodes.push(makeCelestialNode(coreId, `Primary Hub ${cIdx + 1}`, cKey, 'core', count - 1, { clusterName: cName }));

      for (let i = 1; i < count; i++) {
        const nid = `c${cIdx}_n${i}`;
        const isSub = i <= Math.max(1, Math.floor(count * 0.28));
        nodes.push(
          makeCelestialNode(
            nid,
            isSub ? `Subtopic Domain ${cIdx + 1}-${i}` : `Concept Star ${cIdx + 1}-${i}`,
            cKey,
            isSub ? 'subtopic' : 'related',
            isSub ? 3 : 1,
            { clusterName: cName }
          )
        );

        if (isSub) {
          links.push({ source: coreId, target: nid, weight: 0.9, type: 'contains' });
        } else {
          const parentSubIdx = ((i - 1) % Math.max(1, Math.floor(count * 0.28))) + 1;
          const parentId = parentSubIdx < i ? `c${cIdx}_n${parentSubIdx}` : coreId;
          links.push({ source: parentId, target: nid, weight: 0.82, type: 'relates_to' });
        }
      }
    });

    // Add 2 isolated peripheral singletons (total = 93 nodes)
    nodes.push(
      makeCelestialNode('iso_1', 'Isolated Archival Note Alpha', 'cluster_uncharted_singletons', 'related', 0, {
        isPeripheralSingleton: true,
        clusterName: 'Uncharted Stars',
      }),
      makeCelestialNode('iso_2', 'Isolated Archival Note Beta', 'cluster_uncharted_singletons', 'related', 0, {
        isPeripheralSingleton: true,
        clusterName: 'Uncharted Stars',
      })
    );

    // Add 14 cross-constellation bridges
    for (let cIdx = 0; cIdx < 11; cIdx++) {
      links.push({
        source: `c${cIdx}_n0`,
        target: `c${cIdx + 1}_n0`,
        weight: 0.78,
        type: 'bridges',
        tier: 'cross_cluster',
      });
    }
    links.push(
      { source: 'c0_n1', target: 'c5_n0', weight: 0.72, type: 'bridges', tier: 'cross_cluster' },
      { source: 'c2_n0', target: 'c8_n1', weight: 0.7, type: 'bridges', tier: 'cross_cluster' },
      { source: 'c3_n1', target: 'c10_n0', weight: 0.68, type: 'bridges', tier: 'cross_cluster' }
    );

    expect(nodes.length).toBe(93);

    const positions = computeObservatoryLayout(nodes, links, 800, 500);
    expect(positions.size).toBe(93);

    // 1. Every star has finite coordinates and zero star-glyph collisions
    for (let i = 0; i < nodes.length; i++) {
      const p1 = positions.get(nodes[i].id)!;
      expect(Number.isFinite(p1.x)).toBe(true);
      expect(Number.isFinite(p1.y)).toBe(true);
      for (let j = i + 1; j < nodes.length; j++) {
        const p2 = positions.get(nodes[j].id)!;
        const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        expect(d).toBeGreaterThan(nodes[i].size + nodes[j].size + 12);
      }
    }

    // 2. Constellation node bounding boxes are strictly disjoint (no tangled cluster overlap)
    const clusterBoxes = new Map<string, BoundingBox>();
    nodes.forEach((n) => {
      if (n.isPeripheralSingleton) return;
      const p = positions.get(n.id)!;
      const cur = clusterBoxes.get(n.clusterKey) || {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
      };
      cur.minX = Math.min(cur.minX, p.x - n.size);
      cur.maxX = Math.max(cur.maxX, p.x + n.size);
      cur.minY = Math.min(cur.minY, p.y - n.size);
      cur.maxY = Math.max(cur.maxY, p.y + n.size);
      clusterBoxes.set(n.clusterKey, cur);
    });

    const boxEntries = Array.from(clusterBoxes.entries());
    expect(boxEntries.length).toBe(12);
    for (let i = 0; i < boxEntries.length; i++) {
      for (let j = i + 1; j < boxEntries.length; j++) {
        expect(boxesIntersect(boxEntries[i][1], boxEntries[j][1], -24)).toBe(false);
      }
    }

    // 3. Central atlas region is populated rather than leaving a giant central void
    const regions = computeConstellationRegions(nodes, positions).filter((r) => !r.isPeripheralPool);
    expect(regions.length).toBe(12);
    const minCentroidDistToCenter = Math.min(
      ...regions.map((r) => Math.hypot(r.centroid.x - 800, r.centroid.y - 500))
    );
    expect(minCentroidDistToCenter).toBeLessThan(430);
  });

  it('places strongly related concepts closer together and distributes branches around 360° instead of one-sided broomsticks', () => {
    const nodes: CelestialNode[] = [
      makeCelestialNode('core', 'Machine Learning', 'cl-ml', 'core', 5),
      makeCelestialNode('strong-nbr', 'Model Evaluation', 'cl-ml', 'related', 1),
      makeCelestialNode('sub-a', 'Transformers', 'cl-ml', 'subtopic', 3),
      makeCelestialNode('sub-b', 'Data Leakage', 'cl-ml', 'subtopic', 3),
      makeCelestialNode('sub-c', 'Gradient Boosting', 'cl-ml', 'subtopic', 2),
      makeCelestialNode('far-leaf', 'Positional Encoding Matrix', 'cl-ml', 'related', 1),
    ];
    const links: CelestialLink[] = [
      { source: 'core', target: 'strong-nbr', weight: 0.98, type: 'evaluates' },
      { source: 'core', target: 'sub-a', weight: 0.85, type: 'includes' },
      { source: 'core', target: 'sub-b', weight: 0.85, type: 'prevents' },
      { source: 'core', target: 'sub-c', weight: 0.85, type: 'includes' },
      { source: 'sub-a', target: 'far-leaf', weight: 0.35, type: 'uses' },
    ];

    const pos = computeObservatoryLayout(nodes, links, 800, 500);
    const pCore = pos.get('core')!;
    const pStrong = pos.get('strong-nbr')!;
    const pFarLeaf = pos.get('far-leaf')!;

    const distCoreStrong = Math.hypot(pStrong.x - pCore.x, pStrong.y - pCore.y);
    const distCoreFarLeaf = Math.hypot(pFarLeaf.x - pCore.x, pFarLeaf.y - pCore.y);
    expect(distCoreStrong).toBeLessThan(distCoreFarLeaf);

    // Branches fan around core rather than collapsing into a single quadrant
    const branchIds = ['strong-nbr', 'sub-a', 'sub-b', 'sub-c'];
    const xs = branchIds.map((id) => pos.get(id)!.x - pCore.x);
    const ys = branchIds.map((id) => pos.get(id)!.y - pCore.y);
    expect(Math.max(...xs)).toBeGreaterThan(20);
    expect(Math.min(...xs)).toBeLessThan(-20);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(80);
  });

  it('prevents label-label and label-title overlaps using multi-offset placement and bounding-box culling', () => {
    expect(
      formatConstellationTitle('Vector Embeddings and Approximate Nearest Neighbor Search in High Dimensions')
    ).toBe('Vector Embeddings');
    const wrapped = wrapSkyLabel('Approximate Nearest Neighbor Search', 22, 46);
    expect(wrapped.length).toBe(2);
    expect(wrapped.join('')).toBe('Approximate Nearest Neighbor Search');

    // Create tightly spaced constellation with long titles
    const nodes: CelestialNode[] = [
      makeCelestialNode('n1', 'Open Systems Interconnection Reference Model', 'cl-osi', 'core', 4, {
        clusterName: 'The OSI 7-Layer Reference Model and Network Encapsulation',
      }),
      makeCelestialNode('n2', 'International Organization for Standardization', 'cl-osi', 'subtopic', 3, {
        clusterName: 'The OSI 7-Layer Reference Model and Network Encapsulation',
      }),
      makeCelestialNode('n3', 'Transmission Control Protocol Stack', 'cl-osi', 'subtopic', 3, {
        clusterName: 'The OSI 7-Layer Reference Model and Network Encapsulation',
      }),
      makeCelestialNode('n4', 'Physical Signalling Layer Specification', 'cl-osi', 'related', 2, {
        clusterName: 'The OSI 7-Layer Reference Model and Network Encapsulation',
      }),
    ];
    // Force an intentionally tight vertical stack to stress-test 4-direction label offset selection
    const tightPositions = new Map<string, { x: number; y: number }>([
      ['n1', { x: 800, y: 500 }],
      ['n2', { x: 800, y: 530 }],
      ['n3', { x: 825, y: 500 }],
      ['n4', { x: 775, y: 500 }],
    ]);

    const regions = computeConstellationRegions(nodes, tightPositions);
    const placements = computeObservatoryLabelPlacements(nodes, [], tightPositions, regions);

    // At least one neighbor should choose a non-default ('above' | 'right' | 'left') anchor to escape n1's label/star
    const anchorsUsed = new Set(Array.from(placements.values()).map((p) => p.anchor));
    expect(anchorsUsed.size).toBeGreaterThan(1);

    // Visible label set at wide zoom (k = 0.55) must have ZERO pairwise label AABB overlaps
    const k = 0.55;
    const visibleIds = new Set(nodes.map((n) => n.id));
    const shown = computeVisibleLabelSet(
      nodes,
      tightPositions,
      placements,
      regions,
      k,
      new Set(),
      visibleIds
    );

    const scale = getNodeLabelZoomScale(k);
    const shownBoxes: BoundingBox[] = Array.from(shown).map((id) => {
      const p = tightPositions.get(id)!;
      const pl = placements.get(id)!;
      return {
        minX: p.x + (pl.bbox.minX - p.x) * scale,
        maxX: p.x + (pl.bbox.maxX - p.x) * scale,
        minY: p.y + (pl.bbox.minY - p.y) * scale,
        maxY: p.y + (pl.bbox.maxY - p.y) * scale,
      };
    });

    for (let i = 0; i < shownBoxes.length; i++) {
      for (let j = i + 1; j < shownBoxes.length; j++) {
        expect(boxesIntersect(shownBoxes[i], shownBoxes[j], 1)).toBe(false);
      }
    }
  });

  it('handles empty, single-node, asymmetric cluster sizes, and unclustered graphs cleanly', () => {
    // 1. Empty graph
    expect(computeObservatoryLayout([], [], 800, 500).size).toBe(0);

    // 2. Single-node graph
    const single = [makeCelestialNode('only', 'Lone Star', 'cl-1', 'core', 0)];
    const singlePos = computeObservatoryLayout(single, [], 800, 500);
    expect(singlePos.get('only')).toEqual({ x: 800, y: 500 });

    // 3. Asymmetric constellations: 1 large 26-node constellation + 4 small 3-node constellations
    const asymNodes: CelestialNode[] = [];
    const asymLinks: CelestialLink[] = [];
    asymNodes.push(makeCelestialNode('big_0', 'Large Hub', 'cl-big', 'core', 10));
    for (let i = 1; i < 26; i++) {
      const sub = i <= 5;
      asymNodes.push(makeCelestialNode(`big_${i}`, `Big Concept ${i}`, 'cl-big', sub ? 'subtopic' : 'related', sub ? 4 : 1));
      asymLinks.push({
        source: sub ? 'big_0' : `big_${((i - 1) % 5) + 1}`,
        target: `big_${i}`,
        weight: 0.85,
        type: 'rel',
      });
    }
    for (let s = 1; s <= 4; s++) {
      const ck = `cl-small-${s}`;
      asymNodes.push(makeCelestialNode(`sm${s}_0`, `Small Hub ${s}`, ck, 'core', 2));
      asymNodes.push(makeCelestialNode(`sm${s}_1`, `Small Leaf ${s}A`, ck, 'related', 1));
      asymNodes.push(makeCelestialNode(`sm${s}_2`, `Small Leaf ${s}B`, ck, 'related', 1));
      asymLinks.push(
        { source: `sm${s}_0`, target: `sm${s}_1`, weight: 0.88, type: 'rel' },
        { source: `sm${s}_0`, target: `sm${s}_2`, weight: 0.88, type: 'rel' }
      );
    }

    const asymPos = computeObservatoryLayout(asymNodes, asymLinks, 800, 500);
    const bigBox: BoundingBox = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (let i = 0; i < 26; i++) {
      const p = asymPos.get(`big_${i}`)!;
      bigBox.minX = Math.min(bigBox.minX, p.x);
      bigBox.maxX = Math.max(bigBox.maxX, p.x);
      bigBox.minY = Math.min(bigBox.minY, p.y);
      bigBox.maxY = Math.max(bigBox.maxY, p.y);
    }
    for (let s = 1; s <= 4; s++) {
      for (let m = 0; m < 3; m++) {
        const p = asymPos.get(`sm${s}_${m}`)!;
        const insideBig =
          p.x >= bigBox.minX - 30 &&
          p.x <= bigBox.maxX + 30 &&
          p.y >= bigBox.minY - 30 &&
          p.y <= bigBox.maxY + 30;
        expect(insideBig).toBe(false);
      }
    }

    // 4. Unclustered graph (cluster_id: null) derives distinct topic constellations instead of 1 monolith
    const rawUnclusteredNodes: GraphNodeResponse[] = [];
    const rawUnclusteredEdges: GraphEdgeResponse[] = [];
    for (let g = 0; g < 3; g++) {
      for (let i = 0; i < 4; i++) {
        rawUnclusteredNodes.push({
          id: `u_${g}_${i}`,
          name: `Topic ${g} Node ${i}`,
          entity_type: 'concept',
          degree: i === 0 ? 3 : 1,
          note_count: 1,
          cluster_id: null,
          is_manual: false,
        });
        if (i > 0) {
          rawUnclusteredEdges.push({
            id: `ue_${g}_${i}`,
            source_entity_id: `u_${g}_0`,
            target_entity_id: `u_${g}_${i}`,
            relationship_type: 'relates_to',
            confidence: 0.9,
            is_manual: false,
          });
        }
      }
    }
    const derived = deriveObservatoryClusters(rawUnclusteredNodes, rawUnclusteredEdges, []);
    expect(derived.resolvedClusters.length).toBe(3);

    // Signature changes when explicit clusters arrive later (invalidating pre-cluster cache)
    const sigBefore = computeLayoutSignature(
      rawUnclusteredNodes.map((n) => ({
        id: n.id,
        clusterKey: derived.nodeClusterMap.get(n.id)!.key,
        hierarchy: 'related' as const,
      })),
      []
    );
    const sigAfter = computeLayoutSignature(
      rawUnclusteredNodes.map((n, idx) => ({
        id: n.id,
        clusterKey: `cluster_explicit_${idx % 2}`,
        hierarchy: 'related' as const,
      })),
      []
    );
    expect(sigBefore).not.toBe(sigAfter);
  });

  it('deflects cross-constellation curves around intermediate obstacle constellations and gates extreme cross-link density', () => {
    const positions = new Map<string, { x: number; y: number }>([
      ['left-star', { x: 200, y: 500 }],
      ['right-star', { x: 1000, y: 500 }],
    ]);
    const obstacle: ConstellationRegion = {
      key: 'cl-middle',
      rawName: 'Middle Cluster',
      displayTitle: 'Middle Cluster',
      centroid: { x: 600, y: 505 },
      halfW: 130,
      halfH: 110,
      bounds: { minX: 470, maxX: 730, minY: 395, maxY: 615 },
      hullPath: '',
      titlePos: { x: 600, y: 380, width: 140, height: 24 },
      nodeIds: ['obs-1'],
      isPeripheralPool: false,
    };
    const lookup = new Map<string, string>([
      ['left-star', 'cl-left'],
      ['right-star', 'cl-right'],
    ]);

    const routedPath = computeConstellationPath(
      { source: 'left-star', target: 'right-star', tier: 'cross_cluster' },
      positions,
      undefined,
      [obstacle],
      lookup
    );
    const nums = routedPath
      .replace(/[MC]/g, '')
      .trim()
      .split(/\s+/)
      .map(Number);
    // nums = [x1, y1, cx1, cy1, cx2, cy2, x2, y2]; control points must arch well away from y=500 obstacle
    const cy1 = nums[3];
    const cy2 = nums[5];
    expect(Math.abs(cy1 - 500)).toBeGreaterThan(75);
    expect(Math.abs(cy2 - 500)).toBeGreaterThan(75);

    // Progressive density gating when > 16 cross-cluster bridges exist
    const nodeLookup = new Map<string, CelestialNode>();
    const denseCrossLinks: CelestialLink[] = [];
    for (let i = 0; i < 24; i++) {
      const sId = `s_${i}`;
      const tId = `t_${i}`;
      const cA = `cl_A_${i % 4}`;
      const cB = `cl_B_${i % 4}`;
      nodeLookup.set(sId, makeCelestialNode(sId, sId, cA, 'subtopic', 2));
      nodeLookup.set(tId, makeCelestialNode(tId, tId, cB, 'subtopic', 2));
      denseCrossLinks.push({
        source: sId,
        target: tId,
        weight: 0.5 + (i % 5) * 0.1,
        type: 'bridges',
        tier: 'cross_cluster',
      });
    }

    const overviewAllowed = selectVisibleCrossClusterLinkKeys(
      denseCrossLinks,
      nodeLookup,
      0.45,
      new Set(),
      null,
      10
    );
    expect(overviewAllowed.size).toBe(10);

    // Zooming in reveals 100% of legitimate cross-constellation links
    const zoomedAllowed = selectVisibleCrossClusterLinkKeys(
      denseCrossLinks,
      nodeLookup,
      1.05,
      new Set(),
      null,
      10
    );
    expect(zoomedAllowed.size).toBe(24);
  });
});
