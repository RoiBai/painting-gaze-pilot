import type {Session,Geometry,ValidationRow,GazeSample} from './types';
import {median} from './validation';
import {mapPoint} from './geometry';

export const CORRECTION_ALGORITHM='pretrial-drift-translation-v1; per-target median(target-prediction), then equal-target median; CSS pixels; no scale, rotation, interpolation, or clamping';
export interface CorrectionTarget {
  targetId:string;n:number;targetX:number;targetY:number;predictionX:number;predictionY:number;
  offsetX:number;offsetY:number;beforeMedianErrorPx:number;afterMedianErrorPx:number;
}
export interface CorrectionModel {
  trialId:string;paintingId:string;calibrationVersion:number|null;geometryVersion:number|null;
  status:'available'|'unavailable';reason:string;runId:string|null;offsetX:number|null;offsetY:number|null;
  beforeMedianErrorPx:number|null;afterMedianErrorPx:number|null;targets:CorrectionTarget[];
}
export interface CorrectionPlan {algorithm:string;available:boolean;models:CorrectionModel[]}
export interface CorrectionRow {
  sessionId:string;participantId:string;sampleIndex:number;paintingId:string|null;trialId:string|null;phase:string;callbackTimeMs:number;
  calibrationVersion:number;geometryVersion:number|null;correctionApplied:boolean;correctionRunId:string|null;correctionReason:string;
  offsetX:number|null;offsetY:number|null;rawViewportX:number|null;rawViewportY:number|null;
  correctedViewportX:number|null;correctedViewportY:number|null;correctedImageX:number|null;correctedImageY:number|null;
  correctedImageNormX:number|null;correctedImageNormY:number|null;correctedInsideImage:boolean;
}
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const validGeometry=(g:Geometry|undefined):g is Geometry=>!!g&&[g.viewportWidth,g.viewportHeight,g.width,g.height,g.naturalWidth,g.naturalHeight].every(x=>finite(x)&&x>0)&&finite(g.left)&&finite(g.top);
const scoped=(s:GazeSample,session:Session)=>s.sessionId===session.sessionId&&s.participantId===session.participantId;

/** A derived reference only. Never changes quality or retroactively trains the tracker. */
export function buildCorrectionPlan(session:Session):CorrectionPlan {
  const models=session.timings.map(timing=>{
    const model:CorrectionModel={trialId:timing.trialId,paintingId:timing.paintingId,calibrationVersion:null,geometryVersion:null,status:'unavailable',reason:'缺少本次展示的有效几何和样本。',runId:null,offsetX:null,offsetY:null,beforeMedianErrorPx:null,afterMedianErrorPx:null,targets:[]};
    const samples=session.samples.filter(s=>scoped(s,session)&&s.phase==='free_view'&&s.trialId===timing.trialId&&s.paintingId===timing.paintingId);
    if(!samples.length)return model;
    const calibrations=new Set(samples.map(s=>s.calibrationVersion)),geometries=new Set(samples.map(s=>s.geometryVersion));
    if(calibrations.size!==1||geometries.size!==1){model.reason='本次展示包含不同校准版本或显示几何，不能套用单一偏移。';return model;}
    model.calibrationVersion=samples[0].calibrationVersion;model.geometryVersion=samples[0].geometryVersion;
    const geometry=session.geometries.find(g=>g.version===model.geometryVersion&&g.paintingId===model.paintingId);
    if(!validGeometry(geometry))return model;
    // Choose the latest completed run BEFORE checking its adequacy. Never silently
    // skip an inadequate recent run and reuse an older, more convenient one.
    const candidates=session.validationSummaries.filter(v=>v.kind==='drift'&&v.calibrationVersion===model.calibrationVersion).map(summary=>{
      const rows=session.validation.filter(r=>r.sessionId===session.sessionId&&r.participantId===session.participantId&&r.runId===summary.runId&&r.kind==='drift'&&r.paintingId===timing.paintingId&&r.calibrationVersion===model.calibrationVersion);
      return {summary,rows,end:rows.length?Math.max(...rows.map(r=>r.timeMs)):Infinity};
    }).filter(run=>run.rows.length>0&&finite(run.end)&&run.end<=timing.startedMs).sort((a,b)=>b.end-a.end);
    const run=candidates[0];
    if(!run){model.reason='没有本景开始前、同一校准版本的完整漂移检查，保留原始结果。';return model;}
    model.runId=run.summary.runId;
    if(run.rows.some(r=>r.viewportWidth!==geometry.viewportWidth||r.viewportHeight!==geometry.viewportHeight)){
      model.reason='漂移检查与观看时的视口尺寸不同，不能可靠换用偏移。';return model;
    }
    const targetIds=run.summary.targets.map(t=>t.targetId);
    if(targetIds.length<3||new Set(targetIds).size!==targetIds.length){model.reason='漂移检查至少需要三个不同的完整目标。';return model;}
    const valid=run.rows.filter(r=>!r.training&&!r.settling&&finite(r.predictionX)&&finite(r.predictionY)&&finite(r.targetX)&&finite(r.targetY)&&finite(r.timeMs));
    const groups:ValidationRow[][]=targetIds.map(id=>valid.filter(r=>r.targetId===id));
    const minimum=Math.max(3,session.config.validation.minSamplesPerTarget);
    if(groups.some(rows=>rows.length<minimum)){model.reason=`最近漂移检查的每个目标至少需要 ${minimum} 个有效样本，当前不足。`;return model;}
    if(groups.some(rows=>rows.some(r=>r.targetX!==rows[0].targetX||r.targetY!==rows[0].targetY))){model.reason='同一目标的屏幕位置不一致，不能估算参考偏移。';return model;}
    if(new Set(groups.map(rows=>`${rows[0].targetX},${rows[0].targetY}`)).size<3){model.reason='漂移检查的目标位置重复，不能估算参考偏移。';return model;}
    model.targets=groups.map(rows=>({targetId:rows[0].targetId,n:rows.length,targetX:rows[0].targetX,targetY:rows[0].targetY,
      predictionX:median(rows.map(r=>r.predictionX!))!,predictionY:median(rows.map(r=>r.predictionY!))!,
      offsetX:median(rows.map(r=>r.targetX-r.predictionX!))!,offsetY:median(rows.map(r=>r.targetY-r.predictionY!))!,
      beforeMedianErrorPx:median(rows.map(r=>Math.hypot(r.predictionX!-r.targetX,r.predictionY!-r.targetY)))!,afterMedianErrorPx:0}));
    const dx=median(model.targets.map(t=>t.offsetX))!,dy=median(model.targets.map(t=>t.offsetY))!;
    if(Math.hypot(dx,dy)>Math.hypot(geometry.viewportWidth,geometry.viewportHeight)*.25){model.reason='参考偏移超过视口对角线的 25%，不自动应用如此大的平移。';return model;}
    model.offsetX=dx;model.offsetY=dy;
    for(let i=0;i<groups.length;i++)model.targets[i].afterMedianErrorPx=median(groups[i].map(r=>Math.hypot(r.predictionX!+dx-r.targetX,r.predictionY!+dy-r.targetY)))!;
    const used=groups.flat();
    model.beforeMedianErrorPx=median(used.map(r=>Math.hypot(r.predictionX!-r.targetX,r.predictionY!-r.targetY)))!;
    model.afterMedianErrorPx=median(used.map(r=>Math.hypot(r.predictionX!+dx-r.targetX,r.predictionY!+dy-r.targetY)))!;
    if(model.afterMedianErrorPx>model.beforeMedianErrorPx+1){model.reason='平移使同一参考检查的整体中位误差增大，已停用该试次校正。';return model;}
    model.status='available';
    model.reason='采用本景开始前最近的同版本漂移检查，逐目标等权估计平移；不拉伸、不旋转。参考误差来自用于估计的同一检查，不是独立准确度验证。';
    return model;
  });
  return {algorithm:CORRECTION_ALGORITHM,available:models.some(m=>m.status==='available'),models};
}

/** Uncovered/invalid observations break corrected scan paths rather than masquerade as corrected. */
export function applyCorrection(session:Session,plan:CorrectionPlan=buildCorrectionPlan(session)):{session:Session;plan:CorrectionPlan;rows:CorrectionRow[]} {
  if(session.coordinateSource==='reference-corrected')throw new Error('请使用原始会话，不能重复校正派生坐标。');
  const models=new Map(plan.models.map(m=>[m.trialId,m]));
  const geometries=new Map(session.geometries.map(g=>[g.version,g]));
  const timings=new Map(session.timings.map(t=>[t.trialId,t]));
  const rows:CorrectionRow[]=[];
  const samples=session.samples.map(sample=>{
    const model=sample.trialId?models.get(sample.trialId):undefined;
    const geometry=sample.geometryVersion!==null?geometries.get(sample.geometryVersion):undefined;
    const timing=sample.trialId?timings.get(sample.trialId):undefined;
    const eligible=scoped(sample,session)&&sample.phase==='free_view'&&!sample.paused&&sample.predictionAvailable&&finite(sample.viewportX)&&finite(sample.viewportY);
    const inTrial=!!timing&&sample.callbackTimeMs>=timing.startedMs&&(timing.endedMs===null||sample.callbackTimeMs<=timing.endedMs);
    const applies=eligible&&inTrial&&model?.status==='available'&&model.paintingId===sample.paintingId&&model.calibrationVersion===sample.calibrationVersion&&model.geometryVersion===sample.geometryVersion&&validGeometry(geometry)&&geometry.paintingId===sample.paintingId&&finite(model.offsetX)&&finite(model.offsetY);
    const x=applies?sample.viewportX!+model.offsetX!:null,y=applies?sample.viewportY!+model.offsetY!:null;
    const mapped=mapPoint(x,y,applies?geometry!:null);
    rows.push({sessionId:sample.sessionId,participantId:sample.participantId,sampleIndex:sample.sampleIndex,paintingId:sample.paintingId,trialId:sample.trialId,phase:sample.phase,callbackTimeMs:sample.callbackTimeMs,
      calibrationVersion:sample.calibrationVersion,geometryVersion:sample.geometryVersion,correctionApplied:!!applies,correctionRunId:applies?model!.runId:null,
      correctionReason:applies?'已应用事后参考平移':!eligible?'非有效、非暂停的观看样本':!inTrial?'样本不属于该展示时段':model?.reason??'没有匹配的参考校正模型',
      offsetX:applies?model!.offsetX:null,offsetY:applies?model!.offsetY:null,rawViewportX:sample.viewportX,rawViewportY:sample.viewportY,
      correctedViewportX:x,correctedViewportY:y,correctedImageX:mapped.imageX,correctedImageY:mapped.imageY,correctedImageNormX:mapped.imageNormX,correctedImageNormY:mapped.imageNormY,correctedInsideImage:mapped.insideImage});
    return sample.phase==='free_view'?{...sample,viewportX:x,viewportY:y,...mapped,predictionAvailable:!!applies}:{...sample};
  });
  return {session:{...session,coordinateSource:'reference-corrected',samples},plan,rows};
}
