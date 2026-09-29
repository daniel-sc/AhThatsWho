import { test, expect } from '@playwright/test';

test('public sponsorship preserves failed notes and uses a personal key only after explicit selection', async ({
  page,
}) => {
  let sponsoredCalls = 0;
  let personalCalls = 0;
  await page.route('**/api/ai/generate', async (route) => {
    sponsoredCalls++;
    expect(route.request().headers().authorization).toBeUndefined();
    expect(route.request().postDataJSON().source).toBe('Avery from pottery');
    await route.fulfill({ status: 429, json: { error: 'Synthetic project spend limit' } });
  });
  await page.route('https://api.openai.com/v1/responses', async (route) => {
    personalCalls++;
    expect(route.request().headers().authorization).toBe('Bearer synthetic-personal-key');
    expect(JSON.parse(route.request().postDataJSON().input).source).toBe('Avery from pottery');
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
                    id: 'tmp:avery',
                    people: [{ id: 'tmp:person', firstName: { value: 'Avery' } }],
                    contextIds: [],
                  },
                  candidateIds: [],
                  contextSuggestions: [],
                  reason: 'New person',
                }),
              },
            ],
          },
        ],
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /^Speak or jot a note/ }).click();
  await expect(page.getByRole('button', { name: 'Set up AI', exact: true })).toHaveCount(0);
  await page.getByLabel('Capture text').fill('Avery from pottery');
  await page.getByRole('button', { name: 'Process now', exact: true }).click();
  await expect(page.getByRole('alert').first()).toContainText('Sponsored AI has reached');
  expect(sponsoredCalls).toBe(1);
  expect(personalCalls).toBe(0);
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: /Inbox/ })
    .click();
  await page.getByRole('button', { name: /Avery from pottery/ }).click();
  await expect(page.getByRole('alert').first()).toContainText('Your source is saved');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('AI payment')).toHaveValue('sponsored');
  await page.getByLabel('AI payment').selectOption('personal');
  await page.getByLabel('API key', { exact: true }).fill('synthetic-personal-key');
  await page.getByLabel('Remember on this device', { exact: true }).check();
  await page.getByRole('button', { name: 'Save key', exact: true }).click();
  await expect(page.getByText('Key available on this device')).toBeVisible();
  // A saved key must not become an automatic fallback when sponsorship fails.
  await page.getByLabel('AI payment').selectOption('sponsored');
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: /Inbox/ })
    .click();
  await page.getByRole('button', { name: /Avery from pottery/ }).click();
  await page.getByRole('button', { name: 'Process with OpenAI', exact: true }).click();
  // The previous error can still be visible while the retry is starting.
  await expect.poll(() => sponsoredCalls).toBe(2);
  await expect(page.getByRole('button', { name: 'Process with OpenAI', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert').first()).toContainText('Sponsored AI has reached');
  expect(personalCalls).toBe(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('AI payment').selectOption('personal');
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('AI payment')).toHaveValue('personal');
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: /Inbox/ })
    .click();
  await page.getByRole('button', { name: /Avery from pottery/ }).click();
  await page.getByRole('button', { name: 'Process with OpenAI', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Proposed', exact: true })).toBeVisible();
  expect(personalCalls).toBe(1);
  expect(sponsoredCalls).toBe(2);
});
