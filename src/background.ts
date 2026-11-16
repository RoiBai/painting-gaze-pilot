import type {BackgroundAnswers,BackgroundQuestion,ParticipantBackground} from './types';

export const BACKGROUND_VERSION='background-v1';
export const BACKGROUND_QUESTIONS:BackgroundQuestion[]=[
  {id:'studyField',prompt:'你的主要学习或工作领域是什么？'},
  {id:'artEducation',prompt:'你是否学习过美术、设计或艺术史？',options:[{id:'none',label:'没有'},{id:'short',label:'短期课程或兴趣学习'},{id:'long',label:'长期或专业学习'}]},
  {id:'paintingInterest',prompt:'你对欣赏绘画有多大兴趣？',scale:{min:1,max:5,minLabel:'完全没有兴趣',maxLabel:'非常有兴趣'}},
];
export function freezeBackground(answers:BackgroundAnswers):ParticipantBackground {
  if(!answers||typeof answers!=='object'||typeof answers.studyField!=='string'||!answers.studyField.trim()||!['none','short','long'].includes(answers.artEducation)||!Number.isInteger(answers.paintingInterest)||answers.paintingInterest<1||answers.paintingInterest>5)throw Error('请完整填写学习或工作领域、艺术学习经历和绘画兴趣（1–5）。');
  return {version:BACKGROUND_VERSION,answers:structuredClone(answers),questions:structuredClone(BACKGROUND_QUESTIONS)};
}
