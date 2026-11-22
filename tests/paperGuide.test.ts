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
          expect(l.source.width,c.title).toBeGreaterThanOrEqual(a.rect[2]*g.width-1e-5);
          expect(l.source.height,c.title).toBeGreaterThanOrEqual(a.rect[3]*g.height-1e-5);
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
  it('lights the original, moves the whole group onto its mount, unfolds the text, then releases the scene',()=>{
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
  });
});
