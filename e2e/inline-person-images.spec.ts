import { test, expect } from '@playwright/test';
import { fixtures } from '../src/domain/fixtures';

// Measure page loading separately from intentional offline precaching.
test.use({ serviceWorkers: 'block' });
test('inline image editing loads on demand, saves only on Save, and keeps card navigation', async ({
  page,
}) => {
  await page.goto('/settings');
  await page.locator('input[type=file]').setInputFiles({
    name: 'people.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixtures(2))),
  });
  await page.getByRole('button', { name: 'Replace & use this dataset' }).click();
  const preference = page.getByRole('checkbox', { name: /completeness itch/ });
  await expect(preference).not.toBeChecked();
  await preference.check();
  await expect(preference).toBeChecked();
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname);
  });
  await page.goto('/home');
  const image = page.locator('.inline-image-button').first();
  await expect(image).toBeVisible();
  expect(
    scripts.filter((name) =>
      /\/(PersonImageEditor|PersonImageFields|ImageCropper|Editor|cropper)[-.]/.test(name),
    ),
  ).toEqual([]);
  const row = page.locator('[data-household]').first();
  const householdId = await row.getAttribute('data-household');
  await image.click();
  const editor = page.getByRole('dialog', { name: /^Image of/ });
  await expect(editor).toBeVisible();
  expect(scripts.some((name) => /\/PersonImageEditor-/.test(name))).toBe(true);
  await expect(page).toHaveURL(/\/home$/);
  await page.mouse.click(2, 2);
  await expect(editor).toBeVisible();
  await editor.locator('input[type=file]').setInputFiles({
    name: 'portrait.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#bad4c4"/><circle cx="150" cy="100" r="55" fill="#bc7f55"/><path d="M50 300V220a100 90 0 0 1 200 0v80" fill="#344b73"/></svg>',
    ),
  });
  const crop = page.getByRole('dialog', { name: /^Frame/ });
  await crop.getByRole('button', { name: 'Use this image' }).click();
  await expect(crop).toHaveCount(0);
  await expect(editor.locator('img')).toBeVisible();
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const savedRow = page.locator(`[data-household="${householdId}"]`);
  await expect(savedRow.locator('.inline-image-button img')).toBeVisible();
  await expect(savedRow.getByRole('button', { name: /^Edit image/ })).toBeFocused();
  await savedRow.getByRole('button', { name: /^Edit image/ }).click();
  await editor.getByRole('button', { name: 'Remove image' }).click();
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(savedRow.locator('.inline-image-button img')).toBeVisible();
  await expect(savedRow.getByRole('button', { name: /^Edit image/ })).toBeFocused();
  await page.reload();
  await expect(savedRow.locator('.inline-image-button img')).toBeVisible();
  await savedRow.getByRole('button', { name: /^Open household/ }).click();
  await expect(page).toHaveURL(new RegExp(`/households/${householdId}$`));
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await preference.uncheck();
  await expect(preference).not.toBeChecked();
  await page.goto('/home');
  await expect(page.locator('.inline-image-button')).toHaveCount(0);
  await expect(page.locator('.card-portrait img')).toBeVisible();
});
