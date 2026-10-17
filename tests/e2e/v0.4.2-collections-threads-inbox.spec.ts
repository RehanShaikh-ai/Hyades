import { test, expect, Page } from '@playwright/test';

test.describe('v0.4.2 Collections, Threads, Saved Views and Knowledge Inbox Flows', () => {
  test.setTimeout(90000);

  const mockWorkspace = {
    id: 'ws-v042-1',
    name: 'Research Observatory WS',
    owner_id: 'user-1',
    created_at: '2026-10-16T00:00:00Z',
    updated_at: '2026-10-16T00:00:00Z',
  };

  const mockUser = {
    id: 'user-1',
    username: 'rehan',
    display_name: 'Rehan',
    email: 'rehan@example.com',
    created_at: '2026-10-16T00:00:00Z',
    updated_at: '2026-10-16T00:00:00Z',
  };

  async function setupMockApis(page: Page) {
    await page.route('**/api/v1/users', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [mockUser], total: 1 }),
      });
    });

    await page.route('**/api/v1/workspaces', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [mockWorkspace], total: 1 }),
      });
    });

    await page.route('**/api/v1/collections*', async (route) => {
      if (route.request().method() === 'GET' && route.request().url().includes('/items')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 50 }),
        });
      } else if (route.request().method() === 'GET' && route.request().url().includes('/stats')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ collection_id: 'coll-1', total_items: 0, by_type: {} }),
        });
      } else if (route.request().method() === 'GET' && route.request().url().includes('/related')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ collection_id: 'coll-1', related_entities: [], total_related: 0 }),
        });
      } else if (route.request().method() === 'POST') {
        const data = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'coll-e2e-1',
            workspace_id: 'ws-v042-1',
            name: data.name,
            description: data.description,
            created_by: 'user-1',
            created_at: '2026-10-16T00:00:00Z',
            updated_at: '2026-10-16T00:00:00Z',
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 20 }),
        });
      }
    });

    await page.route('**/api/v1/threads*', async (route) => {
      if (route.request().method() === 'POST') {
        const data = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'th-e2e-1',
            workspace_id: 'ws-v042-1',
            title: data.title,
            guiding_question: data.guiding_question,
            status: 'active',
            created_by: 'user-1',
            created_at: '2026-10-16T00:00:00Z',
            updated_at: '2026-10-16T00:00:00Z',
            questions: [],
            discoveries: [],
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 20 }),
        });
      }
    });

    await page.route('**/api/v1/inbox*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 20 }),
      });
    });

    await page.goto('/');

    const openWsBtn = page.locator('[data-testid^="open-workspace-"]').first();
    if (await openWsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await openWsBtn.click();
    } else {
      const continueWsBtn = page.getByTestId('continue-to-workspaces');
      if (await continueWsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await continueWsBtn.click();
      }
      const continueNotesBtn = page.getByTestId('continue-to-notes');
      if (await continueNotesBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await continueNotesBtn.click();
      }
    }
  }

  test('user can navigate to Collections and see empty state or create collection', async ({ page }) => {
    await setupMockApis(page);

    await page.getByTestId('nav-workspace-trigger').click();
    const collBtn = page.getByTestId('header-workspace-collections');
    await expect(collBtn).toBeVisible({ timeout: 5000 });
    await collBtn.click();

    await expect(page.locator('[data-testid="hyades-collections"]')).toBeVisible();
    await expect(page.locator('h2', { hasText: 'Collections' })).toBeVisible();
  });

  test('user can navigate to Threads and see thread workspace', async ({ page }) => {
    await setupMockApis(page);

    await page.getByTestId('nav-workspace-trigger').click();
    const threadsBtn = page.getByTestId('header-workspace-threads');
    await expect(threadsBtn).toBeVisible({ timeout: 5000 });
    await threadsBtn.click();

    await expect(page.locator('[data-testid="hyades-threads"]')).toBeVisible();
    await expect(page.locator('h2', { hasText: 'Research Threads' })).toBeVisible();
  });

  test('user can navigate to Inbox and view review panel', async ({ page }) => {
    await setupMockApis(page);

    await page.getByTestId('nav-workspace-trigger').click();
    const inboxBtn = page.getByTestId('header-workspace-inbox');
    await expect(inboxBtn).toBeVisible({ timeout: 5000 });
    await inboxBtn.click();

    await expect(page.locator('[data-testid="hyades-inbox"]')).toBeVisible();
    await expect(page.locator('h2', { hasText: 'Knowledge Inbox' })).toBeVisible();
  });

  test('user can create a collection and view newly created collection', async ({ page }) => {
    let collectionsList: any[] = [];
    await setupMockApis(page);

    await page.route('**/api/v1/collections*', async (route) => {
      if (route.request().method() === 'POST') {
        const data = route.request().postDataJSON();
        const newCol = {
          id: 'coll-e2e-created',
          workspace_id: 'ws-v042-1',
          name: data.name,
          description: data.description,
          created_by: 'user-1',
          created_at: '2026-10-16T00:00:00Z',
          updated_at: '2026-10-16T00:00:00Z',
        };
        collectionsList.push(newCol);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(newCol),
        });
      } else if (route.request().url().includes('/items')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 50 }),
        });
      } else if (route.request().url().includes('/stats')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ collection_id: 'coll-e2e-created', total_items: 0, by_type: {} }),
        });
      } else if (route.request().url().includes('/related')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ collection_id: 'coll-e2e-created', related_entities: [], total_related: 0 }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: collectionsList, total: collectionsList.length, page: 1, page_size: 20 }),
        });
      }
    });

    await page.getByTestId('nav-workspace-trigger').click();
    const collBtn = page.getByTestId('header-workspace-collections');
    await expect(collBtn).toBeVisible({ timeout: 5000 });
    await collBtn.click();

    await page.getByPlaceholder('Collection name...').fill('Astrophysics Literature');
    await page.getByPlaceholder('Description (optional)...').fill('Curated papers on stellar evolution');
    await page.getByRole('button', { name: 'Create Collection' }).click();

    await expect(page.getByRole('heading', { name: 'Astrophysics Literature' }).first()).toBeVisible({ timeout: 5000 });
  });

  test('user can create a thread with guiding question', async ({ page }) => {
    let threadsList: any[] = [];
    await setupMockApis(page);

    await page.route('**/api/v1/threads*', async (route) => {
      if (route.request().method() === 'POST') {
        const data = route.request().postDataJSON();
        const newTh = {
          id: 'th-e2e-created',
          workspace_id: 'ws-v042-1',
          title: data.title,
          guiding_question: data.guiding_question,
          status: 'active',
          created_by: 'user-1',
          created_at: '2026-10-16T00:00:00Z',
          updated_at: '2026-10-16T00:00:00Z',
          questions: [],
          discoveries: [],
        };
        threadsList.push(newTh);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(newTh),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: threadsList, total: threadsList.length, page: 1, page_size: 20 }),
        });
      }
    });

    await page.getByTestId('nav-workspace-trigger').click();
    const threadsBtn = page.getByTestId('header-workspace-threads');
    await expect(threadsBtn).toBeVisible({ timeout: 5000 });
    await threadsBtn.click();

    await page.getByPlaceholder('Thread title...').fill('Stellar Nucleosynthesis');
    await page.getByPlaceholder('Guiding question (optional)...').fill('How do carbon-oxygen cores ignite?');
    await page.getByRole('button', { name: 'Create Thread' }).click();

    await expect(page.getByRole('heading', { name: 'Stellar Nucleosynthesis' }).first()).toBeVisible({ timeout: 5000 });
  });

  test('user can reject an inbox item and trigger permanent safe cleanup', async ({ page }) => {
    const itemDetail = {
      id: 'inbox-item-reject-1',
      workspace_id: 'ws-v042-1',
      source_id: 'src-reject-1',
      source_title: 'Unwanted Document.docx',
      source_type: 'docx',
      status: 'pending',
      detection_status: 'completed',
      detected_count: 1,
      detected_concepts: [{ name: 'Supernova', score: 0.95 }],
      created_at: '2026-10-16T00:00:00Z',
      updated_at: '2026-10-16T00:00:00Z',
    };
    let inboxItems = [itemDetail];

    await setupMockApis(page);

    await page.route(/\/api\/v1\/inbox/, async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (method === 'POST' && url.includes('/reject')) {
        inboxItems = [];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'inbox-item-reject-1',
            status: 'rejected',
            cleanup_completed: true,
          }),
        });
      } else if (method === 'GET' && url.includes('/inbox-item-reject-1')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(itemDetail),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: inboxItems, total: inboxItems.length, page: 1, page_size: 20 }),
        });
      }
    });

    await page.getByTestId('nav-workspace-trigger').click();
    const inboxBtn = page.getByTestId('header-workspace-inbox');
    await expect(inboxBtn).toBeVisible({ timeout: 5000 });
    await inboxBtn.click();


    await expect(page.getByRole('heading', { name: 'Unwanted Document.docx' }).first()).toBeVisible({ timeout: 5000 });

    const rejectBtn = page.getByRole('button', { name: /^Reject$/i });
    await expect(rejectBtn).toBeVisible({ timeout: 5000 });
    await rejectBtn.click();

    await expect(page.getByText('Confirm Rejection')).toBeVisible();
    const permRejectBtn = page.getByRole('button', { name: 'Permanently Reject' });
    await expect(permRejectBtn).toBeVisible();
    await permRejectBtn.click();

    await expect(page.getByText('Confirm Rejection')).not.toBeVisible();
  });
});
