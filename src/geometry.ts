import type { Geometry } from './types';

export interface GeometryInput {
  version: number;
  paintingId: string;
  timeMs: number;
  viewportWidth: number;
  viewportHeight: number;
  dpr: number;
  naturalWidth: number;
  naturalHeight: number;
  box: { left: number; top: number; width: number; height: number };
}

/** Actual object-fit:contain content rectangle. All screen quantities are CSS pixels. */
export function containGeometry(input: GeometryInput): Geometry {
  const { box, naturalWidth, naturalHeight, ...metadata } = input;
  for (const [name, value] of Object.entries({ naturalWidth, naturalHeight, boxWidth: box.width, boxHeight: box.height, viewportWidth: input.viewportWidth, viewportHeight: input.viewportHeight, dpr: input.dpr })) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid geometry ${name}`);
  }
  if (!Number.isFinite(box.left) || !Number.isFinite(box.top)) throw new Error('Invalid geometry box origin');
  const scale = Math.min(box.width / naturalWidth, box.height / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return { ...metadata, naturalWidth, naturalHeight, scale, width, height, left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2 };
}

export function mapPoint(x: number | null, y: number | null, geometry: Geometry | null): {
  imageX: number | null; imageY: number | null; imageNormX: number | null; imageNormY: number | null; insideImage: boolean;
} {
  if (!geometry || x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) {
    return { imageX: null, imageY: null, imageNormX: null, imageNormY: null, insideImage: false };
  }
  const imageNormX = (x - geometry.left) / geometry.width;
  const imageNormY = (y - geometry.top) / geometry.height;
  return {
    imageX: imageNormX * geometry.naturalWidth,
    imageY: imageNormY * geometry.naturalHeight,
    imageNormX,
    imageNormY,
    insideImage: imageNormX >= 0 && imageNormX <= 1 && imageNormY >= 0 && imageNormY <= 1,
  };
}
