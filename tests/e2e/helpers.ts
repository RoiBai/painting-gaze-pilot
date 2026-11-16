import {expect,type Page} from '@playwright/test';
import type {Session} from '../../src/types';

export const backgroundAnswers={studyField:'教育研究',artEducation:'short',paintingInterest:4} as const;
export async function fillBackground(page:Page){
  await page.getByRole('textbox',{name:'你的主要学习或工作领域是什么？',exact:true}).fill(backgroundAnswers.studyField);
  await page.getByLabel('你是否学习过美术、设计或艺术史？',{exact:true}).selectOption(backgroundAnswers.artEducation);
  await page.getByLabel('你对欣赏绘画有多大兴趣？',{exact:true}).selectOption(String(backgroundAnswers.paintingInterest));
}
export async function consentAndStart(page:Page){
  await fillBackground(page);
  await page.getByRole('checkbox',{name:'参与同意',exact:true}).check();
  await page.getByRole('button',{name:/同意并进入摄像头准备/}).click();
}
export async function storedSessions(page:Page):Promise<Session[]>{
  return page.evaluate(async()=>{const path='/src/storage.ts';const {listSessions}=await import(/* @vite-ignore */path);return listSessions()});
}
export async function shortFlowSettings(page:Page,durationSeconds=1){
  await page.getByText('替换材料和完整配置（JSON）',{exact:true}).click();
  const config=await page.evaluate(async(duration)=>{const path='/src/study.ts';const {defaultConfig}=await import(/* @vite-ignore */path);return {...defaultConfig,durationSeconds:duration,calibrationClicks:1,validation:{...defaultConfig.validation,targetDurationMs:150,settleMs:50}}},durationSeconds);
  await page.getByRole('textbox',{name:'完整配置 JSON'}).fill(JSON.stringify(config));
  await page.getByRole('button',{name:'校验并载入配置',exact:true}).click();
  await page.getByRole('button',{name:'返回开始页',exact:true}).click();
  return config;
}
export async function beginFlowOnly(page:Page){
  await consentAndStart(page);
  await page.getByText('摄像头无法工作？',{exact:true}).click();
  await page.getByRole('button',{name:/仅试用流程/}).click();
  for(let i=0;i<9;i++)await page.getByRole('button',{name:'校准目标'}).click();
  await page.getByRole('button',{name:'研究者：标记低质量后继续',exact:true}).click();
}
export async function enterScene(page:Page){
  await page.getByRole('button',{name:'研究者：标记低质量后继续',exact:true}).click();
  await expect(page.locator('.stimulus img')).toBeVisible();
}
export async function skipQuestions(page:Page,count:number){
  for(let i=0;i<count;i++)await page.getByRole('button',{name:/^跳过此题/}).click();
}

// Independent RFC-4180 parser; commas, Chinese text and embedded newlines survive export.
export function csvRecords(text:string):Record<string,string>[] {
  text=text.replace(/^\ufeff/,'');
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(cell);cell='';}
    else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(cell||row.length){row.push(cell);rows.push(row);}
  if(quoted)throw Error('unclosed quoted field');
  return rows.slice(1).map(values=>Object.fromEntries(rows[0].map((key,i)=>[key,values[i]])));
}
