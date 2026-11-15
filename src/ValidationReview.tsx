import {useState} from 'react';
import type {StudyEngine} from './engine';
import {validationExplanation,validationRuleText} from './quality';

export default function Quality({engine}:{engine:StudyEngine}){
 const [diagnostic,setDiagnostic]=useState(false);
 const latest=engine.session?.samples.at(-1);
 const summary=engine.session!.validationSummaries.at(-1)!;
 const reasons=validationExplanation(summary,engine.session!.config.validation);
 return <>
  <div className="eyebrow">研究者检查 · 本轮检查的是视线估计记录</div>
  <h1>{summary.status==='pass'?'达到已设定标准':summary.status==='fail'?'本轮验证未通过':'质量未判定'}</h1>
  <p className="notice">本会话合格线：{validationRuleText(engine.session!.config.validation)}。用于粗区域先导筛选；通过不代表可准确区分相邻细节。</p>
  <div className={`notice ${summary.status==='fail'?'error':''}`} role="status">
   {reasons.map((reason,i)=><p key={i}>{reason}</p>)}
   {summary.status==='judgment'&&<p>可以继续记录。结果会保留“未判定”，不会标成低质量或合格。</p>}
   {summary.status==='fail'&&<p>请先检查光照、坐姿和面部检测，再重新校准。也可以保留未通过标记继续试用。</p>}
  </div>
  <p>整体中位误差 <strong>{summary.medianErrorPx?.toFixed(1)??'无数据'} CSS px</strong> · 视口对角线比例 {summary.errorDiagonalRatio==null?'无数据':`${(summary.errorDiagonalRatio*100).toFixed(2)}%`}</p>
  <table><thead><tr><th>目标</th><th>有效样本</th><th>中位误差（CSS px）</th></tr></thead><tbody>{summary.targets.map(t=><tr key={t.targetId}><td>{Number(t.targetId)+1}</td><td>{t.n}</td><td>{t.medianErrorPx?.toFixed(1)??'无数据'}</td></tr>)}</tbody></table>
  <p className="muted">这是对本轮摄像头记录的检查。零样本和样本不足不会被判为通过；尚未设置误差合格线时，不能判断定位是否合格。每次重新校准会记录新的版本。</p>
  <details open={diagnostic} onToggle={e=>setDiagnostic(e.currentTarget.open)}>
   <summary>研究者：真实预测接通检查</summary>
   <p>保持鼠标不动，用眼睛依次看下面左、中、右三个大目标。观察库输出坐标是否随视线变化；这只是接通检查，不是精度证明。</p>
   <div className="diagnostic-targets"><b>左 ●</b><b>中 ●</b><b>右 ●</b></div>
   <p>当前库回调：x = {latest?.viewportX?.toFixed(1)??'null'}，y = {latest?.viewportY?.toFixed(1)??'null'}（CSS px） · {engine.camera.message}</p>
  </details>
  <div className="actions">
   <button onClick={()=>void engine.calibrate()}>重新校准</button>
   {engine.camera.status==='error'&&<button onClick={()=>void engine.startCamera().then(()=>engine.calibrate())}>重新连接摄像头并校准</button>}
   {summary.status==='pass'&&<button className="primary" onClick={()=>engine.acceptQuality(false)}>继续</button>}
   {summary.status==='judgment'&&<button className="primary" onClick={()=>engine.acceptQuality(false)}>保留“未判定”，继续记录</button>}
   {summary.status==='fail'&&<button className="quiet" onClick={()=>engine.acceptQuality(true)}>研究者：标记低质量后继续</button>}
  </div>
 </>;
}
