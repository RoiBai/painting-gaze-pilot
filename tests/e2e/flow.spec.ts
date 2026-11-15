import {test,expect} from '@playwright/test';
test('two-scene UI flow stores only genuine callbacks, hides overlays and exports empty-data ZIP',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'研究者设置',exact:true}).click();
 await page.getByText('替换材料和完整配置（JSON）').click();
 const config=await page.evaluate(async()=>{const path='/src/study.ts';const {defaultConfig}=await import(/* @vite-ignore */path);return {...defaultConfig,durationSeconds:1,calibrationClicks:1,validation:{...defaultConfig.validation,targetDurationMs:150,settleMs:50}}});
 await page.getByRole('textbox',{name:'完整配置 JSON'}).fill(JSON.stringify(config));
 await page.getByRole('button',{name:'校验并载入配置'}).click();
 await page.getByRole('button',{name:'返回开始页'}).click();
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:/同意并进入/}).click();
 await page.getByText('摄像头无法工作？').click();await page.getByRole('button',{name:/仅试用流程/}).click();
 for(let i=0;i<9;i++)await page.getByRole('button',{name:'校准目标'}).click();
 await page.getByRole('button',{name:'研究者：标记低质量后继续'}).click();
 for(let painting=0;painting<2;painting++){
  await page.getByRole('button',{name:'研究者：标记低质量后继续'}).click();
  await expect(page.locator('.stimulus img')).toBeVisible();
  await expect(page.locator('.experiment-header')).toHaveCount(0);await expect(page.locator('.aoi')).toHaveCount(0);
  await page.getByRole('button',{name:'没见过',exact:true}).click();
  for(let i=0;i<2;i++)await page.getByRole('button',{name:'跳过此题',exact:true}).click();
  for(let i=0;i<2;i++)await page.getByRole('button',{name:'读完了，继续 →',exact:true}).click();
  for(let i=0;i<2;i++)await page.getByRole('button',{name:'跳过此题',exact:true}).click();
 }
 await expect(page.getByRole('heading',{name:'最后，聊聊这次体验'})).toBeVisible();
 for(let i=0;i<1+config.paintings.flatMap((p:any)=>p.interview).length;i++)await page.getByRole('button',{name:'跳过此题',exact:true}).click();
 await expect(page.getByRole('heading',{name:'摄像头视线估计密度图',exact:true})).toBeVisible();
 const stored=await page.evaluate(async()=>{const path='/src/storage.ts';const {listSessions}=await import(/* @vite-ignore */path);return listSessions()});
 expect(stored).toHaveLength(1);expect(stored[0].status).toBe('completed');expect(stored[0].samples).toHaveLength(0);expect(stored[0].timings).toHaveLength(2);expect(stored[0].quality).toBe('flow_only');expect(stored[0].responses.filter((r:any)=>r.phase==='cards')).toHaveLength(4);
 await page.screenshot({path:'docs/qa-results.png',fullPage:true});
 await page.reload();await expect(page.getByRole('button',{name:/N01.*completed/})).toBeVisible();
});
test('formal mode blocks unverified scenes and reload preserves interrupted session',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'研究者设置',exact:true}).click();
 await page.getByLabel('运行模式').selectOption('research');await page.getByRole('button',{name:'返回开始页'}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:/同意并进入/}).click();await expect(page.getByRole('alert')).toContainText('核查');
 await page.getByRole('button',{name:'研究者设置',exact:true}).click();await page.getByLabel('运行模式').selectOption('preview');await page.getByRole('button',{name:'返回开始页'}).click();await page.getByRole('button',{name:/同意并进入/}).click();await expect(page.getByRole('heading',{name:'让摄像头看清你的脸'})).toBeVisible();
 await page.waitForTimeout(1200);await page.reload();await expect(page.getByRole('button',{name:/N01.*interrupted/})).toBeVisible();await page.screenshot({path:'docs/qa-start.png',fullPage:true});
});
