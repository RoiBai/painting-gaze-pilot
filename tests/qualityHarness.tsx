// Browser component fixture only. Never imported by production code or saved as a study session.
import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import Quality from '../src/ValidationReview';
import type {StudyEngine} from '../src/engine';
import {sessionFixture} from './dataFixtures';
export function mountQuality(status:'judgment'|'fail'){
 const session=sessionFixture();session.quality='pending';session.config.validation.minSamplesPerTarget=5;
 session.validationSummaries=[{runId:'component-test',kind:'validation',calibrationVersion:1,targets:[{targetId:'0',n:status==='fail'?0:12,medianErrorPx:status==='fail'?null:22}],medianErrorPx:status==='fail'?null:22,errorDiagonalRatio:status==='fail'?null:.02,status}];
 const original=document.getElementById('root');if(original)original.style.display='none';
 const host=document.createElement('div');host.id='quality-test';document.body.appendChild(host);
 const engine={session,camera:{status:'ready',message:'TEST COMPONENT FIXTURE'},acceptQuality:(low:boolean)=>{host.dataset.decision=low?'low_quality':'unassessed'},calibrate:async()=>{},startCamera:async()=>{}} as unknown as StudyEngine;
 createRoot(host).render(createElement(Quality,{engine}));
}
