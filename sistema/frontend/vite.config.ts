/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Dictaminado y Rutas Eficientes', short_name: 'Dictaminado', lang: 'es-AR',
        description: 'Dictámenes técnicos de arbolado público — Municipalidad de Rosario',
        start_url: '/', display: 'standalone', orientation: 'portrait', background_color: '#f4f7f4', theme_color: '#1a4d2e',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // La app carga sin conexión (precache de assets). Nunca se cachea la API: los datos viven en IndexedDB.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          { urlPattern: ({ url }) => url.hostname.endsWith('tile.openstreetmap.org'), handler: 'CacheFirst',
            options: { cacheName: 'mapa-teselas', expiration: { maxEntries: 600, maxAgeSeconds: 14 * 24 * 3600 }, cacheableResponse: { statuses: [0, 200] } } },
        ],
      },
    }),
  ],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] },
});
