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

export function recallAnswerExamples(version:string,questionId:string):readonly string[]{
  return version==='pilot2-recall-v1'?examples[questionId]??[]:[];
}
