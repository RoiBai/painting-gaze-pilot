import {describe,expect,it} from 'vitest';
import {pilotConfig} from '../src/pilotMaterials';
import {hitCollageSubject} from '../src/cutoutMotion';

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
