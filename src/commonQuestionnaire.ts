import type {Question} from './types';

export const COMMON_QUESTIONNAIRE_VERSION='common-viewing-v1' as const;
const analyticalNote='质性分析：保留参与者原话并按同一参与者、同一场景对应解释、疑问和卡片反馈。讲解前后为同一人的两个阶段，不作为对照组与实验组；不能仅凭前后变化认定讲解有效。';
function sceneQuestions(scene:'archery'|'cuju'):{pre:Question[];post:Question[]} {
  const make=(phase:'pre'|'post',suffix:string,prompt:string,analysisRole:Question['analysisRole'],details:Partial<Question>={}):Question=>({id:`common-${scene}-${phase}-${suffix}`,prompt,scoring:`${analyticalNote} ${analysisRole==='spontaneous'?'此题记录参与者在定向追问前自主表达的内容。':analysisRole==='prompted'?'此题为定向追问，回答中出现的关系解释不得编码为自发发现。':analysisRole==='classification'?'此题为开放回答后的困难归类，勿将给定选项视为参与者自发表达。':'此题记录对固定讲解卡的反馈，并核对实际阅读和跳过记录。'}`,type:'text',analysisRole,confidence:false,allowUnknown:false,...details});
  return {
    pre:[
      make('pre','overview','你觉得刚才的场景主要展示了什么？','spontaneous',{description:'1–3 句话，可以回答“不确定”。'}),
      make('pre','interest','如果继续了解这个场景，你最想知道什么？','spontaneous',{description:'可以回答“暂时没有”。'}),
      make('pre','uncertainty','有没有让你不确定或难以理解的地方？请描述大致位置，以及你不确定什么。','spontaneous',{description:'选答，允许“没有”或“记不清”。',optional:true}),
      make('pre','activity-evidence','请选一处你注意到的活动，说说这些人在做什么。哪些画面细节让你这样判断？','prompted'),
      make('pre','difficulties','你在理解这个场景时遇到了哪些困难？','classification',{type:'multi-select',description:'可以多选。“没有明显困难”与其他选项不能同时选择。',options:[
        {id:'activity',label:'看不懂人物在做什么'},
        {id:'relationships',label:'不清楚人物之间的关系'},
        {id:'objects',label:'不认识画中的器物或物件'},
        {id:'context',label:'缺少相关背景知识'},
        {id:'details',label:'画面细节看不清'},
        {id:'other',label:'其他'},
        {id:'none',label:'没有明显困难',exclusive:true},
      ],otherOptionId:'other'}),
    ],
    post:[
      make('post','questions-addressed','这些讲解回答了你刚才的哪些疑问？还有什么没有回答？','card-feedback'),
      make('post','interpretation-change','看完讲解后，你对场景的解释有没有变化？请具体说明；没有变化也可以。','card-feedback'),
    ],
  };
}
export const commonQuestions:Record<string,{pre:Question[];post:Question[]}>= {
  'ming-xingle-archery':sceneQuestions('archery'),
  'ming-xingle-cuju':sceneQuestions('cuju'),
};
