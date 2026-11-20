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
  await page.waitForFunction(() =>
    JSON.parse(localStorage.getItem('ahthatswho:layout-report:v1') || '{}').recent?.some(
      (row: unknown[]) => row[2] === 'screen' && row[3] === 'editor',
    ),
  );
  // Emulate WebKit retaining a shorter window AND visual viewport; comparing only those
  // two heights would miss this case. The keyboard is closed and scale is unchanged.
  await page.waitForFunction(() => document.activeElement === document.body);
  const shortenViewport = () => {
    const h = innerHeight - 320;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
    Object.defineProperty(visualViewport, 'height', { configurable: true, value: h });
  };
  await page.addInitScript(shortenViewport);
  await page.evaluate(shortenViewport);
  await page.addStyleTag({ content: '.bottom-nav { transform: translateY(-320px); }' });
  await page.evaluate(() => visualViewport!.dispatchEvent(new Event('resize')));
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
  const onset = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('ahthatswho:layout-report:v1')!).episode.at(-1)[0] as number,
  );
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
  expect(report?.split('Last healthy portrait')[0]).toContain(new Date(onset).toISOString());
  expect(report).not.toContain('PRIVATE-CANARY');
  expect(report).not.toContain(householdPath.split('/')[2]);
  expect(report).not.toContain('https://');
});

test('captures an independently drifting editor action bar mid-form', async ({ page }) => {
  await installedPhone(page);
  await page.goto('/');
  await page
    .getByRole('button', { name: /^(Add household|Add a person)/ })
    .first()
    .click();
  for (let i = 0; i < 4; i++)
    await page
      .getByRole('button', { name: '+ Add person', exact: true })
      .evaluate((el) => (el as HTMLButtonElement).click());
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
  await page.waitForFunction(() => {
    const form = document.querySelector('form')!.getBoundingClientRect();
    return form.top < 0 && form.bottom > innerHeight;
  });
  await page.addStyleTag({ content: '.sticky-actions { transform: translateY(-180px) }' });
  await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('ahthatswho:layout-report:v1') || '{}').activeGap,
      ),
    )
    .toBeGreaterThanOrEqual(179);
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
