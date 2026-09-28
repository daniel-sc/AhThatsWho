import { test, expect, type Page } from '@playwright/test';
import { fixtures } from '../src/domain/fixtures';
async function settings(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
}
async function importData(page: Page, count = 12) {
  await settings(page);
  await page.locator('input[type=file]').setInputFiles({
    name: 'synthetic.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixtures(count))),
  });
  await page.getByRole('button', { name: 'Replace & use this dataset' }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
}
async function add(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add household', exact: true }).first().click();
  await page.getByLabel('First name', { exact: true }).fill(name);
  await page.getByLabel('Memory cue', { exact: true }).fill('Green bicycle');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('The names, together.')).toBeVisible();
}
test('manual edit, history restore, trash and recovery', async ({ page }) => {
  await page.goto('/');
  await add(page, 'Beatrice');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('First name', { exact: true }).fill('Beatrix');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByText('Beatrice').first()).toBeVisible();
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Restore this version' }).click();
  await expect(page.getByText('Beatrice').first()).toBeVisible();
  await page.getByRole('button', { name: 'Move to trash' }).click();
  await settings(page);
  await page.getByRole('button', { name: 'Open Trash' }).click();
  await page.getByRole('button', { name: 'Restore household' }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('button', { name: /Beatrice/ })).toBeVisible();
});
test('context fallback, full-state resume, home reset and offline reload', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await importData(page);
  await page.getByRole('button', { name: 'School', exact: true }).click();
  await page.getByRole('searchbox').fill('mattias robin');
  await expect(page.getByText(/No matches in School/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Matthias Example/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue('mattias robin');
  await expect(page.getByText(/No matches in School/)).toBeVisible();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: /Elena Example 1/ })).toBeVisible();
});
test('capture survives reload, manual proposal applies once', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save for later' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Process now' })).toBeDisabled();
  await page.getByLabel('Capture text').fill('Met Beatrice at the pottery studio.');
  await page.getByRole('button', { name: 'Save for later' }).click();
  await expect(page.getByRole('heading', { name: 'Your inbox' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Inbox/ }).click();
  await page.getByRole('button', { name: /Met Beatrice/ }).click();
  await page.getByRole('button', { name: 'Create new manually' }).click();
  await page.getByLabel('First name', { exact: true }).fill('Beatrice');
  await page.getByRole('button', { name: 'Save & apply', exact: true }).click();
  await expect(page.getByText('The names, together.')).toBeVisible();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('button', { name: /Beatrice/ })).toHaveCount(1);
});
test('import cancel, replacement and local safety recovery', async ({ page }) => {
  await page.goto('/');
  await importData(page, 3);
  await settings(page);
  await page.locator('input[type=file]').setInputFiles({
    name: 'one.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixtures(1))),
  });
  await expect(page.getByRole('region', { name: 'Import preview' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Export JSON' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel import' }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('.household-row')).toHaveCount(3);
  await importData(page, 1);
  await expect(page.locator('.household-row')).toHaveCount(1);
  await settings(page);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Recover previous local data' }).click();
  await expect(page.getByText('Previous local data recovered.')).toBeVisible();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('.household-row')).toHaveCount(3);
});
test('editor draft survives reload and does not apply until save', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add household', exact: true }).first().click();
  await page.getByLabel('First name', { exact: true }).fill('Ariadne');
  await expect(page.getByText('Local draft saved · not applied')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Ariadne');
  await page.getByRole('button', { name: 'Cancel & discard draft' }).click();
  await expect(page.locator('.household-row')).toHaveCount(0);
});
