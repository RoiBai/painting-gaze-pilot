import {describe,expect,it} from 'vitest';
import {archerySampleLookup,arrowPhaseWindows,reviewWindows,segmentTrace} from '../src/pilotSegments';
import {segmentFixture} from './pilotSegmentFixture';
import {sampleFixture} from './dataFixtures';
import type {PaperGuideLayout} from '../src/paperGuide';
import {buildTextExportFiles} from '../src/export';
import {strFromU8} from 'fflate';

describe('viewport review of actual card and blank exposures',()=>{
  it('uses observed times, including resumed second card and interruption inside a blank',()=>{
    const s=segmentFixture(),trial=s.timings[0];
    const windows=reviewWindows(s,trial);
    expect(windows.map(w=>[w.start,w.end,w.exposure?.slot??null])).toEqual([
      [100,1100,null],[1100,1800,1],[1800,2400,null],[2400,3100,2],[3700,4200,2],[4200,5000,null]
    ]);
    const second=segmentTrace(s,trial,windows[3]),blank=segmentTrace(s,trial,windows[2]);
    expect(second.toPainting).toBe(1);expect(second.toCard).toBe(1);
    expect(second.points.map(p=>p.region)).toEqual(['card','other','painting','card','missing','painting','card','offscreen','painting']);
    expect(second.points.map(p=>p.connects)).toEqual([false,true,true,true,false,false,false,false,false]);
    expect(blank.points.map(p=>p.sample.callbackTimeMs)).toEqual([2100]);
    s.events.push({...s.events[0],timeMs:4400,type:'pause'});
    expect(reviewWindows(s,trial).at(-1)?.end).toBe(4400);
  });
  it('never joins a missing sample, repeated trial, or calibration change into a transition',()=>{
    const s=segmentFixture(),trial=s.timings[0];
    const period=reviewWindows(s,trial).find(w=>w.exposure?.exposureId==='second-a')!;
    s.samples.find(p=>p.callbackTimeMs===2420)!.trialId='previous-attempt';
    s.samples.find(p=>p.callbackTimeMs===2470)!.calibrationVersion++;
    const trace=segmentTrace(s,trial,period);
    expect(trace.toPainting).toBe(0);expect(trace.toCard).toBe(0);
    expect(trace.points.some(p=>p.sample.trialId==='previous-attempt')).toBe(false);
  });
});

describe('v7 arrow phases and the original target region',()=>{
  function archeryFixture(){
    const session=segmentFixture(),scene=session.config.paintings.find(p=>p.paintingId==='ming-xingle-archery')!;
    scene.materialVersion='ming-uci-collage-v7';
    session.samples=[];session.events=[];session.order=[scene.paintingId];
    const trial=session.timings[0];
    Object.assign(trial,{paintingId:scene.paintingId,endedMs:15100,activeMs:15000,wallMs:15000});
    const geometry=session.geometries[0];geometry.paintingId=scene.paintingId;
    const arrow=session.cardExposures![0],target=session.cardExposures![1];
    const box={left:500,top:100,width:300,height:200};
    const layout:PaperGuideLayout={style:'single-board',reveal:'arrow-release',impact:{x:234,y:385},source:box,art:box,backing:box,
      bounds:box,panel:box,viewport:{width:1000,height:800},type:{pad:3,titleSize:24,bodySize:14,title:[2],body:[5]}};
    Object.assign(arrow,{paintingId:scene.paintingId,cardId:'archery-figma-1-6',shownMs:300,hiddenMs:10300});
    arrow.paper={durationMs:10000,offsetMs:0,reducedMotion:false,layout,arrowLandedAtMs:9150};
    Object.assign(target,{paintingId:scene.paintingId,cardId:'archery-figma-0-6',shownMs:12400,hiddenMs:14300});
    session.cardExposures=[arrow,target];
    const [l,t,w,h]=scene.aois.find(a=>a.id==='figma-0-6')!.rect;
    const u=l+w/2,v=t+h/2;
    const samples=[7480,7600,7650,9101,9150,10310,10360,10410,12500,14340].map((time,i)=>{
      const exposure=time<10300?arrow:time===12500?target:null;
      return sampleFixture({sessionId:session.sessionId,participantId:session.participantId,paintingId:scene.paintingId,trialId:trial.trialId,
        geometryVersion:geometry.version,calibrationVersion:1,sampleIndex:i,callbackTimeMs:time,viewportX:u*1000,viewportY:300,
        imageNormX:u,imageNormY:v,imageAoiId:'figma-0-6',cardExposureId:exposure?.exposureId??null,cardId:exposure?.cardId??null,
        onCard:exposure?true:null});
    });
    samples[7].predictionAvailable=false;samples[7].viewportX=null;samples[7].viewportY=null;
    session.samples=samples;
    return {session,trial,arrow,samples,target};
  }

  it('keeps tracking the original spatial region during flight and in the uninterrupted blank after actual landing',()=>{
    const {session,trial,arrow,samples}=archeryFixture();
    const lookup=archerySampleLookup(session);
    expect(samples.map(s=>lookup(s).archeryPhase)).toEqual([
      'arrow_explanation','arrow_flight','arrow_flight','arrow_flight','arrow_landed','post_impact_no_card','post_impact_no_card','post_impact_no_card','target_card','no_card',
    ]);
    expect(lookup(samples[1]).gazeInOriginalTargetAoi).toBe(true);
    expect(lookup({...samples[1],imageNormX:.9}).gazeInOriginalTargetAoi).toBe(false);
    expect(lookup(samples[7]).gazeInOriginalTargetAoi).toBeNull();
    expect(lookup({...samples[7],paused:true}).archeryPhase).toBeNull();
    const whole=reviewWindows(session,trial).find(w=>w.exposure===arrow)!;
    const slices=arrowPhaseWindows(whole);
    expect(slices.map(w=>w.archeryPhase)).toEqual(['arrow_explanation','arrow_flight','arrow_landed']);
    expect(slices.flatMap(w=>segmentTrace(session,trial,w).points.map(p=>p.sample.sampleIndex)))
      .toEqual(segmentTrace(session,trial,whole).points.map(p=>p.sample.sampleIndex));
    const blank=reviewWindows(session,trial).find(w=>w.archeryPhase==='post_impact_no_card')!;
    expect(segmentTrace(session,trial,blank)).toMatchObject({targetSampleCount:2,targetValidCount:2,targetMs:50});
    const csv=strFromU8(buildTextExportFiles(session)['gaze_samples.csv']);
    expect(csv).toContain('archeryPhase,gazeInOriginalTargetAoi');
    expect(csv).toContain(',arrow_flight,true,');
    expect(csv).toContain(',post_impact_no_card,,');
  });
  it('splits a resumed arrow from its offset, records no flight for reduced motion, and preserves archived output',()=>{
    const {session,trial,arrow}=archeryFixture();
    arrow.paper!.offsetMs=8000;arrow.hiddenMs=1800;arrow.paper!.arrowLandedAtMs=1150;
    let whole=reviewWindows(session,trial).find(w=>w.exposure===arrow)!;
    expect(arrowPhaseWindows(whole).map(w=>w.archeryPhase)).toEqual(['arrow_flight','arrow_landed']);
    arrow.paper!.reducedMotion=true;arrow.paper!.offsetMs=0;arrow.paper!.arrowLandedAtMs=undefined;
    expect(arrowPhaseWindows(whole).map(w=>w.archeryPhase)).toEqual(['arrow_explanation']);
    expect(reviewWindows(session,trial).some(w=>w.archeryPhase==='post_impact_no_card')).toBe(false);
    arrow.paper!.arrowLandedAtMs=1140;
    expect(arrowPhaseWindows(whole).map(w=>w.archeryPhase)).toEqual(['arrow_explanation','arrow_landed']);
    const eventScope={paintingId:trial.paintingId,sessionId:session.sessionId,participantId:session.participantId,phase:'free_view' as const,detail:'{}'};
    session.events.push({...eventScope,timeMs:1800,type:'pause'}, {...eventScope,timeMs:1900,type:'resume'});
    expect(reviewWindows(session,trial).some(w=>w.archeryPhase==='post_impact_no_card')).toBe(false);
    session.config.paintings.find(p=>p.paintingId===trial.paintingId)!.materialVersion='ming-uci-collage-v6';
    whole=reviewWindows(session,trial).find(w=>w.exposure===arrow)!;
    expect(arrowPhaseWindows(whole)).toEqual([]);
    expect(strFromU8(buildTextExportFiles(session)['gaze_samples.csv'])).not.toContain('archeryPhase');
  });
});
