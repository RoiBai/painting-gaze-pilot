import {useLayoutEffect,useRef,useState} from 'react';
import {makePaperGuide,drawPaperGuide} from './paperGuide';
import {hasPaperLayout,LEGACY_PAPER_MATERIAL,paperTime} from './cardPresentation';
import {prepareCard} from './IllustratedStage';
import type {StudyEngine} from './engine';
import type {Painting,CardRect} from './types';
import {animatedRect,cardPosition,drawCutout,entranceDuration,entranceRect,loadCutout} from './cutoutCard';

interface Props {engine:StudyEngine;card:Painting['cards'][number];painting:Painting}
export function PilotCard(props:Props){
  if(props.card.art&&hasPaperLayout(props.painting.materialVersion))return <PaperCard {...props}/>;
  return props.card.art?<ArtCard {...props}/>:<TextCard {...props}/>;
}
function PaperCard({engine,card,painting}:Props){
  const wrapper=useRef<HTMLElement>(null),canvas=useRef<HTMLCanvasElement>(null);
  const geometry=engine.geometry;
  useLayoutEffect(()=>{
    const el=canvas.current,article=wrapper.current,ctx=el?.getContext('2d');
    const aoi=painting.aois.find(a=>card.aoiIds.includes(a.id));
    if(!el||!article||!ctx||!geometry||!aoi)return;
    let active=true,frame=0;
    const legacy=painting.materialVersion===LEGACY_PAPER_MATERIAL;
    void prepareCard(card,legacy).then(image=>{
      if(!active)return;
      const {viewportWidth:w,viewportHeight:h,dpr}=geometry;
      el.width=Math.round(w*dpr);el.height=Math.round(h*dpr);
      ctx.setTransform(el.width/w,0,0,el.height/h,0,0);
      const layout=makePaperGuide(ctx,card,geometry,aoi,legacy?'legacy':undefined);
      for(const [key,value] of Object.entries(layout.bounds))article.style.setProperty(key,value+'px');
      const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
      const exposure=engine.cardShown(layout.bounds,card.id,undefined,undefined,{layout,reducedMotion});
      if(!exposure?.paper)return;
      const {offsetMs,durationMs}=exposure.paper;
      const advanceClock=!reducedMotion||layout.reveal==='explain-then-shoot';
      let previous=-1;
      function draw(){
        const elapsed=paperTime(engine.exposureTime(exposure!)+offsetMs,durationMs,layout);
        if(elapsed!==previous){
          ctx!.clearRect(0,0,w,h);
          drawPaperGuide(ctx!,card,image,layout,elapsed,durationMs,reducedMotion);
          previous=elapsed;
        }
        if(elapsed<durationMs&&advanceClock)frame=requestAnimationFrame(draw);
      }
      draw();
    }).catch(()=>{if(active)engine.interrupt('illustrated_card_load_failure')});
    return ()=>{active=false;cancelAnimationFrame(frame);engine.cardHidden(card.id)};
  },[engine,card,geometry,painting]);
  return <article ref={wrapper} className="pilot-card paper-guide" data-card={card.id}>
    <canvas ref={canvas} aria-hidden="true"/><h2>{card.title}</h2><p>{card.text}</p>
  </article>;
}

function ArtCard({engine,card,painting}:Props){
  const canvas=useRef<HTMLCanvasElement>(null);
  const [rect,setRect]=useState<CardRect>();
  const geometry=engine.geometry;
  const aoi=painting.aois.find(a=>card.aoiIds.includes(a.id));
  useLayoutEffect(()=>{
    const ctx=canvas.current?.getContext('2d');
    if(ctx&&geometry&&aoi)setRect(cardPosition(ctx,card,geometry,aoi));
  },[card,geometry,aoi]);
  useLayoutEffect(()=>{
    const element=canvas.current;
    if(!element||!rect||!card.art||!geometry||!aoi)return;
    const from=entranceRect(rect,geometry,aoi);
    const ctx=element.getContext('2d');
    if(!ctx)return;
    let active=true,frame=0;
    void loadCutout(card.art).then(image=>{
      if(!active)return;
      const dpr=window.devicePixelRatio||1;
      element.width=Math.round(rect.width*dpr);element.height=Math.round(rect.height*dpr);
      ctx.setTransform(element.width/rect.width,0,0,element.height/rect.height,0,0);
      const ms=matchMedia('(prefers-reduced-motion: reduce)').matches?0:entranceDuration;
      const start=performance.now();
      const draw=()=>{
        const elapsed=performance.now()-start;
        ctx.clearRect(0,0,rect.width,rect.height);
        const shown=animatedRect(rect,elapsed,ms,from);
        element.style.transform='translate('+(shown.left-rect.left)+'px,'+(shown.top-rect.top)+'px) scale('+shown.width/rect.width+')';
        element.style.opacity=String(ms ? .42+.58*Math.min(1,elapsed/ms):1);
        drawCutout(ctx,card,image,{...rect,left:0,top:0},0,0);
        if(elapsed<ms)frame=requestAnimationFrame(draw);
      };
      draw();
      engine.cardShown(rect,card.id,ms,from);
    });
    return ()=>{active=false;cancelAnimationFrame(frame);engine.cardHidden(card.id)};
  },[engine,card,rect,geometry,aoi]);
  return <article className="pilot-card cutout-card" data-card={card.id} style={rect}>
    <canvas ref={canvas} aria-hidden="true"/><h2>{card.title}</h2><p>{card.text}</p>
  </article>;
}
function TextCard({engine,card,painting}:Props){
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
