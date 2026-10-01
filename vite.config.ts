import { defineConfig } from 'vite';
import { solidStart } from '@solidjs/start/config';
import { nitro } from 'nitro/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaOptions } from './pwa.config.ts';
export default defineConfig({
  plugins: [solidStart(), nitro(), VitePWA(pwaOptions)],
  nitro: {
    preset: 'static',
    prerender: { routes: ['/', '/privacy'], crawlLinks: false, failOnError: true },
  },
  server: {
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  define: {
    __BUILD__: JSON.stringify({
      version: '0.1.0-beta.1',
      sha: process.env.BUILD_SHA || 'uncommitted',
      time: new Date().toISOString(),
    }),
  },
} as Parameters<typeof defineConfig>[0]);
