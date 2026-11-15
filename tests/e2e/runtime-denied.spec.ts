import { test, expect } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream'] }, permissions: [] });

async function loadAdapter(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const moduleUrl = '/src/webgazerAdapter.ts';
    const { WebGazerAdapter } = await import(/* @vite-ignore */ moduleUrl);
    const target = window as any;
    target.__cameraTest = { samples: [], statuses: [] };
    target.__cameraAdapter = new WebGazerAdapter((sample: any) => target.__cameraTest.samples.push(sample), (status: any) => target.__cameraTest.statuses.push(status));
  });
}

test('blocked camera produces actionable permission error and no samples', async ({ page, context }) => {
  await loadAdapter(page);
  const cdp = await context.newCDPSession(page);
  const { targetInfo } = await cdp.send('Target.getTargetInfo');
  await cdp.send('Browser.setPermission', { permission: { name: 'camera' }, setting: 'denied', origin: new URL(page.url()).origin, browserContextId: targetInfo.browserContextId });
  const outcome = await page.evaluate(async () => {
    const target = window as any;
    try { await target.__cameraAdapter.start({ regression: 'ridge', kalman: false }); } catch { /* status asserted below */ }
    return { state: target.__cameraAdapter.getStatus(), samples: target.__cameraTest.samples };
  });
  expect(outcome.state.status).toBe('error');
  expect(outcome.state.message).toContain('权限被拒绝');
  expect(outcome.samples).toEqual([]);
});
