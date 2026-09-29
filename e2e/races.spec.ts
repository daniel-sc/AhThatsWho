import { test, expect, type Page } from '@playwright/test';
import { fixtures } from '../src/domain/fixtures';
async function seed(page: Page, count = 2) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixtures(count))),
  });
  await page.getByRole('button', { name: 'Replace & use this dataset' }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
}
test('a recovered editor draft cannot overwrite a newer version from another tab', async ({
  page,
  context,
}) => {
  await seed(page);
  await page.getByRole('button', { name: /Elena Example 1/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Memory cue', { exact: true }).fill('Old draft');
  await expect(page.getByText('Local draft saved · not applied')).toBeVisible();
  const other = await context.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: 'Home', exact: true }).click();
  await other.getByRole('button', { name: /Elena Example 1/ }).click();
  await other.getByRole('button', { name: 'Edit', exact: true }).click();
  await other.getByLabel('Memory cue', { exact: true }).fill('Newer edit');
  await other.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed');
  await page.getByRole('button', { name: 'Cancel & discard draft' }).click();
  await expect(page.getByText('Newer edit')).toBeVisible();
});
test('malformed and newer imports leave data intact', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  for (const input of [
    { ...fixtures(1), version: 999 },
    { ...fixtures(1), contexts: [] },
  ]) {
    await page.locator('input[type=file]').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(input)),
    });
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss error' }).click();
  }
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('.household-row')).toHaveCount(2);
});
test('an ambiguous provider reply goes to target review and a stale proposal is blocked', async ({
  page,
  context,
}) => {
  await seed(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('AI payment').selectOption('personal');
  await page.getByLabel('API key', { exact: true }).fill('synthetic-test-key');
  await page.getByRole('button', { name: 'Save key', exact: true }).click();
  await page.route('https://api.openai.com/v1/responses', async (route) => {
    await route.fulfill({
      json: {
        status: 'completed',
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  action: 'ambiguous',
                  candidateIds: ['synthetic-0', 'synthetic-1'],
                  contextSuggestions: [],
                  reason: 'Choose the intended household.',
                }),
              },
            ],
          },
        ],
      },
    });
  });
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.getByLabel('Capture text').fill('Update the bicycle cue.');
  await page.getByRole('button', { name: 'Process now' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a household' })).toBeVisible();
  await page.getByRole('button', { name: /Elena Example 1/ }).click();
  await page.getByLabel('Memory cue', { exact: true }).fill('Red bicycle');
  const other = await context.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: 'Home', exact: true }).click();
  await other.getByRole('button', { name: /Elena Example 1/ }).click();
  await other.getByRole('button', { name: 'Edit', exact: true }).click();
  await other.getByLabel('Memory cue', { exact: true }).fill('A newer cue');
  await other.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Save & apply', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('stale');
  await expect(page.getByLabel('Memory cue', { exact: true })).toHaveValue('Red bicycle');
  await page.getByRole('button', { name: 'Cancel & discard draft' }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('button', { name: /Elena Example 1/ })).toContainText('A newer cue');
});
test('microphone denial leaves text capture usable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        throw new DOMException('Permission denied', 'NotAllowedError');
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.getByRole('button', { name: 'Record a voice note' }).click();
  await expect(page.getByRole('alert')).toContainText('Permission denied');
  await page.getByLabel('Capture text').fill('A text fallback');
  await page.getByRole('button', { name: 'Save for later' }).click();
  await page.getByRole('button', { name: /Inbox/ }).click();
  await expect(page.getByRole('button', { name: /A text fallback/ })).toBeVisible();
});
