import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'scripts/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'state/playwright-report' }],
  ],
  use: {
    baseURL: process.env.COCKPIT_URL ?? 'http://localhost:28080',
    headless: true,
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  outputDir: 'state/browser-results',
});
