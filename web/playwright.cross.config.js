// The same suite in the other two engines: WebKit (Safari, iPhone) and Firefox.
// `npm run e2e:cross`. CI runs Chromium only; run this before a release.
import { devices } from '@playwright/test';
import base from './playwright.config.js';

export default {
  ...base,
  projects: [
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
    { name: 'iphone', use: { ...devices['iPhone 15'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
  ],
};
