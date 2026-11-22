import {publicAssetUrl} from './assets';
import type {GuideCard} from './cutoutCard';
import {hitCollageSubject} from './cutoutMotion';
import type {CardRect} from './types';
import masks from './paintedPoseMasks.json' with {type:'json'};

type SetName='swing'|'flag'|'guard'|'pavilion';
const sets:Record<string,SetName>={
  'polo-figma-3-23':'swing','polo-figma-3-19':'flag',
  'archery-figma-3-6':'guard','cuju-figma-1-5':'pavilion',
};
const loading=new Map<SetName,Promise<void>>();
const images=new Map<SetName,HTMLImageElement[]>();

export function hasPaintedPoses(cardId:string){
  return Object.hasOwn(sets,cardId);
}

export function preparePaintedPoses(card:GuideCard):Promise<void>{
  const set=sets[card.id];
  if(!set)return Promise.resolve();
  let promise=loading.get(set);
  if(!promise){
    promise=Promise.all([1,2].map(async index=>{
      const img=new Image();
      img.src=publicAssetUrl('/materials/uci/poses/'+set+'-'+index+'.webp');
      await img.decode();
      if(img.naturalWidth!==card.art?.shape?.width||img.naturalHeight!==card.art.shape.height)
        throw Error('动作帧尺寸与原画部位不符');
      return img;
    })).then(frames=>{images.set(set,frames)}).catch(error=>{loading.delete(set);throw error});
    loading.set(set,promise);
  }
  return promise;
}

export function paintedFrameIndex(cardId:string,elapsed:number,duration:number,reduced:boolean,archivedSwing=false):0|1|2{
  if(reduced)return 0;
  const set=sets[cardId];
  if(archivedSwing){
    const fraction=elapsed/duration;
    if(fraction<.70)return 0;
    // A lift, a stroke through the original hand position, and a follow-through.
    const t=(fraction-.70)%.15;
    if(t<.056)return 1;
    if(t<.080)return 0;
    if(t<.130)return 2;
    return 0;
  }
  if(set==='swing'){
    // Sync the first lift to the zoom, then keep a steady cadence while reading.
    // Short rehearsals compress the entrance on the same clock as paperFrame.
    const speed=Math.min(1,duration/2700);
    if(speed<=0)return 0;
    const sinceLift=elapsed/speed-900;
    if(sinceLift<0)return 0;
    const beat=sinceLift%1800;
    if(beat<450)return 1;
    if(beat<670)return 0;
    if(beat<1180)return 2;
    return 0;
  }
  if(!set||elapsed<1550)return 0;
  const t=(elapsed-1550)%(set==='flag'?2300:3200);
  if(t<380)return 1;
  if(t<1100)return 2;
  if(t<1500)return 1;
  return 0;
}

export function drawPaintedPose(ctx:CanvasRenderingContext2D,card:GuideCard,original:HTMLImageElement,box:CardRect,elapsed:number,duration:number,reduced:boolean,archivedSwing:boolean){
  const frame=paintedFrameIndex(card.id,elapsed,duration,reduced,archivedSwing);
  const image=frame?images.get(sets[card.id])?.[frame-1]:original;
  ctx.drawImage(image??original,box.left,box.top,box.width,box.height);
}

type Mask={cols:number;rows:number;bits:string};
const silhouettes=masks as Record<string,Mask>;
const decoded=new WeakMap<Mask,Uint8Array>();
export function hitPaintedPose(card:GuideCard,box:CardRect,x:number,y:number,elapsed:number,duration:number,reduced:boolean,archivedSwing:boolean){
  const frame=paintedFrameIndex(card.id,elapsed,duration,reduced,archivedSwing);
  if(!frame)return hitCollageSubject(card,box,x,y,0,true);
  const mask=silhouettes[sets[card.id]+'-'+frame];
  const col=Math.floor((x-box.left)*mask.cols/box.width),row=Math.floor((y-box.top)*mask.rows/box.height);
  if(col<0||row<0||col>=mask.cols||row>=mask.rows)return false;
  let bits=decoded.get(mask);
  if(!bits){bits=Uint8Array.from(atob(mask.bits),letter=>letter.charCodeAt(0));decoded.set(mask,bits)}
  const offset=row*mask.cols+col;
  return Boolean(bits[offset>>3] & (1<<(offset%8)));
}
