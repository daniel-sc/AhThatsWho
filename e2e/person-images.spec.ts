import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Persistent storage exercises genuine OPFS: a reference must never survive a
// failed publication, and canceled editor changes must never change saved images.
test('person images publish before drafts, survive reopen, and recover in a ZIP', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ahthatswho-images-'));
  const context = await chromium.launchPersistentContext(directory, {
    viewport: { width: 390, height: 844 },
    baseURL: 'http://127.0.0.1:4173',
  });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await page
      .getByRole('button', { name: /^(Add household|Add a person)/ })
      .first()
      .click();
    await page.getByLabel('First name', { exact: true }).fill('Avery');
    await page.getByRole('button', { name: 'Image', exact: true }).click();
    const bytes = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 600;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#b8d0bf';
      ctx.fillRect(0, 0, 900, 600);
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = ['#eaab7d', '#785e53', '#d5c2a6'][i];
        ctx.beginPath();
        ctx.arc(150 + i * 300, 210, 75, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ['#d45445', '#304958', '#65713f'][i];
        ctx.fillRect(60 + i * 300, 290, 180, 280);
      }
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png'),
      );
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    const photo = {
      name: 'synthetic-group.png',
      mimeType: 'image/png',
      buffer: Buffer.from(bytes),
    };
    await page.getByLabel('Choose image for Avery').setInputFiles(photo);
    const crop = page.getByRole('dialog');
    await expect(crop.getByRole('button', { name: 'Use this image' })).toBeEnabled();
    await crop.getByRole('button', { name: '+ Zoom in', exact: true }).click();
    const group = crop.getByRole('group', { name: /^Image crop/ });
    await group.focus();
    await group.press('ArrowRight');
    await crop.getByRole('button', { name: 'Use this image' }).click();
    await expect(crop).toHaveCount(0);
    await expect(page.getByText('Local draft saved · not applied')).toBeVisible();
    await expect(page.locator('.person-image-editor img')).toBeVisible();
    await page.reload();
    await expect(page.locator('.person-image-editor img')).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Enlarge image of Avery' })).toBeEnabled();
    await page.getByRole('button', { name: 'Enlarge image of Avery' }).click();
    await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Enlarge image of Avery' })).toBeFocused();

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('button', { name: 'Remove image', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel & discard draft' }).click();
    await expect(page.getByRole('button', { name: 'Enlarge image of Avery' })).toBeEnabled();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Choose image for Avery').setInputFiles(photo);
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Use this image' }),
    ).toBeEnabled();
    // A genuine unavailable root after encoding must keep the existing association.
    await page.evaluate(() => {
      navigator.storage.getDirectory = async () => {
        throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      };
    });
    await page.getByRole('dialog').getByRole('button', { name: 'Use this image' }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText(/storage|saved/);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel & discard draft' }).click();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Enlarge image of Avery' })).toBeEnabled();
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(page.locator('.household-row img')).toHaveCount(1);
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export backup ZIP' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    const path = await download.path();
    expect(path).toBeTruthy();
    const restoreDirectory = await mkdtemp(join(tmpdir(), 'ahthatswho-image-restore-'));
    const restored = await chromium.launchPersistentContext(restoreDirectory, {
      baseURL: 'http://127.0.0.1:4173',
    });
    try {
      const destination = await restored.newPage();
      await destination.goto('/settings');
      await destination.locator('input[type=file]').setInputFiles(path!);
      await destination.getByRole('button', { name: 'Replace & use this dataset' }).click();
      await destination.getByRole('button', { name: 'Home', exact: true }).click();
      await expect(destination.locator('.household-row img')).toHaveCount(1);
      await destination.reload();
      await expect(destination.locator('.household-row img')).toBeVisible();
    } finally {
      await restored.close();
      await rm(restoreDirectory, { recursive: true, force: true });
    }
  } finally {
    await context.close();
    await rm(directory, { recursive: true, force: true });
  }
});
