import { test, expect } from '@playwright/test';

test('privacy and the homepage policy link are readable without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/privacy');
  await expect(
    page.getByRole('heading', { name: 'AhThatsWho privacy', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Optional Google Drive backup' })).toBeVisible();
  await page.goto('http://127.0.0.1:4173/');
  await expect(page.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute(
    'href',
    '/privacy',
  );
  await context.close();
});

test('privacy opens without notebook storage and hydrates without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      get() {
        throw new Error('Notebook storage must not be opened');
      },
    });
  });
  await page.goto('/privacy');
  await expect(page).toHaveTitle('Privacy · AhThatsWho');
  await expect(
    page.getByRole('heading', { name: 'AhThatsWho privacy', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.app-header')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('privacy navigation preserves the notebook and works on a cold offline visit', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Privacy policy' })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.getByRole('link', { name: 'Privacy policy' }).click();
  await expect(page).toHaveTitle('Privacy · AhThatsWho');
  await page.getByRole('link', { name: 'Return to AhThatsWho' }).click();
  await expect(page.locator('.welcome')).toBeVisible();
  await context.setOffline(true);
  await page.goto('/privacy');
  await expect(
    page.getByRole('heading', { name: 'AhThatsWho privacy', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
