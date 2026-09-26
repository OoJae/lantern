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
  // A server already on 4319 (another worktree's preview, or one left over) would be tested silently
  // in place of the build just made: reuse is opt-in, so a busy port fails loudly (--strictPort).
  // PW_REUSE_SERVER=1 tests your own running `npm run preview`.
  webServer: external
    ? undefined
    : { command: 'npm run preview', url: 'http://localhost:4319', reuseExistingServer: process.env.PW_REUSE_SERVER === '1', timeout: 60_000 },
});
