import {publicAssetUrl} from './assets';
import type {AOI,CardRect,CutoutArt,Geometry,Painting} from './types';

export type GuideCard=Painting['cards'][number];
export const entranceDuration=520;
const images=new Map<string,Promise<HTMLImageElement>>();

export function validCutout(art:unknown):art is CutoutArt {
  if(!art || typeof art!=='object')return false;
  const a=art as CutoutArt;
  const m=a.shape;
  if(m!==undefined && (!m||![m.width,m.height,m.cols,m.rows].every(i=>Number.isInteger(i)&&i>0&&i<=8192)||
    m.cols>128||m.rows>128||typeof m.bits!=='string'||m.bits.length!==4*Math.ceil(Math.ceil(m.cols*m.rows/8)/3)||!/^[A-Za-z0-9+/]+={0,2}$/.test(m.bits)))return false;
  return typeof a.image==='string' && /^\/materials\/uci\/[a-z\d_-]+\.(webp|png)$/i.test(a.image)
    && [a.board,a.glow].every(color=>typeof color==='string' && /^#[a-f\d]{6}$/i.test(color));
}
const silhouettes=new WeakMap<CutoutArt,Uint8Array>();
function imageBox(w:number,h:number,naturalWidth:number,naturalHeight:number){
  const fit=Math.min(w*.35/naturalWidth,(h-8)/naturalHeight);
  const width=naturalWidth*fit,height=naturalHeight*fit;
  return {left:(w*.36-width)/2,top:(h-height)/2,width,height};
}
export function hitGuide(x:number,y:number,rect:CardRect,elapsed:number,ms:number|undefined,art?:CutoutArt,from?:CardRect){
  const r=animatedRect(rect,elapsed,ms,from);
  if(x<r.left||x>=r.left+r.width||y<r.top||y>=r.top+r.height)return false;
  if(!art?.shape)return true;
  const u=(x-r.left)/r.width,v=(y-r.top)/r.height;
  if(u>=.16 && v>=.06 && v<.85)return true;
  const shape=art.shape;
  const box=imageBox(rect.width,rect.height,shape.width,shape.height);
  const col=Math.floor((u*rect.width-box.left)*shape.cols/box.width);
  const row=Math.floor((v*rect.height-box.top)*shape.rows/box.height);
  if(col<0||row<0||col>=shape.cols||row>=shape.rows)return false;
  let bytes=silhouettes.get(art);
  if(!bytes){
    bytes=Uint8Array.from(atob(shape.bits),c=>c.charCodeAt(0));
    silhouettes.set(art,bytes);
  }
  const bit=row*shape.cols+col;
  return Boolean(bytes[bit>>3] & (1<<(bit%8)));
}
export function loadCutout(art:CutoutArt){
  if(!validCutout(art))throw Error('讲解抠图路径或色板无效');
  let cached=images.get(art.image);
  if(!cached){
    const image=new Image();
    image.src=publicAssetUrl(art.image);
    cached=image.decode().then(()=>image).catch(error=>{images.delete(art.image);throw error});
    images.set(art.image,cached);
  }
  return cached;
}

export function entranceScale(elapsed:number,ms:number){
  const progress=ms>0?Math.min(1,Math.max(0,elapsed/ms)):1;
  return 1-.22*(1-progress)**3;
}
export function entranceRect(rect:CardRect,g:Geometry,a:AOI):CardRect{
  const [x,y,w,h]=a.rect;
  const cx=g.left+(x+w/2)*g.width,cy=g.top+(y+h/2)*g.height;
  const scale=Math.max(.24,Math.min(.72,h*g.height/rect.height));
  const width=rect.width*scale,height=rect.height*scale;
  return {width,height,left:Math.max(0,Math.min(g.viewportWidth-width,cx-width*.18)),top:Math.max(0,Math.min(g.viewportHeight-height,cy-height*.5))};
}
export function animatedRect(rect:CardRect,elapsed:number,ms=0,from?:CardRect):CardRect {
  if(!ms || elapsed>=ms)return rect;
  if(from){
    const tail=(1-Math.max(0,elapsed)/ms)**3;
    return {left:rect.left+(from.left-rect.left)*tail,top:rect.top+(from.top-rect.top)*tail,width:rect.width+(from.width-rect.width)*tail,height:rect.height+(from.height-rect.height)*tail};
  }
  const scale=entranceScale(elapsed,ms);
  return {left:rect.left+rect.width*(1-scale)/2,top:rect.top+rect.height*(1-scale)/2,width:rect.width*scale,height:rect.height*scale};
}

function lines(ctx:CanvasRenderingContext2D,text:string,width:number):string[]{
  const out:string[]=[];
  let line='';
  for(const char of text){
    if(line && ctx.measureText(line+char).width>width){out.push(line);line=''}
    line+=char;
  }
  if(line)out.push(line);
  return out;
}

function textLayout(ctx:CanvasRenderingContext2D,card:GuideCard,width:number){
  const bodySize=width<420?15:18;
  const titleSize=width<420?20:24;
  const titleFont='600 '+titleSize+'px "Songti SC","Noto Serif CJK SC",serif';
  const bodyFont=bodySize+'px "Songti SC","Noto Serif CJK SC",serif';
  const textX=Math.round(width*.40),textWidth=width-textX-Math.max(16,width*.045);
  ctx.font=titleFont;
  const title=lines(ctx,card.title,textWidth);
  ctx.font=bodyFont;
  const body=lines(ctx,card.text,textWidth);
  const titleLine=titleSize*1.44,bodyLine=bodySize*1.65;
  return {title,body,titleFont,bodyFont,titleLine,bodyLine,textX,height:title.length*titleLine+7+body.length*bodyLine};
}

export function cardPosition(ctx:CanvasRenderingContext2D,card:GuideCard,g:Geometry,a:AOI):CardRect {
  const width=Math.min(g.viewportWidth-20,Math.max(450,Math.min(670,g.viewportWidth*.48)));
  const height=Math.max(Math.min(320,width*.47),Math.ceil((textLayout(ctx,card,width).height+30)/.79));
  const cx=g.left+(a.rect[0]+a.rect[2]/2)*g.width;
  const cy=g.top+(a.rect[1]+a.rect[3]/2)*g.height;
  // The enlarged subject stays over its source when the right-hand text panel fits.
  const left=cx-width*.17;
  const top=cy-height*.5;
  return {left:Math.max(8,Math.min(left,g.viewportWidth-width-8)),top:Math.max(6,Math.min(top,g.viewportHeight-height-6)),width,height};
}
function ink(hex:string){
  const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
  return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]>.17?'#130e09':'#fffcf1';
}

/** Draw both the live graphic and its recorded viewport reconstruction in CSS pixels. */
export function drawCutout(ctx:CanvasRenderingContext2D,card:GuideCard,image:HTMLImageElement,rect:CardRect,elapsed:number,ms:number,from?:CardRect){
  const art=card.art!;
  const {width:w,height:h}=rect;
  const shown=animatedRect(rect,elapsed,ms,from);
  ctx.save();
  ctx.translate(shown.left,shown.top);ctx.scale(shown.width/w,shown.height/h);
  if(ms)ctx.globalAlpha*=.42+.58*Math.min(1,Math.max(0,elapsed/ms));
  ctx.fillStyle=art.board;
  const panelY=h*.06,panelH=h*.79;
  ctx.fillRect(w*.16,panelY,w*.84,panelH);
  const box=imageBox(w,h,image.naturalWidth,image.naturalHeight);
  ctx.save();
  const pixelScale=Math.abs(ctx.getTransform().a);
  // Offsets use reference-board coordinates and scale with both the card and the display DPR.
  ctx.shadowColor=art.glow;ctx.shadowOffsetX=w*80/2700*pixelScale;ctx.shadowOffsetY=-w*30/2700*pixelScale;
  ctx.shadowBlur=w*30/2700*pixelScale;
  ctx.drawImage(image,box.left,box.top,box.width,box.height);ctx.restore();
  const text=textLayout(ctx,card,w);
  let y=panelY+(panelH-text.height)/2;
  ctx.textBaseline='top';ctx.fillStyle=ink(art.board);ctx.font=text.titleFont;
  for(const line of text.title){ctx.fillText(line,text.textX,y);y+=text.titleLine}
  ctx.font=text.bodyFont;y+=7;
  for(const line of text.body){ctx.fillText(line,text.textX,y);y+=text.bodyLine}
  ctx.restore();
}
