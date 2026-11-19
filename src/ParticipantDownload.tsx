import {useRef,useState} from 'react';
import {exportPrefix,exportZip} from './export';
import type {Session} from './types';

export default function ParticipantDownload({session}:{session:Session}){
  const locked=useRef(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  async function download(){
    if(locked.current)return;
    locked.current=true;setBusy(true);setNotice('');setError('');
    try{await exportZip(session);setNotice('请在下载文件夹确认 '+exportPrefix(session)+'.zip 已保存，再将整个 ZIP 发给研究者。')}
    catch(e){setError('导出未完成，请重试。'+String(e))}
    finally{locked.current=false;setBusy(false)}
  }
  return <main className="shell stage"><section className="completion-export" aria-label="导出并发送研究数据">
    <h1>{session.status==='completed'?'测试已完成，谢谢参与':'本次测试已中断'}</h1>
    <p>请下载本次记录，并将整个 ZIP 文件发给研究者。文件保存在你的电脑上。</p>
    <button className="primary" disabled={busy} onClick={()=>void download()}>{busy?'正在生成 ZIP…':'一键下载 ZIP（含密度图、轨迹图与所有记录）'}</button>
    {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
  </section></main>;
}
