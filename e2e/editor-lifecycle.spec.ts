import { test, expect, type Page } from '@playwright/test';

async function expectCleanSave(page: Page) {
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('ahthatswho');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          return await new Promise<string[]>((resolve, reject) => {
            const request = database.transaction('meta').objectStore('meta').getAllKeys();
            request.onsuccess = () =>
              resolve(
                request.result
                  .map(String)
                  .filter(
                    (key) =>
                      key.startsWith('draft:household:') || key.startsWith('draft:proposal:'),
                  ),
              );
            request.onerror = () => reject(request.error);
          });
        } finally {
          database.close();
        }
      }),
    )
    .toEqual([]);
  await expect(page.getByRole('alert')).toHaveCount(0);
}

test('household creation and context edits clean up drafts after navigation', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: /^(Add household|Add a person)/ })
    .first()
    .click();
  await page.getByLabel('First name', { exact: true }).fill('Beatrice');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expectCleanSave(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Memory cue', { exact: true }).fill('Green bicycle');
  page.once('dialog', (dialog) => dialog.accept('Cycling club'));
  await page.getByRole('button', { name: '+ Create context', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Cycling club', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expectCleanSave(page);
  await page.reload();
  await expect(page.getByText('Green bicycle', { exact: true })).toBeVisible();
  await expect(page.getByText('Cycling club', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Memory cue', { exact: true })).toHaveValue('Green bicycle');
  await expect(page.getByText('Recovered local draft · not applied')).toHaveCount(0);
  await page.getByLabel('Memory cue', { exact: true }).fill('Discard this');
  await page.getByRole('button', { name: 'Cancel & discard draft' }).click();
  await expectCleanSave(page);
  await expect(page.getByText('Green bicycle', { exact: true })).toBeVisible();
});

test('manual capture proposal cleans up its draft after applying', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.getByLabel('Capture text').fill('Met Beatrice');
  await page.getByRole('button', { name: 'Save for later' }).click();
  await page.getByRole('button', { name: /Met Beatrice/ }).click();
  await page.getByRole('button', { name: 'Create new manually' }).click();
  await page.getByLabel('First name', { exact: true }).fill('Beatrice');
  await page.getByRole('button', { name: 'Save & apply', exact: true }).click();
  await expectCleanSave(page);
});
