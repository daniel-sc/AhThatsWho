import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [
    solid(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'favicon.png',
        'brand-mark.png',
        'apple-touch-icon.png',
        'apple-touch-icon-v2.png',
      ],
      manifest: {
        name: 'AhThatsWho',
        short_name: 'AhThatsWho',
        description: 'Names, in context.',
        theme_color: '#ff624f',
        background_color: '#fffefb',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ttf}'],
        navigateFallback: '/index.html',
        runtimeCaching: [],
      },
    }),
  ],
  define: {
    __BUILD__: JSON.stringify({
      version: '0.1.0-beta.1',
      sha: process.env.BUILD_SHA || 'uncommitted',
      time: new Date().toISOString(),
    }),
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], setupFiles: ['tests/setup.ts'] },
} as Parameters<typeof defineConfig>[0]);
