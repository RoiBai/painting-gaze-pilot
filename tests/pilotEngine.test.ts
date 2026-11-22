import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {StudyEngine,type Adapter} from '../src/engine';
import {buildPilotPlan,cardPermutation,responsiveSelectionRules,selectCard,singleAoi,SELECTION_RULES} from '../src/pilotProtocol';
import {pilotConfig as materials} from '../src/pilotMaterials';
import {containGeometry} from '../src/geometry';
import {saveSession} from '../src/storage';
import {readCheckpoint} from '../src/pilotResume';
import {surveyForScene} from '../src/pilotSurvey';
import {sampleFixture} from './dataFixtures';
import type {Painting,PilotTrial,Session} from '../src/types';

const pilotConfig=structuredClone(materials);
for(const painting of pilotConfig.paintings){
  painting.cards=painting.cards.slice(0,3).map(({art,...card})=>card);
}

vi.mock('../src/storage',()=>({saveSession:vi.fn().mockResolvedValue(undefined)}));

describe('P protocol and assignment',()=>{
  it('balances the nine combinations at each recruitment stopping point',()=>{
    expect(buildPilotPlan('P00')).toEqual(buildPilotPlan('P01'));
    expect(buildPilotPlan('P01')).toEqual([
      {paintingId:'ming-xingle-cuju',condition:'sequential'},
      {paintingId:'ming-xingle-polo',condition:'random'},
      {paintingId:'ming-xingle-archery',condition:'gaze'},
    ]);
    expect(()=>buildPilotPlan('P37')).toThrow();
    for(const n of [6,18,27,36]){
      const counts=new Map<string,number>();
      for(let i=1;i<=n;i++){
        const plan=buildPilotPlan('P'+String(i).padStart(2,'0'));
        expect(new Set(plan.map(part=>part.paintingId)).size).toBe(3);
        expect(new Set(plan.map(part=>part.condition)).size).toBe(3);
        for(const part of plan){
          const key=part.paintingId+'/'+part.condition;
          counts.set(key,(counts.get(key)??0)+1);
        }
      }
      expect(counts.size).toBe(9);
      expect([...counts.values()].every(value=>value===n/3)).toBe(true);
    }
  });
  it('exposes all nine single-scene combinations exclusively to the rehearsal profile',()=>{
    for(const scene of pilotConfig.paintings) for(const condition of ['sequential','random','gaze'] as const){
      const trial={paintingId:scene.paintingId,condition};
      expect(buildPilotPlan('P00',trial)).toEqual([trial]);
      expect(()=>buildPilotPlan('P01',trial)).toThrow(/仅 P00/);
    }
    expect(()=>buildPilotPlan('P00',{paintingId:'unknown',condition:'gaze'})).toThrow();
    expect(()=>buildPilotPlan('P00',{paintingId:'ming-xingle-archery',condition:'invalid'} as unknown as PilotTrial)).toThrow();
    expect(()=>buildPilotPlan('P00',null as unknown as PilotTrial)).toThrow();
  });
  it('uses only a current, stable, eligible run and marks fallback/last-card decisions',()=>{
    const painting=pilotConfig.paintings[0];
    const ids=painting.cards.map(card=>card.id);
    const aoi=painting.cards[1].aoiIds[0];
    const run=[500,560,620,680,740,800].map(callbackTimeMs=>sampleFixture({callbackTimeMs,trialId:'trial',imageAoiId:aoi}));
    const deck=cardPermutation(ids,15,painting.paintingId);
    const args={painting,trialId:'trial',condition:'gaze' as const,now:815,windowStart:0,slot:1,deck,priorIds:[],samples:run,qualityOK:true};
    expect(selectCard(args)).toMatchObject({selectionSource:'gaze',cardId:ids[1],validSelectionSamples:6,dwellMs:300});
    expect(selectCard({...args,qualityOK:false})?.selectionSource).toBe('fallback');
    expect(selectCard({...args,now:1200})?.selectionSource).toBe('fallback');
    expect(selectCard({...args,samples:[...run,sampleFixture({trialId:'trial',callbackTimeMs:810,predictionAvailable:false})]})?.selectionSource).toBe('fallback');
    expect(selectCard({...args,priorIds:[ids[1]]})?.selectionSource).toBe('fallback');
    expect(selectCard({...args,priorIds:ids.slice(0,2)})?.selectionSource).toBe('remaining');
    expect(selectCard({...args,condition:'random',priorIds:[deck[0]]})?.cardId).toBe(deck[1]);
    expect(selectCard({...args,condition:'sequential',priorIds:[ids[0]]})?.cardId).toBe(ids[1]);
  });
  it('tolerates a brief noisy estimate but never credits its time towards the fast trigger',()=>{
    const painting=pilotConfig.paintings[0];
    const aoi=painting.cards[1].aoiIds[0];
    const samples=Array.from({length:25},(_,i)=>sampleFixture({
      trialId:'trial',callbackTimeMs:i*50,imageAoiId:i===15?null:aoi,
    }));
    const args={painting,trialId:'trial',condition:'gaze' as const,now:1200,windowStart:0,slot:1,deck:[],priorIds:[],samples,
      qualityOK:true,rules:responsiveSelectionRules([painting],60)};
    expect(selectCard(args)).toMatchObject({selectionSource:'gaze',dwellMs:1100,validSelectionSamples:24});
    samples[16].imageAoiId=null;samples[17].imageAoiId=null;
    expect(selectCard(args)?.selectionSource).toBe('fallback');
  });
  it('respects the looking location and keeps the independent random deck, last-card and fallback decisions',()=>{
    const painting={...materials.paintings[2],materialVersion:'ming-uci-collage-v7'};
    const archer='archery-figma-1-2',arrow='archery-figma-1-6',target='archery-figma-0-6';
    const samples=Array.from({length:23},(_,i)=>sampleFixture({callbackTimeMs:i*50,trialId:'t',imageAoiId:'figma-0-6'}));
    const args={painting,condition:'gaze' as const,now:1100,windowStart:0,slot:1,deck:[target,archer,arrow],
      priorIds:[] as string[],samples,trialId:'t',qualityOK:true,rules:responsiveSelectionRules([painting],60)};
    for(const seen of [[],[archer]])expect(selectCard({...args,priorIds:seen})).toMatchObject({cardId:target,selectionSource:'gaze'});
    const onArrow=samples.map(s=>({...s,imageAoiId:'figma-1-6'}));
    expect(selectCard({...args,samples:onArrow})).toMatchObject({cardId:archer,selectionReason:'shared-region-archer-first',selectionAoiId:'figma-1-6'});
    expect(selectCard({...args,painting:{...painting,materialVersion:'ming-uci-collage-v6'},samples:onArrow})).toMatchObject({cardId:arrow,selectionReason:'recent-stable-eligible-aoi'});
    expect(selectCard({...args,qualityOK:false})).toMatchObject({cardId:target,selectionSource:'fallback',selectionReason:'quality-not-verified'});
    expect(selectCard({...args,priorIds:painting.cards.map(c=>c.id).filter(id=>id!==arrow)})).toMatchObject({cardId:arrow,selectionSource:'remaining'});
    const used:string[]=[];
    for(const id of args.deck){
      expect(selectCard({...args,condition:'random',priorIds:used})).toMatchObject({cardId:id,selectionSource:'random'});
      used.push(id);
    }
  });
});

describe('physical exposure windows and camera recording',()=>{
  let now=0;
  let engine:StudyEngine;
  beforeEach(()=>{
    vi.useFakeTimers();
    vi.mocked(saveSession).mockClear();
    now=0;
    vi.spyOn(document,'hasFocus').mockReturnValue(true);
    const adapter:Adapter={start:vi.fn(),stop:vi.fn(),setPhase:vi.fn(),showPreview:vi.fn(),resetCalibration:vi.fn(),train:vi.fn()};
    engine=new StudyEngine(()=>adapter,()=>now);
  });
  afterEach(()=>{engine.dispose();vi.restoreAllMocks();vi.useRealTimers()});
  function begin(id:string){
    engine.begin(pilotConfig,id,{studyField:'test fixture',artEducation:'none',paintingInterest:3});
    return engine.session!;
  }
  function image(p:Painting){
    engine.phase='loading_image';
    engine.imageReady(containGeometry({paintingId:p.paintingId,version:1,timeMs:now,
      naturalWidth:p.width,naturalHeight:p.height,viewportWidth:1000,viewportHeight:800,dpr:2,
      box:{left:0,top:0,width:1000,height:800}}));
  }
  function callback(x:number|null,y:number|null){
    engine.sample({x,y,callbackTimeMs:now,libraryElapsedMs:now});
  }
  it('shows scheduled cards at the two-second deadline and stops collecting in the questionnaire',()=>{
    const session=begin('P01');
    image(engine.painting!);
    for(let slot=0;slot<3;slot++){
      now=slot*20000+1999;callback(500,400);engine.tick();
      expect(engine.activeCard).toBeNull();
      now++;callback(500,400);engine.tick();
      expect(engine.activeCard).toBeDefined();
      expect(engine.activeCard?.id).toBe(engine.painting!.cards[slot].id);
      engine.cardShown({left:10,top:10,width:60,height:20});
      now=(slot+1)*20000;callback(500,400);engine.tick();engine.cardHidden();
    }
    expect(session.cardExposures!.map(e=>[e.shownMs,e.hiddenMs])).toEqual([[2000,20000],[22000,40000],[42000,60000]]);
    expect(engine.phase).toBe('pre');
    const count=session.samples.length;
    now+=8000;callback(50,50);engine.tick();
    expect(session.samples).toHaveLength(count);
  });
  it('honors the saved three-second start in an existing fixed-slot session',()=>{
    const session=begin('P01');
    session.pilot!.selectionRules={...SELECTION_RULES,blankFraction:.15};
    image(engine.painting!);
    now=2999;callback(500,400);engine.tick();expect(engine.activeCard).toBeNull();
    now=3000;callback(500,400);engine.tick();expect(engine.activeCard?.id).toBe(engine.painting!.cards[0].id);
  });

  it('counts a fresh shared-area dwell for the arrow and records flight-following samples without triggering another card',()=>{
    const config=structuredClone(materials);
    const painting=config.paintings.find(p=>p.paintingId==='ming-xingle-archery')!;
    painting.materialVersion='ming-uci-collage-v7';
    engine.begin(config,'P00','fixture',{paintingId:painting.paintingId,condition:'gaze'});
    const session=engine.session!;
    for(const kind of ['drift','validation'] as const)session.validationSummaries.push({
      kind,status:'pass',targets:[],runId:kind,calibrationVersion:0,medianErrorPx:10,errorDiagonalRatio:.01,
    });
    image(painting);
    const g=engine.geometry!;
    const archer=[.62,.63],arrow=[.607,.558],target=[.235,.487],elsewhere=[.42,.44];
    let visible:string|undefined;
    for(now=0;now<=26000;now+=50){
      // Alternate between neighbouring authored AOIs while acquiring the archer.
      // Follow the shaft to its target while the second card is visible, then look away.
      const xy=now<12000?(now%100===0?arrow:archer):now<14000?archer:now<23100?target:elsewhere;
      callback(g.left+xy[0]*g.width,g.top+xy[1]*g.height);
      engine.tick();
      const current=engine.activeCard?.id;
      if(current!==visible){
        if(visible)engine.cardHidden(visible);
        if(current)engine.cardShown({left:0,top:0,width:100,height:30},current);
        visible=current;
      }
    }
    const [first,second,third]=session.cardExposures!;
    expect(first).toMatchObject({cardId:'archery-figma-1-2',shownMs:1100,selectionReason:'shared-region-archer-first',
      selectionSource:'gaze',selectionAoiId:'figma-1-6',dwellMs:1100});
    expect(second).toMatchObject({cardId:'archery-figma-1-6',shownMs:13100,selectionReason:'shared-region-arrow-follow-up',
      selectionSource:'gaze',selectionAoiId:'figma-1-2',dwellMs:1100});
    expect(session.samples.filter(s=>s.callbackTimeMs<=1100).map(s=>s.imageAoiId)).toEqual(
      Array.from({length:23},(_,i)=>i%2===0?'figma-1-6':'figma-1-2'));
    expect(session.samples.find(s=>s.callbackTimeMs===21500)).toMatchObject({cardExposureId:second.exposureId,imageAoiId:'figma-0-6'});
    expect(third).toMatchObject({shownMs:26000,selectionSource:'fallback',selectionReason:'no-stable-eligible-aoi',dwellMs:0});
  });

  it.each(['sequential','random','gaze'] as const)('keeps nine separate archery exposures and joins narrated shots only in sequential mode (%s)',condition=>{
    const painting=materials.paintings.find(p=>p.paintingId==='ming-xingle-archery')!;
    engine.begin(materials,'P00','test',{paintingId:painting.paintingId,condition});
    image(painting);
    let visible:string|undefined;
    for(now=0;now<=108000;now+=100){
      callback(500,400);
      engine.tick();
      const current=engine.activeCard?.id;
      if(visible!==current){
        if(visible)engine.cardHidden(visible);
        if(current)engine.cardShown({left:20,top:30,width:50,height:40},current);
        visible=current;
      }
      if(current)callback(50,50);
    }
    const {cardExposures,samples,timings}=engine.session!;
    const exposures=cardExposures!;
    expect(new Set(exposures.map(e=>e.cardId)).size).toBe(9);
    expect(timings[0].activeMs).toBe(108000);
    for(const e of exposures){
      expect(e.hiddenMs!-e.shownMs).toBe(10000);
      expect(samples.some(s=>s.cardExposureId===e.exposureId&&s.cardId===e.cardId&&s.onCard)).toBe(true);
    }
    if(condition==='sequential'){
      expect(exposures.slice(4,7).map(e=>[e.cardId,e.shownMs,e.hiddenMs])).toEqual([
        ['archery-figma-1-2',52000,62000],['archery-figma-1-6',62000,72000],['archery-figma-0-6',72000,82000],
      ]);
    }else{
      expect(exposures.map(e=>e.shownMs)).toEqual(Array.from({length:9},(_,i)=>2000+12000*i));
    }
  });

  it.each(['gaze','random','sequential'] as const)('gives four cutouts ten seconds each for %s, with a 1.1s eligible gaze trigger',condition=>{
    const config=structuredClone(pilotConfig);
    const painting=config.paintings[0];
    // Four equal strips are easy to target in the contained long-scroll image.
    painting.aois=Array.from({length:4},(_,i)=>({id:'target'+i,label:'target '+i,rect:[i/4,0,.25,1]}));
    painting.cards=painting.aois.map((a,i)=>({
      ...painting.cards[0],id:'card'+i,aoiIds:[a.id],art:{image:'/materials/uci/test.png',board:'#ddaa66',glow:'#ddbb77'},
    }));
    painting.relations.forEach(rel=>rel.aoiIds=[painting.aois[0].id]);
    engine.begin(config,'P00','fixture',{paintingId:painting.paintingId,condition});
    const session=engine.session!;
    for(const kind of ['drift','validation'] as const)session.validationSummaries.push({
      kind,status:'pass',targets:[],runId:kind,calibrationVersion:0,medianErrorPx:10,errorDiagonalRatio:.01,
    });
    image(painting);
    let shown:string|undefined;
    for(now=0;now<=48000;now+=50){
      const target=[2,0,3,1][Math.min(3,Math.floor(now/12000))];
      callback((target+.5)*250,400);
      engine.tick();
      const current=engine.activeCard?.id;
      if(shown!==current){
        if(shown)engine.cardHidden(shown);
        if(current)engine.cardShown({left:0,top:0,width:30,height:20},current);
        shown=current;
      }
    }
    const cards=session.cardExposures!;
    expect(new Set(cards.map(c=>c.cardId)).size).toBe(4);
    expect(cards.map(c=>c.hiddenMs!-c.shownMs)).toEqual([10000,10000,10000,10000]);
    expect(session.timings[0].activeMs).toBe(48000);
    expect(cards.map(c=>c.shownMs)).toEqual(condition==='gaze'?[1100,13100,25100,38000]:[2000,14000,26000,38000]);
    if(condition==='gaze'){
      expect(cards.map(c=>c.cardId)).toEqual(['card2','card0','card3','card1']);
      expect(cards.map(c=>c.selectionSource)).toEqual(['gaze','gaze','gaze','remaining']);
    }
  });

  it('targets the smallest authored detail and excludes the empty space between group members',()=>{
    const regions:Painting['aois']=[
      {id:'scene',label:'scene',rect:[0,0,1,1]},
      {id:'figure',label:'figure',rect:[.2,.2,.3,.3]},
      {id:'tree',label:'tree',rect:[.4,.4,.2,.3]},
    ];
    expect(singleAoi(.3,.3,regions,true)).toBe('figure');
    expect(singleAoi(.3,.3,regions)).toBeNull();
    expect(singleAoi(.41,.41,regions,true)).toBe('tree');
    const people:Painting['aois']=[{id:'figures',label:'figures',rect:[0,0,.8,.5],hitRects:[[0,0,.1,.5],[.7,0,.1,.5]]}];
    expect(singleAoi(.4,.2,people,true)).toBeNull();
    expect(singleAoi(.75,.2,people,true)).toBe('figures');
    expect(singleAoi(.4,.2,people)).toBe('figures');
  });
  it('requires camera data for a recorded session, including drift checks',()=>{
    const session=begin('P01');
    expect(()=>engine.flowOnly()).toThrow();
    engine.phase='drift_result';
    session.validationSummaries.push({kind:'drift',status:'fail',targets:[{targetId:'0',n:0,medianErrorPx:null}],runId:'t',calibrationVersion:1,medianErrorPx:null,errorDiagonalRatio:null});
    expect(()=>engine.acceptQuality(true)).toThrow(/有效摄像头预测/);
  });

  it('records nullable hit-tests outside the long image in all three conditions and closes interrupted windows',()=>{
    const session=begin('P01');
    const rect={left:8,top:12,width:160,height:50};
    for(let trial=0;trial<3;trial++){
      engine.trialIndex=trial;
      const painting=engine.painting!;
      image(painting);
      const timing=engine.currentTiming!;
      now+=8000;callback(10,20);engine.tick();
      const card=engine.activeCard!;
      expect(card).not.toBeNull();
      engine.cardShown(rect,card.id);
      now+=20;callback(10,20);now+=25;callback(799,20);now+=25;callback(null,null);
      const first=session.cardExposures!.at(-1)!;
      expect(first).toMatchObject({condition:session.pilot!.plan[trial].condition,slot:1,trialId:timing.trialId});
      expect(session.samples.slice(-3).map(v=>[v.cardExposureId,v.onCard,v.insideImage])).toEqual([
        [first.exposureId,true,false],[first.exposureId,false,false],[first.exposureId,null,false],
      ]);
      engine.pause('manual_pause',false);
      expect(first.hiddenMs).toBe(now);
      now+=400;callback(10,20);
      expect(session.samples.at(-1)).toMatchObject({onCard:null,cardId:null,paused:true});
      engine.resume();
      engine.cardShown(rect,card.id);
      const second=session.cardExposures!.at(-1)!;
      expect(second.exposureId).not.toBe(first.exposureId);
      expect(second.shownMs).toBe(first.hiddenMs!+400);
      expect(second.cardId).toBe(first.cardId);
      now+=11930;callback(500,400);engine.tick();
      expect(engine.activeCard).toBeNull();engine.cardHidden(card.id);
      const cardIds=[first.cardId];
      for(let slot=2;slot<=3;slot++){
        now+=8000;callback(500,400);engine.tick();
        expect(engine.activeCard).not.toBeNull();
        cardIds.push(engine.activeCard!.id);engine.cardShown(rect,engine.activeCard!.id);
        now+=12000;callback(500,400);engine.tick();engine.cardHidden();
      }
      expect(new Set(cardIds).size).toBe(3);
      expect(timing.activeMs).toBe(60000);expect(engine.phase).toBe('pre');
      engine.next();
      expect(engine.phase).toBe(trial===2?'interview':'drift');
    }
    engine.next();
    expect(session.status).toBe('completed');
    expect(session.cardExposures!.every(row=>row.hiddenMs!==null)).toBe(true);
  });

  it('retains the practice flag, recorded samples and card exposures on exit and assigns each P00 a new session id',async()=>{
    const first=begin('P00');
    image(engine.painting!);
    now+=3100;callback(50,55);engine.tick();
    engine.cardShown({left:10,top:10,width:40,height:60});
    now+=28;callback(20,25);
    engine.interrupt('practice exit');
    await engine.persist();
    expect(first.pilot?.practice).toBe(true);
    expect(first.status).toBe('interrupted');
    expect(first.cardExposures?.[0].hiddenMs).toBe(now);
    expect(first.samples.at(-1)).toMatchObject({onCard:true,cardId:first.cardExposures?.[0].cardId});
    expect(saveSession).toHaveBeenCalledWith(first);
    expect(readCheckpoint()).toBeNull();
    const second=begin('P00');
    engine.flowOnly();engine.interrupt();
    expect(second.sessionId).not.toBe(first.sessionId);
    expect(second.quality).toBe('flow_only');
    expect(second.samples).toHaveLength(0);
  });

  it('resumes one chosen scene and finishes immediately after its survey',()=>{
    const trial:PilotTrial={paintingId:'ming-xingle-polo',condition:'gaze'};
    engine.begin(pilotConfig,'P00',{studyField:'test',artEducation:'none',paintingInterest:3},trial);
    const s=engine.session!;
    expect(s.pilot).toMatchObject({practice:true,rehearsalMode:'single-scene',plan:[trial]});
    expect(s.order).toEqual([trial.paintingId]);
    expect(engine.phase).toBe('camera');
    engine.flowOnly();image(engine.painting!);
    now=3000;engine.tick();engine.cardShown({left:30,top:30,width:70,height:50});
    now=60000;engine.tick();
    expect(s.cardExposures![0]).toMatchObject(trial);
    expect(engine.phase).toBe('pre');
    expect(s.timings[0]).toMatchObject({paintingId:trial.paintingId,activeMs:60000,status:'completed'});
    const checkpoint=readCheckpoint()!;
    engine.suspendForReload();
    const restored=new StudyEngine(()=>engine.adapter,()=>now);
    expect(restored.restorePilot(s,{...checkpoint,trialIndex:1})).toBe(false);
    expect(restored.restorePilot(s,checkpoint)).toBe(true);
    expect(restored.painting?.paintingId).toBe(trial.paintingId);
    restored.next();
    expect(restored.session?.status).toBe('completed');
    expect(restored.session?.events.some(e=>e.phase==='interview')).toBe(false);
    expect(readCheckpoint()).toBeNull();
    restored.dispose();
  });

  it('restores the current P00 survey draft after navigation and clears its checkpoint only when finished',()=>{
    const s=begin('P00');
    engine.flowOnly();
    image(engine.painting!);
    now+=60000;engine.tick();
    expect(engine.phase).toBe('pre');
    const snapshot=structuredClone(s);
    const survey=surveyForScene(s,engine.painting!);
    survey.workload.mental=0;
    engine.saveSurvey();
    const checkpoint=readCheckpoint();
    expect(checkpoint?.participantId).toBe('P00');
    engine.suspendForReload();
    expect(s.status).toBe('active');
    const restored=new StudyEngine(()=>engine.adapter,()=>now);
    expect(restored.restorePilot(snapshot,checkpoint!)).toBe(true);
    expect(restored.phase).toBe('pre');
    expect(restored.session?.pilotSurveys?.[s.order[0]].workload.mental).toBe(0);
    restored.dispose();
    expect(readCheckpoint()).toBeNull();
  });
});
