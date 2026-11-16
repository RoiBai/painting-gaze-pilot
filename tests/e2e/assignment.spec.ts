import {test,expect} from '@playwright/test';
import {commonQuestions,COMMON_QUESTIONNAIRE_VERSION} from '../../src/commonQuestionnaire';
import {backgroundAnswers,consentAndStart,storedSessions,shortFlowSettings,beginFlowOnly,enterScene} from './helpers';

const archery='ming-xingle-archery',cuju='ming-xingle-cuju';
const cases=[
  {id:'N03',order:'AB',paintings:[archery,cuju]},
  {id:'N04',order:'BA',paintings:[cuju,archery]},
  {id:'N05',order:'AB',paintings:[archery,cuju]},
  {id:'N06',order:'BA',paintings:[cuju,archery]},
] as const;
const allPrompts=[...commonQuestions[archery].pre,...commonQuestions[archery].post].map(q=>q.prompt);

for(const plan of cases){
  test(`${plan.id} retains its viewing order and the same common questionnaire with frozen background`,async({page})=>{
    await page.goto(`/?participant=${plan.id}`);
    const participant=page.getByLabel('匿名参与者编号');
    await expect(participant).toHaveValue(plan.id);
    await expect(participant.locator('option')).toHaveText(['N03','N04','N05','N06']);
    await expect(page.getByRole('table',{name:'观看顺序安排'})).toHaveCount(0);
    for(const prompt of allPrompts)await expect(page.locator('body')).not.toContainText(prompt);
    await consentAndStart(page);
    await expect(page.getByRole('heading',{name:'让摄像头看清你的脸'})).toBeVisible();
    const sessions=await storedSessions(page);
    expect(sessions).toHaveLength(1);
    const session=sessions[0];
    expect(session.participantId).toBe(plan.id);
    expect(session.assignment).toEqual({planVersion:'common-four-v2',participantId:plan.id,order:plan.order,questionVariant:'common',questionVersion:COMMON_QUESTIONNAIRE_VERSION,paintingOrder:[...plan.paintings]});
    expect(session.order).toEqual([...plan.paintings]);
    expect(session.background?.answers).toEqual(backgroundAnswers);
    expect(session.background?.questions).toHaveLength(3);
    expect(session.config.questionnaireVersion).toBe(COMMON_QUESTIONNAIRE_VERSION);
    for(const painting of session.config.paintings){
      expect(painting.pre).toEqual(commonQuestions[painting.paintingId].pre);
      expect(painting.post).toEqual(commonQuestions[painting.paintingId].post);
    }
  });
}

test('background has no invented defaults and switching participant clears the answers',async({page})=>{
  await page.goto('/?participant=N03');
  const start=page.getByRole('button',{name:/同意并进入摄像头准备/});
  const field=page.getByRole('textbox',{name:'你的主要学习或工作领域是什么？',exact:true});
  const education=page.getByLabel('你是否学习过美术、设计或艺术史？',{exact:true});
  const interest=page.getByLabel('你对欣赏绘画有多大兴趣？',{exact:true});
  await expect(field).toHaveValue('');await expect(education).toHaveValue('');await expect(interest).toHaveValue('');
  await page.getByRole('checkbox',{name:'参与同意',exact:true}).check();
  await expect(start).toBeDisabled();
  await field.fill('教育研究');await education.selectOption('none');await expect(start).toBeDisabled();
  await interest.selectOption('1');await expect(start).toBeEnabled();
  await page.getByLabel('匿名参与者编号').selectOption('N04');
  await expect(field).toHaveValue('');await expect(education).toHaveValue('');await expect(interest).toHaveValue('');
  await expect(start).toBeDisabled();expect(await storedSessions(page)).toHaveLength(0);
});

test('retired alpha beta configuration cannot replace the current common questionnaire',async({page})=>{
  await page.goto('/?preview=design');
  await page.getByText('替换材料和完整配置（JSON）',{exact:true}).click();
  const config=await page.evaluate(async()=>{const path='/src/study.ts';const {defaultConfig}=await import(/* @vite-ignore */path);return {...defaultConfig,participantPlan:'crossed-four-v1'}});
  await page.getByRole('textbox',{name:'完整配置 JSON'}).fill(JSON.stringify(config));
  await page.getByRole('button',{name:'校验并载入配置',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('旧甲乙方案已停用；请使用当前共同问卷配置。旧会话请在首页导入结果。');
  await expect(page.getByLabel('参与者安排',{exact:true})).toHaveValue('common-four-v2');
  const table=page.getByRole('table',{name:'观看顺序安排'});
  await expect(table.getByRole('cell',{name:'共同问卷',exact:true})).toHaveCount(4);
  await expect(table.getByRole('cell',{name:/甲题|乙题/})).toHaveCount(0);
  for(const prompt of allPrompts)await expect(page.getByText(prompt,{exact:true})).toBeVisible();
});

test('researcher preview shows one common questionnaire and custom ordering still supports N01',async({page})=>{
  await page.goto('/?preview=design');
  const table=page.getByRole('table',{name:'观看顺序安排'});
  await expect(table).toBeVisible();
  for(const plan of cases){
    const row=table.getByRole('row').filter({hasText:plan.id});
    await expect(row.getByRole('cell')).toHaveText([`${plan.id} ↗`,plan.order==='AB'?'射箭':'蹴鞠',plan.order==='AB'?'蹴鞠':'射箭','共同问卷']);
    await expect(row.getByRole('link')).toHaveAttribute('href',`/?participant=${plan.id}`);
  }
  for(const prompt of allPrompts)await expect(page.getByText(prompt,{exact:true})).toBeVisible();
  await expect(page.getByLabel('场景顺序',{exact:true})).toBeDisabled();
  await page.getByLabel('参与者安排',{exact:true}).selectOption('legacy');
  await expect(page.getByLabel('场景顺序',{exact:true})).toBeEnabled();
  await page.getByLabel('场景顺序',{exact:true}).selectOption('BA');
  await page.getByRole('button',{name:'返回开始页',exact:true}).click();
  await page.getByLabel('匿名参与者编号').selectOption('N01');
  await consentAndStart(page);
  await expect(page.getByRole('heading',{name:'让摄像头看清你的脸'})).toBeVisible();
  const [session]=await storedSessions(page);
  expect(session.participantId).toBe('N01');expect(session.assignment).toBeUndefined();
  expect(session.config.participantPlan).toBeUndefined();expect(session.order).toEqual([cuju,archery]);
  expect(session.config.paintings[0].pre).toEqual(commonQuestions[archery].pre);
  await page.getByRole('button',{name:'退出并保留记录',exact:true}).click();
  await expect(page.getByLabel('本次分组',{exact:true})).toContainText('共同问卷');
});

test('N06 sees cuju first and immediately saves its first common answer before exit',async({page})=>{
  await page.goto('/?participant=N06&preview=design');
  await shortFlowSettings(page);await beginFlowOnly(page);await enterScene(page);
  await expect(page.locator('.stimulus img')).toHaveAttribute('src',/ming-xingle-cuju-v2\.png$/);
  await expect(page.getByRole('heading',{name:commonQuestions[cuju].pre[0].prompt,exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'你的回答',exact:true}).fill('有人在一起活动，我不确定是什么活动。');
  await page.getByRole('button',{name:/^继续/}).click();
  await expect(page.getByRole('heading',{name:commonQuestions[cuju].pre[1].prompt,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'退出并保留记录',exact:true}).click();
  await expect(page.getByLabel('本次分组',{exact:true})).toContainText(/蹴鞠.*射箭.*共同问卷/);
  const [session]=await storedSessions(page);
  expect(session.status).toBe('interrupted');expect(session.samples).toHaveLength(0);
  expect(session.timings[0].paintingId).toBe(cuju);
  expect(session.responses.filter(r=>r.phase==='pre')).toMatchObject([{questionId:commonQuestions[cuju].pre[0].id,answer:'有人在一起活动，我不确定是什么活动。'}]);
  expect(session.assignment?.questionVariant).toBe('common');expect(session.assignment?.order).toBe('BA');
});
