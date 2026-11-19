import {test,expect} from '@playwright/test';
import {strToU8,zipSync} from 'fflate';
import {freezeBackground} from '../../src/background';
import {TLX_DIMENSIONS} from '../../src/cardMetrics';
import {pilotConfig} from '../../src/pilotMaterials';
import {buildPilotPlan,PILOT_VERSION,SELECTION_RULES} from '../../src/pilotProtocol';
import type {Condition} from '../../src/types';
import {sessionFixture} from '../dataFixtures';

const firstScores={sequential:[1,0],random:[3,50],gaze:[7,100]};
const secondScores={sequential:[7,10],random:[1,60],gaze:[5,90]};

function archive(id:'P00'|'P01'|'P02',sessionId:string) {
  const s=sessionFixture(sessionId);
  const plan=buildPilotPlan(id);
  s.participantId=id;
  s.config=structuredClone(pilotConfig);
  s.order=plan.map(trial=>trial.paintingId);
  s.pilot={version:PILOT_VERSION,practice:id==='P00',plan,seed:42,selectionRules:{...SELECTION_RULES}};
  s.cardExposures=[];
  s.background=freezeBackground({studyField:'测试',artEducation:'none',paintingInterest:3});
  const scores:Record<Condition,number[]>=id==='P01'?firstScores:secondScores;
  plan.forEach(({paintingId,condition},index)=>{
    const startedMs=index*120000;
    s.timings.push({trialId:id+'-'+index,paintingId,startedMs,endedMs:startedMs+60000,wallMs:60000,activeMs:60000,status:'completed'});
    const [overall,workload]=scores[condition];
    for(const questionId of ['overall',...TLX_DIMENSIONS]){
      if(id==='P02'&&condition==='gaze'&&questionId==='effort')continue;
      s.responses.push({sessionId,participantId:id,paintingId,phase:'pre',questionId,
        answer:String(questionId==='overall'?overall:workload),confidence:null,unknown:false,skipped:false,timeMs:startedMs+65000,durationMs:5000});
    }
  });
  return {name:id+'-'+sessionId+'.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({'results/session.json':strToU8(JSON.stringify(s))}))};
}

test('compares multiple local P archives by condition, with paired complete ratings and duplicate handling',async({page})=>{
  await page.goto('/?preview=design');
  await page.getByText('比较多位参与者的评分',{exact:true}).click();
  const input=page.getByLabel('选择参与者 ZIP（可多选）');
  const a=archive('P01','first'),b=archive('P02','second');
  const practice={...archive('P00','researcher-rehearsal'),name:'renamed-test.zip'};
  await input.setInputFiles([b,practice,a,{...a,name:'same-session-another-filename.zip'}]);
  await expect(page.getByLabel('未纳入的会话')).toContainText('renamed-test.zip：已略过 P00 研究者试用。');
  const personal=page.getByRole('table',{name:'每位参与者的三个条件评分'});
  const means=page.getByRole('table',{name:'三种方式的配对描述均值'});
  await expect(personal.locator('thead th')).toHaveText(['参与者','指标','顺序讲解','随机讲解','眼动讲解']);
  await expect(personal.locator('tbody tr')).toHaveCount(4);
  await expect(personal.locator('tbody tr').nth(0).locator('th,td')).toHaveText(['P01','总体体验（1–7）','1','3','7']);
  await expect(personal.locator('tbody tr').nth(1).locator('th,td')).toHaveText(['P01','Raw TLX（0–100）','0','50','100']);
  await expect(personal.locator('tbody tr').nth(2).locator('th,td')).toHaveText(['P02','总体体验（1–7）','7','1','5']);
  await expect(personal.locator('tbody tr').nth(3).locator('th,td')).toHaveText(['P02','Raw TLX（0–100）','10','60','—']);
  await expect(means.locator('tbody tr').nth(0).locator('td')).toHaveText(['2','4.0','2.0','6.0']);
  await expect(means.locator('tbody tr').nth(1).locator('td')).toHaveText(['1','0.0','50.0','100.0']);
  const otherSession=archive('P01','duplicate-participant');
  await input.setInputFiles([otherSession,a,b]);
  await expect(page.getByLabel('未纳入的会话')).toContainText('P01 有两次不同的会话');
  await expect(personal.locator('tbody tr')).toHaveCount(2);
  await expect(personal.locator('tbody th')).toHaveText(['P02','P02']);
  await expect(means.locator('tbody tr').nth(0).locator('td')).toHaveText(['1','7.0','1.0','5.0']);
  await expect(means.locator('tbody tr').nth(1).locator('td')).toHaveText(['0','—','—','—']);
  await input.setInputFiles(practice);
  await expect(personal).toHaveCount(0);
  await expect(means).toHaveCount(0);
  await expect(page.getByLabel('未纳入的会话')).toContainText('已略过 P00');
});
