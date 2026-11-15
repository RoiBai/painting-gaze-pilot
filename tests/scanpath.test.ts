import {describe,expect,it} from 'vitest';
import {buildScanpath,defaultScanpath,scanpathColor,scanpathExtent} from '../src/scanpath';
import {sampleFixture,sessionFixture} from './dataFixtures';
import type {GazeSample} from '../src/types';
const make=(times:number[],changes:Record<number,Partial<GazeSample>>={})=>{const session=sessionFixture();session.samples=times.map((t,i)=>sampleFixture({sampleIndex:i,callbackTimeMs:t,imageNormX:.1+i*.02,imageNormY:.4,...changes[i]}));return session;};
const indices=(session:ReturnType<typeof make>,params=defaultScanpath)=>buildScanpath(session,'A',params).segments.map(segment=>segment.map(point=>point.sampleIndex));

describe('estimated scanpath from actual callback sequence',()=>{
 it('selects actual observations at the display interval while retaining segment endpoints',()=>{
  const session=make([0,50,100,150,200,250,300,350,400,450]);const before=JSON.stringify(session);
  const model=buildScanpath(session,'A');expect(indices(session)).toEqual([[0,4,8,9]]);expect(model.sourceCount).toBe(10);expect(model.displayedCount).toBe(4);expect(model.segmentCount).toBe(1);
  expect(model.segments.flat().map(point=>point.imageNormX)).toEqual([.1,.18,.26,.28]);expect(JSON.stringify(session)).toBe(before);
 });
 it('breaks on null, outside, paused, nonfinite, non-viewing and foreign observations before thinning',()=>{
  const cases:Partial<GazeSample>[]=[{predictionAvailable:false,viewportX:null,viewportY:null,imageX:null,imageY:null,imageNormX:null,imageNormY:null},{insideImage:false,imageNormX:1.2},{paused:true},{viewportX:NaN},{imageNormY:Infinity},{phase:'pre'},{sessionId:'foreign'},{participantId:'N02'},{paintingId:'B'}];
  for(const change of cases){const session=make([0,50,100,150],{1:change});expect(indices(session)).toEqual([[0],[2,3]]);expect(buildScanpath(session,'A').sourceCount).toBe(3);}
 });
 it('breaks across trial, geometry, calibration and sample-index changes',()=>{
  const changes:Partial<GazeSample>[]=[{trialId:'A-2'},{geometryVersion:2},{calibrationVersion:2},{sampleIndex:20},{trialId:null},{geometryVersion:null}];
  for(const change of changes)expect(indices(make([0,50,100],{1:change}))).toEqual([[0],[change.sampleIndex??1],[2]]);
 });
 it('breaks long or nonincreasing timestamps without inventing a connector',()=>{
  expect(indices(make([0,50,301,350]))).toEqual([[0,1],[2,3]]);
  expect(indices(make([0,50,50,100]))).toEqual([[0,1],[2,3]]);
  expect(indices(make([100,50,150]))).toEqual([[0],[1,2]]);
  expect(indices(make([0,250]))).toEqual([[0,1]]);
 });
 it('breaks an explicit pause even when no callback arrived during the pause',()=>{
  const session=make([0,50,100,150]);session.events=[{sessionId:session.sessionId,participantId:session.participantId,timeMs:75,type:'pause',phase:'free_view',paintingId:'A',detail:'{}'}];
  expect(indices(session)).toEqual([[0,1],[2,3]]);
 });
 it('keeps ordinal numbers stable when scrubbing and counts source observations in the time window',()=>{
  const session=make([0,50,100,150,200,250,300,350,400,450]);
  const model=buildScanpath(session,'A',defaultScanpath,{fromMs:175,toMs:425});
  expect(model.sourceCount).toBe(5);expect(model.displayedCount).toBe(2);expect(model.segments[0].map(point=>[point.sampleIndex,point.order])).toEqual([[4,2],[8,3]]);
  expect(buildScanpath(session,'A',defaultScanpath,{fromMs:75,toMs:125})).toMatchObject({sourceCount:1,displayedCount:0});
 });
 it('uses wall-clock extent including pauses and repeat attempts, with a sample-time fallback',()=>{
  const session=make([150,250,1750]);session.timings=[{trialId:'A-1',paintingId:'A',startedMs:100,endedMs:500,wallMs:400,activeMs:300,status:'interrupted'},{trialId:'A-2',paintingId:'A',startedMs:1500,endedMs:2000,wallMs:500,activeMs:500,status:'completed'}];
  expect(scanpathExtent(session,'A')).toEqual({originMs:100,durationMs:1900});expect(scanpathExtent(session,'B')).toEqual({originMs:0,durationMs:0});expect(scanpathExtent(make([100,200]),'A')).toEqual({originMs:100,durationMs:100});
 });
 it('never creates a trace for empty data and supports full raw-point display',()=>{
  expect(buildScanpath(sessionFixture(),'A')).toMatchObject({segments:[],sourceCount:0,displayedCount:0,durationMs:0});
  const session=make([0,20,40]);expect(indices(session,{...defaultScanpath,displayIntervalMs:0,numberEvery:0})).toEqual([[0,1,2]]);
 });
 it('colors by global time and rejects invalid rendering settings instead of changing observations',()=>{
  expect(scanpathColor(0,1000)).toEqual([35,100,210]);expect(scanpathColor(1000,1000)).toEqual([232,120,36]);
  expect(()=>buildScanpath(make([0]),'A',{...defaultScanpath,displayIntervalMs:NaN})).toThrow('displayIntervalMs');
  expect(()=>buildScanpath(make([0]),'A',defaultScanpath,{fromMs:NaN,toMs:100})).toThrow('时间范围');
 });
});
