import {hasPaintedPoses} from './paintedPoses';
import {archerGuide} from './archeryNarrative';
import {PAPER_MATERIAL} from './cardPresentation';
import type {AOI,Painting,StudyConfig} from './types';
import {defaultConfig} from './study';
import {pilotInterviewQuestions,pilotSceneQuestions,UCI_RECALL_VERSION,uciRecallQuestionsByScene} from './pilotQuestions';
import catalogue from './uciCatalogue.json' with {type:'json'};

type SceneId=keyof typeof uciRecallQuestionsByScene;
const sourceSha256='988e4e96fdf3f122cbc021797df766b76e3531b219aee17601a44698ebf02ef0';

type Link={text:string; nodes:[string,string]};
interface Scene {id:SceneId;title:string;left:number;width:number;links:Link[]}
const scenes:Scene[]=[
  {id:'cuju',title:'蹴鞠',left:24100,width:5900,links:[
    {text:'宣宗在敞轩中观看庭院里的蹴鞠。',nodes:['0:9','3:17']},
    {text:'场上的内侍围着鞠球传踢。',nodes:['3:17','0:10']},
  ]},
  {id:'polo',title:'马球',left:17800,width:6950,links:[
    {text:'幄次围出了宣宗观看马球的座席。',nodes:['0:7','3:27']},
    {text:'球门和举旗者共同指示得分。',nodes:['0:3','3:19']},
  ]},
  {id:'archery',title:'射箭',left:29200,width:6888,links:[
    {text:'宣宗在攒尖亭中观射。',nodes:['3:16','3:5']},
    {text:'拉弓者朝向远处旗间的箭靶。',nodes:['1:2','0:6']},
  ]},
];

function regionId(node:string){return 'figma-'+node.replace(':','-')}
function makePainting({id,title,left,width,links}:Scene):Painting{
  const entries=catalogue.cards.filter(entry=>entry.scene===id);
  // The guided sequence follows the archer, the arrow, then its target.
  const order=id==='archery'?['3:16','3:5','3:6','0:5','1:2','1:6','0:6','0:4','1:3']
    :id==='polo'?['0:7','3:27','3:26','3:25','3:23','0:3','3:19']:null;
  if(order)entries.sort((a,b)=>order.indexOf(a.node)-order.indexOf(b.node));
  return {
    paintingId:'ming-xingle-'+id,title:'《明宣宗行乐图》局部 · '+title,
    materialVersion:PAPER_MATERIAL,
    source:'故宫博物院馆藏故00006247。原画裁切记录见 /materials/provenance-pilot-v1.json。讲解摘自研究组文档「'+catalogue.tab+'」。',
    image:'/materials/ming-xingle-'+id+'-pilot-v1.jpg',
    crop:{sourceImage:'/materials/ming-xingle-full.jpg',sourceWidth:36088,sourceHeight:1966,sourceSha256,rect:[left,0,width,1966]},
    width,height:1966,verified:false,placeholder:false,
    aois:entries.map(entry=>({id:regionId(entry.node),label:entry.title,rect:entry.rect as AOI['rect'],...(entry.hitRects.length?{hitRects:entry.hitRects as AOI['rect'][]}:{})})),
    cards:entries.map(entry=>({
      id:id+'-'+regionId(entry.node),aoiIds:[regionId(entry.node)],location:entry.title,
      title:entry.title,text:entry.scene==='archery' && entry.node==='1:6'
        ? '细长的箭杆右端带着尾羽，左端的箭尖指向两面旗帜之间的箭靶。'+entry.text
        : entry.scene==='archery'&&entry.node==='1:2'?archerGuide.text:entry.text,
      art:{image:entry.image,board:entry.board,glow:entry.glow,shape:entry.shape},
      source:catalogue.document+' 「'+catalogue.tab+'」 '+entry.ranges.map(r=>r.join('–')).join(', ')+' · '+catalogue.figma+'?node-id='+entry.node.replace(':','-')
        +(entry.scene==='archery' && entry.node==='1:6'?' · 首句据原画羽箭形态和方向描述。':'')
        +(entry.scene==='archery' && ['1:2','1:6','0:6'].includes(entry.node)?' · 动画中的羽箭采用独立羽箭抠图，箭尖朝左、尾羽在右。'+catalogue.figma+'?node-id=1-6':'')
        +(hasPaintedPoses(id+'-'+regionId(entry.node))?' · 动作演示由原画和两张 ImageGen 局部补帧构成。':''),
    })),
    relations:links.map((link,i)=>({id:id+'-relation-'+(i+1),text:link.text,aoiIds:link.nodes.map(regionId),source:catalogue.document})),
    pre:structuredClone(pilotSceneQuestions),post:[],recallQuestions:structuredClone(uciRecallQuestionsByScene[id]),
    interview:pilotInterviewQuestions.map(q=>q.prompt),
  };
}

export const pilotConfig:StudyConfig={
  ...defaultConfig,version:'pilot-three-uci-3.3.2',pilotSurveyVersion:UCI_RECALL_VERSION,
  mode:'preview',pilotProtocol:'three-condition-v1',participantPlan:undefined,questionnaireVersion:undefined,
  paintings:scenes.map(makePainting),
  copy:{
    intro:'请自然看画、阅读出现的讲解卡，之后试着用自己的话介绍这个场景。',
    consent:'我了解摄像头会在本机估计观看三个场景时的视线，自愿参与本次试用。',
    freeView:'请按自己的习惯看画，阅读出现的讲解卡。每段结束后，你可以为这段体验评分。',
    interview:'请回想三段观看，比较讲解出现时的感受。',
  },
};
