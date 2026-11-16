import {test,expect,type Page} from '@playwright/test';
import {questionVariants,QUESTION_VARIANT_VERSION} from '../../src/questionVariants';
import type {Session} from '../../src/types';

const archery='ming-xingle-archery',cuju='ming-xingle-cuju';
const cases=[
  {id:'N03',order:'AB',variant:'alpha',paintings:[archery,cuju]},
  {id:'N04',order:'BA',variant:'alpha',paintings:[cuju,archery]},
  {id:'N05',order:'AB',variant:'beta',paintings:[archery,cuju]},
  {id:'N06',order:'BA',variant:'beta',paintings:[cuju,archery]},
] as const;
const allPrompts=[...new Set(Object.values(questionVariants).flatMap(form=>Object.values(form).flatMap(scene=>[...scene.pre,...scene.post].map(q=>q.prompt))))];

async function storedSessions(page:Page):Promise<Session[]>{
  return page.evaluate(async()=>{const path='/src/storage.ts';const {listSessions}=await import(/* @vite-ignore */path);return listSessions()});
}

for(const plan of cases){
  test(`${plan.id} link enrolls the saved ${plan.order} / ${plan.variant} assignment without showing questions beforehand`,async({page})=>{
    await page.goto(`/?participant=${plan.id}`);
    const participant=page.getByLabel('匿名参与者编号');
    await expect(participant).toHaveValue(plan.id);
    await expect(participant.locator('option')).toHaveText(['N03','N04','N05','N06']);
    await expect(page.getByRole('table',{name:'四人交叉分配'})).toHaveCount(0);
    for(const prompt of allPrompts)await expect(page.locator('body')).not.toContainText(prompt);
    await page.getByRole('checkbox').check();
    await page.getByRole('button',{name:/同意并进入摄像头准备/}).click();
    await expect(page.getByRole('heading',{name:'让摄像头看清你的脸'})).toBeVisible();
    const sessions=await storedSessions(page);
    expect(sessions).toHaveLength(1);
    const session=sessions[0];
    expect(session.participantId).toBe(plan.id);
    expect(session.assignment).toEqual({planVersion:'crossed-four-v1',participantId:plan.id,order:plan.order,questionVariant:plan.variant,questionVersion:QUESTION_VARIANT_VERSION,paintingOrder:[...plan.paintings]});
    expect(session.order).toEqual([...plan.paintings]);
    expect(session.config.order).toBe(plan.order);
    for(const painting of session.config.paintings){
      expect(painting.pre).toEqual(questionVariants[plan.variant][painting.paintingId].pre);
      expect(painting.post).toEqual(questionVariants[plan.variant][painting.paintingId].post);
    }
  });
}

test('researcher preview shows the crossed plan and both full forms, while legacy mode still accepts N01',async({page})=>{
  await page.goto('/?preview=design');
  await expect(page.getByRole('heading',{name:'研究者设置',exact:true})).toBeVisible();
  const table=page.getByRole('table',{name:'四人交叉分配'});
  await expect(table).toBeVisible();
  for(const plan of cases){
    const row=table.getByRole('row').filter({hasText:plan.id});
    await expect(row.getByRole('cell')).toHaveText([`${plan.id} ↗`,plan.order==='AB'?'射箭':'蹴鞠',plan.order==='AB'?'蹴鞠':'射箭',plan.variant==='alpha'?'甲题':'乙题']);
    await expect(row.getByRole('link')).toHaveAttribute('href',`/?participant=${plan.id}`);
  }
  for(const prompt of allPrompts)await expect(page.getByText(prompt,{exact:true})).toBeVisible();
  await expect(page.getByLabel('场景顺序',{exact:true})).toBeDisabled();
  await page.getByLabel('参与者安排',{exact:true}).selectOption('legacy');
  await expect(table).toHaveCount(0);
  await expect(page.getByLabel('场景顺序',{exact:true})).toBeEnabled();
  await page.getByLabel('场景顺序',{exact:true}).selectOption('BA');
  await page.getByRole('button',{name:'返回开始页',exact:true}).click();
  await page.getByLabel('匿名参与者编号').selectOption('N01');
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:/同意并进入摄像头准备/}).click();
  await expect(page.getByRole('heading',{name:'让摄像头看清你的脸'})).toBeVisible();
  const [session]=await storedSessions(page);
  expect(session.participantId).toBe('N01');expect(session.assignment).toBeUndefined();
  expect(session.config.participantPlan).toBeUndefined();expect(session.order).toEqual([cuju,archery]);
  await page.getByRole('button',{name:'退出并保留记录',exact:true}).click();
  await expect(page.getByLabel('本次分组',{exact:true})).toContainText('未记录分组');
});

test('N06 actually sees cuju first and answers the beta form, with the same assignment retained on exit',async({page})=>{
  await page.goto('/?participant=N06&preview=design');
  await page.getByText('替换材料和完整配置（JSON）',{exact:true}).click();
  const config=await page.evaluate(async()=>{const path='/src/study.ts';const {defaultConfig}=await import(/* @vite-ignore */path);return {...defaultConfig,durationSeconds:1,calibrationClicks:1,validation:{...defaultConfig.validation,targetDurationMs:150,settleMs:50}}});
  await page.getByRole('textbox',{name:'完整配置 JSON'}).fill(JSON.stringify(config));
  await page.getByRole('button',{name:'校验并载入配置',exact:true}).click();
  await page.getByRole('button',{name:'返回开始页',exact:true}).click();
  await expect(page.getByLabel('匿名参与者编号')).toHaveValue('N06');
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:/同意并进入/}).click();
  await page.getByText('摄像头无法工作？',{exact:true}).click();
  await page.getByRole('button',{name:/仅试用流程/}).click();
  for(let i=0;i<9;i++)await page.getByRole('button',{name:'校准目标'}).click();
  await page.getByRole('button',{name:'研究者：标记低质量后继续',exact:true}).click();
  await page.getByRole('button',{name:'研究者：标记低质量后继续',exact:true}).click();
  await expect(page.locator('.stimulus img')).toBeVisible();
  await expect(page.locator('.stimulus img')).toHaveAttribute('src',/ming-xingle-cuju-v2\.png$/);
  await page.getByRole('button',{name:'没见过',exact:true}).click();
  await expect(page.getByRole('heading',{name:questionVariants.beta[cuju].pre[0].prompt,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'跳过此题',exact:true}).click();
  await expect(page.getByRole('heading',{name:questionVariants.beta[cuju].pre[1].prompt,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'退出并保留记录',exact:true}).click();
  await expect(page.getByLabel('本次分组',{exact:true})).toContainText(/蹴鞠.*射箭.*乙（beta）/);
  const [session]=await storedSessions(page);
  expect(session.status).toBe('interrupted');expect(session.quality).toBe('flow_only');
  expect(session.timings[0].paintingId).toBe(cuju);expect(session.samples).toHaveLength(0);
  expect(session.assignment?.questionVariant).toBe('beta');expect(session.assignment?.order).toBe('BA');
  expect(session.config.paintings.find(p=>p.paintingId===cuju)?.pre).toEqual(questionVariants.beta[cuju].pre);
});
