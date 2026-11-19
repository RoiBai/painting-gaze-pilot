// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {strFromU8,strToU8,zipSync} from 'fflate';
import {freezeBackground} from '../src/background';
import {cardAttention,pilotRatings,TLX_DIMENSIONS} from '../src/cardMetrics';
import {buildTextExportFiles,buildCorrectionExportFiles,exportPrefix,PILOT_DATA_FILES} from '../src/export';
import {readSessionArchive} from '../src/importSession';
import {pilotConfig} from '../src/pilotMaterials';
import {buildPilotPlan,PILOT_VERSION,SELECTION_RULES} from '../src/pilotProtocol';
import type {CardExposure,ResponseRow,Session,PilotTrial} from '../src/types';
import {sampleFixture,sessionFixture} from './dataFixtures';

function setup(participantId='P01',single?:PilotTrial) {
  const s=sessionFixture();
  const plan=buildPilotPlan(participantId,single);
  s.participantId=participantId;
  s.config=structuredClone(pilotConfig);
  s.order=plan.map(t=>t.paintingId);
  s.pilot={version:PILOT_VERSION,practice:participantId==='P00',plan,seed:12345,selectionRules:{...SELECTION_RULES}};
  if(single)s.pilot.rehearsalMode='single-scene';
  s.background=freezeBackground({studyField:'历史',artEducation:'short',paintingInterest:3});
  const {paintingId,condition}=plan[0];
  const scene=s.config.paintings.find(p=>p.paintingId===paintingId)!;
  const {width:naturalWidth,height:naturalHeight}=scene;
  const trialId=paintingId+'-1';
  s.geometries=[{version:1,paintingId,timeMs:0,viewportWidth:1200,viewportHeight:900,dpr:1,naturalWidth,naturalHeight,left:0,top:300,width:1200,height:300,scale:1200/naturalWidth}];
  s.timings=[{paintingId,trialId,startedMs:500,endedMs:3000,wallMs:2500,activeMs:2500,status:'completed'}];
  const exposure:CardExposure={exposureId:'card-segment-1',trialId,paintingId,condition,cardId:scene.cards[0].id,slot:1,selectionSource:condition,selectionReason:'unit test',shownMs:1000,hiddenMs:2000,rect:{left:10,top:10,width:40,height:20},geometryVersion:1,calibrationVersion:1,activeStartMs:500,validSelectionSamples:0,dwellMs:0,selectionAoiId:null,candidateCardIds:scene.cards.map(c=>c.id)};
  s.cardExposures=[exposure];
  return s;
}

function emit(s:Session, time:number, hit:boolean|null, segment=0) {
  const exposure=s.cardExposures![segment];
  s.samples.push(sampleFixture({sessionId:s.sessionId,participantId:s.participantId,
    trialId:exposure.trialId,paintingId:exposure.paintingId,condition:exposure.condition,
    sampleIndex:s.samples.length,callbackTimeMs:time,libraryElapsedMs:time,trialActiveMs:time-500,
    viewportX:hit===null?null:hit?20:70,viewportY:hit===null?null:15,
    imageX:null,imageY:null,imageNormX:null,imageNormY:null,imageAoiId:null,
    predictionAvailable:hit!==null,insideImage:false,onCard:hit,cardId:exposure.cardId,cardExposureId:exposure.exposureId}));
}

function write(s:Session,id:string,answer:string,paintingId:string|null=s.order[0],phase:ResponseRow['phase']='pre') {
  s.responses.push({sessionId:s.sessionId,participantId:s.participantId,paintingId,phase,
    questionId:id,answer,confidence:null,unknown:false,skipped:false,durationMs:50,timeMs:3000});
}

const read=(s:Session)=>readSessionArchive(strToU8(JSON.stringify(s)),'session.json');

describe('three-condition local results and archives',()=>{
  it('measures raw off-image card hits, omits missing, long and interrupted intervals, and distinguishes zero from unknown',()=>{
    const s=setup();
    const times=[1000,1040,1080,1100,1140,1190,1400,1440];
    const hits=[true,true,false,null,false,false,true,true];
    times.forEach((time,i)=>emit(s,time,hits[i]));
    const first=s.cardExposures![0];
    s.cardExposures!.push({...first,exposureId:'resumed',shownMs:2000,hiddenMs:2300},{...first,exposureId:'isolated',shownMs:2300,hiddenMs:2400});
    emit(s,2010,false,1);emit(s,2050,false,1);emit(s,2080,true,1);
    s.samples.at(-1)!.paused=true;
    emit(s,2100,true,1);
    emit(s,2330,true,2);
    const [joined,zero,unknown]=cardAttention(s);
    expect(joined).toMatchObject({callbacks:8,validSamples:7,onCardSamples:4,visibleMs:1000,observedMs:170,onCardMs:100,offCardMs:70,observationCoverage:0.17});
    expect(joined.onCardShare).toBeCloseTo(100/170);
    expect(zero).toMatchObject({onCardMs:0,onCardShare:0,observedMs:40,callbacks:3});
    expect(unknown).toMatchObject({validSamples:1,visibleMs:100,observedMs:0,onCardMs:null,offCardMs:null,onCardShare:null});
  });

  it('does not integrate across trial, geometry, calibration, absent indices or exposure boundaries',()=>{
    const s=setup();
    for(let t=1000;t<1240;t+=30) emit(s,t,true);
    s.samples[1].calibrationVersion++;
    s.samples[3].geometryVersion=2;
    s.samples[5].trialId='discarded';
    s.samples[7].sampleIndex++;
    expect(cardAttention(s)[0]).toMatchObject({callbacks:5,validSamples:5,observedMs:0,onCardShare:null});
  });

  it('keeps zero scores and partial questionnaires, and computes Raw TLX only for all six usable scales',()=>{
    const s=setup();
    write(s,'overall','6');
    TLX_DIMENSIONS.forEach((id,index)=>write(s,id,String(index*10)));
    write(s,'mental','0',s.order[1]);write(s,'physical','13',s.order[1]);
    write(s,'effort','10',s.order[1]);s.responses.at(-1)!.skipped=true;
    const [complete,partial,unplayed]=pilotRatings(s);
    expect(complete).toMatchObject({period:1,condition:'sequential',overall:6,mental:0,frustration:50,tlxItemsAnswered:6,rawTLX:25});
    expect(partial).toMatchObject({period:2,condition:'random',overall:null,mental:0,physical:null,effort:null,tlxItemsAnswered:1,rawTLX:null});
    expect(unplayed).toMatchObject({period:3,condition:'gaze',tlxItemsAnswered:0,rawTLX:null});
  });

  it('exports the actual card geometry, joined gaze, condition, frozen prompts, and seed and reads the unchanged P snapshot from ZIP',()=>{
    const s=setup();
    emit(s,1000,true);emit(s,1040,false);emit(s,1090,null);
    s.config.paintings[0].interview[0]='归档时的问题措辞';
    write(s,'overall','7');write(s,'compare','没有明显区别',null,'interview');
    const files=buildTextExportFiles(s);
    for(const name of [...PILOT_DATA_FILES,'gaze_samples.csv','background.csv','session.json','phase_events.csv','responses.csv','validation.csv']) expect(files[name]).toBeDefined();
    const snapshot=JSON.parse(strFromU8(files['session.json']));
    expect(snapshot.pilot.seed).toBe(12345);
    expect(snapshot.exportMetadata.cardObservation.maxIntervalMs).toBe(150);
    expect(strFromU8(files['gaze_samples.csv'])).toContain('condition,cardExposureId,cardId,onCard,imageAoiId,trialActiveMs');
    expect(strFromU8(files['card_exposures.csv'])).toContain(s.cardExposures![0].cardId);
    expect(strFromU8(files['card_attention.csv'])).toContain('onCardMs,offCardMs,onCardShare,observationCoverage');
    expect(strFromU8(files['pilot_ratings.csv'])).toContain('顺序讲解');
    expect(strFromU8(files['responses.csv'])).toContain('归档时的问题措辞');
    const restored=readSessionArchive(zipSync(files),'results.zip');
    expect(restored).toEqual(snapshot);
    expect(cardAttention(restored)).toEqual(cardAttention(s));
    expect(read(setup('P36')).participantId).toBe('P36');
  });

  it('rejects contradictory joins, overlaps, a mismatched frozen schedule, and missing exposure geometry',()=>{
    const s=setup();emit(s,1000,true);
    s.samples[0].onCard=false;
    expect(()=>read(s)).toThrow('原始坐标');
    s.samples[0].onCard=true;
    s.cardExposures!.push({...s.cardExposures![0],exposureId:'overlap',shownMs:1010});
    expect(()=>read(s)).toThrow('卡片曝光');
    s.cardExposures!.pop();s.cardExposures![0].rect.width=-1;
    expect(()=>read(s)).toThrow('卡片曝光');
    s.cardExposures![0].rect.width=40;s.order.reverse();
    expect(()=>read(s)).toThrow('观看顺序');
  });

  it('labels rehearsal files and restores the recorded P00 session for local review',async()=>{
    const s=setup('P00');
    emit(s,1010,true);emit(s,1050,false);write(s,'overall','5');
    const files=buildTextExportFiles(s);
    expect(exportPrefix(s)).toMatch(/^rehearsal_P00_/);
    const restored=readSessionArchive(zipSync(files),'rehearsal_P00_test.zip');
    expect(restored.pilot).toEqual(s.pilot);
    expect(restored.order).toEqual(['ming-xingle-cuju','ming-xingle-polo','ming-xingle-archery']);
    expect(restored.samples).toEqual(s.samples);
    expect(restored.cardExposures).toEqual(s.cardExposures);
    expect(restored.responses).toEqual(s.responses);
    const snapshot=JSON.parse(strFromU8(files['session.json']));
    expect(snapshot.exportMetadata).toMatchObject({sessionRole:'researcher_rehearsal',includeInStudyAnalysis:false});
    for(const [name,data] of Object.entries(files).filter(([key])=>key.endsWith('.csv'))){
      expect(strFromU8(data).split('\r\n')[0],name).toMatch(/,sessionRole,includeInStudyAnalysis$/);
    }
    expect(strFromU8(files['gaze_samples.csv'])).toContain(',researcher_rehearsal,false\r\n');
    expect(strFromU8(files['pilot_ratings.csv'])).toContain(',researcher_rehearsal,false\r\n');
    expect(await buildCorrectionExportFiles(s)).toEqual({});
    const participant=setup('P01');
    const survey=buildTextExportFiles(participant);
    expect(strFromU8(survey['pilot_ratings.csv'])).toContain(',participant,true\r\n');
    s.pilot!.practice=false;expect(()=>read(s)).toThrow();
    participant.pilot!.practice=true;expect(()=>read(participant)).toThrow();
  });

  it('round-trips each single-scene rehearsal, retaining the catalogue and limiting analyses to the selected scene',()=>{
    for(const painting of pilotConfig.paintings){
      for(const condition of ['sequential','random','gaze'] as const){
        const selected={paintingId:painting.paintingId,condition};
        const session=setup('P00',selected);
        emit(session,1020,true);
        const files=buildTextExportFiles(session);
        for(const [name,expected] of [['pilot_ratings.csv',1],['pilot_workload.csv',6],['pilot_recall.csv',3]] as const){
          const rows=strFromU8(files[name]).trim().split('\r\n').slice(1);
          expect(rows).toHaveLength(expected);
          expect(rows.every(row=>row.includes(selected.paintingId)&&row.includes(condition)&&row.endsWith('researcher_rehearsal,false'))).toBe(true);
        }
        const restored=readSessionArchive(zipSync(files),'single.zip');
        expect(restored.pilot?.plan).toEqual([selected]);
        expect(restored.order).toEqual([selected.paintingId]);
        expect(restored.config.paintings).toEqual(pilotConfig.paintings);
        const {heatmapRenders,scanpathRenders}=JSON.parse(strFromU8(files['session.json'])).exportMetadata;
        for(const renders of [heatmapRenders,scanpathRenders]){
          expect(renders.map((r:{paintingId:string})=>r.paintingId)).toEqual([selected.paintingId]);
        }
      }
    }
  });

  it('rejects single-scene participant plans, malformed practice plans and data from outside a selected scene',()=>{
    const p=setup('P00',{paintingId:'ming-xingle-polo',condition:'gaze'});
    const invalid=(mutate:(s:Session)=>void)=>{
      const copy=structuredClone(p);mutate(copy);expect(()=>read(copy)).toThrow();
    };
    invalid(s=>{s.participantId='P02';s.pilot!.practice=false});
    invalid(s=>{delete s.pilot!.rehearsalMode});
    invalid(s=>{s.pilot!.plan=[]});
    invalid(s=>{s.pilot!.plan[0].condition='bogus' as PilotTrial['condition']});
    invalid(s=>{s.pilot!.plan[0].paintingId='wrong'});
    invalid(s=>{s.pilot!.plan.push(s.pilot!.plan[0])});
    invalid(s=>{s.order=['ming-xingle-cuju']});
    invalid(s=>{s.geometries[0].paintingId='ming-xingle-cuju'});
  });

  it('preserves historical N archive columns',()=>{
    const files=buildTextExportFiles(sessionFixture());
    for(const name of PILOT_DATA_FILES)expect(files[name]).toBeUndefined();
    expect(strFromU8(files['gaze_samples.csv'])).not.toContain('cardExposureId');
    expect(strFromU8(files['gaze_samples.csv'])).not.toContain('includeInStudyAnalysis');
  });
});
