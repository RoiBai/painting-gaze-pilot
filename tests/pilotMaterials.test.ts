import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pilotConfig } from '../src/pilotMaterials';
import { pilotInterviewQuestions, pilotSceneQuestions } from '../src/pilotQuestions';
import { validateConfig } from '../src/study';

type Manifest = {
  sourceSha256: string;
  scenes: { paintingId: string; image: string; rect: number[]; sha256: string }[];
};

describe('three-condition painting materials', () => {
  it('loads each full-height scene from the documented crop with its original pixel dimensions', () => {
    const manifest: Manifest = JSON.parse(readFileSync('public/materials/provenance-pilot-v1.json', 'utf8'));
    expect(validateConfig(pilotConfig)).toEqual([]);
    expect(pilotConfig.durationSeconds).toBe(60);
    expect(pilotConfig.validation.maxMedianErrorPx).toBe(250);
    for (const scene of pilotConfig.paintings) {
      const entry = manifest.scenes.find(record => record.paintingId === scene.paintingId);
      expect(entry?.image).toBe(scene.image);
      expect(entry?.rect).toEqual(scene.crop?.rect);
      expect(entry?.rect.slice(2)).toEqual([scene.width, scene.height]);
      expect(scene.height).toBe(scene.crop?.sourceHeight);
      expect(scene.crop?.sourceSha256).toBe(manifest.sourceSha256);
      const bytes = readFileSync(join('public', scene.image));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry?.sha256);
    }
  });

  it('assigns one distinct nonoverlapping area to each card and the same questionnaire to each scene', () => {
    for (const scene of pilotConfig.paintings) {
      expect(scene.cards.map(card => card.aoiIds)).toEqual(scene.aois.map(aoi => [aoi.id]));
      for (const [i, first] of scene.aois.entries()) {
        const [x, y, w, h] = first.rect;
        for (const second of scene.aois.slice(i + 1)) {
          const [otherX, otherY, otherW, otherH] = second.rect;
          expect(x + w < otherX || otherX + otherW < x || y + h < otherY || otherY + otherH < y).toBe(true);
        }
      }
      expect(scene.pre).toEqual(pilotSceneQuestions);
      expect(scene.pre).not.toBe(pilotSceneQuestions);
      expect(scene.post).toEqual([]);
      expect(scene.interview).toEqual(pilotInterviewQuestions.map(question => question.prompt));
    }
  });

  it('detects missing scenes, ambiguous card mappings, and broken scale definitions in imports', () => {
    const config = structuredClone(pilotConfig);
    config.paintings.pop();
    const scene = config.paintings[0];
    scene.cards[1].aoiIds = [...scene.cards[0].aoiIds, ...scene.cards[2].aoiIds];
    scene.pre[0].ratingScale!.step = 0;
    const errors = validateConfig(config);
    for (const rule of ['三个场景', '一个独立区域', '区域不能重复', '评分量表']) {
      expect(errors.some(error => error.includes(rule))).toBe(true);
    }
  });
});
