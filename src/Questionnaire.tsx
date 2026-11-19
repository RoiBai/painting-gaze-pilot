import {useRef,useState} from 'react';
import type {Question,ResponseRow} from './types';

export type Answer=Pick<ResponseRow,'questionId'|'answer'|'confidence'|'unknown'|'skipped'|'selectedOptions'|'otherText'>&{durationMs:number};
interface Props {initialIndex?:number;questions:Question[];title:string;confidence?:boolean;onAnswer:(answer:Answer)=>void;onComplete:()=>void}

export default function Questionnaire({initialIndex=0,questions,title,confidence=true,onAnswer,onComplete}:Props){
 const [index,setIndex]=useState(initialIndex);
 const [answer,setAnswer]=useState('');
 const [certainty,setCertainty]=useState<number|null>(null);
 const [unknown,setUnknown]=useState(false);
 const [selected,setSelected]=useState<string[]>([]);
 const [otherText,setOtherText]=useState('');
 const started=useRef(performance.now());
 const q=questions[index];
 const multiple=q.type==='multi-select';
 const needsConfidence=q.confidence??confidence;
 const options=q.options??[];
 const selectedIds=options.filter(option=>selected.includes(option.id)).map(option=>option.id);
 const hasAnswer=multiple?selectedIds.length>0:unknown||!!answer.trim();
 const canContinue=(hasAnswer||q.optional)&&(!needsConfidence||certainty!==null||!hasAnswer);

 function toggle(id:string,checked:boolean){
  const option=options.find(value=>value.id===id)!;
  if(checked&&option.exclusive){setSelected([id]);setOtherText('');return}
  setSelected(previous=>checked?[...previous.filter(value=>!options.find(item=>item.id===value)?.exclusive&&value!==id),id]:previous.filter(value=>value!==id));
  if(!checked&&id===q.otherOptionId)setOtherText('');
 }
 function next(skipped=false){
  const chosenText=selectedIds.includes(q.otherOptionId??'')?otherText:'';
  const response=multiple?options.filter(option=>selectedIds.includes(option.id)).map(option=>option.id===q.otherOptionId&&chosenText.trim()?`${option.label}：${chosenText}`:option.label).join('；'):answer;
  onAnswer({questionId:q.id,answer:response,confidence:needsConfidence?certainty:null,unknown:multiple?false:unknown,skipped:skipped||(!hasAnswer&&!!q.optional),durationMs:performance.now()-started.current,...(multiple?{selectedOptions:selectedIds,otherText:chosenText}:{})});
  if(index===questions.length-1){onComplete();return}
  setIndex(index+1);setAnswer('');setCertainty(null);setUnknown(false);setSelected([]);setOtherText('');started.current=performance.now();
 }
 return <>
  <div className="eyebrow">{index+1} / {questions.length} · 请按自己的理解回答{q.optional?' · 选答':''}</div>
  <h1>{title}</h1><h2>{q.prompt}</h2>
  {q.description&&<p className="question-help">{q.description}</p>}
  {q.ratingScale?<label className="rating-field">请选择评分
    <select aria-label={q.prompt} value={answer} onChange={e=>setAnswer(e.target.value)}>
      <option value="" disabled>请选择</option>
      {Array.from({length:1+(q.ratingScale.max-q.ratingScale.min)/q.ratingScale.step},(_,i)=>{
        const scale=q.ratingScale!;
        const score=scale.min+i*scale.step;
        return <option key={score} value={String(score)}>{score}{score===scale.min?' · '+scale.lowLabel:score===scale.max?' · '+scale.highLabel:''}</option>
      })}
    </select><small>{q.ratingScale.min}＝{q.ratingScale.lowLabel}　{q.ratingScale.max}＝{q.ratingScale.highLabel}</small>
  </label>:multiple?<fieldset className="difficulty-options"><legend>请选择符合你感受的选项（可多选）</legend>{options.map(option=><label className="check" key={option.id}><input type="checkbox" checked={selected.includes(option.id)} onChange={e=>toggle(option.id,e.target.checked)}/>{option.label}</label>)}{selected.includes(q.otherOptionId??'')&&<label>其他困难（选填）<textarea aria-label="其他困难（选填）" rows={3} value={otherText} onChange={e=>setOtherText(e.target.value)}/></label>}</fieldset>:<>
   <textarea aria-label="你的回答" rows={5} value={answer} onChange={e=>setAnswer(e.target.value)} disabled={unknown} placeholder={q.allowUnknown===false?'请用自己的话回答':'用自己的话回答，或选择“不知道”'}/>
   {(q.allowUnknown??true)&&<label className="check"><input type="checkbox" checked={unknown} onChange={e=>{setUnknown(e.target.checked);if(e.target.checked)setAnswer('')}}/>不知道 / 暂时无法判断</label>}
  </>}
  {needsConfidence&&<fieldset><legend>你对这个回答有多大信心？</legend><div className="confidence">{[1,2,3,4,5].map(n=><label key={n}><input type="radio" name="confidence" value={n} checked={certainty===n} onChange={()=>setCertainty(n)}/><span>{n}</span></label>)}</div><p className="muted">1 完全没有把握 — 5 非常有把握</p></fieldset>}
  <div className="actions"><button className="primary" disabled={!canContinue} onClick={()=>next()}>继续 →</button><button className="quiet" onClick={()=>next(true)}>跳过此题{q.optional?'（选答）':''}</button></div>
 </>;
}
