import type {AOI, CardDecision, CardRect, Condition, GazeSample, Painting, PilotMetadata, PilotTrial} from './types';
import {PAPER_MATERIAL,V5_PAPER_MATERIAL} from './cardPresentation';

export type {Condition} from './types';
export const PILOT_VERSION='three-condition-v1' as const;
export const SELECTION_RULES: PilotMetadata['selectionRules'] = {
  minimumDwellMs: 300,
  minimumSamples: 5,
  maximumGapMs: 150,
  lookbackMs: 1500,
  maximumAgeMs: 250,
  slots: 3,
  blankFraction: 0.4,
  randomAlgorithm: 'fnv1a-context/mulberry32/fisher-yates-v1',
};

export function sceneDurationSeconds(painting:Painting,defaultSeconds:number):number {
  return painting.cards.some(card=>card.art)?painting.cards.length*12:defaultSeconds;
}

export function responsiveSelectionRules(paintings:Painting[],defaultSeconds:number):PilotMetadata['selectionRules'] {
  return {
    minimumDwellMs:1100, minimumSamples:5, maximumGapMs:150, lookbackMs:1500, maximumAgeMs:250, maximumOffTargetMs:150,
    maximumSelectionMs:2000, blankFraction:.4,
    slotCountsByPainting:Object.fromEntries(paintings.map(p=>[p.paintingId,p.cards.length])),
    durationMsByPainting:Object.fromEntries(paintings.map(p=>[p.paintingId,1000*sceneDurationSeconds(p,defaultSeconds)])),
    randomAlgorithm:SELECTION_RULES.randomAlgorithm,
  };
}

export interface CardWindow {start:number; reveal:number; end:number}

/** Scene-relative active time. Each card has the same exposure budget in all three conditions. */
export function cardWindows(painting:Painting,condition:Condition,rules:PilotMetadata['selectionRules'],duration:number):CardWindow[]{
  const count=rules.slotCountsByPainting?.[painting.paintingId]??rules.slots??painting.cards.length;
  const slot=duration/count;
  const wait=Math.min(slot*rules.blankFraction,rules.maximumSelectionMs??Infinity);
  const windows=Array.from({length:count},(_,i)=>({start:i*slot,reveal:i*slot+wait,end:(i+1)*slot}));
  if(condition!=='sequential'||![V5_PAPER_MATERIAL,PAPER_MATERIAL].includes(painting.materialVersion)||painting.paintingId!=='ming-xingle-archery')return windows;

  const first=painting.cards.findIndex(c=>c.id==='archery-figma-1-2');
  if(first<0||first+2>=count||painting.cards[first+1]?.id!=='archery-figma-1-6'||painting.cards[first+2]?.id!=='archery-figma-0-6')return windows;
  // Centre the uninterrupted archer → arrow → target sequence on the arrow's
  // regular slot. Move its two inter-card pauses to the edges of the sequence.
  const reading=slot-wait;
  const firstReveal=windows[first+1].reveal-reading;
  for(let i=0;i<3;i++){
    const reveal=firstReveal+i*reading;
    windows[first+i]={start:i===0?windows[first].start:reveal,reveal,end:reveal+reading};
  }
  return windows;
}

const SCENES=['ming-xingle-cuju','ming-xingle-polo','ming-xingle-archery'];
const CONDITIONS:Condition[]=['sequential','random','gaze'];
// The first three rows plus their reverses form the six-person block.
// Digits in each pair are the (zero-based) condition and scene indices.
const FIRST_ROWS = [
  [[0,0],[1,1],[2,2]],
  [[1,2],[2,0],[0,1]],
  [[2,1],[0,2],[1,0]],
];
const SIX_ROWS = [...FIRST_ROWS,...FIRST_ROWS.map(row=>[...row].reverse())];

export function buildPilotPlan(participantId:string,previewTrial?:PilotTrial):PilotTrial[] {
  if(!/^P(?:[0-2]\d|3[0-6])$/.test(participantId)) throw Error('本轮编号为 P00–P36');
  if(previewTrial!==undefined){
    if(participantId!=='P00')throw Error('仅 P00 可自选场景和讲解方式');
    if(!previewTrial || !SCENES.includes(previewTrial.paintingId) || !CONDITIONS.includes(previewTrial.condition))
      throw Error('请从三个场景与三种讲解方式中选择');
    return [{paintingId:previewTrial.paintingId,condition:previewTrial.condition}];
  }
  const index=Math.max(0,Number(participantId.slice(1))-1);
  const rotation=Math.floor(index/6)%3;
  return SIX_ROWS[index%6].map(([condition,scene])=>{
    const rotated=(scene+rotation)%3;
    const translated=index>=18 && rotated!==0 ? 3-rotated : rotated;
    return {paintingId:SCENES[translated],condition:CONDITIONS[condition]};
  });
}

/** A trial retains its deck across recalibration/restarts. */
export function cardPermutation(cardIds:string[],seed:number,paintingId:string):string[]{
  let state=seed>>>0;
  for(const ch of paintingId)state=Math.imul(state^ch.charCodeAt(0),16777619)>>>0;
  const random=()=>{
    state=(state+0x6D2B79F5)>>>0;
    let word=Math.imul(state^(state>>>15),1|state);
    word^=word+Math.imul(word^(word>>>7),61|word);
    return ((word^(word>>>14))>>>0)/4294967296;
  };
  const deck=[...cardIds];
  for(let i=deck.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
  return deck;
}

export function hitRect(x:number,y:number,rect:CardRect):boolean {
  return x>=rect.left && x<rect.left+rect.width && y>=rect.top && y<rect.top+rect.height;
}

export function singleAoi(x:number|null,y:number|null,aois:AOI[],detailedTargets=false):string|null {
  if(x===null || y===null)return null;
  let target:string|null=null;
  let smallestArea=Infinity;
  for(const aoi of aois){
    const regions=detailedTargets && aoi.hitRects?.length?aoi.hitRects:[aoi.rect];
    let area=Infinity;
    for(const [left,top,width,height] of regions){
      if(hitRect(x,y,{left,top,width,height}))area=Math.min(area,width*height);
    }
    if(!Number.isFinite(area))continue;
    if(!detailedTargets && smallestArea<Infinity)return null;
    // A cutout can contain several separated figures. Only its authored target
    // pieces count, and a smaller detail wins when two different layers overlap.
    if(area<smallestArea){smallestArea=area;target=aoi.id}
    else if(area===smallestArea)target=null;
  }
  return target;
}

interface DecisionInput {
  condition:Condition;
  painting:Painting;
  slot:number;
  priorIds:string[];
  deck:string[];
  samples:GazeSample[];
  trialId:string;
  now:number;
  windowStart:number;
  qualityOK:boolean;
  rules?:PilotMetadata['selectionRules'];
}

export function selectCard(input:DecisionInput):CardDecision|null {
  const candidates=input.painting.cards.filter(card=>!input.priorIds.includes(card.id));
  if(candidates.length===0)return null;
  const ids=candidates.map(card=>card.id);
  const first=ids[0];
  const randomId=input.deck.find(id=>ids.includes(id))??first;
  const base={slot:input.slot,candidateCardIds:ids,validSelectionSamples:0,dwellMs:0,selectionAoiId:null};
  if(input.condition==='sequential')return {...base,cardId:first,selectionSource:'sequential',selectionReason:'curated-order'};
  if(input.condition==='random')return {...base,cardId:randomId,selectionSource:'random',selectionReason:'seeded-order'};
  if(ids.length===1)return {...base,cardId:first,selectionSource:'remaining',selectionReason:'last-unshown-card'};
  if(!input.qualityOK)return {...base,cardId:randomId,selectionSource:'fallback',selectionReason:'quality-not-verified'};

  const rule=input.rules??SELECTION_RULES;
  const earliest=Math.max(input.windowStart,input.now-rule.lookbackMs);
  let aoi:string|null=null;
  let oldest=0,count=0,dwell=0,offTargetMs=0;
  // Only adjacent matching callbacks contribute to dwell. New sessions allow
  // short prediction noise, without counting those intervals or crossing
  // a long gap, a different trial, a pause or an exposure.
  let previousSample:GazeSample|undefined;
  for(let i=input.samples.length-1;i>=0;i--){
    const s=input.samples[i];
    if(s.callbackTimeMs<earliest||s.trialId!==input.trialId||s.phase!=='free_view'||s.paused||s.cardExposureId)break;
    const target=s.predictionAvailable&&s.insideImage?s.imageAoiId:null;
    if(!previousSample){
      if(!target||s.callbackTimeMs>input.now||input.now-s.callbackTimeMs>rule.maximumAgeMs)break;
      aoi=target;
    }else{
      const interval=previousSample.callbackTimeMs-s.callbackTimeMs;
      if(interval<0||interval>rule.maximumGapMs || previousSample.calibrationVersion!==s.calibrationVersion || previousSample.geometryVersion!==s.geometryVersion)break;
      if(target===aoi && previousSample.predictionAvailable && previousSample.insideImage && previousSample.imageAoiId===aoi)dwell+=interval;
      else{
        offTargetMs+=interval;
        if(offTargetMs>(rule.maximumOffTargetMs??0) || oldest-s.callbackTimeMs>rule.maximumGapMs)break;
      }
    }
    if(target===aoi){oldest=s.callbackTimeMs;count++}
    previousSample=s;
  }
  const duration=dwell;
  const cards=aoi?candidates.filter(card=>card.aoiIds.includes(aoi!)):[];
  const evidence={...base,validSelectionSamples:count,dwellMs:duration,selectionAoiId:aoi};
  if(cards.length===1 && count>=rule.minimumSamples && duration>=rule.minimumDwellMs){
    return {...evidence,cardId:cards[0].id,selectionSource:'gaze',selectionReason:'recent-stable-eligible-aoi'};
  }
  return {...evidence,cardId:randomId,selectionSource:'fallback',selectionReason:'no-stable-eligible-aoi'};
}
