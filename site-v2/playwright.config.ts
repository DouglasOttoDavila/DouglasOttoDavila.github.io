import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', fullyParallel: true, workers: 3, use: { baseURL: 'http://127.0.0.1:4325', headless: true }, webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4325', url: 'http://127.0.0.1:4325', reuseExistingServer: false, timeout: 60000 } });
