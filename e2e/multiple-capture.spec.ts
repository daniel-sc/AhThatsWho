import { test, expect, type Page } from '@playwright/test';
import { fixtures } from '../src/domain/fixtures';
const note = 'Elena Example 1 has a red bicycle. Nora and Peter from pottery.';
const b = fixtures(1);
const create = {
  action: 'create',
  household: {
    id: 'tmp:nora',
    people: [
      { id: 'tmp:n', firstName: { value: 'Nora' }, role: 'adult' },
      { id: 'tmp:p', firstName: { value: 'Peter' }, role: 'adult' },
    ],
    contextIds: [],
    cue: 'Pottery class',
  },
  candidateIds: [],
  contextSuggestions: [],
  reason: 'Nora and Peter appear to belong together; please check this grouping.',
  sourceQuotes: ['Nora and Peter from pottery.'],
};
const update = {
  action: 'update',
  targetId: b.households[0].household.id,
  household: { ...b.households[0].household, cue: 'Red bicycle' },
  candidateIds: [],
  contextSuggestions: [],
  reason: 'Elena matches the existing household.',
  sourceQuotes: ['Elena Example 1 has a red bicycle.'],
};
const response = (proposals: unknown[]) => ({
  status: 'completed',
  output: [{ content: [{ type: 'output_text', text: JSON.stringify({ proposals }) }] }],
});
async function seed(page: Page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'synthetic.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(b)),
  });
  await page.getByRole('button', { name: 'Replace & use this dataset' }).click();
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.getByLabel('Capture text').fill(note);
  await page.getByRole('button', { name: 'Process now', exact: true }).click();
  await expect(page.getByRole('heading', { name: '2 households to review' })).toBeVisible();
}

test('mixed household review keeps edits as drafts and saves the capture together', async ({
  page,
}) => {
  await page.route('**/api/ai/generate', (route) =>
    route.fulfill({ json: response([update, create]) }),
  );
  await seed(page);
  const cards = page.getByRole('article');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).getByText('Update existing household', { exact: true })).toBeVisible();
  await expect(cards.nth(1).getByText('New household', { exact: true })).toBeVisible();
  await cards.nth(1).getByRole('button', { name: 'Edit proposal manually' }).click();
  await page.getByLabel('Memory cue', { exact: true }).fill('Blue pottery apron');
  await page.getByRole('button', { name: 'Keep draft changes' }).click();
  await expect(cards.nth(1).getByText('Edited by you')).toBeVisible();
  await page.reload();
  await expect(cards.nth(1).getByText('Blue pottery apron', { exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Save 2 households' }).click();
  await expect(page.getByRole('heading', { name: 'Saved 2 households' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Saved 2 households' })).toBeVisible();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('[data-household]')).toHaveCount(2);
  await expect(page.getByText('Blue pottery apron', { exact: true })).toBeVisible();
  await expect(page.getByText('Red bicycle', { exact: true })).toBeVisible();
});

test('per-household retry uses unvalidated excerpts and preserves both drafts until success', async ({
  page,
}) => {
  const excerpt = 'Elena rides a red bicycle.';
  let newCalls = 0;
  let releaseNew: () => void = () => {};
  const waiting = new Promise<void>((resolve) => (releaseNew = resolve));
  await page.route('**/api/ai/generate', async (route) => {
    const input = route.request().postDataJSON();
    if (input.mode === 'new') {
      expect(input.source).toBe(excerpt);
      expect(input.candidates).toEqual([]);
      expect(input.nameIndex).toEqual([]);
      expect(input.hints.householdId).toBeUndefined();
      if (++newCalls === 1) {
        await waiting;
        return route.fulfill({ status: 500, json: { error: 'Synthetic failure' } });
      }
      return route.fulfill({
        json: response([
          {
            ...create,
            household: {
              id: 'tmp:elena',
              people: [{ id: 'tmp:e', firstName: { value: 'Elena' } }],
              contextIds: [],
              cue: 'Red bicycle',
            },
            sourceQuotes: [excerpt],
          },
        ]),
      });
    }
    return route.fulfill({ json: response([{ ...update, sourceQuotes: [excerpt] }, create]) });
  });
  await seed(page);
  await page
    .getByRole('article')
    .nth(0)
    .getByRole('button', { name: 'Edit proposal manually' })
    .click();
  await page.getByLabel('Memory cue', { exact: true }).fill('My corrected cue');
  await page.getByRole('button', { name: 'Keep draft changes' }).click();
  await page
    .getByRole('article')
    .nth(0)
    .getByRole('button', { name: 'Draft as new household' })
    .click();
  const affected = page.getByRole('article').nth(0);
  const progress = affected.getByRole('status');
  await expect(progress).toContainText('Preparing a new household suggestion');
  await expect
    .poll(() =>
      progress.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= innerHeight - 84;
      }),
    )
    .toBe(true);
  releaseNew();
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(affected.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('The original suggestion is still shown');
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(
    page.getByRole('article').nth(0).getByText('My corrected cue', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('article').nth(0).getByRole('button', { name: 'Retry', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(
    page.getByRole('article').nth(0).getByText('New household', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('article').nth(0).getByText('Robin 1', { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('article').nth(1).locator('.names').getByText('Nora', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save 2 households' }).click();
  await expect(page.getByRole('heading', { name: 'Saved 2 households' })).toBeVisible();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('[data-household]')).toHaveCount(3);
  expect(newCalls).toBe(2);
});

test('whole-note retries discard edited drafts and use the corrected source and grouping', async ({
  page,
}) => {
  let multiCalls = 0;
  await page.route('**/api/ai/generate', async (route) => {
    const input = route.request().postDataJSON();
    if (input.mode === 'multiple') {
      multiCalls++;
      if (multiCalls === 1)
        return route.fulfill({ status: 500, json: { error: 'Synthetic failure' } });
      expect(input.source).toBe('Nora and Peter from pottery. Elena Example 1 has a red bicycle.');
    }
    if (input.mode === 'single')
      return route.fulfill({ json: response([{ ...create, sourceQuotes: [input.source] }]) });
    return route.fulfill({ json: response([update, create]) });
  });
  await seed(page);
  await page
    .getByRole('article')
    .nth(1)
    .getByRole('button', { name: 'Edit proposal manually' })
    .click();
  await page.getByLabel('Memory cue', { exact: true }).fill('Keep on failure');
  await page.getByRole('button', { name: 'Keep draft changes' }).click();
  await page.getByText('Reprocess or change household grouping', { exact: true }).click();
  await expect(
    page.getByText('Reprocessing discards these suggestions', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reprocess as multiple households', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(page.getByText('Keep on failure', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '2 households to review' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save 2 households' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Correct source text' }).click();
  await page
    .getByLabel('Corrected source text')
    .fill('Nora and Peter from pottery. Elena Example 1 has a red bicycle.');
  await page.getByRole('button', { name: 'Save source text' }).click();
  await page.getByRole('button', { name: 'Reprocess as multiple households', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save 2 households' })).toBeEnabled();
  await expect(page.getByText('Keep on failure', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByText('Reprocess or change household grouping', { exact: true }).click();
  await page.getByRole('button', { name: 'Reprocess as one household', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save 1 household' })).toBeEnabled();
  expect(multiCalls).toBe(2);
});

test('review using current data bypasses an obsolete recovered editor draft', async ({
  page,
  context,
}) => {
  await page.route('**/api/ai/generate', (route) =>
    route.fulfill({ json: response([update, create]) }),
  );
  await seed(page);
  const reviewUrl = page.url();
  await page
    .getByRole('article')
    .nth(0)
    .getByRole('button', { name: 'Edit proposal manually' })
    .click();
  await page.getByLabel('Memory cue', { exact: true }).fill('Obsolete local draft');
  await expect(page.getByText('Local draft saved · not applied')).toBeVisible();
  await page.reload();
  const other = await context.newPage();
  await other.goto('/home');
  await other.getByRole('button', { name: /Elena Example 1/ }).click();
  await other.getByRole('button', { name: 'Edit', exact: true }).click();
  await other.getByLabel('Memory cue', { exact: true }).fill('Current notebook cue');
  await other.getByRole('button', { name: 'Save', exact: true }).click();
  await page.goto(reviewUrl);
  await page.getByRole('button', { name: 'Review using current data' }).click();
  await expect(page.getByLabel('Memory cue', { exact: true })).toHaveValue('Current notebook cue');
  await expect(page.getByText('Recovered local draft · not applied')).toHaveCount(0);
  await page.getByLabel('Memory cue', { exact: true }).fill('Reviewed current cue');
  await page.getByRole('button', { name: 'Keep draft changes' }).click();
  await expect(
    page
      .getByRole('article')
      .nth(0)
      .getByText('Drafting as new replaces your manual edits', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save 2 households' }).click();
  await expect(page.getByRole('heading', { name: 'Saved 2 households' })).toBeVisible();
  await other.close();
});

test('saved voice captures with an outdated stage appear only in Completed', async ({ page }) => {
  const backup = fixtures(1);
  const row = backup.households[0];
  backup.inbox = [
    {
      id: 'old-voice-capture',
      kind: 'audio',
      createdAt: backup.exportedAt,
      updatedAt: backup.exportedAt,
      hints: {},
      stage: 'missing-source',
      receipt: {
        householdId: row.household.id,
        versionId: row.versionId,
        appliedAt: backup.exportedAt,
      },
    },
  ];
  await page.goto('/');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'old-capture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.getByRole('button', { name: 'Replace & use this dataset' }).click();
  await page.getByRole('link', { name: /Inbox/ }).click();
  await expect(page.getByRole('button', { name: 'To review · 0' })).toBeVisible();
  await expect(page.locator('.inbox-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Completed', exact: true }).click();
  await expect(page.locator('.inbox-row')).toHaveCount(1);
  await expect(page.locator('.inbox-row')).toContainText('Applied');
  await page.locator('.inbox-row').click();
  await expect(page.getByRole('heading', { name: 'Saved 1 household' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Saved 1 household' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Discard capture' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Process with AI' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open household' })).toBeVisible();
});
