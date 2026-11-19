import {expect,test} from '@playwright/test';
import type {StudyConfig} from '../../src/types';
import {beginFlowOnly,enterScene,skipQuestions} from './helpers';

test('P00 can review the second card of each scenario after the interview and then discard its entire practice',async({page})=>{
  test.setTimeout(120_000);
  const downloads:string[]=[];
  page.on('download',d=>downloads.push(d.suggestedFilename()));
  await page.goto('/?participant=P00');
  await expect(page.getByLabel('匿名参与者编号')).toHaveValue('P00');
  await page.evaluate(async()=>{
    const module=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname.endsWith('/src/pilotMaterials.ts'));
    if(!module)throw Error('The development test fixture cannot find the loaded materials module.');
    const {pilotConfig}:{pilotConfig:StudyConfig}=await import(module.name);
    Object.assign(pilotConfig,{durationSeconds:6,calibrationClicks:1});
    Object.assign(pilotConfig.validation,{targetDurationMs:200,settleMs:50});
  });
  await beginFlowOnly(page);
  for(let i=0;i<3;i++){
    await enterScene(page);
    await expect(page.getByRole('heading',{name:'观看感受'})).toBeVisible({timeout:20_000});
    await expect(page.getByRole('region',{name:'分时段视线回看'})).toHaveCount(0);
    for(const field of await page.getByRole('combobox').all())await field.selectOption('0');
    await page.getByRole('button',{name:'提交观看感受'}).click();
    await expect(page.getByRole('checkbox')).toHaveCount(3);
    for(const checkbox of await page.getByRole('checkbox').all())await checkbox.check();
    await page.getByRole('button',{name:'提交画面回忆'}).click();
    await page.getByRole('button',{name:'完成补充反馈'}).click();
  }
  await expect(page.getByRole('heading',{name:'最后，聊聊这次体验'})).toBeVisible();
  await skipQuestions(page,3);
  await expect(page.getByRole('heading',{name:'P00 临时回看'})).toBeVisible();
  const review=page.getByRole('region',{name:'分时段视线回看'});
  for(const id of ['ming-xingle-cuju','ming-xingle-polo','ming-xingle-archery']){
    await review.getByLabel('回看场景').selectOption(id);
    const times=review.getByLabel('出卡或无卡时段');
    const second=times.locator('option').filter({hasText:'第 2 张卡'});
    await expect(second).toHaveCount(1);
    await times.selectOption((await second.getAttribute('value'))!);
    await expect(review.locator('canvas')).toHaveAttribute('aria-label',/第 2 张卡/);
    await expect(review).toContainText('本时段没有可显示的视线样本');
  }
  await expect(page.getByRole('button',{name:/下载|ZIP/})).toHaveCount(0);
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.getByRole('button',{name:'结束并清除试用'}).click();
  await expect(page.getByRole('heading',{name:'本次 P00 试用已清除'})).toBeVisible();
  await expect(page.getByRole('region',{name:'分时段视线回看'})).toHaveCount(0);
  expect(await page.evaluate(async()=>(await indexedDB.databases()).map(db=>db.name))).not.toContain('painting-pilot-study-v1');
  expect(await page.evaluate(()=>[JSON.stringify(localStorage),JSON.stringify(sessionStorage)].join(''))).not.toContain('P00');
  await page.reload();
  await expect(page.getByLabel('匿名参与者编号')).toHaveValue('P00');
  expect(downloads).toEqual([]);
});
