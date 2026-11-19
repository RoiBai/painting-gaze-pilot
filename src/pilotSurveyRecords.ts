import type {Session} from './types';

export const TLX_DIMENSIONS = ['mental','physical','temporal','performance','effort','frustration'] as const;

export function surveyContext(session:Session, paintingId:string){
  const survey=session.pilotSurveys?.[paintingId];
  const trialId=survey?.trialId??session.timings.findLast(t=>t.paintingId===paintingId)?.trialId??null;
  const exposures=(session.cardExposures??[]).filter(e=>e.paintingId===paintingId&&e.trialId===trialId);
  const cards=[...new Set([...exposures].sort((a,b)=>a.shownMs-b.shownMs).map(e=>e.cardId))];
  const fields={
    participantId:session.participantId,sessionId:session.sessionId,paintingId,trialId,
    period:session.order.indexOf(paintingId)+1,condition:session.pilot?.plan.find(p=>p.paintingId===paintingId)?.condition,
    questionVersion:session.config.pilotSurveyVersion,actualCardOrder:JSON.stringify(cards),
  };
  return {survey,fields,cards,exposures};
}

export function recallRows(session:Session){
  return session.order.flatMap(paintingId=>{
    const painting=session.config.paintings.find(p=>p.paintingId===paintingId);
    const {survey,fields,cards,exposures}=surveyContext(session,paintingId);
    const submitted=survey?.recallSubmittedMs!=null;
    const rows=(painting?.recallQuestions??[]).map((q,i)=>{
      const answer=survey?.recall[q.id];
      const cardIndex=cards.indexOf(q.cardId);
      return {...fields,page:'recall',questionIndex:i+1,questionId:q.id,questionPrompt:q.prompt,
        cardId:q.cardId,cardPresentationOrder:cardIndex===-1?null:cardIndex+1,
        cardSlot:exposures.find(e=>e.cardId===q.cardId)?.slot??null,
        answer:answer?.text??'',rememberUnknown:answer?.unknown??null,
        submittedMs:survey?.recallSubmittedMs??null,submittedUtc:utcFor(session,survey?.recallSubmittedMs),
        manualScore:submitted?(survey?.manualScores?.[q.id]??null):null};
    });
    const sceneScore=rows.length===3&&rows.every(r=>r.manualScore!=null)?rows.reduce((sum,r)=>sum+r.manualScore!,0):null;
    return rows.map(row=>({...row,sceneRecallScore:sceneScore}));
  });
}

export function workloadRows(session:Session){
  return session.order.flatMap(paintingId=>{
    const painting=session.config.paintings.find(p=>p.paintingId===paintingId);
    const {survey,fields}=surveyContext(session,paintingId);
    return TLX_DIMENSIONS.map((id,i)=>({...fields,page:'workload',questionIndex:i+1,questionId:id,
      questionPrompt:painting?.pre.find(q=>q.id===id)?.prompt??'',answer:survey?.workload[id]??null,
      submittedMs:survey?.workloadSubmittedMs??null,submittedUtc:utcFor(session,survey?.workloadSubmittedMs)}));
  });
}

function utcFor(session:Session,relative:number|null|undefined){
  return relative==null?null:new Date(session.timeOrigin+relative).toISOString();
}
