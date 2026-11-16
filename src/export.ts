import {defaultScanpath,buildScanpath,renderScanpath,SCANPATH_ALGORITHM,SCANPATH_HEADER_PX,SCANPATH_FOOTER_PX} from './scanpath';
import { strToU8, zipSync } from 'fflate';
import type { GazeSample, PhaseEvent, ResponseRow, Session, ValidationRow } from './types';
import { eligibleSamples, HEATMAP_ALGORITHM, heatmapSize, renderHeatmap } from './heatmap';
import {applyCorrection,buildCorrectionPlan,type CorrectionPlan,type CorrectionRow} from './correction';
import {renderCorrectedHeatmap,renderCorrectedScanpath} from './correctionRender';

export const GAZE_COLUMNS: (keyof GazeSample)[] = ['sessionId','participantId','paintingId','trialId','phase','sampleIndex','callbackTimeMs','libraryElapsedMs','viewportX','viewportY','imageX','imageY','imageNormX','imageNormY','predictionAvailable','insideImage','geometryVersion','calibrationVersion','paused','confidence'];
export const EVENT_COLUMNS: (keyof PhaseEvent)[] = ['sessionId','participantId','timeMs','type','phase','paintingId','detail'];
interface ExportResponseRow extends ResponseRow {planVersion:string;questionVariant:string;questionVersion:string;sceneOrder:string;paintingOrder:string;questionPrompt:string;questionIndex:number|null;analysisRole:string;selectedOptionIds:string;selectedOptionLabels:string;otherText:string}
export const RESPONSE_COLUMNS: (keyof ExportResponseRow)[] = ['sessionId','participantId','paintingId','phase','questionId','answer','confidence','unknown','skipped','durationMs','timeMs','planVersion','questionVariant','questionVersion','sceneOrder','paintingOrder','questionPrompt','questionIndex','analysisRole','selectedOptionIds','selectedOptionLabels','otherText'];
export const BACKGROUND_COLUMNS = ['sessionId','participantId','backgroundVersion','questionId','questionPrompt','answer','answerCode'] as const;
export const VALIDATION_COLUMNS: (keyof ValidationRow)[] = ['sessionId','participantId','paintingId','kind','runId','calibrationVersion','targetId','targetX','targetY','viewportWidth','viewportHeight','timeMs','predictionX','predictionY','errorPx','settling','training'];
export const CORRECTED_GAZE_COLUMNS: (keyof CorrectionRow)[] = ['sessionId','participantId','sampleIndex','paintingId','trialId','phase','callbackTimeMs','calibrationVersion','geometryVersion','correctionApplied','correctionRunId','correctionReason','offsetX','offsetY','rawViewportX','rawViewportY','correctedViewportX','correctedViewportY','correctedImageX','correctedImageY','correctedImageNormX','correctedImageNormY','correctedInsideImage'];
export function csvCell(value:unknown):string {
  if(value===null||value===undefined||(typeof value==='number'&&!Number.isFinite(value)))return '';
  const text=String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text;
}
export function toCSV<T extends object>(rows:T[], columns:(keyof T)[]):string {
  return [columns.map(String).map(csvCell).join(','),...rows.map(row=>columns.map(column=>csvCell(row[column])).join(','))].join('\r\n')+'\r\n';
}
export function exportPrefix(session:Session):string {
  return `${session.mode}_${session.participantId}_${session.sessionId}`.replace(/[^a-zA-Z0-9_-]/g,'_');
}
/** Resolve question wording from the session snapshot, never from the current question bank. */
function responseQuestionPrompt(session:Session,row:ResponseRow):string {
  if(row.phase==='pre'||row.phase==='post'){
    return session.config.paintings.find(p=>p.paintingId===row.paintingId)?.[row.phase].find(q=>q.id===row.questionId)?.prompt??'';
  }
  if(row.phase==='interview'){
    if(row.questionId==='interview')return session.config.copy.interview;
    for(const painting of session.config.paintings){
      const index=painting.interview.findIndex((_,i)=>`${painting.paintingId}-interview-${i}`===row.questionId);
      if(index>=0)return painting.interview[index];
    }
  }
  return '';
}
function exportResponses(session:Session):ExportResponseRow[] {
  const assignment=session.assignment;
  return session.responses.map(row=>{
    const questions=row.phase==='pre'||row.phase==='post'?session.config.paintings.find(p=>p.paintingId===row.paintingId)?.[row.phase]:undefined;
    const index=questions?.findIndex(q=>q.id===row.questionId)??-1;
    const question=index<0?undefined:questions?.[index];
    return {...row,
      planVersion:assignment?.planVersion??'',questionVariant:assignment?.questionVariant??(session.config.questionnaireVersion?'common':''),questionVersion:assignment?.questionVersion??session.config.questionnaireVersion??'',
      sceneOrder:assignment?.order??'',paintingOrder:assignment?JSON.stringify(session.order):'',questionPrompt:responseQuestionPrompt(session,row),
      questionIndex:index<0?null:index+1,analysisRole:question?.analysisRole??'',
      selectedOptionIds:row.selectedOptions===undefined?'':JSON.stringify(row.selectedOptions),
      selectedOptionLabels:row.selectedOptions===undefined?'':JSON.stringify(row.selectedOptions.map(id=>question?.options?.find(option=>option.id===id)?.label??id)),
      otherText:row.otherText??'',
    };
  });
}
function exportBackground(session:Session):Record<string,Uint8Array> {
  const background=session.background;
  if(!background)return {};
  const rows=background.questions.map(question=>{
    const value=background.answers[question.id];
    return {sessionId:session.sessionId,participantId:session.participantId,backgroundVersion:background.version,
      questionId:question.id,questionPrompt:question.prompt,answer:question.options?.find(option=>option.id===String(value))?.label??String(value),answerCode:String(value)};
  });
  return {'background.csv':strToU8('\ufeff'+toCSV(rows,[...BACKGROUND_COLUMNS]))};
}
export function buildTextExportFiles(session:Session):Record<string,Uint8Array> {
  if(session.dataSource!=='webgazer-camera')throw new Error('拒绝导出非摄像头研究样本。开发 fixture 只允许在测试目录使用。');
  if(session.coordinateSource==='reference-corrected')throw new Error('参考校正坐标不能作为原始数据导出；请从原始会话生成附加校正文件。');
  const scanpathParams=session.scanpath??defaultScanpath;
  const correction=buildCorrectionPlan(session);
  const snapshot={...session, scanpath:scanpathParams, exportMetadata:{
    exportedAtUtc:new Date().toISOString(),
    rendererVersion:'1.3.0',
    terminology:'库输出的视线估计样本；回调接收时间不是摄像头曝光时间；不包含视频、眼部像素或推断的注视事件。',
    timestampBasis:'performance.now() in original page; UTC = timeOrigin + callbackTimeMs. Interrupted recovery event retains last persisted original-page timestamp.',
    csvEncoding:'UTF-8 BOM; RFC 4180 quoting; null and nonfinite numbers are empty cells; strings preserved verbatim',
    ...(session.config.questionnaireVersion?{questionnaireAnalysis:{version:session.config.questionnaireVersion,roles:{spontaneous:'讲解前第1–3题：参与者自主陈述的理解、需求与疑问',prompted:'讲解前第4题：定向追问活动、关系及判断依据',classification:'讲解前第5题：困难分类，用于补充开放回答','card-feedback':'讲解后两题：疑问回应与解释变化'},interpretation:'讲解前后是同一人的两个阶段，不是control group与experimental group。定向追问后出现的关系解释不能计为自发发现；仅凭前后变化不能认定讲解有效。'}}:{}),
    heatmapAlgorithm:HEATMAP_ALGORITHM,
    heatmapFilter:'sessionId and participantId match; free_view; paintingId matches; !paused; predictionAvailable; insideImage; finite viewport/image coordinates; normalized coordinates within [0,1]',
    heatmapRenders:session.config.paintings.map(p=>({paintingId:p.paintingId,...heatmapSize(p,session.heatmap),headerPx:166,footerPx:80,sampleCount:eligibleSamples(session,p.paintingId).length,showAOI:false,parameters:session.heatmap})),
    scanpathAlgorithm:SCANPATH_ALGORITHM,
    scanpathRenders:session.config.paintings.map(p=>{const model=buildScanpath(session,p.paintingId,scanpathParams);return {paintingId:p.paintingId,...heatmapSize(p,{...session.heatmap,width:scanpathParams.width}),headerPx:SCANPATH_HEADER_PX,footerPx:SCANPATH_FOOTER_PX,fromMs:0,toMs:model.durationMs,sourceCount:model.sourceCount,displayedCount:model.displayedCount,segmentCount:model.segmentCount,parameters:scanpathParams,showAOI:false}}),
    rates:'Observed callback count / measured active display seconds. No fixed-rate resampling.',
    correction:{...correction,derivedFilesAvailable:correction.available,rawSamplesUnchanged:true,qualityStatusUnchanged:true,note:'事后参考校正另存；不是独立准确度验证，不替换原始数据或质量判定。'},
  }};
  return {
    'gaze_samples.csv':strToU8('\ufeff'+toCSV(session.samples,GAZE_COLUMNS)),
    'phase_events.csv':strToU8('\ufeff'+toCSV(session.events,EVENT_COLUMNS)),
    'responses.csv':strToU8('\ufeff'+toCSV(exportResponses(session),RESPONSE_COLUMNS)),
    'validation.csv':strToU8('\ufeff'+toCSV(session.validation,VALIDATION_COLUMNS)),
    'session.json':strToU8(JSON.stringify(snapshot,null,2)),
    ...exportBackground(session),
  };
}
export async function canvasPNG(canvas:HTMLCanvasElement):Promise<Uint8Array> {
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('PNG 编码失败。')),'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}
export async function buildExportFiles(session:Session):Promise<Record<string,Uint8Array>> {
  const snapshot=structuredClone(session);
  const files=buildTextExportFiles(snapshot);
  for(const painting of snapshot.config.paintings){
    const canvas=await renderHeatmap(snapshot,painting,snapshot.heatmap,false);
    files[`heatmap_${painting.paintingId.replace(/[^a-zA-Z0-9_-]/g,'_')}.png`]=await canvasPNG(canvas);
    const trajectory=await renderScanpath(snapshot,painting,snapshot.scanpath??defaultScanpath);
    files[`scanpath_${painting.paintingId.replace(/[^a-zA-Z0-9_-]/g,'_')}.png`]=await canvasPNG(trajectory);
  }
  Object.assign(files,await buildCorrectionExportFiles(snapshot));
  return files;
}

/** Derived files only, so a historical ZIP can retain every original entry byte-for-byte. */
export async function buildCorrectionExportFiles(session:Session,plan:CorrectionPlan=buildCorrectionPlan(session)):Promise<Record<string,Uint8Array>> {
  if(session.dataSource!=='webgazer-camera')throw new Error('拒绝导出非摄像头研究样本。');
  if(session.coordinateSource==='reference-corrected')throw new Error('请使用原始会话生成参考校正文件，不能重复校正派生坐标。');
  if(!plan.available)return {};
  const applied=applyCorrection(session,plan);
  const scanpathParams=session.scanpath??defaultScanpath;
  const files:Record<string,Uint8Array>={
    'gaze_samples_corrected.csv':strToU8('\ufeff'+toCSV(applied.rows,CORRECTED_GAZE_COLUMNS)),
  };
  const renders:{paintingId:string;kind:'heatmap'|'scanpath';file:string;width:number;height:number;sampleCount:number;showAOI:boolean;fullTimeRange:boolean}[]=[];
  for(const painting of session.config.paintings){
    if(!plan.models.some(model=>model.paintingId===painting.paintingId&&model.status==='available'))continue;
    const id=painting.paintingId.replace(/[^a-zA-Z0-9_-]/g,'_');
    const heatmap=await renderCorrectedHeatmap(session,painting,session.heatmap,false,plan);
    const heatmapFile=`heatmap_${id}_corrected.png`;
    files[heatmapFile]=await canvasPNG(heatmap);
    const path=await renderCorrectedScanpath(session,painting,scanpathParams,{},plan);
    const scanpathFile=`scanpath_${id}_corrected.png`;
    files[scanpathFile]=await canvasPNG(path);
    const sampleCount=eligibleSamples(applied.session,painting.paintingId).length;
    renders.push({paintingId:painting.paintingId,kind:'heatmap',file:heatmapFile,width:heatmap.width,height:heatmap.height,sampleCount,showAOI:false,fullTimeRange:true});
    renders.push({paintingId:painting.paintingId,kind:'scanpath',file:scanpathFile,width:path.width,height:path.height,sampleCount,showAOI:false,fullTimeRange:true});
  }
  files['correction.json']=strToU8(JSON.stringify({
    schemaVersion:1,sessionId:session.sessionId,participantId:session.participantId,rendererVersion:'1.3.0',
    terminology:'事后参考校正；依据观看前检查点估计偏移，不是新的独立准确度验证。',
    sourceSessionFile:'session.json',rawGazeFile:'gaze_samples.csv',derivedGazeFile:'gaze_samples_corrected.csv',
    rawSamplesUnchanged:true,originalQuality:session.quality,qualityStatusUnchanged:true,
    plan,parameters:{heatmap:session.heatmap,scanpath:scanpathParams},renders,
    reconstruction:'Read sourceSessionFile. Use applyCorrection(session, plan) for derived rows; renderCorrectedHeatmap(session, painting, parameters.heatmap, false, plan) and renderCorrectedScanpath(session, painting, parameters.scanpath, {}, plan) for labelled full-range PNGs. No interpolation, clamping, or altered validation judgments.',
  },null,2));
  return files;
}
export function downloadFile(name:string, bytes:Uint8Array):void {
  const mime=name.endsWith('.csv')?'text/csv;charset=utf-8':name.endsWith('.json')?'application/json':name.endsWith('.png')?'image/png':'application/zip';
  const blob=new Blob([bytes],{type:mime});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),10000);
}
export async function exportZip(session:Session):Promise<void> {
  const prefix=exportPrefix(session),files=await buildExportFiles(session);
  const zipFiles=Object.fromEntries(Object.entries(files).map(([name,bytes])=>[`${prefix}/${name}`,bytes]));
  downloadFile(`${prefix}.zip`,zipSync(zipFiles,{level:6}));
}
