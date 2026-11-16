import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
vi.mock('../src/storage',()=>({saveSession:vi.fn().mockResolvedValue(undefined)}));
import {StudyEngine, type Adapter, type InputSample} from '../src/engine';
import {defaultConfig} from '../src/study';
import {containGeometry} from '../src/geometry';
import {FOUR_PERSON_PLAN, PARTICIPANT_PLAN_VERSION} from '../src/assignment';
import {commonQuestions, COMMON_QUESTIONNAIRE_VERSION} from '../src/commonQuestionnaire';
import {BACKGROUND_QUESTIONS,BACKGROUND_VERSION} from '../src/background';
import type {BackgroundAnswers} from '../src/types';
let now=0;let engine:StudyEngine;let sample:(s:InputSample)=>void;let adapter:Adapter;
beforeEach(()=>{now=0;vi.useFakeTimers();vi.spyOn(document,'hasFocus').mockReturnValue(true);adapter={start:vi.fn().mockResolvedValue(undefined),stop:vi.fn(),resetCalibration:vi.fn().mockResolvedValue(undefined),train:vi.fn(),setPhase:vi.fn(),showPreview:vi.fn()};engine=new StudyEngine((cb,status)=>{sample=cb;return adapter},()=>now)});
afterEach(()=>{engine.dispose();vi.useRealTimers();vi.restoreAllMocks()});
function begin(){const c=structuredClone(defaultConfig);delete c.questionnaireVersion;c.durationSeconds=1;c.validation.targetDurationMs=600;c.validation.settleMs=50;c.calibrationClicks=1;engine.begin(c,'N01','很少接触');engine.flowOnly()}
async function calibrated(){await engine.calibrate();for(let i=0;i<9;i++)engine.calibrationClick();for(let i=0;i<5;i++){now+=600;engine.tick()}expect(engine.phase).toBe('quality');engine.acceptQuality(true);drift()}
function drift(){for(let i=0;i<3;i++){now+=600;engine.tick()}expect(engine.phase).toBe('drift_result');engine.acceptQuality(true);expect(engine.phase).toBe('loading_image')}
function image(){const p=engine.painting!;engine.imageReady(containGeometry({version:engine.session!.geometries.length+1,paintingId:p.paintingId,timeMs:now,viewportWidth:1000,viewportHeight:800,dpr:2,naturalWidth:p.width,naturalHeight:p.height,box:{left:0,top:0,width:1000,height:800}}))}
it('completes both paintings and fixed cards without injecting samples in flow-only mode',async()=>{begin();await calibrated();for(let i=0;i<2;i++){image();now+=1100;engine.tick();expect(engine.phase).toBe('familiarity');engine.next();expect(engine.phase).toBe('pre');engine.next();expect(engine.phase).toBe('cards');engine.next();expect(engine.phase).toBe('cards');engine.next();expect(engine.phase).toBe('post');engine.next();if(i===0)drift()}expect(engine.phase).toBe('interview');engine.next();expect(engine.session!.status).toBe('completed');expect(engine.session!.samples).toEqual([]);expect(adapter.stop).toHaveBeenCalled();expect(engine.session!.timings).toHaveLength(2)});
it('preserves null callbacks, pauses sustained null, hides gap from active duration, and requires recalibration on resize',async()=>{begin();await calibrated();image();engine.session!.quality='accepted';sample({x:null,y:null,callbackTimeMs:now,libraryElapsedMs:12});expect(engine.session!.samples.at(-1)?.predictionAvailable).toBe(false);engine.session!.config.durationSeconds=120;now+=engine.session!.config.nullPauseMs+1;engine.tick();expect(engine.paused).toBe(true);const elapsed=engine.currentTiming!.activeMs;now+=5000;engine.tick();expect(engine.currentTiming!.activeMs).toBe(elapsed);engine.environmentChange('resize');expect(engine.requireCalibration).toBe(true);engine.resume();expect(engine.paused).toBe(true)});
it('retains interrupted attempts with unique trial IDs after recalibration',async()=>{begin();await calibrated();image();sample({x:100,y:200,callbackTimeMs:now,libraryElapsedMs:1});const id=engine.currentTiming!.trialId;await calibrated();image();expect(engine.session!.timings[0].status).toBe('interrupted');expect(engine.currentTiming!.trialId).not.toBe(id);expect(engine.session!.samples[0].trialId).toBe(id)});
it('aborts unfinished session and second participant begins with new calibration and samples',async()=>{begin();await calibrated();image();engine.interrupt('test');expect(engine.session!.status).toBe('interrupted');expect(engine.currentTiming!.status).toBe('interrupted');engine.begin(defaultConfig,'N02','偶尔欣赏');expect(engine.session!.calibrationVersion).toBe(0);expect(engine.session!.samples).toEqual([]);expect(engine.session!.order).toEqual(defaultConfig.paintings.map(p=>p.paintingId).reverse())});
it('foreground pause retains observations and explicit resume excludes hidden time',async()=>{begin();await calibrated();image();engine.session!.config.durationSeconds=120;now+=400;engine.tick();engine.environmentChange('tab_hidden');const active=engine.currentTiming!.activeMs;sample({x:100,y:100,callbackTimeMs:now,libraryElapsedMs:4});expect(engine.session!.samples.at(-1)?.paused).toBe(true);now+=10000;engine.tick();engine.resume();now+=300;engine.tick();expect(engine.currentTiming!.activeMs).toBe(active+300);expect(engine.session!.events.some(e=>e.type==='pause')).toBe(true);expect(engine.session!.events.some(e=>e.type==='resume')).toBe(true)});
it('resize during answers forces new calibration before the next scene',async()=>{begin();await calibrated();image();now+=1100;engine.tick();engine.next();engine.next();engine.next();engine.next();expect(engine.phase).toBe('post');engine.environmentChange('resize');expect(engine.requireCalibration).toBe(true);engine.next();await Promise.resolve();await Promise.resolve();expect(engine.phase).toBe('calibration');expect(engine.session!.calibrationVersion).toBe(2)});
function qualityRecord(status:'pass'|'fail'|'judgment'){
 engine.begin(defaultConfig,'N01','偶尔欣赏');engine.phase='quality';engine.session!.phase='quality';
 if(status==='judgment'){engine.session!.config.validation.maxMedianErrorPx=null;engine.session!.config.validation.maxErrorDiagonalRatio=null;engine.session!.config.validation.maxTargetMedianErrorPx=null;}
 engine.session!.validationSummaries.push({runId:'test-quality',kind:'validation',calibrationVersion:1,targets:[{targetId:'0',n:10,medianErrorPx:20}],medianErrorPx:20,errorDiagonalRatio:.02,status});
}
it('uses 60 seconds for new sessions and freezes the input configuration',()=>{const config=structuredClone(defaultConfig);engine.begin(config,'N01','偶尔欣赏');expect(engine.session!.config.durationSeconds).toBe(60);config.durationSeconds=120;expect(engine.session!.config.durationSeconds).toBe(60)});
it.each(FOUR_PERSON_PLAN)('begins $participantId with its frozen common assignment and actual questions',row=>{
 const config=structuredClone(defaultConfig);config.participantPlan=PARTICIPANT_PLAN_VERSION;
 engine.begin(config,row.participantId,'偶尔欣赏');
 const session=engine.session!;
 expect(session.assignment).toMatchObject({...row,planVersion:PARTICIPANT_PLAN_VERSION,questionVersion:COMMON_QUESTIONNAIRE_VERSION});
 expect(session.assignment!.paintingOrder).toEqual(session.order);
 expect(engine.painting!.paintingId).toBe(row.order==='AB'?'ming-xingle-archery':'ming-xingle-cuju');
 for(const painting of session.config.paintings){expect(painting.pre).toEqual(commonQuestions[painting.paintingId].pre);expect(painting.post).toEqual(commonQuestions[painting.paintingId].post)}
 const recorded=session.events.find(e=>e.type==='participant_assignment_resolved')!;
 expect(JSON.parse(recorded.detail)).toEqual(session.assignment);
 const frozenPrompt=session.config.paintings[0].pre[0].prompt;
 config.paintings[0].pre[0].prompt='稍后更改';config.order='BA';
 expect(session.config.paintings[0].pre[0].prompt).toBe(frozenPrompt);
 expect(session.config.order).toBe(row.order);
});
it('continues adequate unassessed validation without making it low quality or passed',()=>{qualityRecord('judgment');engine.acceptQuality(false);expect(engine.session!.quality).toBe('pending');expect(engine.phase).toBe('drift');const decision=engine.session!.events.find(e=>e.type==='researcher_quality_decision')!;expect(JSON.parse(decision.detail).decision).toBe('unassessed');expect(engine.session!.qualityNotes.join()).toContain('未判定');});
it('does not turn missing thresholds into low quality through the legacy boolean argument',()=>{qualityRecord('judgment');engine.acceptQuality(true);expect(engine.session!.quality).toBe('pending')});
it('still requires an explicit low-quality choice after actual validation failure',()=>{qualityRecord('fail');engine.session!.validationSummaries[0].targets[0].n=0;expect(()=>engine.acceptQuality(false)).toThrow('验证未通过');expect(engine.phase).toBe('quality');engine.acceptQuality(true);expect(engine.session!.quality).toBe('low_quality');expect(engine.session!.qualityNotes.join()).toContain('只有 0 个')});
it('preserves an existing quality problem when a later run is unassessed',()=>{qualityRecord('judgment');engine.session!.quality='low_quality';engine.session!.qualityNotes.push('已有中断展示');engine.acceptQuality(false);expect(engine.session!.quality).toBe('low_quality')});
it('accepts an actual passing validation and refuses decisions outside the result phase',()=>{qualityRecord('pass');engine.acceptQuality(false);expect(engine.session!.quality).toBe('accepted');expect(()=>engine.acceptQuality(false)).toThrow('当前阶段不能确认')});

it('uses the exact common two-scene path, finishing after the second set of feedback',async()=>{
 const config=structuredClone(defaultConfig);config.durationSeconds=1;config.validation.targetDurationMs=600;config.validation.settleMs=50;config.calibrationClicks=1;
 engine.begin(config,'N06',{studyField:'语言学',artEducation:'short',paintingInterest:4});engine.flowOnly();await calibrated();
 const phases:string[]=[];
 for(let i=0;i<2;i++){
  image();now+=1100;engine.tick();expect(engine.phase).toBe('pre');phases.push(engine.phase);
  expect(engine.painting!.pre).toHaveLength(5);
  engine.next();expect(engine.phase).toBe('cards');engine.next();engine.next();expect(engine.phase).toBe('post');phases.push(engine.phase);
  expect(engine.painting!.post).toHaveLength(2);engine.next();if(i===0)drift();
 }
 expect(engine.phase).toBe('completed');expect(engine.session!.status).toBe('completed');
 expect(engine.session!.timings.map(t=>t.paintingId)).toEqual(['ming-xingle-cuju','ming-xingle-archery']);
 expect(engine.session!.events.filter(e=>e.type==='phase_start').some(e=>e.phase==='familiarity'||e.phase==='interview')).toBe(false);
 expect(engine.session!.samples).toEqual([]);expect(adapter.stop).toHaveBeenCalled();
});

it('freezes three background answers and their wording without reusing the old familiarity field',()=>{
 const answers:BackgroundAnswers={studyField:'设计与教育',artEducation:'long',paintingInterest:5};
 engine.begin(defaultConfig,'N03',answers);
 expect(engine.session!.background).toEqual({version:BACKGROUND_VERSION,answers,questions:BACKGROUND_QUESTIONS});
 expect(engine.session!.background!.questions).not.toBe(BACKGROUND_QUESTIONS);
 expect(engine.session!.artBackground).toBe('');
 answers.studyField='后来改动';answers.paintingInterest=1;
 expect(engine.session!.background!.answers).toEqual({studyField:'设计与教育',artEducation:'long',paintingInterest:5});
});

it.each([
 {studyField:'',artEducation:'none',paintingInterest:3},
 {studyField:'  ',artEducation:'none',paintingInterest:3},
 {studyField:'历史',artEducation:'other',paintingInterest:3},
 {studyField:'历史',artEducation:'none',paintingInterest:0},
 {studyField:'历史',artEducation:'none',paintingInterest:6},
 {studyField:'历史',artEducation:'none',paintingInterest:2.5},
])('rejects incomplete or invalid background rather than storing defaults: %j',answers=>{
 expect(()=>engine.begin(defaultConfig,'N03',answers as BackgroundAnswers)).toThrow('完整填写');
 expect(engine.session).toBeNull();
});

it('saves independent copies of multi-select IDs and other wording',()=>{
 engine.begin(defaultConfig,'N03','很少接触');engine.phase='pre';engine.session!.phase='pre';
 const selectedOptions=['activity','other'];
 engine.response({questionId:engine.painting!.pre[4].id,answer:'看不懂人物在做什么；其他：太远',confidence:null,unknown:false,skipped:false,selectedOptions,otherText:'太远'},100);
 selectedOptions.push('none');
 expect(engine.session!.responses[0].selectedOptions).toEqual(['activity','other']);
 expect(engine.session!.responses[0].otherText).toBe('太远');
 expect(engine.session!.responses[0].phase).toBe('pre');
});
