import { test, expect } from '@playwright/test';

test.describe('Library Shelves Capping and Document Preview', () => {
  test('Shelf capping limits items to 5 with expand toggle, preserving catalog', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#library');

    // Verify Library is rendered
    await expect(page.getByTestId('hyades-library')).toBeVisible({ timeout: 15000 });

    // Wait for catalog rows to load
    await expect(page.locator('.catalog-row').first()).toBeVisible({ timeout: 15000 });

    // Check shelf containers
    const topicContainer = page.getByTestId('library-topic-shelves-container');
    await expect(topicContainer).toBeVisible();

    // Verify at most 5 topic shelves are visible if not expanded
    const topicItems = topicContainer.locator('.shelf-item');
    const count = await topicItems.count();
    expect(count).toBeLessThanOrEqual(5);

    // If expand button exists, verify expand/collapse
    const expandBtn = page.getByTestId('library-expand-topics-btn');
    if (await expandBtn.count() > 0) {
      await expandBtn.click();
      await page.waitForTimeout(300);
      const expandedCount = await topicContainer.locator('.shelf-item').count();
      expect(expandedCount).toBeGreaterThanOrEqual(count);

      // Collapse back
      await expandBtn.click();
      await page.waitForTimeout(300);
      expect(await topicContainer.locator('.shelf-item').count()).toBe(count);
    }
  });

  test('Document Preview action opens formatted modal and preserves original file', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#library');

    // Verify Library is rendered and items loaded
    await expect(page.getByTestId('hyades-library')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.catalog-row').first()).toBeVisible({ timeout: 15000 });

    // Click on the first catalog item to ensure it is selected
    await page.locator('.catalog-row').first().click();

    // Verify preview button is visible in reading dossier
    const previewBtn = page.getByTestId('preview-document-btn');
    await expect(previewBtn).toBeVisible({ timeout: 10000 });

    // Click Document Preview
    await previewBtn.click();

    // Modal should be visible
    const previewModal = page.getByTestId('document-preview-modal');
    await expect(previewModal).toBeVisible({ timeout: 10000 });

    // Verify header and formatting
    await expect(page.getByText('Original file preserved in workspace vault without modifications.')).toBeVisible();

    // Screenshot open preview modal
    await page.screenshot({ path: 'screenshots/library-document-preview-modal.png' });

    // Close preview modal via close button
    const closeBtn = page.getByTestId('close-preview-btn');
    await closeBtn.click();
    await expect(previewModal).not.toBeVisible();
  });
});
