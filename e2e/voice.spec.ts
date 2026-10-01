import { test, expect } from '@playwright/test';
test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
});
test('Chromium recorder persists before upload, reuses transcript, and cleans audio after apply', async ({
  page,
}) => {
  let transcriptions = 0;
  let proposals = 0;
  await page.route('**/api/ai/transcribe', async (route) => {
    transcriptions++;
    expect(route.request().headers()['content-type']).toContain('multipart/form-data');
    const body = route.request().postDataBuffer()!.toString('latin1');
    expect(body).toContain('name="languages[]"\r\n\r\nde');
    expect(body).toContain('name="languages[]"\r\n\r\nen');
    expect(body).toMatch(/capture\.(webm|m4a)/);
    expect(body).toMatch(/audio\/(webm|mp4)/);
    await route.fulfill({ json: { text: 'Met Beatrice at the synthetic pottery studio.' } });
  });
  await page.route('**/api/ai/generate', async (route) => {
    proposals++;
    const input = route.request().postDataJSON();
    expect(input.expectedLanguages).toEqual(['de', 'en']);
    expect(input.source).toContain('Also likes jazz.');
    expect(input.source).toContain('Met Beatrice');
    if (proposals === 1) {
      await route.fulfill({ status: 429, json: { error: 'synthetic rate limit' } });
      return;
    }
    await route.fulfill({
      json: {
        status: 'completed',
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  proposals: [
                    {
                      sourceQuotes: [route.request().postDataJSON().source],
                      ...{
                        action: 'create',
                        household: {
                          id: 'tmp:house',
                          people: [{ id: 'tmp:person', firstName: { value: 'Beatrice' } }],
                          contextIds: [],
                        },
                        candidateIds: [],
                        contextSuggestions: [],
                        reason: 'A new household to confirm.',
                      },
                    },
                  ],
                }),
              },
            ],
          },
        ],
      },
    });
  });
  await page.goto('/');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('German', { exact: true })).toBeChecked();
  await page.getByLabel('English', { exact: true }).check();
  await expect(page.getByLabel('English', { exact: true })).toBeEnabled();
  await page.getByLabel('Resume where I left off').uncheck();
  await expect(page.getByLabel('AI payment')).toHaveValue('sponsored');
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.getByLabel('Capture text', { exact: true }).fill('Also likes jazz.');
  await page.getByRole('button', { name: 'Record a voice note' }).click();
  await expect(page.getByRole('button', { name: /Stop & process/ })).toBeVisible();
  await page.waitForTimeout(1200);
  expect(transcriptions).toBe(0);
  expect(proposals).toBe(0);
  await page.getByRole('button', { name: /Stop & process/ }).click();
  await expect(page.getByRole('alert').first()).toContainText('limit');
  expect(transcriptions).toBe(1);
  expect(proposals).toBe(1);
  await page.reload();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('German', { exact: true })).toBeChecked();
  await expect(page.getByLabel('English', { exact: true })).toBeChecked();
  await expect(page.getByLabel('AI payment')).toHaveValue('sponsored');
  await page.getByRole('link', { name: /Inbox/ }).click();
  await page.getByRole('button', { name: /Met Beatrice/ }).click();
  await page.getByRole('button', { name: 'Play saved recording' }).click();
  await expect(page.locator('audio')).toHaveAttribute('src', /^blob:/);
  await page.getByRole('button', { name: 'Process with OpenAI' }).click();
  await expect(
    page.getByRole('heading', { name: '1 household to review', exact: true }),
  ).toBeVisible();
  expect(transcriptions).toBe(1);
  expect(proposals).toBe(2);
  await page.getByRole('button', { name: 'Save 1 household' }).click();
  await expect(page.getByText('The names, together.')).toBeVisible();
  const remaining = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('ahthatswho');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const d = open.result;
          const r = d.transaction('audio').objectStore('audio').count();
          r.onsuccess = () => {
            resolve(r.result);
            d.close();
          };
        };
      }),
  );
  expect(remaining).toBe(0);
});

test('backgrounding a recording keeps it in Inbox without starting processing', async ({
  page,
}) => {
  let requests = 0;
  await page.route('**/api/ai/**', async (route) => {
    requests++;
    await route.abort();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.getByRole('button', { name: 'Record a voice note' }).click();
  await expect(page.getByRole('button', { name: /Stop & process/ })).toBeVisible();
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByText('Audio saved on this device.', { exact: false })).toBeVisible();
  await page.reload();
  await page.getByRole('link', { name: /Inbox/ }).click();
  await page.getByRole('button', { name: /Saved audio recording/ }).click();
  await page.getByRole('button', { name: 'Play saved recording' }).click();
  await expect(page.locator('audio')).toHaveAttribute('src', /^blob:/);
  expect(requests).toBe(0);
});
