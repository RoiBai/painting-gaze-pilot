import type {CardExposure, GazeSample, Session} from './types';
import {TLX_DIMENSIONS} from './pilotSurveyRecords';
export {TLX_DIMENSIONS};

export const CONDITION_LABELS = {sequential:'顺序讲解', random:'随机讲解', gaze:'眼动讲解'} as const;
export const ATTENTION_MAX_GAP_MS = 150;

function countExposure(session:Session, exposure:CardExposure) {
  let callbacks = 0;
  let validSamples = 0;
  let onCardSamples = 0;
  let observedMs = 0;
  let onCardMs = 0;
  let previous:GazeSample|null = null;
  for (const sample of session.samples) {
    const time = sample.callbackTimeMs;
    if (sample.cardExposureId !== exposure.exposureId || sample.trialId !== exposure.trialId
      || sample.paintingId !== exposure.paintingId || sample.condition !== exposure.condition
      || sample.sessionId !== session.sessionId || sample.participantId !== session.participantId
      || sample.geometryVersion !== exposure.geometryVersion || sample.calibrationVersion !== exposure.calibrationVersion
      || time < exposure.shownMs || (exposure.hiddenMs !== null && time > exposure.hiddenMs)
      || sample.phase !== 'free_view' || sample.paused) {
      previous = null;
      continue;
    }
    callbacks++;
    if (!sample.predictionAvailable || !Number.isFinite(sample.viewportX) || !Number.isFinite(sample.viewportY)
      || typeof sample.onCard !== 'boolean') {
      previous = null;
      continue;
    }
    validSamples++;
    if (sample.onCard) onCardSamples++;
    if (previous && previous.sampleIndex + 1 === sample.sampleIndex) {
      const interval = time - previous.callbackTimeMs;
      if (interval > 0 && interval <= ATTENTION_MAX_GAP_MS) {
        observedMs += interval;
        // On a crossing the exact boundary time is unknown. Allocate half of this short interval to each endpoint.
        onCardMs += interval * (Number(previous.onCard) + Number(sample.onCard)) / 2;
      }
    }
    previous = sample;
  }
  const visibleMs = exposure.hiddenMs === null ? null : exposure.hiddenMs - exposure.shownMs;
  return {
    sessionId:session.sessionId, participantId:session.participantId, quality:session.quality,
    exposureId:exposure.exposureId, trialId:exposure.trialId, paintingId:exposure.paintingId,
    condition:exposure.condition, cardId:exposure.cardId, slot:exposure.slot,
    shownMs:exposure.shownMs, hiddenMs:exposure.hiddenMs, visibleMs, callbacks, validSamples, onCardSamples,
    observedMs, onCardMs:observedMs > 0 ? onCardMs : null,
    offCardMs:observedMs > 0 ? observedMs - onCardMs : null,
    onCardShare:observedMs > 0 ? onCardMs / observedMs : null,
    observationCoverage:visibleMs !== null && visibleMs > 0 ? observedMs / visibleMs : null,
  };
}

export function cardAttention(session:Session) {
  return (session.cardExposures ?? []).map(exposure => countExposure(session, exposure));
}

export function pilotRatings(session:Session) {
  return (session.pilot?.plan ?? []).map(({paintingId,condition},index) => {
    const responses = session.responses.filter(row => row.paintingId === paintingId && row.phase === 'pre'
      && row.sessionId === session.sessionId && row.participantId === session.participantId);
    function value(id:string, min:number, max:number, step:number) {
      const row = responses.findLast(response => response.questionId === id);
      if (!row || row.skipped || row.unknown || !row.answer.trim()) return null;
      const score = Number(row.answer);
      return Number.isInteger(score) && score >= min && score <= max && (score-min)%step === 0 ? score : null;
    }
    const survey=session.pilotSurveys?.[paintingId];
    const [mental,physical,temporal,performance,effort,frustration] = TLX_DIMENSIONS.map(key=>survey ? survey.workload[key]??null : value(key,0,100,5));
    const scales = [mental,physical,temporal,performance,effort,frustration];
    const complete = scales.filter((v):v is number => v !== null);
    return {
      sessionId:session.sessionId, participantId:session.participantId, sessionStatus:session.status, quality:session.quality,
      questionVersion:session.config.pilotSurveyVersion??session.pilot!.version, period:index+1, paintingId, condition, conditionLabel:CONDITION_LABELS[condition],
      trialIds:JSON.stringify(session.timings.filter(t=>t.paintingId===paintingId).map(t=>t.trialId)),
      overall:value('overall',1,7,1), mental, physical, temporal, performance, effort, frustration,
      tlxItemsAnswered:complete.length, rawTLX:complete.length===6 ? complete.reduce((a,b)=>a+b,0)/6 : null,
    };
  });
}
