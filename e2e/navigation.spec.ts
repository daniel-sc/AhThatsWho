import { test, expect } from '@playwright/test';

test('named views override resume state, survive reload, and support Back/Forward', async ({
  page,
}) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await expect(page).toHaveURL(/\/capture$/);
  await page.getByLabel('Capture text').fill('Keep this draft');
  await expect(page.getByText('Draft saved on this device')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel('Capture text')).toHaveValue('Keep this draft');
  await page.reload();
  await expect(page.getByLabel('Capture text')).toHaveValue('Keep this draft');
  await page.goto('/inbox');
  await expect(page.getByRole('heading', { name: 'Your inbox' })).toBeVisible();
  await page.goto('/trash');
  await expect(page.getByRole('heading', { name: 'Trash', exact: true })).toBeVisible();
  await page.goto('/home');
  await expect(page.locator('main')).toHaveAttribute('data-screen', 'home');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.goto('/');
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByLabel('Resume where I left off').uncheck();
  await page.goto('/');
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
});

test('household, editor, history and review links restore their local data', async ({ page }) => {
  await page.goto('/households/new');
  await page.getByLabel('First name', { exact: true }).fill('Beatrice');
  await expect(page.getByText('Local draft saved · not applied')).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.goBack();
  await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Beatrice');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/households\/[^/]+$/);
  const household = new URL(page.url()).pathname;
  await page.goto(`${household}/edit`);
  await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Beatrice');
  await page.getByLabel('First name', { exact: true }).fill('Bea');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await page.goto(`${household}/history`);
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await expect(page.getByText('Beatrice', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('Beatrice', { exact: true }).first()).toBeVisible();
  await page.goto(household);
  await expect(page.getByText('Bea', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.getByLabel('Capture text').fill('Met Ada');
  await page.getByRole('button', { name: 'Save for later' }).click();
  await page.getByRole('button', { name: /Met Ada/ }).click();
  await expect(page).toHaveURL(/\/inbox\/[^/]+$/);
  const review = new URL(page.url()).pathname;
  await page.goto('/home');
  await page.goto(review);
  await expect(page.getByRole('button', { name: 'Create new manually' })).toBeVisible();
});

test('missing local records and unknown paths have usable fallbacks', async ({ page }) => {
  for (const path of [
    '/households/missing',
    '/households/missing/edit',
    '/households/missing/history',
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByText('This household is not available on this device.')).toBeVisible();
  }
  await page.goto('/inbox/missing');
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByText('This capture is not available on this device.')).toBeVisible();
  await page.goto('/not-a-page');
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText('This page does not exist. Showing Home.')).toBeVisible();
});

test('browser Back cannot leave an active recording', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      const destination = audio.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      return destination.stream;
    };
  });
  await page.getByRole('button', { name: 'Record a voice note' }).click();
  await expect(page.getByRole('button', { name: /Stop & process/ })).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page.getByText('Stop the recording before navigating.')).toBeVisible();
  await expect(page).toHaveURL(/\/capture$/);
  await expect(page.getByRole('button', { name: /Stop & process/ })).toBeVisible();
});

test('browser Back preserves an import preview until it is cancelled', async ({ page }) => {
  const { fixtures } = await import('../src/domain/fixtures');
  await page.goto('/home');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'synthetic.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixtures(1))),
  });
  await expect(page.getByRole('region', { name: 'Import preview' })).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page.getByText('Finish or cancel the import before navigating.')).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('region', { name: 'Import preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel import' }).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator('main')).toHaveAttribute('data-screen', 'home');
});

test('an offline cold navigation can open an unvisited view URL', async ({ page, context }) => {
  await page.goto('/home');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.goto('/capture');
  await expect(page.getByLabel('Capture text')).toBeVisible();
});
