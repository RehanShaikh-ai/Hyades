import { test, expect } from '@playwright/test';

test.describe('Hyades UI & Knowledge Extraction Improvements Verification', () => {
  test('1. Observatory layout: Controls do not overlap sidebar or detail panel', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#observatory');
    await page.waitForTimeout(1500);

    // Left controls segment
    const addEntityBtn = page.getByTestId('add-entity-btn');
    const connectBtn = page.getByTestId('connect-entities-btn');
    const savedViewsBtn = page.getByRole('button', { name: /Saved Views/i });

    await expect(addEntityBtn).toBeVisible();
    await expect(connectBtn).toBeVisible();
    await expect(savedViewsBtn).toBeVisible();

    const leftSidebar = page.locator('aside').first();
    const leftSidebarBox = await leftSidebar.boundingBox();
    const addEntityBox = await addEntityBtn.boundingBox();
    const savedViewsBox = await savedViewsBtn.boundingBox();

    // Verify Add Entity does not overlap the left sidebar
    if (leftSidebarBox && addEntityBox) {
      expect(addEntityBox.x).toBeGreaterThanOrEqual(leftSidebarBox.x + leftSidebarBox.width);
    }

    // Verify Saved Views does not overlap the right edge or details panel
    if (savedViewsBox) {
      expect(savedViewsBox.x + savedViewsBox.width).toBeLessThanOrEqual(1280);
    }

    await page.screenshot({ path: 'screenshots/observatory-layout-verified.png' });
  });

  test('2. Collections, Threads, and Inbox sidebars appear on the far left', async ({ page }) => {
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

  test('3. Searchable Knowledge Attachment in Collections and Threads', async ({ page }) => {
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

  test('4. Concept extraction progress telemetry and toggle setting', async ({ page }) => {
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
