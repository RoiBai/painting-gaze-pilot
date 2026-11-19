// @vitest-environment node
import {it,expect} from 'vitest';
import {zipSync,strFromU8} from 'fflate';
import {pilot2SurveyFixture} from './pilot2SurveyFixture';
import {buildTextExportFiles} from '../src/export';
import {pilotRatings} from '../src/cardMetrics';
import {readSessionArchive} from '../src/importSession';
import {workloadRows,recallRows} from '../src/pilotSurveyRecords';

it('exports all nine recall questions in fixed within-scene order, joins actual displayed cards and preserves original text',()=>{
  const s=pilot2SurveyFixture();
  const rows=recallRows(s);
  expect(rows).toHaveLength(9);
  expect(workloadRows(s)).toHaveLength(18);
  for(const row of rows){
    const painting=s.config.paintings.find(p=>p.paintingId===row.paintingId)!;
    const q=painting.recallQuestions![row.questionIndex-1];
    const actual=s.cardExposures!.filter(e=>e.trialId===row.trialId&&e.paintingId===row.paintingId).map(e=>e.cardId);
    expect(row).toMatchObject({sessionId:s.sessionId,participantId:'P02',cardId:q.cardId,questionPrompt:q.prompt,questionId:q.id,
      condition:s.pilot!.plan.find(p=>p.paintingId===row.paintingId)!.condition,questionVersion:'pilot2-recall-v1',
      cardPresentationOrder:actual.indexOf(q.cardId)+1,actualCardOrder:JSON.stringify(actual),manualScore:null,sceneRecallScore:null});
    expect(row.submittedUtc).toBe(new Date(s.timeOrigin+row.submittedMs!).toISOString());
  }
  expect(pilotRatings(s).map(row=>row.rawTLX)).toEqual([0,0,0]);
  const files=buildTextExportFiles(s);
  expect(strFromU8(files['pilot_recall.csv'])).toContain('"参与者原文，\n含""引号"""');
  expect(strFromU8(files['pilot_workload.csv'])).toContain('submittedMs,submittedUtc');
  expect(strFromU8(files['pilot_ratings.csv'])).toContain('rawTLX,sceneRecallScore');
  expect(strFromU8(files['session.json'])).not.toContain('假山石');
  const restored=readSessionArchive(zipSync(files),'result.zip');
  expect(recallRows(restored)).toEqual(rows);
});

it('keeps incomplete drafts and manual judgments distinct from zero scores, including across ZIP round trips',()=>{
  const s=pilot2SurveyFixture();
  const [first,second]=s.order;
  const questions=s.config.paintings.find(p=>p.paintingId===first)!.recallQuestions!;
  const survey=s.pilotSurveys![first];
  survey.manualScores={[questions[0].id]:1,[questions[1].id]:0};
  expect(recallRows(s).filter(r=>r.paintingId===first).map(r=>r.sceneRecallScore)).toEqual([null,null,null]);
  survey.manualScores[questions[2].id]=0;
  const partial=s.pilotSurveys![second];
  partial.workload={mental:0,effort:70};partial.workloadSubmittedMs=null;partial.recallSubmittedMs=null;
  const ratings=pilotRatings(s).find(r=>r.paintingId===second)!;
  expect(ratings).toMatchObject({mental:0,effort:70,temporal:null,rawTLX:null,tlxItemsAnswered:2});
  expect(workloadRows(s).filter(r=>r.paintingId===second).map(r=>r.submittedMs)).toEqual(Array(6).fill(null));
  const restored=readSessionArchive(zipSync(buildTextExportFiles(s)),'scored.zip');
  expect(recallRows(restored).filter(r=>r.paintingId===first).map(r=>[r.manualScore,r.sceneRecallScore])).toEqual([[1,1],[0,1],[0,1]]);
  expect(recallRows(restored).filter(r=>r.paintingId===second).every(r=>r.sceneRecallScore===null&&r.manualScore===null)).toBe(true);
  survey.manualScores[questions[1].id]=1;
  expect(()=>readSessionArchive(zipSync(buildTextExportFiles(s)),'invalid.zip')).toThrow('人工评分');
});

it('does not impute a missing exposure or confuse its actual appearance with its planned slot',()=>{
  const s=pilot2SurveyFixture();
  const first=s.order[0];
  const omitted=s.cardExposures!.shift()!;
  s.pilotSurveys![first].submittedCardOrder.shift();
  const restored=readSessionArchive(zipSync(buildTextExportFiles(s)),'missing.zip');
  const rows=recallRows(restored).filter(r=>r.paintingId===first);
  expect(rows.find(r=>r.cardId===omitted.cardId)).toMatchObject({cardSlot:null,cardPresentationOrder:null});
  expect(rows.find(r=>r.cardSlot===2)!.cardPresentationOrder).toBe(1);
});
