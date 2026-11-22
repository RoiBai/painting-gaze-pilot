import {expect,test} from '@playwright/test';
import {pilotConfig} from '../../src/pilotMaterials';

test('the pavilion keeps the emperor and architecture fixed as the lanterns and guards move',async({page})=>{
  const pavilion=pilotConfig.paintings[0].cards.find(c=>c.id==='cuju-figma-1-5')!;
  await page.goto(pavilion.art!.image);
  const changed=await page.evaluate(async({card,module})=>{
    const {drawCollageSubject}=await import(module) as typeof import('../../src/cutoutMotion');
    const image=document.querySelector('img')!;
    await image.decode();
    const canvas=document.createElement('canvas');
    canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
    const box={left:0,top:0,width:canvas.width,height:canvas.height};
    function pixels(elapsed:number){
      ctx.clearRect(0,0,canvas.width,canvas.height);
      drawCollageSubject(ctx,card,image,box,elapsed,false);
      return new Uint32Array(ctx.getImageData(0,0,canvas.width,canvas.height).data.buffer);
    }
    const rest=pixels(0),peak=pixels(1900);
    function changes(l:number,t:number,r:number,b:number){
      let count=0;
      for(let y=t;y<b;y++)for(let x=l;x<r;x++){
        const i=y*canvas.width+x;
        if(rest[i]!==peak[i])count++;
      }
      return count;
    }
    return {
      fixed:[changes(0,0,768,170),changes(235,190,440,500),changes(0,484,768,572)],
      active:[changes(151,283,219,415),changes(438,271,514,421),changes(50,188,115,328),changes(640,189,698,328)],
    };
  },{card:pavilion,module:'/src/cutoutMotion.ts'});
  expect(changed.fixed).toEqual([0,0,0]);
  for(const pixels of changed.active)expect(pixels).toBeGreaterThan(500);
});
