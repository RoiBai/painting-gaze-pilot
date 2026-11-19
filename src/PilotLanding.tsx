import {useState} from 'react';
import type {StudyConfig,BackgroundAnswers} from './types';
import {publicAssetUrl} from './assets';
import PilotGroupRatings from './PilotGroupRatings';
import {buildPilotPlan} from './pilotProtocol';
import BackgroundFields,{emptyBackground,backgroundComplete} from './BackgroundFields';

const pids=Array.from({length:36},(_,i)=>'P'+String(i+1).padStart(2,'0'));
export const pilotLabels = {sequential:'顺序讲解',random:'随机讲解',gaze:'眼动讲解'} as const;
const link=(id:string)=>publicAssetUrl('/')+'?participant='+id;

interface Props {
  config:StudyConfig;
  initialId:string;
  onStart:(id:string,background:BackgroundAnswers)=>void;
}

export default function PilotLanding({config,initialId,onStart}:Props){
  const [id,setId]=useState(initialId);
  const [background,setBackground]=useState(emptyBackground);
  const [consent,setConsent]=useState(false);
  const [design,setDesign]=useState(()=>new URLSearchParams(location.search).get('preview')==='design');
  const [showAll,setShowAll]=useState(false);
  const practice=id==='P00';
  const changeId=(value:string)=>{setId(value);setBackground(emptyBackground());setConsent(false)};
  return <div className="site">
    <header className="masthead"><a href={publicAssetUrl('/')} className="brand"><span className="brandmark">观</span>观画研究</a><button className="quiet" onClick={()=>setDesign(!design)}>{design?'返回开始页':'研究者设置'}</button></header>
    <main className="shell">
      {design?<section className="panel">
        <h1>三种讲解方式</h1>
        <p>每人看三个不同场景，顺序、随机和眼动讲解各体验一次。每景 60 秒，分成三轮 3 秒看画、17 秒单卡讲解。三个条件都记录视线。</p>
        <div className="actions"><a href={link('P00')}>进入 P00 研究者试用</a><button onClick={()=>setShowAll(!showAll)}>{showAll?'只显示首轮六人':'查看全部 36 人排程'}</button></div>
        <div className="table-scroll"><table aria-label="三条件排程"><thead><tr><th>参与者链接</th><th>第一景</th><th>第二景</th><th>第三景</th></tr></thead><tbody>{pids.slice(0,showAll?36:6).map(pid=><tr key={pid}><th><a href={link(pid)}>{pid}</a></th>{buildPilotPlan(pid).map(item=><td key={item.paintingId}>{config.paintings.find(p=>p.paintingId===item.paintingId)?.title} · {pilotLabels[item.condition]}</td>)}</tr>)}</tbody></table></div>
        <details><summary>查看三个场景和信息卡</summary>{config.paintings.map(p=><section className="material-list" key={p.paintingId}><h2>{p.title}</h2><img className="material-preview" src={publicAssetUrl(p.image)} alt={p.title} loading="lazy"/>{p.cards.map(card=><p key={card.id}><strong>{card.title}</strong>　{card.text}</p>)}</section>)}</details>
        <details><summary>查看每景评分和最后访谈</summary><ol>{config.paintings[0].pre.map(q=><li key={q.id}>{q.prompt}{q.ratingScale&&`（${q.ratingScale.min}＝${q.ratingScale.lowLabel}，${q.ratingScale.max}＝${q.ratingScale.highLabel}）`}</li>)}</ol><h3>访谈</h3><ol>{config.paintings[0].interview.map(prompt=><li key={prompt}>{prompt}</li>)}</ol></details>
        <div className="actions"><a href="#session-review">导入 ZIP 回看视线</a><a href={publicAssetUrl('/')+'?review=blind'}>打开回忆题盲评</a></div>
        <PilotGroupRatings/>
        <p><a href={publicAssetUrl('/')+'?study=legacy'}>打开早期 N 编号试测</a></p>
      </section>:<>
        <h1>观看《明宣宗行乐图》</h1>
        <p className="lede">你将观看三个场景，每景 60 秒。请自然看画、阅读讲解，之后试着用自己的话介绍这个场景。</p>
        <section className="panel"><label>匿名参与者编号<select aria-label="匿名参与者编号" value={id} onChange={e=>changeId(e.target.value)}><option value="">请选择分配给你的编号</option><option value="P00">P00 · 研究者试用</option><optgroup label="首轮">{pids.slice(0,6).map(pid=><option key={pid}>{pid}</option>)}</optgroup><optgroup label="扩展招募">{pids.slice(6).map(pid=><option key={pid}>{pid}</option>)}</optgroup></select></label>
        <p className="notice">{practice?'P00 是研究者试用编号。背景、评分和视线仅供本次页面运行，结束、退出或刷新后清除。':'请在电脑的 Chrome 普通窗口中打开。摄像头在本机估计视线。结束后请下载 ZIP 并自行交给研究者。'}</p>
        <BackgroundFields value={background} onChange={setBackground}/>
        <label className="check"><input aria-label="参与同意" type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{practice?'我了解试用期间摄像头会在本机估计视线，并同意开始。':config.copy.consent}</label>
        <div className="actions"><button className="primary" disabled={!id||!consent||!backgroundComplete(background)} onClick={()=>{if(id&&consent&&backgroundComplete(background))onStart(id,background)}}>同意并进入摄像头准备 →</button></div>
        </section>
      </>}
    </main>
  </div>;
}
