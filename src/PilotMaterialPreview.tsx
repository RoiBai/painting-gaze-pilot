import {useEffect,useRef,useState} from 'react';
import {publicAssetUrl} from './assets';
import {cardPosition,drawCutout,entranceDuration,entranceRect,loadCutout} from './cutoutCard';
import {containGeometry} from './geometry';
import type {Painting} from './types';

export default function PilotMaterialPreview({paintings}:{paintings:Painting[]}){
  const requested=new URLSearchParams(location.search).get('card');
  const [sceneIndex,setScene]=useState(()=>Math.max(0,paintings.findIndex(p=>p.cards.some(c=>c.id===requested))));
  const [cardIndex,setCard]=useState(()=>Math.max(0,paintings[sceneIndex].cards.findIndex(c=>c.id===requested)));
  const [error,setError]=useState('');
  const canvas=useRef<HTMLCanvasElement>(null);
  const painting=paintings[sceneIndex],card=painting.cards[cardIndex];
  useEffect(()=>{
    if(!card.art||!canvas.current)return;
    const ctx=canvas.current.getContext('2d');
    if(!ctx)return;
    const base=new Image();
    base.src=publicAssetUrl(painting.image);
    const w=1200,h=775;
    const geom=containGeometry({version:1,paintingId:painting.paintingId,timeMs:0,viewportWidth:w,viewportHeight:h,dpr:1,naturalWidth:painting.width,naturalHeight:painting.height,box:{left:0,top:0,width:w,height:h}});
    const aoi=painting.aois.find(a=>card.aoiIds.includes(a.id))!;
    const rect=cardPosition(ctx,card,geom,aoi);
    const from=entranceRect(rect,geom,aoi);
    let active=true,frame=0;
    setError('');
    void Promise.all([base.decode(),loadCutout(card.art)]).then(([,cutout])=>{
      if(!active)return;
      const start=performance.now();
      const ms=matchMedia('(prefers-reduced-motion: reduce)').matches?0:entranceDuration;
      function draw(){
        if(!ctx)return;
        ctx.fillStyle='#eeede8';ctx.fillRect(0,0,w,h);
        ctx.drawImage(base,geom.left,geom.top,geom.width,geom.height);
        drawCutout(ctx,card,cutout,rect,performance.now()-start,ms,from);
        if(performance.now()<start+ms)frame=requestAnimationFrame(draw);
      }
      draw();
    }).catch(()=>{if(active)setError('这张讲解图尚未加载成功。')});
    return ()=>{active=false;cancelAnimationFrame(frame)};
  },[painting,card]);
  return <div className="material-demo" id="materials-preview">
    <div className="grid two">
      <label>预览场景<select value={sceneIndex} onChange={event=>{setCard(0);setScene(Number(event.target.value))}}>
        {paintings.map((p,i)=><option key={p.paintingId} value={i}>{p.title}</option>)}
      </select></label>
      <label>讲解部位（按顺序讲解排列）<select value={cardIndex} onChange={e=>setCard(Number(e.target.value))}>
        {painting.cards.map((c,i)=><option key={c.id} value={i}>{i+1} · {c.title}</option>)}
      </select></label>
    </div>
    {error?<p role="alert">{error}</p>:<canvas ref={canvas} width={1200} height={775} role="img" aria-label={card.title+'。'+card.text}/>}
  </div>;
}
