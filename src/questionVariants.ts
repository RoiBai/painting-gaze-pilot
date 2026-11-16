import type {Question} from './types';

export type QuestionVariantId='alpha'|'beta';
export interface SceneQuestionVariant {pre:Question[];post:Question[]}
export const QUESTION_VARIANT_VERSION='parallel-questions-v1';
export const questionVariantLabels:Record<QuestionVariantId,string>={alpha:'甲题',beta:'乙题'};

// Both forms ask about the same two constructs. Identical wording across scenes
// within one form avoids giving a scene extra clues before its explanation cards.
const prompts:Record<QuestionVariantId,{pre:[string,string];post:[string,string]}>= {
  alpha:{
    pre:[
      '画面中的人物分别在做什么？他们之间有什么联系？',
      '请选出一至两处画面线索，说明它们为什么支持你刚才的判断。',
    ],
    post:[
      '现在，请向没看过这幅画的人简要介绍这段场景，讲清人物的不同作用及相互联系。',
      '请用大致位置指出一处能支持这段介绍的画面证据，并解释它怎样表现人物之间的关系。',
    ],
  },
  beta:{
    pre:[
      '你怎样理解这段画面里正在发生的事情？请说明不同人物在其中的角色和相互关系。',
      '你的解释主要依据画面中的哪些地方？请描述一至两处，并说明它们与判断的关系。',
    ],
    post:[
      '如果为这段画面配一段简短解说，你会怎样说明不同人物的角色，让观众理解他们之间的联系？',
      '为你的解说选出一处最有说服力的画面线索：它在哪里，为什么能说明你提到的关系？',
    ],
  },
};
const common='形成性试用评分参考，尚未经等难度验证。甲乙两题本、两场景和前后阶段使用相同维度。具体帝号、官职、运动规则与胜负不计分；仅认出活动名称不等于解释了人物关系，不知道活动名称也不自动记零分。';
const relationRubric=`${common} 关系维度：0=不知道、没有相关解释或解释与可见场景明显不符；1=描述了活动或若干人物角色，但未说明角色间联系；2=说明不同人物的活动角色及其相互联系。视觉依据另由证据题记录，不在本题重复计分。`;
const evidenceRubric=`${common} 证据维度：0=未给出画面线索或线索与场景明显不符；1=指出相关动作、器物或区域，但没有说明它如何支持解释；2=用可辨识的粗区域/视觉线索说明对人物关系判断的支持。接受文字位置描述，不要求精确坐标或辨认细小物件。`;
const sceneNotes:Record<'archery'|'cuju',string>={
  archery:'本景核对线索沿用现有材料与解释卡：持弓/张弓人物、箭靶及旗杆区域、亭中坐观者和活动空地；不追加比赛或仪式规则。',
  cuju:'本景核对线索沿用现有材料与解释卡：台下活动人物的姿态、球所在的大致区域、台上坐观者及周围站立人物；未辨认小球不自动视为不理解人物关系。',
};
function sceneQuestions(form:QuestionVariantId,scene:'archery'|'cuju'):SceneQuestionVariant {
  const questions=(phase:'pre'|'post'):Question[]=>[
    {id:`${form}-${scene}-${phase}-relation`,prompt:prompts[form][phase][0],scoring:`${relationRubric} ${sceneNotes[scene]}`},
    {id:`${form}-${scene}-${phase}-evidence`,prompt:prompts[form][phase][1],scoring:`${evidenceRubric} ${sceneNotes[scene]}`},
  ];
  return {pre:questions('pre'),post:questions('post')};
}

/** Versioned form definitions. Clone into the session config at enrollment. */
export const questionVariants:Record<QuestionVariantId,Record<string,SceneQuestionVariant>>={
  alpha:{
    'ming-xingle-archery':sceneQuestions('alpha','archery'),
    'ming-xingle-cuju':sceneQuestions('alpha','cuju'),
  },
  beta:{
    'ming-xingle-archery':sceneQuestions('beta','archery'),
    'ming-xingle-cuju':sceneQuestions('beta','cuju'),
  },
};
