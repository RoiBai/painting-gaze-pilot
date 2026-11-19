import {useState} from 'react';
import {CONDITION_LABELS, pilotRatings} from './cardMetrics';
import {readSessionArchive} from './importSession';
import type {Condition} from './types';

const conditions:Condition[] = ['sequential','random','gaze'];
type Score = ReturnType<typeof pilotRatings>[number];
type Entry = {id:string;sessionId:string;scores:Score[]};

export default function PilotGroupRatings(){
  const [entries,setEntries]=useState<Entry[]>([]);
  const [messages,setMessages]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  async function compare(files:File[]){
    setBusy(true);
    const unique=new Map<string,Entry>();
    const conflicts=new Set<string>();
    const notices:string[]=[];
    try{
      for(const file of files){
        try{
          const session=readSessionArchive(new Uint8Array(await file.arrayBuffer()),file.name);
          if(!session.pilot || session.pilot.practice || session.status!=='completed'){
            notices.push(file.name+'：请选择已完成的 P 编号参与者会话。');
            continue;
          }
          const id=session.participantId;
          if(conflicts.has(id))continue;
          const previous=unique.get(id);
          if(previous && previous.sessionId!==session.sessionId){
            unique.delete(id);
            conflicts.add(id);
            notices.push(id+' 有两次不同的会话，本次比较已略过该编号。请确认有效会话后重新选择文件。');
          }else if(!previous){
            unique.set(id,{id,sessionId:session.sessionId,scores:pilotRatings(session)});
          }
        }catch(error){notices.push(file.name+'：'+(error instanceof Error?error.message:String(error)))}
      }
      setEntries([...unique.values()].sort((a,b)=>a.id.localeCompare(b.id)));
      setMessages(notices);
    }finally{setBusy(false)}
  }
  const metrics=[{key:'overall',label:'总体体验（1–7）'},{key:'rawTLX',label:'Raw TLX（0–100）'}] as const;
  return <details>
    <summary>比较多位参与者的评分</summary>
    <p>一次选择要比较的全部 ZIP。文件只在本机读取。总体体验越高表示评分越好，Raw TLX 越高表示负荷越重。</p>
    <label>选择参与者 ZIP（可多选）<input type="file" accept=".zip" multiple disabled={busy} onChange={e=>{
      const files=Array.from(e.currentTarget.files??[]);
      e.currentTarget.value='';
      if(files.length)void compare(files);
    }}/></label>
    {busy&&<p role="status">正在读取本地评分…</p>}
    {messages.length>0&&<ul aria-label="未纳入的会话">{messages.map((m,i)=><li key={i}>{m}</li>)}</ul>}
    {entries.length>0&&<>
      <div className="table-scroll"><table aria-label="每位参与者的三个条件评分">
        <thead><tr><th>参与者</th><th>指标</th>{conditions.map(c=><th key={c}>{CONDITION_LABELS[c]}</th>)}</tr></thead>
        <tbody>{entries.flatMap(entry=>metrics.map(({key,label})=><tr key={entry.id+key}><th>{entry.id}</th><td>{label}</td>{conditions.map(c=><td key={c}>{entry.scores.find(r=>r.condition===c)?.[key]?.toLocaleString('zh-CN',{maximumFractionDigits:1})??'—'}</td>)}</tr>))}</tbody>
      </table></div>
      <div className="table-scroll"><table aria-label="三种方式的配对描述均值">
        <thead><tr><th>指标均值</th><th>三段均有评分的人数</th>{conditions.map(c=><th key={c}>{CONDITION_LABELS[c]}</th>)}</tr></thead>
        <tbody>{metrics.map(({key,label})=>{
          const matched=entries.filter(entry=>conditions.every(c=>entry.scores.find(r=>r.condition===c)?.[key]!=null));
          return <tr key={key}><th>{label}</th><td>{matched.length}</td>{conditions.map(c=><td key={c}>{matched.length?(matched.reduce((sum,e)=>sum+e.scores.find(r=>r.condition===c)![key]!,0)/matched.length).toFixed(1):'—'}</td>)}</tr>;
        })}</tbody>
      </table></div>
    </>}
  </details>;
}
