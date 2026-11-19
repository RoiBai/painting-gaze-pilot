import {expect,test} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {strFromU8,unzipSync} from 'fflate';
import {pilotConfig} from '../../src/pilotMaterials';
import {readSessionArchive} from '../../src/importSession';
import {consentAndStart,csvRecords,enterScene,fillBackground,storedSessions} from './helpers';

test('P00 selects one cuju gaze scene, finishes at its results and reopens the exported one-scene ZIP',async({page,browser},testInfo)=>{
  test.setTimeout(150_000);
  const id='ming-xingle-cuju';
  await page.goto('/?participant=P00');
  await expect(page.getByRole('radio',{name:'完整三景',exact:true})).toBeChecked();
  await page.getByRole('radio',{name:'只试一景',exact:true}).check();
  const scene=page.getByRole('combobox',{name:/^试用场景/});
  const condition=page.getByRole('combobox',{name:/^讲解方式/});
  await expect(scene.locator('option')).toHaveCount(3);
  await expect(condition.locator('option')).toHaveCount(3);
  await scene.selectOption(id);
  await condition.selectOption('gaze');
  await fillBackground(page);
  await page.getByRole('textbox',{name:'你的主要学习或工作领域是什么？',exact:true}).fill('P00 软件验收示例（自动填写，60 秒流程试用，无摄像头）');
  await page.getByRole('checkbox',{name:'参与同意',exact:true}).check();
  await page.getByRole('button',{name:/同意并进入摄像头准备/}).click();
  await page.getByText('摄像头无法工作？',{exact:true}).click();
  await page.getByRole('button',{name:/仅试用流程/}).click();
  // Follow the real setup and timing so the saved example can be inspected as delivered.
  const target=page.getByRole('button',{name:'校准目标',exact:true});
  for(let i=0;i<9*pilotConfig.calibrationClicks;i++)await target.click();
  await page.getByRole('button',{name:'研究者：标记低质量后继续',exact:true}).click();
  await enterScene(page);
  await expect(page.locator('.stimulus img')).toHaveAttribute('src',/cuju/);
  await expect(page.getByRole('heading',{name:'观看感受',exact:true})).toBeVisible({timeout:75_000});
  const ratings=page.getByRole('combobox');
  await expect(ratings).toHaveCount(6);
  for(const field of await ratings.all())await field.selectOption('0');
  await page.getByRole('button',{name:'提交观看感受'}).click();
  await expect(page.getByRole('checkbox')).toHaveCount(3);
  for(const checkbox of await page.getByRole('checkbox').all())await checkbox.check();
  await page.getByRole('button',{name:'提交画面回忆'}).click();
  await page.getByRole('button',{name:'完成补充反馈'}).click();
  await expect(page.getByRole('heading',{name:'P00 研究者试用记录',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'最后，聊聊这次体验'})).toHaveCount(0);
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:/一键下载 ZIP/}).click()]);
  const path=testInfo.outputPath('P00-单景示例.zip');
  await download.saveAs(path);
  const bytes=await readFile(path);
  const recorded=readSessionArchive(new Uint8Array(bytes),download.suggestedFilename());
  expect(recorded.pilot).toMatchObject({practice:true,plan:[{paintingId:id,condition:'gaze'}]});
  expect(recorded.order).toEqual([id]);
  expect(recorded.status).toBe('completed');
  expect(recorded.quality).toBe('flow_only');
  expect(recorded.samples).toHaveLength(0);
  expect(recorded.timings.map(t=>[t.paintingId,t.status])).toEqual([[id,'completed']]);
  expect(recorded.cardExposures?.map(e=>[e.slot,e.condition])).toEqual([[1,'gaze'],[2,'gaze'],[3,'gaze']]);
  expect(Object.keys(recorded.pilotSurveys!)).toEqual([id]);
  expect(recorded.responses.filter(r=>r.phase==='interview')).toHaveLength(0);
  const files=Object.fromEntries(Object.entries(unzipSync(bytes)).map(([name,data])=>[name.split('/').at(-1)!,data]));
  expect(Object.keys(files).filter(name=>name.endsWith('.png')).sort()).toEqual(['heatmap_'+id+'.png','scanpath_'+id+'.png']);
  for(const [name,count] of Object.entries({'pilot_ratings.csv':1,'card_exposures.csv':3,'card_attention.csv':3,'pilot_workload.csv':6,'pilot_recall.csv':3})){
    const rows=csvRecords(strFromU8(files[name]));
    expect(rows,name).toHaveLength(count);
    expect(rows.every(row=>row.paintingId===id&&row.condition==='gaze'),name).toBe(true);
  }
  const reader=await browser.newContext();
  try{
    const other=await reader.newPage();
    await other.goto(page.url().split('?')[0]+'?preview=design');
    await other.getByLabel('本地导入结果 ZIP / JSON').setInputFiles(path);
    await expect(other.getByRole('heading',{name:'P00 研究者试用记录',exact:true})).toBeVisible();
    await expect(other.getByRole('combobox',{name:/^回看场景/}).locator('option')).toHaveCount(1);
    await expect(other.getByRole('combobox',{name:/^回看场景/})).toHaveValue(id);
  }finally{await reader.close()}
});

test('P01 only uses its assigned schedule even with practice scene parameters in the link',async({page})=>{
  await page.goto('/?participant=P01&mode=single&scene=ming-xingle-archery&condition=random');
  await expect(page.getByRole('radio',{name:'只试一景'})).toHaveCount(0);
  await expect(page.getByRole('combobox',{name:/^试用场景/})).toHaveCount(0);
  await expect(page.getByRole('combobox',{name:/^讲解方式/})).toHaveCount(0);
  await consentAndStart(page);
  await expect.poll(async()=>(await storedSessions(page))[0]?.pilot?.plan).toEqual([
    {paintingId:'ming-xingle-cuju',condition:'sequential'},
    {paintingId:'ming-xingle-polo',condition:'random'},
    {paintingId:'ming-xingle-archery',condition:'gaze'},
  ]);
});
