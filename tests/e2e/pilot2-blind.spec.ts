import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {strToU8,zipSync} from 'fflate';
import {pilot2SurveyFixture} from '../pilot2SurveyFixture';
import {readSessionArchive} from '../../src/importSession';
import {recallRows} from '../../src/pilotSurveyRecords';

test('researcher grades original recall text without seeing assignment and reopens a partially scored ZIP',async({page})=>{
  const session=pilot2SurveyFixture();
  const writes:string[]=[];
  page.on('request',request=>{if(request.method()!=='GET')writes.push(request.method())});
  await page.goto('/?review=blind');
  await page.locator('input[type=file]').setInputFiles({name:'P02-gaze-synthetic.zip',mimeType:'application/zip',
    buffer:Buffer.from(zipSync({'session.json':strToU8(JSON.stringify(session))}))});
  const sections=page.locator('main section');
  await expect(sections).toHaveCount(9);
  await expect(page.locator('body')).not.toContainText(/P02|顺序讲解|随机讲解|眼动讲解/);
  const scene=session.config.paintings.find(p=>p.paintingId===session.order[0])!;
  for(const [index,q] of scene.recallQuestions!.entries()){
    const section=sections.filter({has:page.getByRole('heading',{name:q.prompt,exact:true})});
    await section.getByRole('combobox').selectOption(index===1?'0':'1');
    if(index===1){
      await expect(section.locator('blockquote')).toHaveText('记不清');
      await expect(section.locator('option[value="1"]')).toHaveCount(0);
    }else await expect(section.locator('blockquote')).toContainText('参与者原文');
  }
  const downloading=page.waitForEvent('download');
  await page.getByRole('button',{name:'下载带评分的 ZIP 副本'}).click();
  const download=await downloading;
  expect(download.suggestedFilename()).toMatch(/_scored\.zip$/);
  const bytes=await readFile((await download.path())!);
  const restored=readSessionArchive(new Uint8Array(bytes),download.suggestedFilename());
  expect(recallRows(restored).map(r=>r.sceneRecallScore)).toEqual([2,2,2,null,null,null,null,null,null]);
  await page.reload();
  await page.locator('input[type=file]').setInputFiles({name:'graded.zip',mimeType:'application/zip',buffer:bytes});
  await expect(page.getByText('已评 3 / 9 题')).toBeVisible();
  expect(writes).toEqual([]);
});
