import { test, expect } from '@playwright/test';

test.describe('Source Import Workflows and Transport Reliability', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));
    page.on('response', (res) => {
      if (res.status() >= 400) console.log('HTTP ERROR:', res.status(), res.url());
    });
  });

  test('import supported file through Library', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: /^Library$/i }).click();
    await page.waitForTimeout(1000);

    // Click Import Sources button using robust locator
    const importBtn = page.locator('button:has-text("Import Sources")').first();
    await expect(importBtn).toBeVisible();
    await importBtn.click();

    // Verify modal is open
    await expect(page.getByText('Import Source Document')).toBeVisible();

    // Prepare buffer test file
    const testFile = {
      name: 'astronomical_catalog_entry.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Astronomical Catalog Entry\n\nObservations of Aldebaran and the Hyades cluster.\n'),
    };

    // Set file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    // Confirm file selected
    await expect(page.getByText('astronomical_catalog_entry.md')).toBeVisible();

    // Click Import to Archive button
    const submitBtn = page.locator('button:has-text("Import to Archive")');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Verify success feedback notification or catalog update
    await expect(page.getByText(/astronomical_catalog_entry/i)).toBeVisible();
    await expect(page.getByText('Import Source Document')).not.toBeVisible();
  });

  test('import supported file through Inbox review queue', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: /^Inbox$/i }).click();
    await page.waitForTimeout(1500);

    // Verify Inbox page loaded
    await expect(page.getByRole('heading', { name: /Knowledge Inbox/i })).toBeVisible();

    const inboxTestFile = {
      name: 'stellar_spectrometry_notes.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Stellar Spectrometry\n\nSpectroscopic lines of cluster stars.\n'),
    };

    // Upload via Inbox file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(inboxTestFile);

    // Wait for response
    await page.waitForTimeout(2000);

    // Verify item is present in list or notification shown
    const itemInList = page.locator('h3:has-text("stellar_spectrometry_notes.md")').first();
    await expect(itemInList).toBeVisible();
  });

  test('controlled failure returns structured error, not Failed to fetch', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: /^Library$/i }).click();
    await page.waitForTimeout(1000);

    const importBtn = page.locator('button:has-text("Import Sources")').first();
    await importBtn.click();
    await expect(page.getByText('Import Source Document')).toBeVisible();

    // Select unsupported file
    const invalidFile = {
      name: 'corrupted_archive.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('binary-junk'),
    };

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(invalidFile);

    // Verify meaningful error message (Unsupported format (.exe))
    await expect(page.getByText(/Unsupported format/i)).toBeVisible();
    // Assert it definitely is NOT "Failed to fetch"
    await expect(page.getByText('Failed to fetch')).not.toBeVisible();
  });
});