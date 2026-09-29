import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
test('a real waiting service worker prompts and cannot reload an editor', async ({ page }) => {
  test.setTimeout(60000);
  const path = 'dist/sw.js';
  const original = await readFile(path, 'utf8');
  try {
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.getByRole('button', { name: 'Add household', exact: true }).first().click();
    await page.getByLabel('First name', { exact: true }).fill('Kept draft');
    await expect(page.getByText('Local draft saved · not applied')).toBeVisible();
    await writeFile(path, original + '\n// synthetic update check\n');
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration!.update();
    });
    await expect(page.getByRole('button', { name: 'Update AhThatsWho' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update AhThatsWho' })).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel & discard draft' }).click();
    await expect(page.getByRole('button', { name: 'Update AhThatsWho' })).toBeEnabled();
    await page.getByRole('button', { name: 'Update AhThatsWho' }).click();
    await expect(page.getByRole('searchbox')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update AhThatsWho' })).not.toBeVisible();
  } finally {
    await writeFile(path, original);
  }
});
