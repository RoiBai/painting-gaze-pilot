import type {Question} from './types';

const rating = (id:string, prompt:string, lowLabel:string, highLabel:string, overall=false):Question => ({
  id, prompt, scoring:overall?'总体体验评分，越高越好。':'Raw NASA-TLX 中文试用表述，越高表示负荷越高。',
  confidence:false, allowUnknown:false,
  ratingScale:{min:overall?1:0,max:overall?7:100,step:overall?1:5,lowLabel,highLabel},
});
const written = (id:string,prompt:string,optional=false):Question => ({
  id,prompt,scoring:'逐人、逐场景保留原话，用于质性分析。',confidence:false,allowUnknown:false,optional,
});

export const pilotSceneQuestions:Question[] = [
  rating('mental','刚才看画和读讲解，需要你投入多少思考和注意？','很低','很高'),
  rating('physical','刚才的观看和操作对你的身体活动要求有多高？','很低','很高'),
  rating('temporal','看画和读卡时，你感觉时间有多紧迫？','很宽裕','很紧迫'),
  rating('performance','你觉得自己完成“看懂并能介绍这个场景”的目标了吗？','完全达到','完全没达到'),
  rating('effort','为达到刚才的理解程度，你付出了多少努力？','很少','很多'),
  rating('frustration','刚才你感到多大程度的紧张、烦躁或挫败？','很低','很高'),
  rating('overall','总体而言，你怎样评价刚才这种讲解方式的观看体验？','非常差','非常好',true),
  written('overview','请用一两句话，向没看过这幅画的人介绍刚才的场景。可以回答“不确定”。'),
  written('evidence','选一个你记得的画面细节。它怎样帮助你判断刚才发生了什么？'),
  written('timing','有哪张卡来得正合适、太早或太晚？当时你在看什么？',true),
  written('unanswered','关于这个场景，还有什么是你想了解、讲解没有回答的？',true),
];
export const pilotInterviewQuestions:Question[] = [
  written('compare','三段体验中，哪一段的讲解最适合你？请说明原因，也可以回答“没有明显区别”。'),
  written('interruptions','回想一次出卡：当时你在看什么？那张卡帮到了你，还是打断了你？'),
  written('improve','如果可以改一处，你最想调整哪一段的文字、讲解对象或出现时机？为什么？'),
];
