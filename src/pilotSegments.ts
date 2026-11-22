import {ATTENTION_MAX_GAP_MS} from './cardMetrics';
import {paperTime} from './cardPresentation';
import {arrowFlightStart} from './archeryPhase';
import type {AOI,CardExposure,GazeSample,Geometry,Painting,Session,TrialTiming} from './types';

const arrowId='archery-figma-1-6';
export function hasArcheryPhases(painting:Painting){
  return painting.paintingId==='ming-xingle-archery'&&painting.materialVersion==='ming-uci-collage-v7';
}

export const archeryPhaseLabels={
  archer_card:'弓手讲解', arrow_card:'整张羽箭卡', arrow_explanation:'羽箭讲解（含出卡与退板）',
  arrow_flight:'羽箭飞行', arrow_landed:'羽箭已落靶', target_card:'箭靶讲解', other_card:'其他讲解卡',
  no_card:'无卡看画', post_impact_no_card:'落靶后回到原画',
} as const;
export type ArcheryPhase=keyof typeof archeryPhaseLabels;


export interface ReviewWindow {
  key:string;
  start:number;
  end:number;
  exposure:CardExposure|null;
  geometry:Geometry|undefined;
  archeryPhase?:ArcheryPhase;
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
  const painting=session.config.paintings.find(p=>p.paintingId===trial.paintingId);
  const detailed=painting&&hasArcheryPhases(painting);
  const windows:ReviewWindow[]=[];
  for(let i=1;i<times.length;i++){
    const start=times[i-1],stop=times[i];
    if(interruptionEvents.findLast(e=>e.timeMs<=start)?.type==='pause')continue;
    const exposure=cards.find(c=>c.shownMs<=start && (c.hiddenMs===null||start<c.hiddenMs))??null;
    // Closing a card just before logging a pause/end can leave a sub-frame interval with no observations.
    if(!exposure && stop-start<16 && !trialSamples.some(s=>!s.cardExposureId && s.callbackTimeMs>=start && s.callbackTimeMs<=stop))continue;
    const observedVersion=exposure?.geometryVersion??trialSamples.find(s=>s.callbackTimeMs>=start && s.callbackTimeMs<stop)?.geometryVersion;
    const geometry=geometries.find(g=>g.version===observedVersion)??geometries.findLast(g=>g.timeMs<=start);
    const window:ReviewWindow={key:(exposure?.exposureId??'blank')+'@'+start,start,end:stop,exposure,geometry};
    if(detailed){
      if(exposure){
        if(exposure.cardId===arrowId)window.archeryPhase=exposure.paper?'arrow_card':undefined;
        else if(exposure.cardId==='archery-figma-1-2')window.archeryPhase='archer_card';
        else if(exposure.cardId==='archery-figma-0-6')window.archeryPhase='target_card';
        else window.archeryPhase='other_card';
      }else{
        const prior=cards.findLast(c=>c.hiddenMs!==null&&c.hiddenMs<=start);
        const sinceImpact=prior?.cardId===arrowId&&prior.paper?.arrowLandedAtMs!=null
          && !interruptionEvents.some(e=>e.timeMs>=prior.hiddenMs!&&e.timeMs<=start);
        window.archeryPhase=sinceImpact?'post_impact_no_card':'no_card';
      }
    }
    windows.push(window);
  }
  return windows;
}

/** Reconstruct the same quantized presentation clock as the card; landing is a recorded draw. */
function phaseAt(window:ReviewWindow,time:number):ArcheryPhase|undefined{
  if(window.archeryPhase!=='arrow_card')return window.archeryPhase;
  const exposure=window.exposure!,p=exposure.paper!;
  if(p.arrowLandedAtMs!=null&&time>=p.arrowLandedAtMs)return 'arrow_landed';
  const elapsed=paperTime(p.offsetMs+time-exposure.shownMs,p.durationMs,p.layout);
  return !p.reducedMotion&&elapsed>=arrowFlightStart*p.durationMs?'arrow_flight':'arrow_explanation';
}

export function arrowPhaseWindows(window:ReviewWindow):ReviewWindow[]{
  if(window.archeryPhase!=='arrow_card')return [];
  const p=window.exposure!.paper!;
  const times=[window.start,window.end];
  if(!p.reducedMotion&&phaseAt(window,window.start)==='arrow_explanation'&&phaseAt(window,window.end)!=='arrow_explanation'){
    // Locate the frame boundary by evaluating the renderer clock, also for resumed and shortened exposures.
    let lo=window.start,hi=window.end;
    for(let i=0;i<52;i++){
      const mid=(lo+hi)/2;
      if(phaseAt(window,mid)==='arrow_explanation')lo=mid;else hi=mid;
    }
    times.push(hi);
  }
  const landed=p.arrowLandedAtMs;
  if(landed!=null&&landed>window.start&&landed<window.end)times.push(landed);
  const bounds=[...new Set(times)].sort((a,b)=>a-b);
  return bounds.slice(0,-1).map((start,i)=>{
    const archeryPhase=phaseAt(window,start)!;
    return {...window,start,end:bounds[i+1],archeryPhase,key:window.key+'-'+archeryPhase};
  });
}

function gazeInOriginalTarget(sample:GazeSample,geometry:Geometry|undefined,target:AOI|undefined):boolean|null{
  const {viewportX:x,viewportY:y,imageNormX:u,imageNormY:v}=sample;
  if(!geometry||!target||sample.geometryVersion!==geometry.version||!sample.predictionAvailable||
    x===null||y===null||!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=geometry.viewportWidth||y>=geometry.viewportHeight)return null;
  if(!sample.insideImage)return false;
  if(u===null||v===null||!Number.isFinite(u)||!Number.isFinite(v))return null;
  const regions=target.hitRects?.length?target.hitRects:[target.rect];
  return regions.some(([left,top,width,height])=>u>=left&&u<left+width&&v>=top&&v<top+height);
}

/** Derived CSV context; the exposure ID attached to the callback resolves ties at hide/show boundaries. */
export function archerySampleLookup(session:Session){
  const scene=session.config.paintings.find(hasArcheryPhases);
  const target=scene?.aois.find(a=>a.id==='figma-0-6');
  const byTrial=new Map(session.timings.filter(t=>t.paintingId===scene?.paintingId)
    .map(t=>[t.trialId,reviewWindows(session,t)]));
  return (sample:GazeSample)=>{
    const windows=sample.trialId&&byTrial.get(sample.trialId);
    const window=windows&&sample.sessionId===session.sessionId&&sample.participantId===session.participantId&&
      sample.paintingId===scene?.paintingId&&sample.phase==='free_view'&&!sample.paused&&windows.find(w=>
        (w.exposure?.exposureId??null)===(sample.cardExposureId??null)&&w.start<=sample.callbackTimeMs&&sample.callbackTimeMs<=w.end);
    return {archeryPhase:window?phaseAt(window,sample.callbackTimeMs):null,
      gazeInOriginalTargetAoi:window?gazeInOriginalTarget(sample,window.geometry,target):null};
  };
}

/** Keep null callbacks in the slice. Only consecutive compatible observations may be joined. */
export function segmentTrace(session:Session,trial:TrialTiming,window:ReviewWindow){
  const {geometry,exposure,start,end}=window;
  const callbacks=session.samples.filter(s=>s.sessionId===session.sessionId&&s.participantId===session.participantId
    &&s.trialId===trial.trialId&&s.paintingId===trial.paintingId&&s.phase==='free_view'&&!s.paused
    &&s.callbackTimeMs>=start&&s.callbackTimeMs<=end&&(s.cardExposureId??null)===(exposure?.exposureId??null));
  const points:SegmentPoint[]=[];
  const target=window.archeryPhase&&session.config.paintings.find(p=>p.paintingId===trial.paintingId)?.aois.find(a=>a.id==='figma-0-6');
  let targetSampleCount=0,targetValidCount=0,targetObservedIntervals=0,targetMs=0;
  let lastInTarget:boolean|null=null;
  let lastTarget:'card'|'painting'|null=null;
  let toPainting=0,toCard=0;
  for(const s of callbacks){
    if(exposure?.cardId===arrowId&&window.archeryPhase&&window.archeryPhase!=='arrow_card'&&
      phaseAt({...window,archeryPhase:'arrow_card'},s.callbackTimeMs)!==window.archeryPhase)continue;
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
    const inTarget=target?gazeInOriginalTarget(s,geometry,target):null;
    if(inTarget!==null){
      targetValidCount++;
      if(inTarget)targetSampleCount++;
      if(connects&&lastInTarget!==null){
        targetObservedIntervals++;
        if(lastInTarget&&inTarget)targetMs+=dt;
      }
    }
    lastInTarget=inTarget;
    if(!connects)lastTarget=null;
    if(region==='card'||region==='painting'){
      if(lastTarget==='card'&&region==='painting')toPainting++;
      if(lastTarget==='painting'&&region==='card')toCard++;
      lastTarget=region;
    }
    points.push({sample:s,region,connects});
  }
  return {points,toPainting,toCard,targetSampleCount,targetValidCount,targetMs:targetObservedIntervals?targetMs:null};
}
