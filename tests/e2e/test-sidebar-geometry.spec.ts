import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'desktop-normal', width: 1280, height: 800 },
  { name: 'desktop-fullscreen', width: 1920, height: 1080 },
  { name: 'desktop-short', width: 1024, height: 600 },
  { name: 'tablet-narrow', width: 768, height: 900 },
];

for (const vp of viewports) {
  test('assert no sidebar overlap at ' + vp.name + ' (' + vp.width + 'x' + vp.height + ')', async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    if (vp.width < 768) {
      const toggle = page.getByTestId('mobile-nav-toggle');
      await expect(toggle).toBeVisible();
      await toggle.click();
      const mobileLib = page.getByTestId('mobile-nav-library');
      await expect(mobileLib).toBeVisible();
      await mobileLib.click();
    } else {
      const libraryTab = page.getByTestId('nav-item-library');
      await expect(libraryTab).toBeVisible();
      await libraryTab.click();
    }

    await page.waitForTimeout(1000);

    const extractBtn = page.getByRole('button', { name: /Extract All Notes/i });
    const headerEl = page.locator('header').first();

    await expect(extractBtn).toBeVisible();
    await expect(headerEl).toBeVisible();

    const extractBox = await extractBtn.boundingBox();
    const headerBox = await headerEl.boundingBox();

    expect(extractBox).not.toBeNull();
    expect(headerBox).not.toBeNull();

    // Verify header does not overlap the sidebar action buttons
    if (extractBox && headerBox) {
      const overlapX = Math.max(0, Math.min(extractBox.x + extractBox.width, headerBox.x + headerBox.width) - Math.max(extractBox.x, headerBox.x));
      const overlapY = Math.max(0, Math.min(extractBox.y + extractBox.height, headerBox.y + headerBox.height) - Math.max(extractBox.y, headerBox.y));
      const overlapArea = overlapX * overlapY;
      expect(overlapArea).toBe(0);
    }

    if (vp.name === 'desktop-short') {
      await page.screenshot({ path: 'screenshots/after-sidebar-fix-short.png' });
    } else if (vp.name === 'desktop-normal') {
      await page.screenshot({ path: 'screenshots/after-sidebar-fix-desktop.png' });
    }
  });
}
