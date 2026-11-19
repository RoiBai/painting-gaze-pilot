import {useLayoutEffect,useRef} from 'react';
import type {StudyEngine} from './engine';
import type {Painting} from './types';

export function PilotCard({engine,card,painting}:{engine:StudyEngine;card:Painting['cards'][number];painting:Painting}){
  const ref=useRef<HTMLElement>(null);
  const geometry=engine.geometry;
  const aoi=painting.aois.find(region=>card.aoiIds.includes(region.id));
  useLayoutEffect(()=>{
    const element=ref.current;
    if(!element)return;
    function measure(){
      if(element?.isConnected)engine.cardShown(element.getBoundingClientRect(),card.id);
    }
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(element);
    return ()=>{observer.disconnect();engine.cardHidden(card.id)};
  },[engine,card.id,geometry?.version]);
  if(!geometry||!aoi)return null;
  const width=Math.min(330,geometry.viewportWidth-32);
  const middle=geometry.left+(aoi.rect[0]+aoi.rect[2]/2)*geometry.width;
  const left=Math.max(12,Math.min(geometry.viewportWidth-width-12,middle-width/2));
  // Anchor the card to its region horizontally, using the margin above or below
  // the painting where possible. The measured article is the hit-test target.
  const lower=aoi.rect[1]+aoi.rect[3]/2>=0.50;
  const separation=12;
  const vertical=lower?{top:Math.min(geometry.top+geometry.height+separation,geometry.viewportHeight-145)}:
    {bottom:Math.min(geometry.viewportHeight-geometry.top+separation,geometry.viewportHeight-145)};
  return <article className="pilot-card" ref={ref} data-card={card.id} style={{width,left,...vertical}}>
    <h2>{card.title}</h2><p>{card.text}</p>
  </article>;
}
