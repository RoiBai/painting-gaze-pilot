import {describe,it,expect} from 'vitest';
import {zipSync,strToU8} from 'fflate';
import {readSessionArchive} from '../src/importSession';
import {sessionFixture} from './dataFixtures';
import {defaultConfig} from '../src/study';
import {resolveParticipantConfig,PARTICIPANT_PLAN_VERSION} from '../src/assignment';
import {freezeBackground} from '../src/background';
import {questionVariants} from '../src/questionVariants';
const encoded=(text:string)=>new Uint8Array(strToU8(text));
const input=()=>{const s=sessionFixture();s.config=structuredClone(defaultConfig);s.order=s.config.paintings.map(p=>p.paintingId);return s;};
describe('local original-session import',()=>{
 it('reads the original session from a ZIP containing corrected data without changing it',()=>{
  const s=input(),text=JSON.stringify(s);
  const zip=zipSync({'record/session.json':encoded(text),'record/correction.json':encoded('{}'),'record/heatmap_A_corrected.png':new Uint8Array([1,2,3])});
  expect(readSessionArchive(zip,'record.zip')).toEqual(s);
  expect(readSessionArchive(encoded(text),'session.json')).toEqual(s);
 });
 it('does not assign a new question set or order to an older N03 session',()=>{
  const s=input();s.participantId='N03';delete s.config.participantPlan;delete s.config.questionnaireVersion;
  for(const p of s.config.paintings){p.pre=structuredClone(questionVariants.alpha[p.paintingId].pre);p.post=structuredClone(questionVariants.alpha[p.paintingId].post)}
  s.config.order='BA';s.order=s.config.paintings.map(p=>p.paintingId).reverse();
  s.config.paintings[0].pre[0].prompt='旧会话保留的问题措辞';
  const loaded=readSessionArchive(encoded(JSON.stringify(s)),'session.json');
  expect(loaded).toEqual(s);
  expect(loaded.assignment).toBeUndefined();
  expect(loaded.config.participantPlan).toBeUndefined();
 });
 it('preserves saved common assignment and final questions on archive import',()=>{
  const s=input();s.participantId='N06';s.config.participantPlan=PARTICIPANT_PLAN_VERSION;
  const resolved=resolveParticipantConfig(s.config,s.participantId);
  s.config=resolved.config;s.assignment=resolved.assignment;s.order=[...resolved.assignment!.paintingOrder];
  // Import reads the saved prompts, even if a later question-bank version changes.
  s.config.paintings[0].pre[0].prompt='这次会话实际展示并保存的问题';
  const bytes=encoded(JSON.stringify(s));
  expect(readSessionArchive(zipSync({'session.json':bytes}),'session.zip')).toEqual(s);
 });
 it('keeps legacy alpha and beta assignments with their historical questions',()=>{
  for(const variant of ['alpha','beta'] as const){
   const s=input();s.participantId='N06';s.config.participantPlan='crossed-four-v1';delete s.config.questionnaireVersion;
   for(const p of s.config.paintings){p.pre=structuredClone(questionVariants[variant][p.paintingId].pre);p.post=structuredClone(questionVariants[variant][p.paintingId].post)}
   s.order.reverse();s.assignment={planVersion:'crossed-four-v1',participantId:'N06',order:'BA',questionVariant:variant,questionVersion:'parallel-questions-v1',paintingOrder:[...s.order]};
   expect(readSessionArchive(encoded(JSON.stringify(s)),'old.json')).toEqual(s);
  }
 });
 it('imports the frozen background and multi-select answers without rewording or assigning current labels',()=>{
  const s=input();s.background=freezeBackground({studyField:'跨学科\n学习',artEducation:'long',paintingInterest:5});
  const question=s.config.paintings[0].pre[4];question.options!.find(option=>option.id==='other')!.label='保存的其他标签';
  s.responses=[{sessionId:s.sessionId,participantId:s.participantId,paintingId:s.order[0],phase:'pre',questionId:question.id,answer:'原话\n其他说明',confidence:null,unknown:false,skipped:false,durationMs:150,timeMs:250,selectedOptions:['other','objects'],otherText:'器物外观不清楚'}];
  expect(readSessionArchive(encoded(JSON.stringify(s)),'common.json')).toEqual(s);
 });
 it('rejects malformed background answers or missing frozen background prompts',()=>{
  const s=input();s.background=freezeBackground({studyField:'学习领域',artEducation:'none',paintingInterest:1});
  const cases=[{...s.background,version:'unknown'},{...s.background,answers:{...s.background.answers,paintingInterest:6}},{...s.background,answers:{...s.background.answers,studyField:''}},{...s.background,answers:{...s.background.answers,artEducation:'unknown'}},{...s.background,questions:s.background.questions.slice(0,2)},{...s.background,questions:[null,...s.background.questions.slice(1)]}];
  for(const background of cases)expect(()=>readSessionArchive(encoded(JSON.stringify({...s,background})),'bad.json')).toThrow('背景问卷');
 });
 it('rejects invalid, duplicate or contradictory multi-select choices and detached other text',()=>{
  const s=input(),q=s.config.paintings[0].pre[4];
  const row={sessionId:s.sessionId,participantId:s.participantId,paintingId:s.order[0],phase:'pre',questionId:q.id,answer:'原话',confidence:null,unknown:false,skipped:false,durationMs:10,timeMs:20};
  const cases=[{selectedOptions:['none','objects']},{selectedOptions:['missing']},{selectedOptions:['objects','objects']},{selectedOptions:'none'},{selectedOptions:['objects'],otherText:'没有选择其他'},{otherText:'缺少多选项'},{selectedOptions:['other'],otherText:99},{selectedOptions:['none'],questionId:s.config.paintings[0].pre[0].id}];
  for(const extra of cases)expect(()=>readSessionArchive(encoded(JSON.stringify({...s,responses:[{...row,...extra}]})),'bad.json')).toThrow();
 });
 it('rejects multiple sessions and rejects derived coordinates passed as original',()=>{
  const s=input(),bytes=encoded(JSON.stringify(s));
  expect(()=>readSessionArchive(zipSync({'a/session.json':bytes,'b/session.json':bytes}),'bad.zip')).toThrow('一份');
  expect(()=>readSessionArchive(encoded(JSON.stringify({...s,coordinateSource:'reference-corrected'})),'bad.json')).toThrow('原始会话');
 });
 it('rejects remote material paths and malformed study records before opening the UI',()=>{
  const s=input();s.config.paintings[0].image='/\\evil.example/a.png';
  expect(()=>readSessionArchive(encoded(JSON.stringify(s)),'bad.json')).toThrow();
  const broken=input();broken.validationSummaries=[{runId:'x',targets:null} as any];
  expect(()=>readSessionArchive(encoded(JSON.stringify(broken)),'bad.json')).toThrow('摘要');
 });
});
