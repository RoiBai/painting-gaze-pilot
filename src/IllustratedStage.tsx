import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {publicAssetUrl} from './assets';
import {loadCutout,type GuideCard} from './cutoutCard';
import {containGeometry} from './geometry';
import {makePaperGuide,drawPaperGuide} from './paperGuide';
import {prepareCutoutMotion} from './cutoutMotion';
import {prepareArcheryStory} from './archeryNarrative';
import type {Painting} from './types';

import {LEGACY_PAPER_MATERIAL,paperTime} from './cardPresentation';
const backgrounds=new Map<string,Promise<HTMLImageElement>>();
export function prepareIllustrationScene(painting:Painting):Promise<void>{
  let base=backgrounds.get(painting.image);
  if(!base){
    const image=new Image();image.src=publicAssetUrl(painting.image);
    base=image.decode().then(()=>image).catch(error=>{backgrounds.delete(painting.image);throw error});
    backgrounds.set(painting.image,base);
  }
  return Promise.all([base,...painting.cards.filter(c=>c.art).map(card=>prepareCard(card,painting.materialVersion===LEGACY_PAPER_MATERIAL))]).then(()=>{});
}
export async function prepareCard(card:GuideCard,legacy=false):Promise<HTMLImageElement>{
  const [image]=await Promise.all([loadCutout(card.art!),prepareCutoutMotion(card,legacy),legacy?undefined:prepareArcheryStory(card)]);
  return image;
}

interface Props {painting:Painting;card:GuideCard|null;elapsedMs:number;durationMs:number;className?:string}

export default function IllustratedStage({painting,card,elapsedMs,durationMs,className=''}:Props){
  const canvas=useRef<HTMLCanvasElement>(null);
  const [size,setSize]=useState({w:0,h:0,dpr:1});
  const [loaded,setLoaded]=useState<{card:GuideCard;image:HTMLImageElement}|null>(null);
  const [error,setError]=useState('');
  const legacy=painting.materialVersion===LEGACY_PAPER_MATERIAL;
  useLayoutEffect(()=>{
    const el=canvas.current!;
    const measure=()=>{
      const box=el.getBoundingClientRect();
      setSize({w:box.width,h:box.height,dpr:window.devicePixelRatio||1});
    };
    measure();
    const obs=new ResizeObserver(measure);obs.observe(el);return ()=>obs.disconnect();
  },[]);
  useEffect(()=>{
    let current=true;
    setError('');
    if(card?.art)void prepareCard(card,legacy).then(image=>{if(current)setLoaded({card,image})})
      .catch(()=>{if(current)setError('讲解图未能载入，请重新打开此景。')});
    return ()=>{current=false};
  },[card,legacy]);
  const layout=useMemo(()=>{
    const ctx=canvas.current?.getContext('2d'),area=painting.aois.find(a=>card?.aoiIds.includes(a.id));
    if(!ctx||!area||!card||!size.w||!size.h)return null;
    const geom=containGeometry({version:1,paintingId:painting.paintingId,timeMs:0,viewportWidth:size.w,viewportHeight:size.h,dpr:size.dpr,naturalWidth:painting.width,naturalHeight:painting.height,box:{left:0,top:0,width:size.w,height:size.h}});
    return makePaperGuide(ctx,card,geom,area,legacy?'legacy':undefined);
  },[size,painting,card,legacy]);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const frameTime=reduced&&layout?.reveal!=='explain-then-shoot'?0:paperTime(elapsedMs,durationMs,layout);
  useLayoutEffect(()=>{
    const el=canvas.current,ctx=el?.getContext('2d');
    if(!el||!ctx||!size.w||!size.h)return;
    ctx.setTransform(el.width/size.w,0,0,el.height/size.h,0,0);
    ctx.clearRect(0,0,size.w,size.h);
    if(card&&layout&&loaded?.card===card)drawPaperGuide(ctx,card,loaded.image,layout,frameTime,durationMs,reduced);
  },[card,layout,frameTime,durationMs,reduced,loaded,size]);
  return <div className={'illustrated-stage '+className} data-card={card?.id}>
    <img src={publicAssetUrl(painting.image)} alt={painting.title}/>
    <canvas ref={canvas} width={Math.round(size.w*size.dpr)} height={Math.round(size.h*size.dpr)} role="img" aria-label={card?card.title+'。'+card.text:painting.title}/>
    {error&&<span role="alert">{error}</span>}
  </div>;
}
