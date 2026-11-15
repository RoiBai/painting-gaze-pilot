import { describe, expect, it } from 'vitest';
import { summarizeValidation } from '../src/validation';
import type { ValidationRow, StudyConfig } from '../src/types';
const threshold: StudyConfig['validation'] = { maxMedianErrorPx: 10, maxErrorDiagonalRatio: null, minSamplesPerTarget: 2, targetDurationMs: 2500, settleMs: 700 };
const row = (targetId: string, x: number | null, overrides: Partial<ValidationRow> = {}): ValidationRow => ({ sessionId: 's', participantId: 'N01', paintingId: 'a', kind: 'validation', runId: 'r', calibrationVersion: 1, targetId, targetX: 0, targetY: 0, viewportWidth: 800, viewportHeight: 600, timeMs: 1000, predictionX: x, predictionY: x === null ? null : 0, errorPx: 0, settling: false, training: false, ...overrides });
const summary = (rows: ValidationRow[], options = threshold) => summarizeValidation(rows, options, ['left', 'right'], 'r', 'validation', 1);
describe('independent validation', () => {
  it('recalculates medians from coordinates and reports per-target counts', () => {
    const s = summary([row('left', 4), row('left', 6), row('right', 8), row('right', 10)]);
    expect(s.targets).toEqual([{ targetId: 'left', n: 2, medianErrorPx: 5 }, { targetId: 'right', n: 2, medianErrorPx: 9 }]);
    expect(s.medianErrorPx).toBe(7); expect(s.errorDiagonalRatio).toBe(0.007); expect(s.status).toBe('pass');
  });
  it('does not use training, settling, other runs or old calibrations', () => {
    const s = summary([row('left', 5), row('left', 6, { training: true }), row('right', 6, { settling: true }), row('right', 1, { runId: 'old' }), row('right', 1, { calibrationVersion: 0 })]);
    expect(s.targets.map(t => t.n)).toEqual([1, 0]); expect(s.status).toBe('fail');
  });
  it('does not call nonempty prediction rate accuracy or accept absent target data', () => {
    const s = summary([row('left', null), row('right', null)]);
    expect(s.medianErrorPx).toBeNull(); expect(s.targets.every(t => t.n === 0)).toBe(true); expect(s.status).toBe('fail');
  });
  it('requires judgment when no quality thresholds are frozen', () => {
    expect(summary([row('left', 5), row('left', 5), row('right', 5), row('right', 5)], { ...threshold, maxMedianErrorPx: null }).status).toBe('judgment');
    expect(summary([], { ...threshold, maxMedianErrorPx: null }).status).toBe('fail');
  });
  it('fails CSS pixel or viewport-relative threshold violations', () => {
    const rows = [row('left', 50), row('left', 50), row('right', 50), row('right', 50)];
    expect(summary(rows).status).toBe('fail');
    expect(summary(rows, { ...threshold, maxMedianErrorPx: null, maxErrorDiagonalRatio: 0.02 }).status).toBe('fail');
  });
});

describe('pilot screening policy',()=>{
 const pilot={...threshold,maxMedianErrorPx:250,maxErrorDiagonalRatio:.10,maxTargetMedianErrorPx:200,minSamplesPerTarget:10};
 const repeated=(left:number,right:number,n=10)=>[...Array.from({length:n},()=>row('left',left)),...Array.from({length:n},()=>row('right',right))];
 it('accepts only when counts, pooled error and target error all meet the frozen rule',()=>{
  expect(summary(repeated(90,100),pilot).status).toBe('pass');
  expect(summary(repeated(90,100,9),pilot).status).toBe('fail');
  expect(summary(repeated(110,110),pilot).status).toBe('fail'); // 11% of 1000px diagonal
 });
 it('does not hide a bad target behind many good samples',()=>{
  const rows=[...Array.from({length:100},()=>row('left',20)),...Array.from({length:10},()=>row('right',220))];
  const result=summary(rows,pilot);expect(result.medianErrorPx).toBe(20);expect(result.status).toBe('fail');
 });
 it('supports target-only thresholds and preserves old unset configurations',()=>{
  expect(summary(repeated(201,10),{...pilot,maxMedianErrorPx:null,maxErrorDiagonalRatio:null}).status).toBe('fail');
  expect(summary(repeated(20,10),{...pilot,maxMedianErrorPx:null,maxErrorDiagonalRatio:null,maxTargetMedianErrorPx:null}).status).toBe('judgment');
 });
});
