import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { fixtures } from '../src/domain/fixtures';
import type { DriveHistory } from '../src/backup/contracts';
async function driveMock(page: Page, separateBrowser = false) {
  let account = 'account-one';
  let history = 'current-history-1234567890';
  let connected = false;
  let failUpload = false;
  const remote = JSON.stringify(fixtures(3));
  const histories: DriveHistory[] = [
    {
      id: 'old-history-1234567890',
      label: 'Old phone',
      snapshots: [
        {
          id: 'old-file-1234567890',
          snapshotId: 'old-snapshot-1234567890',
          historyId: 'old-history-1234567890',
          exportedAt: '2026-09-29T12:00:00.000Z',
          bytes: remote.length,
          digest: createHash('sha256').update(remote).digest('hex'),
          version: 1,
          households: 3,
          contexts: 3,
          captures: 0,
        },
      ],
    },
  ];
  const content = new Map([['old-file-1234567890', remote]]);
  let uploads = 0,
    claims = 0;
  await page.route('**/api/backup/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname.replace('/api/backup/', '');
    if (path === 'status')
      return route.fulfill({
        json: {
          configured: true,
          connected: connected && !!req.headers().authorization,
          accountId: account,
          email: `${account}@example.com`,
          installation: history,
        },
      });
    if (path === 'connect')
      return route.fulfill({
        json: {
          state: 'synthetic-state-1234567890',
          claim: 'synthetic-claim-1234567890',
          url: '/api/backup/authorize?state=synthetic-state-1234567890',
        },
      });
    if (path === 'authorize')
      return route.fulfill({ status: 302, headers: { Location: '/?backup=return' } });
    if (path === 'finish') {
      if (separateBrowser && req.postDataJSON().completion !== 'return-code-1234567890')
        return route.fulfill({ json: { needsCode: true } });
      connected = true;
      claims++;
      return route.fulfill({ json: { token: `session-${account}-1234567890` } });
    }
    if (path === 'disconnect') {
      connected = false;
      return route.fulfill({ json: {} });
    }
    if (path === 'histories') return route.fulfill({ json: histories });
    if (path === 'rename') {
      let h = histories.find((h) => h.id === history);
      if (!h) {
        h = { id: history, label: req.postDataJSON().label, snapshots: [] };
        histories.push(h);
      }
      h.label = req.postDataJSON().label;
      return route.fulfill({ json: {} });
    }
    if (path === 'prune') return route.fulfill({ json: {} });
    if (path.startsWith('snapshots/')) {
      const id = path.split('/')[1];
      if (req.method() === 'PUT') {
        uploads++;
        if (failUpload)
          return route.fulfill({ status: 502, json: { error: 'Synthetic upload failure' } });
        const text = req.postData()!,
          b = JSON.parse(text),
          fileId = `file-${id}`;
        let h = histories.find((h) => h.id === history);
        if (!h) {
          h = { id: history, label: 'This browser', snapshots: [] };
          histories.push(h);
        }
        content.set(fileId, text);
        h.snapshots.unshift({
          id: fileId,
          snapshotId: id,
          historyId: history,
          exportedAt: new Date().toISOString(),
          bytes: text.length,
          digest: createHash('sha256').update(text).digest('hex'),
          version: 1,
          households: b.households.length,
          contexts: b.contexts.length,
          captures: b.inbox.length,
        });
        return route.fulfill({ json: { id: fileId } });
      }
      return route.fulfill({ contentType: 'application/json', body: content.get(id) || '{}' });
    }
    return route.fulfill({ status: 404, json: { error: 'Unknown mock route' } });
  });
  return {
    histories,
    get uploads() {
      return uploads;
    },
    get claims() {
      return claims;
    },
    changeAccount() {
      account = 'account-two';
      history = 'second-history-1234567890';
    },
    fail() {
      failUpload = true;
    },
    succeed() {
      failUpload = false;
    },
  };
}
async function openSettings(page: Page) {
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
}
async function connect(page: Page) {
  await page.goto('/');
  await openSettings(page);
  await page.getByRole('button', { name: 'Connect Google Drive', exact: true }).click();
  await expect(page.getByText('account-one@example.com', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Back up this notebook here', exact: true }),
  ).toBeEnabled();
}
test('Google connection lists old histories without uploading emptiness, and restores into its own history', async ({
  page,
}) => {
  const mock = await driveMock(page);
  await connect(page);
  expect(mock.uploads).toBe(0);
  expect(mock.claims).toBe(1);
  await page.getByText('Old phone', { exact: false }).first().click();
  await page
    .locator('.backup-history')
    .filter({ hasText: 'Old phone' })
    .getByRole('button', { name: 'Restore', exact: true })
    .click();
  await expect(page.getByRole('region', { name: 'Import preview' })).toContainText('3 households');
  await page.getByRole('button', { name: 'Cancel import' }).click();
  expect(mock.uploads).toBe(0);
  await page
    .locator('.backup-history')
    .filter({ hasText: 'Old phone' })
    .getByRole('button', { name: 'Restore', exact: true })
    .click();
  await page.getByRole('button', { name: 'Replace & use this dataset' }).click();
  await openSettings(page);
  await page.getByRole('button', { name: 'Back up now', exact: true }).click();
  await expect(page.getByText('Backed up', { exact: true })).toBeVisible();
  expect(mock.histories.find((h) => h.label === 'Old phone')!.snapshots).toHaveLength(1);
  expect(
    mock.histories.find((h) => h.id === 'current-history-1234567890')!.snapshots[0].households,
  ).toBe(3);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Back up this notebook here', exact: true }),
  ).toHaveCount(0);
});
test('changing Google account requires a new choice and leaves the old history intact', async ({
  page,
}) => {
  const mock = await driveMock(page);
  await connect(page);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Back up this notebook here', exact: true }).click();
  await expect(page.getByText('Backed up', { exact: true })).toBeVisible();
  const count = mock.uploads;
  mock.changeAccount();
  await page.getByRole('button', { name: 'Change Google account', exact: true }).click();
  await expect(page.getByText('account-two@example.com', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Back up this notebook here', exact: true }),
  ).toBeEnabled();
  expect(mock.uploads).toBe(count);
  expect(mock.histories.find((h) => h.id === 'current-history-1234567890')!.snapshots).toHaveLength(
    1,
  );
});
test('failed upload remains pending and can be retried; disconnect keeps remote snapshots', async ({
  page,
}) => {
  const mock = await driveMock(page);
  await connect(page);
  mock.fail();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Back up this notebook here', exact: true }).click();
  await expect(page.getByText('Backup failed', { exact: true })).toBeVisible();
  await expect(page.getByText(/Last verified backup:/)).toContainText('None yet');
  mock.succeed();
  await page.getByRole('button', { name: 'Back up now', exact: true }).click();
  await expect(page.getByText('Backed up', { exact: true })).toBeVisible();
  const snapshots = mock.histories.length;
  await page.getByRole('button', { name: 'Disconnect this installation', exact: true }).click();
  await expect(page.getByText('Disconnected', { exact: true })).toBeVisible();
  expect(mock.histories).toHaveLength(snapshots);
});

test('finishes authorization opened in another browser using its one-time code', async ({
  page,
}) => {
  const mock = await driveMock(page, true);
  await page.goto('/');
  await openSettings(page);
  await page.getByRole('button', { name: 'Connect Google Drive', exact: true }).click();
  await expect(page.getByLabel('Connection code', { exact: true })).toBeVisible();
  expect(mock.claims).toBe(0);
  expect(mock.uploads).toBe(0);
  await page.getByLabel('Connection code', { exact: true }).fill('return-code-1234567890');
  await page.getByRole('button', { name: 'Finish Google connection', exact: true }).click();
  await expect(page.getByText('account-one@example.com', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Back up this notebook here', exact: true }),
  ).toBeEnabled();
  expect(mock.claims).toBe(1);
  expect(mock.uploads).toBe(0);
});
