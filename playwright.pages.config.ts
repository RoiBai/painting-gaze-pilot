import { defineConfig } from '@playwright/test';

// Run after: VITE_BASE_PATH=/painting-gaze-pilot/ npm run build
// For the published site: PAGES_TEST_URL=https://owner.github.io/painting-gaze-pilot/ npx playwright test -c playwright.pages.config.ts
const publishedUrl = process.env.PAGES_TEST_URL;
export default defineConfig({
  testDir: 'tests/pages',
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL: publishedUrl || 'http://localhost:4175/painting-gaze-pilot/',
    channel: 'chrome',
    viewport: { width: 1440, height: 1000 },
    headless: true,
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
    permissions: ['camera'],
  },
  webServer: publishedUrl ? undefined : {
    command: 'VITE_BASE_PATH=/painting-gaze-pilot/ npx vite preview --host 127.0.0.1 --port 4175 --strictPort',
    url: 'http://localhost:4175/painting-gaze-pilot/',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
