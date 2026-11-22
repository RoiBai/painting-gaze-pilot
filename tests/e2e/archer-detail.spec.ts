import {expect,test} from '@playwright/test';

test('detaching the painted arrow preserves the archer, bow grip and quiver',async({page})=>{
  await page.goto('/materials/uci/figma-1-2.webp');
  const sample=await page.evaluate(async (url:string)=>{
    const detail:typeof import('../../src/archerDetail')=await import(url);
    const image=document.querySelector('img')!;
    await image.decode();detail.prepareArcherDetail(image);
    const canvas=document.createElement('canvas');
    canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
    const box={left:0,top:0,width:canvas.width,height:canvas.height};
    const pixels=()=>ctx.getImageData(0,0,canvas.width,canvas.height).data;
    const alpha=(data:Uint8ClampedArray,x:number,y:number)=>data[(y*canvas.width+x)*4+3];
    ctx.drawImage(image,0,0);
    const original=pixels();
    ctx.clearRect(0,0,box.width,box.height);
    detail.drawReleasedArcher(ctx,box);
    const released=pixels(),pose=detail.archerArrowPose(box);
    ctx.clearRect(0,0,box.width,box.height);
    detail.drawReleasedArrow(ctx,pose);
    const shaft=pixels();
    const probes=[[21,203],[170,199],[270,197],[68,201],[65,230],[605,320]];
    return probes.map(([x,y])=>[alpha(original,x,y),alpha(released,x,y),alpha(shaft,x,y)]);
  },'/src/archerDetail.ts');
  // Arrowhead and two points on the shaft lift cleanly away.
  for(const [before,after,detached] of sample.slice(0,3)){
    expect(before).toBeGreaterThan(50);expect(after).toBe(0);expect(detached).toBeGreaterThan(40);
  }
  // The arrow's painted grip crossing stays opaque when the arrow moves away.
  for(const [before,after] of sample.slice(3)){
    expect(before).toBeGreaterThan(150);expect(after).toBe(before);
  }
  expect(sample[3][2]).toBeGreaterThan(40); // uninterrupted detached shaft
});

test('drawing the bow changes the grip and forearm but keeps the robe and feet registered',async({page})=>{
  await page.goto('/materials/uci/figma-1-2.webp');
  const changes=await page.evaluate(async(url:string)=>{
    const detail:typeof import('../../src/archerDetail')=await import(url);
    const image=document.querySelector('img')!;
    await image.decode();detail.prepareBowDraw(image);
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
    const box={left:0,top:0,width:canvas.width,height:canvas.height};
    function pixels(ms:number){
      ctx.clearRect(0,0,canvas.width,canvas.height);
      detail.drawBowArcher(ctx,box,ms,10000,false);
      return ctx.getImageData(0,0,box.width,box.height).data;
    }
    const poses=[1600,2300,3500,6000].map(pixels);
    return poses.slice(1).map((pose,i)=>{
      let moving=0,fixed=0;
      for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
        const n=(y*canvas.width+x)*4;
        if(Math.max(pose[n+3],poses[i][n+3])<40)continue;
        const changed=[0,1,2,3].some(c=>Math.abs(pose[n+c]-poses[i][n+c])>8);
        if(changed && y>=550)fixed++;
        if(changed && x<230 && y>165 && y<280)moving++;
      }
      return {fixed,moving};
    });
  },'/src/archerDetail.ts');
  for(const pair of changes){
    expect(pair.fixed).toBe(0);
    expect(pair.moving).toBeGreaterThan(100);
  }
});
