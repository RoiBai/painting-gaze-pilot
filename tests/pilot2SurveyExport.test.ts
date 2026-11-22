// @vitest-environment node
import {it,expect} from 'vitest';
import {zipSync,strFromU8} from 'fflate';
import {pilot2SurveyFixture} from './pilot2SurveyFixture';
import {buildTextExportFiles} from '../src/export';
import {pilotConfig} from '../src/pilotMaterials';
import {PILOT_SURVEY_VERSION,UCI_RECALL_VERSION,recallQuestionsByScene} from '../src/pilotQuestions';
import {recallAnswerExamples} from '../src/pilotRecallRubric';
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
      condition:s.pilot!.plan.find(p=>p.paintingId===row.paintingId)!.condition,questionVersion:UCI_RECALL_VERSION,
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
  const initialRows=recallRows(s).filter(row=>row.paintingId===first).sort((a,b)=>a.cardPresentationOrder!-b.cardPresentationOrder!);
  const omitted=initialRows[0];
  const later=initialRows[1];
  s.cardExposures=s.cardExposures!.filter(e=>e.paintingId!==first||e.cardId!==omitted.cardId);
  s.pilotSurveys![first].submittedCardOrder=s.pilotSurveys![first].submittedCardOrder.filter(id=>id!==omitted.cardId);
  const restored=readSessionArchive(zipSync(buildTextExportFiles(s)),'missing.zip');
  const rows=recallRows(restored).filter(r=>r.paintingId===first);
  expect(rows.find(r=>r.cardId===omitted.cardId)).toMatchObject({cardSlot:null,cardPresentationOrder:null});
  expect(rows.find(r=>r.cardId===later.cardId)).toMatchObject({cardSlot:later.cardSlot,cardPresentationOrder:later.cardPresentationOrder!-1});
});

it('reopens a v1 session with its frozen question IDs, responses and original marking rubric',()=>{
  const legacy=structuredClone(pilotConfig);
  legacy.pilotSurveyVersion=PILOT_SURVEY_VERSION;
  for(const scene of legacy.paintings){
    const key=scene.paintingId.replace('ming-xingle-','') as keyof typeof recallQuestionsByScene;
    scene.recallQuestions=structuredClone(recallQuestionsByScene[key]);
    scene.cards=scene.recallQuestions.map(({cardId},i)=>({...scene.cards[i],id:cardId}));
  }
  const archive=zipSync(buildTextExportFiles(pilot2SurveyFixture('P02',legacy)));
  const restored=readSessionArchive(archive,'legacy.zip');
  expect(recallRows(restored)).toHaveLength(9);
  for(const row of recallRows(restored)){
    expect(row.questionVersion).toBe(PILOT_SURVEY_VERSION);
    expect(recallAnswerExamples(row.questionVersion!,row.questionId).length).toBeGreaterThan(0);
    expect(recallAnswerExamples(UCI_RECALL_VERSION,row.questionId)).toEqual([]);
  }
});
