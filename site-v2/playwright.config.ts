import { defineConfig } from '@playwright/test';

// Optionally exercise a running Vite server: production bundles hide lazy-import failures.
const externalURL = process.env.PLAYWRIGHT_BASE_URL;
export default defineConfig({
  testDir: './tests', fullyParallel: true, workers: 3,
  use: { baseURL: externalURL || 'http://127.0.0.1:4325', headless: true },
  webServer: externalURL ? undefined : {
    command: 'npm run preview -- --host 127.0.0.1 --port 4325',
    url: 'http://127.0.0.1:4325', reuseExistingServer: false, timeout: 60000,
  },
});
