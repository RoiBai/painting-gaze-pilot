import {test,expect} from '@playwright/test';

async function mount(page:import('@playwright/test').Page){
 await page.goto('/');
 await page.evaluate(async()=>{const path='/tests/correctionHarness.tsx';const {mountCorrectionResults}=await import(/* @vite-ignore */path);mountCorrectionResults()});
}

test('reference correction is opt-in, labelled, downloadable and never changes raw samples or quality',async({page})=>{
 await mount(page);
 const mode=page.getByRole('group',{name:'坐标显示方式'});
 const panel=page.getByRole('region',{name:'坐标校正说明'});
 await expect(mode.getByRole('button',{name:'原始记录',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(mode.getByRole('button',{name:'参考校正',exact:true})).toBeEnabled();
 const canvas=page.locator('.heatmap-canvas canvas');
 await expect(canvas).toHaveAttribute('aria-label',/原始记录/);
 const original=await canvas.evaluate((node:HTMLCanvasElement)=>node.toDataURL());
 await mode.getByRole('button',{name:'参考校正',exact:true}).click();
 await expect(canvas).toHaveAttribute('aria-label',/参考校正/);
 await expect(panel).toContainText('不是新的独立准确度验证');
 await expect(panel).toContainText('x +18.0 px，y +28.0 px');
 expect(await canvas.evaluate((node:HTMLCanvasElement)=>node.toDataURL())).not.toBe(original);
 await expect(page.getByText('参考校正后画内样本',{exact:true})).toBeVisible();
 await expect(page.locator('.notice').filter({hasText:'低质量会话'}).first()).toBeVisible();
 let downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'下载本画参考校正密度图 PNG',exact:true}).click();
 expect((await downloadPromise).suggestedFilename()).toContain('_corrected_heatmap_A.png');
 await page.getByRole('button',{name:'Scan path · 估计轨迹',exact:true}).click();
 await expect(canvas).toHaveAttribute('aria-label',/参考校正.*轨迹/);
 downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'下载本画参考校正完整轨迹 PNG',exact:true}).click();
 expect((await downloadPromise).suggestedFilename()).toContain('_corrected_scanpath_A.png');
 const untouched=await page.evaluate(()=>{
  const probe=(window as any).__correctionProbe;
  return JSON.stringify(probe.initial.samples)===JSON.stringify(probe.current.samples)&&JSON.stringify(probe.initial.validation)===JSON.stringify(probe.current.validation)&&probe.current.quality==='low_quality';
 });
 expect(untouched).toBe(true);
 await page.getByLabel('画作',{exact:true}).selectOption('B');
 await expect(mode.getByRole('button',{name:'参考校正',exact:true})).toBeDisabled();
 await expect(mode.getByRole('button',{name:'原始记录',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(panel).toContainText('本画暂无可用的参考校正');
 await expect(canvas).toHaveAttribute('aria-label',/原始记录/);
 await expect(page.getByRole('button',{name:'下载本画完整轨迹 PNG',exact:true})).toBeVisible();
 await expect(page.getByRole('alert')).toHaveCount(0);
});

test('legacy session without reference checks shows only original records with an explicit reason',async({page})=>{
 await page.goto('/');
 await page.evaluate(async()=>{const path='/tests/resultsHarness.tsx';const {mountResults}=await import(/* @vite-ignore */path);mountResults()});
 await expect(page.getByRole('group',{name:'坐标显示方式'}).getByRole('button',{name:'参考校正',exact:true})).toBeDisabled();
 await expect(page.getByRole('region',{name:'坐标校正说明'})).toContainText('需要同一校准版本、观看前的三点检查');
 await expect(page.locator('.heatmap-canvas canvas')).toHaveAttribute('aria-label',/原始记录/);
 await expect(page.getByRole('button',{name:'下载本画密度图 PNG',exact:true})).toBeVisible();
 await expect(page.getByRole('alert')).toHaveCount(0);
});
