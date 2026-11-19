import {useEffect,useReducer,useRef,useState} from 'react';
import {workloadLabels} from './pilotQuestions';
import {recallComplete,submitSurveyPage,supplementalQuestions,surveyForScene,workloadComplete,workloadIds} from './pilotSurvey';
import type {Painting,Question,Session} from './types';

interface Props {
  session:Session;
  painting:Painting;
  onSave:(submitted:boolean)=>void;
  onComplete:()=>void;
}

function Scale({question,value,onChange}:{question:Question;value:string;onChange:(value:string)=>void}){
  const {min,max,step,lowLabel,highLabel}=question.ratingScale!;
  return <label className="rating-field">{question.prompt}
    <select aria-label={question.prompt} value={value} onChange={e=>onChange(e.target.value)}>
      <option value="">请选择评分</option>
      {Array.from({length:1+(max-min)/step},(_,i)=>min+i*step).map(n=><option key={n} value={n}>{n}</option>)}
    </select>
    <small>{min}＝{lowLabel}　{max}＝{highLabel}</small>
  </label>;
}

export default function PilotSurvey({session,painting,onSave,onComplete}:Props){
  const [survey]=useState(()=>surveyForScene(session,painting));
  const [,render]=useReducer(n=>n+1,0);
  const advanced=useRef(false);
  const page=survey.workloadSubmittedMs===null?'workload':survey.recallSubmittedMs===null?'recall':'supplemental';
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{
    heading.current?.focus();
  },[page]);

  // A refresh may happen after the last submission has saved but before the
  // engine advances to the next scene. Continue that already-submitted page.
  useEffect(()=>{
    if(survey.supplementalSubmittedMs!==null && !advanced.current){
      advanced.current=true;
      onComplete();
    }
  },[onComplete,survey,survey.supplementalSubmittedMs]);

  function save(submitted=false){
    onSave(submitted);
    render();
  }
  function submit(e:React.FormEvent){
    e.preventDefault();
    const time=performance.timeOrigin-session.timeOrigin+performance.now();
    if(submitSurveyPage(session,painting,page,time))save(true);
  }
  const ready=page==='workload'?workloadComplete(survey):page==='recall'?recallComplete(painting,survey):true;
  return <form className="pilot-survey" onSubmit={submit}>
    <h1 ref={heading} tabIndex={-1}>{page==='workload'?'观看感受':page==='recall'?'画面回忆':'补充反馈'}</h1>
    {page==='workload'&&<>
      <p>请只回想刚才看画和读讲解的过程，根据你的实际感受评分。</p>
      {workloadIds.map(id=>{
        const question=painting.pre.find(q=>q.id===id)!;
        return <fieldset key={id}>
          <legend>{workloadLabels[id]}</legend>
          <Scale question={question} value={survey.workload[id]?.toString()??''} onChange={value=>{
            if(value==='')delete survey.workload[id];
            else survey.workload[id]=Number(value);
            save();
          }}/>
        </fieldset>;
      })}
    </>}
    {page==='recall'&&<>
      <p>请回想刚才看到的画面和讲解。每题写几个字即可。想不起来时，可以选『记不清』。</p>
      {painting.recallQuestions!.map((question,i)=>{
        const answer=survey.recall[question.id]??{text:'',unknown:false};
        return <fieldset key={question.id}>
          <legend>第 {i+1} 题</legend>
          <label>{question.prompt}
            <textarea rows={2} value={answer.text} disabled={answer.unknown} onChange={e=>{
              survey.recall[question.id]={text:e.target.value,unknown:false};save();
            }}/>
          </label>
          <label className="check"><input type="checkbox" checked={answer.unknown} aria-label={'第 '+(i+1)+' 题记不清'} onChange={e=>{
            survey.recall[question.id]={text:'',unknown:e.target.checked};save();
          }}/>记不清</label>
        </fieldset>;
      })}
    </>}
    {page==='supplemental'&&<>
      <p>请评价刚才的整体体验，也可以补充你的理解或疑问。可以留空。</p>
      {supplementalQuestions(painting).map(question=>{
        const value=survey.supplemental[question.id]??'';
        const edit=(text:string)=>{survey.supplemental[question.id]=text;save()};
        return <div key={question.id}>{question.ratingScale?<Scale question={question} value={value} onChange={edit}/>:
          <label>{question.prompt}<textarea rows={2} value={value} onChange={e=>edit(e.target.value)}/></label>}</div>;
      })}
    </>}
    <div className="actions"><button type="submit" className="primary" disabled={!ready}>
      {page==='workload'?'提交观看感受':page==='recall'?'提交画面回忆':'完成补充反馈'}
    </button></div>
  </form>;
}
