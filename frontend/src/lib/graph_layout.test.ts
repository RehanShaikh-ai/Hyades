import { describe, it, expect } from 'vitest';
import { computeHierarchicalGraphLayout } from './graph_layout';
import { GraphNodeResponse, GraphEdgeResponse } from '@/types/graph';

describe('computeHierarchicalGraphLayout (Two-Level Semantic Knowledge Map)', () => {
  it('returns empty dictionary when given empty nodes', () => {
    const pos = computeHierarchicalGraphLayout([]);
    expect(pos).toEqual({});
  });

  it('assigns coordinates deterministically for identical inputs', () => {
    const nodes: GraphNodeResponse[] = [
      { id: 'n1', name: 'Node 1', entity_type: 'concept', is_manual: false, degree: 0, note_count: 1 },
      { id: 'n2', name: 'Node 2', entity_type: 'concept', is_manual: false, degree: 0, note_count: 1 },
    ];
    const pos1 = computeHierarchicalGraphLayout(nodes);
    const pos2 = computeHierarchicalGraphLayout(nodes);
    expect(pos1['n1']).toBeDefined();
    expect(pos1['n1'].x).toBe(pos2['n1'].x);
    expect(pos1['n1'].y).toBe(pos2['n1'].y);
    expect(pos1['n2'].x).toBe(pos2['n2'].x);
    expect(pos1['n2'].y).toBe(pos2['n2'].y);
  });

  it('correctly places disconnected "alien" nodes near their semantic community without fake edges', () => {
    const nodes: GraphNodeResponse[] = [
      // Sourdough community
      { id: 's1', name: 'bulk fermentation', entity_type: 'concept', description: 'Initial fermentation period of sourdough dough', is_manual: false, degree: 1, note_count: 1 },
      { id: 's2', name: 'dough', entity_type: 'concept', description: 'Flour and water dough for sourdough bread', is_manual: false, degree: 2, note_count: 1 },
      { id: 's3', name: 'flour', entity_type: 'concept', description: 'Wheat flour for bread making', is_manual: false, degree: 1, note_count: 1 },

      // Database community
      { id: 'd1', name: 'Database design', entity_type: 'concept', description: 'Relational database schema design and normalization', is_manual: false, degree: 2, note_count: 1 },
      { id: 'd2', name: 'SQL Table', entity_type: 'concept', description: 'Relational table structure in SQL database', is_manual: false, degree: 1, note_count: 1 },
      { id: 'd3', name: 'Index', entity_type: 'concept', description: 'B-tree database index for query performance', is_manual: false, degree: 1, note_count: 1 },

      // Disconnected Alien Node 1: "gluten" (has 0 edges, but description is about dough protein)
      { id: 'alien_gluten', name: 'gluten', entity_type: 'concept', description: 'Protein network in sourdough dough giving structure', is_manual: false, degree: 0, note_count: 1 },

      // Disconnected Alien Node 2: "RDBMS" (has 0 edges, but description is about relational database)
      { id: 'alien_rdbms', name: 'RDBMS', entity_type: 'technology', description: 'Relational database management system executing SQL queries', is_manual: false, degree: 0, note_count: 1 },
    ];

    const edges: GraphEdgeResponse[] = [
      { id: 'e1', source_entity_id: 's1', target_entity_id: 's2', relationship_type: 'undergoes', confidence: 0.9, is_manual: false },
      { id: 'e2', source_entity_id: 's2', target_entity_id: 's3', relationship_type: 'uses', confidence: 0.9, is_manual: false },
      { id: 'e3', source_entity_id: 'd1', target_entity_id: 'd2', relationship_type: 'contains', confidence: 0.9, is_manual: false },
      { id: 'e4', source_entity_id: 'd1', target_entity_id: 'd3', relationship_type: 'uses', confidence: 0.9, is_manual: false },
    ];

    const pos = computeHierarchicalGraphLayout(nodes, edges);

    // gluten should be positioned close to sourdough dough
    const distGlutenDough = Math.hypot(pos['alien_gluten'].x - pos['s2'].x, pos['alien_gluten'].y - pos['s2'].y);
    const distGlutenDb = Math.hypot(pos['alien_gluten'].x - pos['d1'].x, pos['alien_gluten'].y - pos['d1'].y);
    expect(distGlutenDough).toBeLessThan(distGlutenDb);

    // RDBMS should be positioned close to Database design
    const distRdbmsDb = Math.hypot(pos['alien_rdbms'].x - pos['d1'].x, pos['alien_rdbms'].y - pos['d1'].y);
    const distRdbmsDough = Math.hypot(pos['alien_rdbms'].x - pos['s2'].x, pos['alien_rdbms'].y - pos['s2'].y);
    expect(distRdbmsDb).toBeLessThan(distRdbmsDough);
  });

  it('keeps semantically unrelated domains (Cooking vs Finance) separated', () => {
    const nodes: GraphNodeResponse[] = [
      // Cooking
      { id: 'c1', name: 'bulk fermentation', entity_type: 'concept', description: 'Sourdough bread fermentation', is_manual: false, degree: 2, note_count: 1 },
      { id: 'c2', name: 'dough', entity_type: 'concept', description: 'Sourdough bread dough', is_manual: false, degree: 2, note_count: 1 },
      { id: 'c3', name: 'flour', entity_type: 'concept', description: 'Wheat flour', is_manual: false, degree: 2, note_count: 1 },

      // Finance
      { id: 'f1', name: 'Personal Budgeting', entity_type: 'concept', description: 'Managing personal finances, income, and expenses', is_manual: false, degree: 2, note_count: 1 },
      { id: 'f2', name: 'Fixed expenses', entity_type: 'concept', description: 'Recurring budget expenses like rent and loan debt', is_manual: false, degree: 2, note_count: 1 },
      { id: 'f3', name: 'Income', entity_type: 'concept', description: 'Monthly salary and investment cashflow', is_manual: false, degree: 2, note_count: 1 },
    ];

    const edges: GraphEdgeResponse[] = [
      { id: 'e1', source_entity_id: 'c1', target_entity_id: 'c2', relationship_type: 'relates', confidence: 0.9, is_manual: false },
      { id: 'e2', source_entity_id: 'c2', target_entity_id: 'c3', relationship_type: 'relates', confidence: 0.9, is_manual: false },
      { id: 'e3', source_entity_id: 'f1', target_entity_id: 'f2', relationship_type: 'relates', confidence: 0.9, is_manual: false },
      { id: 'e4', source_entity_id: 'f1', target_entity_id: 'f3', relationship_type: 'relates', confidence: 0.9, is_manual: false },
    ];

    const pos = computeHierarchicalGraphLayout(nodes, edges);

    // Cooking centroid vs Finance centroid distance should be large
    const distCookingFinance = Math.hypot(pos['c1'].x - pos['f1'].x, pos['c1'].y - pos['f1'].y);
    expect(distCookingFinance).toBeGreaterThan(250);
  });

  it('guarantees clearance between all nodes (no overlapping nodes)', () => {
    const nodes: GraphNodeResponse[] = Array.from({ length: 25 }, (_, i) => ({
      id: `node_${i}`,
      name: `Entity ${i}`,
      entity_type: 'concept',
      is_manual: false,
      degree: 1,
      note_count: 1,
    }));

    const edges: GraphEdgeResponse[] = Array.from({ length: 24 }, (_, i) => ({
      id: `edge_${i}`,
      source_entity_id: 'node_0',
      target_entity_id: `node_${i + 1}`,
      relationship_type: 'related_to',
      confidence: 0.8,
      is_manual: false,
    }));

    const pos = computeHierarchicalGraphLayout(nodes, edges);

    const ids = Object.keys(pos);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const pA = pos[ids[i]];
        const pB = pos[ids[j]];
        const dist = Math.hypot(pA.x - pB.x, pA.y - pB.y);
        expect(dist).toBeGreaterThanOrEqual(28);
      }
    }
  });
});
