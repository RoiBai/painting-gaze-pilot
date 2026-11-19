import {test,expect} from '@playwright/test';
test('unset thresholds offer unassessed continuation, while defaults use one minute',async({page})=>{
 await page.goto('/?study=legacy');await page.getByRole('button',{name:'研究者设置',exact:true}).click();await expect(page.getByLabel('自由观看（秒）')).toHaveValue('60');
 await page.evaluate(async()=>{const path='/tests/qualityHarness.tsx';const {mountQuality}=await import(/* @vite-ignore */path);mountQuality('judgment')});
 await expect(page.getByRole('heading',{name:'质量未判定',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'研究者：标记低质量后继续'})).toHaveCount(0);
 await page.getByRole('button',{name:'保留“未判定”，继续记录'}).click();await expect(page.locator('#quality-test')).toHaveAttribute('data-decision','unassessed');
});
test('insufficient samples still require explicit failure acknowledgment and show cause',async({page})=>{
 await page.goto('/?study=legacy');await page.evaluate(async()=>{const path='/tests/qualityHarness.tsx';const {mountQuality}=await import(/* @vite-ignore */path);mountQuality('fail')});
 await expect(page.getByRole('heading',{name:'本轮验证未通过',exact:true})).toBeVisible();await expect(page.getByRole('status')).toContainText('有效预测样本只有 0 个，少于要求的 5 个');
 await expect(page.getByRole('button',{name:'保留“未判定”，继续记录'})).toHaveCount(0);
 await page.getByRole('button',{name:'研究者：标记低质量后继续'}).click();await expect(page.locator('#quality-test')).toHaveAttribute('data-decision','low_quality');
});
