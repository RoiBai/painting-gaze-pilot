import {test,expect} from '@playwright/test';
import {commonQuestions} from '../../src/commonQuestionnaire';
import {shortFlowSettings,beginFlowOnly,enterScene,storedSessions} from './helpers';

test('difficulty choices appear last, enforce none exclusivity both ways and remove abandoned other text',async({page})=>{
  await page.goto('/?participant=N03&preview=design');await shortFlowSettings(page);await beginFlowOnly(page);await enterScene(page);
  const qs=commonQuestions['ming-xingle-archery'].pre;
  for(let i=0;i<4;i++){
    await expect(page.getByRole('heading',{name:qs[i].prompt,exact:true})).toBeVisible();
    await expect(page.getByRole('checkbox',{name:'没有明显困难',exact:true})).toHaveCount(0);
    // Optional question can be left blank by continuing, and is recorded as skipped.
    if(i===2)await page.getByRole('button',{name:/^继续/}).click();
    else await page.getByRole('button',{name:/^跳过此题/}).click();
  }
  const none=page.getByRole('checkbox',{name:'没有明显困难',exact:true});
  const activity=page.getByRole('checkbox',{name:'看不懂人物在做什么',exact:true});
  const other=page.getByRole('checkbox',{name:'其他',exact:true});
  const detail=page.getByRole('textbox',{name:'其他困难（选填）',exact:true});
  await expect(page.getByRole('button',{name:/^继续/})).toBeDisabled();
  await activity.check();await other.check();await detail.fill('应当被清掉的旧补充');
  await none.check();await expect(activity).not.toBeChecked();await expect(other).not.toBeChecked();await expect(detail).toHaveCount(0);
  await activity.check();await expect(none).not.toBeChecked();
  await other.check();await expect(detail).toHaveValue('');
  await detail.fill('画面中的细节难以辨认，尤其是"小物件"。');
  await page.getByRole('button',{name:/^继续/}).click();
  await page.getByRole('button',{name:'退出并保留记录',exact:true}).click();
  const [session]=await storedSessions(page);
  const pre=session.responses.filter(row=>row.phase==='pre');
  expect(pre).toHaveLength(5);expect(pre[2].skipped).toBe(true);expect(pre[2].answer).toBe('');
  expect(pre[4].selectedOptions).toEqual(['activity','other']);
  expect(pre[4].otherText).toBe('画面中的细节难以辨认，尤其是"小物件"。');
  expect(pre[4].answer).not.toContain('没有明显困难');expect(pre[4].answer).not.toContain('应当被清掉');
});
