import { describe, expect, it } from 'vitest';
import { containGeometry, mapPoint } from '../src/geometry';
const base = { version: 1, paintingId: 'a', timeMs: 10, viewportWidth: 1200, viewportHeight: 800, dpr: 2, naturalWidth: 1600, naturalHeight: 1000, box: { left: 100, top: 100, width: 1000, height: 500 } };
describe('CSS-pixel contain geometry', () => {
  it('maps horizontal letterboxing without multiplying DPR', () => {
    const g = containGeometry(base);
    expect(g).toMatchObject({ left: 200, top: 100, width: 800, height: 500, scale: 0.5 });
    expect(mapPoint(600, 350, g)).toEqual({ imageX: 800, imageY: 500, imageNormX: 0.5, imageNormY: 0.5, insideImage: true });
  });
  it('retains predictions in letterbox outside instead of clamping', () => {
    expect(mapPoint(100, 350, containGeometry(base))).toMatchObject({ imageX: -200, imageNormX: -0.125, insideImage: false });
  });
  it('maps vertical letterboxing and resized viewport independently', () => {
    const g = containGeometry({ ...base, naturalWidth: 1000, naturalHeight: 500, box: { left: 20, top: 40, width: 500, height: 600 } });
    expect(g).toMatchObject({ left: 20, top: 215, width: 500, height: 250 });
    expect(mapPoint(520, 465, g)).toMatchObject({ imageX: 1000, imageY: 500, insideImage: true });
    expect(mapPoint(270, 40, g).insideImage).toBe(false);
  });
  it('leaves missing/nonfinite values missing', () => {
    for (const [x, y] of [[null, 12], [5, null], [Infinity, 20], [NaN, 5]] as [number | null, number | null][]) expect(mapPoint(x, y, containGeometry(base))).toEqual({ imageX: null, imageY: null, imageNormX: null, imageNormY: null, insideImage: false });
    expect(mapPoint(100, 200, null).imageX).toBeNull();
  });
  it('rejects unready or zero geometry', () => {
    expect(() => containGeometry({ ...base, naturalWidth: 0 })).toThrow();
    expect(() => containGeometry({ ...base, box: { ...base.box, height: 0 } })).toThrow();
  });
});
