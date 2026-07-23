import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3200);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new RangeError('A PLAYWRIGHT_PORT érvényes TCP-port legyen.');
}
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './apps/reference/tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL,
    extraHTTPHeaders: {
      'x-demo-role': 'operator',
      'x-demo-subject': 'playwright-operator',
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm build && pnpm start -- -H 127.0.0.1 -p ${port}`,
    url: `${baseURL}/api/health/live`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    gracefulShutdown: {
      signal: 'SIGTERM',
      timeout: 5_000,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
