// End-to-end checks of the browser demo, against `vite preview` -- which serves the production
// CSP -- unless BASE_URL points at a deployment.
import { defineConfig, devices } from '@playwright/test';

const external = process.env.BASE_URL;

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: external ?? 'http://localhost:4319',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: external
    ? undefined
    : { command: 'npm run preview', url: 'http://localhost:4319', reuseExistingServer: true, timeout: 60_000 },
});
