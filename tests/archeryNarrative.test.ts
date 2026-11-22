import {expect,it} from 'vitest';
import {archeryFlight,archeryPlacement,hitArcheryStory} from '../src/archeryNarrative';
import {pilotConfig} from '../src/pilotMaterials';
import {containGeometry} from '../src/geometry';

const scene=pilotConfig.paintings.find(c=>c.paintingId==='ming-xingle-archery')!;
const archer=scene.cards[5],arrow=scene.cards[6],target=scene.cards[7];
const g=containGeometry({version:1,paintingId:scene.paintingId,timeMs:0,viewportWidth:1440,viewportHeight:900,dpr:1,
  naturalWidth:6888,naturalHeight:1966,box:{left:0,top:0,width:1440,height:900}});
const placement=archeryPlacement(arrow,g),source=placement.source!,tip=placement.tip!;
const art={left:tip.x,top:tip.y-5,width:240,height:10};
const layout={source,art};
it('preserves three individually selectable AOIs and their successive positions',()=>{
  expect([archer.id,arrow.id,target.id]).toEqual(['archery-figma-1-2','archery-figma-1-6','archery-figma-0-6']);
  expect(new Set([archer,arrow,target].map(c=>c.aoiIds[0])).size).toBe(3);
  expect(arrow.text).toContain('尾羽');
  expect(archeryPlacement(archer,g)).toEqual({});
  expect(archeryPlacement(target,g).rightSpace).toBeGreaterThan(.25);
});
it('launches from the bow in scene pixels, travels once, and holds exactly at the roundel',()=>{
  const initial=archeryFlight(layout,800,10000,false).shaft;
  const mid=archeryFlight(layout,1550,10000,false).shaft;
  const end=archeryFlight(layout,2500,10000,false).shaft;
  expect(initial.x).toBeCloseTo(4120*g.width/6888+g.left);
  expect(initial.y).toBeCloseTo(1098*g.height/1966+g.top);
  expect(mid.x).toBeLessThan(initial.x);expect(mid.x).toBeGreaterThan(end.x);
  expect(mid.y).toBeLessThan(initial.y);expect(end.y).toBeLessThan(mid.y);
  expect(end.x).toBeCloseTo(tip.x);expect(end.y).toBeCloseTo(tip.y);
  expect(archeryFlight(layout,9500,10000,false).shaft).toEqual(end);
  expect(archeryFlight(layout,0,10000,true).shaft).toEqual(end);
});
it('attributes the moving painted shaft and attached feather to the corresponding card',()=>{
  const t=1540,shaft=archeryFlight(layout,t,10000,false).shaft;
  const x=shaft.x+Math.cos(shaft.angle)*shaft.length*.50,y=shaft.y+Math.sin(shaft.angle)*shaft.length*.50;
  expect(hitArcheryStory(arrow,layout,art,x,y,t,10000,false)).toBe(true);
  expect(hitArcheryStory(arrow,layout,art,x,y+11,t,10000,false)).toBe(false);
  expect(hitArcheryStory(arrow,layout,art,x,y,9000,10000,false)).toBe(false);
  const flag={left:10,top:10,width:43,height:224};
  const embeddedX=flag.left+flag.width*121/172+.32*flag.height*.6;
  const embeddedY=flag.top+flag.height*378/896+.32*flag.height*.6*(183/2489);
  expect(hitArcheryStory(target,layout,flag,embeddedX,embeddedY,0,10000,false)).toBe(true);
  expect(hitArcheryStory(target,layout,flag,embeddedX,embeddedY+20,0,10000,false)).toBeUndefined();
});
