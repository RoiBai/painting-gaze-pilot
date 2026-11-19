import type {AOI, CardDecision, CardRect, Condition, GazeSample, Painting, PilotMetadata, PilotTrial} from './types';

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

export function singleAoi(x:number|null,y:number|null,aois:AOI[]):string|null {
  if(x===null || y===null)return null;
  const matches=aois.filter(({rect:[left,top,width,height]})=>hitRect(x,y,{left,top,width,height}));
  return matches.length===1?matches[0].id:null;
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

  const rule=SELECTION_RULES;
  const earliest=Math.max(input.windowStart,input.now-rule.lookbackMs);
  let aoi:string|null=null;
  let newest=0,oldest=0,count=0;
  // Require a current uninterrupted run on an eligible AOI. A null, a blink gap,
  // a card, or a switch of AOI ends that run; do not borrow earlier stale looks.
  for(let i=input.samples.length-1;i>=0;i--){
    const s=input.samples[i];
    if(s.callbackTimeMs<earliest||s.trialId!==input.trialId||s.phase!=='free_view'||s.paused||s.cardExposureId||!s.predictionAvailable||!s.insideImage||!s.imageAoiId)break;
    if(!count){
      if(s.callbackTimeMs>input.now||input.now-s.callbackTimeMs>rule.maximumAgeMs)break;
      aoi=s.imageAoiId;newest=s.callbackTimeMs;
    }else if(s.imageAoiId!==aoi||oldest<s.callbackTimeMs||oldest-s.callbackTimeMs>rule.maximumGapMs)break;
    oldest=s.callbackTimeMs;
    count++;
  }
  const duration=count?newest-oldest:0;
  const cards=aoi?candidates.filter(card=>card.aoiIds.includes(aoi!)):[];
  const evidence={...base,validSelectionSamples:count,dwellMs:duration,selectionAoiId:aoi};
  if(cards.length===1 && count>=rule.minimumSamples && duration>=rule.minimumDwellMs){
    return {...evidence,cardId:cards[0].id,selectionSource:'gaze',selectionReason:'recent-stable-eligible-aoi'};
  }
  return {...evidence,cardId:randomId,selectionSource:'fallback',selectionReason:'no-stable-eligible-aoi'};
}
