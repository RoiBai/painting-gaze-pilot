import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {pilot2SurveyFixture} from '../pilot2SurveyFixture';
import {readSessionArchive} from '../../src/importSession';
import {storedSessions} from './helpers';

async function savedMental(page:Page,paintingId:string){
  return (await storedSessions(page))[0]?.pilotSurveys?.[paintingId]?.workload.mental;
}

test('copied tabs cannot write an active draft and the researcher can export its last saved snapshot after the owner closes',async({page,context})=>{
  // Place a synthetic completed trial at the survey entry point, then exercise
  // real IndexedDB, copied sessionStorage, Web Locks, form edits and ZIP download.
  const session=pilot2SurveyFixture();
  const id=session.order[0];
  const scene=session.config.paintings.find(p=>p.paintingId===id)!;
  const first=session.pilotSurveys![id];
  session.pilotSurveys={[id]:{...first,workload:{},workloadSubmittedMs:null,recall:{},recallSubmittedMs:null}};
  session.timings=session.timings.filter(t=>t.paintingId===id);
  session.cardExposures=session.cardExposures!.filter(e=>e.paintingId===id);
  session.geometries=session.geometries.filter(g=>g.paintingId===id);
  session.responses=[];
  session.status='active';session.phase='pre';session.endedUtc=null;
  await page.goto('/?participant=P02');
  await page.evaluate(async s=>{
    const storage='/src/storage.ts',resume='/src/pilotResume.ts';
    const {saveSession}=await import(/* @vite-ignore */storage);
    const {writeCheckpoint}=await import(/* @vite-ignore */resume);
    s.timeOrigin=performance.timeOrigin-80000;
    await saveSession(s);writeCheckpoint(s,0);
  },session);
  await page.reload();
  const mental=page.getByLabel(scene.pre.find(q=>q.id==='mental')!.prompt,{exact:true});
  await expect(page.getByRole('heading',{name:'观看感受',exact:true})).toBeVisible();
  await mental.selectOption('10');
  await expect.poll(()=>savedMental(page,id)).toBe(10);

  const newTab=page.waitForEvent('popup');
  await page.evaluate(()=>{window.open(location.href,'_blank')});
  const duplicate=await newTab;
  await expect(duplicate.getByRole('alert')).toContainText('另一个标签页');
  await expect(duplicate.getByRole('heading',{name:'观看感受',exact:true})).toHaveCount(0);
  await expect(duplicate.locator('.session-row')).toHaveCount(0);
  await mental.selectOption('35');
  await expect.poll(()=>savedMental(duplicate,id)).toBe(35);
  const researcher=await context.newPage();
  await researcher.goto('/?preview=design');
  await researcher.getByRole('button',{name:'刷新会话列表'}).click();
  await expect(researcher.locator('.session-row')).toHaveCount(0);

  await page.close();
  await duplicate.reload();
  await expect(duplicate.getByRole('heading',{name:'观看感受',exact:true})).toHaveCount(0);
  await researcher.getByRole('button',{name:'刷新会话列表'}).click();
  const snapshot=researcher.locator('.session-row').filter({hasText:/P02.*interrupted/});
  await snapshot.click();
  await expect(researcher.getByRole('heading',{name:'本次测试已中断，可导出已保存记录'})).toBeVisible();
  const downloading=researcher.waitForEvent('download');
  await researcher.getByRole('button',{name:/一键下载 ZIP/}).click();
  const download=await downloading;
  const recorded=readSessionArchive(new Uint8Array(await readFile((await download.path())!)),download.suggestedFilename());
  expect(recorded.status).toBe('interrupted');
  expect(recorded.pilotSurveys![id].workload).toEqual({mental:35});
  expect(recorded.pilotSurveys![id].workloadSubmittedMs).toBeNull();
  expect(recorded.events.at(-1)?.type).toBe('pilot_archived_snapshot');
  const [source]=await storedSessions(researcher);
  expect(source.status).toBe('active');
  expect(source.pilotSurveys![id].workload).toEqual({mental:35});
});
