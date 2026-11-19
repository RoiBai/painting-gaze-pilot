import {useState} from 'react';
import type {Session} from './types';
import {recallRows} from './pilotSurveyRecords';

export default function PracticeDataPreview({session}:{session:Session}){
  const [table,setTable]=useState('card_exposures.csv');
  const exposures=session.cardExposures??[];
  const samples=session.samples.filter(s=>s.phase==='free_view'&&!s.paused);
  const recall=recallRows(session);
  const data=table==='gaze_samples.csv'?{
    columns:['callbackTimeMs','cardId','viewportX','viewportY','onCard'],
    rows:samples.slice(0,8).map(s=>[s.callbackTimeMs,s.cardId,s.viewportX,s.viewportY,s.onCard]),count:samples.length,
  }:table==='pilot_recall.csv'?{
    columns:['paintingId','cardPresentationOrder','questionPrompt','answer','rememberUnknown'],
    rows:recall.map(r=>[r.paintingId,r.cardPresentationOrder,r.questionPrompt,r.answer,r.rememberUnknown]),count:recall.length,
  }:{
    columns:['paintingId','condition','slot','cardId','shownMs','hiddenMs'],
    rows:exposures.slice(0,9).map(e=>[e.paintingId,e.condition,e.slot,e.cardId,e.shownMs,e.hiddenMs]),count:exposures.length,
  };
  return <details className="panel"><summary>查看本次试用的数据行</summary>
    <label>预览的数据表<select value={table} onChange={e=>setTable(e.target.value)}>
      <option value="card_exposures.csv">卡片出现记录 · card_exposures.csv</option>
      <option value="gaze_samples.csv">观看期间的视线 · gaze_samples.csv</option>
      <option value="pilot_recall.csv">画面回忆原文 · pilot_recall.csv</option>
    </select></label>
    <p className="muted">{data.rows.length} / {data.count} 行，显示部分原始字段。时间单位为毫秒，视口坐标单位为 CSS 像素，缺失值留空。</p>
    {data.rows.length>0?<div className="table-scroll"><table aria-label="试用数据行"><thead><tr>{data.columns.map(c=><th key={c}>{c}</th>)}</tr></thead>
      <tbody>{data.rows.map((row,i)=><tr key={i}>{row.map((v,j)=><td key={j}>{v==null?'':String(v)}</td>)}</tr>)}</tbody></table></div>:
      <p>本次试用没有记录到符合该表条件的数据。</p>}
  </details>;
}
