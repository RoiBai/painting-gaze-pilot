import {describe,expect,it,vi} from 'vitest';
import {pilotConfig} from '../src/pilotMaterials';
import {drawCollageSubject,hitCollageSubject} from '../src/cutoutMotion';

const kicker=pilotConfig.paintings[0].cards.find(c=>c.id==='cuju-figma-1-4')!;
const rect={left:37,top:23,width:240,height:448};
function hit(u:number,v:number,time:number,reduced=false){
  return hitCollageSubject(kicker,rect,rect.left+u*rect.width,rect.top+v*rect.height,time,reduced);
}
describe('paper kick pose replay',()=>{
  it('moves the raised shoe and the ball, preserving the planted body',()=>{
    expect(hit(.965,.828,0)).toBe(true);
    expect(hit(.965,.828,1900)).toBe(false);
    expect(hit(1.07,.673,0)).toBe(false);
    expect(hit(1.07,.673,1900)).toBe(true);
    for(const time of [0,1900,3000])expect(hit(.48,.38,time)).toBe(true);
  });
  it('holds the reference pose for reduced motion and returns to rest between kicks',()=>{
    for(const [u,v] of [[.965,.828],[1.07,.673]]){
      expect(hit(u,v,1900,true)).toBe(hit(u,v,0));
      expect(hit(u,v,3000)).toBe(hit(u,v,0));
    }
  });
});


describe('selective cut-paper gestures',()=>{
  it('draws the unchanged source throughout the reading period for stationary subjects',()=>{
    const active=['cuju-figma-1-5','cuju-figma-1-4','polo-figma-3-23','polo-figma-3-19'];
    const ctx={drawImage:vi.fn()} as unknown as CanvasRenderingContext2D;
    const picture={} as HTMLImageElement;
    const stationary=pilotConfig.paintings.flatMap(scene=>scene.cards).filter(c=>!active.includes(c.id));
    expect(stationary).toHaveLength(18);
    for(const card of stationary){
      for(const ms of [0,1500,1900,2700]){
        drawCollageSubject(ctx,card,picture,rect,ms,false);
        expect(ctx.drawImage).toHaveBeenLastCalledWith(picture,rect.left,rect.top,rect.width,rect.height);
      }
    }
  });
  it('keeps the standalone ball fixed in new recordings and replays the archived bounce',()=>{
    const ball=pilotConfig.paintings[0].cards.find(c=>c.id==='cuju-figma-0-10')!;
    const box={left:0,top:0,width:80,height:80};
    let oldChanges=0,newChanges=0;
    for(let y=0;y<80;y++)for(let x=0;x<80;x++){
      const rest=hitCollageSubject(ball,box,x,y,0,false);
      if(hitCollageSubject(ball,box,x,y,1900,false)!==rest)newChanges++;
      if(hitCollageSubject(ball,box,x,y,1900,false,true)!==rest)oldChanges++;
    }
    expect(newChanges).toBe(0);
    expect(oldChanges).toBeGreaterThan(50);
  });
});
