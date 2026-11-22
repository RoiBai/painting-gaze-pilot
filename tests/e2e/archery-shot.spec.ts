import {expect,test} from '@playwright/test';

for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
  test('P00 reads the arrow before releasing it from the bow at '+viewport.width+'px',async({page})=>{
    await page.setViewportSize(viewport);
    const start=new Date('2026-11-23T00:00:00Z');
    await page.clock.install({time:start});
    await page.clock.pauseAt(new Date(+start+1000));
    await page.goto('/?participant=P00&preview=layout&scene=ming-xingle-archery&card=archery-figma-1-6');
    const stage=page.locator('main[data-card="archery-figma-1-6"] canvas');
    await expect(stage).toBeVisible();

    // Observe the ink and shaft painted by the running viewer in CSS pixels.
    await stage.evaluate(element=>{
      const canvas=element as HTMLCanvasElement,ctx=canvas.getContext('2d')!;
      const clear=ctx.clearRect.bind(ctx),write=ctx.fillText.bind(ctx),draw=ctx.drawImage.bind(ctx);
      ctx.clearRect=(...args)=>{
        delete canvas.dataset.shaft;delete canvas.dataset.ink;clear(...args);
      };
      ctx.fillText=(...args)=>{
        if(ctx.globalAlpha>.01)canvas.dataset.ink='visible';
        write(...args);
      };
      ctx.drawImage=function(...args:Parameters<typeof draw>){
        const image=args[0];
        if(image instanceof HTMLImageElement && image.src.endsWith('/figma-1-6.webp')){
          const [x,y,w,h]=args.slice(-4) as number[],m=ctx.getTransform();
          const tip=m.transformPoint(new DOMPoint(x,y+h/2)),end=m.transformPoint(new DOMPoint(x+w,y+h/2));
          canvas.dataset.shaft=JSON.stringify({x:tip.x,y:tip.y,length:Math.hypot(end.x-tip.x,end.y-tip.y)});
        }
        draw(...args);
      } as typeof draw;
    });
    let time=0;
    async function sample(at:number){
      await page.clock.runFor(at-time);time=at;
      return stage.evaluate(element=>{
        const canvas=element as HTMLCanvasElement,ctx=canvas.getContext('2d')!;
        const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        let opaque=0;for(let i=3;i<pixels.length;i+=16)if(pixels[i]>200)opaque++;
        return {shaft:JSON.parse(canvas.dataset.shaft!) as {x:number;y:number;length:number},
          ink:canvas.dataset.ink,opaque};
      });
    }
    const scale=viewport.width/6888,top=(viewport.height-1966*scale)/2;
    const reading=await sample(3000);
    expect(reading.ink).toBe('visible');expect(reading.opaque).toBeGreaterThan(1000);
    expect(reading.shaft.length).toBeGreaterThan(156*scale);
    expect(reading.shaft.length).toBeCloseTo(Math.max(30,156*scale*1.6),0);

    const atBow=await sample(7820),flying=await sample(8480),lodged=await sample(9170),still=await sample(9440);
    for(const frame of [atBow,flying,lodged,still]){
      expect(frame.ink).toBeUndefined();
      expect(frame.opaque).toBeLessThan(300);
      expect(frame.shaft.length).toBeCloseTo(156*scale,0);
    }
    expect(atBow.shaft.x).toBeCloseTo(4120*scale,0);
    expect(atBow.shaft.y).toBeCloseTo(top+1098*scale,0);
    expect(flying.shaft.x).toBeLessThan(atBow.shaft.x);expect(flying.shaft.x).toBeGreaterThan(lodged.shaft.x);
    expect(lodged.shaft.x).toBeCloseTo(1631*scale,0);
    expect(lodged.shaft.y).toBeCloseTo(top+915*scale,0);
    expect(still.shaft).toEqual(lodged.shaft);
  });
}
