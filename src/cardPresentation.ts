import {hitGuide,type GuideCard} from './cutoutCard';
import {hitPaperGuide,type PaperGuideLayout} from './paperGuide';
import type {CardExposure} from './types';

export const LEGACY_PAPER_MATERIAL='ming-uci-collage-v2';
export const PAPER_MATERIAL='ming-uci-collage-v3';

export function hasPaperLayout(version:string){
  return version===PAPER_MATERIAL || version===LEGACY_PAPER_MATERIAL;
}

// Hold the reading pose at a lower cadence, then follow the small arrow's return
// and flight at the same higher cadence used for entrances and exits.
export function paperTime(elapsed:number,duration:number,layout:PaperGuideLayout|null){
  if(elapsed>=duration)return duration;
  const arrowRelease=layout?.reveal==='explain-then-shoot' && elapsed>=duration*.62;
  const step=elapsed<1500||duration-elapsed<800||arrowRelease?1000/30:1000/12;
  return Math.max(0,Math.floor(elapsed/step)*step);
}

export function cardHitAt(x:number,y:number,exposure:CardExposure,time:number,card:GuideCard){
  const elapsed=time-exposure.shownMs;
  const paper=exposure.paper;
  if(paper){
    return hitPaperGuide(x,y,card,paper.layout,paperTime(paper.offsetMs+elapsed,paper.durationMs,paper.layout),paper.durationMs,paper.reducedMotion);
  }
  return hitGuide(x,y,exposure.rect,elapsed,exposure.entranceMs,card.art,exposure.entranceRect);
}
