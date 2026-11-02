import { defineConfig, devices } from '@playwright/test';

// Test end-to-end della web app: build di produzione servita con vite preview.
export default defineConfig({
  testDir: './e2e',
  timeout: 300_000,
  reporter: [['list']],
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://localhost:4181',
    permissions: ['geolocation'],
    geolocation: { latitude: 42.1201, longitude: 15.4995 },
    locale: 'it-IT',
  },
  webServer: {
    command: 'npx vite build -c naviga/vite.config.ts && npx vite preview -c naviga/vite.config.ts --port 4181 --strictPort',
    cwd: '..',
    url: 'http://localhost:4181/naviga/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
