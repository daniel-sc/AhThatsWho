import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Render the approved transparent mark at each delivery size.
const mark = readFileSync('design/brand/aha-mark-source.png').toString('base64');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const [size, name, background, inset] of [
    [256, 'brand-mark.png', 'transparent', 0],
    [64, 'favicon.png', '#ff624f', 0],
    [192, 'icon-192.png', '#ff624f', 0],
    [512, 'icon-512.png', '#ff624f', 0],
    [512, 'icon-maskable-512.png', '#ff624f', 14],
    [180, 'apple-touch-icon.png', '#ff624f', 0],
  ]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>
      html,body{margin:0;width:100%;height:100%;background:${background}}
      img{display:block;position:absolute;inset:${inset}%;width:${100 - inset * 2}%;height:${100 - inset * 2}%}
      </style><img src="data:image/png;base64,${mark}" />`);
    await page.locator('img').evaluate((img) => img.decode());
    await page.screenshot({ path: `public/${name}`, omitBackground: background === 'transparent' });
  }
} finally {
  await browser.close();
}
