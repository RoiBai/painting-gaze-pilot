import type {GazeSample, Painting, ScanpathParameters, Session} from './types';
import {defaultHeatmap, heatmapSize, loadPaintingImage, qualityText} from './heatmap';

export const SCANPATH_ALGORITHM = 'estimated-scanpath-v1; segment raw observations before greedy temporal display thinning; retain segment endpoints; never infer fixations or interpolate gaze; time-blue-orange-v1';
export const SCANPATH_HEADER_PX = 192;
export const SCANPATH_FOOTER_PX = 100;
export const defaultScanpath:ScanpathParameters = {
  width:1000,opacity:0.85,lineWidth:1.8,pointRadius:3.5,
  displayIntervalMs:200,maxGapMs:250,numberEvery:5,colorScale:'time-blue-orange-v1',
};
export interface ScanpathPoint {
  sampleIndex:number;
  callbackTimeMs:number;
  relativeMs:number;
  imageNormX:number;
  imageNormY:number;
  /** Global ordinal of the actually displayed observation, unchanged by scrubbing. */
  order:number;
}
export interface ScanpathRange {fromMs:number;toMs:number}
export interface ScanpathModel {
  segments:ScanpathPoint[][];
  /** Eligible raw observations within the selected time range, before display thinning. */
  sourceCount:number;
  displayedCount:number;
  segmentCount:number;
  originMs:number;
  durationMs:number;
  fromMs:number;
  toMs:number;
}

function inScope(sample:GazeSample,session:Session,paintingId:string):boolean {
  return sample.sessionId===session.sessionId&&sample.participantId===session.participantId&&sample.paintingId===paintingId;
}
function isObservation(sample:GazeSample,session:Session,paintingId:string):boolean {
  return inScope(sample,session,paintingId)&&sample.phase==='free_view'&&!sample.paused&&sample.predictionAvailable&&sample.insideImage
    &&Number.isInteger(sample.sampleIndex)&&sample.sampleIndex>=0&&Number.isFinite(sample.callbackTimeMs)
    &&sample.viewportX!==null&&Number.isFinite(sample.viewportX)&&sample.viewportY!==null&&Number.isFinite(sample.viewportY)
    &&sample.imageX!==null&&Number.isFinite(sample.imageX)&&sample.imageY!==null&&Number.isFinite(sample.imageY)
    &&sample.imageNormX!==null&&Number.isFinite(sample.imageNormX)&&sample.imageNormX>=0&&sample.imageNormX<=1
    &&sample.imageNormY!==null&&Number.isFinite(sample.imageNormY)&&sample.imageNormY>=0&&sample.imageNormY<=1;
}

/** Time axis is wall-clock time within this page, including pauses and repeat attempts. */
export function scanpathExtent(session:Session,paintingId:string):{durationMs:number;originMs:number} {
  const starts:number[]=[],ends:number[]=[];
  for(const timing of session.timings.filter(t=>t.paintingId===paintingId)) {
    if(!Number.isFinite(timing.startedMs))continue;
    starts.push(timing.startedMs);
    const end=timing.endedMs!==null&&Number.isFinite(timing.endedMs)?timing.endedMs:timing.startedMs+Math.max(0,Number.isFinite(timing.wallMs)?timing.wallMs:0);
    ends.push(Math.max(timing.startedMs,end));
  }
  for(const sample of session.samples) {
    if(inScope(sample,session,paintingId)&&sample.phase==='free_view'&&Number.isFinite(sample.callbackTimeMs)) {
      starts.push(sample.callbackTimeMs);ends.push(sample.callbackTimeMs);
    }
  }
  if(!starts.length)return {originMs:0,durationMs:0};
  let originMs=Infinity,endMs=-Infinity;
  for(const start of starts)originMs=Math.min(originMs,start);
  for(const end of ends)endMs=Math.max(endMs,end);
  return {originMs,durationMs:Math.max(0,endMs-originMs)};
}

function checkParameters(params:ScanpathParameters):void {
  const bounds:[keyof ScanpathParameters,number,number][]=[['width',320,2000],['opacity',0,1],['lineWidth',0.5,8],['pointRadius',1,12],['displayIntervalMs',0,2000],['maxGapMs',1,2000],['numberEvery',0,10000]];
  for(const [name,min,max] of bounds){const value=params[name];if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(`轨迹参数 ${name} 超出允许范围 ${min}–${max}`);}
  if(!Number.isInteger(params.numberEvery))throw new Error('轨迹编号间隔必须是整数');
  if(params.colorScale!=='time-blue-orange-v1')throw new Error('未知轨迹色标');
}

/**
 * Split BEFORE thinning. Invalid callbacks are separators, never silently filtered
 * out before joining. The stored callback sequence is not reordered or repaired.
 */
export function buildScanpath(session:Session,paintingId:string,params:ScanpathParameters=defaultScanpath,range?:ScanpathRange):ScanpathModel {
  checkParameters(params);
  const {originMs,durationMs}=scanpathExtent(session,paintingId);
  if(range&&(!Number.isFinite(range.fromMs)||!Number.isFinite(range.toMs)))throw new Error('轨迹时间范围须为有限数值');
  const fromMs=Math.min(durationMs,Math.max(0,range?.fromMs??0));
  const toMs=Math.max(fromMs,Math.min(durationMs,Math.max(0,range?.toMs??durationMs)));
  // Events also break a line if the pause was so short no callback arrived while paused.
  const boundaryTypes=new Set(['pause','phase_end','phase_start','interrupted','environment_change','trial_restart_required','calibration_started']);
  const boundaries=session.events.filter(event=>event.sessionId===session.sessionId&&event.participantId===session.participantId&&(event.paintingId===paintingId||event.paintingId===null)&&boundaryTypes.has(event.type)&&Number.isFinite(event.timeMs)).map(event=>event.timeMs).sort((a,b)=>a-b);
  const crossesBoundary=(a:number,b:number)=>{
    // first boundary >= a; a pause at the preceding callback's time also separates.
    let low=0,high=boundaries.length;
    while(low<high){const middle=(low+high)>>>1;if(boundaries[middle]<a)low=middle+1;else high=middle;}
    return low<boundaries.length&&boundaries[low]<b;
  };
  const rawSegments:GazeSample[][]=[];
  let current:GazeSample[]=[];
  let previous:GazeSample|null=null;
  const finish=()=>{if(current.length)rawSegments.push(current);current=[];previous=null;};
  for(const sample of session.samples) {
    if(!isObservation(sample,session,paintingId)){finish();continue;}
    if(previous) {
      const gap=sample.callbackTimeMs-previous.callbackTimeMs;
      const discontinuity=sample.sampleIndex!==previous.sampleIndex+1||gap<=0||gap>params.maxGapMs
        ||sample.trialId!==previous.trialId||sample.calibrationVersion!==previous.calibrationVersion||sample.geometryVersion!==previous.geometryVersion
        ||sample.trialId===null||sample.geometryVersion===null||crossesBoundary(previous.callbackTimeMs,sample.callbackTimeMs);
      if(discontinuity)finish();
    }
    current.push(sample);previous=sample;
  }
  finish();
  let order=0,sourceCount=0;
  const segments:ScanpathPoint[][]=[];
  for(const raw of rawSegments) {
    for(const sample of raw){const t=sample.callbackTimeMs-originMs;if(t>=fromMs&&t<=toMs)sourceCount++;}
    const selected:GazeSample[]=[];
    for(let i=0;i<raw.length;i++) {
      const sample=raw[i];
      if(!selected.length||sample.callbackTimeMs-selected[selected.length-1].callbackTimeMs>=params.displayIntervalMs||i===raw.length-1)selected.push(sample);
    }
    // Assign ordinal BEFORE range filtering: the same observation always has the same label.
    const visible=selected.map(sample=>({sampleIndex:sample.sampleIndex,callbackTimeMs:sample.callbackTimeMs,relativeMs:sample.callbackTimeMs-originMs,imageNormX:sample.imageNormX!,imageNormY:sample.imageNormY!,order:++order})).filter(point=>point.relativeMs>=fromMs&&point.relativeMs<=toMs);
    if(visible.length)segments.push(visible);
  }
  return {segments,sourceCount,displayedCount:segments.reduce((n,segment)=>n+segment.length,0),segmentCount:segments.length,originMs,durationMs,fromMs,toMs};
}

/** Time color is global within the painting's wall-clock timeline, not density. */
export function scanpathColor(relativeMs:number,durationMs:number):[number,number,number] {
  const t=durationMs>0?Math.min(1,Math.max(0,relativeMs/durationMs)):0;
  const early=[35,100,210],late=[232,120,36];
  return early.map((value,i)=>Math.round(value+(late[i]-value)*t)) as [number,number,number];
}

const sourceImages=new Map<string,Promise<HTMLImageElement>>();
function imageFor(painting:Painting):Promise<HTMLImageElement> {
  const key=JSON.stringify([painting.image,painting.width,painting.height,painting.materialVersion]);
  const cached=sourceImages.get(key);
  if(cached){sourceImages.delete(key);sourceImages.set(key,cached);return cached;}
  const loading=loadPaintingImage(painting).catch(error=>{if(sourceImages.get(key)===loading)sourceImages.delete(key);throw error;});
  sourceImages.set(key,loading);
  while(sourceImages.size>2)sourceImages.delete(sourceImages.keys().next().value!);
  return loading;
}

export async function renderScanpath(session:Session,painting:Painting,params:ScanpathParameters=session.scanpath??defaultScanpath,options:{showAOI?:boolean;fromMs?:number;toMs?:number}={}):Promise<HTMLCanvasElement> {
  const model=buildScanpath(session,painting.paintingId,params,options.fromMs!==undefined||options.toMs!==undefined?{fromMs:options.fromMs??0,toMs:options.toMs??scanpathExtent(session,painting.paintingId).durationMs}:undefined);
  const img=await imageFor(painting);
  await document.fonts?.ready;
  const {width,height}=heatmapSize(painting,{...defaultHeatmap,width:params.width});
  const header=SCANPATH_HEADER_PX,footer=SCANPATH_FOOTER_PX;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height+header+footer;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('浏览器不支持 Canvas 2D，无法生成估计轨迹。');
  ctx.fillStyle='#f7f5ef';ctx.fillRect(0,0,width,canvas.height);
  ctx.fillStyle='#233d38';ctx.font='bold 24px sans-serif';ctx.fillText('摄像头视线估计轨迹（Scan path）',24,38,width-48);
  const timings=session.timings.filter(t=>t.paintingId===painting.paintingId);
  const active=timings.reduce((sum,t)=>sum+t.activeMs,0),wall=timings.reduce((sum,t)=>sum+t.wallMs,0);
  const lines=[
    `${session.participantId} · ${painting.title} · free_view · ${qualityText(session)}`,
    `时间窗 ${(model.fromMs/1000).toFixed(2)}–${(model.toMs/1000).toFixed(2)} 秒 · 时间轴含暂停和重复试次间隔`,
    `${session.coordinateSource==='reference-corrected'?'校正后画内样本':'画内原样本'} ${model.sourceCount} · 显示 ${model.displayedCount} 点 / ${model.segmentCount} 段 · 有效展示 ${(active/1000).toFixed(2)} 秒 / 试次墙钟 ${(wall/1000).toFixed(2)} 秒`,
    `${params.displayIntervalMs===0?'显示全部真实样本':`每 ${params.displayIntervalMs} ms 选一个真实样本（另保留分段首尾）`}；仅显示抽稀，不改采样数据`,
    `编号按显示样本顺序；蓝→橙表示时间先后；等大点不表示注视时长；缺口处断线`,
  ];
  ctx.font='14px sans-serif';lines.forEach((text,i)=>ctx.fillText(text,24,66+i*24,width-48));
  ctx.drawImage(img,0,header,width,height);
  ctx.save();ctx.beginPath();ctx.rect(0,header,width,height);ctx.clip();ctx.globalAlpha=params.opacity;
  const xy=(point:ScanpathPoint)=>({x:point.imageNormX*(width-1),y:header+point.imageNormY*(height-1)});
  for(const segment of model.segments) {
    for(let i=1;i<segment.length;i++) {
      const a=xy(segment[i-1]),b=xy(segment[i]);
      ctx.strokeStyle=`rgb(${scanpathColor(segment[i].relativeMs,model.durationMs).join(',')})`;
      ctx.lineWidth=params.lineWidth;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      if(params.numberEvery>0&&(segment[i].order-1)%params.numberEvery===0&&Math.hypot(b.x-a.x,b.y-a.y)>12){
        const angle=Math.atan2(b.y-a.y,b.x-a.x),length=7;
        const tip={x:a.x+(b.x-a.x)*.66,y:a.y+(b.y-a.y)*.66};
        ctx.beginPath();ctx.moveTo(tip.x-length*Math.cos(angle-.5),tip.y-length*Math.sin(angle-.5));ctx.lineTo(tip.x,tip.y);ctx.lineTo(tip.x-length*Math.cos(angle+.5),tip.y-length*Math.sin(angle+.5));ctx.stroke();
      }
    }
    for(const point of segment) {
      const pos=xy(point);ctx.fillStyle=`rgb(${scanpathColor(point.relativeMs,model.durationMs).join(',')})`;
      ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.beginPath();ctx.arc(pos.x,pos.y,params.pointRadius,0,Math.PI*2);ctx.fill();ctx.stroke();
    }
  }
  ctx.font='bold 11px sans-serif';ctx.textAlign='left';
  for(const segment of model.segments) for(const point of segment) if(params.numberEvery>0&&(point.order-1)%params.numberEvery===0) {
    const pos=xy(point),label=String(point.order),textWidth=ctx.measureText(label).width;
    const x=Math.max(2,Math.min(width-textWidth-7,pos.x+params.pointRadius+3));
    const y=Math.max(header+14,Math.min(header+height-3,pos.y-params.pointRadius-3));
    ctx.fillStyle='rgba(255,255,255,.9)';ctx.fillRect(x-2,y-12,textWidth+4,15);ctx.fillStyle='#263c36';ctx.fillText(label,x,y);
  }
  ctx.restore();
  if(options.showAOI) for(const aoi of painting.aois){const [x,y,w,h]=aoi.rect;ctx.strokeStyle='#7136ac';ctx.lineWidth=2;ctx.strokeRect(x*width,header+y*height,w*width,h*height);ctx.fillStyle='rgba(255,255,255,.9)';ctx.font='13px sans-serif';const labelWidth=Math.min(aoi.label.length*13+8,width-x*width);ctx.fillRect(x*width,header+y*height,labelWidth,21);ctx.fillStyle='#5720aa';ctx.fillText(aoi.label,x*width+3,header+y*height+15,labelWidth-6);}
  if(!model.displayedCount){
    const message=model.sourceCount?'此时间窗无显示点，请减小抽稀间隔':'无可用数据';
    ctx.font='bold 20px sans-serif';const textWidth=Math.min(width-24,ctx.measureText(message).width+30);
    ctx.fillStyle='rgba(247,245,239,.95)';ctx.fillRect((width-textWidth)/2,header+height/2-30,textWidth,60);
    ctx.fillStyle='#384b47';ctx.textAlign='center';ctx.fillText(message,width/2,header+height/2+7,width-36);ctx.textAlign='left';
  }
  ctx.font='12px sans-serif';ctx.fillStyle='#465c56';
  const foot=[`会话 ${session.sessionId}`,`材料 ${painting.materialVersion} · 图像区 ${width} × ${height} px · ${session.mode==='preview'?'预览模式':'正式模式'} / ${session.status}`,`这是库输出估计样本的时间顺序图，不是 fixation / saccade 检测；数据缺口 > ${params.maxGapMs} ms 断线。`];
  foot.forEach((text,i)=>ctx.fillText(text,20,header+height+22+i*21,width-40));
  const legendX=20,legendY=header+height+83;
  for(let i=0;i<160;i++){ctx.fillStyle=`rgb(${scanpathColor(i,159).join(',')})`;ctx.fillRect(legendX+i,legendY,1,6);}
  ctx.fillStyle='#465c56';ctx.fillText('早 → 晚',190,legendY+6);
  return canvas;
}
