import type { AOI, Painting, StudyConfig } from './types';
import { defaultConfig } from './study';
import { pilotInterviewQuestions, pilotSceneQuestions, PILOT_SURVEY_VERSION, recallQuestionsByScene } from './pilotQuestions';

const catalogue = 'https://www.dpm.org.cn/collection/paint/228988.html';
const poloSource = 'https://www.dpm.org.cn/court/culture/166797.html';
const manifest = '/materials/provenance-pilot-v1.json';
const sourceSha256 = '988e4e96fdf3f122cbc021797df766b76e3531b219aee17601a44698ebf02ef0';

type RegionCard = {
  region: AOI;
  title: string;
  text: string;
};

// Each card refers to one distinct region in normalized crop coordinates.
// The array order is also the authored sequence for sequential presentation.
type Scene = {
  id: 'cuju' | 'polo' | 'archery';
  title: string;
  left: number;
  width: number;
  cards: [RegionCard, RegionCard, RegionCard];
  relations: {text: string; regions: string[]}[];
};

const scenes: Scene[] = [
  {
    id: 'cuju',
    title: '蹴鞠',
    left: 24100,
    width: 5900,
    cards: [
      {
        region: { id: 'court', label: '台下的蹴鞠者', rect: [0.42, 0.61, 0.38, 0.34] },
        title: '台下的鞠球',
        text: '台下众人围着空地站定，一人抬起脚。脚前悬着一只浅色小球，旁边的人朝它转过身来。',
      },
      {
        region: { id: 'platform', label: '台上坐观的人物', rect: [0.43, 0.05, 0.40, 0.54] },
        title: '高台上的观看者',
        text: '皇帝坐在有顶盖的平台上，身边有人侍立。台阶朝向众人踢球的空地，将观看席与球场连在一起。',
      },
      {
        region: { id: 'garden', label: '场边松树与山石', rect: [0.02, 0.04, 0.38, 0.91] },
        title: '球场边的松石',
        text: '左边的松枝向空地伸展，树下立着山石。园墙在树后露出一截，点出了这场蹴鞠所在的庭园。',
      },
    ],
    relations: [
      {text: '球与台下抬脚人物的姿态相呼应。', regions: ['court']},
      {text: '高台坐观者与空地上的活动者分处两个层次。', regions: ['platform', 'court']},
    ],
  },
  {
    id: 'polo',
    title: '马球',
    left: 17800,
    width: 6950,
    cards: [
      {
        region: { id: 'riders', label: '骑队与持杆骑手', rect: [0.15, 0.30, 0.33, 0.58] },
        title: '骑手与球杆',
        text: '一名绿衣骑手离开左侧的骑队，俯身向前伸出曲头球杆。展开四蹄的白马把动作带向场地右方。',
      },
      {
        region: { id: 'goal', label: '彩绘球门与门旁骑手', rect: [0.725, 0.08, 0.215, 0.83] },
        title: '彩绘的球门',
        text: '右边立着一扇彩绘球门，红色门柱之间留出一道小门洞。门边另有一名骑手，手里举着旗。',
      },
      {
        region: { id: 'audience', label: '帷幕前的坐观者', rect: [0.50, 0.04, 0.215, 0.53] },
        title: '场边的帷幕',
        text: '皇帝在浅色帷幕前坐观马球，侍从分立两侧。坐席前留出一大片空地，骑手从这片空地上经过。',
      },
    ],
    relations: [
      {text: '场内击球骑手与右侧球门处在同一活动空间。', regions: ['riders', 'goal']},
      {text: '帷幕前坐席面向骑手活动的空地。', regions: ['audience', 'riders']},
    ],
  },
  {
    id: 'archery',
    title: '射箭',
    left: 29200,
    width: 6888,
    cards: [
      {
        region: { id: 'archers', label: '亭前持弓人物', rect: [0.51, 0.49, 0.24, 0.45] },
        title: '亭前的弓手',
        text: '绿衣人物站在亭前，双臂抬起，身体转向左方。身后还有人携弓站立，几个人的姿态各不相同。',
      },
      {
        region: { id: 'target', label: '左侧圆靶和旗杆', rect: [0.06, 0.04, 0.28, 0.85] },
        title: '旗间的圆靶',
        text: '场地左侧竖着几面旗，圆形箭靶悬在旗杆之间。靶与弓手相隔一片空地，分据画面两端。',
      },
      {
        region: { id: 'pavilion', label: '绿顶亭中的坐观者', rect: [0.70, 0.03, 0.24, 0.45] },
        title: '亭中的坐席',
        text: '绿瓦亭中，皇帝坐在屏风前，身旁有人侍立。画家把坐席安排在射场边，让观看者与弓手同时入画。',
      },
    ],
    relations: [
      {text: '场地左侧箭靶与右侧持弓人物隔空相向。', regions: ['target', 'archers']},
      {text: '亭中坐席在开放射场的一侧。', regions: ['pavilion', 'archers']},
    ],
  },
];

function makePainting(scene: Scene): Painting {
  const { id, left, width } = scene;
  const source = id === 'polo' ? `${catalogue}；${poloSource}` : catalogue;
  return {
    paintingId: `ming-xingle-${id}`,
    title: `《明宣宗行乐图》局部 · ${scene.title}`,
    materialVersion: 'ming-scenes-pilot-1.0',
    source: `故宫博物院馆藏故00006247。图像来源、裁切与文件哈希见 ${manifest}。场景释读据 ${source}`,
    image: `/materials/ming-xingle-${id}-pilot-v1.jpg`,
    crop: { sourceImage: '/materials/ming-xingle-full.jpg', sourceWidth: 36088, sourceHeight: 1966, sourceSha256, rect: [left, 0, width, 1966] },
    width,
    height: 1966,
    verified: false,
    placeholder: false,
    aois: scene.cards.map(card => card.region),
    cards: scene.cards.map(({ region, title, text }) => ({
      id: `${id}-${region.id}`,
      aoiIds: [region.id],
      location: region.label,
      title,
      text,
      source,
    })),
    relations: scene.relations.map(({text, regions}, i) => ({
      id: `${id}-relation-${i + 1}`,
      text,
      source,
      aoiIds: regions,
    })),
    pre: structuredClone(pilotSceneQuestions),
    recallQuestions: structuredClone(recallQuestionsByScene[id]),
    post: [],
    interview: pilotInterviewQuestions.map(question => question.prompt),
  };
}

export const pilotConfig: StudyConfig = {
  ...defaultConfig,
  version: 'pilot-three-2.0.0',
  pilotSurveyVersion: PILOT_SURVEY_VERSION,
  mode: 'preview',
  pilotProtocol: 'three-condition-v1',
  participantPlan: undefined,
  questionnaireVersion: undefined,
  paintings: scenes.map(makePainting),
  copy: {
    intro: '你将观看《明宣宗行乐图》的三个场景。请自然看画、阅读出现的讲解卡，每段观看结束后按自己的感受评分。',
    consent: '我了解摄像头会在本机估计观看三个场景时的视线，自愿参与本次试用。',
    freeView: '请按自己的习惯看画，阅读出现的讲解卡。每段结束后，你可以为这段体验评分。',
    interview: '请回想三段观看，比较讲解出现时的感受。',
  },
};
