import {expect,test} from '@playwright/test';
import type {StudyConfig} from '../../src/types';
import {readFile} from 'node:fs/promises';
import {readSessionArchive} from '../../src/importSession';
import {beginFlowOnly,enterScene,skipQuestions} from './helpers';
import {pilotConfig} from '../../src/pilotMaterials';
import {sceneDurationSeconds} from '../../src/pilotProtocol';

test('P00 retains a complete rehearsal, downloads its ZIP, inspects data rows and reopens from the practice archive',async({page},testInfo)=>{
  test.setTimeout(120_000);
  await page.goto('/?participant=P00');
  await expect(page.getByLabel('匿名参与者编号')).toHaveValue('P00');
  await page.evaluate(async()=>{
    const module=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname.endsWith('/src/pilotMaterials.ts'));
    if(!module)throw Error('The development test fixture cannot find the loaded materials module.');
    const {pilotConfig}:{pilotConfig:StudyConfig}=await import(module.name);
    Object.assign(pilotConfig,{durationSeconds:6,calibrationClicks:1});
    Object.assign(pilotConfig.validation,{targetDurationMs:200,settleMs:50});
  });
  await page.clock.install();
  await expect(page.getByText(/蹴鞠（顺序讲解） → 马球（随机讲解） → 射箭（眼动讲解）/)).toBeVisible();
  await beginFlowOnly(page);
  for(let i=0;i<3;i++){
    await enterScene(page);
    await expect(page.locator('.stimulus img')).toBeVisible();
    await page.clock.runFor(sceneDurationSeconds(pilotConfig.paintings[i],6)*1000+300);
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
  await expect(page.getByRole('heading',{name:'P00 研究者试用记录'})).toBeVisible();
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
  await page.getByText('查看本次试用的数据行',{exact:true}).click();
  const rows=page.getByRole('table',{name:'试用数据行'}).locator('tbody tr');
  const totalCards=pilotConfig.paintings.reduce((sum,s)=>sum+s.cards.length,0);
  await expect(rows).toHaveCount(Math.min(9,totalCards));
  await page.getByLabel('预览的数据表').selectOption('pilot_recall.csv');
  await expect(rows).toHaveCount(9);
  await expect(rows.first()).toContainText('true');
  const downloading=page.waitForEvent('download');
  await page.getByRole('button',{name:/一键下载 ZIP/}).click();
  const download=await downloading;
  expect(download.suggestedFilename()).toMatch(/^rehearsal_P00_/);
  const path=testInfo.outputPath('P00-demo-flow-only.zip');
  await download.saveAs(path);
  const session=readSessionArchive(new Uint8Array(await readFile(path)),download.suggestedFilename());
  expect(session.pilot?.practice).toBe(true);
  expect(session.status).toBe('completed');expect(session.quality).toBe('flow_only');
  expect(session.cardExposures).toHaveLength(totalCards);
  expect(Object.keys(session.pilotSurveys!)).toHaveLength(3);
  await page.reload();
  const practice=page.getByRole('region',{name:'本机 P00 研究者试用'});
  await practice.getByRole('button',{name:/P00.*completed/}).click();
  await expect(page.getByRole('heading',{name:'P00 研究者试用记录'})).toBeVisible();
});
