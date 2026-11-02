// Build separata della web app di navigazione: vive sotto /naviga/ accanto al sito,
// con un service worker che controlla solo /naviga/ e mette in cache tutto per l'uso offline.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here('.'),
  base: '/naviga/',
  publicDir: here('public'),
  build: {
    outDir: here('../dist/naviga'),
    emptyOutDir: true,
    rollupOptions: { input: { main: here('index.html'), privacy: here('privacy.html') } },
  },
  server: { port: 5180 },
  preview: { port: 4180 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      scope: '/naviga/',
      base: '/naviga/',
      manifest: {
        id: '/naviga/',
        name: 'La Riccia – Naviga le Tremiti',
        short_name: 'La Riccia',
        description: 'Supporto informativo per chi noleggia un gommone alle Isole Tremiti: posizione, zone dell’area marina protetta, attrazioni.',
        lang: 'it',
        start_url: '/naviga/',
        scope: '/naviga/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#04212d',
        background_color: '#04212d',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // tutto in precache: app, mappa PMTiles, font, icone, dati e traccia demo
        globPatterns: ['**/*.{html,js,mjs,css,json,png,svg,pbf,pmtiles,gpx,webmanifest}'],
        // manifest e icone del manifest li aggiunge già il plugin
        globIgnores: ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: '/naviga/index.html',
        navigateFallbackAllowlist: [/^\/naviga\//],
        navigateFallbackDenylist: [/privacy/],
        ignoreURLParametersMatching: [/.*/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
