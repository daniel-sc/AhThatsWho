import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [
    solid(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'NameCue',
        short_name: 'NameCue',
        description: 'Names, in context.',
        theme_color: '#183e35',
        background_color: '#f8f7f2',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
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
