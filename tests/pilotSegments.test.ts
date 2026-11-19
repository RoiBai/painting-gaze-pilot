import {describe,expect,it} from 'vitest';
import {reviewWindows,segmentTrace} from '../src/pilotSegments';
import {segmentFixture} from './pilotSegmentFixture';

describe('viewport review of actual card and blank exposures',()=>{
  it('uses observed times, including resumed second card and interruption inside a blank',()=>{
    const s=segmentFixture(),trial=s.timings[0];
    const windows=reviewWindows(s,trial);
    expect(windows.map(w=>[w.start,w.end,w.exposure?.slot??null])).toEqual([
      [100,1100,null],[1100,1800,1],[1800,2400,null],[2400,3100,2],[3700,4200,2],[4200,5000,null]
    ]);
    const second=segmentTrace(s,trial,windows[3]),blank=segmentTrace(s,trial,windows[2]);
    expect(second.toPainting).toBe(1);expect(second.toCard).toBe(1);
    expect(second.points.map(p=>p.region)).toEqual(['card','other','painting','card','missing','painting','card','offscreen','painting']);
    expect(second.points.map(p=>p.connects)).toEqual([false,true,true,true,false,false,false,false,false]);
    expect(blank.points.map(p=>p.sample.callbackTimeMs)).toEqual([2100]);
    s.events.push({...s.events[0],timeMs:4400,type:'pause'});
    expect(reviewWindows(s,trial).at(-1)?.end).toBe(4400);
  });
  it('never joins a missing sample, repeated trial, or calibration change into a transition',()=>{
    const s=segmentFixture(),trial=s.timings[0];
    const period=reviewWindows(s,trial).find(w=>w.exposure?.exposureId==='second-a')!;
    s.samples.find(p=>p.callbackTimeMs===2420)!.trialId='previous-attempt';
    s.samples.find(p=>p.callbackTimeMs===2470)!.calibrationVersion++;
    const trace=segmentTrace(s,trial,period);
    expect(trace.toPainting).toBe(0);expect(trace.toCard).toBe(0);
    expect(trace.points.some(p=>p.sample.trialId==='previous-attempt')).toBe(false);
  });
});
