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

test('v5 session replay keeps the original detached shaft in all three archery cards',async({page})=>{
  await page.goto('/?participant=P00&preview=setup');
  const sources=await page.evaluate(async()=>{
    const moduleAt=(name:string)=>'/src/'+name;
    const {pilotConfig}:typeof import('../../src/pilotMaterials')=await import(moduleAt('pilotMaterials.ts'));
    const {containGeometry}:typeof import('../../src/geometry')=await import(moduleAt('geometry.ts'));
    const {makePaperGuide,drawPaperGuide}:typeof import('../../src/paperGuide')=await import(moduleAt('paperGuide.ts'));
    const {prepareCard}:typeof import('../../src/IllustratedStage')=await import(moduleAt('IllustratedStage.tsx'));
    const {paperEdition}:typeof import('../../src/cardPresentation')=await import(moduleAt('cardPresentation.ts'));
    const version=paperEdition('ming-uci-collage-v5');
    const scene=pilotConfig.paintings.find(p=>p.paintingId==='ming-xingle-archery')!;
    const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=900;
    const ctx=canvas.getContext('2d')!;
    const g=containGeometry({version:1,paintingId:scene.paintingId,timeMs:0,viewportWidth:1440,viewportHeight:900,dpr:1,
      naturalWidth:scene.width,naturalHeight:scene.height,box:{left:0,top:0,width:1440,height:900}});
    const draw=ctx.drawImage.bind(ctx);
    const originals:string[]=[];
    ctx.drawImage=function(...args:Parameters<typeof draw>){
      const image=args[0];
      if(image instanceof HTMLCanvasElement && image.dataset.archerLayer==='shaft')originals.push('v5 detached shaft');
      if(image instanceof HTMLImageElement && image.src.endsWith('/figma-1-6.webp'))originals.push('feathered arrow');
      draw(...args);
    } as typeof draw;
    const observed:string[][]=[];
    for(const card of scene.cards.slice(4,7)){
      const image=await prepareCard(card,version);
      const l=makePaperGuide(ctx,card,g,scene.aois.find(a=>a.id===card.aoiIds[0])!,version);
      drawPaperGuide(ctx,card,image,l,5000,10000);
      observed.push(originals.splice(0));
    }
    return observed;
  });
  expect(sources).toEqual([['v5 detached shaft'],['v5 detached shaft'],['v5 detached shaft']]);
});
