import { test, expect } from '@playwright/test';

// Offline precaching deliberately downloads all chunks. Disable it here to
// measure the scripts needed by the page itself.
test.use({ serviceWorkers: 'block' });

test('cold home loads exclude editor and other route code', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script')
      scripts.push(new URL(request.url()).pathname.split('/').pop()!);
  });
  const expectHomeOnly = () => {
    expect(scripts.some((name) => name.startsWith('HomePage-'))).toBe(true);
    expect(
      scripts.filter((name) =>
        /^(Editor|EditorPage|ReviewPage|SettingsPage|CapturePage|InboxPage|HouseholdPage|HistoryPage|TrashPage)-/.test(
          name,
        ),
      ),
    ).toEqual([]);
  };

  await page.goto('/home');
  await expect(page.getByRole('button', { name: /^Add a person/ })).toBeVisible();
  expectHomeOnly();

  await page.getByRole('button', { name: /^Add a person/ }).click();
  await page.getByLabel('First name', { exact: true }).fill('Beatrice');
  expect(scripts.some((name) => name.startsWith('EditorPage-'))).toBe(true);
  expect(scripts.some((name) => name.startsWith('Editor-'))).toBe(true);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();

  scripts.length = 0;
  await page.goto('/home');
  await expect(page.getByText('Beatrice', { exact: true })).toBeVisible();
  expectHomeOnly();
});
