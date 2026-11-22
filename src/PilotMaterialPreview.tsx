import {useEffect,useRef,useState} from 'react';
import IllustratedStage,{prepareIllustrationScene} from './IllustratedStage';
import type {Painting} from './types';
export default function PilotMaterialPreview({paintings}:{paintings:Painting[]}){
  const requested=new URLSearchParams(location.search).get('card');
  const [sceneIndex,setScene]=useState(()=>Math.max(0,paintings.findIndex(p=>p.cards.some(c=>c.id===requested))));
  const [cardIndex,setCard]=useState(()=>Math.max(0,paintings[sceneIndex].cards.findIndex(c=>c.id===requested)));
  const [error,setError]=useState('');
  const [elapsed,setElapsed]=useState(0);
  const container=useRef<HTMLDivElement>(null);
  const painting=paintings[sceneIndex],card=painting.cards[cardIndex];
  useEffect(()=>{
    let current=true,frame=0,start=0,ready=false,visible=false;
    function draw(time:number){
      if(!current||!ready||!visible)return;
      setElapsed((time-start)%12000);
      frame=requestAnimationFrame(draw);
    }
    function update(){
      cancelAnimationFrame(frame);
      if(ready&&visible&&current){start=performance.now();frame=requestAnimationFrame(draw)}
    }
    setElapsed(0);setError('');
    const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;update()});
    observer.observe(container.current!);
    void prepareIllustrationScene(painting).then(()=>{ready=true;update()}).catch(()=>{if(current)setError('此景素材未加载成功。')});
    return ()=>{current=false;cancelAnimationFrame(frame);observer.disconnect()};
  },[painting,card]);
  return <div className="material-demo" id="materials-preview" ref={container}>
    <div className="grid two">
      <label>预览场景<select value={sceneIndex} onChange={event=>{setCard(0);setScene(Number(event.target.value))}}>
        {paintings.map((p,i)=><option key={p.paintingId} value={i}>{p.title}</option>)}
      </select></label>
      <label>讲解部位（按顺序讲解排列）<select value={cardIndex} onChange={e=>setCard(Number(e.target.value))}>
        {painting.cards.map((c,i)=><option key={c.id} value={i}>{i+1} · {c.title}</option>)}
      </select></label>
    </div>
    {error?<p role="alert">{error}</p>:<IllustratedStage className="material-demo-stage" painting={painting} card={elapsed<10000?card:null} elapsedMs={elapsed} durationMs={10000}/>}
  </div>;
}
