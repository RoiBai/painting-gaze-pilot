import { describe, expect, it } from 'vitest';
import { defaultConfig, geometricPreviewMaterials, validateConfig } from '../src/study';
import {PARTICIPANT_PLAN_VERSION} from '../src/assignment';
describe('material and schema gates', () => {
  it('allows fully specified preview config', () => { expect(validateConfig(defaultConfig)).toEqual([]); });
  it('enables the four-person plan by default and accepts the designated scenes in either list order', () => {
    expect(defaultConfig.participantPlan).toBe(PARTICIPANT_PLAN_VERSION);
    const config = structuredClone(defaultConfig);
    config.paintings.reverse();
    expect(validateConfig(config)).toEqual([]);
  });
  it('rejects unknown participant plans instead of silently changing the study', () => {
    for (const participantPlan of ['crossed-four-v2','',null,{},false]) {
      expect(validateConfig({...defaultConfig,participantPlan}).length).toBeGreaterThan(0);
    }
  });
  it('requires exactly the archery and cuju scenes when the four-person plan is enabled', () => {
    const custom = structuredClone(defaultConfig);
    custom.paintings[0].paintingId = 'custom-scene';
    expect(validateConfig(custom).length).toBeGreaterThan(0);
    expect(validateConfig({...defaultConfig,paintings:geometricPreviewMaterials}).length).toBeGreaterThan(0);
    for (const paintings of [null,[],[null,null],defaultConfig.paintings.slice(0,1)]) {
      expect(() => validateConfig({...defaultConfig,paintings})).not.toThrow();
      expect(validateConfig({...defaultConfig,paintings}).length).toBeGreaterThan(0);
    }
  });
  it('accepts legacy or custom materials when no participant plan is enabled', () => {
    const legacy = structuredClone(defaultConfig);
    delete legacy.participantPlan;
    expect(validateConfig(legacy)).toEqual([]);
    legacy.paintings[0].paintingId = 'custom-scene';
    expect(validateConfig(legacy)).toEqual([]);
    legacy.paintings = structuredClone(geometricPreviewMaterials);
    expect(validateConfig(legacy)).toEqual([]);
  });
  it('blocks unreviewed materials from research mode', () => {
    expect(validateConfig({ ...defaultConfig, mode: 'research' }).some(e => e.includes('未完成核查'))).toBe(true);
  });
  it('rejects malformed imports instead of throwing', () => {
    for (const value of [null, [], 'bad', {}, { ...defaultConfig, paintings: [null, {}] }, { ...defaultConfig, validation: {} }]) expect(validateConfig(value).length).toBeGreaterThan(0);
  });
  it('rejects missing references, duplicate IDs, copied post questions, and out-of-image AOIs', () => {
    const c = structuredClone(defaultConfig);
    c.paintings[1].paintingId = c.paintings[0].paintingId;
    c.paintings[0].relations[0].aoiIds = ['missing'];
    c.paintings[0].aois[0].rect = [0.8, 0, 0.5, 0.5];
    c.paintings[0].post[0].prompt = c.paintings[0].pre[0].prompt;
    const errors = validateConfig(c);
    expect(errors.some(e => e.includes('必须不同'))).toBe(true); expect(errors.some(e => e.includes('存在的 AOI'))).toBe(true); expect(errors.some(e => e.includes('归一化'))).toBe(true); expect(errors.some(e => e.includes('照抄'))).toBe(true);
  });
  it('rejects corrupt source-crop provenance', () => {
    const c = structuredClone(defaultConfig);
    c.paintings[0].crop!.rect = [35000, 0, 6888, 1966];
    c.paintings[0].crop!.sourceSha256 = 'missing';
    const errors = validateConfig(c);
    expect(errors.some(e => e.includes('SHA-256'))).toBe(true); expect(errors.some(e => e.includes('裁切矩形'))).toBe(true);
  });
  it('rejects remote image paths and nonsensical numeric settings', () => {
    const c = structuredClone(defaultConfig); c.paintings[0].image = 'https://example.test/image.jpg'; c.durationSeconds = NaN; c.validation.settleMs = c.validation.targetDurationMs;
    expect(validateConfig(c).length).toBeGreaterThanOrEqual(3);
  });
});
