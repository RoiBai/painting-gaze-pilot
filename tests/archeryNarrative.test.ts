import {expect,it} from 'vitest';
import {archeryFlight,archeryPlacement,archeryTiming,hitArcheryStory,lodgedArrow} from '../src/archeryNarrative';
import {pilotConfig} from '../src/pilotMaterials';
import {containGeometry} from '../src/geometry';

const scene=pilotConfig.paintings.find(c=>c.paintingId==='ming-xingle-archery')!;
const arrow=scene.cards[4],archer=scene.cards[5],target=scene.cards[6];
function stage(width:number,height:number){
  const g=containGeometry({version:1,paintingId:scene.paintingId,timeMs:0,viewportWidth:width,viewportHeight:height,dpr:1,
    naturalWidth:6888,naturalHeight:1966,box:{left:0,top:0,width,height}});
  const placement=archeryPlacement(arrow,g),source=placement.source!,impact=placement.tip!,w=placement.detailWidth!;
  const art={left:source.left-16,top:source.top+source.height/2-20-w/48,width:w,height:w/24};
  return {source,art,impact};
}
const layout=stage(1440,900);

it('keeps distinct AOIs for the detail, release and target',()=>{
  expect([archer.id,arrow.id,target.id]).toEqual(['archery-figma-1-2','archery-figma-1-6','archery-figma-0-6']);
  expect(new Set([archer,arrow,target].map(c=>c.aoiIds[0])).size).toBe(3);
  expect(arrow.text).toContain('尾羽');
});

it('replays the v3 arrow reading and return at the original hand',()=>{
  const at=(t:number)=>archeryFlight(layout,t,10000,false).shaft;
  const original=at(0),reading=at(4000),returning=at(7350),ready=at(7700);
  expect(original.length).toBeCloseTo(156*1440/6888);
  expect(reading.length).toBeCloseTo(1.6*original.length);
  expect(reading.length).toBeLessThan(60);
  expect(stage(390,844).art.width).toBe(30);
  expect(reading.y).toBeLessThan(original.y);
  expect(archeryTiming(6400,10000,false).boardAlpha).toBe(1);
  expect(archeryTiming(6700,10000,false).boardAlpha).toBeCloseTo(.5);
  expect(archeryTiming(7000,10000,false).boardAlpha).toBe(0);
  expect(at(7000)).toEqual(reading);
  expect(returning.length).toBeLessThan(reading.length);
  expect(returning.y).toBeGreaterThan(reading.y);
  expect(ready).toEqual(original);
});

it.each([[390,844],[1440,900],[1920,1080]])('flies exactly once at painted scale after the explanation in %i × %i', (w,h)=>{
  const l=stage(w,h),at=(t:number)=>archeryFlight(l,t,10000,false).shaft;
  const from=at(7900),during=at(8450),to=at(9000);
  expect(from.x).toBeCloseTo(l.source.left);
  expect(during.x).toBeCloseTo((from.x+l.impact.x)/2);
  expect(during.y).toBeCloseTo((from.y+l.impact.y)/2);
  for(const t of [7900,8150,8450,8670,9000,9800]){
    expect(at(t).length).toBeCloseTo(l.source.width,10);
    expect(archeryTiming(t,10000,false).boardAlpha).toBe(0);
  }
  expect(to.x).toBeCloseTo(l.impact.x);expect(to.y).toBeCloseTo(l.impact.y);
  expect(at(9600)).toEqual(to);
});

it('cuts from a stationary detail to the lodged arrow when motion is reduced',()=>{
  const detail=archeryFlight(layout,0,10000,true).shaft;
  expect(archeryFlight(layout,6999,10000,true).shaft).toEqual(detail);
  expect(detail.length).toEqual(layout.art.width);
  const landed=archeryFlight(layout,7000,10000,true).shaft;
  expect(landed.x).toBeCloseTo(layout.impact.x);
  expect(landed.length).toBeCloseTo(layout.source.width);
  expect(archeryFlight(layout,9900,10000,true).shaft).toEqual(landed);
});

it('uses the painted shaft-to-roundel proportion when the target grows',()=>{
  const rect={left:10,top:10,width:43,height:224};
  const shaft=lodgedArrow(rect);
  expect(shaft.length/(rect.width*105/172)).toBeCloseTo(1.56);
  const x=shaft.x+Math.cos(shaft.angle)*shaft.length*.50,y=shaft.y+Math.sin(shaft.angle)*shaft.length*.50;
  expect(hitArcheryStory(target,layout,rect,x,y,2000,10000,false)).toBe(true);
  expect(hitArcheryStory(target,layout,rect,x,y+12,2000,10000,false)).toBeUndefined();
});
it('counts only the visible flight shaft on the painting after the card disappears',()=>{
  const shaft=archeryFlight(layout,8450,10000,false).shaft;
  const x=shaft.x+Math.cos(shaft.angle)*shaft.length*.50,y=shaft.y+Math.sin(shaft.angle)*shaft.length*.50;
  expect(hitArcheryStory(arrow,layout,layout.art,x,y,8450,10000,false)).toBe(true);
  expect(hitArcheryStory(arrow,layout,layout.art,x,y+3,8450,10000,false)).toBe(false);
  expect(hitArcheryStory(arrow,layout,layout.art,x,y,9500,10000,false)).toBe(false);
  expect(hitArcheryStory(arrow,layout,layout.art,layout.impact.x,layout.impact.y,8450,10000,false)).toBe(false);
});
