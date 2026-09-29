import { test, expect } from '@playwright/test';
import { fixtures } from '../src/domain/fixtures';
test('synthetic 500 / 5000 measurements and phone-sized layout', async ({ page }) => {
  test.setTimeout(120000);
  for (const count of [500, 5000]) {
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.locator('input[type=file]').setInputFiles({
      name: 'synthetic.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(fixtures(count))),
    });
    await page.getByRole('button', { name: 'Replace & use this dataset' }).click();
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(page.locator('.list-heading')).toContainText(`${count} households`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    const t = Date.now();
    await page.reload();
    await expect(page.locator('.list-heading')).toContainText(`${count} households`);
    const cold = Date.now() - t;
    const start = Date.now();
    await page.getByRole('searchbox').fill('mattias robin');
    await expect(page.locator('.list-heading')).toContainText(
      `${Math.floor((count + 3) / 12)} households`,
    );
    const eventToPaint = await page.evaluate(async () => {
      const input = document.querySelector<HTMLInputElement>('input[type=search]')!;
      const started = performance.now();
      input.value = 'zznotfound';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      return Math.round(performance.now() - started);
    });
    console.log(
      JSON.stringify({
        eventToPaintMs: eventToPaint,
        environment: 'Linux Chromium mobile viewport; not iPhone',
        households: count,
        reloadToNamesMs: cold,
        fillToResultsMs: Date.now() - start,
      }),
    );
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    if (count === 500)
      await page.screenshot({ path: 'test-results/synthetic-home.png', fullPage: false });
  }
});
