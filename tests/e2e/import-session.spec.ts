import {test,expect} from '@playwright/test';
import {zipSync,strToU8} from 'fflate';
import {defaultConfig} from '../../src/study';
import {sessionFixture} from '../dataFixtures';

test('opens an imported ZIP locally without uploading or overwriting browser sessions',async({page})=>{
 const s=sessionFixture();s.config=structuredClone(defaultConfig);s.order=s.config.paintings.map(p=>p.paintingId);
 const bytes=zipSync({'record/session.json':strToU8(JSON.stringify(s))});
 const writes:string[]=[];page.on('request',r=>{if(r.method()!=='GET')writes.push(r.url())});
 await page.goto('/');
 await page.getByLabel('本地导入结果 ZIP / JSON').setInputFiles({name:'test-session.zip',mimeType:'application/zip',buffer:Buffer.from(bytes)});
 await expect(page.getByRole('heading',{name:'摄像头视线估计密度图',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'参考校正',exact:true})).toBeDisabled();
 await page.getByLabel('叠加透明度').fill('0.5');
 await page.getByRole('button',{name:'返回会话列表',exact:true}).click();
 await expect(page.getByText('尚无已保存会话。')).toBeVisible();
 expect(writes).toEqual([]);
});
