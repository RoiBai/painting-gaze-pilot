import PilotMaterialPreview from './PilotMaterialPreview';
import {useState} from 'react';
import type {StudyConfig,BackgroundAnswers,PilotTrial,Condition} from './types';
import {publicAssetUrl} from './assets';
import PilotGroupRatings from './PilotGroupRatings';
import {buildPilotPlan,sceneDurationSeconds} from './pilotProtocol';
import BackgroundFields,{emptyBackground,backgroundComplete} from './BackgroundFields';

const pids=Array.from({length:36},(_,i)=>'P'+String(i+1).padStart(2,'0'));
export const pilotLabels = {sequential:'顺序讲解',random:'随机讲解',gaze:'眼动讲解'} as const;
const link=(id:string)=>publicAssetUrl('/')+'?participant='+id;

interface Props {
  config:StudyConfig;
  initialId:string;
  onStart:(id:string,background:BackgroundAnswers,previewTrial?:PilotTrial)=>void;
}

export default function PilotLanding({config,initialId,onStart}:Props){
  const [id,setId]=useState(initialId);
  const [background,setBackground]=useState(emptyBackground);
  const [consent,setConsent]=useState(false);
  const researcherTools=initialId===''||initialId==='P00';
  const [design,setDesign]=useState(()=>researcherTools && new URLSearchParams(location.search).get('preview')==='design');
  const [single,setSingle]=useState(false);
  const [scene,setScene]=useState('ming-xingle-cuju');
  const [condition,setCondition]=useState<Condition>('gaze');
  const [showAll,setShowAll]=useState(false);
  const practice=id==='P00';
  const durations=config.paintings.map(p=>sceneDurationSeconds(p,config.durationSeconds));
  const selectedDuration=durations[config.paintings.findIndex(p=>p.paintingId===scene)];
  const timeSummary=durations.every(seconds=>seconds===durations[0])?`每景 ${durations[0]} 秒`:`共 ${durations.reduce((sum,s)=>sum+s,0)} 秒`;
  const changeId=(value:string)=>{setId(value);setBackground(emptyBackground());setConsent(false)};
  return <div className="site">
    <header className="masthead"><a href={publicAssetUrl('/')} className="brand"><span className="brandmark">观</span>观画研究</a>{researcherTools&&<button className="quiet" onClick={()=>setDesign(!design)}>{design?'返回开始页':'研究者设置'}</button>}</header>
    <main className="shell">
      {design?<section className="panel">
        <h1>三种讲解方式</h1>
        <p>每人看三个不同场景，顺序、随机和眼动讲解各体验一次。每次显示一张卡。眼动条件在可选区域稳定停留约 1.1 秒即可提前出卡。三个条件都记录视线，同一场景的观看时长相同。</p>
        <div className="actions"><a href={link('P00')}>进入 P00 研究者试用</a><button onClick={()=>setShowAll(!showAll)}>{showAll?'只显示首轮六人':'查看全部 36 人排程'}</button></div>
        <div className="table-scroll"><table aria-label="三条件排程"><thead><tr><th>参与者链接</th><th>第一景</th><th>第二景</th><th>第三景</th></tr></thead><tbody>{pids.slice(0,showAll?36:6).map(pid=><tr key={pid}><th><a href={link(pid)}>{pid}</a></th>{buildPilotPlan(pid).map(item=><td key={item.paintingId}>{config.paintings.find(p=>p.paintingId===item.paintingId)?.title} · {pilotLabels[item.condition]}</td>)}</tr>)}</tbody></table></div>
        <details open={new URLSearchParams(location.search).get('materials')==='uci'||undefined}><summary>查看三个场景和信息卡</summary>{config.paintings.every(p=>p.cards.every(c=>c.art))&&<PilotMaterialPreview paintings={config.paintings}/>}{config.paintings.map(p=><section className="material-list" key={p.paintingId}><h2>{p.title}</h2><img className="material-preview" src={publicAssetUrl(p.image)} alt={p.title} loading="lazy"/>{p.cards.map(card=><p key={card.id}><strong>{card.title}</strong>　{card.text}</p>)}</section>)}</details>
        <details><summary>查看每景评分和最后访谈</summary><ol>{config.paintings[0].pre.map(q=><li key={q.id}>{q.prompt}{q.ratingScale&&`（${q.ratingScale.min}＝${q.ratingScale.lowLabel}，${q.ratingScale.max}＝${q.ratingScale.highLabel}）`}</li>)}</ol><h3>访谈</h3><ol>{config.paintings[0].interview.map(prompt=><li key={prompt}>{prompt}</li>)}</ol></details>
        <div className="actions"><a href="#session-review">导入 ZIP 回看视线</a><a href={publicAssetUrl('/')+'?review=blind'}>打开回忆题盲评</a></div>
        <PilotGroupRatings/>
        <p><a href={publicAssetUrl('/')+'?study=legacy'}>打开早期 N 编号试测</a></p>
      </section>:<>
        <h1>观看《明宣宗行乐图》</h1>
        <p className="lede">{practice&&single?`你将观看自选的一个场景，共 ${selectedDuration} 秒。`:`你将观看三个场景，${timeSummary}。`}请自然看画、阅读讲解，之后试着用自己的话介绍这个场景。</p>
        <section className="panel"><label>匿名参与者编号<select aria-label="匿名参与者编号" disabled={Boolean(initialId)} value={id} onChange={e=>changeId(e.target.value)}>
          {initialId?<option value={initialId}>{initialId==='P00'?'P00 · 研究者试用':initialId}</option>:<>
            <option value="">请选择分配给你的编号</option>
            <optgroup label="首轮">{pids.slice(0,6).map(pid=><option key={pid}>{pid}</option>)}</optgroup>
            <optgroup label="扩展招募">{pids.slice(6).map(pid=><option key={pid}>{pid}</option>)}</optgroup>
          </>}
        </select></label>
        <p className="notice">{practice?'P00 的每次试用单独保存在本机，可以回看并下载完整 ZIP，正式研究统计会自动排除。':'请在电脑的 Chrome 普通窗口中打开。摄像头在本机估计视线。结束后请下载 ZIP 并自行交给研究者。'}</p>
        {practice&&<fieldset className="practice-mode"><legend>P00 试用范围</legend>
          <label className="check"><input type="radio" name="practice-scope" checked={!single} onChange={()=>setSingle(false)}/>完整三景</label>
          <label className="check"><input type="radio" name="practice-scope" checked={single} onChange={()=>setSingle(true)}/>只试一景</label>
          {single?<div className="grid two"><label>试用场景<select value={scene} onChange={e=>setScene(e.target.value)}>
            {config.paintings.map(p=><option key={p.paintingId} value={p.paintingId}>{p.title.split(' · ').at(-1)}</option>)}
          </select></label><label>讲解方式<select value={condition} onChange={e=>setCondition(e.target.value as Condition)}>
            {Object.entries(pilotLabels).map(([value,title])=><option key={value} value={value}>{title}</option>)}
          </select></label></div>:<p><strong>P00 观看顺序</strong>　{buildPilotPlan('P00').map(p=>(config.paintings.find(scene=>scene.paintingId===p.paintingId)?.title.split(' · ').at(-1)??p.paintingId)+'（'+pilotLabels[p.condition]+'）').join(' → ')}</p>}
        </fieldset>}
        <BackgroundFields value={background} onChange={setBackground}/>
        <label className="check"><input aria-label="参与同意" type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{practice?'我同意此次试用在本机保存我的背景、回答和摄像头视线估计。':config.copy.consent}</label>
        <div className="actions"><button className="primary" disabled={!id||!consent||!backgroundComplete(background)} onClick={()=>{if(id&&consent&&backgroundComplete(background))onStart(id,background,practice&&single?{paintingId:scene,condition}:undefined)}}>同意并进入摄像头准备 →</button></div>
        </section>
      </>}
    </main>
  </div>;
}
