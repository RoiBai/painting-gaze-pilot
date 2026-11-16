import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import { questionVariants, QUESTION_VARIANT_VERSION } from '../../src/questionVariants';

test('published researcher preview and all four participant links preserve the Pages subpath', async ({page}) => {
  const site = new URL(String(test.info().project.use.baseURL));
  await page.goto('./?preview=design');
  const table = page.getByRole('table', {name:'四人交叉分配'});
  await expect(table).toBeVisible();
  await expect(page.getByText(questionVariants.alpha['ming-xingle-archery'].pre[0].prompt, {exact:true})).toBeVisible();
  await expect(page.getByText(questionVariants.beta['ming-xingle-archery'].pre[0].prompt, {exact:true})).toBeVisible();
  await page.locator('.assignment-preview').screenshot({path:'docs/qa-assignment.png'});
  for(const id of ['N03','N04','N05','N06']) {
    await expect(table.getByRole('link', {name:`${id} ↗`})).toHaveAttribute('href', `${site.pathname}?participant=${id}`);
  }
  for(const id of ['N03','N04','N05','N06']) {
    await page.goto(`./?participant=${id}`);
    await expect(page.getByLabel('匿名参与者编号')).toHaveValue(id);
    await expect(page.getByRole('table', {name:'四人交叉分配'})).toHaveCount(0);
  }
});

// Production build, isolated browser data, synthetic non-face camera; no user records.
test('Pages subpath loads pinned local resources and exports a local session ZIP', async ({ page }) => {
  const site = new URL(String(test.info().project.use.baseURL));
  const requests: { url: string; method: string }[] = [];
  const failures: string[] = [];
  page.on('request', request => requests.push({ url: request.url(), method: request.method() }));
  page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.goto('./?participant=N04');
  await expect(page.getByLabel('匿名参与者编号')).toHaveValue('N04');
  await expect(page.locator('a.brand')).toHaveAttribute('href', site.pathname);
  await page.getByRole('button', { name: '研究者设置', exact: true }).click();
  await expect.poll(() => page.locator('img.material-preview').evaluateAll(images => images.map(image => (image as HTMLImageElement).naturalWidth))).toEqual([6888, 5900]);
  const paths = await page.locator('img.material-preview').evaluateAll(images => images.map(image => new URL((image as HTMLImageElement).src).pathname));
  expect(paths.every(path => path.startsWith(`${site.pathname}materials/`))).toBe(true);
  await page.getByRole('button', { name: '返回开始页', exact: true }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /同意并进入摄像头准备/ }).click();
  await page.getByRole('button', { name: '启用 / 重试摄像头', exact: true }).click();
  await expect(page.locator('.status')).toContainText('未获得有效预测', { timeout: 60_000 });
  expect(requests.some(request => request.url.endsWith('.wasm'))).toBe(true);
  expect(requests.some(request => request.url.endsWith('.data'))).toBe(true);
  const modelPaths = requests.filter(request => /face_mesh|webgazer\.js|runtime\.html/.test(request.url));
  expect(modelPaths.length).toBeGreaterThan(3);
  expect(modelPaths.every(request => new URL(request.url).pathname.startsWith(`${site.pathname}vendor/`))).toBe(true);

  await page.getByRole('button', { name: '退出并保留记录', exact: true }).click();
  await expect(page.locator('iframe[data-webgazer-runtime]')).toHaveCount(0);
  await expect(page.getByLabel('本次分组', { exact: true })).toContainText(/蹴鞠.*射箭.*甲（alpha）/);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /一键.*ZIP/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^preview_N04_.*\.zip$/);
  const archive = unzipSync(new Uint8Array(await readFile((await download.path())!)));
  const names = Object.keys(archive);
  const snapshotPath = names.find(name => name.endsWith('/session.json'))!;
  const snapshot = JSON.parse(strFromU8(archive[snapshotPath]));
  expect(snapshot.participantId).toBe('N04');
  expect(snapshot.status).toBe('interrupted');
  expect(snapshot.assignment).toEqual({planVersion:'crossed-four-v1',participantId:'N04',order:'BA',questionVariant:'alpha',questionVersion:QUESTION_VARIANT_VERSION,paintingOrder:['ming-xingle-cuju','ming-xingle-archery']});
  expect(snapshot.order).toEqual(['ming-xingle-cuju','ming-xingle-archery']);
  for (const painting of snapshot.config.paintings) {
    expect(painting.pre).toEqual(questionVariants.alpha[painting.paintingId].pre);
    expect(painting.post).toEqual(questionVariants.alpha[painting.paintingId].post);
  }
  expect(snapshot.config.paintings[0].image).toBe('/materials/ming-xingle-archery-v2.png');
  expect(names.filter(name => name.endsWith('.csv'))).toHaveLength(4);
  expect(names.filter(name => name.endsWith('.png'))).toHaveLength(4);
  // Raw null callbacks from preparation are retained, never substituted with gaze.
  expect(snapshot.samples.length).toBeGreaterThan(0);
  expect(snapshot.samples.every((sample: { phase: string; predictionAvailable: boolean; viewportX: number | null; viewportY: number | null }) => sample.phase === 'camera' && !sample.predictionAvailable && sample.viewportX === null && sample.viewportY === null)).toBe(true);
  expect(snapshot.exportMetadata.heatmapRenders.every((render: {sampleCount: number}) => render.sampleCount === 0)).toBe(true);
  expect(failures).toEqual([]);
  expect(requests.every(request => new URL(request.url).origin === site.origin)).toBe(true);
  expect(requests.every(request => request.method === 'GET')).toBe(true);
});
