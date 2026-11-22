import {sessionFixture} from './dataFixtures';
import {pilotConfig} from '../src/pilotMaterials';
import {buildPilotPlan,PILOT_VERSION,SELECTION_RULES} from '../src/pilotProtocol';
import {surveyForScene,submitSurveyPage,workloadIds} from '../src/pilotSurvey';
import type {Session,StudyConfig} from '../src/types';

export function pilot2SurveyFixture(participantId:'P00'|'P02'='P02',config:StudyConfig=pilotConfig):Session{
  const session=sessionFixture();
  const plan=buildPilotPlan(participantId);
  session.participantId=participantId;
  session.config=structuredClone(config);
  session.pilot={version:PILOT_VERSION,practice:participantId==='P00',plan,seed:123,selectionRules:{...SELECTION_RULES}};
  session.order=plan.map(t=>t.paintingId);
  session.cardExposures=[];
  session.timings=[];
  session.geometries=[];
  session.responses=[];
  session.status='completed';
  session.phase='completed';
  for(const [i,{paintingId,condition}] of plan.entries()){
    const scene=session.config.paintings.find(p=>p.paintingId===paintingId)!;
    const trialId='trial-'+i;
    const start=i*80000+1000;
    session.timings.push({trialId,paintingId,startedMs:start,endedMs:start+60000,wallMs:60000,activeMs:60000,status:'completed'});
    session.geometries.push({version:i+1,paintingId,timeMs:start,viewportWidth:1200,viewportHeight:900,dpr:1,naturalWidth:scene.width,naturalHeight:scene.height,left:0,top:300,width:1200,height:300,scale:1200/scene.width});
    const slotMs=60_000/scene.cards.length;
    for(const [j,card] of [...scene.cards].reverse().entries()){
      session.cardExposures.push({trialId,paintingId,condition,cardId:card.id,exposureId:'exposure-'+i+'-'+j,
        slot:j+1,selectionSource:condition,selectionReason:'test',validSelectionSamples:0,dwellMs:0,selectionAoiId:null,candidateCardIds:scene.cards.map(c=>c.id),
        geometryVersion:i+1,calibrationVersion:1,rect:{left:15,top:15,width:300,height:100},activeStartMs:(j+0.15)*slotMs,
        shownMs:start+(j+0.15)*slotMs,hiddenMs:start+(j+0.95)*slotMs});
    }
    const survey=surveyForScene(session,scene);
    for(const id of workloadIds)survey.workload[id]=0;
    submitSurveyPage(session,scene,'workload',start+60100);
    scene.recallQuestions!.forEach((q,index)=>{
      survey.recall[q.id]=index===1?{unknown:true,text:''}:{unknown:false,text:'参与者原文，\n含"引号"'};
    });
    submitSurveyPage(session,scene,'recall',start+62000);
  }
  return session;
}
