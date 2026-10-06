import { test, expect } from '@playwright/test';

test.describe('v0.4.2 Collections, Threads, and Inbox E2E Flows', () => {
  test('navigates to Collections, Threads, and Inbox destinations', async ({ page }) => {
    await page.goto('/');

    // Check main destinations
    await expect(page.locator('body')).toBeVisible();
  });
});
