import { test, expect } from '@playwright/test';

// Chrome's built-in test camera supplies synthetic video, never a human face.
// No StudyEngine/session is created: these are library/resource smoke tests only.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] });

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

test('actual official bundle loads local WASM/model and emits null on Chrome test camera', async ({ page }) => {
  test.setTimeout(90_000);
  const requests: string[] = [];
  const failures: string[] = [];
  page.on('request', request => requests.push(request.url()));
  page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  page.on('dialog', dialog => { void dialog.dismiss(); failures.push(`Unexpected dialog: ${dialog.message()}`); });
  await loadAdapter(page);
  // GitHub Pages projects share one origin. A camera session must never clear
  // another project's default localforage/keyvaluepairs store.
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('localforage', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('keyvaluepairs');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('keyvaluepairs', 'readwrite');
        transaction.objectStore('keyvaluepairs').put('other-project-data', 'other-project-sentinel');
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
  const outcome = await page.evaluate(async () => {
    const target = window as any;
    try { await target.__cameraAdapter.start({ regression: 'ridge', kalman: true }); return { error: null, state: target.__cameraAdapter.getStatus() }; }
    catch (error) { return { error: String(error), state: target.__cameraAdapter.getStatus() }; }
  });
  expect(outcome.error, JSON.stringify(outcome)).toBeNull();
  await expect.poll(async () => page.evaluate(() => (window as any).__cameraTest.samples.length)).toBeGreaterThan(1);
  const reset = await page.evaluate(async () => {
    const target = window as any;
    const runtime = (document.querySelector('iframe[data-webgazer-runtime]') as HTMLIFrameElement).contentWindow as any;
    const previous = runtime.webgazer.getRegression()[0];
    await target.__cameraAdapter.resetCalibration();
    const current = runtime.webgazer.getRegression()[0];
    const sentinel = await new Promise<unknown>((resolve, reject) => {
      const request = indexedDB.open('localforage', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('keyvaluepairs', 'readonly');
        const get = transaction.objectStore('keyvaluepairs').get('other-project-sentinel');
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => reject(get.error);
        transaction.oncomplete = () => db.close();
      };
    });
    return { sentinel, freshModel: previous !== current, trainingCount: current.getData().length };
  });
  expect(reset).toEqual({sentinel:'other-project-data',freshModel:true,trainingCount:0});
  const summary = await page.evaluate(() => {
    const target = window as any;
    const result = { samples: target.__cameraTest.samples, statuses: target.__cameraTest.statuses, frameWidth: document.querySelector('iframe[data-webgazer-runtime]')?.getBoundingClientRect().width, viewportWidth: window.innerWidth };
    target.__cameraAdapter.stop();
    return result;
  });
  expect(summary.samples.every((sample: any) => sample.x === null && sample.y === null)).toBe(true);
  expect(summary.statuses.some((state: any) => state.status === 'tracking')).toBe(false);
  expect(summary.frameWidth).toBe(summary.viewportWidth);
  expect(requests.some(url => url.endsWith('.wasm'))).toBe(true);
  expect(requests.some(url => url.endsWith('.data'))).toBe(true);
  const modelRequests = requests.filter(url => /face_mesh|webgazer\.js/.test(url));
  expect(modelRequests.length).toBeGreaterThan(2);
  expect(modelRequests.every(url => new URL(url).hostname === 'localhost')).toBe(true);
  expect(failures).toEqual([]);
  await expect(page.locator('iframe[data-webgazer-runtime]')).toHaveCount(0);
});

test('failed pinned script never reports tracking or generates samples', async ({ page }) => {
  await page.route('**/vendor/webgazer-3.5.3/webgazer.js', route => route.abort('failed'));
  await loadAdapter(page);
  const outcome = await page.evaluate(async () => {
    const target = window as any;
    try { await target.__cameraAdapter.start({ regression: 'ridge', kalman: false }); } catch { /* status asserted below */ }
    return { state: target.__cameraAdapter.getStatus(), samples: target.__cameraTest.samples, statuses: target.__cameraTest.statuses };
  });
  expect(outcome.state.status).toBe('error');
  expect(outcome.state.message).toContain('加载失败');
  expect(outcome.samples).toEqual([]);
  expect(outcome.statuses.some((state: any) => state.status === 'tracking')).toBe(false);
});
