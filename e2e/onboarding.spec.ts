import { test, expect } from '@playwright/test';

test('welcome example never becomes notebook data; first real entry replaces welcome', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.welcome')).toBeVisible();
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  const counts = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ahthatswho');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const result = await Promise.all(
      ['households', 'contexts', 'inbox', 'revisions', 'audio'].map(
        (name) =>
          new Promise<number>((resolve) => {
            const request = database.transaction(name).objectStore(name).count();
            request.onsuccess = () => resolve(request.result);
          }),
      ),
    );
    database.close();
    return result;
  });
  expect(counts).toEqual([0, 0, 0, 0, 0]);
  await page.getByRole('button', { name: /^Add a person/ }).click();
  await expect(page.getByLabel('First name', { exact: true })).toHaveValue('');
  await page.getByLabel('First name', { exact: true }).fill('Avery');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('.welcome')).toHaveCount(0);
  await page.getByRole('searchbox').fill('unfindable');
  await expect(page.getByText('No familiar names yet?')).toBeVisible();
  await expect(page.locator('.welcome')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.welcome')).toHaveCount(0);
});

test('AI setup preserves the note and capture drafts suppress welcome', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Speak or jot a note/ }).click();
  await page.getByLabel('Capture text').fill('Avery from the pottery class');
  await page.getByRole('button', { name: 'AI settings', exact: true }).click();
  await page.getByLabel('AI payment').selectOption('personal');
  await page.getByLabel('API key', { exact: true }).fill('synthetic-test-key');
  await page.getByRole('button', { name: 'Save key', exact: true }).click();
  await expect(page.getByText('Key available on this device')).toBeVisible();
  await page.getByRole('button', { name: 'Back to your note' }).click();
  await expect(page.getByLabel('Capture text')).toHaveValue('Avery from the pottery class');
  await expect(page.getByRole('button', { name: 'Set up AI', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('searchbox')).toBeVisible();
  await expect(page.locator('.welcome')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.welcome')).toHaveCount(0);
});

test('installation guidance, native prompt, and installed state', async ({ page }) => {
  await page.goto('/');
  await page.locator('.install-help summary').click();
  await expect(page.getByText(/On iPhone or iPad, open the Share menu/)).toBeVisible();
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        document.body.dataset.installPrompt = 'shown';
      },
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    });
    window.dispatchEvent(event);
  });
  await page.getByRole('button', { name: 'Install AhThatsWho', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-install-prompt', 'shown');
  await expect(page.getByRole('button', { name: 'Install AhThatsWho', exact: true })).toHaveCount(
    0,
  );
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.locator('.install-help')).toHaveCount(0);
});

test('welcome import opens settings and both actions fit a small screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await expect(page.locator('.welcome')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const manual = await page.locator('.welcome-manual').boundingBox();
  const ai = await page.locator('.welcome-ai').boundingBox();
  expect(manual!.width).toBe(ai!.width);
  expect(manual!.height).toBe(ai!.height);
  await page.getByRole('button', { name: /Import or restore a notebook/ }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.locator('input[type=file]')).toHaveCount(1);
});
