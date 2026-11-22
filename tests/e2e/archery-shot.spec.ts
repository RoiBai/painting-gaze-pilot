import {expect,test,type Locator} from '@playwright/test';

const site=process.env.PAGES_TEST_URL??'http://localhost:5173/';
const detailLink=(id:string)=>new URL('?participant=P00&preview=layout&scene=ming-xingle-archery&card='+id,site).href;

type Box={x:number;y:number;width:number;height:number};
type Shaft={x:number;y:number;length:number};
type Frame={actor?:Box;shaft?:Shaft;released:boolean;titleY?:number;boardY?:number};

// Observe only the viewer canvas. Derive shaft endpoints from the ink on its
// actual transparent sprite so the assertion also catches changes to its crop.
async function observe(stage:Locator){
  await stage.evaluate(element=>{
    const canvas=element as HTMLCanvasElement,ctx=canvas.getContext('2d')!;
    const clear=ctx.clearRect.bind(ctx),text=ctx.fillText.bind(ctx),rect=ctx.fillRect.bind(ctx),draw=ctx.drawImage.bind(ctx);
    const endpointCache=new WeakMap<HTMLCanvasElement,number[][]>();
    let frame:Frame={released:false};
    function record(){canvas.dataset.observed=JSON.stringify(frame)}
    ctx.clearRect=(...args)=>{frame={released:false};clear(...args);record()};
    ctx.fillText=(...args)=>{
      if(frame.titleY===undefined&&ctx.globalAlpha>.01)frame.titleY=args[2];
      text(...args);record();
    };
    ctx.fillRect=(...args)=>{
      if(ctx.fillStyle==='#73683b'&&ctx.globalAlpha>.01)frame.boardY=args[1];
      rect(...args);record();
    };
    ctx.drawImage=function(...args:Parameters<typeof draw>){
      const image=args[0],sprite=image instanceof HTMLCanvasElement?image.dataset.archerLayer:undefined;
      const [x,y,width,height]=args.slice(-4) as number[];
      if((image instanceof HTMLImageElement&&image.src.endsWith('/figma-1-2.webp'))||sprite==='released'){
        frame.actor={x,y,width,height};frame.released=sprite==='released';
      }
      if(image instanceof HTMLCanvasElement&&sprite==='shaft'){
        let points=endpointCache.get(image);
        if(!points){
          const pix=image.getContext('2d')!.getImageData(0,0,image.width,image.height).data;
          const ends:number[][]=[];
          for(let u=0;u<image.width;u++){
            let total=0,count=0;
            for(let v=0;v<image.height;v++)if(pix[(v*image.width+u)*4+3]>48){total+=v;count++}
            if(count){const point=[u+.5,total/count+.5];if(!ends.length)ends.push(point);ends[1]=point;}
          }
          points=ends;endpointCache.set(image,points);
        }
        const transform=ctx.getTransform();
        const [tip,tail]=points.map(([u,v])=>transform.transformPoint(new DOMPoint(x+u*width/image.width,y+v*height/image.height)));
        frame.shaft={x:tip.x,y:tip.y,length:Math.hypot(tail.x-tip.x,tail.y-tip.y)};
        if(!canvas.dataset.firstShaft)canvas.dataset.firstShaft=JSON.stringify(frame.shaft);
      }
      draw(...args);record();
    } as typeof draw;
  });
}

for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
  test('the enlarged archer releases his displayed arrow in P00 at '+viewport.width+'px',async({page})=>{
    await page.setViewportSize(viewport);
    const start=new Date('2026-11-23T00:00:00Z');
    await page.clock.install({time:start});await page.clock.pauseAt(new Date(+start+1000));
    await page.goto(detailLink('archery-figma-1-2'));
    const stage=page.locator('main[data-card="archery-figma-1-2"] canvas');
    await expect(stage).toBeVisible();await observe(stage);
    let previous=0;
    async function sample(ms:number):Promise<Frame>{
      await page.clock.runFor(ms-previous);previous=ms;
      return JSON.parse((await stage.getAttribute('data-observed'))!);
    }
    const reading=await sample(3500),descending=await sample(6750);
    expect(reading.actor).toBeDefined();expect(reading.titleY).toBeDefined();expect(reading.boardY).toBeDefined();
    expect(descending.titleY!).toBeGreaterThan(reading.titleY!);expect(descending.boardY!).toBeGreaterThan(reading.boardY!);
    const actor=reading.actor!,scale=viewport.width/6888;
    const tip={x:actor.x+2/728*actor.width,y:actor.y+203/896*actor.height};
    const length=actor.width*Math.hypot(289,6)/728;
    const bullseye={x:1631*scale,y:(viewport.height-1966*scale)/2+915*scale};
    const flight=await sample(8440),landed=await sample(9160),still=await sample(9380);
    for(const frame of [flight,landed,still]){
      expect(frame.actor).toEqual(actor);expect(frame.released).toBe(true);
      expect(frame.boardY).toBeUndefined();expect(frame.titleY).toBeUndefined();
      expect(frame.shaft).toBeDefined();expect(Math.abs(frame.shaft!.length-length)).toBeLessThan(2);
    }
    const releasedAt:Shaft=JSON.parse((await stage.getAttribute('data-first-shaft'))!);
    // The first painted flight frame can be one video tick past separation.
    const originTolerance=2+Math.abs(tip.x-bullseye.x)*.04;
    expect(Math.hypot(releasedAt.x-tip.x,releasedAt.y-tip.y)).toBeLessThan(originTolerance);
    expect(Math.abs(releasedAt.length-length)).toBeLessThan(2);
    expect(flight.shaft!.x).toBeLessThan(tip.x);expect(flight.shaft!.x).toBeGreaterThan(bullseye.x);
    expect(Math.abs(landed.shaft!.x-bullseye.x)).toBeLessThan(1.5);
    expect(Math.abs(landed.shaft!.y-bullseye.y)).toBeLessThan(1.5);
    expect(still.shaft).toEqual(landed.shaft);
    await page.clock.runFor(3500);
    await expect(page.locator('main[data-card="archery-figma-0-6"] canvas')).toHaveAttribute('aria-label',/箭靶/);
  });
}

test('the separate arrow illustration stays available for reading without a second launch',async({page})=>{
  const start=new Date('2026-11-23T00:00:00Z');
  await page.clock.install({time:start});await page.clock.pauseAt(new Date(+start+1000));
  await page.goto(detailLink('archery-figma-1-6'));
  const stage=page.locator('main[data-card="archery-figma-1-6"] canvas');
  await expect(stage).toBeVisible();
  await page.clock.runFor(3500);const reading=await stage.evaluate(el=>(el as HTMLCanvasElement).toDataURL());
  await page.clock.runFor(5000);const later=await stage.evaluate(el=>(el as HTMLCanvasElement).toDataURL());
  expect(later===reading).toBe(true);
});
