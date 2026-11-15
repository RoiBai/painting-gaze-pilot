import type {Session,Painting,HeatmapParameters,ScanpathParameters} from './types';
import {buildCorrectionPlan,applyCorrection,type CorrectionPlan} from './correction';
import {renderHeatmap} from './heatmap';
import {renderScanpath,defaultScanpath} from './scanpath';

export const CORRECTION_BANNER_PX=128;
function annotate(canvas:HTMLCanvasElement,plan:CorrectionPlan,paintingId:string):HTMLCanvasElement {
  const models=plan.models.filter(m=>m.paintingId===paintingId),available=models.filter(m=>m.status==='available');
  if(!available.length)throw new Error('该画没有可用的参考校正，不能将原始图导出为校正图。');
  const output=document.createElement('canvas');output.width=canvas.width;output.height=canvas.height+CORRECTION_BANNER_PX;
  const ctx=output.getContext('2d');if(!ctx)throw new Error('无法创建参考校正画布。');
  ctx.fillStyle='#e9f0ed';ctx.fillRect(0,0,output.width,output.height);ctx.fillStyle='#214737';ctx.font='bold 23px sans-serif';
  ctx.fillText('事后参考偏移校正 · 派生结果',20,32,output.width-40);
  ctx.font='14px sans-serif';
  const shifts=available.map((m,i)=>`${i+1}: Δx ${m.offsetX!.toFixed(1)}, Δy ${m.offsetY!.toFixed(1)} CSS px`).join('；');
  ctx.fillText(`逐试次平移 ${shifts}`,20,59,output.width-40);
  ctx.fillText('依据观看前漂移检查估计；不是恢复真实注视点，不代表独立验证通过；原始数据与质量标签保留。',20,83,output.width-40);
  ctx.fillText(models.length>available.length?'部分试次缺少依据：仅绘制可校正样本；完整范围和参数见 correction.json。':'画外点重新判定，不夹边、不补点；原始与校正图请对照查看，局部误差仍可能增大。',20,107,output.width-40);
  ctx.drawImage(canvas,0,CORRECTION_BANNER_PX);
  return output;
}
export async function renderCorrectedHeatmap(session:Session,painting:Painting,params:HeatmapParameters=session.heatmap,showAOI=false,plan:CorrectionPlan=buildCorrectionPlan(session)):Promise<HTMLCanvasElement> {
  if(!plan.models.some(m=>m.paintingId===painting.paintingId&&m.status==='available'))throw new Error('该画缺少匹配的观看前漂移检查，参考校正不可用。');
  const derived=applyCorrection(session,plan).session;
  return annotate(await renderHeatmap(derived,painting,params,showAOI),plan,painting.paintingId);
}
export async function renderCorrectedScanpath(session:Session,painting:Painting,params:ScanpathParameters=session.scanpath??defaultScanpath,options:{showAOI?:boolean;fromMs?:number;toMs?:number}={},plan:CorrectionPlan=buildCorrectionPlan(session)):Promise<HTMLCanvasElement> {
  if(!plan.models.some(m=>m.paintingId===painting.paintingId&&m.status==='available'))throw new Error('该画缺少匹配的观看前漂移检查，参考校正不可用。');
  const derived=applyCorrection(session,plan).session;
  return annotate(await renderScanpath(derived,painting,params,options),plan,painting.paintingId);
}
