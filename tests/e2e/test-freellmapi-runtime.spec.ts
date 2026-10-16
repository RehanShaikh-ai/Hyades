import { test, expect } from '@playwright/test';

test.describe('FreeLLMAPI Local Runtime Discovery and Guided Setup', () => {
  test('Account modal displays Local AI & FreeLLMAPI panel with live diagnostics and controls', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Open Account Modal via header profile button
    const profileBtn = page.getByTestId('profile-bottom-left-btn');
    await expect(profileBtn).toBeVisible();
    await profileBtn.click();

    // Verify modal is visible
    const modalTitle = page.getByRole('heading', { name: /Account & Workspace Setup/i });
    await expect(modalTitle).toBeVisible();

    // Click Local AI & FreeLLMAPI tab
    const localAiTab = page.getByRole('button', { name: /Local AI & FreeLLMAPI/i });
    await expect(localAiTab).toBeVisible();
    await localAiTab.click();

    // Verify runtime panel heading
    await expect(page.getByText('FreeLLMAPI Local Runtime')).toBeVisible();

    // Verify endpoint diagnostic card
    await expect(page.getByText('Service Endpoint')).toBeVisible();

    // Verify auto-start toggle
    const autoStartToggle = page.locator('input[type="checkbox"]');
    await expect(autoStartToggle).toBeVisible();
    await expect(autoStartToggle).not.toBeChecked();

    // Toggle auto-start
    await autoStartToggle.check();
    await expect(autoStartToggle).toBeChecked();
    await expect(page.getByText(/Automatic startup preference enabled/i)).toBeVisible();

    // Verify localStorage persistence
    const savedAutoStart = await page.evaluate(() => localStorage.getItem('hyades_freellmapi_autostart'));
    expect(savedAutoStart).toBe('true');

    // Test Connection button
    const testConnBtn = page.getByRole('button', { name: /Test Connection/i });
    await expect(testConnBtn).toBeVisible();
    await testConnBtn.click();
    await page.waitForTimeout(1000);

    // Verify Guided Setup instructions are rendered
    await expect(page.getByText('Guided Setup & Installation Instructions')).toBeVisible();
    await expect(page.getByText('Option 1: Run Locally via Node.js')).toBeVisible();
    await expect(page.getByText('Option 2: Run via Docker One-Liner')).toBeVisible();

    // Screenshot of the Local AI & FreeLLMAPI panel
    await page.screenshot({ path: 'screenshots/freellmapi-runtime-panel.png' });
  });
});