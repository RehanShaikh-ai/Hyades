import { test, expect } from '@playwright/test';

test.describe('Hyades Simplified Primary Navigation and Workspace Shell Architecture', () => {
  test('Desktop navigation across core destinations and workspace contextual menu', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForTimeout(1000);

    // 1. Verify Core Navigation Rail tabs
    const overviewTab = page.getByTestId('nav-item-overview');
    const libraryTab = page.getByTestId('nav-item-library');
    const observatoryTab = page.getByTestId('nav-item-observatory');
    const stellaTab = page.getByTestId('nav-item-stella');
    const workspaceMenuTrigger = page.getByTestId('nav-workspace-trigger');

    await expect(overviewTab).toBeVisible();
    await expect(libraryTab).toBeVisible();
    await expect(observatoryTab).toBeVisible();
    await expect(stellaTab).toBeVisible();
    await expect(workspaceMenuTrigger).toBeVisible();

    // Capture initial desktop overview
    await page.screenshot({ path: 'screenshots/navigation-desktop-overview.png' });

    // 2. Navigate to Library
    await libraryTab.click();
    await expect(page).toHaveURL(/#library/);
    await expect(page.locator('h1, h2', { hasText: /Library|Archival Catalog/i }).first()).toBeVisible();

    // 3. Navigate to Stella
    await stellaTab.click();
    await expect(page).toHaveURL(/#stella/);
    await expect(page.getByText('Stella Inquiries').first()).toBeVisible();

    // 4. Open Workspace Dropdown Menu
    await workspaceMenuTrigger.click();
    const workspaceMenu = page.getByTestId('nav-workspace-menu');
    await expect(workspaceMenu).toBeVisible();

    const collectionsMenuItem = page.getByTestId('header-workspace-collections');
    const threadsMenuItem = page.getByTestId('header-workspace-threads');
    const inboxMenuItem = page.getByTestId('header-workspace-inbox');

    await expect(collectionsMenuItem).toBeVisible();
    await expect(threadsMenuItem).toBeVisible();
    await expect(inboxMenuItem).toBeVisible();

    await page.screenshot({ path: 'screenshots/navigation-desktop-workspace-menu.png' });

    // 5. Navigate to Collections via Workspace menu
    await collectionsMenuItem.click();
    await expect(page).toHaveURL(/#collections/);
    await expect(page.getByTestId('hyades-collections')).toBeVisible();

    // Verify Workspace Sidebar is rendered in Workspace views
    const workspaceSidebar = page.getByTestId('workspace-sidebar');
    await expect(workspaceSidebar).toBeVisible();
    await expect(page.getByTestId('workspace-nav-collections')).toBeVisible();
    await expect(page.getByTestId('workspace-nav-threads')).toBeVisible();
    await expect(page.getByTestId('workspace-nav-inbox')).toBeVisible();

    await page.screenshot({ path: 'screenshots/navigation-workspace-collections.png' });

    // 6. Navigate to Threads via Workspace Sidebar
    await page.getByTestId('workspace-nav-threads').click();
    await expect(page).toHaveURL(/#threads/);
    await expect(page.getByTestId('hyades-threads')).toBeVisible();

    // 7. Navigate to Inbox via Workspace Sidebar
    await page.getByTestId('workspace-nav-inbox').click();
    await expect(page).toHaveURL(/#inbox/);
    await expect(page.getByTestId('hyades-inbox')).toBeVisible();

    // 8. Test Workspace Sidebar Collapse and Expand
    const sidebarToggle = page.getByTestId('workspace-sidebar-toggle');
    await expect(sidebarToggle).toBeVisible();

    // Collapse
    await sidebarToggle.click();
    await page.waitForTimeout(300);
    const collapsedState = await page.evaluate(() => localStorage.getItem('hyades_workspace_sidebar_collapsed'));
    expect(collapsedState).toBe('true');
    await page.screenshot({ path: 'screenshots/navigation-workspace-collapsed.png' });

    // Expand
    await sidebarToggle.click();
    await page.waitForTimeout(300);
    const expandedState = await page.evaluate(() => localStorage.getItem('hyades_workspace_sidebar_collapsed'));
    expect(expandedState).toBe('false');
  });

  test('Direct deep linking and browser back/forward history navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    // 1. Direct load of deep link #inbox
    await page.goto('/#inbox');
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('hyades-inbox')).toBeVisible();
    await expect(page.getByTestId('nav-workspace-trigger')).toContainText('Workspace: Inbox');

    // 2. Direct load of deep link #collections
    await page.goto('/#collections');
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('hyades-collections')).toBeVisible();
    await expect(page.getByTestId('nav-workspace-trigger')).toContainText('Workspace: Collections');

    // 3. Navigate from Collections to Library
    await page.getByTestId('nav-item-library').click();
    await expect(page).toHaveURL(/#library/);

    // 4. Browser Back -> should return to Collections
    await page.goBack();
    await expect(page).toHaveURL(/#collections/);
    await expect(page.getByTestId('hyades-collections')).toBeVisible();

    // 5. Browser Forward -> should return to Library
    await page.goForward();
    await expect(page).toHaveURL(/#library/);
  });

  test('Responsive behavior: Shorter desktop (1280x600) and Narrow Mobile Viewport (375x667)', async ({ page }) => {
    // 1. Shorter desktop
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto('/#overview');
    await page.waitForTimeout(800);

    // Verify header controls are aligned without wrapping
    await expect(page.getByTestId('nav-item-overview')).toBeVisible();
    await expect(page.getByTestId('active-workspace-badge')).toBeVisible();
    await expect(page.getByTestId('profile-bottom-left-btn')).toBeVisible();
    await page.screenshot({ path: 'screenshots/navigation-short-desktop.png' });

    // 2. Narrow mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForTimeout(800);

    // Mobile hamburger toggle must be visible, desktop nav rail hidden
    const mobileToggle = page.getByTestId('mobile-nav-toggle');
    await expect(mobileToggle).toBeVisible();
    await expect(page.getByTestId('nav-item-overview')).not.toBeVisible();

    // Open mobile navigation drawer
    await mobileToggle.click();
    const mobileDrawer = page.getByTestId('mobile-nav-drawer');
    await expect(mobileDrawer).toBeVisible();
    await expect(page.getByTestId('mobile-nav-overview')).toBeVisible();
    await expect(page.getByTestId('mobile-nav-library')).toBeVisible();
    await expect(page.getByTestId('mobile-nav-observatory')).toBeVisible();
    await expect(page.getByTestId('mobile-nav-stella')).toBeVisible();
    await expect(page.getByTestId('mobile-nav-collections')).toBeVisible();
    await expect(page.getByTestId('mobile-nav-threads')).toBeVisible();
    await expect(page.getByTestId('mobile-nav-inbox')).toBeVisible();

    await page.screenshot({ path: 'screenshots/navigation-mobile-drawer.png' });

    // Navigate to Inbox from mobile drawer
    await page.getByTestId('mobile-nav-inbox').click();
    await expect(mobileDrawer).not.toBeVisible();
    await expect(page).toHaveURL(/#inbox/);
    await expect(page.getByTestId('hyades-inbox')).toBeVisible();
  });
});
