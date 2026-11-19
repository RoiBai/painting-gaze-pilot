import {describe,expect,it} from 'vitest';
import {sessionFixture} from './dataFixtures';
import {pilotConfig} from '../src/pilotMaterials';
import {recallComplete,submitSurveyPage,surveyForScene,workloadComplete,workloadIds} from '../src/pilotSurvey';

const paintings=pilotConfig.paintings;
const orderedIds=[
  ['cuju-platform','cuju-garden','cuju-court'],
  ['polo-goal','polo-audience','polo-riders'],
  ['archery-target','archery-pavilion','archery-archers'],
];

describe('Pilot 2 immediate scene questionnaires',()=>{
  it('freezes exactly the three requested questions per scene against real card IDs in the fixed recall order',()=>{
    expect(pilotConfig.pilotSurveyVersion).toBe('pilot2-recall-v1');
    paintings.forEach((painting,index)=>{
      const recall=painting.recallQuestions!;
      expect(recall.map(q=>q.cardId)).toEqual(orderedIds[index]);
      expect(new Set(recall.map(q=>q.cardId))).toEqual(new Set(painting.cards.map(card=>card.id)));
      expect(recall.map(q=>q.id)).toEqual(orderedIds[index].map(id=>'recall-'+id));
      expect(recall.every(q=>Object.keys(q).sort().join(',')==='cardId,id,prompt')).toBe(true);
    });
  });

  it('preserves partial workload drafts including zero without treating an unanswered item as zero',()=>{
    const s=sessionFixture(),p=paintings[0];
    const draft=surveyForScene(s,p);
    draft.workload.mental=0;
    expect(workloadComplete(draft)).toBe(false);
    expect(submitSurveyPage(s,p,'workload',200)).toBe(false);
    const restored=surveyForScene(structuredClone(s),p);
    expect(restored.workload).toEqual({mental:0});
    expect(restored.workloadSubmittedMs).toBeNull();
    expect(restored.recallSubmittedMs).toBeNull();
    expect(restored.manualScores).toBeUndefined();
  });

  it('enforces page order, valid 5-point increments and a single write per submission',()=>{
    const s=sessionFixture(),p=paintings[1];
    s.responses=[];
    const draft=surveyForScene(s,p);
    for(const id of workloadIds)draft.workload[id]=0;
    draft.workload.effort=1;
    expect(submitSurveyPage(s,p,'workload',100)).toBe(false);
    draft.workload.effort=0;
    const questions=p.recallQuestions!;
    questions.forEach(({id})=>draft.recall[id]={text:'',unknown:true});
    expect(submitSurveyPage(s,p,'recall',100)).toBe(false);
    expect(submitSurveyPage(s,p,'workload',100)).toBe(true);
    expect(submitSurveyPage(s,p,'workload',101)).toBe(false);
    expect(s.responses.map(r=>r.answer)).toEqual(Array(6).fill('0'));
    expect(submitSurveyPage(s,p,'supplemental',150)).toBe(false);
    const [first,second]=questions;
    draft.recall[first.id]={text:'  ',unknown:false};
    expect(recallComplete(p,draft)).toBe(false);
    draft.recall[first.id]={text:'  一面小旗 ',unknown:true};
    expect(recallComplete(p,draft)).toBe(false);
    draft.recall[first.id].unknown=false;
    expect(submitSurveyPage(s,p,'recall',200)).toBe(true);
    expect(submitSurveyPage(s,p,'recall',201)).toBe(false);
    expect(draft.recallSubmittedMs).toBe(200);
    expect(draft.recall[first.id].text).toBe('  一面小旗 ');
    expect(draft.recall[second.id]).toEqual({text:'',unknown:true});
    expect(draft.manualScores).toBeUndefined();
    draft.supplemental.overall='5';
    expect(submitSurveyPage(s,p,'supplemental',300)).toBe(true);
    expect(submitSurveyPage(s,p,'supplemental',301)).toBe(false);
    expect(s.responses.find(r=>r.questionId==='overall')?.answer).toBe('5');
    expect(s.responses).toHaveLength(11);
  });
});
