import { test, expect, type Page } from '@playwright/test';

async function installedPhone(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  });
}

test('retains a same-width window and visual viewport shrink through restart and shares only geometry', async ({
  page,
}) => {
  await installedPhone(page);
  await page.goto('/');
  await page
    .getByRole('button', { name: /^(Add household|Add a person)/ })
    .first()
    .click();
  await page.getByLabel('First name', { exact: true }).first().fill('PRIVATE-CANARY');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const householdPath = new URL(page.url()).pathname;
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pageshow'));
  });
  // Emulate WebKit retaining a shorter window AND visual viewport; comparing only those
  // two heights would miss this case. The keyboard is closed and scale is unchanged.
  await page.waitForFunction(() => document.activeElement === document.body);
  await page.evaluate(() => {
    const h = innerHeight - 320;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
    Object.defineProperty(visualViewport, 'height', { configurable: true, value: h });
    window.dispatchEvent(new PageTransitionEvent('pageshow'));
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('ahthatswho:layout-report:v1') || '{}').episode?.at(
            -1,
          )?.[3],
      ),
    )
    .toBe('editor');
  await page.reload();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  // Exercise the real share handler without opening the OS chooser.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async ({ text }: ShareData) => {
        document.documentElement.dataset.shared = text;
      },
    });
  });
  await page.getByRole('button', { name: 'Share recent layout report' }).click();
  const report = await page.locator('html').getAttribute('data-shared');
  expect(report).toMatch(/Latest suspected episode[\s\S]* (resume|settled) editor /);
  expect(report).not.toContain('PRIVATE-CANARY');
  expect(report).not.toContain(householdPath.split('/')[2]);
  expect(report).not.toContain('https://');
});

test('offers recent measurements even without an episode, cancellation is quiet, and fallback is copyable', async ({
  page,
}) => {
  await installedPhone(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const share = page.getByRole('button', { name: 'Share recent layout report' });
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => {
        throw new DOMException('', 'AbortError');
      },
    });
  });
  await share.click();
  await expect(page.getByRole('button', { name: 'Copy report' })).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (s: string) => {
          document.documentElement.dataset.copied = s;
        },
      },
    });
  });
  await share.click();
  const text = await page.getByLabel('Layout report text').inputValue();
  expect(text).toMatch(/Latest suspected episode \(including lead-up\)\nNone recorded/);
  expect(text).toMatch(/Recent activity before Settings\n\d.* home /);
  await page.getByRole('button', { name: 'Copy report' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-copied', text);
});
