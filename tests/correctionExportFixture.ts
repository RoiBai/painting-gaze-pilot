/** Synthetic calibration observations for export tests only; never imported by production. */
import {sessionFixture,sampleFixture} from './dataFixtures';
import {containGeometry,mapPoint} from '../src/geometry';
import {defaultScanpath} from '../src/scanpath';
import type {ValidationRow} from '../src/types';

export function correctionExportFixture(){
  const session=sessionFixture();
  session.quality='low_quality';
  session.qualityNotes=['AUTOMATED CORRECTION EXPORT FIXTURE; NOT PARTICIPANT DATA'];
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#eeeeee"/></svg>';
  for(const painting of session.config.paintings)painting.image='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  session.scanpath={...defaultScanpath,width:320};
  const geometry=containGeometry({version:1,paintingId:'A',timeMs:10000,viewportWidth:1200,viewportHeight:800,dpr:2,naturalWidth:1200,naturalHeight:800,box:{left:0,top:0,width:1200,height:800}});
  session.geometries=[geometry];
  session.timings=[{trialId:'A-1',paintingId:'A',startedMs:10000,endedMs:11000,wallMs:1000,activeMs:1000,status:'completed'}];
  const sample=(index:number,x:number|null,y:number|null)=>sampleFixture({sampleIndex:index,callbackTimeMs:10000+index*100,viewportX:x,viewportY:y,predictionAvailable:x!==null&&y!==null,...mapPoint(x,y,geometry)});
  session.samples=[sample(0,350,390),sample(1,null,null),sample(2,650,390),sample(3,950,390)];
  const addRun=(runId:string,kind:'validation'|'drift',targets:number[][],dx:number,dy:number,start:number)=>{
    const records:ValidationRow[]=targets.flatMap(([x,y],targetIndex)=>Array.from({length:12},(_,sampleIndex)=>({
      sessionId:session.sessionId,participantId:session.participantId,paintingId:'A',kind,runId,calibrationVersion:1,targetId:String(targetIndex),targetX:x,targetY:y,viewportWidth:1200,viewportHeight:800,timeMs:start+targetIndex*100+sampleIndex,predictionX:x+dx,predictionY:y+dy,errorPx:Math.hypot(dx,dy),settling:false,training:false,
    })));
    session.validation.push(...records);
    session.validationSummaries.push({runId,kind,calibrationVersion:1,targets:targets.map((_,i)=>({targetId:String(i),n:12,medianErrorPx:Math.hypot(dx,dy)})),medianErrorPx:Math.hypot(dx,dy),errorDiagonalRatio:Math.hypot(dx,dy)/Math.hypot(1200,800),status:'pass'});
  };
  addRun('fixture-validation','validation',[[300,224],[900,224],[600,400],[300,576],[900,576]],40,-30,1000);
  addRun('fixture-drift','drift',[[240,400],[600,400],[960,400]],50,-10,7000);
  return session;
}
