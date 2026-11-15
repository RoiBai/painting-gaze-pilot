// Deterministic browser-only correction fixture. Never imported by production.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import Results from '../src/Results';
import {sessionFixture,sampleFixture} from './dataFixtures';
import {summarizeValidation} from '../src/validation';
import type {Session,ValidationRow} from '../src/types';

export function correctionFixture():Session {
 const session=sessionFixture('correction-fixture');
 session.quality='low_quality';session.qualityNotes=['自动化校正测试示意；保留原始低质量标记'];
 session.config.validation={maxMedianErrorPx:250,maxErrorDiagonalRatio:.1,maxTargetMedianErrorPx:200,minSamplesPerTarget:10,targetDurationMs:2500,settleMs:700};
 const image='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#deded2"/></svg>');
 for(const painting of session.config.paintings){painting.title=`校正测试 ${painting.paintingId}（非参与者数据）`;painting.image=image;}
 session.geometries=[{version:1,paintingId:'A',timeMs:5000,viewportWidth:1200,viewportHeight:800,dpr:2,naturalWidth:1200,naturalHeight:800,left:0,top:0,width:1200,height:800,scale:1}];
 session.timings=[{trialId:'A-1',paintingId:'A',startedMs:5000,endedMs:7000,wallMs:2000,activeMs:2000,status:'completed'}];
 session.samples=Array.from({length:20},(_,i)=>{
  const x=100+i*40,y=250+(i%3)*70;
  return sampleFixture({sessionId:session.sessionId,sampleIndex:i,callbackTimeMs:5000+i*100,viewportX:i===8?null:x,viewportY:i===8?null:y,imageX:i===8?null:x,imageY:i===8?null:y,imageNormX:i===8?null:x/1200,imageNormY:i===8?null:y/800,predictionAvailable:i!==8,insideImage:i!==8});
 });
 const addRun=(kind:'validation'|'drift',targets:number[][],start:number)=>{
  const runId=`fixture-${kind}`;
  const rows:ValidationRow[]=targets.flatMap(([x,y],i)=>Array.from({length:12},(_,n)=>{
   const px=kind==='drift'?x-18:.9*x+30,py=kind==='drift'?y-28:.9*y+20;
   return {sessionId:session.sessionId,participantId:session.participantId,paintingId:'A',kind,runId,calibrationVersion:1,targetId:String(i),targetX:x,targetY:y,viewportWidth:1200,viewportHeight:800,timeMs:start+i*100+n,predictionX:px,predictionY:py,errorPx:Math.hypot(px-x,py-y),settling:false,training:false};
  }));
  session.validation.push(...rows);
  session.validationSummaries.push(summarizeValidation(rows,session.config.validation,targets.map((_,i)=>String(i)),runId,kind,1));
 };
 addRun('validation',[[300,224],[900,224],[600,400],[300,576],[900,576]],1000);
 addRun('drift',[[240,400],[600,400],[960,400]],3000);
 return session;
}

export function mountCorrectionResults(){
 const session=correctionFixture();
 const probe={initial:structuredClone(session),current:session};
 (window as unknown as {__correctionProbe:typeof probe}).__correctionProbe=probe;
 const old=document.getElementById('root');if(old)old.style.display='none';
 const host=document.createElement('div');document.body.appendChild(host);
 function Harness(){const [current,setCurrent]=useState(session);return <Results session={current} onChange={s=>{probe.current=s;setCurrent(s)}} onBack={()=>{}}/>}
 createRoot(host).render(<Harness/>);
}
