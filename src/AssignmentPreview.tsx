import {FOUR_PERSON_PLAN} from './assignment';
import {publicAssetUrl} from './assets';
import {questionVariants, questionVariantLabels, type QuestionVariantId} from './questionVariants';

export default function AssignmentPreview(){
 return <section className="assignment-preview" aria-labelledby="assignment-title">
  <h3 id="assignment-title">N03–N06 · 顺序与题本</h3>
  <p>两人先看射箭，两人先看蹴鞠；每种顺序各配一人做甲题、一人做乙题。编号决定分组，开始会话后固定。</p>
  <div className="table-scroll"><table aria-label="四人交叉分配"><thead><tr><th>编号 / 测试链接</th><th>第一景</th><th>第二景</th><th>两景题本</th></tr></thead><tbody>{FOUR_PERSON_PLAN.map(row=><tr key={row.participantId}><td><a href={`${publicAssetUrl('/')}?participant=${row.participantId}`} target="_blank" rel="noreferrer">{row.participantId} ↗</a></td><td>{row.order==='AB'?'射箭':'蹴鞠'}</td><td>{row.order==='AB'?'蹴鞠':'射箭'}</td><td>{questionVariantLabels[row.questionVariant]}</td></tr>)}</tbody></table></div>
  <p className="muted">把对应编号的链接发给参与者即可。链接使用网站默认设置；本页临时更改的设置只用于当前页面。每人两景使用同一题本，图片、解释卡、题数和评分维度一致。</p>
  <details className="question-preview" open><summary>查看甲乙两套完整问题（研究者预览）</summary>
   <p>每景在解释卡前答两题、解释卡后答两题。下列问法在射箭和蹴鞠两景各使用一次，回答分别保存。参与者开始页不展示这些问题。</p>
   <div className="grid two">{(['alpha','beta'] as QuestionVariantId[]).map(form=>{const qs=questionVariants[form]['ming-xingle-archery'];return <section key={form} className="question-form"><h4>{questionVariantLabels[form]} · {form==='alpha'?'N03 / N04':'N05 / N06'}</h4><h5>解释卡前</h5><ol>{qs.pre.map(q=><li key={q.id}>{q.prompt}</li>)}</ol><h5>解释卡后</h5><ol>{qs.post.map(q=><li key={q.id}>{q.prompt}</li>)}</ol></section>})}</div>
   <p className="muted">两套题都考察人物关系和画面证据，采用相同的 0–2 分参考。它们是两种问法，尚未验证难度完全相同。ZIP 会保留实际顺序、题本和题目原文，方便逐人比较。</p>
  </details>
 </section>;
}
