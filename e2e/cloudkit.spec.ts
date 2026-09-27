import { test, expect } from '@playwright/test';

test('CloudKit authentication failure reports the cause without a success message', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).CloudKit = {
      configure() {},
      getDefaultContainer: () => ({
        privateCloudDatabase: {},
        setUpAuth: async () => {
          throw { ckErrorCode: 'AUTHENTICATION_FAILED' };
        },
        whenUserSignsIn: () => new Promise(() => {}),
        whenUserSignsOut: () => new Promise(() => {}),
      }),
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByText('CloudKit configuration', { exact: true }).click();
  await page.getByLabel('Website API token', { exact: true }).fill('synthetic-website-token');
  await page.getByRole('button', { name: 'Connect iCloud', exact: true }).click();
  await expect(page.getByText(/Apple rejected the CloudKit website token/).first()).toBeVisible();
  await expect(
    page.getByText('Use the Apple sign-in control to connect your private iCloud backups.'),
  ).toHaveCount(0);
});
