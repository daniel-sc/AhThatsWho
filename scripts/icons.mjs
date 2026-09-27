import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const svg = readFileSync('public/icon.svg', 'utf8');
for (const [size, name] of [
  [192, 'icon-192.png'],
  [512, 'icon-512.png'],
  [180, 'apple-touch-icon.png'],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;width:100%;height:100%;background:#183e35}svg{display:block;width:100%;height:100%}</style>${svg}`,
  );
  await page.screenshot({ path: `public/${name}` });
}
await browser.close();
