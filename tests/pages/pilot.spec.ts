import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';
import type { Session } from '../../src/types';
import { backgroundAnswers, consentAndStart, csvRecords } from '../e2e/helpers';

function observeNetwork(page: Page) {
  const requests: { method: string; url: URL }[] = [];
  const failures: string[] = [];
  page.on('request', request => requests.push({method: request.method(), url: new URL(request.url())}));
  page.on('response', response => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  return {requests, failures};
}

const siteUrl = () => new URL(String(test.info().project.use.baseURL));
const scenes = ['ming-xingle-cuju', 'ming-xingle-polo', 'ming-xingle-archery'];

test('P researcher schedule and all three full-width paintings load from the Pages subpath', async ({page}) => {
  const site = siteUrl();
  const {requests, failures} = observeNetwork(page);
  await page.goto('./?preview=design');
  const table = page.getByRole('table', {name: '三条件排程'});
  await expect(table.locator('tbody tr')).toHaveCount(6);
  for (let number = 1; number <= 6; number++) {
    const id = 'P' + String(number).padStart(2, '0');
    const row = table.locator('tbody tr').nth(number - 1);
    await expect(row.getByRole('link', {name: id, exact: true})).toHaveAttribute('href', site.pathname + '?participant=' + id);
    for (const name of ['蹴鞠', '马球', '射箭', '顺序讲解', '随机讲解', '眼动讲解']) await expect(row).toContainText(name);
  }
  await page.getByRole('button', {name: /查看全部 36 人/}).click();
  await expect(table.locator('tbody tr')).toHaveCount(36);
  await expect(table.getByRole('link', {name: 'P36', exact: true})).toHaveAttribute('href', site.pathname + '?participant=P36');
  await page.getByText('查看三个场景和信息卡', {exact: true}).click();
  const images = page.locator('img.material-preview');
  await expect(images).toHaveCount(3);
  for (let i = 0; i < scenes.length; i++) {
    const image = images.nth(i);
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(el => [(el as HTMLImageElement).naturalWidth, (el as HTMLImageElement).naturalHeight]), {timeout: 45_000}).toEqual([[5900, 6950, 6888][i], 1966]);
    await expect(image).toHaveAttribute('src', site.pathname + 'materials/' + scenes[i] + '-pilot-v1.jpg');
  }
  expect(failures).toEqual([]);
  expect(requests.every(request => request.method === 'GET' && request.url.origin === site.origin)).toBe(true);
});

test('P00 exercise can be cleared without a result download or a saved study record', async ({page}) => {
  const {requests} = observeNetwork(page);
  const downloads: string[] = [];
  page.on('download', download => downloads.push(download.suggestedFilename()));
  await page.goto('./?participant=P00');
  await expect(page.getByLabel('匿名参与者编号')).toHaveValue('P00');
  await consentAndStart(page);
  await page.getByText('摄像头无法工作？', {exact: true}).click();
  await page.getByRole('button', {name: /仅试用流程/}).click();
  await page.getByRole('button', {name: '校准目标'}).click();
  await page.getByRole('button', {name: '清除并退出试用'}).click();
  await expect(page.getByRole('heading', {name: '本次 P00 试用已清除'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', {name: '你的主要学习或工作领域是什么？'})).toHaveValue('');
  expect((await page.evaluate(() => indexedDB.databases())).map(db => db.name)).not.toContain('painting-pilot-study-v1');
  expect(downloads).toEqual([]);
  expect(requests.every(request => request.method === 'GET' && request.url.origin === siteUrl().origin)).toBe(true);
});

test('interrupted P01 downloads all three scenes and pilot CSVs in one ZIP and reopens it locally', async ({page, browser}) => {
  test.setTimeout(150_000);
  const site = siteUrl();
  const participantNetwork = observeNetwork(page);
  await page.goto('./?participant=P01');
  await consentAndStart(page);
  await page.getByRole('button', {name: '启用 / 重试摄像头'}).click();
  // The production tracker sees the synthetic camera's non-face video and emits nulls.
  await expect(page.locator('.status')).toContainText('未获得有效预测', {timeout: 70_000});
  await page.getByRole('button', {name: '退出并保留记录'}).click();
  await expect(page.getByRole('region', {name: '导出并发送研究数据'})).toBeVisible();
  await expect(page.getByRole('region', {name: '研究者结果页'})).toHaveCount(0);
  const downloading = page.waitForEvent('download', {timeout: 50_000});
  await page.getByRole('button', {name: /一键.*ZIP/}).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/_P01_.*\.zip$/);
  const bytes = await readFile((await download.path())!);
  const files = unzipSync(bytes);
  const basenames = Object.fromEntries(Object.entries(files).map(([path, content]) => [path.split('/').pop()!, content]));
  const session: Session = JSON.parse(strFromU8(basenames['session.json']));
  expect(session).toMatchObject({participantId: 'P01', status: 'interrupted', background: {answers: backgroundAnswers}, pilot: {practice: false}});
  expect(session.order).toEqual(scenes);
  expect(session.pilot!.plan.map(trial => trial.condition)).toEqual(['sequential', 'random', 'gaze']);
  expect(session.samples.length).toBeGreaterThan(0);
  expect(session.samples.every(sample => !sample.predictionAvailable && sample.viewportX === null && sample.viewportY === null)).toBe(true);
  const csv = ['gaze_samples', 'phase_events', 'validation', 'responses', 'background', 'card_exposures', 'card_attention', 'pilot_ratings', 'pilot_workload', 'pilot_recall'];
  for (const name of csv) expect(basenames[name + '.csv'], name).toBeDefined();
  expect(csvRecords(strFromU8(basenames['pilot_ratings.csv'])).map(row => row.condition)).toEqual(['sequential', 'random', 'gaze']);
  expect(strFromU8(basenames['gaze_samples.csv']).split('\n')[0]).toContain('cardExposureId');
  for (const id of scenes) {
    for (const name of ['heatmap_', 'scanpath_']) {
      expect(Array.from(basenames[name + id + '.png'].subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    }
  }
  // Opening the downloaded ZIP in an empty browser context simulates a researcher on another device.
  const review = await browser.newContext();
  try {
    const reader = await review.newPage();
    const researchNetwork = observeNetwork(reader);
    await reader.goto(site.toString());
    await reader.getByLabel('本地导入结果 ZIP / JSON').setInputFiles({name: download.suggestedFilename(), mimeType: 'application/zip', buffer: bytes});
    const results = reader.getByRole('region', {name: '研究者结果页'});
    await expect(results).toContainText('P01');
    await expect(results.getByRole('region', {name: '三种讲解方式比较'}).locator('tbody tr')).toHaveCount(3);
    await results.getByRole('button', {name: '返回会话列表'}).click();
    await expect(reader.getByText('尚无已保存会话。', {exact: true})).toBeVisible();
    for (const network of [participantNetwork, researchNetwork]) {
      expect(network.failures).toEqual([]);
      expect(network.requests.every(request => request.method === 'GET' && request.url.origin === site.origin)).toBe(true);
    }
  } finally {
    await review.close();
  }
});


test('researcher links expose Pilot 2 review and an independent conditions-blind marking page',async({page})=>{
  await page.goto('./?preview=design');
  await expect(page.getByText(/3 秒看画、17 秒单卡/)).toBeVisible();
  await page.getByRole('link',{name:'打开回忆题盲评'}).click();
  await expect(page.getByRole('heading',{name:'画面回忆盲评'})).toBeVisible();
  await expect(page.getByRole('table',{name:'三条件排程'})).toHaveCount(0);
  await expect(page.getByLabel('选择本地 ZIP 或 session.json')).toBeVisible();
});
