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
  await page.getByRole('button', { name: 'Keep draft changes', exact: true }).click();
  await page.getByRole('button', { name: 'Save 1 household', exact: true }).click();
  await expectCleanSave(page);
});

test('person details stay open during editing and hide when reopened empty', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: /^(Add household|Add a person)/ })
    .first()
    .click();
  await page.getByLabel('First name', { exact: true }).fill('Beatrice');
  await expect(page.getByLabel('Last name', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Person notes', { exact: true })).toHaveCount(0);
  const addDetail = page.getByRole('group', { name: 'Add person detail', exact: true });
  await addDetail.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.getByLabel('Person notes', { exact: true })).toBeFocused();
  await page.getByLabel('Person notes', { exact: true }).fill('Met at choir');
  await addDetail.getByRole('button', { name: 'Age note', exact: true }).click();
  const age = page.getByLabel('Age or original date wording', { exact: true });
  await expect(age).toBeFocused();
  await age.fill('About 40');
  await age.clear();
  await expect(age).toBeVisible();
  await expect(addDetail.getByRole('button', { name: 'Age note', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expectCleanSave(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(age).toHaveCount(0);
  await expect(page.getByLabel('Last name', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Person notes', { exact: true })).toHaveValue('Met at choir');
  await addDetail.getByRole('button', { name: 'Birth date', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Precision', exact: true })).toBeFocused();
  await page.getByRole('combobox', { name: 'Precision', exact: true }).selectOption('year');
  await page.getByLabel('Year', { exact: true }).fill('1986');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expectCleanSave(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Year', { exact: true })).toHaveValue('1986');
  await expect(page.getByRole('combobox', { name: 'Role', exact: true })).toHaveCount(0);
});
