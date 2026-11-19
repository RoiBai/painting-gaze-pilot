import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {segmentFixture} from '../pilotSegmentFixture';
import {csvRecords} from './helpers';

test('imported P archive replays second-card viewport, exports its samples and switches to a blank interval',async({page})=>{
  const s=segmentFixture();
  await page.goto('/?preview=design');
  await page.getByLabel('本地导入结果 ZIP / JSON').setInputFiles({name:'segment-session.json',buffer:Buffer.from(JSON.stringify(s)),mimeType:'application/json'});
  const review=page.getByRole('region',{name:'分时段视线回看'});
  await expect(review).toBeVisible();
  const select=review.getByLabel('出卡或无卡时段');
  const option=select.locator('option').filter({hasText:'第 2 张卡'}).first();
  await expect(select.locator('option')).toHaveCount(6);
  await select.selectOption((await option.getAttribute('value'))!);
  await expect(review).toContainText('卡片 → 画面 1 次 · 画面 → 卡片 1 次');
  const canvas=review.locator('canvas');
  await expect(canvas).toHaveAttribute('width','1000');await expect(canvas).toHaveAttribute('height','800');
  // Coregister the sampled painting and off-image card positions at original viewport CSS pixels.
  const pixel=(x:number,y:number)=>canvas.evaluate((el:HTMLCanvasElement,pos)=>Array.from(el.getContext('2d')!.getImageData(pos.x,pos.y,1,1).data),{x,y});
  const [red,green]=await pixel(510,95);
  expect(red).toBeGreaterThan(green+30);
  const paint=await pixel(160,340);expect(paint[2]).toBeGreaterThan(paint[0]+30);
  const download=page.waitForEvent('download');await review.getByRole('button',{name:'下载本时段样本 CSV'}).click();
  const file=await download;expect(file.suggestedFilename()).toMatch(/card-2_2400ms\.csv$/);
  const rows=csvRecords(await readFile((await file.path())!,'utf8'));
  expect(rows).toHaveLength(9);expect(new Set(rows.map(r=>r.exposureId))).toEqual(new Set(['second-a']));
  expect(rows.find(r=>r.region==='missing')?.viewportX).toBe('');
  const pngEvent=page.waitForEvent('download');await review.getByRole('button',{name:'下载本时段轨迹 PNG'}).click();
  expect((await pngEvent).suggestedFilename()).toMatch(/card-2_2400ms\.png$/);
  await review.getByRole('button',{name:'播放这个时段'}).click();
  await expect.poll(async()=>Number(await review.getByRole('slider').inputValue())).toBeLessThan(700);
  await select.selectOption('blank@1800');
  await expect(review).toContainText('1 个有效视口样本 / 1 次回调');
  await expect(review).not.toContainText('卡片 → 画面 1 次');
  await review.getByLabel('回看场景').selectOption(s.order[1]);
  await expect(review).toContainText('本景没有保存可回看的观看时段');
});
