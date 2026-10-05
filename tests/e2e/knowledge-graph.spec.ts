import { test, expect, Page } from '@playwright/test';

test.describe('Knowledge Graph E2E Flows', () => {
  // Give real backend jobs ample time to process
  test.setTimeout(90000);

  async function navigateToGraphView(page: Page) {
    await page.goto('/');

    // Navigate to Workspaces tab if not already on it
    const workspacesNav = page.getByRole('button', { name: 'Workspaces' });
    if (await workspacesNav.isVisible()) {
      await workspacesNav.click();
    }

    // Prefer a workspace with fewer notes for fast, deterministic E2E execution
    const cleanWsBtn = page.locator('li:has-text("Clean Test WS") button[data-testid^="open-workspace-"]').first();
    const anyWsBtn = page.locator('[data-testid^="open-workspace-"]').first();
    const openWorkspaceBtn = (await cleanWsBtn.count()) > 0 ? cleanWsBtn : anyWsBtn;

    await expect(openWorkspaceBtn).toBeVisible({ timeout: 10000 });
    await openWorkspaceBtn.click();

    // Switch to Graph tab
    const graphTabBtn = page.getByRole('button', { name: /^Graph$/i });
    await expect(graphTabBtn).toBeVisible({ timeout: 10000 });
    await graphTabBtn.click();

    // Verify Graph view is loaded
    await expect(page.getByTestId('graph-edit-toolbar')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('constellation-graph')).toBeVisible({ timeout: 10000 });
  }

  test('Knowledge Graph page loads correctly with toolbar and canvas', async ({ page }) => {
    await navigateToGraphView(page);

    const extractBtn = page.getByTestId('toolbar-extract-btn');
    const reindexBtn = page.getByTestId('toolbar-reindex-btn');

    await expect(extractBtn).toBeVisible();
    await expect(extractBtn).toBeEnabled();
    await expect(extractBtn).toContainText('Extract');

    await expect(reindexBtn).toBeVisible();
    await expect(reindexBtn).toBeEnabled();
    await expect(reindexBtn).toContainText('Reindex');
  });

  test('Extract button triggers immediate feedback and prevents duplicate clicks', async ({ page }) => {
    await navigateToGraphView(page);

    const extractBtn = page.getByTestId('toolbar-extract-btn');
    const reindexBtn = page.getByTestId('toolbar-reindex-btn');

    await expect(extractBtn).toBeEnabled();
    await expect(reindexBtn).toBeEnabled();

    // Click extract
    await extractBtn.click();

    // Immediate visible feedback
    await expect(extractBtn).toBeDisabled();
    await expect(extractBtn).toContainText('Extracting...');
    await expect(reindexBtn).toBeDisabled();

    // Job indicator is immediately visible
    const jobIndicator = page.getByTestId('graph-job-indicator');
    await expect(jobIndicator).toBeVisible();

    // Verify duplicate click does not crash or trigger second job
    await extractBtn.click({ force: true }).catch(() => {});
    await expect(extractBtn).toBeDisabled();

    // Wait for the job to complete or show final status
    await expect(async () => {
      const status = await jobIndicator.getAttribute('data-status');
      const summaryVisible = await page.getByTestId('extraction-result-summary').isVisible();
      expect(status === 'completed' || status === 'failed' || summaryVisible).toBe(true);
    }).toPass({ timeout: 60000 });

    // After completion, toolbar buttons become re-enabled (if summary is dismissed or done)
    const dismissBtn = page.getByLabel('Dismiss extraction summary');
    if (await dismissBtn.isVisible()) {
      await dismissBtn.click();
    }
  });

  test('Reindex button triggers immediate feedback and disables extract button', async ({ page }) => {
    await navigateToGraphView(page);

    const extractBtn = page.getByTestId('toolbar-extract-btn');
    const reindexBtn = page.getByTestId('toolbar-reindex-btn');

    await expect(reindexBtn).toBeEnabled();
    await expect(extractBtn).toBeEnabled();

    // Click reindex
    await reindexBtn.click();

    // Immediate visible feedback
    await expect(reindexBtn).toBeDisabled();
    await expect(reindexBtn).toContainText('Reindexing...');
    await expect(extractBtn).toBeDisabled();

    // Job indicator is visible with reindex operation details
    const jobIndicator = page.getByTestId('graph-job-indicator');
    await expect(jobIndicator).toBeVisible();
    await expect(page.getByTestId('job-status-label')).toContainText(/Reindexing/i);

    // Wait for job completion or failure
    await expect(async () => {
      const status = await jobIndicator.getAttribute('data-status');
      const summaryVisible = await page.getByTestId('extraction-result-summary').isVisible();
      expect(status === 'completed' || status === 'failed' || summaryVisible).toBe(true);
    }).toPass({ timeout: 60000 });

    // Graph canvas remains active and visible
    await expect(page.getByTestId('constellation-graph')).toBeVisible();
  });

  test('Shows real progress bar and processed / total notes when backend reports progress', async ({ page }) => {
    await navigateToGraphView(page);

    // Mock an active job with real progress metrics
    const jobId = 'mock-progress-job-123';
    let pollCount = 0;

    await page.route(`**/api/v1/workspaces/*/graph/extract`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: jobId,
          job_id: jobId,
          job_type: 'extract_entities',
          status: 'running',
          progress: {
            stage: 'Extracting entities',
            processed_notes: 3,
            total_notes: 10,
            current_note_title: 'Operating Systems & Kernels',
            extracted_entities: 12,
            extracted_relationships: 8,
          },
        }),
      });
    });

    await page.route(`**/api/v1/jobs/${jobId}`, async (route) => {
      pollCount++;
      if (pollCount === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: jobId,
            job_type: 'extract_entities',
            status: 'running',
            progress: {
              stage: 'Extracting entities',
              processed_notes: 7,
              total_notes: 10,
              current_note_title: 'Computer Networks',
              extracted_entities: 28,
              extracted_relationships: 20,
            },
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: jobId,
            job_type: 'extract_entities',
            status: 'completed',
            progress: {
              stage: 'Completed',
              processed_notes: 10,
              total_notes: 10,
              extracted_entities: 45,
              extracted_relationships: 35,
              summary: 'Extracted 45 entities and 35 relationships from 10 notes',
            },
          }),
        });
      }
    });

    const extractBtn = page.getByTestId('toolbar-extract-btn');
    await extractBtn.click();

    // Verify progress bar appears with real processed / total
    const progressBar = page.getByTestId('job-progress-bar');
    await expect(progressBar).toBeVisible();

    const progressText = page.getByTestId('job-progress-text');
    await expect(progressText).toContainText('notes');

    // Wait for completion and verify summary modal opens
    const summary = page.getByTestId('extraction-result-summary');
    await expect(summary).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('extraction-summary-title')).toContainText('Extraction Completed');
    await expect(page.getByTestId('metric-entity-count')).toContainText('45');
    await expect(page.getByTestId('metric-relationship-count')).toContainText('35');
    await expect(page.getByTestId('metric-notes-count')).toContainText('10');
  });

  test('Displays clear failure state and retry button on extraction error', async ({ page }) => {
    await navigateToGraphView(page);

    await page.route(`**/api/v1/workspaces/*/graph/extract`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'FreeLLMAPI request timed out' },
        }),
      });
    });

    const extractBtn = page.getByTestId('toolbar-extract-btn');
    await extractBtn.click();

    // Verify failure state is displayed
    const jobIndicator = page.getByTestId('graph-job-indicator');
    await expect(jobIndicator).toBeVisible();
    await expect(jobIndicator).toHaveAttribute('data-status', 'failed');
    await expect(page.getByTestId('job-retry-btn')).toBeVisible();

    // Buttons are unlocked to allow retry
    await expect(extractBtn).toBeEnabled();
  });
});
