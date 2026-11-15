// Browser-only fixture. It never enters the production app or IndexedDB.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import Results from '../src/Results';
import {sessionFixture,sampleFixture} from './dataFixtures';
export function mountResults(options:{secondImage?:string}={}){
 const session=sessionFixture();session.qualityNotes=['自动化测试示意，非参与者数据'];
 for(const painting of session.config.paintings){painting.title='自动化测试示意（非参与者数据）';painting.image='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#deded2"/></svg>')}
 if(options.secondImage)session.config.paintings[1].image=options.secondImage;
 session.timings=[{trialId:'A-1',paintingId:'A',startedMs:0,endedMs:2000,wallMs:2000,activeMs:2000,status:'completed'}];
 session.samples=Array.from({length:20},(_,i)=>sampleFixture({sampleIndex:i,callbackTimeMs:i*100,imageNormX:.1+i*.04,imageNormY:.25+(i%3)*.1,imageX:(.1+i*.04)*1200,imageY:(.25+(i%3)*.1)*800,predictionAvailable:i!==8,viewportX:i===8?null:100+i*20}));
 const old=document.getElementById('root');if(old)old.style.display='none';const host=document.createElement('div');document.body.appendChild(host);
 function Harness(){const [current,setCurrent]=useState(session);return <Results session={current} onChange={setCurrent} onBack={()=>{}}/>}
 createRoot(host).render(<Harness/>);
}
