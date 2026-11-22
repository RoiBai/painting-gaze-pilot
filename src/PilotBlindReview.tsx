import {useRef,useState} from 'react';
import type {Session} from './types';
import {exportZip,isPracticeSession} from './export';
import {readSessionArchive} from './importSession';
import {recallRows} from './pilotSurveyRecords';
import {knownPilotSurveyVersion} from './pilotQuestions';
import {recallAnswerExamples} from './pilotRecallRubric';

export default function PilotBlindReview({onBack}:{onBack:()=>void}){
  const [session,setSession]=useState<Session|null>(null);
  const [busy,setBusy]=useState(false);
  const pending=useRef(false);
  const [message,setMessage]=useState('');
  async function load(file:File){
    if(pending.current)return;
    pending.current=true;setBusy(true);setMessage('');
    try{
      const data=readSessionArchive(new Uint8Array(await file.arrayBuffer()),file.name);
      if(isPracticeSession(data))throw Error('已略过 P00 研究者试用。请在「导入会话回看」中查看试用数据。');
      if(!knownPilotSurveyVersion(data.config.pilotSurveyVersion))throw Error('请选择使用 Pilot 2 回忆问卷的会话。');
      if(!recallRows(data).some(row=>row.submittedMs!==null))throw Error('这份会话没有已提交的回忆页。');
      setSession(data);
    }catch(error){setMessage(error instanceof Error?error.message:'读取失败，请重试。')}
    finally{pending.current=false;setBusy(false)}
  }
  function grade(paintingId:string,questionId:string,value:string){
    setSession(current=>{
      const surveys=current?.pilotSurveys;
      const survey=surveys?.[paintingId];
      if(!current||!survey||survey.recallSubmittedMs===null)return current;
      const scores={...survey.manualScores};
      if(value==='')delete scores[questionId];
      else if(value==='0'||(value==='1'&&!survey.recall[questionId]?.unknown))scores[questionId]=value==='0'?0:1;
      else return current;
      return {...current,pilotSurveys:{...surveys,[paintingId]:{...survey,manualScores:scores}}};
    });
    setMessage('');
  }
  async function save(){
    if(!session||pending.current)return;
    pending.current=true;setBusy(true);setMessage('');
    try{await exportZip(session,'_scored');setMessage('评分副本已请求下载。可以重新导入该副本继续评分。')}
    catch(error){setMessage(error instanceof Error?error.message:'下载失败，请重试。')}
    finally{pending.current=false;setBusy(false)}
  }
  // A fixed question-id order is independent of the actual scene or card order.
  const rows=session?recallRows(session).filter(r=>r.submittedMs!==null).sort((a,b)=>a.questionId.localeCompare(b.questionId)):[];
  return <main className="shell stage">
    <h1>画面回忆盲评</h1>
    {session?<>
      <p>按题意判断原文，正确或同义计 1 分，错误或「记不清」计 0 分。可以暂留空，下载副本后继续。</p>
      <p>已评 {rows.filter(row=>row.manualScore!==null).length} / {rows.length} 题</p>
      {rows.map((row,index)=><section key={row.questionId} className="panel">
        <h2>{row.questionPrompt}</h2>
        <p>参与者回答</p><blockquote style={{whiteSpace:'pre-wrap'}}>{row.rememberUnknown?'记不清':row.answer}</blockquote>
        <p>参考答案可接受{recallAnswerExamples(session.config.pilotSurveyVersion!,row.questionId).join('、')}。</p>
        <label>第 {index+1} 题人工评分
          <select value={row.manualScore??''} disabled={busy} onChange={e=>grade(row.paintingId,row.questionId,e.target.value)}>
            <option value="">尚未评分</option><option value="0">0 分</option>{!row.rememberUnknown&&<option value="1">1 分</option>}
          </select>
        </label>
      </section>)}
      <div className="actions"><button className="primary" disabled={busy} onClick={()=>void save()}>下载带评分的 ZIP 副本</button></div>
    </>:<p>选入参与者交回的 ZIP，或上次保存的评分副本。题目按独立于观看顺序的固定顺序显示。</p>}
    <label>{session?'切换会话（请先下载当前评分）':'选择本地 ZIP 或 session.json'}
      <input type="file" accept=".zip,.json" disabled={busy} onChange={e=>{
        const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file)void load(file);
      }}/>
    </label>
    {busy&&<p role="status">正在处理本地文件…</p>}{message&&<p role="status">{message}</p>}
    <button disabled={busy} onClick={onBack}>返回研究者页</button>
  </main>;
}
