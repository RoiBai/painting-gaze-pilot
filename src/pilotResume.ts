import type {Phase, Session} from './types';

const KEY='painting-pilot2-current';
export interface PilotCheckpoint {
  sessionId:string;
  participantId:string;
  trialIndex:number;
  phase:Phase;
  surveys:Session['pilotSurveys'];
  responses:Session['responses'];
  timing:Session['timings'][number]|null;
  lastExposure:NonNullable<Session['cardExposures']>[number]|null;
}

export function readCheckpoint():PilotCheckpoint|null {
  try {
    const raw=sessionStorage.getItem(KEY);
    if(!raw)return null;
    const item=JSON.parse(raw);
    return /^P(0\d|[12]\d|3[0-6])$/.test(item.participantId) && typeof item.sessionId==='string'
      && Number.isInteger(item.trialIndex) && item.trialIndex>=0 && item.trialIndex<3 && Array.isArray(item.responses)?item:null;
  }catch{return null}
}
export function clearCheckpoint(sessionId:string){
  if(readCheckpoint()?.sessionId===sessionId)sessionStorage.removeItem(KEY);
}
// A per-tab copy saves small questionnaire drafts synchronously before a reload.
// The much larger camera records stay in IndexedDB.
export function writeCheckpoint(s:Session,trialIndex:number){
  if(!s.config.pilotSurveyVersion)return;
  if(s.status!=='active'){clearCheckpoint(s.sessionId);return}
  const checkpoint:PilotCheckpoint={sessionId:s.sessionId,participantId:s.participantId,trialIndex,phase:s.phase,
    surveys:s.pilotSurveys,responses:s.responses,timing:s.timings.at(-1)??null,lastExposure:s.cardExposures?.at(-1)??null};
  sessionStorage.setItem(KEY,JSON.stringify(checkpoint));
}

export function acquirePilotTab(sessionId:string):Promise<(()=>void)|null>{
  if(!navigator.locks)return Promise.resolve(()=>{});
  return new Promise((resolve,reject)=>{
    void navigator.locks.request('painting-pilot:'+sessionId,{ifAvailable:true},lock=>{
      if(!lock){resolve(null);return}
      return new Promise<void>(release=>resolve(release));
    }).catch(reject);
  });
}
