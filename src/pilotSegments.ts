import {ATTENTION_MAX_GAP_MS} from './cardMetrics';
import type {CardExposure,GazeSample,Geometry,Session,TrialTiming} from './types';

export interface ReviewWindow {
  key:string;
  start:number;
  end:number;
  exposure:CardExposure|null;
  geometry:Geometry|undefined;
}
export type GazeRegion='card'|'painting'|'other'|'offscreen'|'missing';
export interface SegmentPoint {
  sample:GazeSample;
  region:GazeRegion;
  connects:boolean;
}

/** Use actual exposure boundaries. Pauses, including the last pause of an interrupted trial, are removed. */
export function reviewWindows(session:Session,trial:TrialTiming):ReviewWindow[] {
  const end=trial.endedMs??trial.startedMs+trial.wallMs;
  const trialSamples=session.samples.filter(s=>s.trialId===trial.trialId&&s.phase==='free_view'&&!s.paused);
  const cards=(session.cardExposures??[]).filter(c=>c.trialId===trial.trialId);
  const geometries=session.geometries.filter(g=>g.paintingId===trial.paintingId);
  const interruptionEvents=session.events.filter(event=>event.phase==='free_view' && event.paintingId===trial.paintingId
    && event.timeMs>=trial.startedMs && event.timeMs<=end && ['pause','resume'].includes(event.type));
  const boundaries=new Set([trial.startedMs,end]);
  for(const card of cards){boundaries.add(card.shownMs);if(card.hiddenMs!==null)boundaries.add(card.hiddenMs)}
  for(const event of interruptionEvents)boundaries.add(event.timeMs);
  for(const g of geometries)if(g.timeMs>trial.startedMs && g.timeMs<end)boundaries.add(g.timeMs);
  const times=[...boundaries].filter(t=>t>=trial.startedMs && t<=end).sort((a,b)=>a-b);
  const windows:ReviewWindow[]=[];
  for(let i=1;i<times.length;i++){
    const start=times[i-1],stop=times[i];
    if(interruptionEvents.findLast(e=>e.timeMs<=start)?.type==='pause')continue;
    const exposure=cards.find(c=>c.shownMs<=start && (c.hiddenMs===null||start<c.hiddenMs))??null;
    // Closing a card just before logging a pause/end can leave a sub-frame interval with no observations.
    if(!exposure && stop-start<16 && !trialSamples.some(s=>!s.cardExposureId && s.callbackTimeMs>=start && s.callbackTimeMs<=stop))continue;
    const observedVersion=exposure?.geometryVersion??trialSamples.find(s=>s.callbackTimeMs>=start && s.callbackTimeMs<stop)?.geometryVersion;
    const geometry=geometries.find(g=>g.version===observedVersion)??geometries.findLast(g=>g.timeMs<=start);
    windows.push({key:(exposure?.exposureId??'blank')+'@'+start,start,end:stop,exposure,geometry});
  }
  return windows;
}

/** Keep null callbacks in the slice. Only consecutive compatible observations may be joined. */
export function segmentTrace(session:Session,trial:TrialTiming,window:ReviewWindow){
  const {geometry,exposure,start,end}=window;
  const callbacks=session.samples.filter(s=>s.sessionId===session.sessionId&&s.participantId===session.participantId
    &&s.trialId===trial.trialId&&s.paintingId===trial.paintingId&&s.phase==='free_view'&&!s.paused
    &&s.callbackTimeMs>=start&&s.callbackTimeMs<=end&&(s.cardExposureId??null)===(exposure?.exposureId??null));
  const points:SegmentPoint[]=[];
  let lastTarget:'card'|'painting'|null=null;
  let toPainting=0,toCard=0;
  for(const s of callbacks){
    let region:GazeRegion='missing';
    if(geometry && s.geometryVersion===geometry.version && s.predictionAvailable && Number.isFinite(s.viewportX) && Number.isFinite(s.viewportY)){
      const x=s.viewportX!,y=s.viewportY!;
      if(x<0 || y<0 || x>=geometry.viewportWidth || y>=geometry.viewportHeight)region='offscreen';
      else if(exposure && s.onCard)region='card';
      else if(s.insideImage)region='painting';
      else region='other';
    }
    const previous=points.at(-1);
    const dt=previous?s.callbackTimeMs-previous.sample.callbackTimeMs:0;
    const connects=!!previous && previous.region!=='missing' && previous.region!=='offscreen' && region!=='missing' && region!=='offscreen'
      && previous.sample.sampleIndex+1===s.sampleIndex && dt>0 && dt<=ATTENTION_MAX_GAP_MS
      && previous.sample.calibrationVersion===s.calibrationVersion;
    if(!connects)lastTarget=null;
    if(region==='card'||region==='painting'){
      if(lastTarget==='card'&&region==='painting')toPainting++;
      if(lastTarget==='painting'&&region==='card')toCard++;
      lastTarget=region;
    }
    points.push({sample:s,region,connects});
  }
  return {points,toPainting,toCard};
}
