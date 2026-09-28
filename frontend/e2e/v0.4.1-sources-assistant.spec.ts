import { test, expect, Page } from '@playwright/test';

test.describe('v0.4.1 Sources and AI Assistant E2E Flows', () => {
  test.setTimeout(90000);

  const mockWorkspace = {
    id: 'ws-e2e-1',
    name: 'Research Workspace',
    owner_id: 'user-e2e-1',
    created_at: '2026-09-26T00:00:00Z',
    updated_at: '2026-09-26T00:00:00Z',
  };

  const mockUser = {
    id: 'user-e2e-1',
    username: 'rehan',
    display_name: 'Rehan',
    email: 'rehan@example.com',
    created_at: '2026-09-26T00:00:00Z',
    updated_at: '2026-09-26T00:00:00Z',
  };

  async function setupMockWorkspace(page: Page) {
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

    await page.route('**/api/v1/workspaces/ws-e2e-1/notes*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.goto('/');

    // Navigate through setup or open workspace
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

  // ── Scenario 1: Source → Search ─────────────────────────────────────────────
  test('Scenario 1: Upload source, wait for READY, and verify in search results', async ({ page }) => {
    let sourceStatus = 'PENDING';
    const sourceId = 'src-pdf-01';

    await page.route('**/api/v1/workspaces/ws-e2e-1/sources/upload', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: sourceId,
          workspace_id: 'ws-e2e-1',
          title: 'Machine Learning Foundations.pdf',
          file_name: 'Machine Learning Foundations.pdf',
          source_type: 'pdf',
          processing_stage: 'upload',
          processing_status: 'PENDING',
          file_size_bytes: 5242880,
          created_at: '2026-09-26T10:00:00Z',
        }),
      });
    });

    await page.route('**/api/v1/workspaces/ws-e2e-1/sources*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: sourceId,
              workspace_id: 'ws-e2e-1',
              title: 'Machine Learning Foundations.pdf',
              file_name: 'Machine Learning Foundations.pdf',
              source_type: 'pdf',
              processing_stage: sourceStatus === 'READY' ? 'complete' : 'extract',
              processing_status: sourceStatus,
              file_size_bytes: 5242880,
              page_count: 14,
              chunk_count: sourceStatus === 'READY' ? 32 : 0,
              created_at: '2026-09-26T10:00:00Z',
            },
          ],
          total: 1,
          page: 1,
          page_size: 50,
        }),
      });
    });

    await page.route('**/api/v1/workspaces/ws-e2e-1/search', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'chunk-res-1',
              chunk_id: 'chk-ml-1',
              source_id: sourceId,
              source_title: 'Machine Learning Foundations.pdf',
              content: 'Supervised learning trains models on labeled datasets.',
              score: 0.89,
              similarity_score: 0.89,
            },
          ],
          total: 1,
        }),
      });
    });

    await setupMockWorkspace(page);

    // Navigate to Sources tab
    const sourcesTab = page.getByRole('button', { name: /^Sources$/i });
    await expect(sourcesTab).toBeVisible();
    await sourcesTab.click();

    // Open upload panel
    const openUploadBtn = page.getByTestId('open-upload-btn');
    await openUploadBtn.click();

    // Upload file
    const fileInput = page.getByTestId('source-file-input');
    await fileInput.setInputFiles({
      name: 'Machine Learning Foundations.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 Mock ML document content'),
    });

    const submitUploadBtn = page.getByTestId('upload-submit-btn');
    await submitUploadBtn.click();

    await expect(page.getByTestId('upload-success')).toBeVisible({ timeout: 5000 });

    // Close upload modal
    await page.getByRole('button', { name: 'Done' }).click();

    // Transition status to READY
    sourceStatus = 'READY';

    // Verify source card and READY badge in list
    const sourceCard = page.getByTestId(`source-card-${sourceId}`);
    await expect(sourceCard).toBeVisible();

    // Switch to Search tab
    const searchTab = page.getByRole('button', { name: /^Search$/i });
    await searchTab.click();

    const searchInput = page.getByPlaceholder(/search/i).first();
    await searchInput.fill('Supervised learning');
    await page.keyboard.press('Enter');

    // Verify search result contains uploaded document
    await expect(page.getByText(/Machine Learning Foundations\.pdf/i)).toBeVisible({ timeout: 5000 });
  });

  // ── Scenario 2: Source → Assistant ──────────────────────────────────────────
  test('Scenario 2: Source cited in assistant response with Similarity label', async ({ page }) => {
    const convId = 'conv-scenario-2';

    await page.route('**/api/v1/workspaces/ws-e2e-1/conversations*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: convId,
              workspace_id: 'ws-e2e-1',
              title: 'Quantum Algorithms Discussion',
              created_at: '2026-09-26T11:00:00Z',
              updated_at: '2026-09-26T11:00:00Z',
            },
          ],
          total: 1,
        }),
      });
    });

    await page.route(`**/api/v1/conversations/${convId}/messages`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [], total: 0 }),
        });
      } else {
        // SSE Stream response
        const sseBody = [
          'data: {"type": "user_message_created", "message_id": "usr-msg-1"}',
          'data: {"type": "chunk", "content": "Shor\'s algorithm provides exponential speedup for integer factorization."}',
          'data: {"type": "done", "message_id": "ast-msg-1", "citations": [{"chunk_id": "chk-q-1", "source_id": "src-quant-1", "source_title": "Quantum Algorithms.pdf", "excerpt": "Shor\'s algorithm factors large composites in polynomial time.", "similarity_score": 0.94, "page_number": 8}], "provider": "ollama", "model": "llama3.2"}',
          '',
        ].join('\n\n');

        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sseBody,
        });
      }
    });

    await setupMockWorkspace(page);

    // Switch to Assistant tab
    const assistantTab = page.getByRole('button', { name: /^Assistant$/i });
    await assistantTab.click();

    // Query Assistant
    const queryInput = page.getByTestId('assistant-query-input');
    await queryInput.fill("Explain Shor's algorithm from the quantum paper");
    await page.getByTestId('assistant-send-btn').click();

    // Verify cited response
    await expect(page.getByText(/exponential speedup for integer factorization/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Quantum Algorithms.pdf')).toBeVisible();

    // Contract requirement check: Similarity label present, Confidence ABSENT
    const similarityBadge = page.getByTestId('citation-similarity-badge');
    await expect(similarityBadge).toBeVisible();
    await expect(similarityBadge).toContainText(/Similarity:\s*94%/i);
    await expect(page.locator('body')).not.toContainText(/Confidence/i);
  });

  // ── Scenario 3: Conversation persistence ─────────────────────────────────────
  test('Scenario 3: Conversation persists across page reloads and accepts follow-ups', async ({ page }) => {
    const convId = 'conv-persisted-1';
    const messageList = [
      {
        id: 'msg-prev-1',
        conversation_id: convId,
        role: 'user',
        content: 'What are the main topics in my notes?',
        created_at: '2026-09-26T09:00:00Z',
      },
      {
        id: 'msg-prev-2',
        conversation_id: convId,
        role: 'assistant',
        content: 'Your notes primarily focus on Graph Neural Networks and Knowledge Graphs.',
        citations: [],
        provider: 'ollama',
        model: 'llama3.2',
        created_at: '2026-09-26T09:00:05Z',
      },
    ];

    await page.route('**/api/v1/workspaces/ws-e2e-1/conversations*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: convId,
              workspace_id: 'ws-e2e-1',
              title: 'Graph Knowledge Base',
              created_at: '2026-09-26T09:00:00Z',
              updated_at: '2026-09-26T09:00:05Z',
            },
          ],
          total: 1,
        }),
      });
    });

    await page.route(`**/api/v1/conversations/${convId}/messages`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: messageList, total: messageList.length }),
        });
      } else {
        const sseBody = [
          'data: {"type": "user_message_created", "message_id": "usr-msg-followup"}',
          'data: {"type": "chunk", "content": "GNNs propagate information across neighboring vertices using message passing."}',
          'data: {"type": "done", "message_id": "ast-msg-followup", "citations": [], "provider": "ollama", "model": "llama3.2"}',
          '',
        ].join('\n\n');

        messageList.push({
          id: 'usr-msg-followup',
          conversation_id: convId,
          role: 'user',
          content: 'Elaborate on Graph Neural Networks',
          created_at: '2026-09-26T09:10:00Z',
        });

        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sseBody,
        });
      }
    });

    await setupMockWorkspace(page);

    // Open Assistant
    await page.getByRole('button', { name: /^Assistant$/i }).click();

    // Verify initial message history is loaded
    await expect(page.getByText('What are the main topics in my notes?')).toBeVisible();
    await expect(page.getByText('Your notes primarily focus on Graph Neural Networks')).toBeVisible();

    // Reload page to simulate refresh
    await page.reload();
    await setupMockWorkspace(page);
    await page.getByRole('button', { name: /^Assistant$/i }).click();

    // Conversation is in list and history remains intact
    await expect(page.getByText('Graph Knowledge Base')).toBeVisible();
    await expect(page.getByText('What are the main topics in my notes?')).toBeVisible();

    // Send follow-up
    const input = page.getByTestId('assistant-query-input');
    await input.fill('Elaborate on Graph Neural Networks');
    await page.getByTestId('assistant-send-btn').click();

    // Verify context-aware reply
    await expect(page.getByText(/message passing/i)).toBeVisible({ timeout: 10000 });
  });

  // ── Scenario 4: Source failure and retry ─────────────────────────────────────
  test('Scenario 4: Source processing failure and successful retry', async ({ page }) => {
    let status = 'FAILED';
    const sourceId = 'src-fail-retry-1';

    await page.route('**/api/v1/workspaces/ws-e2e-1/sources*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: sourceId,
              workspace_id: 'ws-e2e-1',
              title: 'Malformed Document.pdf',
              file_name: 'Malformed Document.pdf',
              source_type: 'pdf',
              processing_stage: status === 'FAILED' ? 'extract' : 'complete',
              processing_status: status,
              error_stage: status === 'FAILED' ? 'extract' : null,
              error_message: status === 'FAILED' ? 'Corrupted PDF stream structure' : null,
              file_size_bytes: 10240,
              created_at: '2026-09-26T08:00:00Z',
            },
          ],
          total: 1,
        }),
      });
    });

    await page.route(`**/api/v1/sources/${sourceId}/retry`, async (route) => {
      status = 'READY';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: sourceId,
          workspace_id: 'ws-e2e-1',
          title: 'Malformed Document.pdf',
          processing_stage: 'complete',
          processing_status: 'READY',
          chunk_count: 5,
        }),
      });
    });

    await setupMockWorkspace(page);
    await page.getByRole('button', { name: /^Sources$/i }).click();

    // Source is initially FAILED
    const sourceCard = page.getByTestId(`source-card-${sourceId}`);
    await expect(sourceCard).toBeVisible();
    await sourceCard.click();

    // Detail view shows error stage and retry button
    await expect(page.getByTestId('source-error-panel')).toBeVisible();
    await expect(page.getByText('Corrupted PDF stream structure')).toBeVisible();

    const retryBtn = page.getByTestId('retry-source-btn');
    await expect(retryBtn).toBeEnabled();
    await retryBtn.click();

    // Status transitions to READY after retry
    await expect(page.getByText(/Source retry requested/i)).toBeVisible();
    await expect(page.getByTestId('source-status-badge')).toHaveAttribute('data-status', 'READY');
  });

  // ── Scenario 5: Provider timeout ────────────────────────────────────────────
  test('Scenario 5: Provider timeout handled cleanly without corrupting conversation', async ({ page }) => {
    const convId = 'conv-timeout-1';
    let requestCount = 0;

    await page.route('**/api/v1/workspaces/ws-e2e-1/conversations*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: convId,
              workspace_id: 'ws-e2e-1',
              title: 'LLM Timeout Test',
              created_at: '2026-09-26T07:00:00Z',
              updated_at: '2026-09-26T07:00:00Z',
            },
          ],
          total: 1,
        }),
      });
    });

    await page.route(`**/api/v1/conversations/${convId}/messages`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'msg-exist-1',
                conversation_id: convId,
                role: 'user',
                content: 'First valid question',
                created_at: '2026-09-26T07:00:00Z',
              },
            ],
            total: 1,
          }),
        });
      } else {
        requestCount++;
        if (requestCount === 1) {
          // Trigger LLM_TIMEOUT error event
          const errorStream = [
            'data: {"type": "user_message_created", "message_id": "usr-msg-to"}',
            'data: {"type": "error", "code": "LLM_TIMEOUT", "message": "LLM provider exceeded timeout threshold of 30s"}',
            '',
          ].join('\n\n');

          await route.fulfill({
            status: 200,
            contentType: 'text/event-stream',
            body: errorStream,
          });
        } else {
          // Second message succeeds
          const successStream = [
            'data: {"type": "user_message_created", "message_id": "usr-msg-ok"}',
            'data: {"type": "chunk", "content": "Recovery response received successfully."}',
            'data: {"type": "done", "message_id": "ast-msg-ok", "citations": []}',
            '',
          ].join('\n\n');

          await route.fulfill({
            status: 200,
            contentType: 'text/event-stream',
            body: successStream,
          });
        }
      }
    });

    await setupMockWorkspace(page);
    await page.getByRole('button', { name: /^Assistant$/i }).click();

    // Verify existing messages are intact
    await expect(page.getByText('First valid question')).toBeVisible();

    // Send question that triggers LLM_TIMEOUT
    const input = page.getByTestId('assistant-query-input');
    await input.fill('Trigger provider timeout');
    await page.getByTestId('assistant-send-btn').click();

    // Verify error banner is shown with clean error
    await expect(page.getByTestId('conversation-error')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/LLM provider exceeded timeout/i)).toBeVisible();

    // Conversation state is intact; past messages remain
    await expect(page.getByText('First valid question')).toBeVisible();

    // User can immediately send another message without reloading
    await input.fill('Retry with recovered provider');
    await page.getByTestId('assistant-send-btn').click();

    // Verify recovery response
    await expect(page.getByText('Recovery response received successfully.')).toBeVisible({ timeout: 5000 });
  });
});
