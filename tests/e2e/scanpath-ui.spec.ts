import {test,expect} from '@playwright/test';
test('existing-session results can switch to scan path, scrub, play, adjust thinning and export',async({page})=>{
 await page.goto('/?study=legacy');await page.evaluate(async()=>{const path='/tests/resultsHarness.tsx';const {mountResults}=await import(/* @vite-ignore */path);mountResults()});
 await page.getByRole('button',{name:'Scan path · 估计轨迹',exact:true}).click();await expect(page.getByRole('heading',{name:'摄像头视线估计轨迹（Scan path）'})).toBeVisible();
 await expect(page.locator('.heatmap-canvas canvas')).toBeVisible();
 const slider=page.getByRole('slider',{name:'轨迹时间'});await slider.fill('500');await expect(slider).toHaveValue('500');
 await page.getByRole('button',{name:'播放轨迹',exact:true}).click();await expect.poll(async()=>Number(await slider.inputValue())).toBeGreaterThan(600);await page.getByRole('button',{name:'暂停回放'}).click();
 await page.getByLabel('轨迹显示间隔').selectOption('100');await page.getByLabel('轨迹编号密度').selectOption('0');
 await page.getByRole('button',{name:'显示完整轨迹'}).click();await expect(slider).toHaveValue('2000');await expect(page.getByRole('alert')).toHaveCount(0);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'下载本画完整轨迹 PNG'}).click();expect((await download).suggestedFilename()).toContain('_scanpath_A.png');
 await page.screenshot({path:'docs/qa-scanpath.png',fullPage:true});
 await page.getByRole('button',{name:'密度图',exact:true}).click();await expect(page.getByRole('heading',{name:'摄像头视线估计密度图',exact:true})).toBeVisible();
});
test('new default pass line is visible and configurable',async({page})=>{
 await page.goto('/?study=legacy');await page.getByRole('button',{name:'研究者设置',exact:true}).click();
 await expect(page.getByLabel('验证中位误差上限（CSS px；空值为未设置）')).toHaveValue('250');
 await expect(page.getByLabel('误差 / 视口对角线上限（0–1）')).toHaveValue('0.1');
 await expect(page.getByLabel('单目标中位误差上限（CSS px）')).toHaveValue('200');
 await expect(page.getByLabel('每个目标最少有效样本')).toHaveValue('10');
});
