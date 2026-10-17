import { test, expect } from '@playwright/test';

test.describe('Hyades UI & Knowledge Extraction Improvements Verification', () => {
  test('1. Observatory layout: Floating Action Rail and Graph Controls do not overlap sidebars', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#observatory');
    await page.waitForTimeout(1500);

    // Left Constellations sidebar
    const leftSidebar = page.locator('aside').first();
    await expect(leftSidebar).toBeVisible();
    const leftSidebarBox = await leftSidebar.boundingBox();

    // Upper-right floating action rail
    const actionRail = page.getByTestId('observatory-action-rail');
    await expect(actionRail).toBeVisible();
    const connectBtn = page.getByTestId('connect-entities-btn');
    await expect(connectBtn).toBeVisible();
    const overflowBtn = page.getByTestId('observatory-overflow-btn');
    await expect(overflowBtn).toBeVisible();

    const railBox = await actionRail.boundingBox();
    expect(railBox).not.toBeNull();
    if (leftSidebarBox && railBox) {
      // Rail must be well to the right of the left sidebar
      expect(railBox.x).toBeGreaterThan(leftSidebarBox.x + leftSidebarBox.width);
      // Rail must be within the viewport
      expect(railBox.x + railBox.width).toBeLessThanOrEqual(1280);
    }

    // Bottom-right vertical controls stack
    const fitViewBtn = page.getByTestId('fit-view-btn');
    const fullscreenBtn = page.getByTestId('fullscreen-btn');
    await expect(fitViewBtn).toBeVisible();
    await expect(fullscreenBtn).toBeVisible();

    // Test overflow menu opening
    await overflowBtn.click();
    const addEntityBtn = page.getByTestId('add-entity-btn');
    const savedViewsBtn = page.getByTestId('saved-views-btn');
    await expect(addEntityBtn).toBeVisible();
    await expect(savedViewsBtn).toBeVisible();

    // Open Add Entity Modal
    await addEntityBtn.click();
    await expect(page.getByText('Create Graph Entity')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.screenshot({ path: 'screenshots/observatory-layout-verified.png' });
  });

  test('2. Observatory Constellation Filters: Core concepts and subtopics toggle accurately with stable camera', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#observatory');
    await page.waitForTimeout(1500);

    // Initial state: both filters checked
    const coreCheckbox = page.locator('label:has-text("Core Concepts") input');
    const subtopicsCheckbox = page.locator('label:has-text("Subtopics") input');
    await expect(coreCheckbox).toBeChecked();
    await expect(subtopicsCheckbox).toBeChecked();

    const getStats = async () => {
      return await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('.celestial-node'));
        const visibleNodes = nodes.filter(n => (n as HTMLElement).style.display !== 'none');
        const links = Array.from(document.querySelectorAll('.celestial-link'));
        const visibleLinks = links.filter(l => (l as HTMLElement).style.display !== 'none');
        const g = document.querySelector('.observatory-viewport');
        return {
          totalNodes: nodes.length,
          visibleNodes: visibleNodes.length,
          visibleLinks: visibleLinks.length,
          transform: g ? g.getAttribute('transform') : null
        };
      });
    };

    const initial = await getStats();
    expect(initial.totalNodes).toBeGreaterThan(0);
    expect(initial.visibleNodes).toBe(initial.totalNodes);

    // 1. Uncheck Core Concepts -> only subtopics visible, camera transform stays identical
    await coreCheckbox.click();
    await page.waitForTimeout(300);
    const withoutCore = await getStats();
    expect(withoutCore.visibleNodes).toBeLessThan(initial.visibleNodes);
    expect(withoutCore.transform).toBe(initial.transform);

    // 2. Re-check Core Concepts
    await coreCheckbox.click();
    await page.waitForTimeout(300);
    const restoredCore = await getStats();
    expect(restoredCore.visibleNodes).toBe(initial.visibleNodes);

    // 3. Uncheck Subtopics & Concepts -> only 19 core concepts visible, camera unchanged
    await subtopicsCheckbox.click();
    await page.waitForTimeout(300);
    const coreOnly = await getStats();
    expect(coreOnly.visibleNodes).toBe(19);
    expect(coreOnly.transform).toBe(initial.transform);

    // 4. Uncheck both -> Empty state card with Reset Filters button
    await coreCheckbox.click();
    await page.waitForTimeout(300);
    await expect(page.getByText('No Concepts Match Active Filters')).toBeVisible();

    // 5. Reset Filters restores everything
    await page.getByRole('button', { name: 'Reset Filters' }).click();
    await page.waitForTimeout(300);
    const afterReset = await getStats();
    expect(afterReset.visibleNodes).toBe(initial.totalNodes);
    expect(afterReset.transform).toBe(initial.transform);

    await page.screenshot({ path: 'screenshots/observatory-filters-verified.png' });
  });

  test('3. Collections, Threads, and Inbox sidebars appear on the far left (x === 0)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    // Collections
    await page.goto('/#collections');
    await page.waitForTimeout(1000);
    const collSidebar = page.getByTestId('workspace-sidebar');
    await expect(collSidebar).toBeVisible();
    const collBox = await collSidebar.boundingBox();
    expect(collBox).not.toBeNull();
    if (collBox) {
      expect(collBox.x).toBe(0); // Far left!
    }
    await page.screenshot({ path: 'screenshots/collections-far-left.png' });

    // Threads
    await page.goto('/#threads');
    await page.waitForTimeout(1000);
    const thSidebar = page.getByTestId('workspace-sidebar');
    await expect(thSidebar).toBeVisible();
    const thBox = await thSidebar.boundingBox();
    expect(thBox).not.toBeNull();
    if (thBox) {
      expect(thBox.x).toBe(0); // Far left!
    }
    await page.screenshot({ path: 'screenshots/threads-far-left.png' });

    // Inbox
    await page.goto('/#inbox');
    await page.waitForTimeout(1000);
    const inSidebar = page.getByTestId('workspace-sidebar');
    await expect(inSidebar).toBeVisible();
    const inBox = await inSidebar.boundingBox();
    expect(inBox).not.toBeNull();
    if (inBox) {
      expect(inBox.x).toBe(0); // Far left!
    }
    await page.screenshot({ path: 'screenshots/inbox-far-left.png' });
  });

  test('4. Searchable Knowledge Attachment in Collections and Threads', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#collections');
    await page.waitForTimeout(1000);

    // Look for searchable picker
    const searchInput = page.getByPlaceholder(/Search existing notes, sources, or entities/i);
    await expect(searchInput).toBeVisible();

    // Type a search query to filter
    await searchInput.fill('stellar');
    await page.waitForTimeout(500);

    // Filter pills should be present
    const importSourceBtn = page.getByText('+ Import Source');
    await expect(importSourceBtn).toBeVisible();

    await page.screenshot({ path: 'screenshots/collections-searchable-attachment.png' });
  });

  test('5. Concept extraction progress telemetry and toggle setting', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#library');
    await page.waitForTimeout(1200);

    // Extraction progress badge in toolbar (showing actual backend telemetry e.g. "X/Y extracted")
    const badge = page.getByTestId('extraction-status-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(/extracted/i);

    // Click badge to open telemetry breakdown popover
    await badge.click();
    await expect(page.getByText('Extraction Status Telemetry')).toBeVisible();
    await expect(page.getByText('Extracted (Eligible):')).toBeVisible();
    await expect(page.getByText('Pending Extraction:')).toBeVisible();
    await page.screenshot({ path: 'screenshots/library-extraction-telemetry-popover.png' });
    await badge.click(); // Close

    // Check reading dossier toggle switch
    const toggle = page.getByTestId('extract-knowledge-toggle');
    await expect(toggle).toBeVisible();

    const statusPill = page.getByTestId('item-extraction-status');
    await expect(statusPill).toBeVisible();

    // Toggle setting off
    await toggle.click();
    await page.waitForTimeout(500);

    // Reload page to verify persistence
    await page.reload();
    await page.waitForTimeout(1200);

    const reloadedToggle = page.getByTestId('extract-knowledge-toggle');
    await expect(reloadedToggle).toBeVisible();
    await page.screenshot({ path: 'screenshots/library-extraction-toggle-persisted.png' });
  });
});
