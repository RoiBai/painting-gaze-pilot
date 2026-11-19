import {useMemo} from 'react';
import type {Session} from './types';
import {cardAttention, CONDITION_LABELS, pilotRatings} from './cardMetrics';

const seconds=(value:number|null)=>value===null?'—':(value/1000).toFixed(2);
const percent=(value:number|null)=>value===null?'—':(value*100).toFixed(1)+'%';

export default function PilotComparison({session}:{session:Session}) {
  const attention=useMemo(()=>cardAttention(session),[session]);
  const ratings=useMemo(()=>pilotRatings(session),[session]);
  return <section aria-label="三种讲解方式比较">
    <h2>本次三段体验</h2>
    <div className="table-scroll"><table>
      <thead><tr><th>场景 / 讲解方式</th><th>体验评分（1–7）</th><th>Raw TLX（0–100）</th><th>卡片内估计时长</th><th>占有效观测时间</th></tr></thead>
      <tbody>{ratings.map(rating=>{
        const exposures=attention.filter(row=>row.paintingId===rating.paintingId && row.condition===rating.condition);
        const observed=exposures.reduce((sum,row)=>sum+row.observedMs,0);
        const onCard=exposures.reduce((sum,row)=>sum+(row.onCardMs??0),0);
        return <tr key={rating.paintingId}>
          <td>{rating.period}. {session.config.paintings.find(p=>p.paintingId===rating.paintingId)?.title} · {rating.conditionLabel}</td>
          <td>{rating.overall??'—'}</td><td>{rating.rawTLX?.toFixed(1)??'—'}</td>
          <td>{observed>0?seconds(onCard)+' 秒':'—'}</td><td>{percent(observed>0?onCard/observed:null)}</td>
        </tr>;
      })}</tbody>
    </table></div>
    <p className="muted">体验评分越高表示整体体验越好。Raw TLX 为六项完整回答的平均值，数值越高表示负荷越重。卡片占比按卡片可见期间有连续有效视线估计的时长计算。缺少可计算区间时显示“—”。</p>
    <details><summary>查看逐卡的显示和视线记录</summary>
      <div className="table-scroll"><table>
        <thead><tr><th>场景 / 卡片</th><th>方式</th><th>显示时长（秒）</th><th>有效观测（秒）</th><th>卡片内（秒）</th><th>卡片内占比</th></tr></thead>
        <tbody>{attention.map(row=>{
          const scene=session.config.paintings.find(p=>p.paintingId===row.paintingId);
          return <tr key={row.exposureId}>
            <td>{scene?.title} · {scene?.cards.find(card=>card.id===row.cardId)?.title??row.cardId}</td>
            <td>{CONDITION_LABELS[row.condition]}</td><td>{seconds(row.visibleMs)}</td><td>{seconds(row.observedMs)}</td>
            <td>{seconds(row.onCardMs)}</td><td>{percent(row.onCardShare)}</td>
          </tr>;
        })}</tbody>
      </table></div>
      <p className="muted">屏幕坐标和卡片边界均使用浏览器 CSS 像素。暂停后重新显示的卡片会产生新的显示记录。表中使用原始视线估计，详细时间、位置、选卡原因与覆盖率见 ZIP。</p>
    </details>
  </section>;
}
