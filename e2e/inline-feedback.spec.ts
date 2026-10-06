import { test, expect } from '@playwright/test';

test('Settings connection progress, error and result stay beside their button', async ({
  page,
}) => {
  let release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => (release = resolve));
  let calls = 0;
  await page.route('**/api/ai/check', async (route) => {
    if (++calls === 1) {
      await waiting;
      return route.fulfill({ status: 503, json: { error: 'Synthetic unavailable' } });
    }
    return route.fulfill({ json: { available: true } });
  });
  await page.goto('/');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const button = page.getByRole('button', { name: 'Check connection & models' });
  await button.click();
  const status = page
    .getByRole('status')
    .filter({ hasText: 'Checking connection and model access' });
  await expect(status).toBeVisible();
  expect(
    await status.evaluate((el) => {
      const button = el.previousElementSibling;
      return button?.textContent?.includes('Check connection & models');
    }),
  ).toBe(true);
  release();
  await expect(page.getByRole('alert')).toContainText('Sponsored AI is unavailable');
  await expect(page.locator('#app-error')).toHaveCount(0);
  await expect(button).toBeFocused();
  await button.click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: 'Sponsored AI has access' }),
  ).toBeVisible();
});
