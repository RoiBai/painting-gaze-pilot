import type {Painting, PilotSceneSurvey, Session, WorkloadId} from './types';
import {PILOT_SURVEY_VERSION, workloadLabels} from './pilotQuestions';

export const workloadIds = Object.keys(workloadLabels) as WorkloadId[];

export function surveyForScene(session:Session, painting:Painting):PilotSceneSurvey {
  const surveys = session.pilotSurveys ??= {};
  const previous = surveys[painting.paintingId];
  if(previous)return previous;
  const trial = session.timings.findLast(t=>t.paintingId===painting.paintingId && t.status==='completed');
  const exposures = (session.cardExposures??[])
    .filter(e=>e.paintingId===painting.paintingId && e.trialId===trial?.trialId)
    .sort((a,b)=>a.shownMs-b.shownMs);
  const survey:PilotSceneSurvey = {
    version:PILOT_SURVEY_VERSION,trialId:trial?.trialId??null,
    submittedCardOrder:[...new Set(exposures.map(e=>e.cardId))],
    workload:{},workloadSubmittedMs:null,recall:{},recallSubmittedMs:null,
    supplemental:{},supplementalSubmittedMs:null,
  };
  surveys[painting.paintingId]=survey;
  return survey;
}

export function workloadComplete(survey:PilotSceneSurvey):boolean{
  return workloadIds.every(id=>{
    const value=survey.workload[id];
    return typeof value==='number' && Number.isInteger(value) && value>=0 && value<=100 && value%5===0;
  });
}

export function recallComplete(painting:Painting,survey:PilotSceneSurvey):boolean{
  return painting.recallQuestions?.length===3 && painting.recallQuestions.every(q=>{
    const answer=survey.recall[q.id];
    return answer && (answer.unknown ? answer.text==='' : answer.text.trim().length>0);
  });
}

export function submitSurveyPage(session:Session,painting:Painting,page:'workload'|'recall'|'supplemental',timeMs:number):boolean{
  const survey=surveyForScene(session,painting);
  function record(questionId:string,answer:string,skipped=false){
    session.responses.push({sessionId:session.sessionId,participantId:session.participantId,paintingId:painting.paintingId,
      phase:'pre',questionId,answer,skipped,unknown:false,confidence:null,timeMs,durationMs:null});
  }
  if(page==='workload'){
    if(survey.workloadSubmittedMs!==null || !workloadComplete(survey))return false;
    for(const id of workloadIds)record(id,String(survey.workload[id]));
    survey.workloadSubmittedMs=timeMs;
  }else if(page==='recall'){
    if(survey.workloadSubmittedMs===null || survey.recallSubmittedMs!==null || !recallComplete(painting,survey))return false;
    survey.recallSubmittedMs=timeMs;
  }else{
    if(survey.recallSubmittedMs===null || survey.supplementalSubmittedMs!==null)return false;
    for(const question of supplementalQuestions(painting)){
      const answer=survey.supplemental[question.id]??'';
      record(question.id,answer,!answer.trim());
    }
    survey.supplementalSubmittedMs=timeMs;
  }
  return true;
}

export function supplementalQuestions(painting:Painting){
  return painting.pre.filter(q=>!Object.hasOwn(workloadLabels,q.id));
}
