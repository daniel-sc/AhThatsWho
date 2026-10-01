import { test, expect } from '@playwright/test';
import { savedMeta } from './helpers';
import { fixtures } from '../src/domain/fixtures';
test('large list restores visible household after detail and reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'fixtures.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixtures(500))),
  });
  await page.getByRole('button', { name: 'Replace & use this dataset' }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 18000));
  await expect
    .poll(() => page.locator('[data-household]').first().getAttribute('data-household'))
    .not.toBe('synthetic-0');
  const id = await page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>('[data-household]')].find(
        (e) => e.getBoundingClientRect().top > 0,
      )!.dataset.household!,
  );
  await page.locator(`[data-household="${id}"]`).click();
  await page.goBack();
  await expect(page.locator(`[data-household="${id}"]`)).toBeInViewport();
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/households/${id}$`));
  await page.getByRole('button', { name: 'Back to results', exact: false }).click();
  await expect(page.locator(`[data-household="${id}"]`)).toBeInViewport();
  // Reload must use the latest position, not the anchor from returning to results.
  // Let the virtual list finish its four-frame measurement/restoration sequence.
  await page.evaluate(async () => {
    for (let frame = 0; frame < 4; frame++)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  await page.evaluate(() => window.scrollBy(0, 4000));
  await expect(page.locator(`[data-household="${id}"]`)).not.toBeInViewport();
  const resumedId = await page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>('[data-household]')].find(
        (row) =>
          row.getBoundingClientRect().top > 0 && row.getBoundingClientRect().top < innerHeight,
      )!.dataset.household!,
  );
  const scroll = await page.evaluate(() => window.scrollY);
  await expect.poll(() => savedMeta(page, 'ui')).toMatchObject({ screen: 'home', scroll });
  await page.reload();
  await expect(page.locator(`[data-household="${resumedId}"]`)).toBeInViewport();
});
