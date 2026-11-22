import {expect,test,type Locator} from '@playwright/test';

const site=process.env.PAGES_TEST_URL??'http://localhost:5173/';
const detailLink=(id:string)=>new URL('?participant=P00&preview=layout&scene=ming-xingle-archery&card='+id,site).href;

type Box={x:number;y:number;width:number;height:number};
type Shaft={x:number;y:number;length:number;featherX:number;featherContrast:number;featherBreadth:number;tipTaper:number;source:string};
type Frame={actor?:Box;actorLayer?:string;shaft?:Shaft;titleY?:number;boardY?:number};

// Observe only the viewer canvas. Derive shaft endpoints from the ink on its
// actual transparent sprite so the assertion also catches changes to its crop.
async function observe(stage:Locator){
  await stage.evaluate(element=>{
    const canvas=element as HTMLCanvasElement,ctx=canvas.getContext('2d')!;
    const clear=ctx.clearRect.bind(ctx),text=ctx.fillText.bind(ctx),rect=ctx.fillRect.bind(ctx),draw=ctx.drawImage.bind(ctx);
    type VisibleArrow={ends:number[][];featherEnd:0|1;contrast:number;breadth:number;taper:number};
    const endpointCache=new WeakMap<HTMLCanvasElement|HTMLImageElement,VisibleArrow>();
    let frame:Frame={};
    function record(){canvas.dataset.observed=JSON.stringify(frame)}
    ctx.clearRect=(...args)=>{frame={};clear(...args);record()};
    ctx.fillText=(...args)=>{
      if(frame.titleY===undefined&&ctx.globalAlpha>.01)frame.titleY=args[2];
      text(...args);record();
    };
    ctx.fillRect=(...args)=>{
      if(ctx.fillStyle!=='#2c241a'&&ctx.globalAlpha>.01)frame.boardY=args[1];
      rect(...args);record();
    };
    ctx.drawImage=function(...args:Parameters<typeof draw>){
      const image=args[0],sprite=image instanceof HTMLCanvasElement?image.dataset.archerLayer:undefined;
      const [x,y,width,height]=args.slice(-4) as number[];
      const actor=(image instanceof HTMLImageElement&&image.src.endsWith('/figma-1-2.webp'))||sprite?.startsWith('draw-')||sprite==='released';
      if(actor && Array.from<unknown>(args).length===5){
        frame.actor={x,y,width,height};frame.actorLayer=sprite??'original';
      }
      const isShaft=(image instanceof HTMLCanvasElement && sprite==='shaft')
        || (image instanceof HTMLImageElement && image.src.endsWith('/figma-1-6.webp'));
      if(isShaft && (image instanceof HTMLCanvasElement||image instanceof HTMLImageElement)){
        const iw=image instanceof HTMLImageElement?image.naturalWidth:image.width;
        const ih=image instanceof HTMLImageElement?image.naturalHeight:image.height;
        let registered=endpointCache.get(image);
        if(!registered){
          const probe=document.createElement('canvas');probe.width=iw;probe.height=ih;
          const ink=probe.getContext('2d')!;ink.drawImage(image,0,0);
          const pix=ink.getImageData(0,0,iw,ih).data;
          const ends:number[][]=[];
          const inkCount=[0,0],paleCount=[0,0],columnInk:number[]=[];
          for(let u=0;u<iw;u++){
            let total=0,count=0;
            for(let v=0;v<ih;v++){
              const offset=(v*iw+u)*4;
              if(pix[offset+3]<=48)continue;
              total+=v;count++;
              if(u>=iw*.20 && u<iw*.80)continue;
              const side=Number(u>=iw*.80);
              inkCount[side]++;
              if(Math.min(pix[offset],pix[offset+1],pix[offset+2])>145)paleCount[side]++;
            }
            columnInk.push(count);
            if(count){const point=[u+.5,total/count+.5];if(!ends.length)ends.push(point);ends[1]=point;}
          }
          // Identify the actual light-colored, broad fletching before applying any
          // canvas transforms. This also catches a second mirror at draw time.
          const feathers=paleCount[0]>paleCount[1]?0:1;
          const point=1-feathers;
          const columnsFromTip=point===0?columnInk:columnInk.reverse();
          const band=Math.max(1,Math.floor(iw*.01)),inside=Math.floor(iw*.035);
          const sum=(values:number[])=>values.reduce((a,b)=>a+b,0);
          registered={ends,featherEnd:feathers,contrast:(paleCount[feathers]+1)/(paleCount[point]+1),
            breadth:inkCount[feathers]/inkCount[point],
            taper:sum(columnsFromTip.slice(inside,inside+band))/Math.max(1,sum(columnsFromTip.slice(0,band)))};
          endpointCache.set(image,registered);
        }
        const transform=ctx.getTransform();
        const ends=registered.ends.map(([u,v])=>transform.transformPoint(new DOMPoint(x+u*width/iw,y+v*height/ih)));
        const tip=ends[1-registered.featherEnd],tail=ends[registered.featherEnd];
        frame.shaft={x:tip.x,y:tip.y,length:Math.hypot(tail.x-tip.x,tail.y-tip.y),
          featherX:tail.x,featherContrast:registered.contrast,featherBreadth:registered.breadth,tipTaper:registered.taper,
          source:image instanceof HTMLImageElement?new URL(image.src).pathname.split('/').pop()!:'detached-canvas'};
      }
      draw(...args);record();
    } as typeof draw;
  });
}

for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
  test('P00 draws the bow, explains and releases the enlarged arrow, then explains the target at '+viewport.width+'px',async({page})=>{
    await page.setViewportSize(viewport);
    const start=new Date('2026-11-23T00:00:00Z');
    await page.clock.install({time:start});await page.clock.pauseAt(new Date(+start+1000));
    await page.goto(detailLink('archery-figma-1-2'));
    const player=page.locator('main.layout-playback'),stage=player.locator('canvas');
    await expect(stage).toBeVisible();await observe(stage);
    let previous=0;
    async function sample(ms:number,cardId:string):Promise<Frame>{
      await page.clock.runFor(ms-previous);previous=ms;
      await expect(player).toHaveAttribute('data-card','archery-figma-'+cardId);
      const frame:Frame=JSON.parse((await stage.getAttribute('data-observed'))!);
      if(frame.shaft){
        const ink=frame.shaft;
        expect(ink.featherX-ink.x,'fletching stays behind the point, '+ms+' ms').toBeGreaterThan(ink.length*.85);
        expect(ink.featherContrast,'the rear has the light-colored feathers').toBeGreaterThan(2);
        expect(ink.featherBreadth,'the feathers occupy more area than the point').toBeGreaterThan(1.1);
        expect(ink.tipTaper,'the metal head narrows to its leading point').toBeGreaterThan(2);
        expect(ink.source,'arrow artwork at '+ms+' ms').toBe('figma-1-6.webp');
      }
      return frame;
    }

    const scale=viewport.width/6888;
    const bullseye={x:1631*scale,y:(viewport.height-1966*scale)/2+915*scale};
    // Normal sequential playback, without changing cards through the toolbar.
    const poses=new Set<string>();
    let fullDraw:Shaft|undefined;
    for(const ms of [1650,2450,3550,5800,8900]){
      const frame=await sample(ms,'1-2');
      expect(frame.boardY).toBeDefined();expect(frame.titleY).toBeDefined();
      expect(frame.actorLayer).toBeDefined();poses.add(frame.actorLayer!);
      expect(frame.shaft).toBeDefined();
      expect(frame.shaft!.x).toBeGreaterThan(bullseye.x+viewport.width*.1);
      fullDraw=frame.shaft;
    }
    expect([...poses]).toEqual(['draw-0','draw-1','draw-2','released']);
    const opening=await sample(10100,'1-6'),reading=await sample(13200,'1-6');
    const holding=await sample(15800,'1-6'),descending=await sample(16750,'1-6');
    expect(opening.shaft).toBeDefined();expect(reading.shaft).toBeDefined();
    expect(Math.abs(opening.shaft!.length-fullDraw!.length)).toBeLessThan(2);
    expect(Math.hypot(opening.shaft!.x-fullDraw!.x,opening.shaft!.y-fullDraw!.y)).toBeLessThan(3);
    expect(reading.shaft!.length).toBeGreaterThan(opening.shaft!.length);
    expect(holding.shaft).toEqual(reading.shaft);
    expect(holding.titleY).toBeDefined();expect(holding.boardY).toBeDefined();
    expect(descending.titleY!).toBeGreaterThan(holding.titleY!);
    expect(descending.boardY!).toBeGreaterThan(holding.boardY!);
    const ready=await sample(17150,'1-6'),flight=await sample(18200,'1-6');
    const landed=await sample(19150,'1-6'),still=await sample(19500,'1-6');
    expect(ready.shaft).toEqual(reading.shaft);
    for(const frame of [ready,flight,landed,still]){
      expect(frame.boardY).toBeUndefined();expect(frame.titleY).toBeUndefined();
      expect(frame.shaft).toBeDefined();
      expect(Math.abs(frame.shaft!.length-reading.shaft!.length)).toBeLessThan(1);
    }
    expect(flight.shaft!.x).toBeGreaterThan(bullseye.x);
    expect(flight.shaft!.x).toBeLessThan(ready.shaft!.x);
    expect(Math.abs(landed.shaft!.x-bullseye.x)).toBeLessThan(1.5);
    expect(Math.abs(landed.shaft!.y-bullseye.y)).toBeLessThan(1.5);
    expect(still.shaft).toEqual(landed.shaft);
    const targetOpening=await sample(20100,'0-6'),targetReading=await sample(22900,'0-6');
    for(const frame of [targetOpening,targetReading]){
      expect(frame.shaft).toBeDefined();
      expect(Math.abs(frame.shaft!.length-reading.shaft!.length)).toBeLessThan(1);
    }
    expect(Math.abs(targetOpening.shaft!.x-landed.shaft!.x)).toBeLessThan(1.5);
    expect(Math.abs(targetOpening.shaft!.y-landed.shaft!.y)).toBeLessThan(1.5);
    expect(targetReading.boardY).toBeDefined();expect(targetReading.titleY).toBeDefined();
    await expect(stage).toHaveAttribute('aria-label',/箭靶/);
  });
}
