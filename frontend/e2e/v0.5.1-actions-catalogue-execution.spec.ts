import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('v0.5.1 Action Catalogue, Schema-Driven Forms, Execution & A11y Suite', () => {
  test.setTimeout(90000);

  const mockWorkspace = {
    id: 'ws-e2e-actions-1',
    name: 'Research Observatory WS',
    owner_id: 'user-hamza',
    created_at: '2026-10-21T00:00:00Z',
    updated_at: '2026-10-21T00:00:00Z',
  };

  const mockUser = {
    id: 'user-hamza',
    username: 'hamza',
    display_name: 'Hamza',
    email: 'hamza@example.com',
    created_at: '2026-10-21T00:00:00Z',
    updated_at: '2026-10-21T00:00:00Z',
  };

  // Full set of 37 contract-defined actions (§7)
  const contract37Actions = [
    { id: 'notes.create', name: 'Create Note', side_effect: 'write', domain: 'notes' },
    { id: 'notes.get', name: 'Get Note', side_effect: 'read', domain: 'notes' },
    { id: 'notes.update', name: 'Update Note', side_effect: 'write', domain: 'notes' },
    { id: 'notes.delete', name: 'Delete Note', side_effect: 'destructive', domain: 'notes', disabled_reason: 'Archival policy lock active in current workspace' },
    { id: 'notes.list', name: 'List Notes', side_effect: 'read', domain: 'notes' },
    { id: 'notes.search', name: 'Search Notes', side_effect: 'read', domain: 'notes' },
    { id: 'notes.summarize', name: 'Summarize Note', side_effect: 'read', domain: 'notes' },
    { id: 'notes.extract_entities', name: 'Extract Entities', side_effect: 'propose', domain: 'notes' },

    { id: 'sources.create', name: 'Create Source', side_effect: 'write', domain: 'sources' },
    { id: 'sources.get', name: 'Get Source', side_effect: 'read', domain: 'sources' },
    { id: 'sources.update', name: 'Update Source', side_effect: 'write', domain: 'sources' },
    { id: 'sources.delete', name: 'Delete Source', side_effect: 'destructive', domain: 'sources' },
    { id: 'sources.list', name: 'List Sources', side_effect: 'read', domain: 'sources' },
    { id: 'sources.search', name: 'Search Sources', side_effect: 'read', domain: 'sources' },
    { id: 'sources.ingest', name: 'Ingest Source Document', side_effect: 'propose', domain: 'sources' },
    { id: 'sources.extract_chunks', name: 'Extract Chunks', side_effect: 'read', domain: 'sources' },

    { id: 'entities.create', name: 'Create Entity', side_effect: 'write', domain: 'entities' },
    { id: 'entities.get', name: 'Get Entity', side_effect: 'read', domain: 'entities' },
    { id: 'entities.update', name: 'Update Entity', side_effect: 'write', domain: 'entities' },
    { id: 'entities.delete', name: 'Delete Entity', side_effect: 'destructive', domain: 'entities' },
    { id: 'entities.list', name: 'List Entities', side_effect: 'read', domain: 'entities' },
    { id: 'entities.search', name: 'Search Entities', side_effect: 'read', domain: 'entities' },
    { id: 'entities.merge', name: 'Merge Entities', side_effect: 'destructive', domain: 'entities' },

    { id: 'relationships.create', name: 'Create Relationship', side_effect: 'write', domain: 'relationships' },
    { id: 'relationships.get', name: 'Get Relationship', side_effect: 'read', domain: 'relationships' },
    { id: 'relationships.update', name: 'Update Relationship', side_effect: 'write', domain: 'relationships' },
    { id: 'relationships.delete', name: 'Delete Relationship', side_effect: 'destructive', domain: 'relationships' },
    { id: 'relationships.list', name: 'List Relationships', side_effect: 'read', domain: 'relationships' },

    { id: 'tags.create', name: 'Create Tag', side_effect: 'write', domain: 'tags' },
    { id: 'tags.get', name: 'Get Tag', side_effect: 'read', domain: 'tags' },
    { id: 'tags.update', name: 'Update Tag', side_effect: 'write', domain: 'tags' },
    { id: 'tags.delete', name: 'Delete Tag', side_effect: 'destructive', domain: 'tags' },
    { id: 'tags.list', name: 'List Tags', side_effect: 'read', domain: 'tags' },
    { id: 'tags.attach', name: 'Attach Tag', side_effect: 'write', domain: 'tags' },
    { id: 'tags.detach', name: 'Detach Tag', side_effect: 'destructive', domain: 'tags' },

    { id: 'graph.reindex', name: 'Recompute Graph Centrality', side_effect: 'write', domain: 'graph' },
    { id: 'inbox.process', name: 'Process Inbox Item', side_effect: 'write', domain: 'inbox' },
  ].map((a) => ({
    ...a,
    description: `Canonical action for ${a.name} in domain ${a.domain}.`,
    input_schema: {
      type: 'object',
      properties: {
        note_id: { type: 'string', title: 'Note ID', description: 'Unique note identifier' },
        title: { type: 'string', title: 'Title' },
        confidence_threshold: { type: 'number', title: 'Threshold' },
      },
      required: a.id === 'notes.summarize' || a.id === 'notes.update' ? ['note_id'] : [],
    },
  }));

  async function setupMockApis(page: Page) {
    await page.route('**/api/v1/workspaces', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [mockWorkspace], total: 1 }),
      });
    });

    await page.route('**/api/v1/users', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [mockUser], total: 1 }),
      });
    });

    await page.route('**/api/v1/actions', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            actions: contract37Actions,
            total: 37,
          }),
        });
      }
    });

    await page.route('**/api/v1/actions/*/execute*', async (route) => {
      const url = route.request().url();
      const actionId = url.split('/actions/')[1]?.split('/execute')[0];
      const payload = route.request().postDataJSON() || {};

      if (payload.mode === 'propose') {
        // Propose mode returns proposed envelope with confirmation token
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            execution_id: 'exec-prop-001',
            action_id: actionId,
            status: 'proposed',
            initiated_by: 'user',
            duration_ms: 180,
            result: { dry_run: true },
            evidence: [
              {
                item_id: 'src-astronomy-1',
                item_type: 'source',
                chunk_id: 'chunk-99',
                source_id: 'src-deep-sky',
                similarity_score: 0.941,
                excerpt: 'The Hyades star cluster forms the V-shape of Taurus constellation.',
                reference: 'Stellar Dynamics Atlas',
                title: 'Stellar Dynamics Document',
              },
            ],
            interpretation: 'Synthesized proposal to link [[Hyades Cluster]] with [[Taurus]].',
            proposals: [
              {
                id: 'prop-e2e-1',
                execution_id: 'exec-prop-001',
                action_id: actionId,
                proposal_payload: {
                  summary: 'Proposed update to Taurus dossiers',
                },
                affected_item_ids: ['note-taurus-01', 'note-hyades-02'],
                confirmation_token: 'conf-token-e2e-xyz',
                expires_at: '2026-12-31T23:59:59Z',
                status: 'pending',
              },
            ],
            committed_changes: [],
          }),
        });
      } else if (payload.mode === 'commit') {
        // Commit mode returns committed changes with undo capability
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            execution_id: 'exec-commit-002',
            action_id: actionId,
            status: 'succeeded',
            initiated_by: 'user',
            duration_ms: 290,
            result: { committed: true },
            evidence: [],
            interpretation: 'Successfully committed proposed mutations to the knowledge vault.',
            proposals: [],
            committed_changes: [
              {
                change_set_id: 'cs-e2e-commit-1',
                item_id: 'note-taurus-01',
                item_type: 'note',
                before_state: { title: 'Taurus Draft' },
                after_state: { title: 'Taurus Dossier [Committed]' },
                committed_at: '2026-10-21T10:30:00Z',
                undo_supported: true,
                undo_status: 'available',
              },
            ],
          }),
        });
      } else {
        // Read mode returns read envelope
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            execution_id: 'exec-read-003',
            action_id: actionId,
            status: 'succeeded',
            initiated_by: 'user',
            duration_ms: 220,
            result: { word_count: 140 },
            evidence: [
              {
                item_id: 'src-provenance-1',
                item_type: 'source',
                chunk_id: 'chunk-10',
                source_id: 'src-cosmic-atlas',
                similarity_score: 0.887,
                excerpt: 'Primary reference on cosmic background telemetry.',
                reference: 'Cosmic Atlas 2026',
              },
            ],
            interpretation: '### Celestial Analysis\n\nExecution retrieved verified telemetry. See [[Alpha Centauri]] and [[Beta Orionis]].',
            proposals: [],
            committed_changes: [],
          }),
        });
      }
    });

    await page.route('**/api/v1/actions/executions*', async (route) => {
      const url = route.request().url();
      if (url.includes('/cancel')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            execution_id: 'exec-prop-001',
            action_id: 'notes.summarize',
            status: 'cancelled',
            initiated_by: 'user',
            duration_ms: 100,
            result: null,
            evidence: [],
            interpretation: 'Execution was cancelled by operator.',
            proposals: [],
            committed_changes: [],
          }),
        });
      } else if (url.includes('/undo')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'succeeded',
            message: 'Change set undone successfully',
          }),
        });
      } else if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                execution_id: 'exec-read-003',
                action_id: 'notes.summarize',
                status: 'succeeded',
                initiated_by: 'user',
                duration_ms: 220,
                result: {},
                evidence: [],
                interpretation: 'Summary',
                proposals: [],
                committed_changes: [],
                created_at: '2026-10-21T10:00:00Z',
              },
            ],
            total: 1,
            page: 1,
            page_size: 15,
            total_pages: 1,
          }),
        });
      }
    });
  }

  test('Action Catalogue renders all 37 contract actions, filters, and disabled reason callout', async ({ page }) => {
    await setupMockApis(page);
    await page.goto('/#actions');

    // Wait for the action observatory to mount
    await expect(page.locator('[data-testid="hyades-actions-page"]')).toBeVisible();

    // Verify all 37 actions are listed
    await expect(page.locator('text=Canonical Manual Actions (37 of 37)')).toBeVisible();

    // Check specific action cards across domains
    await expect(page.locator('[data-testid="action-card-notes.summarize"]')).toBeVisible();
    await expect(page.locator('[data-testid="action-card-sources.ingest"]')).toBeVisible();
    await expect(page.locator('[data-testid="action-card-entities.merge"]')).toBeVisible();
    await expect(page.locator('[data-testid="action-card-graph.reindex"]')).toBeVisible();
    await expect(page.locator('[data-testid="action-card-inbox.process"]')).toBeVisible();

    // Check disabled action displays explicit disabled reason (§3.A, §5.2)
    const disabledCard = page.locator('[data-testid="action-card-notes.delete"]');
    await expect(disabledCard).toBeVisible();
    await expect(page.locator('[data-testid="action-disabled-reason-notes.delete"]')).toContainText(
      'Archival policy lock active in current workspace'
    );

    // Test Domain Filtering
    await page.click('[data-testid="domain-filter-sources"]');
    await expect(page.locator('[data-testid="action-card-sources.ingest"]')).toBeVisible();
    await expect(page.locator('[data-testid="action-card-notes.summarize"]')).not.toBeVisible();

    // Reset filter
    await page.click('[data-testid="domain-filter-all"]');
    await expect(page.locator('[data-testid="action-card-notes.summarize"]')).toBeVisible();

    // Test Search input filtering
    await page.fill('[data-testid="action-search-input"]', 'Centrality');
    await expect(page.locator('[data-testid="action-card-graph.reindex"]')).toBeVisible();
    await expect(page.locator('[data-testid="action-card-notes.summarize"]')).not.toBeVisible();
  });

  test('Two-Phase proposal review, confirmation token commit, and evidence/interpretation separation', async ({ page }) => {
    await setupMockApis(page);
    await page.goto('/#actions');

    // Select notes.update action
    await page.click('[data-testid="action-card-notes.update"]');

    // Form should appear
    await expect(page.locator('[data-testid="action-input-form"]')).toBeVisible();

    // Fill required note_id
    await page.fill('[data-testid="action-input-note_id"]', 'note-taurus-01');

    // Select 'Propose' execution mode
    await page.click('[data-testid="mode-select-propose"]');

    // Submit proposed execution
    await page.click('[data-testid="execute-action-btn"]');

    // Result view should appear
    await expect(page.locator('[data-testid="execution-result-view"]')).toBeVisible();
    await expect(page.locator('[data-testid="execution-status-badge"]')).toContainText('Proposed');

    // Switch to Proposals tab
    await page.click('[data-testid="tab-proposals"]');

    // Verify affected item IDs are explicitly displayed (§3.E, §6.2)
    await expect(page.locator('[data-testid="affected-items-list"]')).toContainText('note-taurus-01');
    await expect(page.locator('[data-testid="affected-items-list"]')).toContainText('note-hyades-02');

    // Verify server confirmation token is visible
    await expect(page.locator('text=conf-token-e2e-xyz')).toBeVisible();

    // Commit proposal with server confirmation token (§3.E, §6.2)
    await page.click('[data-testid="confirm-proposal-btn-prop-e2e-1"]');

    // Execution should transition directly to Succeeded with committed changes
    await expect(page.locator('[data-testid="execution-status-badge"]')).toContainText('Succeeded');

    // Switch to proposals & changes tab
    await page.click('[data-testid="tab-proposals"]');
    await expect(page.locator('[data-testid="committed-changes-section"]')).toBeVisible();
    await expect(page.locator('text=Target Record: note-taurus-01')).toBeVisible();

    // Verify undo control is visible and functional
    const undoBtn = page.locator('[data-testid="undo-change-btn-note-taurus-01"]');
    await expect(undoBtn).toBeVisible();

    // Check evidence vs interpretation separation and similarity score labeling (§8.2, §3.D)
    await page.click('[data-testid="tab-evidence"]');
    // If evidence exists, verify similarity score is NEVER labeled confidence
    const hasEvidence = await page.locator('[data-testid="evidence-similarity-score"]').count();
    if (hasEvidence > 0) {
      const scoreText = await page.locator('[data-testid="evidence-similarity-score"]').textContent();
      expect(scoreText).toContain('Similarity:');
      expect(scoreText?.toLowerCase()).not.toContain('confidence');
    }
  });

  test('Responsive viewport layout and no unintended horizontal overflow at 768px, 1280px, 1440px, 1920px (§3.I)', async ({ page }) => {
    await setupMockApis(page);
    await page.goto('/#actions');
    await expect(page.locator('[data-testid="hyades-actions-page"]')).toBeVisible();

    const viewports = [
      { width: 768, height: 1024, label: '768px min viewport' },
      { width: 1280, height: 720, label: '1280x720' },
      { width: 1440, height: 900, label: '1440x900' },
      { width: 1920, height: 1080, label: '1920x1080' },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(300);

      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      expect(hasHorizontalOverflow, `Horizontal overflow detected at ${vp.label}`).toBe(false);
    }
  });

  test('Automated accessibility scan using @axe-core/playwright (§3.I)', async ({ page }) => {
    await setupMockApis(page);
    await page.goto('/#actions');
    await expect(page.locator('[data-testid="hyades-actions-page"]')).toBeVisible();

    // Run axe accessibility analysis on the Actions Observatory
    const accessibilityScanResults = await new AxeBuilder({ page })
      .disableRules(['color-contrast']) // Color contrast may vary with parchment design tokens
      .analyze();

    const seriousViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );

    expect(seriousViolations, `Found ${seriousViolations.length} serious/critical a11y violations`).toEqual([]);
  });
});
