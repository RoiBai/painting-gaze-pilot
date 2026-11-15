import {legacyUnassessed} from './quality';
import { publicAssetUrl } from './assets';
import type { GazeSample, HeatmapParameters, Painting, Session } from './types';

export const HEATMAP_ALGORITHM = 'gaussian-density-v1; sigma=kernelPx; radius=ceil(3*sigma); weight=1; per-image maximum; RGB blue→cyan→yellow→red';
export const defaultHeatmap: HeatmapParameters = { width:1000, kernelPx:28, opacity:0.65, weight:'one-per-sample', normalization:'per-image-max', colorScale:'blue-cyan-yellow-red-v1' };
export function eligibleSamples(session: Session, paintingId: string): GazeSample[] {
  return session.samples.filter(s => s.sessionId === session.sessionId && s.participantId === session.participantId && s.paintingId === paintingId && s.phase === 'free_view' && !s.paused && s.predictionAvailable && s.insideImage && s.imageX !== null && s.imageY !== null && Number.isFinite(s.imageX) && Number.isFinite(s.imageY) && s.imageNormX !== null && s.imageNormY !== null && Number.isFinite(s.imageNormX) && Number.isFinite(s.imageNormY) && s.imageNormX >= 0 && s.imageNormX <= 1 && s.imageNormY >= 0 && s.imageNormY <= 1 && s.viewportX !== null && s.viewportY !== null && Number.isFinite(s.viewportX) && Number.isFinite(s.viewportY));
}
export function heatmapSize(painting: Painting, params: HeatmapParameters) {
  const width = Math.round(Math.max(320, Math.min(2000, params.width)));
  return { width, height:Math.max(1, Math.round(width * painting.height / painting.width)) };
}
/** No interpolation, inferred fixations, dwell weights, or clamping of out-of-image observations. */
export function buildDensity(samples: GazeSample[], width:number, height:number, kernelPx:number): {values:Float32Array;max:number} {
  const values = new Float32Array(width * height);
  const sigma = Math.max(1, Math.min(160, kernelPx));
  const radius = Math.ceil(3*sigma);
  for (const sample of samples) {
    if (sample.imageNormX === null || sample.imageNormY === null || !Number.isFinite(sample.imageNormX) || !Number.isFinite(sample.imageNormY) || sample.imageNormX < 0 || sample.imageNormX > 1 || sample.imageNormY < 0 || sample.imageNormY > 1) continue;
    const cx = sample.imageNormX*(width-1), cy = sample.imageNormY*(height-1);
    const x0 = Math.max(0, Math.ceil(cx-radius)), x1 = Math.min(width-1, Math.floor(cx+radius));
    const y0 = Math.max(0, Math.ceil(cy-radius)), y1 = Math.min(height-1, Math.floor(cy+radius));
    const gx = new Float32Array(x1-x0+1);
    for (let x=x0; x<=x1; x++) gx[x-x0] = Math.exp(-((x-cx)**2)/(2*sigma*sigma));
    for (let y=y0; y<=y1; y++) {
      const gy = Math.exp(-((y-cy)**2)/(2*sigma*sigma));
      for (let x=x0; x<=x1; x++) values[y*width+x] += gx[x-x0]*gy;
    }
  }
  let max = 0;
  for (const value of values) max=Math.max(max,value);
  return { values, max };
}
export function densityColor(value:number): [number,number,number] {
  const stops = [[42,74,210],[25,202,218],[255,222,63],[220,37,36]];
  const position = Math.min(1,Math.max(0,value))*3;
  const a=Math.min(2,Math.floor(position)), f=position-a;
  return [0,1,2].map(i=>Math.round(stops[a][i]*(1-f)+stops[a+1][i]*f)) as [number,number,number];
}
export function paintDensity(canvas:HTMLCanvasElement, samples:GazeSample[], params:HeatmapParameters): {max:number} {
  const ctx=canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持 Canvas 2D，无法生成密度图。');
  const density=buildDensity(samples,canvas.width,canvas.height,params.kernelPx);
  const pixels=ctx.createImageData(canvas.width,canvas.height);
  if (density.max>0) for(let i=0;i<density.values.length;i++) {
    const normalized=density.values[i]/density.max;
    const color=densityColor(normalized);
    pixels.data.set([...color, Math.round(255*params.opacity*normalized)],i*4);
  }
  ctx.putImageData(pixels,0,0);
  return {max:density.max};
}
export async function loadPaintingImage(painting:Painting):Promise<HTMLImageElement> {
  const img=new Image();
  img.crossOrigin='anonymous';
  await new Promise<void>((resolve,reject)=>{
    img.onload=()=>resolve(); img.onerror=()=>reject(new Error(`无法加载画作 ${painting.paintingId} 的原图，请保留配置中的本地素材。`)); img.src=publicAssetUrl(painting.image);
  });
  await img.decode();
  if(img.naturalWidth !== painting.width || img.naturalHeight !== painting.height) throw new Error(`画作 ${painting.paintingId} 原始尺寸与配置不一致，不能准确重建热图。`);
  return img;
}
export function qualityText(session:Session):string {
  const map={pending:'待研究者判断',accepted:'研究者已接受',low_quality:'低质量会话',flow_only:'仅流程试用'};
  const validations=session.validationSummaries.filter(s=>s.kind==='validation');
  const last=validations[validations.length-1];
  const label=legacyUnassessed(session)?'质量未判定（旧版因未设标准标记为低质量）':session.quality==='pending'?'质量未判定':map[session.quality];
  return `${label} / 独立验证：${last ? {pass:'符合冻结阈值',fail:'未通过',judgment:'待研究者判断'}[last.status] : '无验证结果'}`;
}
export function actualSampleRate(session:Session, paintingId:string):number|null {
  const trials=session.timings.filter(t=>t.paintingId===paintingId);
  const activeMs=trials.reduce((sum,t)=>sum+t.activeMs,0);
  const callbacks=session.samples.filter(s=>s.paintingId===paintingId&&s.phase==='free_view'&&!s.paused);
  return activeMs>0 ? callbacks.length/(activeMs/1000) : null;
}
export async function renderHeatmap(session:Session, painting:Painting, params:HeatmapParameters=session.heatmap, showAOI=false):Promise<HTMLCanvasElement> {
  const img=await loadPaintingImage(painting);
  await document.fonts?.ready;
  const {width,height}=heatmapSize(painting,params);
  const samples=eligibleSamples(session,painting.paintingId);
  const header=166, footer=80;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height+header+footer;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('无法初始化密度图 Canvas。');
  ctx.fillStyle='#f7f5ef';ctx.fillRect(0,0,width,canvas.height);
  ctx.fillStyle='#233d38';ctx.font='bold 24px sans-serif';ctx.fillText('摄像头视线估计密度图',24,39);
  ctx.font='16px sans-serif';
  const timings=session.timings.filter(t=>t.paintingId===painting.paintingId);
  const active=timings.reduce((sum,t)=>sum+t.activeMs,0),wall=timings.reduce((sum,t)=>sum+t.wallMs,0);
  const interrupted=timings.filter(t=>t.status==='interrupted').length;
  const lines=[`${session.participantId} · ${painting.title} · free_view · ${samples.length} 个有效样本`, `有效展示 ${(active/1000).toFixed(2)} 秒 / 墙钟 ${(wall/1000).toFixed(2)} 秒 · ${qualityText(session)}`, `${session.mode==='preview'?'预览数据 · ':''}${session.status==='interrupted'?'中断会话 · ':''}${interrupted?`含 ${interrupted} 段中断展示 · `:''}每样本权重 1；样本密度，不是精确注视时长`, `逐图独立归一化，红色不可直接跨人比较 · σ ${params.kernelPx} px · 透明度 ${params.opacity.toFixed(2)}`];
  lines.forEach((text,i)=>ctx.fillText(text,24,69+i*25,width-48));
  ctx.drawImage(img,0,header,width,height);
  const layer=document.createElement('canvas');layer.width=width;layer.height=height;
  paintDensity(layer,samples,params);ctx.drawImage(layer,0,header);
  if(showAOI) for(const aoi of painting.aois) {
    const [x,y,w,h]=aoi.rect;ctx.strokeStyle='#6d27ca';ctx.lineWidth=2;ctx.strokeRect(x*width,header+y*height,w*width,h*height);
    ctx.fillStyle='#ffffff';ctx.fillRect(x*width,header+y*height,Math.min(aoi.label.length*16+12,w*width),24);
    ctx.fillStyle='#5720aa';ctx.font='14px sans-serif';ctx.fillText(aoi.label,x*width+4,header+y*height+17);
  }
  if(!samples.length) {
    ctx.fillStyle='rgba(247,245,239,.94)';ctx.fillRect(width/2-145,header+height/2-35,290,70);
    ctx.fillStyle='#384b47';ctx.font='bold 25px sans-serif';ctx.textAlign='center';ctx.fillText('无可用数据',width/2,header+height/2+8);ctx.textAlign='left';
  }
  ctx.fillStyle='#465c56';ctx.font='13px sans-serif';ctx.fillText(`会话 ${session.sessionId}`,20,header+height+25,width-40);
  ctx.fillText(`材料 ${painting.materialVersion} · ${painting.placeholder?'占位预览材料':'配置材料'} · 图像区 ${width} × ${height} px`,20,header+height+48,width-40);
  const legendX=width-160,legendY=header+height+60;
  for(let i=0;i<120;i++){ctx.fillStyle=`rgb(${densityColor(i/119).join(',')})`;ctx.fillRect(legendX+i,legendY,1,8);}
  return canvas;
}
