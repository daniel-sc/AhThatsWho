import { chromium } from '@playwright/test';
import { copyFileSync, readFileSync } from 'node:fs';

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
  ]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>
      html,body{margin:0;width:100%;height:100%;background:${background}}
      img{display:block;position:absolute;inset:${inset}%;width:${100 - inset * 2}%;height:${100 - inset * 2}%}
      </style><img src="data:image/png;base64,${mark}" />`);
    await page.locator('img').evaluate((img) => img.decode());
    await page.screenshot({ path: `public/${name}`, omitBackground: background === 'transparent' });
  }
  // Keep the iOS foreground bright even when the Home Screen darkens the tile.
  // Use the original alpha silhouette, so the approved logo shape is unchanged.
  await page.setViewportSize({ width: 180, height: 180 });
  await page.setContent(`<canvas width="180" height="180"></canvas>`);
  await page.evaluate(async (source) => {
    document.body.style.margin = '0';
    const mark = new Image();
    mark.src = source;
    await mark.decode();
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    ctx.drawImage(mark, 0, 0, 180, 180);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#ff624f';
    ctx.fillRect(0, 0, 180, 180);
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#202020';
    ctx.fillRect(0, 0, 180, 180);
  }, `data:image/png;base64,${mark}`);
  await page.locator('canvas').screenshot({ path: 'public/apple-touch-icon-v2.png' });
  // Keep the conventional fallback URL consistent; HTML uses the fresh URL.
  copyFileSync('public/apple-touch-icon-v2.png', 'public/apple-touch-icon.png');
} finally {
  await browser.close();
}
