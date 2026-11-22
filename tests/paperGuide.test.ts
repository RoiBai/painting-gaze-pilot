import {describe,expect,it} from 'vitest';
import {pilotConfig} from '../src/pilotMaterials';
import {containGeometry} from '../src/geometry';
import {hitPaperGuide,makePaperGuide,paperFrame,validPaperGuideLayout} from '../src/paperGuide';

const measure={
  font:'',
  measureText(this:{font:string},text:string){return {width:Array.from(text).length*Number(this.font.match(/([\d.]+)px/)?.[1]??18)}},
} as unknown as CanvasRenderingContext2D;
function geometry(p:typeof pilotConfig.paintings[number],width:number,height:number){
  return containGeometry({version:1,paintingId:p.paintingId,timeMs:0,viewportWidth:width,viewportHeight:height,dpr:1,naturalWidth:p.width,naturalHeight:p.height,box:{left:0,top:0,width,height}});
}
describe('paper illustration layout',()=>{
  for(const [vw,vh] of [[390,844],[412,732],[768,1024],[844,390],[1024,768],[1280,720],[1366,768],[1440,900],[1920,1080],[2560,720]]){
    it(`keeps all 22 foregrounds at least as large as their original area and inside ${vw} × ${vh}`,()=>{
      for(const p of pilotConfig.paintings){
        const g=geometry(p,vw,vh);
        for(const c of p.cards){
          const a=p.aois.find(a=>a.id===c.aoiIds[0])!;
          const l=makePaperGuide(measure,c,g,a);
          expect(validPaperGuideLayout(l),c.title).toBe(true);
          // The acquisition region around the thin arrow has generous tolerance.
          // Its takeoff point and size are registered to the actual painted shaft.
          if(c.id==='archery-figma-1-6'){
            expect(l.source.left).toBeCloseTo(g.left+4120*g.scale);
            expect(l.source.width).toBeCloseTo(156*g.scale);
            expect(l.art.left).toBeCloseTo(g.left+1631*g.scale);
            expect(l.art.top+l.art.height/2).toBeCloseTo(g.top+915*g.scale);
            expect(paperFrame(l,1510,10000).backingAlpha).toBe(0);
            expect(paperFrame(l,1950,10000).textAlpha).toBe(0);
            expect(paperFrame(l,2700,10000).textAlpha).toBe(1);
            expect(paperFrame(l,0,10000,true).backingAlpha).toBe(1);
          }else{
            expect(l.source.width,c.title).toBeGreaterThanOrEqual(a.rect[2]*g.width-1e-5);
            expect(l.source.height,c.title).toBeGreaterThanOrEqual(a.rect[3]*g.height-1e-5);
          }
          expect(l.art.width,c.title).toBeGreaterThanOrEqual(a.rect[2]*g.width-1e-5);
          expect(l.art.height,c.title).toBeGreaterThanOrEqual(a.rect[3]*g.height-1e-5);
          expect(l.art.width/l.art.height).toBeCloseTo(c.art!.shape!.width/c.art!.shape!.height);
          for(const r of [l.source,l.art,l.backing,l.panel,l.bounds]){
            expect(r.left,c.title).toBeGreaterThanOrEqual(-.01);
            expect(r.top,c.title).toBeGreaterThanOrEqual(-.01);
            expect(r.left+r.width,c.title).toBeLessThanOrEqual(vw+.01);
            expect(r.top+r.height,c.title).toBeLessThanOrEqual(vh+.01);
          }
          for(const key of ['title','body'] as const){
            expect(l.type[key].reduce((sum,n)=>sum+n,0)).toBe(Array.from(key==='title'?c.title:c.text).length);
          }
        }
      }
    });
  }
  it('lights the original, brings up the board and type, then releases the scene',()=>{
    const p=pilotConfig.paintings[0],g=geometry(p,1440,900);
    const card=p.cards.find(c=>c.id.endsWith('3-17'))!,area=p.aois.find(a=>a.id===card.aoiIds[0])!;
    const l=makePaperGuide(measure,card,g,area);
    const frames=[0,170,720,2000,9800,10000].map(ms=>paperFrame(l,ms,10000));
    expect(frames[0].subject).toMatchObject(l.source);
    expect(frames[0].panel.width).toBe(0);
    expect(frames[1].light).toBe(1);
    expect(frames[2].panel.width).toBeGreaterThan(0);
    expect(frames[2].panel.width).toBeLessThan(frames[3].panel.width);
    expect(frames[3].subject.width).toBeCloseTo(l.art.width);
    expect(frames[3].backingAlpha).toBe(1);
    expect(frames[4].alpha).toBeLessThan(.5);
    expect(frames[5].alpha).toBe(0);
    expect(hitPaperGuide(l.backing.left+5,l.backing.top+5,card,l,5000,10000)).toBe(true);
    expect(hitPaperGuide(l.backing.left+5,l.backing.top+5,card,l,10000,10000)).toBe(false);
    expect(paperFrame(l,0,10000,true).subject.width).toBeCloseTo(l.art.width);
    expect(paperFrame(l,9999,10000,true).alpha).toBe(1);
    expect(paperFrame(l,10000,10000,true).alpha).toBe(0);
  });
  it('registers both the transparent gap between the groups and the copy to one pigment board',()=>{
    const p=pilotConfig.paintings[0],g=geometry(p,1440,900),card=p.cards[2];
    const area=p.aois.find(a=>a.id===card.aoiIds[0])!;
    const l=makePaperGuide(measure,card,g,area);
    expect(l.style).toBe('single-board');
    expect(l.backing.left).toBeGreaterThan(l.art.left);
    expect(l.backing.left).toBeLessThan(l.art.left+.1*l.art.width);
    expect(l.backing.left+l.backing.width).toBe(l.panel.left+l.panel.width);
    for(const box of [l.art,l.panel]){
      expect(hitPaperGuide(box.left+box.width/2,box.top+box.height/2,card,l,5000,10000)).toBe(true);
    }
    // The transparent upper left corner of the protruding cutout remains painting.
    expect(hitPaperGuide(l.art.left+1,l.art.top+1,card,l,5000,10000)).toBe(false);
    const legacy=makePaperGuide(measure,card,g,area,'legacy');
    expect(legacy.style).toBeUndefined();
    expect(legacy.backing.left).toBeLessThan(legacy.art.left);
    expect(legacy.backing.left+legacy.backing.width).toBeLessThan(legacy.panel.left+legacy.panel.width);
    expect(paperFrame(legacy,9999,10000,true).alpha).toBeLessThan(.1);
  });
});
