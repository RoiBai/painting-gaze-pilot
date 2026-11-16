import {FOUR_PERSON_PLAN} from './assignment';
import {publicAssetUrl} from './assets';
import {commonQuestions} from './commonQuestionnaire';
import {BACKGROUND_QUESTIONS} from './background';

export default function AssignmentPreview({durationSeconds=60}:{durationSeconds?:number}){
 const qs=commonQuestions['ming-xingle-archery'];
 return <section className="assignment-preview" aria-labelledby="assignment-title">
  <h3 id="assignment-title">N03–N06 · 共同问卷与观看顺序</h3>
  <p>两人先看射箭，两人先看蹴鞠。所有参与者使用同一套问题，每景观看 {durationSeconds} 秒后依次回答五题，阅读两张固定讲解卡，再回答两道反馈题。</p>
  <div className="table-scroll"><table aria-label="观看顺序安排"><thead><tr><th>编号 / 测试链接</th><th>第一景</th><th>第二景</th><th>问卷</th></tr></thead><tbody>{FOUR_PERSON_PLAN.map(row=><tr key={row.participantId}><td><a href={`${publicAssetUrl('/')}?participant=${row.participantId}`} target="_blank" rel="noreferrer">{row.participantId} ↗</a></td><td>{row.order==='AB'?'射箭':'蹴鞠'}</td><td>{row.order==='AB'?'蹴鞠':'射箭'}</td><td>共同问卷</td></tr>)}</tbody></table></div>
  <p className="muted">把对应编号的链接发给参与者即可。链接使用网站默认设置；本页临时更改的设置只用于当前页面。选择自定顺序时，也可用 N01、N02 参与相同问卷。</p>
  <details className="question-preview" open><summary>查看背景题和完整共同问卷（研究者预览）</summary>
   <section className="question-form"><h4>开始前 · 了解背景（每人一次）</h4><ol>{BACKGROUND_QUESTIONS.map(q=><li key={q.id}>{q.prompt}{q.options&&<p className="muted">{q.options.map(option=>option.label).join('／')}</p>}{q.scale&&<p className="muted">{q.scale.min}＝{q.scale.minLabel}，{q.scale.max}＝{q.scale.maxLabel}</p>}</li>)}</ol></section>
   <section className="question-form"><h4>观看 {durationSeconds} 秒后 · 五道共同问题</h4><ol>{qs.pre.map(q=><li key={q.id}><p>{q.prompt}</p>{q.description&&<p className="muted">{q.description}</p>}{q.options&&<p className="muted">{q.options.map(option=>option.label).join('／')}</p>}</li>)}</ol></section>
   <section className="question-form"><h4>固定讲解卡后 · 两道反馈问题</h4><ol>{qs.post.map(q=><li key={q.id}>{q.prompt}</li>)}</ol></section>
   <p className="notice">分析时区分：前 3 题为参与者自主陈述，第 4 题为定向追问，第 5 题为困难分类。追问后出现的关系解释不能归为自发发现。讲解前后是同一人的两个阶段，不能仅凭变化认定讲解有效。</p>
   <p className="muted">结合每人、每个场景的解释、疑问与讲解卡反馈提出修改建议。ZIP 保留背景、题目原文、回答类型和实际观看顺序。旧会话保留原来的题目。</p>
  </details>
 </section>;
}
