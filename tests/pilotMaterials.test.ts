import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pilotConfig } from '../src/pilotMaterials';
import { pilotInterviewQuestions, pilotSceneQuestions } from '../src/pilotQuestions';
import {singleAoi,sceneDurationSeconds} from '../src/pilotProtocol';
import {hitGuide,validCutout} from '../src/cutoutCard';
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

  it('makes every registered detail reachable, including figures inside larger settings', () => {
    for (const scene of pilotConfig.paintings) {
      expect(scene.cards.map(card => card.aoiIds)).toEqual(scene.aois.map(aoi => [aoi.id]));
      for(const [index,area] of scene.aois.entries()){
        const card=scene.cards[index];
        expect(validCutout(card.art)).toBe(true);
        expect(readFileSync(join('public',card.art!.image)).subarray(8,12).toString()).toBe('WEBP');
        // A pavilion includes the emperor. Check that each can actually be chosen from its own area.
        const reachable=(area.hitRects??[area.rect]).some(([x,y,w,h])=>
          [0.15,0.5,0.85].some(u=>[0.15,0.5,0.85].some(v=>singleAoi(x+u*w,y+v*h,scene.aois,true)===area.id)));
        expect(reachable,card.title).toBe(true);
      }
      expect(scene.recallQuestions!.every(q=>scene.cards.some(c=>c.id===q.cardId))).toBe(true);
      expect(scene.pre).toEqual(pilotSceneQuestions);
      expect(scene.pre).not.toBe(pilotSceneQuestions);
      expect(scene.post).toEqual([]);
      expect(scene.interview).toEqual(pilotInterviewQuestions.map(question => question.prompt));
    }
  });

  it('displays every supplied detail and excludes transparent margins from attention',()=>{
    expect(pilotConfig.paintings.map(p=>p.cards.length)).toEqual([6,7,9]);
    expect(pilotConfig.paintings.map(p=>sceneDurationSeconds(p,60))).toEqual([72,84,108]);
    const art=pilotConfig.paintings[1].cards.find(c=>c.title==='屏风式球门')!.art;
    const rect={left:0,top:0,width:600,height:300};
    expect(hitGuide(1,1,rect,600,520,art)).toBe(false);
    expect(hitGuide(500,150,rect,0,520,art)).toBe(true);
    expect(hitGuide(599,170,rect,0,520,art)).toBe(false);
    expect(hitGuide(599,170,rect,520,520,art)).toBe(true);
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
