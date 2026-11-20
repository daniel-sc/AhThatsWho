import { expect, test } from '@playwright/test';

test('pageviews keep the preview hostname and redact record IDs before transmission', async ({
  page,
}) => {
  // Use a preview-like hostname; the tracker ignores bare localhost and automated browsers.
  const origin = 'http://preview.localhost:4173';
  await page.addInitScript(() => Object.assign(window, { __plausible: true }));
  const views: string[] = [];
  const payloads: string[] = [];
  await page.route('https://plausible.io/api/event', async (route) => {
    const body = route.request().postData()!;
    payloads.push(body);
    const event = JSON.parse(body);
    if (event.n === 'pageview') views.push(event.u);
    await route.fulfill({ status: 202, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.goto(origin);
  await expect.poll(() => views).toEqual([`${origin}/home`]);
  await page.goto(`${origin}/households/new?private-query=1`);
  await page.getByLabel('First name', { exact: true }).fill('PrivateExample');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect
    .poll(() => views)
    .toEqual(
      ['/home', '/households/new', '/households/ID', '/households/ID/edit'].map(
        (path) => origin + path,
      ),
    );
  for (const value of [id, 'private-query', 'PrivateExample']) {
    expect(payloads.join('\n')).not.toContain(value);
  }
});
