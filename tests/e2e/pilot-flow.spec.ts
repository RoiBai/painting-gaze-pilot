import {expect,test,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {strFromU8,unzipSync} from 'fflate';
import {pilotConfig} from '../../src/pilotMaterials';
import type {Session,StudyConfig} from '../../src/types';
import {consentAndStart,csvRecords,storedSessions} from './helpers';

// Only this isolated dev browser replaces camera I/O. All calibration, AOI
// selection, card layout, questionnaire, persistence and ZIP code is the app's.
async function installCameraFixture(page:Page){
  await page.evaluate(async()=>{
    const moduleUrl=(filename:string)=>{
      const entry=performance.getEntriesByType('resource').find(row=>new URL(row.name).pathname.endsWith('/src/'+filename+'.ts'));
      if(!entry)throw Error('Missing Vite module '+filename);
      return entry.name;
    };
    const {WebGazerAdapter}=await import(moduleUrl('webgazerAdapter'));
    const {pilotConfig}:{pilotConfig:StudyConfig}=await import(moduleUrl('pilotMaterials'));
    Object.assign(pilotConfig,{durationSeconds:12,calibrationClicks:1});
    Object.assign(pilotConfig.validation,{targetDurationMs:300,settleMs:60,minSamplesPerTarget:3});
    const used=new Set<string>();
    let interval=0;
    WebGazerAdapter.prototype.resetCalibration=async()=>{};
    WebGazerAdapter.prototype.train=()=>{};
    WebGazerAdapter.prototype.stop=function(){window.clearInterval(interval)};
    WebGazerAdapter.prototype.start=async function(){
      this.onStatus({status:'tracking',faceDetected:true,message:'Browser test camera fixture'});
      interval=window.setInterval(()=>{
        const time=performance.now();
        const target=document.querySelector('.gaze-target');
        const card=document.querySelector<HTMLElement>('.pilot-card');
        const img=document.querySelector<HTMLImageElement>('.stimulus img');
        let x=2,y=2;
        if(target){
          const rect=target.getBoundingClientRect();
          x=rect.left+rect.width/2;y=rect.top+rect.height/2;
        }else if(card){
          used.add(card.dataset.card!);
          if(Math.floor(time/150)%2===0){
            const rect=card.getBoundingClientRect();
            x=rect.left+rect.width/2;y=rect.top+rect.height/2;
          }
        }else if(img?.naturalWidth){
          const painting=pilotConfig.paintings.find(p=>img.src.endsWith(p.image))!;
          const next=painting.cards.find(c=>!used.has(c.id));
          const region=painting.aois.find(a=>next?.aoiIds.includes(a.id));
          if(region){
            const box=img.getBoundingClientRect(),scale=Math.min(box.width/img.naturalWidth,box.height/img.naturalHeight);
            const w=img.naturalWidth*scale,h=img.naturalHeight*scale;
            const [left,top,width,height]=region.rect;
            x=box.left+(box.width-w)/2+w*(left+width/2);
            y=box.top+(box.height-h)/2+h*(top+height/2);
          }
        }
        this.onSample({callbackTimeMs:time,libraryElapsedMs:time,x,y});
      },20);
    };
  });
}

async function observeTrial(page:Page){
  // A mutation observer sees short blank periods even when the CI browser is busy.
  const cards=await page.evaluate(()=>new Promise<{id:string|null;children:string[];title:string;body:string}[]>((done,fail)=>{
    const seen:{id:string|null;children:string[];title:string;body:string}[]=[];
    let previous:Element|null=null;
    const observer=new MutationObserver(check);
    function check(){
      const visible=document.querySelectorAll('.pilot-card');
      if(visible.length>1){observer.disconnect();fail(Error('Two visible cards'));return}
      const element=visible[0]??null;
      if(element&&element!==previous){
        seen.push({id:element.getAttribute('data-card'),children:[...element.children].map(child=>child.tagName),
          title:element.querySelector('h2')?.textContent??'',body:element.querySelector('p')?.textContent??''});
      }
      previous=element;
      if(document.querySelector('h1')?.textContent==='观看感受'){
        observer.disconnect();done(seen);
      }
    }
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    check();
  }));
  expect(cards).toHaveLength(3);
  expect(new Set(cards.map(card=>card.id)).size).toBe(3);
  for(const card of cards){
    expect(card.children).toEqual(['H2','P']);
    expect(card.title).toBeTruthy();
    expect(card.body).toBeTruthy();
  }
  return cards;
}

async function readingAidsHidden(page:Page){
  await expect(page.locator('.stimulus,.pilot-card,.card-image,.material-preview,canvas')).toHaveCount(0);
  await expect(page.getByText(/接受答案|正确答案|查看回放/)).toHaveCount(0);
}

async function answerTrial(page:Page,period:number){
  await expect(page.getByRole('heading',{name:'观看感受',exact:true})).toBeVisible();
  await readingAidsHidden(page);
  const ratings=page.getByRole('combobox');
  await expect(ratings).toHaveCount(6);
  const submitLoad=page.getByRole('button',{name:'提交观看感受'});
  await expect(submitLoad).toBeDisabled();
  const score=period===1?'0':String(period*10);
  for(let i=0;i<6;i++){
    await expect(ratings.nth(i)).toHaveValue('');
    await ratings.nth(i).selectOption(score);
  }
  await submitLoad.click();
  await expect(page.getByRole('heading',{name:'画面回忆',exact:true})).toBeVisible();
  await readingAidsHidden(page);
  const questions=pilotConfig.paintings[period-1].recallQuestions!;
  await expect(page.getByRole('textbox')).toHaveCount(3);
  for(const [i,q] of questions.entries()){
    const field=page.getByRole('textbox',{name:q.prompt,exact:true});
    await expect(field).toHaveValue('');
    await field.fill('第'+period+'段，回答'+(i+1));
    if(i===2){
      await page.getByRole('checkbox',{name:'第 3 题记不清'}).check();
      await expect(field).toHaveValue('');
      await expect(field).toBeDisabled();
    }
  }
  await page.getByRole('button',{name:'提交画面回忆'}).click();
  await page.getByRole('combobox').selectOption(String(period+3));
  await page.getByRole('button',{name:'完成补充反馈'}).click();
}

async function startCalibrated(page:Page){
  await page.goto('/?participant=P01');
  await expect(page.getByLabel('匿名参与者编号')).toHaveValue('P01');
  await installCameraFixture(page);
  await consentAndStart(page);
  await page.getByRole('button',{name:'启用 / 重试摄像头'}).click();
  await page.getByRole('button',{name:'开始九点校准'}).click();
  for(let i=0;i<9;i++)await page.getByRole('button',{name:'校准目标'}).click();
  await page.getByRole('button',{name:'继续',exact:true}).click();
}

test('P01 completes all three conditions and downloads their linked predictions, cards and ratings',async({page})=>{
  test.setTimeout(150_000);
  await startCalibrated(page);
  const accept=page.getByRole('button',{name:'继续',exact:true});
  const seen=[];
  for(let period=1;period<=3;period++){
    await accept.click();
    seen.push(...await observeTrial(page));
    await answerTrial(page,period);
  }
  await expect(page.getByRole('heading',{name:'最后，聊聊这次体验'})).toBeVisible();
  for(let i=0;i<3;i++){
    await page.getByRole('textbox',{name:'你的回答'}).fill('访谈回答'+(i+1));
    await page.getByRole('button',{name:'继续 →',exact:true}).click();
  }
  const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button',{name:/一键下载 ZIP/}).click(),
  ]);
  expect(download.suggestedFilename()).toContain('P01');
  const archive=unzipSync(await readFile((await download.path())!));
  const files=Object.fromEntries(Object.entries(archive).map(([path,data])=>[path.slice(path.lastIndexOf('/')+1),data]));
  const csv=(filename:string)=>csvRecords(strFromU8(files[filename]));
  const session:Session=JSON.parse(strFromU8(files['session.json']));
  expect(session.status).toBe('completed');
  expect(session.participantId).toBe('P01');
  expect(session.pilot?.practice).toBe(false);
  expect(session.quality).toBe('accepted');
  expect(session.validationSummaries.map(v=>v.status)).toEqual(['pass','pass','pass','pass']);
  const plan=session.pilot!.plan;
  expect(plan).toEqual([
    {paintingId:'ming-xingle-cuju',condition:'sequential'},
    {paintingId:'ming-xingle-polo',condition:'random'},
    {paintingId:'ming-xingle-archery',condition:'gaze'},
  ]);
  const exposures=csv('card_exposures.csv'),predictions=csv('gaze_samples.csv'),attention=csv('card_attention.csv');
  expect(exposures).toHaveLength(9);
  expect(attention).toHaveLength(9);
  for(const [index,card] of exposures.entries()){
    expect(card.cardId).toBe(seen[index].id);
    expect(card.cardTitle).toBe(seen[index].title);
    expect(card.cardBody).toBe(seen[index].body);
    const samples=predictions.filter(row=>row.cardExposureId===card.exposureId);
    expect(new Set(samples.map(s=>s.onCard))).toEqual(new Set(['true','false']));
    for(const sample of samples){
      const x=Number(sample.viewportX),y=Number(sample.viewportY),t=Number(sample.callbackTimeMs);
      const left=Number(card.viewportLeft),top=Number(card.viewportTop);
      const hit=x>=left&&y>=top&&x<left+Number(card.viewportWidth)&&y<top+Number(card.viewportHeight);
      expect(sample.onCard).toBe(String(hit));
      expect(sample.condition).toBe(card.condition);
      expect(t>=Number(card.shownMs)&&t<=Number(card.hiddenMs)).toBe(true);
    }
    const summary=attention.find(row=>row.exposureId===card.exposureId)!;
    expect(Number(summary.onCardMs)).toBeGreaterThan(0);
    expect(Number(summary.offCardMs)).toBeGreaterThan(0);
  }
  expect(exposures.filter(row=>row.condition==='gaze').map(row=>row.selectionSource)).toEqual(['gaze','gaze','remaining']);
  expect(csv('pilot_ratings.csv').map(row=>[row.condition,row.overall,row.rawTLX])).toEqual([
    ['sequential','4','0'],['random','5','20'],['gaze','6','30'],
  ]);
  expect(predictions.some(r=>r.phase==='pre')).toBe(false);
  const recall=csv('pilot_recall.csv'),workload=csv('pilot_workload.csv');
  expect(recall).toHaveLength(9);
  expect(workload).toHaveLength(18);
  expect(workload.slice(0,6).map(row=>row.answer)).toEqual(Array(6).fill('0'));
  for(const [index,row] of recall.entries()){
    const period=Math.floor(index/3)+1, item=index%3+1;
    const {paintingId,condition}=plan[period-1];
    const card=exposures.find(card=>card.paintingId===paintingId&&card.cardId===row.cardId)!;
    expect(row.condition).toBe(condition);
    expect(row.questionId).toBe('recall-'+card.cardId);
    expect(row.cardPresentationOrder).toBe(card.slot);
    expect(row.answer).toBe(item===3?'':'第'+period+'段，回答'+item);
    expect(row.rememberUnknown).toBe(String(item===3));
    expect(row.manualScore).toBe('');
    expect(row.sceneRecallScore).toBe('');
    expect(Number(row.submittedMs)).toBeGreaterThan(Number(card.hiddenMs));
  }
  expect(csv('responses.csv').filter(row=>row.phase==='interview').map(row=>row.answer)).toEqual(['访谈回答1','访谈回答2','访谈回答3']);
  for(const {paintingId} of plan)for(const kind of ['heatmap','scanpath'])expect(files[kind+'_'+paintingId+'.png']?.length).toBeGreaterThan(100);
  const stored=await storedSessions(page);
  expect(stored.map(s=>[s.participantId,s.status])).toEqual([['P01','completed']]);
});

test('P00 exits from camera setup, stays out of local sessions and can be repeated',async({page})=>{
  await page.goto('/?participant=P00');
  await consentAndStart(page);
  await expect(page.getByRole('heading',{name:'让摄像头看清你的脸'})).toBeVisible();
  expect(await storedSessions(page)).toEqual([]);
  await page.getByRole('button',{name:'清除并退出试用'}).click();
  await expect(page.getByRole('heading',{name:'本次 P00 试用已清除'})).toBeVisible();
  await expect(page.getByRole('button',{name:/一键下载 ZIP/})).toHaveCount(0);
  expect(await storedSessions(page)).toEqual([]);
  await page.getByRole('link',{name:'重新开始 P00'}).click();
  await expect(page.getByLabel('匿名参与者编号')).toHaveValue('P00');
  await expect(page.getByRole('textbox',{name:'你的主要学习或工作领域是什么？',exact:true})).toBeEmpty();
  expect(await storedSessions(page)).toEqual([]);
});


test('refresh preserves the current survey and a later exit exports submitted and missing values separately',async({page})=>{
  test.setTimeout(100_000);
  await startCalibrated(page);
  await page.getByRole('button',{name:'继续',exact:true}).click();
  await observeTrial(page);
  await page.getByRole('combobox').first().selectOption('0');
  const [{sessionId}]=await storedSessions(page);
  await page.reload();
  await expect(page.getByRole('heading',{name:'观看感受',exact:true})).toBeVisible();
  const fields=page.getByRole('combobox');
  await expect(fields.first()).toHaveValue('0');
  await expect(fields.nth(1)).toHaveValue('');
  for(let i=1;i<6;i++)await fields.nth(i).selectOption('10');
  await page.getByRole('button',{name:'提交观看感受'}).click();
  const first=page.getByRole('textbox').first();
  await first.fill('答题中途刷新');
  await page.reload();
  await expect(page.getByRole('heading',{name:'画面回忆',exact:true})).toBeVisible();
  await expect(first).toHaveValue('答题中途刷新');
  await expect(page.getByRole('button',{name:'提交画面回忆'})).toBeDisabled();
  await page.getByRole('button',{name:'退出并保留记录'}).click();
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:/一键下载 ZIP/}).click()]);
  const archive=unzipSync(await readFile((await download.path())!));
  const entry=(name:string)=>strFromU8(archive[Object.keys(archive).find(path=>path.endsWith('/'+name))!]);
  const session:Session=JSON.parse(entry('session.json'));
  const recall=csvRecords(entry('pilot_recall.csv')),ratings=csvRecords(entry('pilot_ratings.csv'));
  expect(session.sessionId).toBe(sessionId);
  expect(session.status).toBe('interrupted');
  expect(recall[0].answer).toBe('答题中途刷新');
  expect(recall[0].submittedMs).toBe('');
  expect(recall.every(r=>r.sceneRecallScore===''&&r.manualScore==='')).toBe(true);
  expect(ratings.map(r=>r.mental)).toEqual(['0','','']);
  expect(ratings.slice(1).every(r=>r.rawTLX==='')).toBe(true);
  expect(session.responses.filter(r=>r.phase==='pre')).toHaveLength(6);
  expect(session.pilotSurveys![session.order[0]].workloadSubmittedMs!).toBeGreaterThan(session.timings[0].endedMs!);
  expect(session.samples.some(row=>row.phase==='pre')).toBe(false);
  expect((await storedSessions(page)).map(s=>s.sessionId)).toEqual([sessionId]);
});
