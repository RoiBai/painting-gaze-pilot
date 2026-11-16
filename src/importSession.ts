import {unzipSync,strFromU8} from 'fflate';
import type {Session} from './types';
import {validateConfig} from './study';

const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const nonempty=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
function validBackground(value:unknown):boolean {
  if(!object(value)||value.version!=='background-v1'||!object(value.answers)||!Array.isArray(value.questions)||value.questions.length!==3)return false;
  const answers=value.answers;
  if(!nonempty(answers.studyField)||!['none','short','long'].includes(answers.artEducation as string)||!Number.isInteger(answers.paintingInterest)||Number(answers.paintingInterest)<1||Number(answers.paintingInterest)>5)return false;
  const ids=value.questions.map(q=>object(q)?q.id:null);
  if(new Set(ids).size!==3||!['studyField','artEducation','paintingInterest'].every(id=>ids.includes(id)))return false;
  for(const question of value.questions){
    if(!object(question)||!nonempty(question.prompt))return false;
    if(question.options!==undefined&&(!Array.isArray(question.options)||question.options.some(option=>!object(option)||!nonempty(option.id)||!nonempty(option.label))))return false;
    if(question.id==='artEducation'){
      if(!Array.isArray(question.options)||question.options.length!==3)return false;
      const codes=question.options.map(option=>object(option)?option.id:null);
      if(!['none','short','long'].every(id=>codes.includes(id)))return false;
    }
    if(question.id==='paintingInterest'){
      const scale=question.scale;
      if(!object(scale)||scale.min!==1||scale.max!==5||!nonempty(scale.minLabel)||!nonempty(scale.maxLabel))return false;
    }
  }
  return true;
}

/** Parse only in the browser. Never extracts files, fetches URLs, or writes research storage. */
export function readSessionArchive(bytes:Uint8Array,name:string):Session {
  const limit=50*1024*1024;
  if(bytes.length>100*1024*1024)throw new Error('文件超过 100 MB，请选择单次会话的 ZIP 或 session.json。');
  let value:unknown;
  if(name.toLowerCase().endsWith('.zip')){
    const files=unzipSync(bytes,{filter:file=>(file.name==='session.json'||file.name.endsWith('/session.json'))&&file.originalSize<=limit});
    const names=Object.keys(files);
    if(names.length!==1)throw new Error('ZIP 必须包含一份不超过 50 MB 的 session.json；不要合并多个会话。');
    value=JSON.parse(strFromU8(files[names[0]]));
  }else{
    if(bytes.length>limit)throw new Error('session.json 超过 50 MB。');
    value=JSON.parse(strFromU8(bytes));
  }
  if(!value||typeof value!=='object')throw new Error('会话格式无效。');
  const s=value as Session;
  if(s.schemaVersion!==1||s.dataSource!=='webgazer-camera'||s.coordinateSource==='reference-corrected'||typeof s.sessionId!=='string'||!/^N0[1-6]$/.test(s.participantId)||!['completed','interrupted'].includes(s.status))throw new Error('请选择本站导出的已完成或中断的原始会话。');
  const problems=validateConfig(s.config);if(problems.length)throw new Error(`会话配置不完整：${problems[0]}`);
  const groups=['samples','events','responses','validation','validationSummaries','geometries','timings','qualityNotes','order'] as const;
  for(const key of groups)if(!Array.isArray(s[key]))throw new Error(`会话缺少 ${key} 记录。`);
  if(!s.heatmap||!['pending','accepted','low_quality','flow_only'].includes(s.quality))throw new Error('会话缺少质量或可视化设置。');
  // Imported images stay in this application's materials directory. Backslashes,
  // encoded separators and protocol-relative URLs must not turn into remote loads.
  if(s.config.paintings.some(p=>!/^\/materials\/[a-zA-Z0-9_.\/-]+$/.test(p.image)||p.image.includes('..')))throw new Error('导入会话的图片必须是本站 /materials/ 中的素材。');
  for(const r of s.samples){
    if(!r||r.sessionId!==s.sessionId||r.participantId!==s.participantId||!Number.isInteger(r.sampleIndex)||!Number.isFinite(r.callbackTimeMs)||!Number.isInteger(r.calibrationVersion))throw new Error('采样记录的会话、时间或版本格式无效。');
    for(const key of ['viewportX','viewportY','imageX','imageY','imageNormX','imageNormY'] as const)if(r[key]!==null&&!Number.isFinite(r[key]))throw new Error('采样坐标须为数值或 null。');
  }
  if(s.qualityNotes.some(v=>typeof v!=='string')||s.order.some(id=>!s.config.paintings.some(p=>p.paintingId===id)))throw new Error('会话顺序或质量说明格式无效。');
  if(s.validationSummaries.some(v=>!v||typeof v.runId!=='string'||!Array.isArray(v.targets)||v.targets.some(t=>!t||typeof t.targetId!=='string'||!Number.isFinite(t.n))))throw new Error('验证摘要格式无效。');
  if(s.responses.some(r=>!r||typeof r.answer!=='string'||typeof r.questionId!=='string'))throw new Error('回答记录格式无效。');
  if(s.background!==undefined&&!validBackground(s.background))throw new Error('背景问卷的题目、选项或回答格式无效。');
  if(s.assignment!==undefined){
    const a=s.assignment;
    if(!a||!['crossed-four-v1','common-four-v2'].includes(a.planVersion)||a.participantId!==s.participantId||!['AB','BA'].includes(a.order)||!['alpha','beta','common'].includes(a.questionVariant)||!nonempty(a.questionVersion)||!Array.isArray(a.paintingOrder)||a.paintingOrder.length!==s.order.length||a.paintingOrder.some((id,i)=>id!==s.order[i]))throw new Error('会话分配记录格式无效。');
    if((a.planVersion==='common-four-v2')!==(a.questionVariant==='common'))throw new Error('会话分配方案与题本不一致。');
  }
  for(const row of s.responses){
    if(row.otherText!==undefined&&typeof row.otherText!=='string')throw new Error('困难分类补充说明须为文本。');
    if(row.selectedOptions!==undefined){
      const question=row.phase==='pre'||row.phase==='post'?s.config.paintings.find(p=>p.paintingId===row.paintingId)?.[row.phase].find(q=>q.id===row.questionId):undefined;
      if(!question||question.type!=='multi-select'||!Array.isArray(row.selectedOptions)||row.selectedOptions.some(id=>typeof id!=='string'||!question.options?.some(option=>option.id===id))||new Set(row.selectedOptions).size!==row.selectedOptions.length)throw new Error('困难分类须引用本次保存题目中的有效选项。');
      if(row.selectedOptions.length>1&&question.options?.some(option=>option.exclusive&&row.selectedOptions!.includes(option.id)))throw new Error('没有明显困难须与其他困难选项互斥。');
      if(row.otherText?.trim()&&(!question.otherOptionId||!row.selectedOptions.includes(question.otherOptionId)))throw new Error('补充说明须对应已选择的其他选项。');
    }else if(row.otherText?.trim())throw new Error('补充说明缺少对应的困难分类选项。');
  }
  if(s.validation.some(r=>!r||r.sessionId!==s.sessionId||r.participantId!==s.participantId||typeof r.runId!=='string'||!Number.isFinite(r.timeMs)))throw new Error('验证记录格式无效。');
  if(s.events.some(r=>!r||typeof r.detail!=='string'||!Number.isFinite(r.timeMs)))throw new Error('流程记录格式无效。');
  if(s.geometries.some(g=>!g||![g.width,g.height,g.viewportWidth,g.viewportHeight,g.naturalWidth,g.naturalHeight].every(n=>Number.isFinite(n)&&n>0)||!Number.isFinite(g.left)||!Number.isFinite(g.top)))throw new Error('显示几何格式无效。');
  if(s.timings.some(t=>!t||typeof t.trialId!=='string'||!Number.isFinite(t.startedMs)))throw new Error('展示计时格式无效。');
  return s;
}
