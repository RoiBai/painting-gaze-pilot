import {publicAssetUrl} from './assets';
import catalogue from './uciCatalogue.json' with {type:'json'};
import type {CardRect,CutoutArt,Painting} from './types';

type Card=Painting['cards'][number];
type Shape=NonNullable<CutoutArt['shape']>;
type SourcePoint={x:number;y:number};
type Gesture=readonly [cx:number,cy:number,rx:number,ry:number,dx:number,dy:number];
const beat=[0,-.22,-.38,-.13,.38,.82,1,.76,.43,.16,0];
const beatDelayMs=1000;
const kineticBeatMs=145;
const margin=.13;
const latticeSize=36;

/**
 * A paper figure is pinned wherever it has no gesture. Each pin neighborhood
 * carries a displacement in source-image units; displacements taper smoothly
 * to zero at the edges, keeping the painted robe attached to the moving leg.
 */
const gestures:Record<string,readonly Gesture[]>={
  '0-9': [[.49,.22,.29,.29,.014,.011],[.54,.52,.36,.27,.002,-.007]], // seated emperor, nod and sleeve
  '1-5': [[.087,.49,.085,.22,.028,.004],[.91,.50,.09,.21,-.023,.003]], // the two hanging knots
  '3-17': [[.17,.15,.20,.24,-.012,.009],[.21,.73,.23,.23,.018,-.013],[.79,.72,.22,.24,-.018,.008],[.94,.26,.12,.20,.011,-.008]],
  '1-4': [[.48,.29,.4,.4,-.016,.006],[.72,.71,.24,.24,.025,-.009]], // anticipating the kick
  '0-10': [[.5,.5,1.8,1.8,.016,-.029]], // ball rises and settles
  '0-8': [[.24,.27,.34,.33,.022,-.010],[.70,.16,.40,.31,.026,.012],[.57,.78,.30,.19,.008,0]],
  '0-7': [[.51,.21,.3,.30,-.011,.010],[.32,.46,.24,.24,.012,-.015]],
  '3-27': [[.30,.18,.30,.36,-.015,.006],[.67,.19,.3,.32,.013,-.006],[.91,.66,.14,.30,-.008,.006]],
  '3-26': [[.81,.38,.24,.19,.020,-.022],[.31,.49,.15,.2,-.011,.024],[.48,.22,.17,.21,-.010,.014]],
  '3-23': [[.37,.63,.50,.4,.013,-.022],[.83,.34,.25,.18,-.014,.021],[.91,.17,.27,.21,.005,-.040],[.12,.86,.15,.19,-.028,.014]],
  '3-25': [[.84,.20,.64,.95,.005,-.053]], // a small swing about the handle
  '0-3': [[.81,.026,.17,.10,.032,-.005],[.14,.138,.14,.10,.027,.004]], // pennants on the rigid goal
  '3-19': [[.38,.106,.33,.22,.043,-.016],[.59,.29,.18,.25,.012,.010],[.79,.52,.24,.25,.017,-.016]],
  '3-16': [[.49,.22,.29,.26,-.012,.010],[.38,.53,.28,.27,.010,-.008]],
  '3-5': [[.17,.27,.19,.150,.006,-.008],[.67,.62,.09,.18,.013,.004],[.37,.66,.09,.21,-.012,-.005]],
  '3-6': [[.18,.30,.14,.19,.023,.007],[.58,.15,.15,.17,-.016,.010],[.80,.36,.17,.17,-.020,-.005]],
  '0-5': [[.43,.22,.18,.2,.016,-.010],[.73,.47,.22,.27,-.018,.006],[.20,.69,.16,.20,.014,-.012]],
  '0-4': [[.55,.18,.31,.23,.021,-.013],[.32,.52,.34,.27,-.020,.017]],
  '1-2': [[.13,.41,.23,.32,-.018,.003],[.39,.46,.21,.15,.012,.003],[.75,.38,.22,.20,.026,-.006]],
  '1-6': [[.5,.5,2.8,7,-.029,0]], // feathered arrow along its shaft
  '0-6': [[.26,.235,.39,.125,.079,-.016],[.54,.044,.22,.10,.025,.006]],
  '1-3': [[.22,.40,.24,.20,.027,-.012],[.69,.20,.20,.24,-.016,.013],[.65,.63,.30,.14,.014,.006]],
};
const kickerId='1-4';
const ball=catalogue.cards.find(c=>c.node==='0:10')!;
const cachedBits=new WeakMap<Shape,Uint8Array>();

function shapeContains(shape:Shape,u:number,v:number):boolean{
  if(u<0||v<0||u>=1||v>=1)return false;
  let bytes=cachedBits.get(shape);
  if(!bytes){
    bytes=Uint8Array.from(atob(shape.bits),c=>c.charCodeAt(0));
    cachedBits.set(shape,bytes);
  }
  const i=Math.floor(v*shape.rows)*shape.cols+Math.floor(u*shape.cols);
  return Boolean(bytes[i>>3] & (1<<(i%8)));
}
function nodeKey(card:Card){return card.id.split('-figma-')[1]??''}
function frameAt(elapsed:number,reduced:boolean){
  if(reduced||elapsed<=beatDelayMs)return 0;
  const slot=Math.floor((elapsed-beatDelayMs)/kineticBeatMs)%26;
  return slot<beat.length && beat[slot]!==0 ? slot : 0;
}

function sourcePoint(id:string,u:number,v:number,amplitude:number,aspect:number):SourcePoint{
  let x=u,y=v;
  for(const [cx,cy,rx,ry,dx,dy] of gestures[id]??[]){
    const nx=(u-cx)/rx,ny=(v-cy)/ry;
    const influence=1-nx*nx-ny*ny;
    if(influence<=0)continue;
    const amount=amplitude*influence*influence;
    x-=dx*amount;y-=dy*amount;
  }
  if(id===kickerId){
    // The raised shoe extends to the right at 83% of the image height.
    // Rotate its pixels about the knee; the weight falls off into the pleats.
    const lateral=Math.min(1,Math.max(0,(u-.49)/.28));
    const lower=Math.min(1,Math.max(0,(v-.59)/.17));
    const angle=amplitude*lateral*lower*.34;
    const dx=(x-.64)*aspect,dy=y-.66;
    x=.64+(dx*Math.cos(angle)-dy*Math.sin(angle))/aspect;
    y=.66+dx*Math.sin(angle)+dy*Math.cos(angle);
  }
  return {x,y};
}

type Grid={x:Float32Array;y:Float32Array};
const lattices=new Map<string,Grid>();
function gridFor(id:string,frame:number,aspect:number):Grid{
  const key=id+'/'+frame+'/'+aspect;
  const existing=lattices.get(key);if(existing)return existing;
  const n=latticeSize+1;
  const grid={x:new Float32Array(n*n),y:new Float32Array(n*n)};
  const span=1+margin*2;
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const q=sourcePoint(id,i/latticeSize*span-margin,j/latticeSize*span-margin,beat[frame],aspect);
    grid.x[j*n+i]=q.x;grid.y[j*n+i]=q.y;
  }
  lattices.set(key,grid);
  return grid;
}

function interpolate(values:Float32Array,origin:number,dx:number,dy:number){
  const bottom=origin+latticeSize+1;
  const topValue=values[origin]+(values[origin+1]-values[origin])*dx;
  const bottomValue=values[bottom]+(values[bottom+1]-values[bottom])*dx;
  return topValue+(bottomValue-topValue)*dy;
}
function mapPosePoint(id:string,frame:number,u:number,v:number,aspect:number){
  if(!frame)return {x:u,y:v};
  if(u< -margin||v< -margin||u>=1+margin||v>=1+margin)return {x:-1,y:-1};
  const grid=gridFor(id,frame,aspect),units=latticeSize/(1+2*margin);
  const col=(u+margin)*units,row=(v+margin)*units,ix=Math.floor(col),iy=Math.floor(row);
  const origin=iy*(latticeSize+1)+ix;
  return {x:interpolate(grid.x,origin,col-ix,row-iy),y:interpolate(grid.y,origin,col-ix,row-iy)};
}

let ballImage:HTMLImageElement|undefined;
let loadingBall:Promise<void>|undefined;
export async function prepareCutoutMotion(card:Card):Promise<void>{
  if(nodeKey(card)!==kickerId || ballImage)return;
  if(!loadingBall){
    const img=new Image();img.src=publicAssetUrl(ball.image);
    loadingBall=img.decode().then(()=>{ballImage=img}).catch(error=>{loadingBall=undefined;throw error});
  }
  return loadingBall;
}

interface FrameBuilder {
  frame:number;canvas:HTMLCanvasElement;context:CanvasRenderingContext2D;grid:Grid;
  raster:ImageData;destination:Uint32Array;row:number;columns:Uint16Array;fractions:Float32Array;
}
interface PoseCache {
  image:HTMLImageElement;pixels:Uint32Array;width:number;height:number;
  poses:Map<number,HTMLCanvasElement>;building?:FrameBuilder;
}
let active:PoseCache|undefined;
function bitmapFor(image:HTMLImageElement):PoseCache{
  if(active?.image===image)return active;
  const read=document.createElement('canvas');
  read.width=image.naturalWidth;read.height=image.naturalHeight;
  const ctx=read.getContext('2d',{willReadFrequently:true})!;
  ctx.drawImage(image,0,0);
  const {data}=ctx.getImageData(0,0,read.width,read.height);
  active={image,pixels:new Uint32Array(data.buffer,data.byteOffset,data.byteLength/4),width:read.width,height:read.height,poses:new Map()};
  return active;
}

function beginFrame(cache:PoseCache,id:string,frame:number):FrameBuilder{
  const {width,height}=cache;
  const grid=gridFor(id,frame,width/height);
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(width*(1+margin*2));canvas.height=Math.round(height*(1+margin*2));
  const context=canvas.getContext('2d')!;
  const raster=context.createImageData(canvas.width,canvas.height);
  const columns=new Uint16Array(canvas.width),fractions=new Float32Array(canvas.width);
  for(let x=0;x<canvas.width;x++){
    const u=(x+.5)*latticeSize/canvas.width;
    columns[x]=Math.floor(u);fractions[x]=u-columns[x];
  }
  return {frame,canvas,context,raster,grid,columns,fractions,row:0,destination:new Uint32Array(raster.data.buffer)};
}

/** Inverse rasterization keeps the robe continuous at the joint. Store straight-alpha source pixels. */
function paintRows(cache:PoseCache,builder:FrameBuilder,count:number){
  const {width,height,pixels}=cache;
  const {grid,canvas,columns,fractions,destination}=builder;
  const end=Math.min(canvas.height,builder.row+count);
  for(let y=builder.row;y<end;y++){
    const v=(y+.5)*latticeSize/canvas.height,iy=Math.floor(v),dy=v-iy,row=iy*(latticeSize+1);
    for(let x=0;x<canvas.width;x++){
      const anchor=row+columns[x],dx=fractions[x];
      const sx=Math.floor(interpolate(grid.x,anchor,dx,dy)*width),sy=Math.floor(interpolate(grid.y,anchor,dx,dy)*height);
      if(sx>=0&&sy>=0&&sx<width&&sy<height)destination[y*canvas.width+x]=pixels[sy*width+sx];
    }
  }
  builder.row=end;
  if(end===canvas.height){
    builder.context.putImageData(builder.raster,0,0);
    cache.poses.set(builder.frame,canvas);cache.building=undefined;
  }
}

let warmingImage:HTMLImageElement|undefined;
function warmPoses(image:HTMLImageElement,id:string){
  if(warmingImage===image)return;
  warmingImage=image;
  // Use the introduction to prepare the nine poses a few rows at a time so that
  // camera callbacks can run between batches. Only the current card retains bitmaps.
  const schedule=()=>{
    if(typeof requestIdleCallback==='function')requestIdleCallback(work,{timeout:60});
    else window.setTimeout(()=>work(),8);
  };
  function work(deadline?:IdleDeadline){
    if(warmingImage!==image)return;
    const start=performance.now(),cache=bitmapFor(image);
    do{
      const frame=beat.findIndex((value,index)=>value!==0 && !cache.poses.has(index));
      if(frame===-1)return;
      cache.building??=beginFrame(cache,id,frame);
      paintRows(cache,cache.building,24);
    }while(performance.now()-start<4 && (!deadline||deadline.timeRemaining()>1));
    schedule();
  }
  schedule();
}
function paintedFrame(image:HTMLImageElement,id:string,frame:number){
  const cache=bitmapFor(image),previous=cache.poses.get(frame);
  if(previous)return previous;
  // Seeking straight to a pose in a researcher replay must draw it immediately.
  const builder=cache.building?.frame===frame?cache.building:beginFrame(cache,id,frame);
  paintRows(cache,builder,builder.canvas.height-builder.row);
  return builder.canvas;
}

const ballLift=[0,0,0,0,.18,.56,.96,1,.70,.29,0];
function kickBallBox(box:CardRect,frame:number):CardRect{
  const width=box.width*.154,height=width*ball.shape.height/ball.shape.width;
  const lift=ballLift[frame];
  return {left:box.left+box.width*(.925+.076*lift),top:box.top+box.height*(.817-.106*lift)-height,width,height};
}

export function hitCollageSubject(card:Card,box:CardRect,x:number,y:number,elapsedMs:number,reducedMotion:boolean):boolean{
  const art:CutoutArt|undefined=card.art;
  if(!art?.shape)return false;
  const id=nodeKey(card),frame=frameAt(elapsedMs,reducedMotion);
  if(id===kickerId){
    const b=kickBallBox(box,frame);
    if(shapeContains(ball.shape,(x-b.left)/b.width,(y-b.top)/b.height))return true;
  }
  const q=mapPosePoint(id,frame,(x-box.left)/box.width,(y-box.top)/box.height,art.shape.width/art.shape.height);
  return shapeContains(art.shape,q.x,q.y);
}

export function drawCollageSubject(ctx:CanvasRenderingContext2D,card:Card,image:HTMLImageElement,box:CardRect,elapsedMs:number,reducedMotion:boolean){
  const id=nodeKey(card),frame=frameAt(elapsedMs,reducedMotion);
  if(!reducedMotion&&gestures[id])warmPoses(image,id);
  if(frame&&gestures[id]){
    const pose=paintedFrame(image,id,frame);
    ctx.drawImage(pose,box.left-box.width*margin,box.top-box.height*margin,box.width*(1+margin*2),box.height*(1+margin*2));
  }else ctx.drawImage(image,box.left,box.top,box.width,box.height);
  if(id===kickerId&&ballImage){
    const b=kickBallBox(box,frame);
    ctx.drawImage(ballImage,b.left,b.top,b.width,b.height);
  }
}
