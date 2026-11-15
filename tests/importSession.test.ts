import {describe,it,expect} from 'vitest';
import {zipSync,strToU8} from 'fflate';
import {readSessionArchive} from '../src/importSession';
import {sessionFixture} from './dataFixtures';
import {defaultConfig} from '../src/study';
const encoded=(text:string)=>new Uint8Array(strToU8(text));
const input=()=>{const s=sessionFixture();s.config=structuredClone(defaultConfig);s.order=s.config.paintings.map(p=>p.paintingId);return s;};
describe('local original-session import',()=>{
 it('reads the original session from a ZIP containing corrected data without changing it',()=>{
  const s=input(),text=JSON.stringify(s);
  const zip=zipSync({'record/session.json':encoded(text),'record/correction.json':encoded('{}'),'record/heatmap_A_corrected.png':new Uint8Array([1,2,3])});
  expect(readSessionArchive(zip,'record.zip')).toEqual(s);
  expect(readSessionArchive(encoded(text),'session.json')).toEqual(s);
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
