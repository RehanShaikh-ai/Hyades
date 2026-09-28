import { GraphNodeResponse, GraphEdgeResponse, GraphClusterSummary } from '@/types/graph';

export interface LayoutPosition {
  x: number;
  y: number;
}

export interface LayoutOptions {
  nodeSpacing?: number;
  clusterPadding?: number;
  minNodeDistance?: number;
}

interface Community {
  id: string;
  name: string;
  clusterId: string;
  nodeIds: string[];
  hubNodeId: string;
  semanticVector: Map<string, number>;
  radius: number;
  x: number;
  y: number;
}

/**
 * Common English stop words to filter out during semantic token extraction
 */
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as',
  'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can',
  'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his',
  'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most', 'my',
  'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our',
  'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than',
  'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this',
  'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what',
  'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your', 'yours',
]);

/**
 * Simple word stemmer to group morphological variants (e.g. database/databases, ferment/fermentation)
 */
function stemWord(word: string): string {
  const w = word.toLowerCase().trim();
  if (w.length <= 3) return w;
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.endsWith('es') && !w.endsWith('ses') && !w.endsWith('xes')) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  if (w.endsWith('ing')) return w.slice(0, -3);
  if (w.endsWith('tion')) return w.slice(0, -4);
  if (w.endsWith('ed')) return w.slice(0, -2);
  if (w.endsWith('al')) return w.slice(0, -2);
  return w;
}

/**
 * Extract normalized semantic token vector from an entity
 */
function extractEntityTokens(node: GraphNodeResponse): Map<string, number> {
  const tokens = new Map<string, number>();
  const text = `${node.name} ${node.name} ${node.entity_type} ${node.description || ''}`;
  const rawWords = text.toLowerCase().split(/[^a-z0-9_-]+/);

  for (const raw of rawWords) {
    if (!raw || raw.length <= 2 || STOP_WORDS.has(raw)) continue;
    const stem = stemWord(raw);
    tokens.set(stem, (tokens.get(stem) || 0) + 1);
  }

  // Normalize vector to unit length
  let sumSq = 0;
  for (const count of tokens.values()) {
    sumSq += count * count;
  }
  const norm = Math.sqrt(sumSq) || 1;
  for (const [key, count] of tokens.entries()) {
    tokens.set(key, count / norm);
  }

  return tokens;
}

/**
 * Cosine similarity between two sparse token vectors [0, 1]
 */
function cosineSimilarity(vecA: Map<string, number>, vecB: Map<string, number>): number {
  if (!vecA || !vecB || vecA.size === 0 || vecB.size === 0) return 0;
  let dotProduct = 0;

  for (const [token, valA] of vecA.entries()) {
    const valB = vecB.get(token);
    if (valB !== undefined) {
      dotProduct += valA * valB;
    }
  }

  return Math.max(0, Math.min(1, dotProduct));
}

/**
 * Deterministic hash returning a float in [0, 1)
 */
function deterministicHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) / 2147483648;
}

/**
 * Two-Level Semantic & Topological Knowledge Map Layout
 *
 * LEVEL 1 (Macro): Positions conceptual clusters/communities based on continuous semantic
 * and topological similarity (similar domains close, unrelated domains far apart).
 * Large clusters (> 18 nodes) are partitioned into structured sub-neighborhoods.
 *
 * LEVEL 2 (Micro): Positions nodes within each community based on real relationship topology,
 * anchoring hubs, orbiting leaf nodes with generous spacing (minNodeDistance >= 48px),
 * and placing disconnected "alien" nodes near their best matching semantic community.
 */
export function computeHierarchicalGraphLayout(
  nodes: GraphNodeResponse[],
  edges: GraphEdgeResponse[] = [],
  _clusters?: GraphClusterSummary[],
  options: LayoutOptions = {}
): Record<string, LayoutPosition> {
  const positions: Record<string, LayoutPosition> = {};
  if (!nodes || nodes.length === 0) return positions;

  const minNodeDistance = options.minNodeDistance || 48;
  const clusterPadding = options.clusterPadding || 110;

  // 1. Build adjacency map, node index, and token vectors
  const nodeMap = new Map<string, GraphNodeResponse>();
  const adj = new Map<string, Set<string>>();
  const nodeTokens = new Map<string, Map<string, number>>();
  const edgeWeights = new Map<string, number>();

  for (const node of nodes) {
    nodeMap.set(node.id, node);
    adj.set(node.id, new Set<string>());
    nodeTokens.set(node.id, extractEntityTokens(node));
  }

  for (const edge of edges) {
    if (nodeMap.has(edge.source_entity_id) && nodeMap.has(edge.target_entity_id)) {
      adj.get(edge.source_entity_id)?.add(edge.target_entity_id);
      adj.get(edge.target_entity_id)?.add(edge.source_entity_id);

      const pairKey = [edge.source_entity_id, edge.target_entity_id].sort().join(':::');
      const weight = edge.confidence || 0.8;
      edgeWeights.set(pairKey, (edgeWeights.get(pairKey) || 0) + weight);
    }
  }

  // 2. Identify connected components across the graph
  const visited = new Set<string>();
  const rawComponents: string[][] = [];

  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const compNodeIds: string[] = [];
    const queue: string[] = [node.id];
    visited.add(node.id);

    while (queue.length > 0) {
      const currId = queue.shift()!;
      compNodeIds.push(currId);

      const neighbors = adj.get(currId);
      if (neighbors) {
        for (const neighborId of neighbors) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            queue.push(neighborId);
          }
        }
      }
    }
    rawComponents.push(compNodeIds);
  }

  // 3. Subdivide large monolithic components (> 18 nodes) into cohesive sub-communities
  const partitionedComponents: string[][] = [];
  const alienNodeIds: string[] = [];

  for (const comp of rawComponents) {
    if (comp.length <= 2) {
      alienNodeIds.push(...comp);
      continue;
    }

    if (comp.length <= 18) {
      partitionedComponents.push(comp);
      continue;
    }

    // Decompose large component into sub-neighborhoods around secondary hubs
    const compDegrees = comp.map((nid) => ({ nid, deg: adj.get(nid)?.size || 0 }));
    compDegrees.sort((a, b) => b.deg - a.deg);

    // Pick secondary hubs that are at least 2 hops apart or high degree
    const subHubs: string[] = [compDegrees[0].nid];
    for (let i = 1; i < compDegrees.length && subHubs.length < 8; i++) {
      const candidate = compDegrees[i].nid;
      if (compDegrees[i].deg < 4) break;

      // Check distance from existing subHubs
      let isDistinct = true;
      for (const existingHub of subHubs) {
        if (adj.get(existingHub)?.has(candidate)) {
          isDistinct = false;
          break;
        }
      }
      if (isDistinct || subHubs.length < 3) {
        subHubs.push(candidate);
      }
    }

    // Assign each node in comp to its closest sub-hub (BFS shortest path)
    const subCommMap = new Map<string, string[]>();
    for (const h of subHubs) {
      subCommMap.set(h, [h]);
    }

    const assigned = new Set<string>(subHubs);
    for (const nid of comp) {
      if (assigned.has(nid)) continue;

      let bestHub = subHubs[0];
      let bestDist = 999;

      for (const h of subHubs) {
        // BFS shortest path to h
        const q: [string, number][] = [[h, 0]];
        const v = new Set<string>([h]);
        let found = false;

        while (q.length > 0) {
          const [curr, d] = q.shift()!;
          if (curr === nid) {
            if (d < bestDist) {
              bestDist = d;
              bestHub = h;
            }
            found = true;
            break;
          }
          if (d < bestDist - 1) {
            const nbrs = adj.get(curr);
            if (nbrs) {
              for (const nbr of nbrs) {
                if (!v.has(nbr) && comp.includes(nbr)) {
                  v.add(nbr);
                  q.push([nbr, d + 1]);
                }
              }
            }
          }
        }
        if (found && bestDist <= 1) break;
      }

      subCommMap.get(bestHub)!.push(nid);
      assigned.add(nid);
    }

    for (const subMembers of subCommMap.values()) {
      if (subMembers.length > 0) {
        partitionedComponents.push(subMembers);
      }
    }
  }

  // If no major component exists, treat all as one
  if (partitionedComponents.length === 0 && rawComponents.length > 0) {
    partitionedComponents.push(nodes.map((n) => n.id));
    alienNodeIds.length = 0;
  }

  // 4. Build Community Objects with Semantic Vectors and Adaptive Area Budgeting
  const communities: Community[] = [];
  let commSeq = 0;

  for (const compNodeIds of partitionedComponents) {
    // Find hub node (highest degree)
    let hubId = compNodeIds[0];
    let maxDeg = -1;
    for (const nid of compNodeIds) {
      const deg = adj.get(nid)?.size || 0;
      if (deg > maxDeg) {
        maxDeg = deg;
        hubId = nid;
      }
    }

    // Compute composite semantic vector for this community
    const compositeTokens = new Map<string, number>();
    for (const nid of compNodeIds) {
      const tokens = nodeTokens.get(nid);
      if (tokens) {
        for (const [t, w] of tokens.entries()) {
          compositeTokens.set(t, (compositeTokens.get(t) || 0) + w);
        }
      }
    }

    // Normalize community vector
    let sumSq = 0;
    for (const count of compositeTokens.values()) {
      sumSq += count * count;
    }
    const norm = Math.sqrt(sumSq) || 1;
    for (const [k, v] of compositeTokens.entries()) {
      compositeTokens.set(k, v / norm);
    }

    const hubNode = nodeMap.get(hubId);
    // Area budgeting: generous radius to give dense clusters breathing room
    const radius = Math.max(85, Math.sqrt(compNodeIds.length) * (minNodeDistance * 1.12));

    communities.push({
      id: `comm_${commSeq++}`,
      name: hubNode?.name || `Community ${commSeq}`,
      clusterId: hubNode?.cluster_id || 'default',
      nodeIds: [...compNodeIds],
      hubNodeId: hubId,
      semanticVector: compositeTokens,
      radius,
      x: 0,
      y: 0,
    });
  }

  // 5. Assign Disconnected "Alien" Nodes to their best-matching Semantic Community
  const alienPlacementMap = new Map<string, { commId: string; parentNodeId?: string }>();

  for (const alienId of alienNodeIds) {
    const aNode = nodeMap.get(alienId);
    const aTokens = nodeTokens.get(alienId);
    if (!aNode || !aTokens) continue;

    let bestComm = communities[0];
    let bestScore = -1;
    let bestNeighborNodeId: string | undefined;

    // Evaluate semantic similarity against every community and its member nodes
    for (const comm of communities) {
      const commSim = cosineSimilarity(aTokens, comm.semanticVector);
      let highestNodeSim = 0;
      let matchedNodeId: string | undefined;

      for (const memberId of comm.nodeIds) {
        const mTokens = nodeTokens.get(memberId);
        if (mTokens) {
          const nSim = cosineSimilarity(aTokens, mTokens);
          if (nSim > highestNodeSim) {
            highestNodeSim = nSim;
            matchedNodeId = memberId;
          }
        }
      }

      const totalScore = commSim * 0.4 + highestNodeSim * 0.6;
      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestComm = comm;
        bestNeighborNodeId = matchedNodeId;
      }
    }

    if (bestComm) {
      bestComm.nodeIds.push(alienId);
      bestComm.radius = Math.max(bestComm.radius, Math.sqrt(bestComm.nodeIds.length) * (minNodeDistance * 1.12));
      alienPlacementMap.set(alienId, { commId: bestComm.id, parentNodeId: bestNeighborNodeId });
    }
  }

  // 6. Level 1: Macro-Level Semantic & Topological Positioning of Communities
  const commPairAffinity = new Map<string, number>();

  for (let i = 0; i < communities.length; i++) {
    for (let j = i + 1; j < communities.length; j++) {
      const cA = communities[i];
      const cB = communities[j];
      const semSim = cosineSimilarity(cA.semanticVector, cB.semanticVector);

      // Graph edge affinity
      let graphWeight = 0;
      for (const nidA of cA.nodeIds) {
        const nbrs = adj.get(nidA);
        if (nbrs) {
          for (const nidB of cB.nodeIds) {
            if (nbrs.has(nidB)) {
              const pair = [nidA, nidB].sort().join(':::');
              graphWeight += edgeWeights.get(pair) || 0.8;
            }
          }
        }
      }

      const combinedAffinity = semSim * 0.7 + Math.min(1.0, graphWeight * 0.2) * 0.3;
      const pairKey = [cA.id, cB.id].sort().join(':::');
      commPairAffinity.set(pairKey, combinedAffinity);
    }
  }

  // Deterministic initial placement using semantic orientation
  const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~137.5 deg
  communities.forEach((comm, idx) => {
    const nameHash = deterministicHash(comm.name);
    const clusterHash = deterministicHash(comm.clusterId);
    const angle = (idx * goldenAngle + nameHash * 0.5 + clusterHash * 0.5) % (2 * Math.PI);
    const dist = Math.sqrt(idx + 1) * 300 + 140;
    comm.x = Math.cos(angle) * dist;
    comm.y = Math.sin(angle) * dist;
  });

  // Bounded deterministic macro-relaxation (50 iterations)
  const macroIterations = 50;
  for (let iter = 0; iter < macroIterations; iter++) {
    const alpha = Math.max(0.04, 1 - iter / macroIterations);

    for (let i = 0; i < communities.length; i++) {
      const cA = communities[i];
      let fx = 0;
      let fy = 0;

      for (let j = 0; j < communities.length; j++) {
        if (i === j) continue;
        const cB = communities[j];
        const dx = cA.x - cB.x;
        const dy = cA.y - cB.y;
        const dist = Math.hypot(dx, dy) || 1;

        const pairKey = [cA.id, cB.id].sort().join(':::');
        const affinity = commPairAffinity.get(pairKey) || 0;

        // Semantic target distance: high similarity -> closer; low similarity -> farther
        const minClearance = cA.radius + cB.radius + clusterPadding;
        const targetDist = minClearance + (1.0 - affinity) * 350;

        if (dist < minClearance) {
          // Hard repulsion to prevent community overlap
          const push = ((minClearance - dist) / dist) * 1.8;
          fx += dx * push;
          fy += dy * push;
        } else if (dist < targetDist && affinity < 0.2) {
          // Push unrelated communities further apart
          const push = ((targetDist - dist) / targetDist) * 0.6;
          fx += (dx / dist) * push * 45;
          fy += (dy / dist) * push * 45;
        } else if (dist > targetDist && affinity >= 0.2) {
          // Pull semantically related communities closer
          const pull = ((dist - targetDist) / dist) * Math.min(0.45, affinity * 0.5);
          fx -= dx * pull;
          fy -= dy * pull;
        }
      }

      cA.x += fx * alpha * 0.35;
      cA.y += fy * alpha * 0.35;
    }
  }

  // 7. Level 2: Micro-Layout Inside Each Community with Breathing Room
  for (const comm of communities) {
    const { nodeIds, hubNodeId, x: cx, y: cy } = comm;

    if (nodeIds.length === 1) {
      positions[nodeIds[0]] = { x: cx, y: cy };
      continue;
    }

    // Anchor hub node at community centroid
    positions[hubNodeId] = { x: cx, y: cy };

    // BFS orbital distance mapping from hub
    const levels = new Map<string, number>();
    const parentMap = new Map<string, string>();
    levels.set(hubNodeId, 0);

    const q = [hubNodeId];
    while (q.length > 0) {
      const curr = q.shift()!;
      const currLvl = levels.get(curr)!;
      const nbrs = adj.get(curr);
      if (nbrs) {
        for (const nbr of nbrs) {
          if (comm.nodeIds.includes(nbr) && !levels.has(nbr)) {
            levels.set(nbr, currLvl + 1);
            parentMap.set(nbr, curr);
            q.push(nbr);
          }
        }
      }
    }

    // Nodes not reached via topological BFS (e.g. alien nodes or satellites)
    for (const nid of nodeIds) {
      if (!levels.has(nid)) {
        levels.set(nid, 3);
      }
    }

    // Group nodes by orbital level
    const nodesByLevel = new Map<number, string[]>();
    for (const nid of nodeIds) {
      if (nid === hubNodeId) continue;
      const lvl = levels.get(nid) || 1;
      if (!nodesByLevel.has(lvl)) nodesByLevel.set(lvl, []);
      nodesByLevel.get(lvl)!.push(nid);
    }

    // Arrange nodes on orbital shells with ample step radius (step = 58px)
    for (const [level, levelNodes] of nodesByLevel.entries()) {
      const ringRadius = Math.max(58, level * 62);
      const count = levelNodes.length;

      levelNodes.forEach((nid, idx) => {
        const parentId = parentMap.get(nid) || alienPlacementMap.get(nid)?.parentNodeId;
        let baseAngle = (idx / count) * 2 * Math.PI;

        if (parentId && positions[parentId]) {
          const pPos = positions[parentId];
          const parentAngle = Math.atan2(pPos.y - cy, pPos.x - cx);
          const spread = Math.min(Math.PI / 3, (2 * Math.PI) / Math.max(1, count));
          const leafOffset = (deterministicHash(nid) - 0.5) * spread;
          baseAngle = parentAngle + leafOffset;
        } else {
          baseAngle += deterministicHash(nid) * 0.4;
        }

        const nodeX = cx + Math.cos(baseAngle) * ringRadius;
        const nodeY = cy + Math.sin(baseAngle) * ringRadius;
        positions[nid] = { x: nodeX, y: nodeY };
      });
    }
  }

  // 8. Global Bounded Local Relaxation & Collision Prevention (30 iterations)
  const allNodeIds = Object.keys(positions);
  const relaxationIterations = 30;

  for (let iter = 0; iter < relaxationIterations; iter++) {
    const alpha = Math.max(0.04, 0.65 * (1 - iter / relaxationIterations));

    for (let i = 0; i < allNodeIds.length; i++) {
      const idA = allNodeIds[i];
      const posA = positions[idA];
      let fx = 0;
      let fy = 0;

      // Local node-node repulsion (guaranteed minNodeDistance >= 48px clearance)
      for (let j = 0; j < allNodeIds.length; j++) {
        if (i === j) continue;
        const idB = allNodeIds[j];
        const posB = positions[idB];

        const dx = posA.x - posB.x;
        const dy = posA.y - posB.y;
        const dist = Math.hypot(dx, dy) || 1;

        if (dist < minNodeDistance) {
          const push = ((minNodeDistance - dist) / dist) * 1.8;
          fx += dx * push;
          fy += dy * push;
        }
      }

      // Spring attraction along direct topological edges
      const nbrs = adj.get(idA);
      if (nbrs && nbrs.size > 0) {
        for (const nbrId of nbrs) {
          const posB = positions[nbrId];
          if (!posB) continue;

          const dx = posB.x - posA.x;
          const dy = posB.y - posA.y;
          const dist = Math.hypot(dx, dy) || 1;

          const pairKey = [idA, nbrId].sort().join(':::');
          const weight = edgeWeights.get(pairKey) || 0.8;
          const idealDist = Math.max(minNodeDistance + 8, 56 / (weight + 0.1));

          if (dist > idealDist) {
            const pull = ((dist - idealDist) / dist) * 0.22 * weight;
            fx += dx * pull;
            fy += dy * pull;
          }
        }
      }

      posA.x += fx * alpha;
      posA.y += fy * alpha;
    }
  }

  // Round coordinates for clean rendering
  for (const nid of allNodeIds) {
    positions[nid] = {
      x: Math.round(positions[nid].x * 10) / 10,
      y: Math.round(positions[nid].y * 10) / 10,
    };
  }

  return positions;
}
