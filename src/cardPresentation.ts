import {hitGuide,type GuideCard} from './cutoutCard';
import {hitPaperGuide,type PaperEdition,type PaperGuideLayout} from './paperGuide';
import type {CardExposure} from './types';

export const LEGACY_PAPER_MATERIAL='ming-uci-collage-v2';
export const PRIOR_PAPER_MATERIAL='ming-uci-collage-v3';
export const V5_PAPER_MATERIAL='ming-uci-collage-v5';
export const V6_PAPER_MATERIAL='ming-uci-collage-v6';
export const PAPER_MATERIAL='ming-uci-collage-v7';

const paperReleases=new Map<string,{edition?:PaperEdition;app?:string}>([
  [LEGACY_PAPER_MATERIAL,{edition:'legacy'}],
  [PRIOR_PAPER_MATERIAL,{edition:'v3',app:'3.2.0'}],
  ['ming-uci-collage-v4',{edition:'v4',app:'3.3.0'}],
  [V5_PAPER_MATERIAL,{edition:'v5',app:'3.3.1'}],
  [V6_PAPER_MATERIAL,{edition:'v6',app:'3.3.2'}],
  [PAPER_MATERIAL,{app:'3.4.0'}],
]);

export function paperEdition(version:string){return paperReleases.get(version)?.edition}
export function paperAppVersion(version:string){return paperReleases.get(version)?.app}

export function timedPaperExit(layout:PaperGuideLayout|null){
  return layout?.reveal==='explain-then-shoot'||layout?.reveal==='archer-release'||layout?.reveal==='polo-swing'
    ||layout?.reveal==='arrow-release'||layout?.reveal==='archer-draw';
}

export function hasPaperLayout(version:string){
  return paperReleases.has(version);
}

// Hold the reading pose at a lower cadence, then follow the small arrow's return
// and flight at the same higher cadence used for entrances and exits.
export function paperTime(elapsed:number,duration:number,layout:PaperGuideLayout|null){
  if(elapsed>=duration)return duration;
  const arrowRelease=timedPaperExit(layout) && elapsed>=duration*.62;
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
