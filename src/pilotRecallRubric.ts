import {PILOT_SURVEY_VERSION,UCI_RECALL_VERSION} from './pilotQuestions';

const examples:Record<string,readonly string[]>={
  'recall-polo-goal':['旗','旗子','小旗'],
  'recall-polo-audience':['帷幕','帘幕','围幔（无需记住颜色）'],
  'recall-polo-riders':['弯的','弯钩状','曲头'],
  'recall-cuju-platform':['台阶','阶梯','几级石阶'],
  'recall-cuju-garden':['山石','石头','假山石'],
  'recall-cuju-court':['白色','浅色','灰白','米白等相近表述'],
  'recall-archery-target':['旗','旗杆','旗子'],
  'recall-archery-pavilion':['屏风','画屏'],
  'recall-archery-archers':['绿色','绿衣','青绿色'],
};

const uciExamples:Record<string,readonly string[]>={
  'recall-cuju-figma-1-5':examples['recall-cuju-platform'],
  'recall-cuju-figma-0-8':examples['recall-cuju-garden'],
  'recall-cuju-figma-0-10':examples['recall-cuju-court'],
  'recall-archery-figma-0-6':examples['recall-archery-target'],
  'recall-archery-figma-3-5':examples['recall-archery-pavilion'],
  'recall-archery-figma-1-2':examples['recall-archery-archers'],
  'recall-polo-figma-3-19':examples['recall-polo-goal'],
  'recall-polo-figma-3-27':examples['recall-polo-audience'],
  'recall-polo-figma-3-25':['椭圆形','环形','圆圈','扁圆的圈或环'],
};

export function recallAnswerExamples(version:string,questionId:string):readonly string[]{
  if(version===UCI_RECALL_VERSION)return uciExamples[questionId]??[];
  if(version===PILOT_SURVEY_VERSION)return examples[questionId]??[];
  return [];
}
