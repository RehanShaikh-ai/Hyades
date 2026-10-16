import { test, expect } from '@playwright/test';

test.describe('Knowledge Inbox Status Transitions & Action Visibility', () => {
  test('Pending item accept and reject lifecycle, filter accuracy, and action gating', async ({ page }) => {
    const timestamp = Date.now();
    const acceptFileName = `accept_${timestamp}.txt`;
    const rejectFileName = `reject_${timestamp}.txt`;

    // 1. Navigate to Hyades
    await page.goto('/');
    await page.waitForSelector('.hyades-header');

    // 2. Open Inbox
    const inboxTab = page.locator('button[aria-label="Inbox"], .nav-rail button:has-text("Inbox"), [data-testid="nav-inbox"]');
    await inboxTab.first().click();
    await page.waitForSelector('[data-testid="hyades-inbox"]');

    // 3. Upload a file for testing accept
    const filePayload1 = {
      name: acceptFileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(`Testing Knowledge Inbox Acceptance workflow ${timestamp}`),
    };

    const fileChooserPromise1 = page.waitForEvent('filechooser');
    await page.locator('label:has-text("Import File")').click();
    const fileChooser1 = await fileChooserPromise1;
    await fileChooser1.setFiles(filePayload1);

    // Wait for upload message
    await expect(page.locator(`text=${acceptFileName}`)).toBeVisible({ timeout: 10000 });

    // Item should appear in Pending list and be selected
    const pendingFilter = page.locator('aside button:has-text("pending")');
    await pendingFilter.click();
    const pendingItem1 = page.locator(`h3:has-text("${acceptFileName}"), h3:has-text("Testing Knowledge Inbox Acceptance workflow ${timestamp}")`).first();
    await expect(pendingItem1).toBeVisible({ timeout: 5000 });

    // Detail panel should show Accept, Reject, and Re-detect buttons
    await expect(page.locator('[data-testid="inbox-accept-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="inbox-reject-btn"]')).toBeVisible();

    // 4. Accept the item
    await page.locator('[data-testid="inbox-accept-btn"]').click();
    await expect(page.locator('text=accepted into Library catalog')).toBeVisible({ timeout: 10000 });

    // In Pending filter, the accepted item should now be ABSENT
    await expect(page.locator(`h3:has-text("${acceptFileName}")`)).toHaveCount(0);

    // In Accepted filter, the item should be PRESENT
    const acceptedFilter = page.locator('aside button:has-text("accepted")');
    await acceptedFilter.click();
    const acceptedItem = page.locator(`h3:has-text("${acceptFileName}"), h3:has-text("Testing Knowledge Inbox Acceptance workflow ${timestamp}")`).first();
    await expect(acceptedItem).toBeVisible({ timeout: 5000 });
    await acceptedItem.click();

    // Detail panel in Accepted state MUST NOT show Accept or Reject buttons
    await expect(page.locator('[data-testid="inbox-accept-btn"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="inbox-reject-btn"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="inbox-status-accepted-banner"]')).toBeVisible();

    // 5. Upload another file for testing reject
    const filePayload2 = {
      name: rejectFileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(`Testing Knowledge Inbox Rejection and status audit retention ${timestamp}`),
    };

    const fileChooserPromise2 = page.waitForEvent('filechooser');
    await page.locator('label:has-text("Import File")').click();
    const fileChooser2 = await fileChooserPromise2;
    await fileChooser2.setFiles(filePayload2);

    await expect(page.locator(`text=${rejectFileName}`)).toBeVisible({ timeout: 10000 });

    // Switch to Pending filter
    await pendingFilter.click();
    const pendingItem2 = page.locator(`h3:has-text("${rejectFileName}"), h3:has-text("Testing Knowledge Inbox Rejection and status audit retention ${timestamp}")`).first();
    await expect(pendingItem2).toBeVisible({ timeout: 5000 });
    await pendingItem2.click();

    // Detail panel shows buttons
    await expect(page.locator('[data-testid="inbox-reject-btn"]')).toBeVisible();

    // Reject with confirmation modal
    await page.locator('[data-testid="inbox-reject-btn"]').click();
    const confirmModal = page.locator('h3:has-text("Confirm Rejection")');
    await expect(confirmModal).toBeVisible({ timeout: 5000 });
    await page.locator('button:has-text("Permanently Reject")').click();

    await expect(page.locator('text=permanently rejected and purged')).toBeVisible({ timeout: 10000 });

    // In Pending filter, the rejected item should now be ABSENT
    await expect(page.locator(`h3:has-text("${rejectFileName}")`)).toHaveCount(0);

    // In Rejected filter, the item should be PRESENT
    const rejectedFilter = page.locator('aside button:has-text("rejected")');
    await rejectedFilter.click();
    const rejectedItem = page.locator(`h3:has-text("${rejectFileName}"), h3:has-text("Testing Knowledge Inbox Rejection and status audit retention ${timestamp}")`).first();
    await expect(rejectedItem).toBeVisible({ timeout: 5000 });
    await rejectedItem.click();

    // Detail panel in Rejected state MUST NOT show Accept or Reject buttons
    await expect(page.locator('[data-testid="inbox-accept-btn"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="inbox-reject-btn"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="inbox-status-rejected-banner"]')).toBeVisible();

    // 6. Test 'All' filter
    const allFilter = page.locator('aside button:has-text("all")');
    await allFilter.click();
    await expect(page.locator(`h3:has-text("${acceptFileName}"), h3:has-text("Testing Knowledge Inbox Acceptance workflow ${timestamp}")`).first()).toBeVisible();
    await expect(page.locator(`h3:has-text("${rejectFileName}"), h3:has-text("Testing Knowledge Inbox Rejection and status audit retention ${timestamp}")`).first()).toBeVisible();
  });
});
