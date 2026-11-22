import {describe,expect,it} from 'vitest';
import {pilotConfig} from '../src/pilotMaterials';
import {containGeometry} from '../src/geometry';
import {archerArrowPose} from '../src/archerDetail';
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
          // The small static arrow detail uses the shaft, not its padded gaze AOI.
          if(c.id==='archery-figma-1-6'){
            expect(l.source.left).toBeCloseTo(g.left+4120*g.scale);
            expect(l.source.width).toBeCloseTo(156*g.scale);
            expect(l.reveal).toBe('arrow-detail');
            expect(l.impact).toBeUndefined();
            expect(Math.abs(l.art.left-l.source.left)).toBeLessThan(65);
            expect(l.art.width).toBeGreaterThan(l.source.width);
            expect(l.art.width).toBeLessThanOrEqual(Math.max(31,l.source.width*1.8));
            expect(l.backing.top+l.backing.height).toBeLessThan(l.source.top-10);
            expect(l.backing.width).toBeLessThanOrEqual(305);
            expect(paperFrame(l,2500,10000).textAlpha).toBe(1);
            expect(paperFrame(l,8300,10000).textAlpha).toBe(1);
            expect(paperFrame(l,8300,10000,true).textAlpha).toBe(1);
          }else{
            expect(l.source.width,c.title).toBeGreaterThanOrEqual(a.rect[2]*g.width-1e-5);
            expect(l.source.height,c.title).toBeGreaterThanOrEqual(a.rect[3]*g.height-1e-5);
            expect(l.art.width,c.title).toBeGreaterThanOrEqual(a.rect[2]*g.width-1e-5);
            expect(l.art.height,c.title).toBeGreaterThanOrEqual(a.rect[3]*g.height-1e-5);
          }
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
  it('drops only the archer’s board and copy, preserving his enlarged figure and registered target',()=>{
    const scene=pilotConfig.paintings[2],card=scene.cards.find(c=>c.id==='archery-figma-1-2')!;
    for(const [vw,vh] of [[1440,900],[390,844]]){
      const g=geometry(scene,vw,vh),area=scene.aois.find(a=>a.id===card.aoiIds[0])!;
      const l=makePaperGuide(measure,card,g,area);
      const read=paperFrame(l,5000,10000),leaving=paperFrame(l,6750,10000),release=paperFrame(l,8400,10000);
      expect(l.reveal).toBe('archer-release');
      expect(l.impact!.x).toBeCloseTo(g.left+1631*g.scale);
      expect(l.impact!.y).toBeCloseTo(g.top+915*g.scale);
      expect(l.art.left-l.impact!.x).toBeGreaterThan(vw*.12);
      expect(validPaperGuideLayout({...l,impact:undefined})).toBe(false);
      expect(leaving.subject).toEqual(read.subject);
      expect(release.subject).toEqual(read.subject);
      expect(release.subject.width).toBeCloseTo(l.art.width);
      expect(read.backingAlpha).toBe(1);
      expect(leaving.textAlpha).toBeGreaterThan(0);
      expect(leaving.textAlpha).toBeLessThan(1);
      expect(leaving.backing.top-read.backing.top).toBeGreaterThan(8);
      expect(leaving.panel.top-read.panel.top).toBeCloseTo(leaving.backing.top-read.backing.top);
      expect(release.textAlpha).toBe(0);
      expect(release.backingAlpha).toBe(0);
      expect(release.veil).toBe(0);
      const x=l.backing.left+l.backing.width*.9,y=l.backing.top+2;
      expect(hitPaperGuide(x,y,card,l,5000,10000)).toBe(true);
      expect(hitPaperGuide(x,y,card,l,6750,10000)).toBe(false);
      expect(hitPaperGuide(x,y+leaving.boardDrop,card,l,6750,10000)).toBe(true);
      expect(hitPaperGuide(x,y+leaving.boardDrop,card,l,8400,10000)).toBe(false);
      const reduced=paperFrame(l,8400,10000,true);
      expect(reduced.backingAlpha).toBe(0);
      expect(reduced.boardDrop).toBe(0);
    }
  });
  it('leaves the same shaft at the bullseye when opening the target explanation',()=>{
    const scene=pilotConfig.paintings[2];
    for(const [vw,vh] of [[1440,900],[390,844],[1024,768]]){
      const g=geometry(scene,vw,vh);
      const cardLayout=(id:string,edition?:'v3')=>{
        const c=scene.cards.find(card=>card.id===id)!;
        return makePaperGuide(measure,c,g,scene.aois.find(a=>a.id===c.aoiIds[0])!,edition);
      };
      const archer=cardLayout('archery-figma-1-2'),target=cardLayout('archery-figma-0-6');
      expect(target.reveal).toBe('landed-arrow');
      expect(target.landedArrowLength).toBeCloseTo(archerArrowPose(archer.art).length);
      expect(validPaperGuideLayout({...target,landedArrowLength:0})).toBe(false);
      const shaftEnd=target.art.left+target.art.width*121/172+target.landedArrowLength!;
      expect(shaftEnd).toBeLessThan(target.type.pad+target.panel.left);
      expect(cardLayout('archery-figma-0-6','v3').landedArrowLength).toBeUndefined();
    }
  });
  it('keeps the rider in place for the shot and reserves discrete poses for the other moving details',()=>{
    const idLayout=(id:string,edition?:'v3')=>{
      const scene=pilotConfig.paintings.find(p=>p.cards.some(c=>c.id===id))!;
      const card=scene.cards.find(c=>c.id===id)!;
      return makePaperGuide(measure,card,geometry(scene,1440,900),scene.aois.find(a=>a.id===card.aoiIds[0])!,edition);
    };
    const swing=idLayout('polo-figma-3-23');
    expect(swing.reveal).toBe('polo-swing');
    expect(paperFrame(swing,8000,10000).subject).toEqual(paperFrame(swing,4000,10000).subject);
    expect(paperFrame(swing,6750,10000).boardDrop).toBeGreaterThan(8);
    expect(paperFrame(swing,8000,10000).textAlpha).toBe(0);
    expect(paperFrame(swing,8000,10000,true).backingAlpha).toBe(0);
    for(const id of ['polo-figma-3-19','archery-figma-3-6','cuju-figma-1-5']){
      const l=idLayout(id);
      expect(l.reveal).toBe('stepped-poses');
      expect(paperFrame(l,8000,10000).textAlpha).toBe(1);
      expect(idLayout(id,'v3').reveal).toBeUndefined();
    }
    const club=idLayout('polo-figma-3-25');
    expect(club.reveal).toBeUndefined();
    expect(club.art.width/swing.art.width).toBeLessThan(.5);
    expect(club.art.width/club.art.height).toBeCloseTo(768/232);
    expect(idLayout('polo-figma-3-25','v3').art.width).toBeGreaterThan(club.art.width);
  });
  it('reconstructs the published v3 order of animations for older sessions',()=>{
    const scene=pilotConfig.paintings[2],g=geometry(scene,1440,900);
    for(const id of ['archery-figma-1-2','archery-figma-1-6']){
      const card=scene.cards.find(c=>c.id===id)!;
      const l=makePaperGuide(measure,card,g,scene.aois.find(a=>a.id===card.aoiIds[0])!,'v3');
      const oldArrow=id==='archery-figma-1-6';
      expect(l.reveal).toBe(oldArrow?'explain-then-shoot':undefined);
      expect(paperFrame(l,6800,10000).boardDrop).toBe(0);
      expect(paperFrame(l,7900,10000).backingAlpha).toBe(oldArrow?0:1);
      expect(validPaperGuideLayout(l)).toBe(true);
    }
  });
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
