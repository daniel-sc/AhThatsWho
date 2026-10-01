import type { VitePWAOptions } from 'vite-plugin-pwa';
export const pwaOptions = {
  registerType: 'prompt',
  outDir: '.output/public',
  injectRegister: null,
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
    navigateFallbackDenylist: [/^\/api\//, /^\/privacy(?:\/|$|\.html)/],
    runtimeCaching: [],
  },
} satisfies Partial<VitePWAOptions>;
