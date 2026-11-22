import {loadCutout} from './cutoutCard';
import {paperEdition} from './cardPresentation';
import {prepareCard} from './IllustratedStage';
import {useEffect,useMemo,useRef,useState} from 'react';
import {publicAssetUrl} from './assets';
import {canvasPNG,downloadFile,exportPrefix,isPracticeSession,toCSV} from './export';
import {CONDITION_LABELS} from './cardMetrics';
import {archeryPhaseLabels,archerySampleLookup,arrowPhaseWindows,reviewWindows,segmentTrace} from './pilotSegments';
import {drawSegment,regionColors,regionLabels} from './pilotSegmentCanvas';
import type {Painting,Session,TrialTiming} from './types';
import type {ReviewWindow} from './pilotSegments';
import './pilotSegmentReview.css';

const sec=(ms:number)=>(ms/1000).toFixed(2);
function windowLabel(window:ReviewWindow,painting:Painting,trial:TrialTiming){
  const exposure=window.exposure;
  const title=exposure?'第 '+exposure.slot+' 张卡 · '+(painting.cards.find(c=>c.id===exposure.cardId)?.title??exposure.cardId):'无卡看画';
  const label=window.archeryPhase==='post_impact_no_card'?archeryPhaseLabels.post_impact_no_card:
    window.archeryPhase?.startsWith('arrow_')?title+' · '+archeryPhaseLabels[window.archeryPhase]:title;
  return label+'（'+sec(window.start-trial.startedMs)+'–'+sec(window.end-trial.startedMs)+' 秒）';
}

export default function PilotSegmentReview({session}:{session:Session}){
  const [sceneId,setSceneId]=useState(session.order[0]);
  const [trialId,setTrialId]=useState('');
  const [windowKey,setWindowKey]=useState('');
  const scene=session.config.paintings.find(p=>p.paintingId===sceneId)??session.config.paintings[0];
  const trials=session.timings.filter(t=>t.paintingId===scene.paintingId);
  const trial=trials.find(t=>t.trialId===trialId)??trials.findLast(t=>t.status==='completed')??trials.at(-1);
  const windows=useMemo(()=>trial?reviewWindows(session,trial).flatMap(w=>[w,...arrowPhaseWindows(w)]):[],[session,trial]);
  const window=windows.find(w=>w.key===windowKey)??windows.find(w=>w.exposure)??windows[0];
  const condition=session.pilot?.plan.find(p=>p.paintingId===scene.paintingId)?.condition;
  return <section className="segment-review" aria-label="分时段视线回看">
    <h2>分时段视线回看</h2>
    <div className="segment-selectors">
      <label>回看场景<select value={scene.paintingId} onChange={e=>{setSceneId(e.target.value);setTrialId('');setWindowKey('')}}>
        {session.order.map(id=><option key={id} value={id}>{session.config.paintings.find(p=>p.paintingId===id)?.title??id}</option>)}
      </select></label>
      {trials.length>1&&<label>观看轮次<select value={trial?.trialId??''} onChange={e=>{setTrialId(e.target.value);setWindowKey('')}}>
        {trials.map((t,i)=><option key={t.trialId} value={t.trialId}>第 {i+1} 次 · {t.status==='completed'?'完整观看':'中断'}</option>)}
      </select></label>}
      {window&&trial&&<label>出卡或无卡时段<select value={window.key} onChange={e=>setWindowKey(e.target.value)}>
        {windows.map(w=><option key={w.key} value={w.key}>{windowLabel(w,scene,trial)}</option>)}
      </select></label>}
    </div>
    {window&&trial?<SegmentPlayback key={session.sessionId+trial.trialId+window.key} window={window} session={session} trial={trial} scene={scene} condition={condition?CONDITION_LABELS[condition]:''}/>:<p>本景没有保存可回看的观看时段。</p>}
  </section>;
}

function SegmentPlayback({window:period,session,trial,scene,condition}:{window:ReviewWindow;session:Session;trial:TrialTiming;scene:Painting;condition:string}){
  const canvas=useRef<HTMLCanvasElement>(null);
  const [image,setImage]=useState<HTMLImageElement|null>(null);
  const [cutout,setCutout]=useState<HTMLImageElement|null>(null);
  const card=scene.cards.find(c=>c.id===period.exposure?.cardId);
  const art=card?.art;
  const [error,setError]=useState('');
  const [position,setPosition]=useState<number|null>(null);
  const [playing,setPlaying]=useState(false);
  const [speed,setSpeed]=useState(1);
  const trace=useMemo(()=>segmentTrace(session,trial,period),[session,trial,period]);
  const {points}=trace;
  const valid=points.filter(p=>p.region!=='missing'&&p.region!=='offscreen').length;
  const duration=period.end-period.start;
  const current=position??duration;
  useEffect(()=>{
    let mounted=true;
    const img=new Image();
    img.onload=()=>{if(mounted)setImage(img)};
    img.onerror=()=>{if(mounted)setError('此场景图像加载失败。')};
    img.src=publicAssetUrl(scene.image);
    return ()=>{mounted=false;img.onload=null;img.onerror=null};
  },[scene.image]);
  useEffect(()=>{
    let active=true;
    if(card&&art)void (period.exposure?.paper?prepareCard(card,paperEdition(scene.materialVersion)):loadCutout(art)).then(img=>{if(active)setCutout(img)}).catch(()=>{if(active)setError('该版讲解抠图加载失败。')});
    return ()=>{active=false};
  },[art,card,period.exposure,scene.materialVersion]);
  useEffect(()=>{
    if(image&&(!art||cutout)&&canvas.current)drawSegment(canvas.current,image,scene,period,points,period.start+current,position!==null,cutout);
  },[image,scene,period,points,current,position,cutout,art]);
  const playFrom=useRef(0);
  useEffect(()=>{
    if(!playing)return;
    const start=performance.now(),from=playFrom.current;
    const timer=window.setInterval(()=>{
      const elapsed=Math.min(duration,from+(performance.now()-start)*speed);
      setPosition(elapsed);
      if(elapsed>=duration)setPlaying(false);
    },40);
    return ()=>window.clearInterval(timer);
  },[playing,speed,duration]);
  const label=windowLabel(period,scene,trial);
  const basename=exportPrefix(session)+'_'+trial.trialId+'_'+(period.exposure?'card-'+period.exposure.slot:'blank')+'_'+(period.archeryPhase?period.archeryPhase+'_':'')+Math.round(period.start)+'ms';
  function downloadCSV(){
    const archery=period.archeryPhase?archerySampleLookup(session):null;
    const rows=points.map(({sample,region,connects})=>({
      participantId:session.participantId,sessionId:session.sessionId,paintingId:scene.paintingId,trialId:trial.trialId,
      condition:sample.condition,slot:period.exposure?.slot,cardId:period.exposure?.cardId,exposureId:period.exposure?.exposureId,
      windowStartMs:period.start,windowEndMs:period.end,sampleIndex:sample.sampleIndex,callbackTimeMs:sample.callbackTimeMs,
      segmentMs:sample.callbackTimeMs-period.start,trialActiveMs:sample.trialActiveMs,viewportX:sample.viewportX,viewportY:sample.viewportY,
      imageX:sample.imageX,imageY:sample.imageY,geometryVersion:sample.geometryVersion,calibrationVersion:sample.calibrationVersion,
      predictionAvailable:sample.predictionAvailable,onCard:sample.onCard,imageAoiId:sample.imageAoiId,region,connectsToPrevious:connects,
      ...(archery?archery(sample):{}),
    }));
    if(rows.length)downloadFile(basename+'.csv',new TextEncoder().encode('\uFEFF'+toCSV(rows,Object.keys(rows[0]) as (keyof typeof rows[number])[],session)));
  }
  async function downloadPNG(){
    if(!image||!period.geometry)return;
    try{
      const drawing=document.createElement('canvas');
      drawSegment(drawing,image,scene,period,points,period.end,false,cutout);
      const output=document.createElement('canvas');
      output.width=drawing.width;output.height=drawing.height+74;
      const ctx=output.getContext('2d')!;
      ctx.fillStyle='#fffdf6';ctx.fillRect(0,0,output.width,74);ctx.fillStyle='#25372e';ctx.font='18px sans-serif';
      ctx.fillText((isPracticeSession(session)?'P00 研究者试用':session.participantId)+' · '+scene.title+' · '+condition+' · '+label,15,28,output.width-30);
      ctx.font='15px sans-serif';ctx.fillText('原始屏幕坐标 · 卡片（红） / 画面（蓝） / 其他（紫） · 有效视口样本 '+valid+' / 全部回调 '+points.length,15,56,output.width-30);
      ctx.drawImage(drawing,0,74);downloadFile(basename+'.png',await canvasPNG(output));
    }catch(err){setError('轨迹图导出失败：'+String(err))}
  }
  return <>
    <p>{condition} · {valid} 个有效视口样本 / {points.length} 次回调
      {period.exposure&&valid>0&&<> · 卡片 → 画面 {trace.toPainting} 次 · 画面 → 卡片 {trace.toCard} 次</>}
    </p>
    {period.archeryPhase&&<p>原画箭靶区域内的有效样本 {trace.targetSampleCount} / {trace.targetValidCount}
      {trace.targetMs!==null&&<> · 连续落在靶区的观测时长 {sec(trace.targetMs)} 秒</>}
      {trace.targetMs===null&&<> · 连续观测时长不足以估算</>}
    </p>}
    {period.geometry?<canvas ref={canvas} className="segment-frame" aria-label={scene.title+' · '+label+' · 原始视口轨迹'}/>:<p>该时段缺少原始视口尺寸，无法重建轨迹。</p>}
    <div className="segment-legend">{Object.entries(regionColors).map(([key,color])=><span key={key}><i style={{backgroundColor:color}}/>{regionLabels[key as keyof typeof regionColors]}</span>)}</div>
    {valid===0&&<p>本时段没有可显示的视线样本。</p>}
    <div className="segment-controls">
      <button disabled={!valid||!image} onClick={()=>{
        if(playing)setPlaying(false);
        else{playFrom.current=current>=duration?0:current;setPosition(playFrom.current);setPlaying(true)}
      }}>{playing?'暂停时段回放':'播放这个时段'}</button>
      <button onClick={()=>{setPlaying(false);setPosition(null)}}>显示整段轨迹</button>
      <label>播放速度<select value={speed} onChange={e=>{playFrom.current=current;setSpeed(Number(e.target.value))}}>
        {[.5,1,2,4].map(n=><option key={n} value={n}>{n}×</option>)}
      </select></label>
    </div>
    <label>时段进度　{sec(current)} / {sec(duration)} 秒<input type="range" min={0} max={duration} step="any" value={current} aria-label="时段回放进度" onChange={e=>{setPlaying(false);setPosition(Number(e.target.value))}}/></label>
    <p className="muted">按当时的屏幕位置重建原画和卡片。{period.exposure?.paper&&'整段轨迹以这段曝光的中间帧为底图，播放时可看到实际动效。'}连续有效样本先落在卡片、随后落在画面，就计一次卡片到画面的转换，途中允许经过空白。缺失、暂停、移出视口或回调间隔超过 150 毫秒会断线。</p>
    <div className="segment-controls"><button disabled={!image||!period.geometry||Boolean(art&&!cutout)} onClick={()=>void downloadPNG()}>下载本时段轨迹 PNG</button><button disabled={!points.length} onClick={downloadCSV}>下载本时段样本 CSV</button></div>
    {error&&<p role="alert">{error}</p>}
  </>;
}
