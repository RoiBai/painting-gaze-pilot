import type {BackgroundAnswers} from './types';
import {BACKGROUND_QUESTIONS} from './background';

export interface BackgroundDraft {studyField:string;artEducation:''|BackgroundAnswers['artEducation'];paintingInterest:''|BackgroundAnswers['paintingInterest']}
export const emptyBackground=():BackgroundDraft=>({studyField:'',artEducation:'',paintingInterest:''});
export function backgroundComplete(value:BackgroundDraft):value is BackgroundAnswers {
 return !!value.studyField.trim()&&['none','short','long'].includes(value.artEducation)&&[1,2,3,4,5].includes(Number(value.paintingInterest));
}

export default function BackgroundFields({value,onChange}:{value:BackgroundDraft;onChange:(next:BackgroundDraft)=>void}){
 const field=BACKGROUND_QUESTIONS.find(q=>q.id==='studyField')!;
 const education=BACKGROUND_QUESTIONS.find(q=>q.id==='artEducation')!;
 const interest=BACKGROUND_QUESTIONS.find(q=>q.id==='paintingInterest')!;
 return <fieldset className="background-fields"><legend>了解背景</legend><p className="muted">请填写以下三题。每位参与者只需填写一次，无需姓名或单位名称。</p>
  <label>{field.prompt}<input aria-label={field.prompt} type="text" autoComplete="off" value={value.studyField} placeholder="例如：计算机、教育、商业、艺术……" onChange={e=>onChange({...value,studyField:e.target.value})}/></label>
  <div className="grid two">
   <label>{education.prompt}<select aria-label={education.prompt} value={value.artEducation} onChange={e=>onChange({...value,artEducation:e.target.value as BackgroundDraft['artEducation']})}><option value="" disabled>请选择</option>{education.options?.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
   <label>{interest.prompt}<select aria-label={interest.prompt} value={value.paintingInterest} onChange={e=>onChange({...value,paintingInterest:Number(e.target.value) as BackgroundAnswers['paintingInterest']})}><option value="" disabled>请选择</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}{n===1?` · ${interest.scale?.minLabel}`:n===5?` · ${interest.scale?.maxLabel}`:''}</option>)}</select><span className="muted">1＝完全没有兴趣，5＝非常有兴趣</span></label>
  </div>
 </fieldset>;
}
