import {validCutout} from './cutoutCard';
import {knownPilotSurveyVersion} from './pilotQuestions';
import type { Painting, StudyConfig } from './types';
import { sceneMaterials } from './sceneMaterials';
import {commonQuestions,COMMON_QUESTIONNAIRE_VERSION} from './commonQuestionnaire';

function previewPainting(id: 'A' | 'B'): Painting {
  const horizontal = id === 'A';
  return {
    paintingId: `preview-${id.toLowerCase()}`,
    image: `/materials/preview-${id.toLowerCase()}.svg`,
    width: horizontal ? 1600 : 1100,
    height: horizontal ? 1000 : 1400,
    title: `预览材料 ${id} · 几何布局`,
    source: '本项目自制几何占位图，仅用于操作流程测试；不是古画或历史解释材料。',
    materialVersion: 'preview-1.0',
    verified: false,
    placeholder: true,
    aois: horizontal ? [
      { id: 'group-left', label: '左侧几何组（占位）', rect: [0.12, 0.25, 0.25, 0.47] },
      { id: 'group-right', label: '右侧几何组（占位）', rect: [0.64, 0.25, 0.24, 0.47] },
      { id: 'connector', label: '中间连接区（占位）', rect: [0.38, 0.38, 0.25, 0.24] },
    ] : [
      { id: 'group-left', label: '上方几何组（占位）', rect: [0.18, 0.16, 0.64, 0.25] },
      { id: 'group-right', label: '下方几何组（占位）', rect: [0.18, 0.63, 0.64, 0.22] },
      { id: 'connector', label: '中间连接区（占位）', rect: [0.35, 0.42, 0.30, 0.18] },
    ],
    relations: [
      { id: 'layout', text: '占位关系：两组几何图形位于连接区两端。仅描述本项目示意图的可见布局。', aoiIds: ['group-left', 'group-right', 'connector'], source: '自制预览 SVG 的布局；正式使用前替换为有来源的绘画关系。' },
      { id: 'shape', text: '占位关系：两组均包含不同形状，颜色用于区分区域，不代表历史人物或身份。', aoiIds: ['group-left', 'group-right'], source: '自制预览 SVG；不包含任何历史断言。' },
    ],
    pre: [
      { id: 'pre-connection', prompt: '你认为两组图形之间有什么联系？可以回答“不知道”。', scoring: '仅检查问题流程和回答保存。预览材料不作研究评分；正式材料需替换。' },
      { id: 'pre-evidence', prompt: '画面中的哪些视觉线索支持你的判断？', scoring: '仅检查能否描述证据，预览材料不作研究评分。' },
    ],
    post: [
      { id: 'post-explain', prompt: '如果向另一位观看者说明这幅示意图，你会如何解释两组图形的安排？', scoring: '占位评分参考：检查是否回答并指出依据，不计入研究结论。' },
      { id: 'post-alternative', prompt: '请描述一处帮助你理解图形联系的位置，并说明它的作用。', scoring: '占位评分参考：检查证据描述是否可理解，正式材料需制定独立评分规范。' },
    ],
    cards: [
      { id: 'card-1', title: '预览卡 1 · 找到两个区域', location: horizontal ? '左侧与右侧的大图形组' : '上方与下方的大图形组', text: '这是操作流程占位说明。先找到两组几何图形，再观察它们在画面中的位置。正式研究将使用经核查的局部定位与关系解释。', source: '本项目自制预览图；无历史内容。', aoiIds: ['group-left', 'group-right'] },
      { id: 'card-2', title: '预览卡 2 · 观察连接', location: '两组图形之间的连接区', text: '示意图中间的线条把两个区域联系起来。这只是预览图的布局描述，不代表任何古画的历史关系。正式材料应在这里给出有来源的关系说明。', source: '本项目自制预览图；正式解释待研究者提供并核查。', aoiIds: ['connector'] },
    ],
    interview: ['哪些问题的表述不清楚？', '两张解释卡是否容易操作与理解？', '观看或摄像头步骤中是否有不适或困难？'],
  };
}

export const geometricPreviewMaterials: Painting[] = [previewPainting('A'), previewPainting('B')];

export const defaultConfig: StudyConfig = {
  version: 'pilot-1.5.0', mode: 'preview', durationSeconds: 60, order: 'alternate', participantPlan: 'common-four-v2', questionnaireVersion:COMMON_QUESTIONNAIRE_VERSION,
  regression: 'ridge', kalman: true, displayMode: 'window',
  validation: { maxMedianErrorPx: 250, maxErrorDiagonalRatio: 0.10, maxTargetMedianErrorPx: 200, minSamplesPerTarget: 10, targetDurationMs: 2500, settleMs: 700 },
  nullPauseMs: 3000, calibrationClicks: 5,
  paintings: sceneMaterials.map(p=>({...structuredClone(p),...structuredClone(commonQuestions[p.paintingId])})),
  copy: {
    intro: '本研究关注观看绘画与理解画面关系的过程。你将观看同一长卷的两个场景、回答问题，并在每个场景阅读两张解释卡。摄像头仅在本机估计视线，不保存或上传视频。回答与视线样本只保存在当前浏览器，结束后可一键导出 ZIP 自行发送给研究者。可以随时退出。',
    consent: '我已了解流程，自愿参加，并同意在本机保存匿名回答与摄像头视线估计样本。',
    freeView: '请自然观看画面。保持坐姿与屏幕距离，观看结束后页面会自动继续。',
    interview: '请简短描述观看、答题和解释卡的使用体验；也可以跳过。',
  },
};

const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;
const numeric = (x: unknown, min: number, max = Infinity): x is number => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
const unique = (values: unknown[]) => new Set(values).size === values.length;

/** Structural checks + explicit researcher material gate. Provenance still needs human verification. */
export function validateConfig(input: unknown): string[] {
  const errors: string[] = [];
  if (!object(input)) return ['配置须为 JSON 对象'];
  const c = input;
  const threeConditions = c.pilotProtocol === 'three-condition-v1';
  if (c.pilotProtocol !== undefined && !threeConditions) errors.push('未知的三条件研究版本');
  if (c.pilotSurveyVersion!==undefined && (!threeConditions || !knownPilotSurveyVersion(c.pilotSurveyVersion))) errors.push('未知的三条件看后问卷版本');
  if (threeConditions && (c.participantPlan !== undefined || c.questionnaireVersion !== undefined)) {
    errors.push('三条件研究配置不能同时启用旧编号分组或旧问卷');
  }
  const requireText = (value: unknown, label: string) => { if (!text(value)) errors.push(`${label}不能为空`); };
  requireText(c.version, '配置版本');
  if (!['preview', 'research'].includes(c.mode as string)) errors.push('模式须为 preview 或 research');
  if (!numeric(c.durationSeconds, 1, 3600)) errors.push('观看时长须为 1–3600 秒');
  if (!['alternate', 'AB', 'BA'].includes(c.order as string)) errors.push('顺序须为 alternate、AB 或 BA');
  if (c.participantPlan !== undefined && !['crossed-four-v1','common-four-v2'].includes(c.participantPlan as string)) errors.push('参与者安排须为 common-four-v2、历史 crossed-four-v1 或省略（自定顺序）');
  if(c.questionnaireVersion!==undefined&&c.questionnaireVersion!==COMMON_QUESTIONNAIRE_VERSION)errors.push('未知的共同问卷版本');
  if (!['ridge', 'weightedRidge'].includes(c.regression as string)) errors.push('回归设置须为 ridge 或 weightedRidge');
  if (typeof c.kalman !== 'boolean') errors.push('kalman 须为布尔值');
  if (!['window', 'fullscreen'].includes(c.displayMode as string)) errors.push('显示模式须为 window 或 fullscreen');
  if (!numeric(c.nullPauseMs, 500, 30000)) errors.push('无预测暂停阈值须为 500–30000 毫秒');
  if (!numeric(c.calibrationClicks, 1, 20) || !Number.isInteger(c.calibrationClicks)) errors.push('每点校准点击数须为 1–20 的整数');
  if (!object(c.validation)) errors.push('缺少验证配置');
  else {
    const v = c.validation;
    if (v.maxMedianErrorPx !== null && !numeric(v.maxMedianErrorPx, 0)) errors.push('中位误差阈值须为非负数或 null（待判断）');
    if (v.maxErrorDiagonalRatio !== null && !numeric(v.maxErrorDiagonalRatio, 0, 2)) errors.push('视口对角线误差比例须为 0–2 或 null');
    if (v.maxTargetMedianErrorPx != null && !numeric(v.maxTargetMedianErrorPx, 0)) errors.push('单目标中位误差阈值须为非负数、null 或省略');
    if (!numeric(v.minSamplesPerTarget, 1, 10000) || !Number.isInteger(v.minSamplesPerTarget)) errors.push('每目标最少样本须为正整数');
    if (!numeric(v.targetDurationMs, 100, 60000)) errors.push('验证目标时长须为 100–60000 毫秒');
    if (!numeric(v.settleMs, 0) || !numeric(v.targetDurationMs, 100) || v.settleMs >= v.targetDurationMs) errors.push('稳定期须非负且短于验证目标时长');
  }
  if (!object(c.copy)) errors.push('缺少界面文案 copy');
  else for (const key of ['intro', 'consent', 'freeView', 'interview']) requireText(c.copy[key], `文案 ${key}`);
  const expectedSceneCount = threeConditions ? 3 : 2;
  if (!Array.isArray(c.paintings) || c.paintings.length !== expectedSceneCount) {
    errors.push(threeConditions ? '三条件研究必须恰好配置三个场景' : '必须恰好配置两幅画');
  }
  if (!Array.isArray(c.paintings)) return errors;
  const paintingIds: unknown[] = [];
  for (const [index, value] of c.paintings.entries()) {
    const label = `材料 ${index + 1}`;
    if (!object(value)) { errors.push(`${label}须为对象`); continue; }
    const p = value;
    paintingIds.push(p.paintingId);
    for (const key of ['paintingId', 'image', 'title', 'source', 'materialVersion']) requireText(p[key], `${label} ${key}`);
    if (typeof p.paintingId === 'string' && !/^[A-Za-z0-9_-]+$/.test(p.paintingId)) errors.push(`${label} paintingId 只能含英文字母、数字、下划线和短横线`);
    if (typeof p.image === 'string' && (!p.image.startsWith('/') || p.image.startsWith('//') || p.image.includes('..'))) errors.push(`${label}图片须使用本机 public 目录的绝对 URL 路径，如 /materials/a.jpg`);
    if (!numeric(p.width, 1, 100000) || !Number.isInteger(p.width) || !numeric(p.height, 1, 100000) || !Number.isInteger(p.height)) errors.push(`${label}原图尺寸须为正整数`);
    if (p.crop !== undefined) {
      if (!object(p.crop)) errors.push(`${label} crop 须为对象`);
      else {
        const crop = p.crop;
        if (!text(crop.sourceImage) || !crop.sourceImage.startsWith('/') || crop.sourceImage.startsWith('//') || crop.sourceImage.includes('..')) errors.push(`${label}裁切原图须为本机资源路径`);
        if (!numeric(crop.sourceWidth, 1) || !numeric(crop.sourceHeight, 1)) errors.push(`${label}裁切原图尺寸无效`);
        if (typeof crop.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(crop.sourceSha256)) errors.push(`${label}裁切原图 SHA-256 无效`);
        const r = crop.rect;
        if (!Array.isArray(r) || r.length !== 4 || !r.every(n => numeric(n, 0) && Number.isInteger(n)) || r[2] < 1 || r[3] < 1 || !numeric(crop.sourceWidth, 1) || !numeric(crop.sourceHeight, 1) || r[0] + r[2] > crop.sourceWidth || r[1] + r[3] > crop.sourceHeight) errors.push(`${label}裁切矩形必须位于原图范围内`);
      }
    }
    if (typeof p.verified !== 'boolean' || typeof p.placeholder !== 'boolean') errors.push(`${label}须明确 verified 与 placeholder 布尔状态`);
    if (c.mode === 'research' && (p.verified !== true || p.placeholder !== false)) errors.push(`${label}未完成核查或仍为占位材料，不能进入正式研究`);
    const aoiIds: string[] = [];
    if (!Array.isArray(p.aois) || p.aois.length < 1) errors.push(`${label}须至少有一个粗 AOI`);
    else for (const aoi of p.aois) {
      if (!object(aoi)) { errors.push(`${label} AOI 须为对象`); continue; }
      requireText(aoi.id, `${label} AOI id`); requireText(aoi.label, `${label} AOI label`);
      if (typeof aoi.id === 'string') aoiIds.push(aoi.id);
      const r = aoi.rect;
      const validRect=(rect:unknown)=>Array.isArray(rect) && rect.length===4 && rect.every(n=>numeric(n,0,1)) && rect[2]>0 && rect[3]>0 && rect[0]+rect[2]<=1.000001 && rect[1]+rect[3]<=1.000001;
      if (!validRect(r)) errors.push(`${label} AOI rect 须为画内归一化 [x,y,width,height]`);
      if(aoi.hitRects!==undefined && (!Array.isArray(aoi.hitRects) || !aoi.hitRects.every(validRect)))errors.push(`${label} AOI hitRects 须为有效的画内子区域`);
    }
    if (!unique(aoiIds)) errors.push(`${label} AOI id 重复`);
    const checkAOIs = (ids: unknown, where: string) => { if (!Array.isArray(ids) || !ids.length || !ids.every(id => typeof id === 'string' && aoiIds.includes(id))) errors.push(`${where}须引用存在的 AOI id`); };
    if (!Array.isArray(p.relations) || p.relations.length < 2 || p.relations.length > 3) errors.push(`${label}须有 2–3 条关系`);
    if (Array.isArray(p.relations)) for (const rel of p.relations) {
      if (!object(rel)) { errors.push(`${label}关系须为对象`); continue; }
      for (const key of ['id', 'text', 'source']) requireText(rel[key], `${label}关系 ${key}`);
      checkAOIs(rel.aoiIds, `${label}关系`);
    }
    const questionIds: unknown[] = [];
    const prePrompts: unknown[] = [];
    for (const section of ['pre', 'post']) {
      const qs = p[section];
      if (threeConditions) {
        if (!Array.isArray(qs) || (section === 'pre' ? qs.length === 0 : qs.length !== 0)) {
          errors.push(`${label} 三条件研究使用每景结束后的一套问卷，pre 须有题目、post 须为空数组`);
        }
      } else if (!Array.isArray(qs) || qs.length < 2 || qs.length > (section==='pre'?5:3)) {
        errors.push(`${label} ${section} 须有 ${section==='pre'?'2–5':'2–3'} 道问题`);
      }
      if (Array.isArray(qs)) for (const q of qs) {
        if (!object(q)) { errors.push(`${label}问题须为对象`); continue; }
        for (const key of ['id', 'prompt', 'scoring']) requireText(q[key], `${label} ${section} ${key}`);
        if (q.ratingScale !== undefined) {
          const scale = q.ratingScale;
          if (!object(scale) || !numeric(scale.min, 0) || !numeric(scale.max, 0) || scale.max <= scale.min ||
              !numeric(scale.step, Number.EPSILON, scale.max - scale.min) || !text(scale.lowLabel) || !text(scale.highLabel) ||
              q.type === 'multi-select') {
            errors.push(`${label}评分量表须有递增的范围、正数步长与两端的说明`);
          }
        }
        if(q.type!==undefined&&!['text','multi-select'].includes(q.type as string))errors.push(`${label}问题 type 无效`);
        if(q.description!==undefined&&typeof q.description!=='string')errors.push(`${label}问题 description 须为文字`);
        for(const flag of ['optional','confidence','allowUnknown'])if(q[flag]!==undefined&&typeof q[flag]!=='boolean')errors.push(`${label}问题 ${flag} 须为布尔值`);
        if(q.analysisRole!==undefined&&!['spontaneous','prompted','classification','card-feedback'].includes(q.analysisRole as string))errors.push(`${label}问题 analysisRole 无效`);
        if(q.type==='multi-select'){
          if(!Array.isArray(q.options)||q.options.length<2)errors.push(`${label}多选题至少须有两项 options`);
          else{
            const optionIds:unknown[]=[];
            for(const option of q.options){
              if(!object(option)){errors.push(`${label}多选选项须为对象`);continue;}
              requireText(option.id,`${label}选项 id`);requireText(option.label,`${label}选项 label`);optionIds.push(option.id);
              if(option.exclusive!==undefined&&typeof option.exclusive!=='boolean')errors.push(`${label}选项 exclusive 须为布尔值`);
            }
            if(!unique(optionIds))errors.push(`${label}多选选项 id 重复`);
            if(q.otherOptionId!==undefined&&(!text(q.otherOptionId)||!optionIds.includes(q.otherOptionId)||q.options.some(o=>object(o)&&o.id===q.otherOptionId&&o.exclusive===true)))errors.push(`${label}otherOptionId 须引用非互斥选项`);
          }
        }else if(q.options!==undefined||q.otherOptionId!==undefined)errors.push(`${label}文字题不能配置多选 options`);
        questionIds.push(q.id);
        if (section === 'pre') prePrompts.push(q.prompt);
        else if (prePrompts.includes(q.prompt)) errors.push(`${label}解释后问题不能照抄解释前问题`);
      }
    }
    if (!unique(questionIds)) errors.push(`${label}问题 id 须在前后题中保持唯一`);
    if (!Array.isArray(p.cards) || (threeConditions ? p.cards.length < 3 : p.cards.length !== 2)) {
      errors.push(threeConditions ? `${label}须有至少三张单区域解释卡` : `${label}须有固定顺序的两张解释卡`);
    }
    if (Array.isArray(p.cards)) {
      const ids: unknown[] = [];
      const cardRegions: unknown[] = [];
      for (const card of p.cards) {
        if (!object(card)) { errors.push(`${label}解释卡须为对象`); continue; }
        for (const key of ['id', 'title', 'location', 'text', 'source']) requireText(card[key], `${label}解释卡 ${key}`);
        if(card.art!==undefined&&!validCutout(card.art))errors.push(`${label}讲解卡抠图或颜色无效`);
        ids.push(card.id); checkAOIs(card.aoiIds, `${label}解释卡`);
        if (threeConditions && Array.isArray(card.aoiIds)) {
          if (card.aoiIds.length !== 1) errors.push(`${label}每张解释卡须对应一个独立区域`);
          cardRegions.push(card.aoiIds[0]);
        }
      }
      if (!unique(ids)) errors.push(`${label}解释卡 id 重复`);
      if (threeConditions && !unique(cardRegions)) errors.push(`${label}解释卡的区域不能重复`);
    }
    if (!Array.isArray(p.interview) || !p.interview.length || !p.interview.every(text)) errors.push(`${label}须提供访谈问题`);
  }
  if (!unique(paintingIds)) errors.push('各场景的 paintingId 必须不同');
  if (threeConditions && !['ming-xingle-cuju','ming-xingle-polo','ming-xingle-archery'].every(id => paintingIds.includes(id))) {
    errors.push('三条件研究须包含蹴鞠、马球和射箭三个指定场景');
  }
  if (['crossed-four-v1','common-four-v2'].includes(c.participantPlan as string) && (paintingIds.length !== 2 || !['ming-xingle-archery', 'ming-xingle-cuju'].every(id => paintingIds.includes(id)))) errors.push('四人顺序方案仅适用于射箭与蹴鞠两幅指定场景；其他材料请关闭四人方案');
  return errors;
}
