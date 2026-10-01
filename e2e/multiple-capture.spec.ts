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

test('per-household new alternative isolates the captured source and preserves the other draft', async ({
  page,
}) => {
  await page.route('**/api/ai/generate', async (route) => {
    const input = route.request().postDataJSON();
    if (input.mode === 'new') {
      expect(input.source).toBe(update.sourceQuotes[0]);
      expect(input.candidates).toEqual([]);
      expect(input.nameIndex).toEqual([]);
      expect(input.hints.householdId).toBeUndefined();
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
            sourceQuotes: update.sourceQuotes,
          },
        ]),
      });
    }
    return route.fulfill({ json: response([update, create]) });
  });
  await seed(page);
  await page
    .getByRole('article')
    .nth(0)
    .getByRole('button', { name: 'Draft as new household' })
    .click();
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
});

test('grouping retries preserve edited drafts on failure and use the corrected source on retry', async ({
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
    page.getByText('Reprocessing replaces your edited drafts', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reprocess as multiple households', exact: true }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(
    page.getByRole('article').nth(1).getByText('Keep on failure', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Correct source text' }).click();
  await page
    .getByLabel('Corrected source text')
    .fill('Nora and Peter from pottery. Elena Example 1 has a red bicycle.');
  await page.getByRole('button', { name: 'Save source text' }).click();
  await expect(page.getByRole('button', { name: 'Save 2 households' })).toBeDisabled();
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
