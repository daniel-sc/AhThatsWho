import { test, expect } from '@playwright/test';
test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
});
test('Chromium recorder persists before upload, reuses transcript, and cleans audio after apply', async ({
  page,
}) => {
  let transcriptions = 0;
  let proposals = 0;
  await page.route('https://api.openai.com/v1/audio/transcriptions', async (route) => {
    transcriptions++;
    expect(route.request().headers()['content-type']).toContain('multipart/form-data');
    const body = route.request().postDataBuffer()!.toString('latin1');
    expect(body).toMatch(/capture\.(webm|m4a)/);
    expect(body).toMatch(/audio\/(webm|mp4)/);
    await route.fulfill({ json: { text: 'Met Beatrice at the synthetic pottery studio.' } });
  });
  await page.route('https://api.openai.com/v1/responses', async (route) => {
    proposals++;
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
                  action: 'create',
                  household: {
                    id: 'tmp:house',
                    people: [{ id: 'tmp:person', firstName: { value: 'Beatrice' } }],
                    contextIds: [],
                  },
                  candidateIds: [],
                  contextSuggestions: [],
                  reason: 'A new household to confirm.',
                }),
              },
            ],
          },
        ],
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('API key', { exact: true }).fill('synthetic-test-key');
  await page.getByRole('button', { name: 'Save key', exact: true }).click();
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.getByRole('button', { name: 'Record a voice note' }).click();
  await expect(page.getByRole('button', { name: /Stop recording/ })).toBeVisible();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Stop recording/ }).click();
  await expect(
    page.getByText('Audio received and stored locally.', { exact: false }),
  ).toBeVisible();
  expect(transcriptions).toBe(0);
  await page.getByRole('button', { name: 'Save for later' }).click();
  await page.getByRole('button', { name: /Inbox/ }).click();
  await page.getByRole('button', { name: /Saved audio recording/ }).click();
  await page.getByRole('button', { name: 'Play saved recording' }).click();
  await expect(page.locator('audio')).toHaveAttribute('src', /^blob:/);
  await page.getByRole('button', { name: 'Transcribe & process' }).click();
  await expect(page.getByRole('alert').first()).toContainText('limit');
  await page.getByRole('button', { name: 'Process with OpenAI' }).click();
  await expect(page.getByRole('heading', { name: 'Proposed', exact: true })).toBeVisible();
  expect(transcriptions).toBe(1);
  expect(proposals).toBe(2);
  await page.getByRole('button', { name: 'Apply proposal' }).click();
  await expect(page.getByText('The names, together.')).toBeVisible();
  const remaining = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('namecue');
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
