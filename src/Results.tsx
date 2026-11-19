import {validationExplanation,legacyUnassessed,validationRuleText} from './quality';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from './types';
import {defaultScanpath,scanpathExtent,renderScanpath} from './scanpath';
import { actualSampleRate, eligibleSamples, qualityText, renderHeatmap } from './heatmap';
import {buildCorrectionPlan,applyCorrection} from './correction';
import {renderCorrectedHeatmap,renderCorrectedScanpath} from './correctionRender';
import { buildTextExportFiles, canvasPNG, downloadFile, exportPrefix, exportZip, isPracticeSession, PILOT_DATA_FILES } from './export';

import PilotComparison from './PilotComparison';
import PilotSegmentReview from './PilotSegmentReview';

interface Props {session:Session;onChange:(session:Session)=>void;onBack:()=>void}
export function Results(props:Props) {
  if(isPracticeSession(props.session)) return <section className="panel"><h2>P00 练习</h2><p>练习过程仅在当前页面临时使用。</p><button onClick={props.onBack}>结束练习</button></section>;
  return <StudyResults {...props}/>;
}
function StudyResults({session,onChange,onBack}:Props){
  const [paintingId,setPaintingId]=useState(session.order[0]);
  const [showAOI,setShowAOI]=useState(false);
  const [view,setView]=useState<'heatmap'|'scanpath'>('heatmap');
  const [coordinateMode,setCoordinateMode]=useState<'raw'|'corrected'>('raw');
  const [cursorMs,setCursorMs]=useState<number|null>(null);
  const [playing,setPlaying]=useState(false);
  const [speed,setSpeed]=useState(1);
  const [trail,setTrail]=useState(false);
  const [error,setError]=useState('');
  const [exportError,setExportError]=useState('');
  const [exportNotice,setExportNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const exportLock=useRef(false);
  const [rendering,setRendering]=useState(false);
  const holder=useRef<HTMLDivElement>(null);
  const selected=session.config.paintings.find(p=>p.paintingId===paintingId)??session.config.paintings[0];
  const correctionPlan=useMemo(()=>buildCorrectionPlan(session),[session]);
  const correctionModels=correctionPlan.models.filter(model=>model.paintingId===selected.paintingId);
  const availableModels=correctionModels.filter(model=>model.status==='available');
  const unavailableModels=correctionModels.filter(model=>model.status==='unavailable');
  const corrected=coordinateMode==='corrected'&&availableModels.length>0;
  const correctedSession=useMemo(()=>correctionPlan.available?applyCorrection(session,correctionPlan).session:null,[session,correctionPlan]);
  const displayedSession=corrected?correctedSession!:session;
  const pathParams=session.scanpath??defaultScanpath;
  const extent=scanpathExtent(session,selected.paintingId);
  const endMs=cursorMs??extent.durationMs;
  const fromMs=trail?Math.max(0,endMs-5000):0;
  useEffect(()=>{setPlaying(false);setCursorMs(null)},[selected.paintingId,session.sessionId]);
  useEffect(()=>{setCoordinateMode('raw')},[session.sessionId]);
  useEffect(()=>{
    if(!playing||view!=='scanpath')return;
    let position=cursorMs??0;let last=performance.now();
    const timer=window.setInterval(()=>{
      const now=performance.now();position=Math.min(extent.durationMs,position+(now-last)*speed);last=now;
      setCursorMs(position);if(position>=extent.durationMs)setPlaying(false);
    },100);
    return()=>clearInterval(timer);
  },[playing,speed,view,extent.durationMs]);
  useEffect(()=>{
    if(session.status==='active')return;
    let cancelled=false;
    setRendering(true);setError('');holder.current?.replaceChildren();
    const timer=window.setTimeout(()=>{
      const drawing=view==='heatmap'
        ?corrected?renderCorrectedHeatmap(session,selected,session.heatmap,showAOI,correctionPlan):renderHeatmap(session,selected,session.heatmap,showAOI)
        :corrected?renderCorrectedScanpath(session,selected,pathParams,{showAOI,fromMs,toMs:endMs},correctionPlan):renderScanpath(session,selected,pathParams,{showAOI,fromMs,toMs:endMs});
      drawing.then(canvas=>{
        if(cancelled)return;
        canvas.style.width='100%';canvas.style.height='auto';canvas.setAttribute('aria-label',`${selected.title} ${corrected?'参考校正':'原始记录'} ${view==='heatmap'?'摄像头视线估计密度图':'摄像头视线估计轨迹'}`);
        holder.current?.replaceChildren(canvas);
      }).catch(err=>{if(!cancelled)setError(String(err));}).finally(()=>{if(!cancelled)setRendering(false);});
    },view==='scanpath'?0:150);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[session,selected,showAOI,view,endMs,fromMs,pathParams,corrected,correctionPlan]);
  if(session.status==='active')return <section className="panel"><h2>回看暂不可用</h2><p>完成观看与问答后才能查看结果，避免改变后续观看策略。</p></section>;
  const samples=eligibleSamples(displayedSession,selected.paintingId);
  const timings=session.timings.filter(t=>t.paintingId===selected.paintingId);
  const active=timings.reduce((n,t)=>n+t.activeMs,0),wall=timings.reduce((n,t)=>n+t.wallMs,0);
  const allSamples=session.samples.filter(s=>s.phase==='free_view'&&s.paintingId===selected.paintingId&&!s.paused);
  const rate=actualSampleRate(session,selected.paintingId);
  const sceneOrder=session.order.map(id=>session.config.paintings.find(p=>p.paintingId===id)?.title??id).join(' → ');
  const commonQuestionnaire=session.assignment?.questionVariant==='common'||(!session.assignment&&session.config.questionnaireVersion==='common-viewing-v1');
  const questionLabel=session.pilot?'三种讲解方式共同问卷':commonQuestionnaire?'共同问卷':session.assignment?`${session.assignment.questionVariant==='alpha'?'甲':'乙'}（${session.assignment.questionVariant}）`:'未记录分组（旧会话或自定义配置）';
  const execute=async(fn:()=>void|Promise<void>,notice='')=>{
    if(exportLock.current)return;
    exportLock.current=true;setBusy(true);setPlaying(false);setExportError('');setExportNotice('');
    try{await fn();setExportNotice(notice);}
    catch(err){setExportError(`导出未完成：${err instanceof Error?err.message:String(err)} 请重试；若仍失败，可先下载下方的 CSV 和 JSON 文件。`);}
    finally{exportLock.current=false;setBusy(false);}
  };
  return <section className="results" aria-label="研究者结果页">
    <header className="results-header"><div><p className="eyebrow">研究者工作区 · 本机记录</p><h1>{corrected?'参考校正 · ':''}{view==='heatmap'?'摄像头视线估计密度图':'摄像头视线估计轨迹（Scan path）'}</h1><p>{session.participantId} · {session.mode==='preview'?'预览模式':'正式研究'} · {session.status==='interrupted'?'中断记录':'已完成'} · {new Date(session.startedUtc).toLocaleString('zh-CN')}</p></div><button onClick={onBack}>返回会话列表</button></header>
    <p aria-label="本次分组">观看顺序：{sceneOrder} · 题本：{questionLabel}</p>
    <section className="completion-export" aria-label="导出并发送研究数据" aria-busy={busy}>
      <h2>{session.status==='interrupted'?'本次测试已中断，可导出已保存记录':'测试已完成，谢谢参与'}</h2>
      <p>数据保存在你当前使用的浏览器里，不会自动上传。请下载下面的 ZIP 文件，再通过你与研究者约定的方式发送给对方。</p>
      <button className="primary" disabled={busy} onClick={()=>void execute(()=>exportZip(session),`已请求浏览器下载 ${exportPrefix(session)}.zip。请在下载文件夹确认文件已保存，再将整个 ZIP 发给研究者。`)}>{busy?'正在生成导出，请稍候…':'一键下载 ZIP（含密度图、轨迹图与所有记录）'}</button>
      <p className="muted">一个 ZIP 保留原始采样、回答、{session.background?'背景问卷、':''}验证与流程记录、密度图和轨迹图；有足够参考点时，另含参考校正图、派生坐标和所用参数。无须逐个下载，也无须解压。发送前请保留本机记录，勿清除浏览器网站数据。</p>
      {exportNotice&&<p role="status" className="notice">{exportNotice}</p>}
      {exportError&&<p role="alert" className="error">{exportError}</p>}
    </section>
    {session.pilot&&<><PilotSegmentReview session={session}/><PilotComparison session={session}/></>}
    {(session.background||commonQuestionnaire)&&<details aria-label="研究者问卷记录"><summary>研究者：背景与问卷分析说明</summary>
      {session.background&&<dl>{session.background.questions.map(question=>{const value=session.background!.answers[question.id];return <div key={question.id}><dt>{question.prompt}</dt><dd>{question.options?.find(option=>option.id===String(value))?.label??String(value)}</dd></div>})}</dl>}
      {commonQuestionnaire&&<p>讲解前第 1–3 题记录参与者自主陈述的理解、需求与疑问；第 4 题是定向追问，第 5 题为困难分类。定向追问后出现的关系解释不能作为自发发现。讲解前后是同一人的两个阶段，不是对照组与实验组；仅凭前后变化不能认定讲解有效。请逐人、逐景对应原先的解释与疑问、卡片反馈，再提出内容修改建议。</p>}
    </details>}
    <div className="notice"><strong>{qualityText(session)}</strong>{view==='heatmap'?<p>每个预测样本权重为 1。图表示预测样本密度，不代表精确注视时长。各图独立归一化；红色不能直接跨人比较。</p>:<p>轨迹按原有样本的时间顺序绘制；颜色表示先后，圆点大小固定。缺失和中断处断线；不把采样点称为注视或扫视事件。</p>}{legacyUnassessed(session)&&<p>这份旧记录的验证均为“待判断”，没有设置误差合格线；旧版继续按钮将其标记为低质量。此处补充说明，原始标签、记录与配置保持原样；并不代表验证已经通过。</p>}{session.qualityNotes.map((note,index)=><p key={index}>{note}</p>)}</div>
    <div className="view-switch" aria-label="回看类型">
      <button aria-pressed={view==='heatmap'} onClick={()=>{setView('heatmap');setPlaying(false)}}>密度图</button>
      <button aria-pressed={view==='scanpath'} onClick={()=>setView('scanpath')}>Scan path · 估计轨迹</button>
    </div>
    <section className="correction-panel" aria-label="坐标校正说明">
      <div className="view-switch" role="group" aria-label="坐标显示方式">
        <button aria-pressed={!corrected} onClick={()=>{setCoordinateMode('raw');setPlaying(false)}}>原始记录</button>
        <button aria-pressed={corrected} disabled={!availableModels.length} onClick={()=>{setCoordinateMode('corrected');setPlaying(false)}}>参考校正</button>
      </div>
      <p>{corrected?'当前显示：事后参考校正。':'当前显示：原始记录。'}参考校正按每段观看前、同一校准版本的最近三点检查估算整体平移，保留轨迹的形状与尺度；不会改写原始采样或质量判定。</p>
      {availableModels.length>0?<>
        <p className="muted">这是对保存记录的偏移估计，不是新的独立准确度验证；同一画面的个别位置仍可能偏离，部分点也可能变差。</p>
        {availableModels.map(model=><p key={model.trialId} className="correction-source">{model.trialId}：x {model.offsetX!>=0?'+':''}{model.offsetX!.toFixed(1)} px，y {model.offsetY!>=0?'+':''}{model.offsetY!.toFixed(1)} px；参考检查 {model.runId}。</p>)}
        {unavailableModels.length>0&&<p className="notice">本画只有部分试次可参考校正。校正图仅显示有依据的试次；其余记录仍保留在原始视图和原始 CSV 中。</p>}
      </>:<p className="notice">本画暂无可用的参考校正，继续显示原始记录。需要同一校准版本、观看前的三点检查和对应画面几何记录。</p>}
      {unavailableModels.map(model=><p key={model.trialId} className="muted">{model.trialId}：{model.reason}</p>)}
    </section>
    <div className="results-controls">
      <label>画作<select aria-label="画作" value={selected.paintingId} onChange={e=>{setPaintingId(e.target.value);setCoordinateMode('raw')}}>{session.config.paintings.map(p=><option key={p.paintingId} value={p.paintingId}>{p.title}</option>)}</select></label>
      {view==='heatmap'?<>
      <label>叠加透明度 {Math.round(session.heatmap.opacity*100)}%<input aria-label="叠加透明度" type="range" min="0" max="1" step="0.05" value={session.heatmap.opacity} onChange={e=>onChange({...session,heatmap:{...session.heatmap,opacity:Number(e.target.value)}})}/></label>
      <label>核宽 σ {session.heatmap.kernelPx} px<input aria-label="核宽" type="range" min="6" max="80" step="2" value={session.heatmap.kernelPx} onChange={e=>onChange({...session,heatmap:{...session.heatmap,kernelPx:Number(e.target.value)}})}/></label>
      </>:<>
      <label>轨迹显示间隔<select aria-label="轨迹显示间隔" value={pathParams.displayIntervalMs} onChange={e=>{setPlaying(false);onChange({...session,scanpath:{...pathParams,displayIntervalMs:Number(e.target.value)}})}}><option value="0">全部真实样本</option><option value="100">约每 0.1 秒一个真实样本</option><option value="200">约每 0.2 秒一个真实样本</option><option value="500">约每 0.5 秒一个真实样本</option><option value="1000">约每 1 秒一个真实样本</option></select></label>
      <label>编号密度<select aria-label="轨迹编号密度" value={pathParams.numberEvery} onChange={e=>onChange({...session,scanpath:{...pathParams,numberEvery:Number(e.target.value)}})}><option value="1">每个显示点</option><option value="5">每 5 个显示点</option><option value="10">每 10 个显示点</option><option value="0">隐藏编号</option></select></label>
      </>}
      <label className="inline"><input type="checkbox" checked={showAOI} onChange={e=>setShowAOI(e.target.checked)}/>显示粗 AOI（仅回看）</label>
    </div>
    {view==='scanpath'&&<div className="playback-panel">
      <p>连线、颜色和编号展示时间顺序。每个点是库输出的估计样本，圆点大小固定；不代表已识别的注视事件。显示抽稀只选取原有样本，CSV 保留全部回调。</p>
      <div className="playback-controls">
        <button disabled={!samples.length||extent.durationMs<=0} onClick={()=>{if(playing)setPlaying(false);else{if(cursorMs===null||cursorMs>=extent.durationMs)setCursorMs(0);setPlaying(true)}}}>{playing?'暂停回放':'播放轨迹'}</button>
        <button onClick={()=>{setPlaying(false);setCursorMs(null);setTrail(false)}}>显示完整轨迹</button>
        <label>速度<select aria-label="回放速度" value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label>
        <label className="check"><input type="checkbox" checked={trail} onChange={e=>setTrail(e.target.checked)}/>只看最近 5 秒</label>
      </div>
      <label>时间 {(endMs/1000).toFixed(1)} / {(extent.durationMs/1000).toFixed(1)} 秒<input aria-label="轨迹时间" type="range" min="0" max={Math.max(1,extent.durationMs)} step="1" value={endMs} disabled={extent.durationMs<=0} onChange={e=>{setPlaying(false);setCursorMs(Number(e.target.value))}}/></label>
      <p className="muted">时间从本画首次展示开始，包含暂停与重复展示的间隔。null、画外、暂停、长缺口或校准/显示几何改变时断线，不补点。完整轨迹 PNG 导出包含全时段；当前回放窗口仅用于回看。</p>
    </div>}
    <div className="metrics"><div><strong>{samples.length}</strong><span>{corrected?'参考校正后画内样本':'画内有效样本'}</span></div><div><strong>{allSamples.length}</strong><span>全部非暂停回调（含 null）</span></div><div><strong>{(active/1000).toFixed(2)} s</strong><span>有效展示 / 墙钟 {(wall/1000).toFixed(2)} s</span></div><div><strong>{rate===null?'—':rate.toFixed(2)} Hz</strong><span>按实际展示时长统计回调率</span></div></div>
    {error&&<p role="alert" className="error">{error}</p>}
    {rendering&&<p role="status">正在从保存的样本重绘…</p>}
    <div ref={holder} className="heatmap-canvas"/>
    {!samples.length&&<p className="notice">{corrected?'当前参考校正范围没有画内样本。':'无可用数据。'}保留原画和质量说明，不生成占位热点。</p>}
    <div className="export-actions"><button disabled={busy} onClick={()=>void execute(async()=>{const canvas=corrected?await renderCorrectedHeatmap(session,selected,session.heatmap,false,correctionPlan):await renderHeatmap(session,selected,session.heatmap,false);downloadFile(`${exportPrefix(session)}_${corrected?'corrected_':''}heatmap_${selected.paintingId}.png`,await canvasPNG(canvas));})}>{corrected?'下载本画参考校正密度图 PNG':'下载本画密度图 PNG'}</button><button disabled={busy} onClick={()=>void execute(async()=>{const canvas=corrected?await renderCorrectedScanpath(session,selected,pathParams,{},correctionPlan):await renderScanpath(session,selected,pathParams);downloadFile(`${exportPrefix(session)}_${corrected?'corrected_':''}scanpath_${selected.paintingId}.png`,await canvasPNG(canvas));})}>{corrected?'下载本画参考校正完整轨迹 PNG':'下载本画完整轨迹 PNG'}</button></div>
    <p className="muted">单图 PNG 跟随当前原始／参考校正选择；ZIP 同时保留原始数据和可用的参考校正结果。导出图默认不含 AOI 框：密度图使用当前核宽与透明度，轨迹图使用当前显示间隔和编号密度并包含完整时段。参数、分辨率及筛选规则写入 session.json；旧会话也能从已保存的采样生成轨迹。</p>
    <div className="export-actions">{['gaze_samples.csv','phase_events.csv','responses.csv','validation.csv','session.json',...(session.background?['background.csv']:[]),...(session.pilot?PILOT_DATA_FILES:[])].map(name=><button className="secondary" key={name} disabled={busy} onClick={()=>void execute(()=>downloadFile(`${exportPrefix(session)}_${name}`,buildTextExportFiles(session)[name]))}>{name}</button>)}</div>
    <details><summary>独立验证与漂移检查</summary><p>该会话冻结的合格线：{validationRuleText(session.config.validation)}</p><p>误差为预测点到目标的欧氏距离（CSS px）的中位数；相对误差以视口对角线归一化。预热期样本不进入判断。</p><div className="table-scroll"><table><thead><tr><th>运行 / 类型</th><th>校准版本</th><th>整体中位误差</th><th>对角线比例</th><th>状态</th><th>各目标有效样本 / 中位误差</th></tr></thead><tbody>{session.validationSummaries.map(v=><tr key={v.runId}><td>{v.runId}<br/>{v.kind}</td><td>{v.calibrationVersion}</td><td>{v.medianErrorPx?.toFixed(1)??'—'} px</td><td>{v.errorDiagonalRatio===null?'—':(v.errorDiagonalRatio*100).toFixed(1)+'%'}</td><td>{{pass:'符合冻结阈值',fail:'未通过',judgment:'质量未判定'}[v.status]}{validationExplanation(v,session.config.validation).map((reason,i)=><p key={i}>{reason}</p>)}</td><td>{v.targets.map(t=><div key={t.targetId}>{t.targetId}: {t.n} / {t.medianErrorPx?.toFixed(1)??'—'} px</div>)}</td></tr>)}</tbody></table></div></details>
    <details><summary>{commonQuestionnaire?'研究者编码参考与回答':'研究者评分参考与回答'}</summary><p>{commonQuestionnaire?'按同一人、同一场景对应解释、疑问与卡片反馈，并区分自主陈述和定向追问。':'评分仅供研究者离线判断；系统不推断参与者哪里没有理解。'}</p>{session.config.paintings.map(p=><section key={p.paintingId}><h3>{p.title}</h3>{[...p.pre,...p.post].map(q=><p key={q.id}><strong>{q.prompt}</strong><br/>{q.scoring}</p>)}{!commonQuestionnaire&&<><h4>访谈参考</h4>{p.interview.map(q=><p key={q}>{q}</p>)}</>}</section>)}<div className="table-scroll"><table><thead><tr><th>画作 / 阶段</th><th>题号</th><th>原话</th><th>信心</th><th>跳过 / 不知道</th></tr></thead><tbody>{session.responses.map((r,i)=><tr key={i}><td>{r.paintingId??'—'} / {r.phase}</td><td>{r.questionId}</td><td style={{whiteSpace:'pre-wrap'}}>{r.answer}</td><td>{r.confidence??'—'}</td><td>{r.skipped?'跳过':r.unknown?'不知道':'—'}</td></tr>)}</tbody></table></div></details>
    <details><summary>既有热图参考（独立资料）</summary><p>既有 R01–R09 热图仅为研究者另行保存的设计资料，本网站没有将其导入刺激或采样数据，也不会随本次参与者记录导出。</p></details>
  </section>;
}
export default Results;
