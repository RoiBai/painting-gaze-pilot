import {useEffect,useMemo,useRef,useState} from 'react';
import type {Painting,StudyConfig} from './types';
import {publicAssetUrl} from './assets';
import {cardPermutation,cardWindows,responsiveSelectionRules} from './pilotProtocol';
import IllustratedStage,{prepareIllustrationScene} from './IllustratedStage';
import type {ArcheryHistory} from './paperGuide';
import './layoutPlayback.css';

type PlaybackMode='sequential'|'random';
interface Beat{
  painting:Painting;
  card:Painting['cards'][number];
  start:number;
  reveal:number;
  end:number;
  history:ArcheryHistory;
}

// The two passive conditions follow exactly the participant slot boundaries.
function makeTimeline(scenes:Painting[],config:StudyConfig,mode:PlaybackMode,seed:number):Beat[]{
  const rules=responsiveSelectionRules(scenes,config.durationSeconds);
  let start=0;
  const beats:Beat[]=[];
  for(const painting of scenes){
    const duration=rules.durationMsByPainting![painting.paintingId];
    const windows=cardWindows(painting,mode,rules,duration);
    const byId=new Map(painting.cards.map(c=>[c.id,c]));
    const ids=painting.cards.map(c=>c.id);
    const deck=mode==='random'?cardPermutation(ids,seed,painting.paintingId):ids;
    let arrowLanded=false;
    deck.forEach((id,i)=>{
      const window=windows[i];
      beats.push({painting,card:byId.get(id)!,start:start+window.start,reveal:start+window.reveal,end:start+window.end,
        history:{previousCardId:windows[i-1]?.end===window.reveal?deck[i-1]:undefined,arrowLanded}});
      if(id==='archery-figma-1-6')arrowLanded=true;
    });
    start+=duration;
  }
  return beats;
}

const shortTitle=(p:Painting)=>p.title.split(' · ').at(-1);

export default function LayoutPlayback({config}:{config:StudyConfig}){
  const query=new URLSearchParams(location.search);
  const requestedScene=query.get('scene');
  const scenes=useMemo(()=>{
    const one=config.paintings.find(p=>p.paintingId===requestedScene);
    return one?[one]:config.paintings;
  },[config,requestedScene]);
  const [mode,setMode]=useState<PlaybackMode>(query.get('order')==='random'?'random':'sequential');
  const [seed,setSeed]=useState(()=>{
    const value=query.get('seed');
    return value&&/^\d{1,10}$/.test(value)&&Number(value)<=0xffffffff?Number(value):crypto.getRandomValues(new Uint32Array(1))[0];
  });
  const beats=useMemo(()=>makeTimeline(scenes,config,mode,seed),[scenes,config,mode,seed]);
  const total=beats.at(-1)!.end;
  const [loadState,setLoadState]=useState<'loading'|'ready'|'error'>('loading');
  const [attempt,setAttempt]=useState(0);
  const [paused,setPaused]=useState(false);
  const [controls,setControls]=useState(true);
  const [elapsed,setElapsed]=useState(()=>{
    const requested=query.get('card');
    return beats.find(b=>b.card.id===requested)?.reveal??0;
  });
  const clock=useRef(elapsed);
  const ended=elapsed>=total;
  const index=beats.findIndex(b=>elapsed<b.end);
  const beat=beats[index<0?beats.length-1:index];
  const visible=!ended && elapsed>=beat.reveal;

  function seek(ms:number){
    clock.current=ms;
    setElapsed(ms);
  }
  function chooseCard(next:Beat){
    // When paused, a manual selection opens on the composed card.
    seek(paused?next.reveal+(next.end-next.reveal)/2:next.reveal);
  }
  function restart(){
    if(mode==='random')setSeed(crypto.getRandomValues(new Uint32Array(1))[0]);
    seek(0);
    setPaused(false);
  }

  useEffect(()=>{
    let current=true;
    setLoadState('loading');
    Promise.all(scenes.map(prepareIllustrationScene))
      .then(()=>{if(current)setLoadState('ready')})
      .catch(()=>{if(current)setLoadState('error')});
    return ()=>{current=false};
  },[scenes,attempt]);

  useEffect(()=>{
    if(loadState!=='ready'||paused||ended)return;
    let frame=0;
    let previous=performance.now();
    function tick(now:number){
      if(document.hidden){
        previous=now;
      }else if(now-previous>=1000/30){
        const next=Math.min(total,clock.current+Math.max(0,now-previous));
        clock.current=next;
        setElapsed(next);
        previous=now;
      }
      if(clock.current<total)frame=requestAnimationFrame(tick);
    }
    function resetDelta(){previous=performance.now()}
    frame=requestAnimationFrame(tick);
    document.addEventListener('visibilitychange',resetDelta);
    return ()=>{
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange',resetDelta);
    };
  },[loadState,paused,ended,total]);

  const back=publicAssetUrl('/')+'?participant=P00&preview=setup';
  if(loadState!=='ready'){
    return <main className="shell stage">
      <h1>{loadState==='error'?'画面加载失败':'正在打开画面…'}</h1>
      <div className="actions">
        {loadState==='error'&&<button onClick={()=>setAttempt(n=>n+1)}>重试加载</button>}
        <a href={back}>返回 P00 设置</a>
      </div>
    </main>;
  }
  const sceneBeats=beats.filter(b=>b.painting===beat.painting);
  return <main className="layout-playback" aria-label="P00 免眼动排版预览"
    data-scene={beat.painting.paintingId} data-card={visible?beat.card.id:undefined}>
    <IllustratedStage painting={beat.painting} card={visible?beat.card:null} history={beat.history}
      elapsedMs={visible?elapsed-beat.reveal:0} durationMs={beat.end-beat.reveal}/>
    {ended?<section className="layout-preview-end" aria-label="预览结束">
      <h1>本轮预览已结束</h1>
      <div className="actions">
        <button className="primary" onClick={restart}>重新播放</button>
        <a href={back}>返回 P00 设置</a>
      </div>
    </section>:<>
      <button type="button" className="layout-toggle" aria-expanded={controls} aria-controls="layout-tools"
        onClick={()=>setControls(v=>!v)}>{controls?'隐藏工具':'显示工具'}</button>
      {controls&&<nav className="layout-toolbar" id="layout-tools" aria-label="排版预览工具">
        <label>场景<select value={beat.painting.paintingId} onChange={e=>{
          chooseCard(beats.find(b=>b.painting.paintingId===e.target.value)!);
        }}>
          {scenes.map(p=><option key={p.paintingId} value={p.paintingId}>{shortTitle(p)}</option>)}
        </select></label>
        <label>讲解方式<select value={mode} onChange={e=>{
          const chosen=e.target.value as PlaybackMode;
          setMode(chosen);
          seek(sceneBeats[0].start);
        }}><option value="sequential">顺序讲解</option><option value="random">随机讲解</option></select></label>
        <label>讲解部位<select value={beat.card.id} onChange={e=>chooseCard(sceneBeats.find(b=>b.card.id===e.target.value)!)}>
          {sceneBeats.map((b,i)=><option key={b.card.id} value={b.card.id}>{i+1} / {sceneBeats.length} · {b.card.title}</option>)}
        </select></label>
        <button type="button" onClick={()=>setPaused(v=>!v)}>{paused?'继续':'暂停'}</button>
        <button type="button" onClick={()=>{if(index+1<beats.length)chooseCard(beats[index+1]);else seek(total)}}>{index===beats.length-1?'结束预览':'下一张'}</button>
        <a href={back}>退出预览</a>
      </nav>}
    </>}
  </main>;
}
