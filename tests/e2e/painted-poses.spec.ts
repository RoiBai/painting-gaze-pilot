import {expect,test} from '@playwright/test';

type Region=[number,number,number,number];
type Example={id:string;set:string;units:number;fixed:Region[];moving:Region[]};
// Rectangles refer to the registered source image in the given coordinate width.
const examples:Example[]=[
  {id:'polo-figma-3-23',set:'swing',units:500,fixed:[[286,8,316,47],[75,183,330,234]],moving:[[422,35,499,106],[190,70,267,106]]},
  {id:'polo-figma-3-19',set:'flag',units:500,fixed:[[289,183,328,213],[80,380,221,430]],moving:[[175,35,414,162],[328,173,391,256]]},
  {id:'archery-figma-3-6',set:'guard',units:500,fixed:[[224,81,262,145],[315,120,446,260],[148,313,244,415]],moving:[[175,201,226,243],[176,242,262,271]]},
  {id:'cuju-figma-1-5',set:'pavilion',units:768,fixed:[[0,0,768,170],[300,170,405,440],[0,484,768,572]],
    moving:[[150,283,215,415],[438,271,514,421],[50,188,115,328],[640,189,698,328]]},
];

for(const example of examples){
  test('P00 plays registered '+example.set+' frames on one illustrated card',async({page})=>{
    const {id,set}=example;
    const fixed=new Date('2026-11-23T00:00:00Z');
    await page.clock.install({time:fixed});await page.clock.pauseAt(new Date(+fixed+1000));
    const site=process.env.PAGES_TEST_URL||'http://localhost:5173/';
    const scene='ming-xingle-'+id.split('-')[0];
    await page.goto(new URL('?participant=P00&preview=layout&scene='+scene+'&card='+id,site).href);
    const stage=page.locator('main[data-card="'+id+'"] .illustrated-stage canvas');
    await expect(stage).toBeVisible();
    const observer=await stage.evaluateHandle(el=>{
      const ctx=(el as HTMLCanvasElement).getContext('2d')!;
      const clear=ctx.clearRect.bind(ctx),draw=ctx.drawImage.bind(ctx),write=ctx.fillText.bind(ctx),fill=ctx.fillRect.bind(ctx);
      const images=new Map<string,HTMLImageElement>();
      const empty=()=>({files:[] as string[],box:[] as number[],ink:false,board:false});
      let current=empty();
      ctx.clearRect=(...args)=>{current=empty();clear(...args)};
      ctx.fillText=(...args)=>{if(ctx.globalAlpha>.01)current.ink=true;write(...args)};
      ctx.fillRect=(...args)=>{if(ctx.fillStyle!=='#2c241a' && ctx.globalAlpha>.01)current.board=true;fill(...args)};
      ctx.drawImage=function(...args:Parameters<typeof draw>){
        if(args[0] instanceof HTMLImageElement){
          const name=new URL(args[0].src).pathname.split('/').pop()!;
          current.files.push(name);current.box=args.slice(-4) as number[];images.set(name,args[0]);
        }
        draw(...args);
      } as typeof draw;
      return {frame:()=>current,images};
    });
    const original=id.slice(id.indexOf('figma-'))+'.webp';
    const files=[original,set+'-1.webp',set+'-2.webp'];
    const times=set==='swing'?[4000,7300,8040]:[1510,1800,2200];
    let previous=0,box:number[]=[];
    for(let i=0;i<3;i++){
      await page.clock.runFor(times[i]-previous);previous=times[i];
      const frame=await observer.evaluate(o=>o.frame());
      expect(frame.files).toEqual([files[i]]);
      if(i===0)box=frame.box;
      expect(frame.box).toEqual(box);
      expect(frame.ink).toBe(set!=='swing'||i===0);
      expect(frame.board).toBe(set!=='swing'||i===0);
    }
    // Read the actual three decoded sprites used on this card. Regions inside
    // the horse, head, emperor and architecture must survive all substitutions.
    const results=await observer.evaluate((o,{files,example})=>{
      const sprites=files.map(name=>o.images.get(name)!);
      const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true})!;
      canvas.width=sprites[0].naturalWidth;canvas.height=sprites[0].naturalHeight;
      const pixels=sprites.map(img=>{
        ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0);
        return ctx.getImageData(0,0,canvas.width,canvas.height).data;
      });
      const scale=canvas.width/example.units;
      return [[0,1],[0,2],[1,2]].map(([a,b])=>[...example.fixed,...example.moving].map(region=>{
        const [l,t,r,bottom]=region.map(value=>Math.floor(value*scale));
        let changed=0;
        for(let y=t;y<bottom;y++)for(let x=l;x<r;x++){
          const n=(y*canvas.width+x)*4;
          if(Math.max(pixels[a][n+3],pixels[b][n+3])<=20)continue;
          for(let k=0;k<4;k++)if(Math.abs(pixels[a][n+k]-pixels[b][n+k])>6){changed++;break}
        }
        return changed;
      }));
    },{files,example});
    for(const counts of results){
      for(const count of counts.slice(0,example.fixed.length))expect(count).toBe(0);
      for(const count of counts.slice(example.fixed.length))expect(count).toBeGreaterThan(40);
    }
    await observer.dispose();
  });
}
