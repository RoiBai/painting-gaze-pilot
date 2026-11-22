import {hitGuide,type GuideCard} from './cutoutCard';
import {hitPaperGuide} from './paperGuide';
import type {CardExposure} from './types';

export const PAPER_MATERIAL='ming-uci-collage-v2';

// Only the entrance and exit require smooth motion. Use the same frame clock in
// the experiment, hit testing, and replay, leaving time for webcam inference.
export function paperTime(elapsed:number,duration:number){
  if(elapsed>=duration)return duration;
  const step=elapsed<1500||duration-elapsed<800?1000/30:1000/12;
  return Math.max(0,Math.floor(elapsed/step)*step);
}

export function cardHitAt(x:number,y:number,exposure:CardExposure,time:number,card:GuideCard){
  const elapsed=time-exposure.shownMs;
  const paper=exposure.paper;
  if(paper){
    return hitPaperGuide(x,y,card,paper.layout,paperTime(paper.offsetMs+elapsed,paper.durationMs),paper.durationMs,paper.reducedMotion);
  }
  return hitGuide(x,y,exposure.rect,elapsed,exposure.entranceMs,card.art,exposure.entranceRect);
}
