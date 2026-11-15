import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';

test('participant downloads one complete ZIP locally and sees manual handoff instructions',async({page})=>{
  const writes:string[]=[];
  page.on('request',request=>{if(['POST','PUT','PATCH','DELETE'].includes(request.method()))writes.push(request.url())});
  await page.goto('/');
  await page.evaluate(async()=>{const path='/tests/resultsHarness.tsx';const {mountResults}=await import(/* @vite-ignore */path);mountResults()});
  const panel=page.getByRole('region',{name:'导出并发送研究数据'});
  await expect(panel.getByRole('heading',{name:'测试已完成，谢谢参与'})).toBeVisible();
  await expect(panel).toContainText('不会自动上传');
  const downloadPromise=page.waitForEvent('download');
  await panel.getByRole('button',{name:'一键下载 ZIP（含密度图、轨迹图与所有记录）',exact:true}).click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('preview_N01_fixture-session.zip');
  const path=await download.path();
  expect(path).not.toBeNull();
  const files=unzipSync(await readFile(path!));
  expect(Object.keys(files).map(name=>name.split('/').at(-1)).sort()).toEqual([
    'gaze_samples.csv','heatmap_A.png','heatmap_B.png','phase_events.csv','responses.csv',
    'scanpath_A.png','scanpath_B.png','session.json','validation.csv',
  ].sort());
  const snapshot=JSON.parse(strFromU8(files['preview_N01_fixture-session/session.json']));
  expect(snapshot.samples).toHaveLength(20);
  expect(snapshot.samples[8].predictionAvailable).toBe(false);
  await expect(panel.getByRole('status')).toContainText('再将整个 ZIP 发给研究者');
  expect(writes).toEqual([]);
});

test('ZIP export blocks repeated clicks and can retry after a missing image',async({page})=>{
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve});
  let firstRequest!:()=>void;
  const firstRequestStarted=new Promise<void>(resolve=>{firstRequest=resolve});
  let requests=0,downloads=0;
  page.on('download',()=>{downloads++});
  await page.route('**/tests/export-retry.svg',async route=>{
    requests++;
    if(requests===1){firstRequest();await gate;await route.abort('failed');return;}
    await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#deded2"/></svg>'});
  });
  await page.goto('/');
  await page.evaluate(async()=>{const path='/tests/resultsHarness.tsx';const {mountResults}=await import(/* @vite-ignore */path);mountResults({secondImage:'/tests/export-retry.svg'})});
  const panel=page.getByRole('region',{name:'导出并发送研究数据'});
  const button=panel.getByRole('button');
  await button.evaluate((element:HTMLButtonElement)=>{element.click();element.click()});
  await firstRequestStarted;
  await expect(button).toBeDisabled();
  await expect(page.getByRole('button',{name:'session.json',exact:true})).toBeDisabled();
  expect(requests).toBe(1);
  release();
  await expect(panel.getByRole('alert')).toContainText('导出未完成');
  await expect(panel.getByRole('alert')).toContainText('请重试');
  await expect(button).toBeEnabled();
  expect(downloads).toBe(0);
  const downloadPromise=page.waitForEvent('download');
  await button.click();
  await downloadPromise;
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await expect(panel.getByRole('status')).toContainText('已请求浏览器下载');
  expect(downloads).toBe(1);
});
