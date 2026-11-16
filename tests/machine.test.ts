import { describe, expect, it } from 'vitest';
import { canTransition, orderForParticipant } from '../src/machine';
import { defaultConfig } from '../src/study';
import type { Phase } from '../src/types';
describe('study phase guards', () => {
  it('supports the full two-painting path and never results between them', () => {
    const trial: Phase[] = ['drift', 'drift_result', 'loading_image', 'free_view', 'familiarity', 'pre', 'cards', 'post'];
    const path: Phase[] = ['consent', 'camera', 'calibration', 'validation', 'quality', ...trial, ...trial, 'interview', 'completed'];
    for (let i = 1; i < path.length; i++) expect(canTransition(path[i - 1], path[i]), `${path[i - 1]} to ${path[i]}`).toBe(true);
    expect(canTransition('free_view', 'completed')).toBe(false);
  });
  it('supports the common questionnaire path without extra familiarity or interview questions',()=>{
    const trial:Phase[]=['drift','drift_result','loading_image','free_view','pre','cards','post'];
    const path:Phase[]=['consent','camera','calibration','validation','quality',...trial,...trial,'completed'];
    for(let i=1;i<path.length;i++)expect(canTransition(path[i-1],path[i])).toBe(true);
  });
  it('allows recalibration and makes interruption terminal', () => {
    expect(canTransition('loading_image', 'calibration')).toBe(true); expect(canTransition('post', 'calibration')).toBe(true);
    expect(canTransition('quality', 'calibration')).toBe(true); expect(canTransition('drift_result', 'calibration')).toBe(true); expect(canTransition('free_view', 'calibration')).toBe(true);
    expect(canTransition('free_view', 'interrupted')).toBe(true); expect(canTransition('interrupted', 'free_view')).toBe(false); expect(canTransition('completed', 'interrupted')).toBe(false);
  });
  it('alternates N01–N06 by anonymous ID with explicit order override', () => {
    const ids = defaultConfig.paintings.map(p => p.paintingId);
    expect(orderForParticipant('N01', defaultConfig)).toEqual(ids); expect(orderForParticipant('N02', defaultConfig)).toEqual([...ids].reverse());
    expect(orderForParticipant('N02', { ...defaultConfig, order: 'AB' })).toEqual(ids);
    expect(orderForParticipant('N01', { ...defaultConfig, order: 'BA' })).toEqual([...ids].reverse());
    expect(() => orderForParticipant('R01', defaultConfig)).toThrow(); expect(() => orderForParticipant('N07', defaultConfig)).toThrow();
  });
});
