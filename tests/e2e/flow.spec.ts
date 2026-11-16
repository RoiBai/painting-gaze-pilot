import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
import {commonQuestions} from '../../src/commonQuestionnaire';
import {backgroundAnswers,consentAndStart,shortFlowSettings,beginFlowOnly,enterScene,storedSessions,csvRecords} from './helpers';

test('two-scene common questionnaire exports background and distinguishes spontaneous, prompted and card feedback responses',async({page})=>{
  await page.goto('/?preview=design');
  await shortFlowSettings(page);await beginFlowOnly(page);
  const original='这像是"活动"场面。\n我不确定具体规则。';
  for(const paintingId of ['ming-xingle-archery','ming-xingle-cuju']){
    const qs=commonQuestions[paintingId];
    await enterScene(page);
    await expect(page.locator('.experiment-header')).toHaveCount(0);await expect(page.locator('.aoi')).toHaveCount(0);
    await expect(page.getByRole('button',{name:'没见过',exact:true})).toHaveCount(0);
    for(let index=0;index<4;index++){
      await expect(page.getByRole('heading',{name:qs.pre[index].prompt,exact:true})).toBeVisible();
      await expect(page.getByRole('checkbox')).toHaveCount(0);
      await expect(page.getByRole('radio')).toHaveCount(0);
      await expect(page.getByText('你对这个回答有多大信心？',{exact:true})).toHaveCount(0);
      for(const option of qs.pre[4].options!)await expect(page.getByText(option.label,{exact:true})).toHaveCount(0);
      if(index===2){await page.getByRole('button',{name:/^跳过此题/}).click();continue;}
      await page.getByRole('textbox',{name:'你的回答',exact:true}).fill(index===0?original:index===1?'暂时没有':'有人在参与活动，旁边有人观看；这是根据他们的姿态判断的。');
      await page.getByRole('button',{name:/^继续/}).click();
    }
    await expect(page.getByRole('heading',{name:qs.pre[4].prompt,exact:true})).toBeVisible();
    await page.getByRole('checkbox',{name:'没有明显困难',exact:true}).check();
    await page.getByRole('button',{name:/^继续/}).click();
    for(let card=0;card<2;card++)await page.getByRole('button',{name:'读完了，继续 →',exact:true}).click();
    for(const question of qs.post){
      await expect(page.getByRole('heading',{name:question.prompt,exact:true})).toBeVisible();
      await page.getByRole('textbox',{name:'你的回答',exact:true}).fill(question===qs.post[0]?'讲解解释了活动，但没有回答人物为什么聚在这里。':'没有变化。');
      await page.getByRole('button',{name:/^继续/}).click();
    }
  }
  await expect(page.getByRole('heading',{name:'测试已完成，谢谢参与'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'最后，聊聊这次体验'})).toHaveCount(0);
  const [stored]=await storedSessions(page);
  expect(stored.status).toBe('completed');expect(stored.samples).toHaveLength(0);expect(stored.timings).toHaveLength(2);expect(stored.quality).toBe('flow_only');
  expect(stored.responses.filter(r=>r.phase==='cards')).toHaveLength(4);
  expect(stored.responses.filter(r=>r.phase==='pre'||r.phase==='post')).toHaveLength(14);
  expect(stored.responses.filter(r=>r.phase==='interview'||r.phase==='familiarity')).toHaveLength(0);
  expect(stored.background?.answers).toEqual(backgroundAnswers);
  for(const painting of stored.config.paintings){
    const rows=stored.responses.filter(r=>r.paintingId===painting.paintingId&&r.phase==='pre');
    expect(rows.map(r=>r.questionId)).toEqual(commonQuestions[painting.paintingId].pre.map(q=>q.id));
    expect(rows[0].answer).toBe(original);expect(rows[2].skipped).toBe(true);expect(rows[2].answer).toBe('');
    expect(rows[4].selectedOptions).toEqual(['none']);
  }
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:/一键.*ZIP/}).click();
  const download=await pending;const files=unzipSync(new Uint8Array(await readFile((await download.path())!)));
  const names=Object.keys(files);expect(names).toHaveLength(10);
  const file=(name:string)=>strFromU8(files[names.find(path=>path.endsWith(`/${name}`))!]);
  const snapshot=JSON.parse(file('session.json'));
  expect(snapshot.background).toEqual(stored.background);
  const background=csvRecords(file('background.csv'));
  expect(background).toHaveLength(3);expect(background.map(row=>row.questionId)).toEqual(['studyField','artEducation','paintingInterest']);
  expect(background[0].answer).toBe(backgroundAnswers.studyField);expect(background[1].answerCode).toBe(backgroundAnswers.artEducation);expect(background[2].answerCode).toBe('4');
  const answers=csvRecords(file('responses.csv'));
  for(const painting of stored.config.paintings){
    const pre=answers.filter(row=>row.paintingId===painting.paintingId&&row.phase==='pre');
    expect(pre.map(row=>row.analysisRole)).toEqual(['spontaneous','spontaneous','spontaneous','prompted','classification']);
    expect(pre.map(row=>row.questionIndex)).toEqual(['1','2','3','4','5']);
    expect(pre[0].answer).toBe(original);expect(JSON.parse(pre[4].selectedOptionIds)).toEqual(['none']);
    expect(JSON.parse(pre[4].selectedOptionLabels)).toEqual(['没有明显困难']);
    expect(answers.filter(row=>row.paintingId===painting.paintingId&&row.phase==='post').map(row=>row.analysisRole)).toEqual(['card-feedback','card-feedback']);
  }
  await page.screenshot({path:'docs/qa-results.png',fullPage:true});
  await page.reload();await expect(page.getByRole('button',{name:/N03.*completed/})).toBeVisible();
});

test('formal mode blocks unverified scenes and reload preserves interrupted session',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'研究者设置',exact:true}).click();
  await page.getByLabel('运行模式').selectOption('research');await page.getByRole('button',{name:'返回开始页'}).click();
  await consentAndStart(page);await expect(page.getByRole('alert')).toContainText('核查');
  await page.getByRole('button',{name:'研究者设置',exact:true}).click();await page.getByLabel('运行模式').selectOption('preview');await page.getByRole('button',{name:'返回开始页'}).click();await page.getByRole('button',{name:/同意并进入/}).click();await expect(page.getByRole('heading',{name:'让摄像头看清你的脸'})).toBeVisible();
  await page.waitForTimeout(1200);await page.reload();await expect(page.getByRole('button',{name:/N03.*interrupted/})).toBeVisible();await page.screenshot({path:'docs/qa-start.png',fullPage:true});
});
