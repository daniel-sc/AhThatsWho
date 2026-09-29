import { test, expect, type Page } from '@playwright/test';
import { fixtures } from '../src/domain/fixtures';
import { manualProposal } from '../src/capture/application';

async function suggestion(page: Page) {
  const data = fixtures(1);
  const target = data.households[0];
  data.inbox = [
    {
      id: 'ux-capture',
      kind: 'text',
      text: 'Change the memory cue to a blue bicycle.',
      createdAt: data.exportedAt,
      updatedAt: data.exportedAt,
      hints: {},
      stage: 'proposed',
      proposal: {
        ...manualProposal({ ...target.household, cue: 'Blue bicycle' }, target),
        model: 'synthetic-model',
      },
    },
  ];
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'ux.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await page.getByRole('button', { name: 'Replace & use this dataset' }).click();
  await page.getByRole('button', { name: /Inbox/ }).click();
  await page.getByRole('button', { name: /Change the memory cue/ }).click();
}

test('edit an AI suggestion and apply in one save, then open the completed household', async ({
  page,
}) => {
  await suggestion(page);
  await page.getByRole('button', { name: 'Edit proposal manually' }).click();
  await expect(
    page.getByText('Change the memory cue to a blue bicycle.', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Memory cue', { exact: true }).fill('Indigo bicycle');
  await expect(page.getByText('Changed or removed facts')).toBeVisible();
  await page.getByRole('button', { name: 'Save & apply' }).click();
  await expect(page.getByText('The names, together.')).toBeVisible();
  await expect(page.getByText('Indigo bicycle', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Inbox/ }).click();
  await page.getByRole('button', { name: 'Completed', exact: true }).click();
  await page.getByRole('button', { name: /Change the memory cue/ }).click();
  await expect(page.getByRole('heading', { name: 'Completed capture' })).toBeVisible();
  await expect(page.getByText(/proposal is stale|household changed after/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Apply proposal' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open household' }).click();
  await expect(page.getByText('Indigo bicycle', { exact: true })).toBeVisible();
});

test('unchanged AI suggestion needs only the apply action, including changed facts', async ({
  page,
}) => {
  await suggestion(page);
  await expect(page.getByText('Changed or removed facts')).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Apply proposal' }).click();
  await expect(page.getByText('The names, together.')).toBeVisible();
  await expect(page.getByText('Blue bicycle', { exact: true })).toBeVisible();
});

test('correct source inline without keeping contradictory original text', async ({ page }) => {
  await suggestion(page);
  await page.getByRole('button', { name: 'Correct source text' }).click();
  await page.getByLabel('Corrected source text').fill('Actually, a green bicycle.\nMet at school.');
  await page.getByRole('button', { name: 'Save source text' }).click();
  await expect(page.getByRole('heading', { name: 'Proposed', exact: true })).toHaveCount(0);
  await expect(page.locator('.source')).toHaveText('Actually, a green bicycle.\nMet at school.');
});

test('optional certainty stays editable and existing uncertainty opens on return', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add household', exact: true }).first().click();
  await page.getByLabel('First name', { exact: true }).fill('Alex');
  const certainty = page.locator('.certainty-disclosure').first();
  await expect(certainty.getByRole('radio', { name: 'Unsure', exact: true })).not.toBeVisible();
  await certainty.locator('summary').click();
  await certainty.getByRole('radio', { name: 'Unsure', exact: true }).check();
  await certainty.getByRole('radio', { name: 'Unmarked', exact: true }).check();
  await expect(certainty.getByRole('radio', { name: 'Unsure', exact: true })).toBeVisible();
  await certainty.getByRole('radio', { name: 'Unsure', exact: true }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(certainty.getByRole('radio', { name: 'Unsure', exact: true })).toBeVisible();
  await expect(certainty.getByRole('radio', { name: 'Unsure', exact: true })).toBeChecked();
});
