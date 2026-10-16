import { test, expect } from '@playwright/test';

test('Live test of Collections, Threads, and Inbox on running frontend without mocks', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const failedRequests: string[] = [];
  page.on('response', (res) => {
    if (res.status() >= 400) {
      failedRequests.push(`${res.request().method()} ${res.url()} -> ${res.status()}`);
    }
  });

  await page.setViewportSize({ width: 1280, height: 800 });

  // 1. Load Collections
  console.log('Navigating to /#collections...');
  await page.goto('/#collections');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/live-collections-load.png' });

  // 2. Load Threads
  console.log('Navigating to /#threads...');
  await page.goto('/#threads');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/live-threads-load.png' });

  // 3. Load Inbox
  console.log('Navigating to /#inbox...');
  await page.goto('/#inbox');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/live-inbox-load.png' });

  console.log('Console errors:', consoleErrors);
  console.log('Failed requests:', failedRequests);
});
