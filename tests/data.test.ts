import {describe,it,expect} from 'vitest';
import {strFromU8} from 'fflate';
import {csvCell,toCSV,buildTextExportFiles,buildCorrectionExportFiles} from '../src/export';
import {actualSampleRate,buildDensity,eligibleSamples,heatmapSize} from '../src/heatmap';
import {paintingFixture,sampleFixture,sessionFixture} from './dataFixtures';
import {freezeBackground} from '../src/background';
import {commonQuestions,COMMON_QUESTIONNAIRE_VERSION} from '../src/commonQuestionnaire';

// Independent RFC-4180 reader to verify raw Chinese multiline responses survive export.
function parseCSV(text:string):string[][]{
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(cell);cell='';}
    else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(cell||row.length){row.push(cell);rows.push(row);}
  if(quoted)throw new Error('unclosed quoted field');
  return rows;
}

describe('research CSV',()=>{
  it('rejects derived coordinates as raw data and refuses to correct them twice',async()=>{
    const derived={...sessionFixture(),coordinateSource:'reference-corrected' as const};
    expect(()=>buildTextExportFiles(derived)).toThrow('参考校正坐标不能作为原始数据导出');
    await expect(buildCorrectionExportFiles(derived)).rejects.toThrow('不能重复校正派生坐标');
  });
  it('round-trips Chinese, commas, quotes, actual line breaks, literal slashes, zero, false and missing values',()=>{
    const answer='“器物”，他说 "不知道"\n第二行\r\n第三行\\n';
    const csv=toCSV([{answer,confidence:null,count:0,paused:false}],['answer','confidence','count','paused']);
    expect(parseCSV(csv)).toEqual([['answer','confidence','count','paused'],[answer,'','0','false']]);
    expect(csvCell(NaN)).toBe('');expect(csvCell(Infinity)).toBe('');
  });
  it('keeps no-prediction callback and missing measurements blank, with matching IDs in all files',()=>{
    const s=sessionFixture();s.samples=[sampleFixture(),sampleFixture({sampleIndex:1,predictionAvailable:false,viewportX:null,viewportY:null,imageX:null,imageY:null,imageNormX:null,imageNormY:null,insideImage:false})];
    s.responses=[{sessionId:s.sessionId,participantId:s.participantId,paintingId:'A',phase:'pre',questionId:'p1',answer:'一行\n"二行"',confidence:null,unknown:true,skipped:false,durationMs:100,timeMs:600}];
    const files=buildTextExportFiles(s);
    expect(Object.keys(files)).toEqual(['gaze_samples.csv','phase_events.csv','responses.csv','validation.csv','session.json']);
    const csv=parseCSV(strFromU8(files['gaze_samples.csv']).replace(/^\ufeff/,''));
    const h=csv[0];expect(csv.length).toBe(3);expect(csv[2][h.indexOf('viewportX')]).toBe('');expect(csv[2][h.indexOf('confidence')]).toBe('');expect(csv[2][h.indexOf('predictionAvailable')]).toBe('false');
    const snapshot=JSON.parse(strFromU8(files['session.json']));
    expect(snapshot.sessionId).toBe(csv[1][h.indexOf('sessionId')]);expect(snapshot.exportMetadata.heatmapRenders[0].sampleCount).toBe(1);
    expect(snapshot.config.version).toBe(s.config.version);expect(snapshot.samples.length).toBe(2);
    expect(parseCSV(strFromU8(files['responses.csv']).replace(/^\ufeff/,''))[1][5]).toBe(s.responses[0].answer);
  });
  it('appends the frozen assignment and phase-specific prompts without changing raw responses or the file list',()=>{
    const s=sessionFixture();s.participantId='N06';s.order=['B','A'];
    s.assignment={planVersion:'crossed-four-v1',participantId:'N06',order:'BA',questionVariant:'beta',questionVersion:'frozen-question-version',paintingOrder:['B','A']};
    const prompt='画面中的“关系”，你怎么理解？\n请说出一条线索。';
    s.config.paintings[0].pre=[{id:'same-id',prompt:'另一幅画的问题',scoring:''}];
    s.config.paintings[1].pre=[{id:'same-id',prompt,scoring:''}];
    s.config.paintings[1].post=[{id:'same-id',prompt:'阅读之后，你的理解有哪些变化？',scoring:''}];
    s.responses=(['pre','post'] as const).map(phase=>({sessionId:s.sessionId,participantId:s.participantId,paintingId:'B',phase,questionId:'same-id',answer:'原话，包含 "引号"\n第二行',confidence:2,unknown:false,skipped:false,durationMs:1234,timeMs:600}));
    const before=structuredClone(s),files=buildTextExportFiles(s);
    const rows=parseCSV(strFromU8(files['responses.csv']).replace(/^\ufeff/,'')),header=rows[0];
    expect(header.slice(0,11)).toEqual(['sessionId','participantId','paintingId','phase','questionId','answer','confidence','unknown','skipped','durationMs','timeMs']);
    expect(header.slice(11,17)).toEqual(['planVersion','questionVariant','questionVersion','sceneOrder','paintingOrder','questionPrompt']);
    expect(rows[1].slice(11,17)).toEqual(['crossed-four-v1','beta','frozen-question-version','BA','["B","A"]',prompt]);
    expect(rows[2][header.indexOf('questionPrompt')]).toBe(s.config.paintings[1].post[0].prompt);
    expect(rows[1][5]).toBe(before.responses[0].answer);expect(rows[1][6]).toBe('2');
    const snapshot=JSON.parse(strFromU8(files['session.json']));
    expect(snapshot.assignment).toEqual(before.assignment);expect(snapshot.responses).toEqual(before.responses);expect(s).toEqual(before);
    expect(Object.keys(files)).toEqual(['gaze_samples.csv','phase_events.csv','responses.csv','validation.csv','session.json']);
  });
  it('never infers a legacy assignment from the participant ID and only exports question text present in its snapshot',()=>{
    const s=sessionFixture();s.participantId='N03';
    s.config.paintings[0].pre=[{id:'old-p1',prompt:'旧会话实际使用的题目',scoring:''}];
    s.config.copy.interview='旧会话总访谈';s.config.paintings[1].interview=['旧会话画作访谈'];
    s.responses=[{paintingId:'A',phase:'pre' as const,questionId:'old-p1'},{paintingId:'A',phase:'pre' as const,questionId:'missing-id'},{paintingId:null,phase:'interview' as const,questionId:'interview'},{paintingId:null,phase:'interview' as const,questionId:'B-interview-0'}].map(row=>({...row,sessionId:s.sessionId,participantId:s.participantId,answer:'保留原文',confidence:null,unknown:false,skipped:false,durationMs:0,timeMs:0}));
    const files=buildTextExportFiles(s),rows=parseCSV(strFromU8(files['responses.csv']).replace(/^\ufeff/,''));
    for(const row of rows.slice(1))expect(row.slice(11,16)).toEqual(['','','','','']);
    expect(rows.slice(1).map(row=>row[16])).toEqual(['旧会话实际使用的题目','','旧会话总访谈','旧会话画作访谈']);
    expect(JSON.parse(strFromU8(files['session.json']))).not.toHaveProperty('assignment');
    for(const row of rows.slice(1))expect(row[rows[0].indexOf('analysisRole')]).toBe('');
  });
  it('exports common questionnaire roles, frozen multi-select wording and background separately without rewriting the session',()=>{
    const s=sessionFixture();s.config.questionnaireVersion=COMMON_QUESTIONNAIRE_VERSION;
    const questions=structuredClone(commonQuestions['ming-xingle-archery']);
    s.config.paintings[0]={...s.config.paintings[0],...questions};
    s.background=freezeBackground({studyField:'材料, "工程"\n跨领域',artEducation:'short',paintingInterest:4});
    s.background.questions[1].options![1].label='这次实际展示的学习经历文字';
    s.config.paintings[0].pre[4].options!.find(option=>option.id==='other')!.label='这次实际展示的其他文字';
    s.responses=([...questions.pre,...questions.post]).map((q,i)=>({sessionId:s.sessionId,participantId:s.participantId,paintingId:'A',phase:i<5?'pre':'post',questionId:q.id,answer:i===4?'其他：原始补充，含引号 "例"':'原话',confidence:null,unknown:false,skipped:false,durationMs:100,timeMs:i*100,...(i===4?{selectedOptions:['context','other'],otherText:'原始补充，含引号 "例"'}:{})}));
    const before=structuredClone(s),files=buildTextExportFiles(s);
    expect(Object.keys(files)).toEqual(['gaze_samples.csv','phase_events.csv','responses.csv','validation.csv','session.json','background.csv']);
    const rows=parseCSV(strFromU8(files['responses.csv']).replace(/^\ufeff/,'')),header=rows[0];
    expect(header.slice(17)).toEqual(['questionIndex','analysisRole','selectedOptionIds','selectedOptionLabels','otherText']);
    expect(rows.slice(1).map(row=>row[header.indexOf('analysisRole')])).toEqual(['spontaneous','spontaneous','spontaneous','prompted','classification','card-feedback','card-feedback']);
    expect(rows.slice(1).map(row=>row[header.indexOf('questionIndex')])).toEqual(['1','2','3','4','5','1','2']);
    expect(rows[1][header.indexOf('questionVersion')]).toBe(COMMON_QUESTIONNAIRE_VERSION);
    expect(rows[1][header.indexOf('questionVariant')]).toBe('common');
    expect(rows[5][header.indexOf('selectedOptionIds')]).toBe('["context","other"]');
    expect(JSON.parse(rows[5][header.indexOf('selectedOptionLabels')])).toEqual(['缺少相关背景知识','这次实际展示的其他文字']);
    expect(rows[5][header.indexOf('otherText')]).toBe(s.responses[4].otherText);
    const background=parseCSV(strFromU8(files['background.csv']).replace(/^\ufeff/,''));
    expect(background[0]).toEqual(['sessionId','participantId','backgroundVersion','questionId','questionPrompt','answer','answerCode']);
    expect(background[1].slice(3)).toEqual(['studyField','你的主要学习或工作领域是什么？',s.background.answers.studyField,s.background.answers.studyField]);
    expect(background[2].slice(5)).toEqual(['这次实际展示的学习经历文字','short']);
    expect(background[3].slice(5)).toEqual(['4','4']);
    const snapshot=JSON.parse(strFromU8(files['session.json']));
    expect(snapshot.background).toEqual(before.background);expect(snapshot.responses).toEqual(before.responses);expect(s).toEqual(before);
    expect(snapshot.exportMetadata.questionnaireAnalysis.interpretation).toContain('不能计为自发发现');
  });
});

describe('measured sample density',()=>{
  it('selects only finite, unpaused, inside-image free_view observations from this session',()=>{
    const s=sessionFixture();s.samples=[sampleFixture(),sampleFixture({phase:'pre'}),sampleFixture({paused:true}),sampleFixture({sessionId:'another'}),sampleFixture({paintingId:'B'}),sampleFixture({insideImage:false,imageNormX:1.1}),sampleFixture({viewportX:NaN}),sampleFixture({imageX:NaN}),sampleFixture({imageNormY:null}),sampleFixture({predictionAvailable:false}),sampleFixture({participantId:'N02'})];
    expect(eligibleSamples(s,'A')).toEqual([s.samples[0]]);
  });
  it('never creates hotspots without samples or clips external observations to the border',()=>{
    expect(buildDensity([],20,20,3).max).toBe(0);
    expect(buildDensity([sampleFixture({imageNormX:-1})],20,20,3).max).toBe(0);
  });
  it('uses one weight per sample and a deterministic Gaussian; multiplicity doubles density',()=>{
    const point=sampleFixture({imageNormX:0.5,imageNormY:0.5});
    const one=buildDensity([point],21,21,2),two=buildDensity([point,point],21,21,2);
    expect(one.values[10*21+10]).toBe(1);expect(one.values[10*21+12]).toBeCloseTo(Math.exp(-0.5),6);
    expect(two.max).toBe(2);expect(two.values[10*21+12]).toBeCloseTo(2*one.values[10*21+12],6);
    expect(buildDensity([point],21,21,2).values).toEqual(one.values);
  });
  it('preserves painting aspect ratio and reports observed callbacks per active second',()=>{
    const s=sessionFixture();expect(heatmapSize(paintingFixture,s.heatmap)).toEqual({width:320,height:213});
    expect(actualSampleRate(s,'A')).toBeNull();
    s.timings=[{trialId:'A-1',paintingId:'A',startedMs:0,endedMs:10000,wallMs:10000,activeMs:2000,status:'completed'}];
    s.samples=[sampleFixture(),sampleFixture({predictionAvailable:false}),sampleFixture({paused:true})];
    expect(actualSampleRate(s,'A')).toBe(1);
  });
});
