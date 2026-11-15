import {describe,expect,it} from 'vitest';
import {legacyUnassessed,validationExplanation} from '../src/quality';
import {sessionFixture} from './dataFixtures';
import type {StudyConfig,ValidationSummary} from '../src/types';
const thresholds:StudyConfig['validation']={maxMedianErrorPx:null,maxErrorDiagonalRatio:null,minSamplesPerTarget:5,targetDurationMs:2500,settleMs:700};
const summary=(changes:Partial<ValidationSummary>={}):ValidationSummary=>({runId:'run',kind:'validation',calibrationVersion:1,targets:[{targetId:'0',n:8,medianErrorPx:25},{targetId:'1',n:8,medianErrorPx:30}],medianErrorPx:27.5,errorDiagonalRatio:.025,status:'judgment',...changes});

describe('validation explanations',()=>{
  it('labels unset thresholds as unassessed without inventing a pass or failing adequate observations',()=>{
    const messages=validationExplanation(summary(),thresholds);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('尚未设置');
    expect(messages[0]).toContain('不自动判为合格');
    expect(messages[0]).toContain('不因未设标准判为低质量');
  });
  it('reports individual target deficits and unavailable errors even if no threshold is set',()=>{
    const messages=validationExplanation(summary({status:'fail',targets:[{targetId:'0',n:0,medianErrorPx:null},{targetId:'1',n:2,medianErrorPx:20}],medianErrorPx:null,errorDiagonalRatio:null}),thresholds);
    expect(messages.some(message=>message.includes('目标 1')&&message.includes('只有 0 个'))).toBe(true);
    expect(messages.some(message=>message.includes('目标 2')&&message.includes('只有 2 个'))).toBe(true);
    expect(messages.some(message=>message.includes('没有可计算的整体定位误差'))).toBe(true);
    expect(messages.some(message=>message.includes('没有可计算的视口相对误差'))).toBe(true);
    expect(messages.some(message=>message.includes('达到要求'))).toBe(false);
  });
  it('explains the exact CSS and relative threshold violations',()=>{
    const messages=validationExplanation(summary({status:'fail',medianErrorPx:200,errorDiagonalRatio:.15}),{...thresholds,maxMedianErrorPx:100,maxErrorDiagonalRatio:.10});
    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain('200.0 CSS px');expect(messages[0]).toContain('100.0 CSS px');
    expect(messages[1]).toContain('15.00%');expect(messages[1]).toContain('10.00%');
  });
  it('describes a pass only for an actual pass with a configured standard',()=>{
    const messages=validationExplanation(summary({status:'pass'}),{...thresholds,maxMedianErrorPx:100});
    expect(messages).toEqual(['各目标样本数达到要求，整体误差符合本会话已设置的判断标准。']);
  });
});

describe('legacy unassessed display compatibility',()=>{
  const oldSession=()=>{const session=sessionFixture();session.quality='low_quality';session.qualityNotes=['quality: judgment，研究者选择继续','drift_result: judgment，研究者选择继续'];session.validationSummaries=[summary(),summary({kind:'drift',runId:'drift'})];return session;};
  it('recognizes only the known old missing-threshold continuation without mutating the record',()=>{
    const session=oldSession();const before=JSON.stringify(session);expect(legacyUnassessed(session)).toBe(true);expect(JSON.stringify(session)).toBe(before);
  });
  it('preserves real failures even when a later validation passed or needs judgment',()=>{
    const session=oldSession();session.validationSummaries.unshift(summary({status:'fail',runId:'failed'}));expect(legacyUnassessed(session)).toBe(false);
  });
  it('preserves actual interruption or recalibration quality notes',()=>{
    const session=oldSession();session.qualityNotes.push('自由观看中重新校准，保留中断段并重复展示；存在重复曝光');expect(legacyUnassessed(session)).toBe(false);
    session.qualityNotes.pop();session.timings.push({trialId:'t',paintingId:'A',startedMs:0,endedMs:1000,wallMs:1000,activeMs:800,status:'interrupted'});expect(legacyUnassessed(session)).toBe(false);
  });
  it('does not reinterpret other quality states, configured thresholds, or incomplete records',()=>{
    const session=oldSession();session.quality='flow_only';expect(legacyUnassessed(session)).toBe(false);
    session.quality='low_quality';session.config.validation.maxMedianErrorPx=100;expect(legacyUnassessed(session)).toBe(false);
    session.config.validation.maxMedianErrorPx=null;session.status='interrupted';expect(legacyUnassessed(session)).toBe(false);
    session.status='completed';session.qualityNotes=[];expect(legacyUnassessed(session)).toBe(false);
  });
});

it('explains the specific bad target even when pooled median is low',()=>{
 const messages=validationExplanation(summary({status:'fail',targets:[{targetId:'0',n:20,medianErrorPx:220}],medianErrorPx:50}),{...thresholds,maxMedianErrorPx:150,maxErrorDiagonalRatio:.10,maxTargetMedianErrorPx:200});
 expect(messages.join()).toContain('目标 1 的中位误差 220.0 CSS px');expect(messages.join()).toContain('单目标上限 200.0');
});
