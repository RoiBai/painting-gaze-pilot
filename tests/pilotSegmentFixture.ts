import {freezeBackground} from '../src/background';
import {pilotConfig} from '../src/pilotMaterials';
import {buildPilotPlan,PILOT_VERSION,SELECTION_RULES} from '../src/pilotProtocol';
import type {CardExposure} from '../src/types';
import {sessionFixture,sampleFixture} from './dataFixtures';

export function segmentFixture(){
  const s=sessionFixture('segment-fixture');
  s.participantId='P01';s.config=structuredClone(pilotConfig);s.quality='accepted';
  const plan=buildPilotPlan('P01');
  s.order=plan.map(p=>p.paintingId);s.pilot={version:PILOT_VERSION,practice:false,plan,seed:13,selectionRules:{...SELECTION_RULES}};
  s.background=freezeBackground({studyField:'浏览器测试',artEducation:'none',paintingInterest:2});
  const {paintingId,condition}=plan[0],trialId='segment-trial';
  const scene=s.config.paintings.find(p=>p.paintingId===paintingId)!;
  const geo={paintingId,version:1,timeMs:99,viewportWidth:1000,viewportHeight:800,dpr:2,naturalWidth:scene.width,naturalHeight:scene.height,
    left:0,top:230,width:1000,height:1000*scene.height/scene.width,scale:1000/scene.width};
  s.geometries=[geo];
  s.timings=[{trialId,paintingId,startedMs:100,endedMs:5000,activeMs:4300,wallMs:4900,status:'completed'}];
  const card=(slot:number,shownMs:number,hiddenMs:number,exposureId:string):CardExposure=>({
    trialId,paintingId,condition,slot,shownMs,hiddenMs,exposureId,activeStartMs:shownMs-100,cardId:scene.cards[slot-1].id,selectionSource:condition,
    selectionReason:'fixture',validSelectionSamples:0,dwellMs:0,selectionAoiId:null,candidateCardIds:scene.cards.map(c=>c.id),
    geometryVersion:1,calibrationVersion:1,rect:{left:400,top:65,width:300,height:120},
  });
  const exposures=[card(1,1100,1800,'first'),card(2,2400,3100,'second-a'),card(2,3700,4200,'second-b')];
  s.cardExposures=exposures;
  for(const [type,timeMs] of [['pause',3100],['resume',3700]] as const)s.events.push({type,timeMs,paintingId,phase:'free_view',detail:'{}',sessionId:s.sessionId,participantId:s.participantId});
  const emit=(time:number,region:'card'|'painting'|'other'|'missing'|'offscreen',exp:CardExposure|null)=>{
    const x={card:510,painting:160,other:740,missing:null,offscreen:1050}[region];
    const y={card:95,painting:340,other:150,missing:null,offscreen:250}[region];
    s.samples.push(sampleFixture({sessionId:s.sessionId,participantId:s.participantId,paintingId,condition,trialId,
      sampleIndex:s.samples.length,callbackTimeMs:time,viewportX:x,viewportY:y,predictionAvailable:region!=='missing',insideImage:region==='painting',
      imageNormX:x===null?null:x/geo.width,imageNormY:y===null?null:(y-geo.top)/geo.height,
      cardId:exp?.cardId??null,cardExposureId:exp?.exposureId??null,onCard:(!exp||region==='missing')?null:region==='card',
    }));
  };
  emit(300,'painting',null);
  emit(1120,'card',exposures[0]);
  emit(2100,'other',null);
  const second=exposures[1];
  emit(2410,'card',second);emit(2420,'other',second);emit(2440,'painting',second);emit(2470,'card',second);
  emit(2500,'missing',second);emit(2530,'painting',second);emit(2800,'card',second);
  emit(2820,'offscreen',second);emit(2860,'painting',second);
  emit(3800,'card',exposures[2]);emit(4500,'painting',null);
  return s;
}
