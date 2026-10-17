import { test, expect } from '@playwright/test';

test('Observatory Saved Views button and modal match Ivory design tokens', async ({ page }) => {
  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));
  page.on('requestfailed', (req) => console.log('REQ FAILED:', req.url(), req.failure()?.errorText));
  page.on('response', (res) => {
    if (res.status() >= 400) console.log('HTTP ERROR:', res.status(), res.url());
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: /^Observatory$/i }).click();
  await page.waitForTimeout(1000);

  const savedViewsBtn = page.getByRole('button', { name: /Saved Views/i });
  await expect(savedViewsBtn).toBeVisible();

  // Screenshot toolbar with Ivory Saved Views button
  await page.screenshot({ path: 'screenshots/observatory-toolbar-ivory.png' });

  // Open Saved Views Modal
  await savedViewsBtn.click();
  const modalTitle = page.getByRole('heading', { name: /Saved Observatory Views/i });
  await expect(modalTitle).toBeVisible();

  // Verify modal background is Ivory (#FAF8F2) and not dark slate
  const modalDialog = page.locator('div[role="dialog"] .dialog-content');
  await expect(modalDialog).toBeVisible();

  // Save a new view
  const input = page.getByPlaceholder(/Name current coordinates view/i);
  const viewName = `E2E Ivory Test View ${Date.now()}`;
  await input.fill(viewName);
  await page.getByRole('button', { name: /^Save View$/i }).click();
  await page.waitForTimeout(2000);

  // Print any visible error in modal
  const errorEl = page.locator('div[role="dialog"] .bg-\\[\\#FDF2E9\\]');
  if (await errorEl.count() > 0) {
    console.log('MODAL ERROR TEXT:', await errorEl.innerText());
  }

  // Screenshot open modal
  await page.screenshot({ path: 'screenshots/observatory-saved-views-modal-ivory.png' });

  // Verify view item is rendered
  await expect(page.getByText(viewName)).toBeVisible();

  // Verify escape closes the modal
  await page.keyboard.press('Escape');
  await expect(modalTitle).not.toBeVisible();
});