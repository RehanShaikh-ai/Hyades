import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Sprint 1 Stabilization End-to-End Verification', () => {
  test.setTimeout(90000);

  const screenshotDir = path.resolve('tests/e2e/screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const mockWorkspace = {
    id: 'ws-sprint1-live',
    name: 'Observatory Research Vault',
    owner_id: 'user-sprint1',
    created_at: '2026-10-16T00:00:00Z',
    updated_at: '2026-10-16T00:00:00Z',
  };

  const mockUser = {
    id: 'user-sprint1',
    username: 'scholar',
    display_name: 'Hyades Scholar',
    email: 'scholar@hyades.local',
    created_at: '2026-10-16T00:00:00Z',
    updated_at: '2026-10-16T00:00:00Z',
  };

  // 25 realistic notes matching the database seed
  const mockNotes = [
    { id: 'n-1', title: 'Local-First Software Architecture', content: 'Local-first software stores primary data locally on client hardware.', tags: [{ id: 't-1', name: 'local-first' }, { id: 't-2', name: 'architecture' }] },
    { id: 'n-2', title: 'Conflict-Free Replicated Data Types (CRDTs)', content: 'CRDTs guarantee eventual consistency across peer replicas.', tags: [{ id: 't-1', name: 'local-first' }, { id: 't-3', name: 'crdt' }] },
    { id: 'n-3', title: 'Bidirectional Linking and Graph Topologies', content: 'Associative indexing enables multidimensional concept graphs.', tags: [{ id: 't-4', name: 'pkm' }] },
    { id: 'n-4', title: 'Incremental Knowledge Gardening', content: 'Cultivating atomic notes over time into evergreen research folios.', tags: [{ id: 't-4', name: 'pkm' }] },
    { id: 'n-5', title: 'Vector Embeddings for Spatial Navigation', content: 'Mapping high-dimensional semantic spaces onto celestial coordinates.', tags: [{ id: 't-5', name: 'embeddings' }] },
    { id: 'n-6', title: 'Data Ownership and Long-Term Archival', content: 'Plain text Markdown formats guarantee decades of data longevity.', tags: [{ id: 't-1', name: 'local-first' }] },
    { id: 'n-7', title: 'Designing Offline-First Sync Engines', content: 'Handling mutation logs, offline queues, and causal delivery.', tags: [{ id: 't-1', name: 'local-first' }] },
    { id: 'n-8', title: 'Federated Identity and P2P Replication', content: 'Decentralized public-key cryptography for private peer groups.', tags: [{ id: 't-1', name: 'local-first' }] },
    { id: 'n-9', title: 'Spaced Repetition and the Forgetting Curve', content: 'Ebbinghaus forgetting curve flattened through active retrieval.', tags: [{ id: 't-6', name: 'memory' }] },
    { id: 'n-10', title: 'Dual Coding Theory and Multimodal Retrieval', content: 'Paivio linguistic and visual pathways activated via spatial UI.', tags: [{ id: 't-6', name: 'memory' }] },
    { id: 'n-11', title: 'The Generation Effect in Active Recall', content: 'Generating explanations produces stronger neural consolidation.', tags: [{ id: 't-6', name: 'memory' }] },
    { id: 'n-12', title: 'Cognitive Load Theory in Interface Design', content: 'Minimizing extraneous load via Ivory Observatory design tokens.', tags: [{ id: 't-7', name: 'design' }] },
    { id: 'n-13', title: 'Zettelkasten Method and Fleeting Notes', content: 'Luhmann slip-box architecture and emergent linking.', tags: [{ id: 't-4', name: 'pkm' }] },
    { id: 'n-14', title: 'Conceptual Synthesis and Analogical Transfer', content: 'Mapping deep structural isomorphisms across distant domains.', tags: [{ id: 't-8', name: 'synthesis' }] },
    { id: 'n-15', title: 'Metacognitive Scaffolding in Digital Notebooks', content: 'Guiding questions orienting open research inquiries.', tags: [{ id: 't-6', name: 'memory' }] },
    { id: 'n-16', title: 'Deliberate Practice and Chunking in Skill Acquisition', content: 'Overcoming working memory bottlenecks through expert chunking.', tags: [{ id: 't-6', name: 'memory' }] },
    { id: 'n-17', title: 'Algorithmic Spaced Retrieval from Local Graphs', content: 'Combining local note graphs with algorithmic scheduling.', tags: [{ id: 't-8', name: 'synthesis' }] },
    { id: 'n-18', title: 'Spatial Memory and Visual Knowledge Topologies', content: 'Method of loci leveraged through celestial sky navigation.', tags: [{ id: 't-8', name: 'synthesis' }] },
    { id: 'n-19', title: 'Augmenting Human Intellect via Augmented Trails', content: 'Engelbart and Bush vision for bootstrapping human thought.', tags: [{ id: 't-8', name: 'synthesis' }] },
    { id: 'n-20', title: 'Personal Second Brains as Cognitive Prosthetics', content: 'Externalizing working memory into local sovereign machines.', tags: [{ id: 't-8', name: 'synthesis' }] },
    { id: 'n-21', title: 'Keplerian Orbital Harmonics and Celestial Mechanics', content: 'Kepler laws of planetary motion and celestial harmony.', tags: [{ id: 't-9', name: 'astronomy' }] },
    { id: 'n-22', title: 'Microclimate Engineering in Urban Architecture', content: 'Passive cooling towers and thermal mass buffering.', tags: [{ id: 't-10', name: 'architecture' }] },
    { id: 'n-23', title: 'Typography and Legibility in Editorial Systems', content: 'Newsreader serif proportions and warm parchment ergonomics.', tags: [{ id: 't-7', name: 'design' }] },
    { id: 'n-24', title: 'Checklist: Vault Resilience and Recovery Protocol', content: 'Automated snapshots and offline air-gapped restoration.', tags: [{ id: 't-11', name: 'resilience' }] },
    { id: 'n-25', title: 'Foundations of Archival Taxonomy and Folio Cataloging', content: 'Respect des fonds and archival arrangement principles.', tags: [{ id: 't-12', name: 'archival' }] },
  ];

  let collectionsList: any[] = [];
  let threadsList: any[] = [];
  let inboxItems: any[] = [
    {
      id: 'inbox-doc-1',
      workspace_id: 'ws-sprint1-live',
      source_id: 'src-pdf-1',
      source_title: 'Celestial Observations of the Hyades Cluster.pdf',
      source_type: 'pdf',
      file_size_bytes: 29420,
      status: 'pending',
      detection_status: 'completed',
      detected_count: 3,
      detected_entities: [
        { name: 'Aldebaran', type: 'star', description: 'Orange giant star in Taurus line of sight' },
        { name: 'Open Cluster', type: 'concept', description: 'Gravitationally bound group of stars' },
        { name: 'Parallax Distance', type: 'concept', description: 'Trigonometric measurement of stellar distance' },
      ],
      raw_metadata: {
        title: 'Celestial Observations of the Hyades Cluster',
        file_name: 'Celestial Observations of the Hyades Cluster.pdf',
        excerpt: 'The Hyades open cluster is located approximately 153 light-years from the Sun, forming the head of the constellation Taurus.',
        extracted_text: 'The Hyades open cluster is located approximately 153 light-years from the Sun, forming the head of the constellation Taurus with hundreds of co-moving stars.',
        stage_timings: { extract_ms: 22, normalize_ms: 4, chunk_ms: 12, embed_and_index_ms: 85, total_processing_ms: 123 },
      },
      created_at: '2026-10-16T12:00:00Z',
    },
  ];

  async function setupMockEnvironment(page: Page) {
    page.on('pageerror', err => console.log('BROWSER_UNCAUGHT_PAGEERROR:', err.message));

    await page.route(/\/api\/v1\/health/, async (r) => {
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'healthy', version: 'v0.4.2' }) });
    });

    await page.route(/\/api\/v1\/users/, async (r) => {
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [mockUser], total: 1 }) });
    });

    await page.route(/\/api\/v1\/workspaces$/, async (r) => {
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [mockWorkspace], total: 1 }) });
    });

    await page.route(/\/api\/v1\/workspaces\/.*\/dashboard/, async (r) => {
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ note_count: 25, source_count: 1, thread_count: 0, collection_count: 0 }) });
    });

    await page.route(/\/api\/v1\/workspaces\/.*\/notes/, async (r) => {
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: mockNotes, total: mockNotes.length, page: 1, page_size: 50 }) });
    });

    await page.route(/\/api\/v1\/notes/, async (r) => {
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: mockNotes, total: mockNotes.length, page: 1, page_size: 50 }) });
    });

    await page.route(/\/api\/v1\/workspaces\/.*\/clusters/, async (r) => {
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route(/\/api\/v1\/workspaces\/.*\/saved-searches/, async (r) => {
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route(/\/api\/v1\/workspaces\/.*\/graph/, async (r) => {
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ nodes: [], links: [] }) });
    });

    await page.route(/\/api\/v1\/workspaces\/.*\/sources/, async (r) => {
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'src-pdf-1',
              workspace_id: 'ws-sprint1-live',
              source_type: 'pdf',
              original_path: 'Celestial Observations of the Hyades Cluster.pdf',
              title: 'Celestial Observations of the Hyades Cluster',
              file_name: 'Celestial Observations of the Hyades Cluster.pdf',
              excerpt: 'The Hyades open cluster is located approximately 153 light-years from the Sun, forming the head of the constellation Taurus.',
              extracted_text: 'The Hyades open cluster is located approximately 153 light-years from the Sun, forming the head of the constellation Taurus with hundreds of co-moving stars.',
              stage_timings: { extract_ms: 22, normalize_ms: 4, chunk_ms: 12, embed_and_index_ms: 85, total_processing_ms: 123 },
              processing_status: 'READY',
              created_at: '2026-10-16T12:00:00Z',
            },
          ],
          total: 1,
          page: 1,
          page_size: 50,
        }),
      });
    });

    await page.route(/\/api\/v1\/collections/, async (r) => {
      const url = r.request().url();
      const method = r.request().method();
      if (method === 'POST' && !url.includes('/items')) {
        const d = r.request().postDataJSON();
        const created = {
          id: `coll-${Date.now()}`,
          workspace_id: 'ws-sprint1-live',
          name: d.name,
          description: d.description,
          created_by: 'user-sprint1',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          items: [],
        };
        collectionsList.push(created);
        await r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
      } else if (method === 'GET' && url.includes('/items')) {
        await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 50 }) });
      } else if (method === 'GET' && url.includes('/stats')) {
        await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ collection_id: 'coll-1', total_items: 0, by_type: {} }) });
      } else if (method === 'GET' && url.includes('/related')) {
        await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ collection_id: 'coll-1', related_entities: [], total_related: 0 }) });
      } else {
        await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: collectionsList, total: collectionsList.length, page: 1, page_size: 20 }) });
      }
    });

    await page.route(/\/api\/v1\/threads/, async (r) => {
      const url = r.request().url();
      const method = r.request().method();
      if (method === 'POST' && !url.includes('/questions') && !url.includes('/discoveries') && !url.includes('/items')) {
        const d = r.request().postDataJSON();
        const created = {
          id: `th-${Date.now()}`,
          workspace_id: 'ws-sprint1-live',
          title: d.title,
          guiding_question: d.guiding_question,
          status: 'active',
          created_by: 'user-sprint1',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          questions: [],
          discoveries: [],
          items: [],
        };
        threadsList.push(created);
        await r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
      } else if (method === 'POST' && url.includes('/questions')) {
        const d = r.request().postDataJSON();
        const q = { id: `q-${Date.now()}`, thread_id: 'th-1', text: d.text, status: 'open', created_at: new Date().toISOString() };
        await r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(q) });
      } else if (method === 'POST' && url.includes('/discoveries')) {
        const d = r.request().postDataJSON();
        const disc = { id: `d-${Date.now()}`, thread_id: 'th-1', text: d.text, created_at: new Date().toISOString() };
        await r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(disc) });
      } else if (method === 'GET' && url.includes('/activity')) {
        await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], total: 0 }) });
      } else {
        await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: threadsList, total: threadsList.length, page: 1, page_size: 20 }) });
      }
    });

    await page.route(/\/api\/v1\/inbox/, async (r) => {
      const url = r.request().url();
      const method = r.request().method();
      if (method === 'POST' && url.includes('/accept')) {
        await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'inbox-doc-1', status: 'accepted', extraction_started: true }) });
      } else if (method === 'POST' && url.includes('/reject')) {
        inboxItems = [];
        await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'inbox-doc-1', status: 'rejected', cleanup_completed: true }) });
      } else if (method === 'GET' && url.includes('/inbox-doc-1')) {
        await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inboxItems[0]) });
      } else {
        await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: inboxItems, total: inboxItems.length, page: 1, page_size: 20 }) });
      }
    });

    await page.route(/\/api\/v1\/sources\/upload/, async (r) => {
      await r.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'src-uploaded-test',
          workspace_id: 'ws-sprint1-live',
          source_type: 'pdf',
          original_path: 'Orbital_Dynamics.pdf',
          title: 'Orbital Dynamics and Perturbation Theory',
          file_name: 'Orbital_Dynamics.pdf',
          excerpt: 'Analysis of gravitational perturbations in binary star clusters.',
          extracted_text: 'Analysis of gravitational perturbations in binary star clusters within the Hyades stream.',
          stage_timings: { extract_ms: 18, normalize_ms: 3, chunk_ms: 8, embed_and_index_ms: 72, total_processing_ms: 101 },
          processing_status: 'READY',
          created_at: new Date().toISOString(),
        }),
      });
    });
  }

  test('Priority 0 & 6: Visual verification across Desktop and Mobile viewports', async ({ page }) => {
    await setupMockEnvironment(page);

    // 1. Desktop Viewport (1280x800)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForTimeout(500);

    // Navigate to Library and verify 25 seed notes visible
    await page.getByRole('button', { name: /^Library$/i }).click();
    await expect(page.getByText('Local-First Software Architecture').first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: path.join(screenshotDir, '01-desktop-library-catalog.png'), fullPage: false });

    // Navigate to Collections
    await page.getByRole('button', { name: /^Collections$/i }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('heading', { name: 'Collections', exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(screenshotDir, '02-desktop-collections-ivory.png'), fullPage: false });

    // Navigate to Threads
    await page.getByRole('button', { name: /^Threads$/i }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('heading', { name: 'Research Threads' })).toBeVisible();
    await page.screenshot({ path: path.join(screenshotDir, '03-desktop-threads-ivory.png'), fullPage: false });

    // Navigate to Inbox
    await page.getByRole('button', { name: /^Inbox$/i }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('heading', { name: 'Knowledge Inbox' })).toBeVisible();
    await page.screenshot({ path: path.join(screenshotDir, '04-desktop-inbox-ivory.png'), fullPage: false });

    // 2. Narrow Mobile Viewport (375x667)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /^Library$/i }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotDir, '05-mobile-library-responsive.png'), fullPage: false });

    await page.getByRole('button', { name: /^Collections$/i }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotDir, '06-mobile-collections-responsive.png'), fullPage: false });

    await page.getByRole('button', { name: /^Inbox$/i }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotDir, '07-mobile-inbox-responsive.png'), fullPage: false });
  });

  test('Priority 1: Collections and Threads creation and workflow', async ({ page }) => {
    await setupMockEnvironment(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Create Collection
    await page.getByRole('button', { name: /^Collections$/i }).click();
    await page.getByPlaceholder('Collection name...').fill('Epistemology of Local-First');
    await page.getByPlaceholder('Description (optional)...').fill('Papers exploring decentralized data ownership and peer convergence');
    await page.getByRole('button', { name: 'Create Collection' }).click();

    await expect(page.getByRole('heading', { name: 'Epistemology of Local-First' }).first()).toBeVisible({ timeout: 5000 });

    // Create Thread
    await page.getByRole('button', { name: /^Threads$/i }).click();
    await page.getByPlaceholder('Thread title...').fill('Convergence Limits of Sequence CRDTs');
    await page.getByPlaceholder('Guiding question (optional)...').fill('How do interleaving anomalies scale in multi-peer topologies?');
    await page.getByRole('button', { name: 'Create Thread' }).click();

    await expect(page.getByRole('heading', { name: 'Convergence Limits of Sequence CRDTs' }).first()).toBeVisible({ timeout: 5000 });
  });

  test('Priority 2 & 4: Unified Ingestion Modes and Document Reader Content', async ({ page }) => {
    await setupMockEnvironment(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // 1. Open Import Modal from Library
    await page.getByRole('button', { name: /^Library$/i }).click();
    await expect(page.getByText('Local-First Software Architecture').first()).toBeVisible({ timeout: 10000 });
    const importBtn = page.getByRole('button', { name: /Import Sources/i }).first();
    await expect(importBtn).toBeVisible({ timeout: 5000 });
    await importBtn.click();
    await expect(page.getByText('Import Source Document')).toBeVisible();

    // Verify explicit Mode Selection radios exist
    await expect(page.getByText('Direct Ingestion')).toBeVisible();
    await expect(page.getByText('Knowledge Inbox')).toBeVisible();

    // Close modal
    await page.keyboard.press('Escape');

    // 2. Select Source and open Document Reader
    const sourceCard = page.getByText('Celestial Observations of the Hyades Cluster').first();
    await expect(sourceCard).toBeVisible({ timeout: 5000 });
    await sourceCard.click();
    const readerBtn = page.getByRole('button', { name: /Open Document Reader/i });
    await expect(readerBtn).toBeVisible({ timeout: 5000 });
    await readerBtn.click();
    await expect(page.getByText('Document Reader', { exact: true })).toBeVisible();
    await expect(page.getByText('The Hyades open cluster is located approximately 153 light-years').first()).toBeVisible();
    await page.getByRole('button', { name: 'Close Reader' }).click();
  });

  test('Priority 3 & 5: Inbox Review with real extracted metadata and timings', async ({ page }) => {
    await setupMockEnvironment(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await page.getByRole('button', { name: /^Inbox$/i }).click();

    // Verify real title and excerpt are rendered (not Archival Source 2)
    await expect(page.getByRole('heading', { name: 'Celestial Observations of the Hyades Cluster.pdf' }).first()).toBeVisible();
    await expect(page.getByText('The Hyades open cluster is located approximately 153 light-years from the Sun').first()).toBeVisible({ timeout: 5000 });
    
    // Verify detected entities preview
    await expect(page.getByText('Aldebaran')).toBeVisible();
    await expect(page.getByText('Open Cluster', { exact: true })).toBeVisible();

    // Accept into Catalog
    const acceptBtn = page.getByRole('button', { name: /^Accept$/i });
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();
    await expect(page.getByText('accepted into Library catalog')).toBeVisible();
  });
});
